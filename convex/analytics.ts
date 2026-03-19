import { Crons } from "@convex-dev/crons";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";

const vRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("blocked"),
  v.literal("success"),
  v.literal("failed")
);

const vEntityKind = v.union(
  v.literal("brand"),
  v.literal("competitor"),
  v.literal("product"),
  v.literal("feature"),
  v.literal("other")
);

const vCitationType = v.union(
  v.literal("ugc"),
  v.literal("editorial"),
  v.literal("corporate"),
  v.literal("docs"),
  v.literal("social"),
  v.literal("other")
);

type PromptDoc = Doc<"prompts">;
type PromptRunDoc = Doc<"promptRuns">;
type CitationDoc = Doc<"citations">;
type TrackedEntityDoc = Doc<"trackedEntities">;
type RunEntityMentionDoc = Doc<"runEntityMentions">;
type PatchObject = Record<string, unknown>;

const crons = new Crons(components.crons);

function compactPatch<T extends PatchObject>(patch: T): PatchObject {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeDomain(input: string): string {
  try {
    const parsed = new URL(input);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .toLowerCase();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function isTerminalRunStatus(status: PromptRunDoc["status"]): boolean {
  return status === "success" || status === "failed" || status === "blocked";
}

function isSuccessfulRunStatus(status: PromptRunDoc["status"]): boolean {
  return status === "success";
}

function isRecoverableRunStatus(status: PromptRunDoc["status"]): boolean {
  return status === "queued" || status === "running";
}

function toPercent(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Math.round(value * 1000) / 10;
}

function seriesDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function collectCitationsForRuns(
  ctx: QueryCtx,
  runIds: Id<"promptRuns">[]
): Promise<CitationDoc[]> {
  if (!runIds.length) {
    return [];
  }
  const grouped = await Promise.all(
    runIds.map((runId) =>
      ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
        .collect()
    )
  );
  return grouped.flat();
}

async function collectRunsSince(
  ctx: QueryCtx,
  rangeStart: number
): Promise<PromptRunDoc[]> {
  return await ctx.db
    .query("promptRuns")
    .withIndex("startedAt", (q) => q.gte("startedAt", rangeStart))
    .collect();
}

function summarizeRunMetrics(runs: PromptRunDoc[]) {
  const visibilityValues = runs
    .map((run) => run.visibilityScore)
    .filter((value): value is number => typeof value === "number");
  const citationQualityValues = runs
    .map((run) => run.citationQualityScore)
    .filter((value): value is number => typeof value === "number");
  const positionValues = runs
    .map((run) => run.averageCitationPosition)
    .filter((value): value is number => typeof value === "number");

  return {
    runCount: runs.length,
    visibility: average(visibilityValues),
    citationQuality: average(citationQualityValues),
    position: average(positionValues),
  };
}

function domainTypeMode(citations: CitationDoc[]): Doc<"citations">["type"] {
  const counts = new Map<Doc<"citations">["type"], number>();
  for (const citation of citations) {
    counts.set(citation.type, (counts.get(citation.type) ?? 0) + 1);
  }
  let maxType: Doc<"citations">["type"] = "other";
  let maxCount = 0;
  for (const [type, count] of counts.entries()) {
    if (count > maxCount) {
      maxType = type;
      maxCount = count;
    }
  }
  return maxType;
}

function normalizeCitationQualityScore(
  value: number | undefined
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value <= 1 ? value * 100 : value;
}

function inferOwnedFromKind(kind: TrackedEntityDoc["kind"]): boolean {
  return kind === "brand" || kind === "product" || kind === "feature";
}

async function assertOwnedDomainsAreUnique(
  ctx: MutationCtx,
  domains: string[] | undefined,
  currentEntityId?: Id<"trackedEntities">
) {
  const normalizedDomains = uniqueStrings(
    (domains ?? []).map((domain) => normalizeDomain(domain))
  );
  if (!normalizedDomains.length) {
    return normalizedDomains;
  }

  const entities = await ctx.db.query("trackedEntities").collect();
  const conflicts = entities.filter(
    (entity) =>
      entity._id !== currentEntityId &&
      (entity.ownedDomains ?? []).some((domain) =>
        normalizedDomains.includes(normalizeDomain(domain))
      )
  );
  if (conflicts.length) {
    throw new Error(
      `Owned domains overlap with existing tracked entities: ${conflicts
        .map((entity) => entity.name)
        .join(", ")}`
    );
  }
  return normalizedDomains;
}

async function assertPromptIdsOwned(
  ctx: MutationCtx | QueryCtx,
  promptIds: Id<"prompts">[]
): Promise<PromptDoc[]> {
  const uniquePromptIds = [...new Set(promptIds)];
  if (!uniquePromptIds.length) {
    throw new Error("Select at least one prompt");
  }

  const prompts = await Promise.all(
    uniquePromptIds.map(async (promptId) => {
      const prompt = await ctx.db.get(promptId);
      if (prompt == null) {
        throw new Error("Prompt not found");
      }
      return prompt;
    })
  );

  return prompts;
}

async function registerPromptJobCron(
  ctx: MutationCtx,
  jobId: Id<"promptJobs">,
  schedule: string
): Promise<string> {
  return await crons.register(
    ctx,
    {
      kind: "cron",
      cronspec: schedule,
    },
    internal.analytics.triggerPromptJob,
    { jobId }
  );
}

async function deletePromptJobCron(
  ctx: MutationCtx,
  cronId: string | undefined
) {
  if (!cronId) {
    return;
  }
  await crons.delete(ctx, { id: cronId });
}

async function enqueuePromptRunDocs(
  ctx: MutationCtx,
  prompts: PromptDoc[],
  label: string,
  options?: {
    attempt?: number;
    retryOfRunId?: Id<"promptRuns">;
  }
): Promise<number> {
  const queuedAt = Date.now();
  await Promise.all(
    prompts.map((prompt) =>
      ctx.db.insert("promptRuns", {
        promptId: prompt._id,
        model: prompt.targetModel,
        status: "queued",
        attempt: options?.attempt ?? 1,
        retryOfRunId: options?.retryOfRunId,
        queuedAt,
        startedAt: queuedAt,
        runLabel: label,
      })
    )
  );
  return prompts.length;
}

async function assertPromptOwnership(
  ctx: MutationCtx | QueryCtx,
  promptId: Id<"prompts">
): Promise<Doc<"prompts">> {
  const prompt = await ctx.db.get(promptId);
  if (prompt == null) {
    throw new Error("Prompt not found");
  }
  return prompt;
}

function normalizeCitationInputs(
  citations: Array<{
    domain: string;
    url: string;
    title?: string;
    snippet?: string;
    type: CitationDoc["type"];
    position: number;
    qualityScore?: number;
    trackedEntityId?: Id<"trackedEntities">;
    isOwned?: boolean;
  }>
) {
  return citations.map((citation) => ({
    ...citation,
    qualityScore: normalizeCitationQualityScore(citation.qualityScore),
  }));
}

async function insertCitationsForRun(
  ctx: MutationCtx,
  runId: Id<"promptRuns">,
  citations: ReturnType<typeof normalizeCitationInputs>
) {
  const trackedEntities = await ctx.db.query("trackedEntities").collect();
  const trackedEntityById = new Map(
    trackedEntities.map((entity) => [entity._id, entity])
  );
  const trackedEntityByDomain = new Map<string, TrackedEntityDoc>();
  for (const entity of trackedEntities) {
    for (const domain of entity.ownedDomains ?? []) {
      trackedEntityByDomain.set(normalizeDomain(domain), entity);
    }
  }

  await Promise.all(
    citations.map(async (citation) => {
      const normalizedDomain = normalizeDomain(citation.domain);
      let trackedEntityId = citation.trackedEntityId;
      if (trackedEntityId && !trackedEntityById.has(trackedEntityId)) {
        trackedEntityId = undefined;
      }
      const matchedEntity =
        (trackedEntityId
          ? trackedEntityById.get(trackedEntityId)
          : undefined) ?? trackedEntityByDomain.get(normalizedDomain);
      const resolvedEntityId = trackedEntityId ?? matchedEntity?._id;
      const isOwned =
        citation.isOwned ??
        (matchedEntity ? inferOwnedFromKind(matchedEntity.kind) : false);

      await ctx.db.insert("citations", {
        promptRunId: runId,
        domain: normalizedDomain,
        url: citation.url,
        title: citation.title,
        snippet: citation.snippet,
        type: citation.type,
        position: citation.position,
        qualityScore: citation.qualityScore,
        trackedEntityId: resolvedEntityId,
        trackedEntityName: matchedEntity?.name,
        trackedEntitySlug: matchedEntity?.slug,
        trackedEntityKind: matchedEntity?.kind,
        isOwned,
      });
    })
  );
}

async function collectRunEntityMentionsForRuns(
  ctx: QueryCtx,
  runIds: Id<"promptRuns">[]
): Promise<RunEntityMentionDoc[]> {
  if (!runIds.length) {
    return [];
  }
  const grouped = await Promise.all(
    runIds.map((runId) =>
      ctx.db
        .query("runEntityMentions")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
        .collect()
    )
  );
  return grouped.flat();
}

async function replaceRunEntityMentions(
  ctx: MutationCtx,
  runId: Id<"promptRuns">,
  responseText: string | undefined,
  citations: CitationDoc[]
) {
  const existing = await ctx.db
    .query("runEntityMentions")
    .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
    .collect();
  await Promise.all(existing.map((item) => ctx.db.delete(item._id)));

  const trackedEntities = await ctx.db.query("trackedEntities").collect();
  const mentions = extractEntityMentions(
    responseText,
    citations,
    trackedEntities
  );

  await Promise.all(
    mentions.map((mention) =>
      ctx.db.insert("runEntityMentions", {
        promptRunId: runId,
        trackedEntityId: mention.entityId,
        name: mention.name,
        slug: mention.slug,
        kind: mention.kind,
        mentionCount: mention.mentionCount,
        citationCount: mention.citationCount,
        ownedCitationCount: mention.ownedCitationCount,
        matchedTerms: mention.matchedTerms,
      })
    )
  );

  return mentions;
}

function normalizeAnalysisText(input: string | undefined): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

function tokenSet(input: string | undefined): Set<string> {
  return new Set(
    normalizeAnalysisText(input)
      .split(" ")
      .filter((token) => token.length >= 4)
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) {
    return 1;
  }
  const union = new Set([...left, ...right]);
  const intersection = [...left].filter((value) => right.has(value));
  return intersection.length / union.size;
}

function averagePairwiseSimilarity(sets: Set<string>[]): number | undefined {
  if (sets.length < 2) {
    return undefined;
  }
  let comparisons = 0;
  let total = 0;
  for (let index = 0; index < sets.length; index += 1) {
    for (let other = index + 1; other < sets.length; other += 1) {
      total += jaccardSimilarity(sets[index], sets[other]);
      comparisons += 1;
    }
  }
  return comparisons ? total / comparisons : undefined;
}

function computeResponseDrift(
  texts: Array<string | undefined>
): number | undefined {
  const sets = texts
    .map((text) => tokenSet(text))
    .filter((set) => set.size > 0);
  const similarity = averagePairwiseSimilarity(sets);
  if (similarity === undefined) {
    return undefined;
  }
  return Math.round((1 - similarity) * 1000) / 10;
}

function computeSourceVariance(
  sourceDomainsByRun: string[][]
): number | undefined {
  const sets = sourceDomainsByRun
    .map((domains) => new Set(domains.map((domain) => normalizeDomain(domain))))
    .filter((set) => set.size > 0);
  const similarity = averagePairwiseSimilarity(sets);
  if (similarity === undefined) {
    return undefined;
  }
  return Math.round((1 - similarity) * 1000) / 10;
}

function buildCitationMap<T extends { promptRunId: Id<"promptRuns"> }>(
  citations: T[]
) {
  const map = new Map<Id<"promptRuns">, T[]>();
  for (const citation of citations) {
    const existing = map.get(citation.promptRunId);
    if (existing) {
      existing.push(citation);
    } else {
      map.set(citation.promptRunId, [citation]);
    }
  }
  return map;
}

function buildRunEntityMentionMap(
  mentions: RunEntityMentionDoc[]
): Map<Id<"promptRuns">, RunEntityMentionDoc[]> {
  const map = new Map<Id<"promptRuns">, RunEntityMentionDoc[]>();
  for (const mention of mentions) {
    const existing = map.get(mention.promptRunId);
    if (existing) {
      existing.push(mention);
    } else {
      map.set(mention.promptRunId, [mention]);
    }
  }
  return map;
}

function getEntityTerms(entity: TrackedEntityDoc): string[] {
  return uniqueStrings([
    entity.name,
    entity.slug.replace(/-/g, " "),
    ...(entity.aliases ?? []),
  ]).filter((term) => term.length >= 3);
}

function citationsForEntity(
  citations: CitationDoc[],
  entity: TrackedEntityDoc
): CitationDoc[] {
  const ownedDomains = new Set(
    (entity.ownedDomains ?? []).map((domain) => normalizeDomain(domain))
  );
  return citations.filter(
    (citation) =>
      citation.trackedEntityId === entity._id ||
      ownedDomains.has(normalizeDomain(citation.domain))
  );
}

function extractEntityMentions(
  responseText: string | undefined,
  citations: CitationDoc[],
  trackedEntities: TrackedEntityDoc[]
) {
  const normalizedResponse = normalizeAnalysisText(responseText);

  return trackedEntities
    .map((entity) => {
      const matchedTerms: string[] = [];
      let mentionCount = 0;
      for (const term of getEntityTerms(entity)) {
        const normalizedTerm = normalizeAnalysisText(term);
        if (!normalizedTerm) {
          continue;
        }
        const matches = normalizedResponse.match(
          new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "g")
        );
        if (matches?.length) {
          matchedTerms.push(term);
          mentionCount += matches.length;
        }
      }

      const cited = citationsForEntity(citations, entity);
      if (!mentionCount && !cited.length) {
        return null;
      }

      return {
        entityId: entity._id,
        name: entity.name,
        slug: entity.slug,
        kind: entity.kind,
        mentionCount,
        citationCount: cited.length,
        ownedCitationCount: cited.filter((citation) => citation.isOwned).length,
        matchedTerms,
      };
    })
    .filter(
      (
        item
      ): item is {
        entityId: Id<"trackedEntities">;
        name: string;
        slug: string;
        kind: TrackedEntityDoc["kind"];
        mentionCount: number;
        citationCount: number;
        ownedCitationCount: number;
        matchedTerms: string[];
      } => item !== null
    )
    .sort(
      (left, right) =>
        right.mentionCount - left.mentionCount ||
        right.citationCount - left.citationCount ||
        left.name.localeCompare(right.name)
    );
}

export const createPromptGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("promptGroups", {
      name: args.name.trim(),
      description: args.description?.trim(),
      color: args.color?.trim(),
      sortOrder: args.sortOrder ?? 0,
    });
  },
});

export const listPromptGroups = query({
  handler: async (ctx) => {
    return await ctx.db.query("promptGroups").withIndex("sortOrder").collect();
  },
});

export const updatePromptGroup = mutation({
  args: {
    id: v.id("promptGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.id);
    if (group == null) {
      throw new Error("Prompt group not found");
    }

    await ctx.db.patch(
      args.id,
      compactPatch({
        name: args.name?.trim(),
        description: args.description?.trim(),
        color: args.color?.trim(),
        sortOrder: args.sortOrder,
      })
    );
    return args.id;
  },
});

export const deletePromptGroup = mutation({
  args: { id: v.id("promptGroups") },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.id);
    if (group == null) {
      throw new Error("Prompt group not found");
    }

    const prompts = await ctx.db
      .query("prompts")
      .withIndex("groupId", (q) => q.eq("groupId", args.id))
      .collect();
    await Promise.all(
      prompts.map((prompt) => ctx.db.patch(prompt._id, { groupId: undefined }))
    );
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const createPrompt = mutation({
  args: {
    groupId: v.optional(v.id("promptGroups")),
    name: v.string(),
    promptText: v.string(),
    targetModel: v.string(),
    tags: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (group == null) {
        throw new Error("Invalid prompt group");
      }
    }
    return await ctx.db.insert("prompts", {
      groupId: args.groupId,
      name: args.name.trim(),
      promptText: args.promptText.trim(),
      targetModel: args.targetModel.trim(),
      tags: args.tags?.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
      active: args.active ?? true,
      notes: args.notes?.trim(),
    });
  },
});

export const listPrompts = query({
  args: {
    groupId: v.optional(v.id("promptGroups")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let prompts: Doc<"prompts">[];

    if (args.groupId) {
      prompts = await ctx.db
        .query("prompts")
        .withIndex("groupId", (q) => q.eq("groupId", args.groupId))
        .collect();
    } else {
      prompts = await ctx.db.query("prompts").collect();
    }

    if (args.active !== undefined) {
      prompts = prompts.filter((prompt) => prompt.active === args.active);
    }
    return prompts.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAvailableModels = query({
  handler: async (ctx) => {
    const [prompts, runs] = await Promise.all([
      ctx.db.query("prompts").collect(),
      ctx.db.query("promptRuns").collect(),
    ]);
    return uniqueStrings([
      ...prompts.map((prompt) => prompt.targetModel),
      ...runs.map((run) => run.model),
    ]).sort((left, right) => left.localeCompare(right));
  },
});

export const updatePrompt = mutation({
  args: {
    id: v.id("prompts"),
    groupId: v.optional(v.id("promptGroups")),
    name: v.optional(v.string()),
    promptText: v.optional(v.string()),
    targetModel: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.id);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }

    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (group == null) {
        throw new Error("Invalid prompt group");
      }
    }

    await ctx.db.patch(
      args.id,
      compactPatch({
        groupId: args.groupId,
        name: args.name?.trim(),
        promptText: args.promptText?.trim(),
        targetModel: args.targetModel?.trim(),
        tags: args.tags
          ?.map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        active: args.active,
        notes: args.notes?.trim(),
      })
    );
    return args.id;
  },
});

export const deletePrompt = mutation({
  args: { id: v.id("prompts") },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.id);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }

    const runs = await ctx.db
      .query("promptRuns")
      .withIndex("promptId_startedAt", (q) => q.eq("promptId", args.id))
      .collect();
    await Promise.all(
      runs.map(async (run) => {
        const citations = await ctx.db
          .query("citations")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
          .collect();
        const mentions = await ctx.db
          .query("runEntityMentions")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
          .collect();
        await Promise.all(
          citations.map((citation) => ctx.db.delete(citation._id))
        );
        await Promise.all(
          mentions.map((mention) => ctx.db.delete(mention._id))
        );
        await ctx.db.delete(run._id);
      })
    );

    const promptJobs = await ctx.db.query("promptJobs").collect();
    await Promise.all(
      promptJobs
        .filter((job) => job.promptIds.includes(args.id))
        .map(async (job) => {
          const nextPromptIds = job.promptIds.filter(
            (promptId) => promptId !== args.id
          );
          if (nextPromptIds.length === 0) {
            await deletePromptJobCron(ctx, job.cronId);
            await ctx.db.delete(job._id);
            return;
          }
          await ctx.db.patch(job._id, {
            promptIds: nextPromptIds,
            updatedAt: Date.now(),
          });
        })
    );

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const createPromptJob = mutation({
  args: {
    name: v.string(),
    promptIds: v.array(v.id("prompts")),
    schedule: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const prompts = await assertPromptIdsOwned(ctx, args.promptIds);
    const now = Date.now();
    const enabled = args.enabled ?? true;
    const promptIds = prompts.map((prompt) => prompt._id);
    const schedule = args.schedule?.trim() || undefined;

    const jobId = await ctx.db.insert("promptJobs", {
      name: args.name.trim(),
      promptIds,
      schedule,
      enabled,
      createdAt: now,
      updatedAt: now,
    });

    if (schedule && enabled) {
      const cronId = await registerPromptJobCron(ctx, jobId, schedule);
      await ctx.db.patch(jobId, { cronId });
    }

    return jobId;
  },
});

export const listPromptJobs = query({
  handler: async (ctx) => {
    const [jobs, prompts] = await Promise.all([
      ctx.db.query("promptJobs").collect(),
      ctx.db.query("prompts").collect(),
    ]);
    const promptById = new Map(prompts.map((prompt) => [prompt._id, prompt]));

    return jobs
      .map((job) => ({
        ...job,
        promptCount: job.promptIds.length,
        prompts: job.promptIds
          .map((promptId) => promptById.get(promptId))
          .filter((prompt): prompt is PromptDoc => prompt !== undefined)
          .map((prompt) => ({
            id: prompt._id,
            name: prompt.name,
            model: prompt.targetModel,
          })),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const updatePromptJob = mutation({
  args: {
    id: v.id("promptJobs"),
    name: v.optional(v.string()),
    promptIds: v.optional(v.array(v.id("prompts"))),
    schedule: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job == null) {
      throw new Error("Execution plan not found");
    }

    const prompts = args.promptIds
      ? await assertPromptIdsOwned(ctx, args.promptIds)
      : await assertPromptIdsOwned(ctx, job.promptIds);
    const promptIds = prompts.map((prompt) => prompt._id);
    const schedule =
      args.schedule !== undefined
        ? args.schedule.trim() || undefined
        : job.schedule;
    const enabled = args.enabled ?? job.enabled;

    await deletePromptJobCron(ctx, job.cronId);
    let cronId: string | undefined;
    if (schedule && enabled) {
      cronId = await registerPromptJobCron(ctx, args.id, schedule);
    }

    await ctx.db.patch(args.id, {
      name: args.name?.trim() ?? job.name,
      promptIds,
      schedule,
      enabled,
      cronId,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const deletePromptJob = mutation({
  args: { id: v.id("promptJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job == null) {
      throw new Error("Execution plan not found");
    }

    await deletePromptJobCron(ctx, job.cronId);
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const triggerSelectedPromptsNow = mutation({
  args: {
    promptIds: v.array(v.id("prompts")),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prompts = await assertPromptIdsOwned(ctx, args.promptIds);
    const queuedCount = await enqueuePromptRunDocs(
      ctx,
      prompts,
      args.label?.trim() || "Manual run"
    );
    return { queuedCount };
  },
});

export const retryPromptRun = mutation({
  args: {
    runId: v.id("promptRuns"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run == null) {
      throw new Error("Prompt run not found");
    }
    const prompt = await ctx.db.get(run.promptId);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }
    const nextAttempt = (run.attempt ?? 1) + 1;
    const queuedAt = Date.now();
    const retryRunId = await ctx.db.insert("promptRuns", {
      promptId: run.promptId,
      model: run.model,
      status: "queued",
      attempt: nextAttempt,
      retryOfRunId: run.retryOfRunId ?? run._id,
      queuedAt,
      startedAt: queuedAt,
      runLabel: args.label?.trim() || run.runLabel || prompt.name,
    });
    return { runId: retryRunId };
  },
});

export const cancelPromptRun = mutation({
  args: {
    runId: v.id("promptRuns"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run == null) {
      throw new Error("Prompt run not found");
    }
    if (!isRecoverableRunStatus(run.status)) {
      return { runId: args.runId, status: run.status };
    }

    const summary = args.reason?.trim() || "Run was cancelled by the operator.";
    await ctx.db.patch(args.runId, {
      status: "failed",
      finishedAt: Date.now(),
      responseSummary: summary,
      warnings: uniqueStrings([...(run.warnings ?? []), summary]),
    });
    return { runId: args.runId, status: "failed" };
  },
});

export const triggerPromptJobNow = mutation({
  args: { id: v.id("promptJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job == null) {
      throw new Error("Execution plan not found");
    }

    const prompts = await assertPromptIdsOwned(ctx, job.promptIds);
    const queuedCount = await enqueuePromptRunDocs(ctx, prompts, job.name);
    await ctx.db.patch(args.id, {
      lastTriggeredAt: Date.now(),
      lastQueuedCount: queuedCount,
      updatedAt: Date.now(),
    });
    return { queuedCount };
  },
});

export const triggerPromptJob = internalMutation({
  args: { jobId: v.id("promptJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job == null || !job.enabled) {
      return { queuedCount: 0 };
    }
    const prompts = await Promise.all(
      job.promptIds.map(async (promptId) => {
        const prompt = await ctx.db.get(promptId);
        return prompt;
      })
    );
    const validPrompts = prompts.filter(
      (prompt): prompt is PromptDoc => prompt !== null
    );
    if (!validPrompts.length) {
      await ctx.db.patch(args.jobId, {
        lastTriggeredAt: Date.now(),
        lastQueuedCount: 0,
        updatedAt: Date.now(),
      });
      return { queuedCount: 0 };
    }
    const queuedCount = await enqueuePromptRunDocs(ctx, validPrompts, job.name);
    await ctx.db.patch(args.jobId, {
      lastTriggeredAt: Date.now(),
      lastQueuedCount: queuedCount,
      updatedAt: Date.now(),
    });
    return { queuedCount };
  },
});

export const getQueueStatus = query({
  handler: async (ctx) => {
    const [queuedRuns, runningRuns, recentRuns] = await Promise.all([
      ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", "queued"))
        .collect(),
      ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", "running"))
        .collect(),
      ctx.db.query("promptRuns").withIndex("startedAt").order("desc").take(100),
    ]);

    const latestFinishedRun = recentRuns.find((run) =>
      isTerminalRunStatus(run.status)
    );
    const latestQueuedRun = queuedRuns
      .slice()
      .sort(
        (a, b) => (b.queuedAt ?? b.startedAt) - (a.queuedAt ?? a.startedAt)
      )[0];

    return {
      queuedCount: queuedRuns.length,
      runningCount: runningRuns.length,
      latestFinishedRun: latestFinishedRun
        ? {
            id: latestFinishedRun._id,
            status: latestFinishedRun.status,
            finishedAt: latestFinishedRun.finishedAt,
            startedAt: latestFinishedRun.startedAt,
            runLabel: latestFinishedRun.runLabel,
          }
        : null,
      latestQueuedRun: latestQueuedRun
        ? {
            id: latestQueuedRun._id,
            queuedAt: latestQueuedRun.queuedAt ?? latestQueuedRun.startedAt,
            runLabel: latestQueuedRun.runLabel,
            model: latestQueuedRun.model,
          }
        : null,
    };
  },
});

export const claimNextQueuedPromptRun = mutation({
  args: {
    runner: v.optional(v.string()),
    maxConcurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxConcurrent = Math.max(1, Math.floor(args.maxConcurrent ?? 2));
    const activeRuns = await ctx.db
      .query("promptRuns")
      .withIndex("status_startedAt", (q) => q.eq("status", "running"))
      .collect();

    if (activeRuns.length >= maxConcurrent) {
      return null;
    }

    const queuedRun = await ctx.db
      .query("promptRuns")
      .withIndex("status_startedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (queuedRun == null) {
      return null;
    }

    const prompt = await ctx.db.get(queuedRun.promptId);
    if (prompt == null) {
      await ctx.db.patch(queuedRun._id, {
        status: "failed",
        finishedAt: Date.now(),
        responseSummary: "Prompt was deleted before the run could execute.",
        warnings: ["Prompt was deleted before execution."],
        runner: args.runner?.trim() || "local-playwright-worker",
      });
      return null;
    }

    const startedAt = Date.now();
    await ctx.db.patch(queuedRun._id, {
      status: "running",
      startedAt,
      warnings: undefined,
      runner: args.runner?.trim() || "local-playwright-worker",
    });

    return {
      runId: queuedRun._id,
      queuedAt: queuedRun.queuedAt ?? queuedRun.startedAt,
      startedAt,
      prompt: {
        id: prompt._id,
        name: prompt.name,
        promptText: prompt.promptText,
        targetModel: prompt.targetModel,
      },
      runLabel: queuedRun.runLabel ?? prompt.name,
      attempt: queuedRun.attempt ?? 1,
      retryOfRunId: queuedRun.retryOfRunId,
    };
  },
});

export const recoverStaleRunningPromptRuns = mutation({
  args: {
    olderThanMs: v.optional(v.float64()),
    runner: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thresholdMs = Math.max(
      60_000,
      Math.floor(args.olderThanMs ?? 15 * 60_000)
    );
    const cutoff = Date.now() - thresholdMs;
    const runningRuns = await ctx.db
      .query("promptRuns")
      .withIndex("status_startedAt", (q) => q.eq("status", "running"))
      .collect();

    const staleRuns = runningRuns.filter((run) => run.startedAt <= cutoff);
    const summary =
      args.summary?.trim() ||
      "Recovered stale running job after worker interruption.";

    await Promise.all(
      staleRuns.map((run) =>
        ctx.db.patch(run._id, {
          status: "failed",
          finishedAt: Date.now(),
          responseSummary: summary,
          warnings: [...(run.warnings ?? []), summary],
          runner: args.runner ?? run.runner,
        })
      )
    );

    return {
      recoveredCount: staleRuns.length,
    };
  },
});

export const completePromptRun = mutation({
  args: {
    runId: v.id("promptRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("blocked")
    ),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    responseText: v.optional(v.string()),
    responseSummary: v.optional(v.string()),
    visibilityScore: v.optional(v.float64()),
    citationQualityScore: v.optional(v.float64()),
    averageCitationPosition: v.optional(v.float64()),
    sourceCount: v.optional(v.float64()),
    runLabel: v.optional(v.string()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    runner: v.optional(v.string()),
    citations: v.optional(
      v.array(
        v.object({
          domain: v.string(),
          url: v.string(),
          title: v.optional(v.string()),
          snippet: v.optional(v.string()),
          type: vCitationType,
          position: v.float64(),
          qualityScore: v.optional(v.float64()),
          trackedEntityId: v.optional(v.id("trackedEntities")),
          isOwned: v.optional(v.boolean()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run == null) {
      throw new Error("Prompt run not found");
    }

    const shouldPersistCitations = isSuccessfulRunStatus(args.status);
    const citationInputs = shouldPersistCitations
      ? normalizeCitationInputs(args.citations ?? [])
      : [];
    const positionValues = citationInputs.map((citation) => citation.position);
    const qualityValues = citationInputs
      .map((citation) => citation.qualityScore)
      .filter((value): value is number => typeof value === "number");

    const derivedAveragePosition = average(positionValues);
    const rawAverageQuality = average(qualityValues);
    const derivedCitationQuality =
      rawAverageQuality === undefined
        ? undefined
        : rawAverageQuality <= 1
          ? rawAverageQuality * 100
          : rawAverageQuality;
    const derivedVisibility =
      derivedAveragePosition === undefined
        ? undefined
        : clamp(100 - (derivedAveragePosition - 1) * 8, 0, 100);

    const mergedWarnings = uniqueStrings([
      ...(run.warnings ?? []),
      ...(args.warnings ?? []),
    ]);

    const existingCitations = await ctx.db
      .query("citations")
      .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
      .collect();
    await Promise.all(
      existingCitations.map((citation) => ctx.db.delete(citation._id))
    );

    await ctx.db.patch(args.runId, {
      status: args.status,
      finishedAt: args.finishedAt,
      latencyMs: args.latencyMs,
      responseText: args.responseText,
      responseSummary: args.responseSummary,
      visibilityScore: shouldPersistCitations
        ? (args.visibilityScore ?? derivedVisibility)
        : undefined,
      citationQualityScore: shouldPersistCitations
        ? (args.citationQualityScore ?? derivedCitationQuality)
        : undefined,
      averageCitationPosition: shouldPersistCitations
        ? (args.averageCitationPosition ?? derivedAveragePosition)
        : undefined,
      runLabel: args.runLabel ?? run.runLabel,
      sourceCount: shouldPersistCitations
        ? (args.sourceCount ??
          new Set(
            citationInputs.map((citation) => normalizeDomain(citation.domain))
          ).size)
        : undefined,
      deeplinkUsed: args.deeplinkUsed,
      evidencePath: args.evidencePath,
      output: args.output,
      warnings: mergedWarnings.length ? mergedWarnings : undefined,
      runner: args.runner ?? run.runner,
    });

    if (shouldPersistCitations) {
      await insertCitationsForRun(ctx, args.runId, citationInputs);
      const persistedCitations = await ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
        .collect();
      await replaceRunEntityMentions(
        ctx,
        args.runId,
        args.responseText ??
          run.responseText ??
          args.responseSummary ??
          run.responseSummary,
        persistedCitations
      );
    } else {
      const existingMentions = await ctx.db
        .query("runEntityMentions")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
        .collect();
      await Promise.all(
        existingMentions.map((mention) => ctx.db.delete(mention._id))
      );
    }

    return { runId: args.runId, citationCount: citationInputs.length };
  },
});

export const createTrackedEntity = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    kind: vEntityKind,
    aliases: v.optional(v.array(v.string())),
    ownedDomains: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const slug = sanitizeSlug(args.slug ?? args.name);
    if (!slug) {
      throw new Error("Tracked entity slug cannot be empty");
    }

    const existing = await ctx.db
      .query("trackedEntities")
      .withIndex("slug", (q) => q.eq("slug", slug))
      .collect();
    if (existing.length > 0) {
      throw new Error("Tracked entity slug already exists");
    }

    const ownedDomains = await assertOwnedDomainsAreUnique(
      ctx,
      args.ownedDomains
    );

    return await ctx.db.insert("trackedEntities", {
      name: args.name.trim(),
      slug,
      kind: args.kind,
      aliases: args.aliases
        ?.map((alias) => alias.trim())
        .filter((alias) => alias.length > 0),
      ownedDomains,
      color: args.color?.trim(),
      active: args.active ?? true,
    });
  },
});

export const listTrackedEntities = query({
  args: {
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let entities = await ctx.db.query("trackedEntities").collect();
    if (args.active !== undefined) {
      entities = entities.filter((entity) => entity.active === args.active);
    }
    return entities.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const updateTrackedEntity = mutation({
  args: {
    id: v.id("trackedEntities"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    kind: v.optional(vEntityKind),
    aliases: v.optional(v.array(v.string())),
    ownedDomains: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.id);
    if (entity == null) {
      throw new Error("Tracked entity not found");
    }

    let nextSlug: string | undefined;
    if (args.slug !== undefined || args.name !== undefined) {
      const candidate = sanitizeSlug(args.slug ?? args.name ?? entity.slug);
      if (!candidate) {
        throw new Error("Tracked entity slug cannot be empty");
      }
      const existing = await ctx.db
        .query("trackedEntities")
        .withIndex("slug", (q) => q.eq("slug", candidate))
        .collect();
      const conflict = existing.some((item) => item._id !== args.id);
      if (conflict) {
        throw new Error("Tracked entity slug already exists");
      }
      nextSlug = candidate;
    }

    const ownedDomains =
      args.ownedDomains !== undefined
        ? await assertOwnedDomainsAreUnique(ctx, args.ownedDomains, args.id)
        : undefined;

    await ctx.db.patch(
      args.id,
      compactPatch({
        name: args.name?.trim(),
        slug: nextSlug,
        kind: args.kind,
        aliases: args.aliases
          ?.map((alias) => alias.trim())
          .filter((alias) => alias.length > 0),
        ownedDomains,
        color: args.color?.trim(),
        active: args.active,
      })
    );
    return args.id;
  },
});

export const deleteTrackedEntity = mutation({
  args: { id: v.id("trackedEntities") },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.id);
    if (entity == null) {
      throw new Error("Tracked entity not found");
    }
    const citations = await ctx.db.query("citations").collect();
    await Promise.all(
      citations
        .filter((citation) => citation.trackedEntityId === args.id)
        .map((citation) =>
          ctx.db.patch(citation._id, {
            trackedEntityId: undefined,
          })
        )
    );
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const ingestPromptRun = mutation({
  args: {
    promptId: v.id("prompts"),
    model: v.string(),
    status: vRunStatus,
    ingestId: v.optional(v.string()),
    startedAt: v.float64(),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    responseText: v.optional(v.string()),
    responseSummary: v.optional(v.string()),
    visibilityScore: v.optional(v.float64()),
    citationQualityScore: v.optional(v.float64()),
    averageCitationPosition: v.optional(v.float64()),
    runLabel: v.optional(v.string()),
    sourceCount: v.optional(v.float64()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    ingestKey: v.optional(v.string()),
    citations: v.optional(
      v.array(
        v.object({
          domain: v.string(),
          url: v.string(),
          title: v.optional(v.string()),
          snippet: v.optional(v.string()),
          type: vCitationType,
          position: v.float64(),
          qualityScore: v.optional(v.float64()),
          trackedEntityId: v.optional(v.id("trackedEntities")),
          isOwned: v.optional(v.boolean()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.promptId);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }

    const requiredIngestKey = process.env.PEEC_RUN_INGEST_KEY;
    if (requiredIngestKey && args.ingestKey !== requiredIngestKey) {
      throw new Error("Unauthorized ingest");
    }

    const shouldPersistCitations = isSuccessfulRunStatus(args.status);
    const citationInputs = shouldPersistCitations
      ? normalizeCitationInputs(args.citations ?? [])
      : [];
    const positionValues = citationInputs.map((citation) => citation.position);
    const qualityValues = citationInputs
      .map((citation) => citation.qualityScore)
      .filter((value): value is number => typeof value === "number");

    const derivedAveragePosition = average(positionValues);
    const rawAverageQuality = average(qualityValues);
    const derivedCitationQuality =
      rawAverageQuality === undefined
        ? undefined
        : rawAverageQuality <= 1
          ? rawAverageQuality * 100
          : rawAverageQuality;
    const derivedVisibility =
      derivedAveragePosition === undefined
        ? undefined
        : clamp(100 - (derivedAveragePosition - 1) * 8, 0, 100);

    if (args.ingestId?.trim()) {
      const existing = await ctx.db
        .query("promptRuns")
        .withIndex("ingestId", (q) => q.eq("ingestId", args.ingestId!.trim()))
        .first();
      if (existing) {
        return { runId: existing._id, citationCount: 0, deduped: true };
      }
    }

    const runId = await ctx.db.insert("promptRuns", {
      promptId: args.promptId,
      model: args.model.trim(),
      status: args.status,
      attempt: 1,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      latencyMs: args.latencyMs,
      responseText: args.responseText,
      responseSummary: args.responseSummary,
      visibilityScore: shouldPersistCitations
        ? (args.visibilityScore ?? derivedVisibility)
        : undefined,
      citationQualityScore: shouldPersistCitations
        ? (args.citationQualityScore ?? derivedCitationQuality)
        : undefined,
      averageCitationPosition: shouldPersistCitations
        ? (args.averageCitationPosition ?? derivedAveragePosition)
        : undefined,
      runLabel: args.runLabel,
      sourceCount: shouldPersistCitations
        ? (args.sourceCount ??
          new Set(
            citationInputs.map((citation) => normalizeDomain(citation.domain))
          ).size)
        : undefined,
      deeplinkUsed: args.deeplinkUsed,
      evidencePath: args.evidencePath,
      output: args.output,
      warnings: args.warnings,
      ingestId: args.ingestId?.trim(),
    });

    if (shouldPersistCitations) {
      await insertCitationsForRun(ctx, runId, citationInputs);
      const persistedCitations = await ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
        .collect();
      await replaceRunEntityMentions(
        ctx,
        runId,
        args.responseText ?? args.responseSummary,
        persistedCitations
      );
    }

    return { runId, citationCount: citationInputs.length };
  },
});

export const listPromptRuns = query({
  args: {
    promptId: v.optional(v.id("prompts")),
    model: v.optional(v.string()),
    status: v.optional(vRunStatus),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = clamp(Math.floor(args.limit ?? 30), 1, 100);

    let runs: PromptRunDoc[];
    if (args.promptId) {
      await assertPromptOwnership(ctx, args.promptId);
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("promptId_startedAt", (q) =>
          q.eq("promptId", args.promptId!)
        )
        .order("desc")
        .collect();
    } else if (args.model) {
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("model_startedAt", (q) => q.eq("model", args.model!))
        .order("desc")
        .collect();
    } else if (args.status) {
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("startedAt")
        .order("desc")
        .take(limit);
    }

    if (args.model) {
      runs = runs.filter((run) => run.model === args.model);
    }
    if (args.status) {
      runs = runs.filter((run) => run.status === args.status);
    }
    runs = runs.slice(0, limit);

    const prompts = await ctx.db.query("prompts").collect();
    const promptNameById = new Map(
      prompts.map((prompt) => [prompt._id, prompt.name])
    );

    const citationMap = buildCitationMap(
      await collectCitationsForRuns(
        ctx,
        runs
          .filter((run) => isSuccessfulRunStatus(run.status))
          .map((run) => run._id)
      )
    );

    return runs.map((run) => ({
      _id: run._id,
      _creationTime: run._creationTime,
      promptId: run.promptId,
      promptName: promptNameById.get(run.promptId) ?? "Unknown prompt",
      model: run.model,
      status: run.status,
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      latencyMs: run.latencyMs,
      responseSummary: run.responseSummary,
      attempt: run.attempt ?? 1,
      retryOfRunId: run.retryOfRunId,
      citationQualityScore: isSuccessfulRunStatus(run.status)
        ? run.citationQualityScore
        : undefined,
      sourceCount: isSuccessfulRunStatus(run.status)
        ? run.sourceCount
        : undefined,
      runLabel: run.runLabel,
      warnings: run.warnings,
      citationCount: citationMap.get(run._id)?.length ?? 0,
    }));
  },
});

export const listPromptResponseAnalytics = query({
  args: {
    groupId: v.optional(v.id("promptGroups")),
    model: v.optional(v.string()),
    active: v.optional(v.boolean()),
    rangeDays: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    let prompts: PromptDoc[];
    if (args.groupId) {
      prompts = await ctx.db
        .query("prompts")
        .withIndex("groupId", (q) => q.eq("groupId", args.groupId))
        .collect();
    } else {
      prompts = await ctx.db.query("prompts").collect();
    }

    if (args.active !== undefined) {
      prompts = prompts.filter((prompt) => prompt.active === args.active);
    }

    const groups = await ctx.db.query("promptGroups").collect();
    const groupNameById = new Map(
      groups.map((group) => [group._id, group.name])
    );
    const rangeStart =
      Date.now() - (args.rangeDays ?? 30) * 24 * 60 * 60 * 1000;

    const promptRunsByPrompt = new Map<Id<"prompts">, PromptRunDoc[]>();
    for (const prompt of prompts) {
      const runs = await ctx.db
        .query("promptRuns")
        .withIndex("promptId_startedAt", (q) => q.eq("promptId", prompt._id))
        .order("desc")
        .collect();
      promptRunsByPrompt.set(
        prompt._id,
        runs.filter(
          (run) =>
            run.startedAt >= rangeStart &&
            (!args.model || run.model === args.model)
        )
      );
    }

    const scopedRuns = [...promptRunsByPrompt.values()].flat();
    const citations = await collectCitationsForRuns(
      ctx,
      scopedRuns
        .filter((run) => isSuccessfulRunStatus(run.status))
        .map((run) => run._id)
    );
    const citationsByRun = buildCitationMap(citations);
    const mentionsByRun = buildRunEntityMentionMap(
      await collectRunEntityMentionsForRuns(
        ctx,
        scopedRuns
          .filter((run) => isSuccessfulRunStatus(run.status))
          .map((run) => run._id)
      )
    );

    return prompts
      .map((prompt) => {
        const promptRuns = (promptRunsByPrompt.get(prompt._id) ?? []).sort(
          (left, right) => right.startedAt - left.startedAt
        );
        const successfulRuns = promptRuns.filter((run) =>
          isSuccessfulRunStatus(run.status)
        );
        const latestSuccessfulRun = successfulRuns[0];
        const latestCitations = latestSuccessfulRun
          ? (citationsByRun.get(latestSuccessfulRun._id) ?? [])
          : [];
        const allPromptCitations = successfulRuns.flatMap(
          (run) => citationsByRun.get(run._id) ?? []
        );
        const uniqueDomains = uniqueStrings(
          allPromptCitations.map((citation) => citation.domain)
        );
        const topSources = [
          ...new Map(
            allPromptCitations.map((citation) => [citation.domain, 0])
          ).keys(),
        ].slice(0, 3);
        const sourceVariance = computeSourceVariance(
          successfulRuns
            .slice(0, 5)
            .map((run) =>
              (citationsByRun.get(run._id) ?? []).map(
                (citation) => citation.domain
              )
            )
        );
        const responseDrift = computeResponseDrift(
          successfulRuns
            .slice(0, 5)
            .map((run) => run.responseText ?? run.responseSummary)
        );

        const aggregatedEntityMap = new Map<
          string,
          {
            name: string;
            mentionCount: number;
            citationCount: number;
          }
        >();
        for (const run of successfulRuns.slice(0, 5)) {
          const mentions = mentionsByRun.get(run._id) ?? [];
          for (const mention of mentions) {
            const mentionKey = mention.trackedEntityId
              ? String(mention.trackedEntityId)
              : mention.slug;
            const existing = aggregatedEntityMap.get(mentionKey);
            if (existing) {
              existing.mentionCount += mention.mentionCount;
              existing.citationCount += mention.citationCount;
            } else {
              aggregatedEntityMap.set(mentionKey, {
                name: mention.name,
                mentionCount: mention.mentionCount,
                citationCount: mention.citationCount,
              });
            }
          }
        }

        const topEntities = [...aggregatedEntityMap.values()]
          .sort(
            (left, right) =>
              right.mentionCount - left.mentionCount ||
              right.citationCount - left.citationCount
          )
          .slice(0, 3)
          .map((entity) => entity.name);

        return {
          id: prompt._id,
          name: prompt.name,
          group: prompt.groupId
            ? (groupNameById.get(prompt.groupId) ?? "Ungrouped")
            : "Ungrouped",
          models: uniqueStrings(successfulRuns.map((run) => run.model)),
          model:
            uniqueStrings(successfulRuns.map((run) => run.model))[0] ??
            prompt.targetModel,
          active: prompt.active,
          responseCount: successfulRuns.length,
          latestRunAt: latestSuccessfulRun?.startedAt,
          latestRunId: latestSuccessfulRun?._id,
          latestStatus: latestSuccessfulRun?.status,
          latestAttempt:
            promptRuns[0]?.attempt ?? latestSuccessfulRun?.attempt ?? 1,
          latestExecutionStatus: promptRuns[0]?.status,
          latestResponseSummary:
            latestSuccessfulRun?.responseSummary ??
            latestSuccessfulRun?.responseText ??
            undefined,
          latestSourceCount:
            latestSuccessfulRun?.sourceCount ?? latestCitations.length,
          latestVisibility: latestSuccessfulRun?.visibilityScore,
          latestCitationQuality: latestSuccessfulRun?.citationQualityScore,
          sourceDiversity: uniqueDomains.length,
          topSources,
          topEntities,
          responseDrift,
          sourceVariance,
        };
      })
      .sort(
        (left, right) =>
          (right.latestRunAt ?? 0) - (left.latestRunAt ?? 0) ||
          left.name.localeCompare(right.name)
      );
  },
});

export const getPromptAnalysis = query({
  args: {
    promptId: v.id("prompts"),
    model: v.optional(v.string()),
    rangeDays: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const prompt = await assertPromptOwnership(ctx, args.promptId);
    const promptRuns = await ctx.db
      .query("promptRuns")
      .withIndex("promptId_startedAt", (q) => q.eq("promptId", args.promptId))
      .order("desc")
      .collect();

    const rangeStart =
      Date.now() - (args.rangeDays ?? 30) * 24 * 60 * 60 * 1000;
    const filteredRuns = promptRuns.filter((run) => {
      if (run.startedAt < rangeStart) {
        return false;
      }
      if (args.model && run.model !== args.model) {
        return false;
      }
      return true;
    });

    const citations = await collectCitationsForRuns(
      ctx,
      filteredRuns
        .filter((run) => isSuccessfulRunStatus(run.status))
        .map((run) => run._id)
    );
    const citationsByRun = buildCitationMap(citations);
    const mentionsByRun = buildRunEntityMentionMap(
      await collectRunEntityMentionsForRuns(
        ctx,
        filteredRuns
          .filter((run) => isSuccessfulRunStatus(run.status))
          .map((run) => run._id)
      )
    );

    const responses = filteredRuns.map((run) => {
      const runCitations = isSuccessfulRunStatus(run.status)
        ? (citationsByRun.get(run._id) ?? [])
        : [];
      const mentions = mentionsByRun.get(run._id) ?? [];
      return {
        id: run._id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        model: run.model,
        attempt: run.attempt ?? 1,
        visibilityScore: isSuccessfulRunStatus(run.status)
          ? run.visibilityScore
          : undefined,
        citationQualityScore: isSuccessfulRunStatus(run.status)
          ? run.citationQualityScore
          : undefined,
        averageCitationPosition: isSuccessfulRunStatus(run.status)
          ? run.averageCitationPosition
          : undefined,
        responseSummary: run.responseSummary ?? run.responseText,
        responseTextPreview: (
          run.responseText ??
          run.responseSummary ??
          ""
        ).slice(0, 320),
        sourceCount: isSuccessfulRunStatus(run.status)
          ? (run.sourceCount ?? runCitations.length)
          : undefined,
        sourceDomains: uniqueStrings(
          runCitations.map((citation) => citation.domain)
        ).slice(0, 6),
        mentionNames: mentions.slice(0, 4).map((mention) => mention.name),
        warnings: run.warnings ?? [],
        evidencePath: run.evidencePath,
      };
    });

    const completedRuns = filteredRuns.filter((run) =>
      isSuccessfulRunStatus(run.status)
    );
    const allCitations = completedRuns.flatMap(
      (run) => citationsByRun.get(run._id) ?? []
    );

    const sourceMap = new Map<
      string,
      {
        domain: string;
        citations: CitationDoc[];
        runIds: Set<Id<"promptRuns">>;
      }
    >();
    for (const citation of allCitations) {
      const existing = sourceMap.get(citation.domain);
      if (existing) {
        existing.citations.push(citation);
        existing.runIds.add(citation.promptRunId);
      } else {
        sourceMap.set(citation.domain, {
          domain: citation.domain,
          citations: [citation],
          runIds: new Set([citation.promptRunId]),
        });
      }
    }

    const sourceBreakdown = [...sourceMap.values()]
      .map((entry) => ({
        domain: entry.domain,
        type: domainTypeMode(entry.citations),
        citationCount: entry.citations.length,
        responseCount: entry.runIds.size,
        avgPosition: average(
          entry.citations.map((citation) => citation.position)
        ),
        avgQualityScore: average(
          entry.citations
            .map((citation) => citation.qualityScore)
            .filter((value): value is number => typeof value === "number")
        ),
        ownedShare:
          toPercent(
            entry.citations.filter((citation) => citation.isOwned).length /
              entry.citations.length
          ) ?? 0,
        latestResponses: completedRuns
          .filter((run) => entry.runIds.has(run._id))
          .slice(0, 3)
          .map((run) => ({
            runId: run._id,
            startedAt: run.startedAt,
            responseSummary: run.responseSummary ?? run.responseText ?? "",
          })),
      }))
      .sort((left, right) => right.citationCount - left.citationCount);

    const mentionMap = new Map<
      string,
      {
        entityId?: Id<"trackedEntities">;
        name: string;
        kind: TrackedEntityDoc["kind"];
        mentionCount: number;
        citationCount: number;
        responseIds: Set<Id<"promptRuns">>;
      }
    >();

    for (const run of completedRuns) {
      const mentions = mentionsByRun.get(run._id) ?? [];
      for (const mention of mentions) {
        const key = mention.trackedEntityId
          ? String(mention.trackedEntityId)
          : `${mention.slug}:${mention.name}`;
        const existing = mentionMap.get(key);
        if (existing) {
          existing.mentionCount += mention.mentionCount;
          existing.citationCount += mention.citationCount;
          existing.responseIds.add(run._id);
        } else {
          mentionMap.set(key, {
            entityId: mention.trackedEntityId,
            name: mention.name,
            kind: mention.kind,
            mentionCount: mention.mentionCount,
            citationCount: mention.citationCount,
            responseIds: new Set([run._id]),
          });
        }
      }
    }

    const entityBreakdown = [...mentionMap.values()]
      .map((entry) => ({
        entityId: entry.entityId,
        name: entry.name,
        kind: entry.kind,
        mentionCount: entry.mentionCount,
        citationCount: entry.citationCount,
        responseCount: entry.responseIds.size,
      }))
      .sort(
        (left, right) =>
          right.mentionCount - left.mentionCount ||
          right.citationCount - left.citationCount
      );

    return {
      prompt,
      summary: {
        responseCount: completedRuns.length,
        sourceDiversity: uniqueStrings(
          allCitations.map((citation) => citation.domain)
        ).length,
        responseDrift: computeResponseDrift(
          completedRuns.map((run) => run.responseText ?? run.responseSummary)
        ),
        sourceVariance: computeSourceVariance(
          completedRuns.map((run) =>
            (citationsByRun.get(run._id) ?? []).map(
              (citation) => citation.domain
            )
          )
        ),
      },
      responses,
      sourceBreakdown,
      entityBreakdown,
    };
  },
});

export const getPromptRun = query({
  args: { id: v.id("promptRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (run == null) {
      throw new Error("Prompt run not found");
    }

    const prompt = await ctx.db.get(run.promptId);
    const citations = isSuccessfulRunStatus(run.status)
      ? await ctx.db
          .query("citations")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", args.id))
          .collect()
      : [];
    const mentionSnapshots = await ctx.db
      .query("runEntityMentions")
      .withIndex("promptRunId", (q) => q.eq("promptRunId", args.id))
      .collect();

    let output = null;
    if (run.output) {
      try {
        output = JSON.parse(run.output);
      } catch {
        output = { raw: run.output };
      }
    }

    return {
      run: {
        ...run,
        sourceCount: isSuccessfulRunStatus(run.status)
          ? run.sourceCount
          : undefined,
        citationQualityScore: isSuccessfulRunStatus(run.status)
          ? run.citationQualityScore
          : undefined,
        averageCitationPosition: isSuccessfulRunStatus(run.status)
          ? run.averageCitationPosition
          : undefined,
        visibilityScore: isSuccessfulRunStatus(run.status)
          ? run.visibilityScore
          : undefined,
      },
      prompt,
      output,
      mentions: mentionSnapshots.map((mention) => ({
        entityId: mention.trackedEntityId,
        name: mention.name,
        slug: mention.slug,
        kind: mention.kind,
        mentionCount: mention.mentionCount,
        citationCount: mention.citationCount,
        ownedCitationCount: mention.ownedCitationCount,
        matchedTerms: mention.matchedTerms,
      })),
      citations: citations.map((citation) => ({
        ...citation,
        trackedEntity:
          citation.trackedEntityName && citation.trackedEntitySlug
            ? {
                name: citation.trackedEntityName,
                slug: citation.trackedEntitySlug,
              }
            : null,
      })),
    };
  },
});

export const listSources = query({
  args: {
    rangeDays: v.optional(v.float64()),
    model: v.optional(v.string()),
    type: v.optional(vCitationType),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const rangeMs = (args.rangeDays ?? 30) * 24 * 60 * 60 * 1000;
    const rangeStart = Date.now() - rangeMs;

    const selectedRuns = (await collectRunsSince(ctx, rangeStart))
      .filter(
        (run) =>
          (!args.model || run.model === args.model) &&
          isSuccessfulRunStatus(run.status)
      )
      .sort((left, right) => right.startedAt - left.startedAt);

    const prompts = await ctx.db.query("prompts").collect();
    const promptById = new Map(prompts.map((prompt) => [prompt._id, prompt]));
    const runById = new Map(selectedRuns.map((run) => [run._id, run]));
    const runIds = selectedRuns.map((run) => run._id);
    let citations = await collectCitationsForRuns(ctx, runIds);
    const mentionsByRun = buildRunEntityMentionMap(
      await collectRunEntityMentionsForRuns(ctx, runIds)
    );
    if (args.type) {
      citations = citations.filter((citation) => citation.type === args.type);
    }

    const totalCitations = citations.length;
    const totalRuns = selectedRuns.length;
    const sourceMap = new Map<
      string,
      {
        domain: string;
        citations: CitationDoc[];
      }
    >();

    for (const citation of citations) {
      const key = citation.domain;
      const existing = sourceMap.get(key);
      if (existing) {
        existing.citations.push(citation);
      } else {
        sourceMap.set(key, { domain: key, citations: [citation] });
      }
    }

    const items = [...sourceMap.values()]
      .map((entry) => {
        const positionValues = entry.citations.map(
          (citation) => citation.position
        );
        const qualityValues = entry.citations
          .map((citation) => citation.qualityScore)
          .filter((value): value is number => typeof value === "number");
        const ownedCitations = entry.citations.filter(
          (citation) => citation.isOwned
        ).length;
        return {
          domain: entry.domain,
          type: domainTypeMode(entry.citations),
          citations: entry.citations.length,
          responseCount: new Set(
            entry.citations.map((citation) => citation.promptRunId)
          ).size,
          promptCount: new Set(
            entry.citations.map((citation) => {
              const run = runById.get(citation.promptRunId);
              return run?.promptId;
            })
          ).size,
          usedShare: totalCitations
            ? (toPercent(entry.citations.length / totalCitations) ?? 0)
            : 0,
          avgCitationsPerRun: totalRuns
            ? Math.round((entry.citations.length / totalRuns) * 100) / 100
            : 0,
          avgQualityScore: average(qualityValues),
          avgPosition: average(positionValues),
          ownedShare: entry.citations.length
            ? (toPercent(ownedCitations / entry.citations.length) ?? 0)
            : 0,
          promptNames: uniqueStrings(
            entry.citations.map((citation) => {
              const run = runById.get(citation.promptRunId);
              return run ? promptById.get(run.promptId)?.name : undefined;
            })
          ).slice(0, 4),
          latestResponses: entry.citations
            .map((citation) => {
              const run = runById.get(citation.promptRunId);
              if (!run) {
                return null;
              }
              const prompt = promptById.get(run.promptId);
              return {
                runId: run._id,
                promptId: run.promptId,
                promptName: prompt?.name ?? "Unknown prompt",
                startedAt: run.startedAt,
                responseSummary: run.responseSummary ?? run.responseText ?? "",
                position: citation.position,
              };
            })
            .filter(
              (
                item
              ): item is {
                runId: Id<"promptRuns">;
                promptId: Id<"prompts">;
                promptName: string;
                startedAt: number;
                responseSummary: string;
                position: number;
              } => item !== null
            )
            .sort((left, right) => right.startedAt - left.startedAt)
            .slice(0, 3),
          mentionedEntities: uniqueStrings(
            entry.citations.flatMap((citation) => {
              return (mentionsByRun.get(citation.promptRunId) ?? []).map(
                (mention) => mention.name
              );
            })
          ).slice(0, 4),
        };
      })
      .sort((a, b) => b.citations - a.citations)
      .slice(0, clamp(Math.floor(args.limit ?? 50), 1, 200));

    const typeCounts = new Map<CitationDoc["type"], number>();
    for (const citation of citations) {
      typeCounts.set(citation.type, (typeCounts.get(citation.type) ?? 0) + 1);
    }
    const domainTypeBreakdown = [...typeCounts.entries()]
      .map(([type, count]) => ({
        type,
        citations: count,
        share: totalCitations ? (toPercent(count / totalCitations) ?? 0) : 0,
      }))
      .sort((a, b) => b.citations - a.citations);

    return {
      meta: {
        rangeDays: args.rangeDays ?? 30,
        totalRuns,
        totalCitations,
        totalDomains: sourceMap.size,
      },
      items,
      domainTypeBreakdown,
    };
  },
});

export const getOverview = query({
  args: {
    rangeDays: v.optional(v.float64()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rangeDays = args.rangeDays ?? 30;
    const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
    const referenceTime = Date.now();
    const currentStart = referenceTime - rangeMs;
    const previousStart = referenceTime - rangeMs * 2;

    const filteredRuns = (await collectRunsSince(ctx, previousStart)).filter(
      (run) =>
        (args.model ? run.model === args.model : true) &&
        isTerminalRunStatus(run.status)
    );
    const currentRuns = filteredRuns.filter(
      (run) => run.startedAt >= currentStart && run.startedAt <= referenceTime
    );
    const previousRuns = filteredRuns.filter(
      (run) => run.startedAt >= previousStart && run.startedAt < currentStart
    );
    const currentSuccessfulRuns = currentRuns.filter((run) =>
      isSuccessfulRunStatus(run.status)
    );
    const previousSuccessfulRuns = previousRuns.filter((run) =>
      isSuccessfulRunStatus(run.status)
    );

    const currentMetrics = summarizeRunMetrics(currentSuccessfulRuns);
    const previousMetrics = summarizeRunMetrics(previousSuccessfulRuns);
    const currentRunIds = currentSuccessfulRuns.map((run) => run._id);
    const currentCitations = await collectCitationsForRuns(ctx, currentRunIds);
    const totalCitations = currentCitations.length;
    const prompts = await ctx.db.query("prompts").collect();
    const currentCitationsByRun = buildCitationMap(currentCitations);
    const mentionsByRun = buildRunEntityMentionMap(
      await collectRunEntityMentionsForRuns(ctx, currentRunIds)
    );

    const trendByDay = new Map<
      string,
      {
        day: string;
        runs: PromptRunDoc[];
      }
    >();
    for (const run of currentSuccessfulRuns) {
      const day = seriesDateKey(run.startedAt);
      const entry = trendByDay.get(day);
      if (entry) {
        entry.runs.push(run);
      } else {
        trendByDay.set(day, { day, runs: [run] });
      }
    }

    const trendSeries = [...trendByDay.values()]
      .map((entry) => {
        const metrics = summarizeRunMetrics(entry.runs);
        return {
          day: entry.day,
          visibility: metrics.visibility,
          citationQuality: metrics.citationQuality,
          averagePosition: metrics.position,
          runCount: metrics.runCount,
        };
      })
      .sort((a, b) => a.day.localeCompare(b.day));

    const modelSet = new Set<string>([
      ...currentSuccessfulRuns.map((run) => run.model),
      ...previousSuccessfulRuns.map((run) => run.model),
    ]);
    const modelComparison = [...modelSet]
      .map((model) => {
        const modelCurrent = currentSuccessfulRuns.filter(
          (run) => run.model === model
        );
        const modelPrevious = previousSuccessfulRuns.filter(
          (run) => run.model === model
        );
        const modelCurrentMetrics = summarizeRunMetrics(modelCurrent);
        const modelPreviousMetrics = summarizeRunMetrics(modelPrevious);
        return {
          model,
          runCount: modelCurrentMetrics.runCount,
          visibility: modelCurrentMetrics.visibility,
          citationQuality: modelCurrentMetrics.citationQuality,
          averagePosition: modelCurrentMetrics.position,
          deltaVisibility:
            modelCurrentMetrics.visibility !== undefined &&
            modelPreviousMetrics.visibility !== undefined
              ? modelCurrentMetrics.visibility - modelPreviousMetrics.visibility
              : undefined,
          deltaCitationQuality:
            modelCurrentMetrics.citationQuality !== undefined &&
            modelPreviousMetrics.citationQuality !== undefined
              ? modelCurrentMetrics.citationQuality -
                modelPreviousMetrics.citationQuality
              : undefined,
          deltaPosition:
            modelCurrentMetrics.position !== undefined &&
            modelPreviousMetrics.position !== undefined
              ? modelCurrentMetrics.position - modelPreviousMetrics.position
              : undefined,
        };
      })
      .sort((a, b) => b.runCount - a.runCount);

    const sourceMap = new Map<string, CitationDoc[]>();
    const typeMap = new Map<CitationDoc["type"], number>();
    for (const citation of currentCitations) {
      const domainCitations = sourceMap.get(citation.domain);
      if (domainCitations) {
        domainCitations.push(citation);
      } else {
        sourceMap.set(citation.domain, [citation]);
      }
      typeMap.set(citation.type, (typeMap.get(citation.type) ?? 0) + 1);
    }

    const topSources = [...sourceMap.entries()]
      .map(([domain, domainCitations]) => {
        const qualityValues = domainCitations
          .map((citation) => citation.qualityScore)
          .filter((value): value is number => typeof value === "number");
        const positionValues = domainCitations.map(
          (citation) => citation.position
        );
        return {
          domain,
          type: domainTypeMode(domainCitations),
          citations: domainCitations.length,
          share: totalCitations
            ? (toPercent(domainCitations.length / totalCitations) ?? 0)
            : 0,
          avgQualityScore: average(qualityValues),
          avgPosition: average(positionValues),
        };
      })
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 12);

    const domainTypeBreakdown = [...typeMap.entries()]
      .map(([type, count]) => ({
        type,
        citations: count,
        share: totalCitations ? (toPercent(count / totalCitations) ?? 0) : 0,
      }))
      .sort((a, b) => b.citations - a.citations);

    const promptComparison = prompts
      .map((prompt) => {
        const promptRuns = currentSuccessfulRuns
          .filter((run) => run.promptId === prompt._id)
          .sort((left, right) => right.startedAt - left.startedAt);
        if (!promptRuns.length) {
          return null;
        }
        const promptCitations = promptRuns.flatMap(
          (run) => currentCitationsByRun.get(run._id) ?? []
        );
        const mentions = promptRuns.flatMap(
          (run) => mentionsByRun.get(run._id) ?? []
        );
        const latestRun = promptRuns[0];
        return {
          promptId: prompt._id,
          name: prompt.name,
          responseCount: promptRuns.length,
          latestStatus: latestRun.status,
          latestResponseSummary:
            latestRun.responseSummary ?? latestRun.responseText ?? "",
          sourceDiversity: uniqueStrings(
            promptCitations.map((citation) => citation.domain)
          ).length,
          responseDrift: computeResponseDrift(
            promptRuns.map((run) => run.responseText ?? run.responseSummary)
          ),
          topEntity: mentions[0]?.name,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.responseCount - left.responseCount)
      .slice(0, 8);

    const entityLeaderboardMap = new Map<
      string,
      {
        entityId?: Id<"trackedEntities">;
        name: string;
        kind: TrackedEntityDoc["kind"];
        mentionCount: number;
        responseIds: Set<Id<"promptRuns">>;
        citationCount: number;
      }
    >();
    for (const run of currentSuccessfulRuns) {
      const mentions = mentionsByRun.get(run._id) ?? [];
      for (const mention of mentions) {
        const key = mention.trackedEntityId
          ? String(mention.trackedEntityId)
          : `${mention.slug}:${mention.name}`;
        const existing = entityLeaderboardMap.get(key);
        if (existing) {
          existing.mentionCount += mention.mentionCount;
          existing.citationCount += mention.citationCount;
          existing.responseIds.add(run._id);
        } else {
          entityLeaderboardMap.set(key, {
            entityId: mention.trackedEntityId,
            name: mention.name,
            kind: mention.kind,
            mentionCount: mention.mentionCount,
            responseIds: new Set([run._id]),
            citationCount: mention.citationCount,
          });
        }
      }
    }

    const entityLeaderboard = [...entityLeaderboardMap.values()]
      .map((entry) => ({
        entityId: entry.entityId,
        name: entry.name,
        kind: entry.kind,
        mentionCount: entry.mentionCount,
        responseCount: entry.responseIds.size,
        citationCount: entry.citationCount,
      }))
      .sort(
        (left, right) =>
          right.mentionCount - left.mentionCount ||
          right.citationCount - left.citationCount
      )
      .slice(0, 8);

    return {
      kpis: {
        rangeDays,
        totalRuns: currentRuns.length,
        totalCitations,
        visibility: currentMetrics.visibility,
        citationQuality: currentMetrics.citationQuality,
        averageCitationPosition: currentMetrics.position,
        runSuccessRate: currentRuns.length
          ? toPercent(currentSuccessfulRuns.length / currentRuns.length)
          : 0,
        deltaVisibility:
          currentMetrics.visibility !== undefined &&
          previousMetrics.visibility !== undefined
            ? currentMetrics.visibility - previousMetrics.visibility
            : undefined,
        deltaCitationQuality:
          currentMetrics.citationQuality !== undefined &&
          previousMetrics.citationQuality !== undefined
            ? currentMetrics.citationQuality - previousMetrics.citationQuality
            : undefined,
      },
      trendSeries,
      modelComparison,
      promptComparison,
      topSources,
      domainTypeBreakdown,
      entityLeaderboard,
      recentRuns: currentRuns.slice(0, 8).map((run) => ({
        _id: run._id,
        startedAt: run.startedAt,
      })),
    };
  },
});
