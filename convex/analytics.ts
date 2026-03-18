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
  return status === "success" || status === "failed";
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
      ctx.db.query("citations").withIndex("promptRunId", (q) => q.eq("promptRunId", runId)).collect()
    )
  );
  return grouped.flat();
}

function getReferenceTimeFromRuns(runs: PromptRunDoc[]): number {
  if (!runs.length) {
    return 0;
  }
  return Math.max(...runs.map((run) => run.startedAt));
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

function normalizeCitationQualityScore(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value <= 1 ? value * 100 : value;
}

function inferOwnedFromKind(kind: TrackedEntityDoc["kind"]): boolean {
  return kind === "brand" || kind === "product" || kind === "feature";
}

async function assertPromptIdsOwned(
  ctx: MutationCtx | QueryCtx,
  userId: UserId,
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
      if (prompt.userId !== userId) {
        throw new Error("User not authorized for one or more prompts");
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

async function deletePromptJobCron(ctx: MutationCtx, cronId: string | undefined) {
  if (!cronId) {
    return;
  }
  await crons.delete(ctx, { id: cronId });
}

async function enqueuePromptRunDocs(
  ctx: MutationCtx,
  userId: UserId,
  prompts: PromptDoc[],
  label: string
): Promise<number> {
  const startedAt = Date.now();
  await Promise.all(
    prompts.map((prompt) =>
      ctx.db.insert("promptRuns", {
        userId,
        promptId: prompt._id,
        model: prompt.targetModel,
        status: "queued",
        startedAt,
        runLabel: label,
      })
    )
  );
  return prompts.length;
}

async function assertPromptOwnership(
  ctx: MutationCtx | QueryCtx,
  userId: UserId,
  promptId: Id<"prompts">
): Promise<Doc<"prompts">> {
  const prompt = await ctx.db.get(promptId);
  if (prompt == null) {
    throw new Error("Prompt not found");
  }
  if (prompt.userId !== userId) {
    throw new Error("User not authorized for this prompt");
  }
  return prompt;
}

export const createPromptGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("promptGroups", {
      userId,
      name: args.name.trim(),
      description: args.description?.trim(),
      color: args.color?.trim(),
      sortOrder: args.sortOrder ?? 0,
    });
  },
});

export const listPromptGroups = query({
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("promptGroups")
      .withIndex("userId_sortOrder", (q) => q.eq("userId", userId))
      .collect();
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
    const userId = await requireUserId(ctx);
    const group = await ctx.db.get(args.id);
    if (group == null) {
      throw new Error("Prompt group not found");
    }
    if (group.userId !== userId) {
      throw new Error("User not authorized to update this prompt group");
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
    const userId = await requireUserId(ctx);
    const group = await ctx.db.get(args.id);
    if (group == null) {
      throw new Error("Prompt group not found");
    }
    if (group.userId !== userId) {
      throw new Error("User not authorized to delete this prompt group");
    }

    const prompts = await ctx.db
      .query("prompts")
      .withIndex("userId_groupId", (q) => q.eq("userId", userId).eq("groupId", args.id))
      .collect();
    await Promise.all(prompts.map((prompt) => ctx.db.patch(prompt._id, { groupId: undefined })));
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
    const userId = await requireUserId(ctx);
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (group == null || group.userId !== userId) {
        throw new Error("Invalid prompt group");
      }
    }
    return await ctx.db.insert("prompts", {
      userId,
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
    const userId = await requireUserId(ctx);
    let prompts: Doc<"prompts">[];

    if (args.groupId) {
      prompts = await ctx.db
        .query("prompts")
        .withIndex("userId_groupId", (q) =>
          q.eq("userId", userId).eq("groupId", args.groupId)
        )
        .collect();
    } else {
      prompts = await ctx.db
        .query("prompts")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect();
    }

    if (args.active !== undefined) {
      prompts = prompts.filter((prompt) => prompt.active === args.active);
    }
    return prompts.sort((a, b) => a.name.localeCompare(b.name));
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
    const userId = await requireUserId(ctx);
    const prompt = await ctx.db.get(args.id);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }
    if (prompt.userId !== userId) {
      throw new Error("User not authorized to update this prompt");
    }

    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (group == null || group.userId !== userId) {
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
        tags: args.tags?.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
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
    const userId = await requireUserId(ctx);
    const prompt = await ctx.db.get(args.id);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }
    if (prompt.userId !== userId) {
      throw new Error("User not authorized to delete this prompt");
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
        await Promise.all(citations.map((citation) => ctx.db.delete(citation._id)));
        await ctx.db.delete(run._id);
      })
    );

    const promptJobs = await ctx.db
      .query("promptJobs")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(
      promptJobs
        .filter((job) => job.promptIds.includes(args.id))
        .map(async (job) => {
          const nextPromptIds = job.promptIds.filter((promptId) => promptId !== args.id);
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
    const userId = await requireUserId(ctx);
    const prompts = await assertPromptIdsOwned(ctx, userId, args.promptIds);
    const now = Date.now();
    const enabled = args.enabled ?? true;
    const promptIds = prompts.map((prompt) => prompt._id);
    const schedule = args.schedule?.trim() || undefined;

    const jobId = await ctx.db.insert("promptJobs", {
      userId,
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
    const userId = await requireUserId(ctx);
    const [jobs, prompts] = await Promise.all([
      ctx.db.query("promptJobs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("prompts").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
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
      args.schedule !== undefined ? args.schedule.trim() || undefined : job.schedule;
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
    const validPrompts = prompts.filter((prompt): prompt is PromptDoc => prompt !== null);
    if (!validPrompts.length) {
      await ctx.db.patch(args.jobId, {
        lastTriggeredAt: Date.now(),
        lastQueuedCount: 0,
        updatedAt: Date.now(),
      });
      return { queuedCount: 0 };
    }
    const queuedCount = await enqueuePromptRunDocs(
      ctx,
      validPrompts,
      job.name
    );
    await ctx.db.patch(args.jobId, {
      lastTriggeredAt: Date.now(),
      lastQueuedCount: queuedCount,
      updatedAt: Date.now(),
    });
    return { queuedCount };
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

    return await ctx.db.insert("trackedEntities", {
      name: args.name.trim(),
      slug,
      kind: args.kind,
      aliases: args.aliases?.map((alias) => alias.trim()).filter((alias) => alias.length > 0),
      ownedDomains: args.ownedDomains
        ?.map((domain) => normalizeDomain(domain))
        .filter((domain) => domain.length > 0),
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
    let entities = await ctx.db
      .query("trackedEntities")
      .collect();
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

    await ctx.db.patch(
      args.id,
      compactPatch({
        name: args.name?.trim(),
        slug: nextSlug,
        kind: args.kind,
        aliases: args.aliases?.map((alias) => alias.trim()).filter((alias) => alias.length > 0),
        ownedDomains: args.ownedDomains
          ?.map((domain) => normalizeDomain(domain))
          .filter((domain) => domain.length > 0),
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
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const ingestPromptRun = mutation({
  args: {
    promptId: v.id("prompts"),
    model: v.string(),
    status: vRunStatus,
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

    const trackedEntities = await ctx.db
      .query("trackedEntities")
      .collect();
    const trackedEntityById = new Map(trackedEntities.map((entity) => [entity._id, entity]));
    const trackedEntityByDomain = new Map<string, TrackedEntityDoc>();
    for (const entity of trackedEntities) {
      for (const domain of entity.ownedDomains ?? []) {
        trackedEntityByDomain.set(normalizeDomain(domain), entity);
      }
    }

    const citationInputs = (args.citations ?? []).map((citation) => ({
      ...citation,
      qualityScore: normalizeCitationQualityScore(citation.qualityScore),
    }));
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

    const runId = await ctx.db.insert("promptRuns", {
      promptId: args.promptId,
      model: args.model.trim(),
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      latencyMs: args.latencyMs,
      responseText: args.responseText,
      responseSummary: args.responseSummary,
      visibilityScore: args.visibilityScore ?? derivedVisibility,
      citationQualityScore: args.citationQualityScore ?? derivedCitationQuality,
      averageCitationPosition: args.averageCitationPosition ?? derivedAveragePosition,
      runLabel: args.runLabel,
      sourceCount:
        args.sourceCount ??
        new Set(citationInputs.map((citation) => normalizeDomain(citation.domain))).size,
    });

    await Promise.all(
      citationInputs.map(async (citation) => {
        const normalizedDomain = normalizeDomain(citation.domain);
        let trackedEntityId = citation.trackedEntityId;
        if (trackedEntityId && !trackedEntityById.has(trackedEntityId)) {
          trackedEntityId = undefined;
        }
        const matchedEntity =
          (trackedEntityId ? trackedEntityById.get(trackedEntityId) : undefined) ??
          trackedEntityByDomain.get(normalizedDomain);
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
          isOwned,
        });
      })
    );

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
        .withIndex("promptId_startedAt", (q) => q.eq("promptId", args.promptId!))
        .order("desc")
        .take(limit * 3);
    } else {
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("startedAt")
        .order("desc")
        .take(limit * 3);
    }

    if (args.model) {
      runs = runs.filter((run) => run.model === args.model);
    }
    if (args.status) {
      runs = runs.filter((run) => run.status === args.status);
    }
    runs = runs.slice(0, limit);

    const prompts = await ctx.db
      .query("prompts")
      .collect();
    const promptNameById = new Map(prompts.map((prompt) => [prompt._id, prompt.name]));

    const citationCounts = await Promise.all(
      runs.map(async (run) => {
        const citations = await ctx.db
          .query("citations")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
          .collect();
        return { runId: run._id, count: citations.length };
      })
    );
    const citationCountByRun = new Map(citationCounts.map((item) => [item.runId, item.count]));

    return runs.map((run) => ({
      ...run,
      promptName: promptNameById.get(run.promptId) ?? "Unknown prompt",
      citationCount: citationCountByRun.get(run._id) ?? 0,
    }));
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
    const citations = await ctx.db
      .query("citations")
      .withIndex("promptRunId", (q) => q.eq("promptRunId", args.id))
      .collect();
    const trackedEntityIds = citations
      .map((citation) => citation.trackedEntityId)
      .filter((id): id is Id<"trackedEntities"> => id !== undefined);
    const trackedEntities = await Promise.all(
      trackedEntityIds.map(async (id) => {
        const entity = await ctx.db.get(id);
        return entity != null ? { id: entity._id, name: entity.name, slug: entity.slug } : null;
      })
    );
    const trackedEntityById = new Map(
      trackedEntities
        .filter((entity): entity is { id: Id<"trackedEntities">; name: string; slug: string } => entity !== null)
        .map((entity) => [entity.id, entity])
    );

    return {
      run,
      prompt,
      citations: citations.map((citation) => ({
        ...citation,
        trackedEntity:
          citation.trackedEntityId != null
            ? trackedEntityById.get(citation.trackedEntityId) ?? null
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
    const runs = await ctx.db
      .query("promptRuns")
      .withIndex("startedAt")
      .order("desc")
      .take(600);

    const referenceTime = getReferenceTimeFromRuns(runs);
    const rangeMs = (args.rangeDays ?? 30) * 24 * 60 * 60 * 1000;
    const rangeStart = referenceTime - rangeMs;

    const selectedRuns = runs.filter((run) => {
      if (run.startedAt < rangeStart) {
        return false;
      }
      if (args.model && run.model !== args.model) {
        return false;
      }
      if (!isTerminalRunStatus(run.status)) {
        return false;
      }
      return true;
    });

    const runIds = selectedRuns.map((run) => run._id);
    let citations = await collectCitationsForRuns(ctx, runIds);
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
        const positionValues = entry.citations.map((citation) => citation.position);
        const qualityValues = entry.citations
          .map((citation) => citation.qualityScore)
          .filter((value): value is number => typeof value === "number");
        const ownedCitations = entry.citations.filter((citation) => citation.isOwned).length;
        return {
          domain: entry.domain,
          type: domainTypeMode(entry.citations),
          citations: entry.citations.length,
          usedShare: totalCitations ? toPercent(entry.citations.length / totalCitations) ?? 0 : 0,
          avgCitationsPerRun: totalRuns
            ? Math.round((entry.citations.length / totalRuns) * 100) / 100
            : 0,
          avgQualityScore: average(qualityValues),
          avgPosition: average(positionValues),
          ownedShare: entry.citations.length
            ? toPercent(ownedCitations / entry.citations.length) ?? 0
            : 0,
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
        share: totalCitations ? toPercent(count / totalCitations) ?? 0 : 0,
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

    const runs = await ctx.db
      .query("promptRuns")
      .withIndex("startedAt")
      .order("desc")
      .take(800);
    const referenceTime = getReferenceTimeFromRuns(runs);
    const currentStart = referenceTime - rangeMs;
    const previousStart = referenceTime - rangeMs * 2;

    const filteredRuns = runs.filter(
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

    const currentMetrics = summarizeRunMetrics(currentRuns);
    const previousMetrics = summarizeRunMetrics(previousRuns);
    const currentRunIds = currentRuns.map((run) => run._id);
    const currentCitations = await collectCitationsForRuns(ctx, currentRunIds);
    const totalCitations = currentCitations.length;

    const trendByDay = new Map<
      string,
      {
        day: string;
        runs: PromptRunDoc[];
      }
    >();
    for (const run of currentRuns) {
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
      ...currentRuns.map((run) => run.model),
      ...previousRuns.map((run) => run.model),
    ]);
    const modelComparison = [...modelSet]
      .map((model) => {
        const modelCurrent = currentRuns.filter((run) => run.model === model);
        const modelPrevious = previousRuns.filter((run) => run.model === model);
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
              ? modelCurrentMetrics.citationQuality - modelPreviousMetrics.citationQuality
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
        const positionValues = domainCitations.map((citation) => citation.position);
        return {
          domain,
          type: domainTypeMode(domainCitations),
          citations: domainCitations.length,
          share: totalCitations ? toPercent(domainCitations.length / totalCitations) ?? 0 : 0,
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
        share: totalCitations ? toPercent(count / totalCitations) ?? 0 : 0,
      }))
      .sort((a, b) => b.citations - a.citations);

    return {
      kpis: {
        rangeDays,
        totalRuns: currentMetrics.runCount,
        totalCitations,
        visibility: currentMetrics.visibility,
        citationQuality: currentMetrics.citationQuality,
        averageCitationPosition: currentMetrics.position,
        runSuccessRate: currentMetrics.runCount
          ? toPercent(
              currentRuns.filter((run) => run.status === "success").length /
                currentMetrics.runCount
            )
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
      topSources,
      domainTypeBreakdown,
      recentRuns: currentRuns.slice(0, 8),
    };
  },
});
