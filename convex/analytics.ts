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
import { derivePromptExcerpt } from "../src/lib/prompting";

const vRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("blocked"),
  v.literal("success"),
  v.literal("failed")
);

const vBrowserEngine = v.union(
  v.literal("playwright"),
  v.literal("camoufox"),
  v.literal("nodriver")
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

const vMentionSentiment = v.union(
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("negative"),
  v.literal("mixed")
);

const vMentionAnalysisStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failed")
);

const vPromptIntentCategory = v.union(
  v.literal("category_discovery"),
  v.literal("brand_factual"),
  v.literal("recommendation"),
  v.literal("comparison"),
  v.literal("alternative"),
  v.literal("problem_solution"),
  v.literal("how_to"),
  v.literal("pricing_buying"),
  v.literal("review_reputation"),
  v.literal("risk_objection"),
  v.literal("citation_source"),
  v.literal("content_gap"),
  v.literal("uncategorized")
);

const vPromptSentimentLens = v.union(
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("negative"),
  v.literal("comparative"),
  v.literal("mixed")
);

const vPromptFunnelStage = v.union(
  v.literal("awareness"),
  v.literal("consideration"),
  v.literal("decision"),
  v.literal("retention")
);

const vPromptPriority = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low")
);

const vPromptReviewState = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("archived")
);

const vPromptGeneratedBy = v.union(
  v.literal("manual"),
  v.literal("codex"),
  v.literal("import")
);

const vPromptGenerationStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failed")
);

type PromptDoc = Doc<"prompts">;
type PromptGroupDoc = Doc<"promptGroups">;
type ProviderDoc = Doc<"providers">;
type PromptRunDoc = Doc<"promptRuns">;
type CitationDoc = Doc<"citations">;
type TrackedEntityDoc = Doc<"trackedEntities">;
type RunEntityMentionDoc = Doc<"runEntityMentions">;
type PatchObject = Record<string, unknown>;
type BrowserEngine = "playwright" | "camoufox" | "nodriver";
type PromptIntentCategory = NonNullable<PromptDoc["intentCategory"]>;
type PromptSentimentLens = NonNullable<PromptDoc["sentimentLens"]>;
type PromptReviewState = NonNullable<PromptDoc["reviewState"]>;
type PromptGeneratedBy = NonNullable<PromptDoc["generatedBy"]>;

const crons = new Crons(components.crons);
const RUNNABLE_PROVIDER_SLUGS = new Set([
  "openai",
  "google-ai-mode",
  "mistral",
]);

const DEFAULT_PROVIDER_DEFINITIONS = [
  {
    slug: "openai",
    name: "OpenAI",
    url: "https://chatgpt.com/",
    channelSlug: "openai-chatgpt-web",
    channelName: "ChatGPT web",
    transport: "browser",
    sessionMode: "stored",
    sessionProfileDir: "runner/profiles/chatgpt-chrome",
    promptQueryParam: undefined,
    submitStrategy: "type",
    active: true,
  },
  {
    slug: "google-ai-mode",
    name: "Google AI Mode",
    url: "https://www.google.com/search?udm=50",
    channelSlug: "google-ai-mode-web",
    channelName: "Google AI Mode web",
    transport: "browser",
    sessionMode: "guest",
    sessionProfileDir: undefined,
    promptQueryParam: "q",
    submitStrategy: "deeplink",
    active: true,
  },
  {
    slug: "claude",
    name: "Claude",
    url: "https://claude.ai/",
    channelSlug: "claude-web",
    channelName: "Claude web",
    transport: "browser",
    sessionMode: "guest",
    sessionProfileDir: undefined,
    promptQueryParam: undefined,
    submitStrategy: "type",
    active: false,
  },
  {
    slug: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/",
    channelSlug: "gemini-web",
    channelName: "Gemini web",
    transport: "browser",
    sessionMode: "guest",
    sessionProfileDir: undefined,
    promptQueryParam: undefined,
    submitStrategy: "type",
    active: false,
  },
  {
    slug: "mistral",
    name: "Mistral Le Chat",
    url: "https://chat.mistral.ai/chat",
    channelSlug: "mistral-web",
    channelName: "Mistral Le Chat web",
    transport: "browser",
    sessionMode: "guest",
    sessionProfileDir: undefined,
    promptQueryParam: undefined,
    submitStrategy: "type",
    active: true,
  },
] as const;

const DEFAULT_PROMPT_INTENT_CATEGORY: PromptIntentCategory = "uncategorized";
const DEFAULT_PROMPT_SENTIMENT_LENS: PromptSentimentLens = "neutral";
const DEFAULT_PROMPT_REVIEW_STATE: PromptReviewState = "approved";
const DEFAULT_PROMPT_GENERATED_BY: PromptGeneratedBy = "manual";

function compactPatch<T extends PatchObject>(patch: T): PatchObject {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
}

function sortByName(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name);
}

function promptExcerptFor(prompt: Pick<PromptDoc, "promptText">): string {
  return derivePromptExcerpt(prompt.promptText);
}

function defaultProviderDefinitionFor(slug: string | undefined) {
  if (!slug) {
    return undefined;
  }
  return DEFAULT_PROVIDER_DEFINITIONS.find((item) => item.slug === slug);
}

function normalizeOptionalString(input: string | null | undefined) {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  const trimmed = input.trim();
  return trimmed || null;
}

function normalizeSourceUrls(input: string[] | null | undefined) {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  const urls = uniqueStrings(input).slice(0, 20);
  return urls.length ? urls : null;
}

function setOptionalPatchValue(
  patch: PatchObject,
  key: string,
  value: unknown
) {
  if (value === undefined) {
    return;
  }
  patch[key] = value === null ? undefined : value;
}

function promptIntentCategoryFor(prompt: PromptDoc): PromptIntentCategory {
  return prompt.intentCategory ?? DEFAULT_PROMPT_INTENT_CATEGORY;
}

function promptSentimentLensFor(prompt: PromptDoc): PromptSentimentLens {
  return prompt.sentimentLens ?? DEFAULT_PROMPT_SENTIMENT_LENS;
}

function promptReviewStateFor(prompt: PromptDoc): PromptReviewState {
  return prompt.reviewState ?? DEFAULT_PROMPT_REVIEW_STATE;
}

function promptGeneratedByFor(prompt: PromptDoc): PromptGeneratedBy {
  return prompt.generatedBy ?? DEFAULT_PROMPT_GENERATED_BY;
}

function promptMetadataFor(
  prompt: PromptDoc,
  promptGroup?: PromptGroupDoc | null,
  entity?: TrackedEntityDoc | null
) {
  return {
    entityId: prompt.entityId,
    entityName: entity?.name,
    entitySlug: entity?.slug,
    promptGroupId: prompt.promptGroupId,
    promptGroupName: promptGroup?.name,
    promptGroupSlug: promptGroup?.slug,
    intentCategory: promptIntentCategoryFor(prompt),
    sentimentLens: promptSentimentLensFor(prompt),
    funnelStage: prompt.funnelStage,
    audience: prompt.audience,
    topic: prompt.topic,
    priority: prompt.priority,
    reviewState: promptReviewStateFor(prompt),
    generatedBy: promptGeneratedByFor(prompt),
    generationRationale: prompt.generationRationale,
    sourceUrls: prompt.sourceUrls ?? [],
  };
}

function promptRunSnapshotFor(
  prompt: PromptDoc,
  promptGroup?: PromptGroupDoc | null
) {
  return {
    entityId: prompt.entityId,
    promptGroupId: prompt.promptGroupId,
    promptGroupName: promptGroup?.name,
    intentCategory: promptIntentCategoryFor(prompt),
    sentimentLens: promptSentimentLensFor(prompt),
    funnelStage: prompt.funnelStage,
    audience: prompt.audience,
    topic: prompt.topic,
    priority: prompt.priority,
    reviewState: promptReviewStateFor(prompt),
  };
}

function normalizePromptTextForDedup(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function promptReplacementWithPatch(prompt: PromptDoc, patch: PatchObject) {
  const replacement: PatchObject = {
    promptText: prompt.promptText,
    active: prompt.active,
  };
  const optionalKeys: Array<keyof PromptDoc> = [
    "entityId",
    "promptGroupId",
    "intentCategory",
    "sentimentLens",
    "funnelStage",
    "audience",
    "topic",
    "priority",
    "reviewState",
    "generatedBy",
    "generationRationale",
    "sourceUrls",
    "sourceGenerationId",
    "createdAt",
    "updatedAt",
  ];
  for (const key of optionalKeys) {
    const value = prompt[key];
    if (value !== undefined) {
      replacement[key] = value;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete replacement[key];
    } else {
      replacement[key] = value;
    }
  }
  return replacement as Omit<PromptDoc, "_id" | "_creationTime">;
}

function excerptForPromptRun(run: PromptRunDoc, prompt: PromptDoc): string {
  return run.promptExcerpt ?? promptExcerptFor(prompt);
}

async function getProviderDocForRun(
  ctx: MutationCtx,
  run: PromptRunDoc
): Promise<ProviderDoc | null> {
  if (run.providerId) {
    const byId = await ctx.db.get(run.providerId);
    if (byId) {
      return byId;
    }
  }
  const providers = await ensureDefaultProviders(ctx);
  if (run.providerSlug) {
    const matched = providers.find((p) => p.slug === run.providerSlug);
    if (matched) {
      return matched;
    }
  }
  return providers.find((p) => p.slug === "openai") ?? providers[0] ?? null;
}

function providerSnapshot(provider: ProviderDoc) {
  const defaults = defaultProviderDefinitionFor(provider.slug);
  return {
    providerId: provider._id,
    providerSlug: provider.slug,
    providerName: provider.name,
    providerUrl: provider.url,
    channelSlug:
      provider.channelSlug ?? defaults?.channelSlug ?? `${provider.slug}-web`,
    channelName:
      provider.channelName ?? defaults?.channelName ?? `${provider.name} web`,
    transport: provider.transport ?? "browser",
    sessionMode: provider.sessionMode ?? defaults?.sessionMode ?? "guest",
    sessionProfileDir:
      provider.sessionProfileDir ?? defaults?.sessionProfileDir,
    promptQueryParam: provider.promptQueryParam ?? defaults?.promptQueryParam,
    submitStrategy:
      provider.submitStrategy ?? defaults?.submitStrategy ?? "type",
  };
}

function runnerNameMatchesEngine(
  runner: string | undefined,
  browserEngine: BrowserEngine
) {
  return runner?.includes(browserEngine) ?? false;
}

function runMatchesWorkerEngine(
  run: Pick<PromptRunDoc, "browserEngine" | "runner">,
  browserEngine: BrowserEngine | undefined
) {
  if (!browserEngine) {
    return true;
  }
  if (run.browserEngine) {
    return run.browserEngine === browserEngine;
  }
  return !run.runner || runnerNameMatchesEngine(run.runner, browserEngine);
}

function runGroupKey(run: Pick<PromptRunDoc, "_id" | "runGroupId">): string {
  return run.runGroupId ?? String(run._id);
}

function runQueuedAt(
  run: Pick<PromptRunDoc, "queuedAt" | "runGroupQueuedAt" | "startedAt">
): number {
  return run.runGroupQueuedAt ?? run.queuedAt ?? run.startedAt;
}

function promptExcerptForRun(
  run: Pick<PromptRunDoc, "promptExcerpt" | "runLabel">,
  prompt?: Pick<PromptDoc, "promptText"> | null
): string {
  return (
    run.promptExcerpt?.trim() ||
    (prompt ? promptExcerptFor(prompt) : undefined) ||
    run.runLabel?.trim() ||
    "(deleted prompt)"
  );
}

function providerSlugForRun(
  run: Pick<PromptRunDoc, "providerSlug" | "channelSlug" | "providerName">
): string {
  return (
    run.providerSlug?.trim() ||
    run.channelSlug?.trim() ||
    (run.providerName ? sanitizeSlug(run.providerName) : undefined) ||
    "unknown-provider"
  );
}

function providerNameForRun(
  run: Pick<PromptRunDoc, "providerName" | "providerSlug" | "channelName">
): string {
  return (
    run.providerName?.trim() ||
    run.channelName?.trim() ||
    run.providerSlug?.trim() ||
    "Unknown provider"
  );
}

function providerUrlForRun(run: Pick<PromptRunDoc, "providerUrl">): string {
  return run.providerUrl?.trim() || "";
}

function summarizeRunGroupStatus(runs: PromptRunDoc[]): PromptRunDoc["status"] {
  if (runs.some((run) => run.status === "running")) {
    return "running";
  }
  if (runs.some((run) => run.status === "queued")) {
    return "queued";
  }
  if (runs.every((run) => run.status === "success")) {
    return "success";
  }
  if (runs.some((run) => run.status === "failed")) {
    return "failed";
  }
  if (runs.some((run) => run.status === "blocked")) {
    return "blocked";
  }
  return runs[0]?.status ?? "queued";
}

function latestRunStartedAt(runs: PromptRunDoc[]): number {
  return Math.max(...runs.map((run) => run.startedAt));
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

async function listProviderDocs(ctx: MutationCtx | QueryCtx) {
  const providers = await ctx.db.query("providers").collect();
  return providers.sort(sortByName);
}

async function ensureDefaultProviders(
  ctx: MutationCtx
): Promise<ProviderDoc[]> {
  const existingProviders = await ctx.db.query("providers").collect();
  const providerBySlug = new Map(
    existingProviders.map((provider) => [provider.slug, provider])
  );

  for (const definition of DEFAULT_PROVIDER_DEFINITIONS) {
    const existing = providerBySlug.get(definition.slug);
    if (existing) {
      const nextPatch = compactPatch({
        name: definition.name,
        url: definition.url,
        channelSlug: existing.channelSlug ?? definition.channelSlug,
        channelName: existing.channelName ?? definition.channelName,
        transport: existing.transport ?? definition.transport,
        sessionMode: existing.sessionMode ?? definition.sessionMode,
        sessionProfileDir:
          existing.sessionProfileDir ?? definition.sessionProfileDir,
        promptQueryParam:
          existing.promptQueryParam ?? definition.promptQueryParam,
        submitStrategy: existing.submitStrategy ?? definition.submitStrategy,
      });
      if (Object.keys(nextPatch).length > 0) {
        await ctx.db.patch(existing._id, nextPatch);
      }
      continue;
    }

    const id = await ctx.db.insert("providers", {
      slug: definition.slug,
      name: definition.name,
      url: definition.url,
      channelSlug: definition.channelSlug,
      channelName: definition.channelName,
      transport: definition.transport,
      sessionMode: definition.sessionMode,
      sessionProfileDir: definition.sessionProfileDir,
      promptQueryParam: definition.promptQueryParam,
      submitStrategy: definition.submitStrategy,
      sessionJson: undefined,
      active: definition.active,
    });
    providerBySlug.set(definition.slug, {
      _id: id,
      _creationTime: Date.now(),
      slug: definition.slug,
      name: definition.name,
      url: definition.url,
      channelSlug: definition.channelSlug,
      channelName: definition.channelName,
      transport: definition.transport,
      sessionMode: definition.sessionMode,
      sessionProfileDir: definition.sessionProfileDir,
      promptQueryParam: definition.promptQueryParam,
      submitStrategy: definition.submitStrategy,
      sessionJson: undefined,
      active: definition.active,
    });
  }

  return await listProviderDocs(ctx);
}

async function providerBySlugOrDefault(
  ctx: MutationCtx,
  slug: string | undefined
): Promise<ProviderDoc> {
  const requestedSlug = slug?.trim() || DEFAULT_PROVIDER_DEFINITIONS[0].slug;
  const provider = (await ensureDefaultProviders(ctx)).find(
    (item) => item.slug === requestedSlug
  );
  if (!provider) {
    throw new Error(`Provider not found: ${requestedSlug}`);
  }
  return provider;
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

async function deletePromptRunWithArtifacts(
  ctx: MutationCtx,
  runId: Id<"promptRuns">
) {
  const citations = await ctx.db
    .query("citations")
    .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
    .collect();
  const mentions = await ctx.db
    .query("runEntityMentions")
    .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
    .collect();
  const mentionAnalyses = await ctx.db
    .query("runMentionAnalyses")
    .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
    .collect();
  await Promise.all(citations.map((citation) => ctx.db.delete(citation._id)));
  await Promise.all(mentions.map((mention) => ctx.db.delete(mention._id)));
  await Promise.all(
    mentionAnalyses.map((analysis) => ctx.db.delete(analysis._id))
  );
  await ctx.db.delete(runId);
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

async function assertTrackedEntity(
  ctx: MutationCtx | QueryCtx,
  entityId: Id<"trackedEntities">
): Promise<TrackedEntityDoc> {
  const entity = await ctx.db.get(entityId);
  if (entity == null) {
    throw new Error("Tracked entity not found");
  }
  return entity;
}

async function assertPromptGroup(
  ctx: MutationCtx | QueryCtx,
  promptGroupId: Id<"promptGroups">
): Promise<PromptGroupDoc> {
  const promptGroup = await ctx.db.get(promptGroupId);
  if (promptGroup == null) {
    throw new Error("Prompt group not found");
  }
  if (!promptGroup.active) {
    throw new Error("Prompt group is archived");
  }
  return promptGroup;
}

async function resolvePromptCreateScope(
  ctx: MutationCtx,
  entityId: Id<"trackedEntities"> | undefined,
  promptGroupId: Id<"promptGroups"> | undefined
) {
  const promptGroup = promptGroupId
    ? await assertPromptGroup(ctx, promptGroupId)
    : undefined;
  let nextEntityId = entityId;

  if (nextEntityId) {
    await assertTrackedEntity(ctx, nextEntityId);
  }

  if (promptGroup?.entityId) {
    if (nextEntityId && nextEntityId !== promptGroup.entityId) {
      throw new Error("Prompt group belongs to a different entity");
    }
    nextEntityId = promptGroup.entityId;
  }

  return { entityId: nextEntityId, promptGroup };
}

async function resolvePromptUpdateScope(
  ctx: MutationCtx,
  prompt: PromptDoc,
  entityId: Id<"trackedEntities"> | null | undefined,
  promptGroupId: Id<"promptGroups"> | null | undefined
) {
  const shouldUpdateEntity = entityId !== undefined;
  const shouldUpdateGroup = promptGroupId !== undefined;
  const nextPromptGroupId = shouldUpdateGroup
    ? promptGroupId === null
      ? undefined
      : promptGroupId
    : prompt.promptGroupId;
  const promptGroup = nextPromptGroupId
    ? await assertPromptGroup(ctx, nextPromptGroupId)
    : undefined;
  let nextEntityId = shouldUpdateEntity
    ? entityId === null
      ? undefined
      : entityId
    : prompt.entityId;

  if (nextEntityId) {
    await assertTrackedEntity(ctx, nextEntityId);
  }

  if (promptGroup?.entityId) {
    if (nextEntityId && nextEntityId !== promptGroup.entityId) {
      throw new Error("Prompt group belongs to a different entity");
    }
    nextEntityId = promptGroup.entityId;
  }

  return { entityId: nextEntityId, promptGroupId: nextPromptGroupId };
}

async function findPromptGroupByEntitySlug(
  ctx: MutationCtx | QueryCtx,
  entityId: Id<"trackedEntities"> | undefined,
  slug: string
): Promise<PromptGroupDoc | null> {
  const matches = await ctx.db
    .query("promptGroups")
    .withIndex("slug", (q) => q.eq("slug", slug))
    .collect();
  return (
    matches.find((group) => group.entityId === entityId && group.active) ?? null
  );
}

async function promptGroupByIdMap(
  ctx: QueryCtx,
  groupIds: Array<Id<"promptGroups"> | undefined>
) {
  const uniqueGroupIds = [
    ...new Set(groupIds.filter((id): id is Id<"promptGroups"> => Boolean(id))),
  ];
  const groups = await Promise.all(
    uniqueGroupIds.map((groupId) => ctx.db.get(groupId))
  );
  return new Map(
    groups
      .filter((group): group is PromptGroupDoc => group !== null)
      .map((group) => [group._id, group])
  );
}

async function trackedEntityByIdMap(
  ctx: QueryCtx,
  entityIds: Array<Id<"trackedEntities"> | undefined>
) {
  const uniqueEntityIds = [
    ...new Set(
      entityIds.filter((id): id is Id<"trackedEntities"> => Boolean(id))
    ),
  ];
  const entities = await Promise.all(
    uniqueEntityIds.map((entityId) => ctx.db.get(entityId))
  );
  return new Map(
    entities
      .filter((entity): entity is TrackedEntityDoc => entity !== null)
      .map((entity) => [entity._id, entity])
  );
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
  label?: string,
  options?: {
    attempt?: number;
    retryOfRunId?: Id<"promptRuns">;
    browserEngine?: "playwright" | "camoufox" | "nodriver";
    providerSlugs?: string[];
  }
): Promise<number> {
  const queuedAt = Date.now();
  const selectedProviderSlugs = options?.providerSlugs
    ? new Set(options.providerSlugs.map((slug) => slug.trim()).filter(Boolean))
    : undefined;
  if (selectedProviderSlugs && selectedProviderSlugs.size === 0) {
    throw new Error("Select at least one provider");
  }

  const providers = await ensureDefaultProviders(ctx);
  const activeProviders = providers.filter((provider) => provider.active);
  if (!activeProviders.length) {
    throw new Error("No enabled providers available");
  }
  const queuedProviders = selectedProviderSlugs
    ? activeProviders.filter((provider) =>
        selectedProviderSlugs.has(provider.slug)
      )
    : activeProviders;
  if (
    selectedProviderSlugs &&
    queuedProviders.length !== selectedProviderSlugs.size
  ) {
    throw new Error("Selected providers must be enabled");
  }

  for (const prompt of prompts) {
    const promptExcerpt = promptExcerptFor(prompt);
    const promptGroup = prompt.promptGroupId
      ? await ctx.db.get(prompt.promptGroupId)
      : null;
    const promptSnapshot = promptRunSnapshotFor(prompt, promptGroup);
    let runGroupId: string | undefined;

    for (const provider of queuedProviders) {
      const runId = await ctx.db.insert("promptRuns", {
        runGroupId,
        runGroupQueuedAt: queuedAt,
        promptId: prompt._id,
        ...promptSnapshot,
        ...providerSnapshot(provider),
        browserEngine: options?.browserEngine,
        promptExcerpt,
        status: "queued",
        attempt: options?.attempt ?? 1,
        retryOfRunId: options?.retryOfRunId,
        queuedAt,
        startedAt: queuedAt,
        runLabel: label?.trim() || promptExcerpt,
      });

      if (!runGroupId) {
        runGroupId = String(runId);
        await ctx.db.patch(runId, { runGroupId });
      }
    }
  }
  return prompts.length * queuedProviders.length;
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
        detectionSource: "deterministic",
      })
    )
  );

  return mentions;
}

async function queueRunMentionAnalysis(
  ctx: MutationCtx,
  runId: Id<"promptRuns">,
  deterministicMentionCount: number
) {
  const existing = await ctx.db
    .query("runMentionAnalyses")
    .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
    .collect();
  const reusable = existing.find((analysis) =>
    ["queued", "running", "success"].includes(analysis.status)
  );
  if (reusable) {
    await ctx.db.patch(reusable._id, { deterministicMentionCount });
    return reusable._id;
  }

  return await ctx.db.insert("runMentionAnalyses", {
    promptRunId: runId,
    status: "queued",
    queuedAt: Date.now(),
    deterministicMentionCount,
  });
}

function normalizeMentionConfidence(value: number | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value > 1 ? value / 100 : value;
  return Math.round(clamp(normalized, 0, 1) * 1000) / 1000;
}

function mentionKeyFor(
  mention: Pick<RunEntityMentionDoc, "trackedEntityId" | "slug">
): string {
  return mention.trackedEntityId
    ? `entity:${String(mention.trackedEntityId)}`
    : `candidate:${mention.slug}`;
}

function findTrackedEntityForMention(
  trackedEntities: TrackedEntityDoc[],
  mention: {
    trackedEntityId?: Id<"trackedEntities">;
    name: string;
    slug?: string;
  }
) {
  if (mention.trackedEntityId) {
    const byId = trackedEntities.find(
      (entity) => entity._id === mention.trackedEntityId
    );
    if (byId) {
      return byId;
    }
  }

  const normalizedSlug = sanitizeSlug(mention.slug ?? mention.name);
  const normalizedName = normalizeAnalysisText(mention.name);
  return trackedEntities.find((entity) => {
    if (entity.slug === normalizedSlug) {
      return true;
    }
    const terms = getEntityTerms(entity).map(normalizeAnalysisText);
    return terms.includes(normalizedName);
  });
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

export const ensureProvidersSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const providers = await ensureDefaultProviders(ctx);
    return providers.map((provider) => ({
      _id: provider._id,
      slug: provider.slug,
      name: provider.name,
      url: provider.url,
      channelSlug: providerSnapshot(provider).channelSlug,
      channelName: providerSnapshot(provider).channelName,
      transport: providerSnapshot(provider).transport,
      sessionMode: providerSnapshot(provider).sessionMode,
      sessionProfileDir: providerSnapshot(provider).sessionProfileDir,
      promptQueryParam: providerSnapshot(provider).promptQueryParam,
      submitStrategy: providerSnapshot(provider).submitStrategy,
      sessionJson: provider.sessionJson,
      active: provider.active,
    }));
  },
});

export const listProviders = query({
  handler: async (ctx) => {
    const providers = await listProviderDocs(ctx);
    return providers.map((provider) => ({
      _id: provider._id,
      slug: provider.slug,
      name: provider.name,
      url: provider.url,
      channelSlug: providerSnapshot(provider).channelSlug,
      channelName: providerSnapshot(provider).channelName,
      transport: providerSnapshot(provider).transport,
      sessionMode: providerSnapshot(provider).sessionMode,
      sessionProfileDir: providerSnapshot(provider).sessionProfileDir,
      promptQueryParam: providerSnapshot(provider).promptQueryParam,
      submitStrategy: providerSnapshot(provider).submitStrategy,
      sessionJson: provider.sessionJson,
      active: provider.active,
    }));
  },
});

export const updateProvider = mutation({
  args: {
    id: v.id("providers"),
    active: v.optional(v.boolean()),
    url: v.optional(v.string()),
    sessionMode: v.optional(v.union(v.literal("guest"), v.literal("stored"))),
    sessionProfileDir: v.optional(v.string()),
    sessionJson: v.optional(v.string()),
    submitStrategy: v.optional(
      v.union(v.literal("type"), v.literal("deeplink"))
    ),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.id);
    if (provider == null) {
      throw new Error("Provider not found");
    }
    if (!RUNNABLE_PROVIDER_SLUGS.has(provider.slug) && args.active === true) {
      throw new Error("Provider runner is not implemented for this provider");
    }

    const url =
      args.url !== undefined ? args.url.trim() || undefined : undefined;

    const patch = compactPatch({
      active: args.active,
      url,
      sessionMode: args.sessionMode,
      sessionProfileDir: args.sessionProfileDir?.trim(),
      sessionJson: args.sessionJson?.trim(),
      submitStrategy: args.submitStrategy,
    });

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch);
    }

    return args.id;
  },
});

export const createPrompt = mutation({
  args: {
    promptText: v.string(),
    entityId: v.optional(v.id("trackedEntities")),
    promptGroupId: v.optional(v.id("promptGroups")),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    funnelStage: v.optional(vPromptFunnelStage),
    audience: v.optional(v.string()),
    topic: v.optional(v.string()),
    priority: v.optional(vPromptPriority),
    reviewState: v.optional(vPromptReviewState),
    generatedBy: v.optional(vPromptGeneratedBy),
    generationRationale: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    sourceGenerationId: v.optional(v.id("entityPromptGenerationRuns")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const promptText = args.promptText.trim();
    if (!promptText) {
      throw new Error("Prompt text is required");
    }
    const scope = await resolvePromptCreateScope(
      ctx,
      args.entityId,
      args.promptGroupId
    );
    const now = Date.now();

    return await ctx.db.insert("prompts", {
      promptText,
      entityId: scope.entityId,
      promptGroupId: args.promptGroupId,
      intentCategory: args.intentCategory ?? DEFAULT_PROMPT_INTENT_CATEGORY,
      sentimentLens: args.sentimentLens ?? DEFAULT_PROMPT_SENTIMENT_LENS,
      funnelStage: args.funnelStage,
      audience: normalizeOptionalString(args.audience) ?? undefined,
      topic: normalizeOptionalString(args.topic) ?? undefined,
      priority: args.priority,
      reviewState: args.reviewState ?? DEFAULT_PROMPT_REVIEW_STATE,
      generatedBy: args.generatedBy ?? DEFAULT_PROMPT_GENERATED_BY,
      generationRationale:
        normalizeOptionalString(args.generationRationale) ?? undefined,
      sourceUrls: normalizeSourceUrls(args.sourceUrls) ?? undefined,
      sourceGenerationId: args.sourceGenerationId,
      createdAt: now,
      updatedAt: now,
      active: args.active ?? true,
    });
  },
});

export const createPromptGroup = mutation({
  args: {
    entityId: v.optional(v.id("trackedEntities")),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    systemManaged: v.optional(v.boolean()),
    sortOrder: v.optional(v.float64()),
    sourceGenerationId: v.optional(v.id("entityPromptGenerationRuns")),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Prompt group name is required");
    }
    if (args.entityId) {
      await assertTrackedEntity(ctx, args.entityId);
    }
    const slug = sanitizeSlug(args.slug ?? name);
    if (!slug) {
      throw new Error("Prompt group slug cannot be empty");
    }
    const existing = await findPromptGroupByEntitySlug(
      ctx,
      args.entityId,
      slug
    );
    if (existing) {
      throw new Error("Prompt group already exists for this entity");
    }
    const now = Date.now();
    return await ctx.db.insert("promptGroups", {
      entityId: args.entityId,
      name,
      slug,
      description: normalizeOptionalString(args.description) ?? undefined,
      intentCategory: args.intentCategory ?? DEFAULT_PROMPT_INTENT_CATEGORY,
      sentimentLens: args.sentimentLens ?? DEFAULT_PROMPT_SENTIMENT_LENS,
      active: true,
      systemManaged: args.systemManaged ?? false,
      sortOrder: args.sortOrder,
      sourceGenerationId: args.sourceGenerationId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePromptGroup = mutation({
  args: {
    id: v.id("promptGroups"),
    entityId: v.optional(v.union(v.id("trackedEntities"), v.null())),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    systemManaged: v.optional(v.boolean()),
    sortOrder: v.optional(v.union(v.float64(), v.null())),
  },
  handler: async (ctx, args) => {
    const promptGroup = await ctx.db.get(args.id);
    if (promptGroup == null) {
      throw new Error("Prompt group not found");
    }
    const name = args.name !== undefined ? args.name.trim() : undefined;
    if (name !== undefined && !name) {
      throw new Error("Prompt group name is required");
    }
    const entityId =
      args.entityId === undefined
        ? promptGroup.entityId
        : args.entityId === null
          ? undefined
          : args.entityId;
    if (entityId) {
      await assertTrackedEntity(ctx, entityId);
    }
    const slug =
      args.slug !== undefined || name !== undefined
        ? sanitizeSlug(args.slug ?? name ?? promptGroup.slug)
        : undefined;
    if (slug !== undefined && !slug) {
      throw new Error("Prompt group slug cannot be empty");
    }
    if (slug !== undefined || args.entityId !== undefined) {
      const existing = await findPromptGroupByEntitySlug(
        ctx,
        entityId,
        slug ?? promptGroup.slug
      );
      if (existing && existing._id !== args.id) {
        throw new Error("Prompt group already exists for this entity");
      }
    }

    const patch: PatchObject = { updatedAt: Date.now() };
    setOptionalPatchValue(patch, "entityId", args.entityId);
    setOptionalPatchValue(patch, "name", name);
    setOptionalPatchValue(patch, "slug", slug);
    setOptionalPatchValue(
      patch,
      "description",
      normalizeOptionalString(args.description)
    );
    setOptionalPatchValue(patch, "intentCategory", args.intentCategory);
    setOptionalPatchValue(patch, "sentimentLens", args.sentimentLens);
    setOptionalPatchValue(patch, "systemManaged", args.systemManaged);
    setOptionalPatchValue(patch, "sortOrder", args.sortOrder);
    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const archivePromptGroup = mutation({
  args: { id: v.id("promptGroups") },
  handler: async (ctx, args) => {
    const promptGroup = await ctx.db.get(args.id);
    if (promptGroup == null) {
      throw new Error("Prompt group not found");
    }
    const now = Date.now();
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("promptGroupId", (q) => q.eq("promptGroupId", args.id))
      .collect();
    await Promise.all(
      prompts.map((prompt) =>
        ctx.db.patch(prompt._id, {
          promptGroupId: undefined,
          updatedAt: now,
        })
      )
    );
    await ctx.db.patch(args.id, {
      active: false,
      archivedAt: now,
      updatedAt: now,
    });
    return args.id;
  },
});

export const listPromptGroups = query({
  args: {
    entityId: v.optional(v.id("trackedEntities")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let groups = args.entityId
      ? await ctx.db
          .query("promptGroups")
          .withIndex("entityId", (q) => q.eq("entityId", args.entityId!))
          .collect()
      : await ctx.db.query("promptGroups").collect();
    if (args.active !== undefined) {
      groups = groups.filter((group) => group.active === args.active);
    }
    const prompts = await ctx.db.query("prompts").collect();
    const runs = await ctx.db.query("promptRuns").collect();
    const promptByGroup = new Map<Id<"promptGroups">, PromptDoc[]>();
    const runsByGroup = new Map<Id<"promptGroups">, PromptRunDoc[]>();
    for (const prompt of prompts) {
      if (prompt.promptGroupId) {
        const current = promptByGroup.get(prompt.promptGroupId) ?? [];
        current.push(prompt);
        promptByGroup.set(prompt.promptGroupId, current);
      }
    }
    for (const run of runs) {
      if (run.promptGroupId) {
        const current = runsByGroup.get(run.promptGroupId) ?? [];
        current.push(run);
        runsByGroup.set(run.promptGroupId, current);
      }
    }
    const entityMap = await trackedEntityByIdMap(
      ctx,
      groups.map((group) => group.entityId)
    );
    return groups
      .map((group) => {
        const groupPrompts = promptByGroup.get(group._id) ?? [];
        const groupRuns = runsByGroup.get(group._id) ?? [];
        const latestRun = groupRuns.sort(
          (left, right) => right.startedAt - left.startedAt
        )[0];
        const entity = group.entityId
          ? entityMap.get(group.entityId)
          : undefined;
        return {
          ...group,
          entityName: entity?.name,
          entitySlug: entity?.slug,
          promptCount: groupPrompts.length,
          approvedPromptCount: groupPrompts.filter(
            (prompt) =>
              prompt.active && promptReviewStateFor(prompt) === "approved"
          ).length,
          latestRunAt: latestRun?.startedAt,
          latestRunGroupId: latestRun ? runGroupKey(latestRun) : undefined,
        };
      })
      .sort(
        (left, right) =>
          (left.sortOrder ?? 999) - (right.sortOrder ?? 999) ||
          left.name.localeCompare(right.name)
      );
  },
});

export const queueEntityPromptGeneration = mutation({
  args: {
    entityId: v.id("trackedEntities"),
    websiteUrl: v.optional(v.string()),
    researchSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertTrackedEntity(ctx, args.entityId);
    return await ctx.db.insert("entityPromptGenerationRuns", {
      entityId: args.entityId,
      status: "queued",
      queuedAt: Date.now(),
      websiteUrl: normalizeOptionalString(args.websiteUrl) ?? undefined,
      researchSummary:
        normalizeOptionalString(args.researchSummary) ?? undefined,
    });
  },
});

export const claimNextEntityPromptGeneration = mutation({
  args: {
    runner: v.string(),
    maxConcurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxConcurrent = clamp(Math.floor(args.maxConcurrent ?? 1), 1, 10);
    const running = await ctx.db
      .query("entityPromptGenerationRuns")
      .withIndex("status_queuedAt", (q) => q.eq("status", "running"))
      .collect();
    if (running.length >= maxConcurrent) {
      return null;
    }

    const generation = await ctx.db
      .query("entityPromptGenerationRuns")
      .withIndex("status_queuedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    if (!generation) {
      return null;
    }

    const entity = await ctx.db.get(generation.entityId);
    if (!entity) {
      await ctx.db.patch(generation._id, {
        status: "failed",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        runner: args.runner.trim(),
        error: "Tracked entity not found",
      });
      return null;
    }

    await ctx.db.patch(generation._id, {
      status: "running",
      startedAt: Date.now(),
      runner: args.runner.trim(),
    });

    const [promptGroups, prompts, competitors] = await Promise.all([
      ctx.db
        .query("promptGroups")
        .withIndex("entityId", (q) => q.eq("entityId", generation.entityId))
        .collect(),
      ctx.db
        .query("prompts")
        .withIndex("entityId", (q) => q.eq("entityId", generation.entityId))
        .collect(),
      ctx.db
        .query("trackedEntities")
        .withIndex("active", (q) => q.eq("active", true))
        .collect(),
    ]);

    return {
      generationId: generation._id,
      websiteUrl: generation.websiteUrl,
      researchSummary: generation.researchSummary,
      entity: {
        id: entity._id,
        name: entity.name,
        slug: entity.slug,
        kind: entity.kind,
        aliases: entity.aliases ?? [],
        ownedDomains: entity.ownedDomains ?? [],
      },
      competitors: competitors
        .filter(
          (candidate) =>
            candidate.kind === "competitor" && candidate._id !== entity._id
        )
        .map((candidate) => ({
          id: candidate._id,
          name: candidate.name,
          slug: candidate.slug,
          aliases: candidate.aliases ?? [],
          ownedDomains: candidate.ownedDomains ?? [],
        })),
      existingPromptGroups: promptGroups
        .filter((group) => group.active)
        .map((group) => ({
          id: group._id,
          name: group.name,
          slug: group.slug,
          intentCategory: group.intentCategory,
          sentimentLens: group.sentimentLens,
          promptCount: prompts.filter(
            (prompt) => prompt.promptGroupId === group._id
          ).length,
        })),
      existingPrompts: prompts.map((prompt) => ({
        id: prompt._id,
        promptText: prompt.promptText,
        promptGroupId: prompt.promptGroupId,
        intentCategory: promptIntentCategoryFor(prompt),
        sentimentLens: promptSentimentLensFor(prompt),
        reviewState: promptReviewStateFor(prompt),
      })),
    };
  },
});

export const completeEntityPromptGeneration = mutation({
  args: {
    generationId: v.id("entityPromptGenerationRuns"),
    status: vPromptGenerationStatus,
    model: v.optional(v.string()),
    entitySummary: v.optional(v.string()),
    competitorNotes: v.optional(v.string()),
    error: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    groups: v.optional(
      v.array(
        v.object({
          name: v.string(),
          slug: v.optional(v.string()),
          description: v.optional(v.string()),
          intentCategory: vPromptIntentCategory,
          sentimentLens: vPromptSentimentLens,
          sortOrder: v.optional(v.float64()),
          prompts: v.array(
            v.object({
              promptText: v.string(),
              intentCategory: v.optional(vPromptIntentCategory),
              sentimentLens: v.optional(vPromptSentimentLens),
              funnelStage: v.optional(vPromptFunnelStage),
              audience: v.optional(v.string()),
              topic: v.optional(v.string()),
              priority: v.optional(vPromptPriority),
              rationale: v.optional(v.string()),
              sourceUrls: v.optional(v.array(v.string())),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const generation = await ctx.db.get(args.generationId);
    if (!generation) {
      throw new Error("Prompt generation run not found");
    }
    if (generation.status !== "running" && generation.status !== "queued") {
      throw new Error("Prompt generation run is already completed");
    }

    if (args.status !== "success") {
      await ctx.db.patch(args.generationId, {
        status: args.status,
        finishedAt: Date.now(),
        model: args.model?.trim(),
        error: normalizeOptionalString(args.error) ?? undefined,
        warnings: args.warnings,
      });
      return { generatedGroupCount: 0, generatedPromptCount: 0 };
    }

    const entity = await assertTrackedEntity(ctx, generation.entityId);
    const now = Date.now();
    const warnings = [...(args.warnings ?? [])];
    const existingPrompts = await ctx.db
      .query("prompts")
      .withIndex("entityId", (q) => q.eq("entityId", entity._id))
      .collect();
    const promptByNormalizedText = new Map(
      existingPrompts.map((prompt) => [
        normalizePromptTextForDedup(prompt.promptText),
        prompt,
      ])
    );
    const seenBatchPrompts = new Set<string>();
    let generatedGroupCount = 0;
    let generatedPromptCount = 0;

    for (const [groupIndex, rawGroup] of (args.groups ?? []).entries()) {
      const groupName = rawGroup.name.trim();
      if (!groupName) {
        warnings.push("Skipped a prompt group with an empty name.");
        continue;
      }
      const groupSlug = sanitizeSlug(rawGroup.slug ?? groupName);
      if (!groupSlug) {
        warnings.push(`Skipped "${groupName}" because its slug is empty.`);
        continue;
      }
      const existingGroup = await findPromptGroupByEntitySlug(
        ctx,
        entity._id,
        groupSlug
      );
      const groupPatch = {
        entityId: entity._id,
        name: groupName,
        slug: groupSlug,
        description: normalizeOptionalString(rawGroup.description) ?? undefined,
        intentCategory: rawGroup.intentCategory,
        sentimentLens: rawGroup.sentimentLens,
        active: true,
        systemManaged: true,
        sortOrder: rawGroup.sortOrder ?? groupIndex,
        sourceGenerationId: args.generationId,
        updatedAt: now,
      };
      const promptGroupId = existingGroup
        ? existingGroup._id
        : await ctx.db.insert("promptGroups", {
            ...groupPatch,
            createdAt: now,
          });
      if (existingGroup) {
        await ctx.db.patch(existingGroup._id, groupPatch);
      } else {
        generatedGroupCount += 1;
      }

      for (const rawPrompt of rawGroup.prompts) {
        const promptText = rawPrompt.promptText.trim();
        if (!promptText) {
          warnings.push(`Skipped an empty prompt in "${groupName}".`);
          continue;
        }
        const normalizedPrompt = normalizePromptTextForDedup(promptText);
        if (seenBatchPrompts.has(normalizedPrompt)) {
          continue;
        }
        seenBatchPrompts.add(normalizedPrompt);

        const existingPrompt = promptByNormalizedText.get(normalizedPrompt);
        const sourceUrls = normalizeSourceUrls(rawPrompt.sourceUrls);
        const patch: PatchObject = {
          entityId: entity._id,
          promptGroupId,
          intentCategory: rawPrompt.intentCategory ?? rawGroup.intentCategory,
          sentimentLens: rawPrompt.sentimentLens ?? rawGroup.sentimentLens,
          funnelStage: rawPrompt.funnelStage,
          audience: normalizeOptionalString(rawPrompt.audience) ?? undefined,
          topic: normalizeOptionalString(rawPrompt.topic) ?? undefined,
          priority: rawPrompt.priority,
          generationRationale:
            normalizeOptionalString(rawPrompt.rationale) ?? undefined,
          sourceGenerationId: args.generationId,
          updatedAt: now,
        };
        if (sourceUrls !== undefined && sourceUrls !== null) {
          patch.sourceUrls = sourceUrls;
        }

        if (existingPrompt) {
          if (existingPrompt.reviewState === undefined) {
            patch.reviewState = "draft";
          }
          if (existingPrompt.generatedBy === undefined) {
            patch.generatedBy = "codex";
          }
          await ctx.db.patch(existingPrompt._id, patch);
          continue;
        }

        const promptId = await ctx.db.insert("prompts", {
          promptText,
          ...patch,
          active: true,
          reviewState: "draft",
          generatedBy: "codex",
          createdAt: now,
        });
        promptByNormalizedText.set(normalizedPrompt, {
          _id: promptId,
          _creationTime: now,
          promptText,
          active: true,
          entityId: entity._id,
          promptGroupId,
          intentCategory: rawPrompt.intentCategory ?? rawGroup.intentCategory,
          sentimentLens: rawPrompt.sentimentLens ?? rawGroup.sentimentLens,
          funnelStage: rawPrompt.funnelStage,
          audience: normalizeOptionalString(rawPrompt.audience) ?? undefined,
          topic: normalizeOptionalString(rawPrompt.topic) ?? undefined,
          priority: rawPrompt.priority,
          reviewState: "draft",
          generatedBy: "codex",
          generationRationale:
            normalizeOptionalString(rawPrompt.rationale) ?? undefined,
          sourceUrls:
            sourceUrls !== undefined && sourceUrls !== null
              ? sourceUrls
              : undefined,
          sourceGenerationId: args.generationId,
          createdAt: now,
          updatedAt: now,
        });
        generatedPromptCount += 1;
      }
    }

    await ctx.db.patch(args.generationId, {
      status: "success",
      finishedAt: now,
      model: args.model?.trim(),
      entitySummary: normalizeOptionalString(args.entitySummary) ?? undefined,
      competitorNotes:
        normalizeOptionalString(args.competitorNotes) ?? undefined,
      warnings: uniqueStrings(warnings),
      generatedPromptCount,
      generatedGroupCount,
    });

    return { generatedGroupCount, generatedPromptCount };
  },
});

export const listPrompts = query({
  args: {
    active: v.optional(v.boolean()),
    entityId: v.optional(v.id("trackedEntities")),
    promptGroupId: v.optional(v.id("promptGroups")),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    reviewState: v.optional(vPromptReviewState),
    generatedBy: v.optional(vPromptGeneratedBy),
  },
  handler: async (ctx, args) => {
    let prompts = await ctx.db.query("prompts").collect();

    if (args.active !== undefined) {
      prompts = prompts.filter((prompt) => prompt.active === args.active);
    }
    if (args.entityId) {
      prompts = prompts.filter((prompt) => prompt.entityId === args.entityId);
    }
    if (args.promptGroupId) {
      prompts = prompts.filter(
        (prompt) => prompt.promptGroupId === args.promptGroupId
      );
    }
    if (args.intentCategory) {
      prompts = prompts.filter(
        (prompt) => promptIntentCategoryFor(prompt) === args.intentCategory
      );
    }
    if (args.sentimentLens) {
      prompts = prompts.filter(
        (prompt) => promptSentimentLensFor(prompt) === args.sentimentLens
      );
    }
    if (args.reviewState) {
      prompts = prompts.filter(
        (prompt) => promptReviewStateFor(prompt) === args.reviewState
      );
    }
    if (args.generatedBy) {
      prompts = prompts.filter(
        (prompt) => promptGeneratedByFor(prompt) === args.generatedBy
      );
    }

    const groupMap = await promptGroupByIdMap(
      ctx,
      prompts.map((prompt) => prompt.promptGroupId)
    );
    const entityMap = await trackedEntityByIdMap(
      ctx,
      prompts.map((prompt) => prompt.entityId)
    );

    return prompts
      .map((prompt) => {
        const promptGroup = prompt.promptGroupId
          ? groupMap.get(prompt.promptGroupId)
          : undefined;
        const entity = prompt.entityId
          ? entityMap.get(prompt.entityId)
          : undefined;
        return {
          ...prompt,
          ...promptMetadataFor(prompt, promptGroup, entity),
          excerpt: promptExcerptFor(prompt),
        };
      })
      .sort(
        (left, right) =>
          left.excerpt.localeCompare(right.excerpt) ||
          left._creationTime - right._creationTime
      );
  },
});

export const updatePrompt = mutation({
  args: {
    id: v.id("prompts"),
    promptText: v.optional(v.string()),
    entityId: v.optional(v.union(v.id("trackedEntities"), v.null())),
    promptGroupId: v.optional(v.union(v.id("promptGroups"), v.null())),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    funnelStage: v.optional(v.union(vPromptFunnelStage, v.null())),
    audience: v.optional(v.union(v.string(), v.null())),
    topic: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(v.union(vPromptPriority, v.null())),
    reviewState: v.optional(vPromptReviewState),
    generatedBy: v.optional(vPromptGeneratedBy),
    generationRationale: v.optional(v.union(v.string(), v.null())),
    sourceUrls: v.optional(v.union(v.array(v.string()), v.null())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.id);
    if (prompt == null) {
      throw new Error("Prompt not found");
    }

    const promptText =
      args.promptText !== undefined ? args.promptText.trim() : undefined;
    if (promptText !== undefined && !promptText) {
      throw new Error("Prompt text is required");
    }

    const scope = await resolvePromptUpdateScope(
      ctx,
      prompt,
      args.entityId,
      args.promptGroupId
    );
    const patch: PatchObject = { updatedAt: Date.now() };
    setOptionalPatchValue(patch, "promptText", promptText);
    setOptionalPatchValue(
      patch,
      "entityId",
      args.entityId !== undefined ||
        (args.promptGroupId !== undefined &&
          scope.promptGroupId !== undefined &&
          scope.entityId !== prompt.entityId)
        ? (scope.entityId ?? null)
        : undefined
    );
    setOptionalPatchValue(
      patch,
      "promptGroupId",
      args.promptGroupId === undefined
        ? undefined
        : (scope.promptGroupId ?? null)
    );
    setOptionalPatchValue(patch, "intentCategory", args.intentCategory);
    setOptionalPatchValue(patch, "sentimentLens", args.sentimentLens);
    setOptionalPatchValue(patch, "funnelStage", args.funnelStage);
    setOptionalPatchValue(
      patch,
      "audience",
      normalizeOptionalString(args.audience)
    );
    setOptionalPatchValue(patch, "topic", normalizeOptionalString(args.topic));
    setOptionalPatchValue(patch, "priority", args.priority);
    setOptionalPatchValue(patch, "reviewState", args.reviewState);
    setOptionalPatchValue(patch, "generatedBy", args.generatedBy);
    setOptionalPatchValue(
      patch,
      "generationRationale",
      normalizeOptionalString(args.generationRationale)
    );
    setOptionalPatchValue(
      patch,
      "sourceUrls",
      normalizeSourceUrls(args.sourceUrls)
    );
    setOptionalPatchValue(patch, "active", args.active);
    if (Object.values(patch).some((value) => value === undefined)) {
      await ctx.db.replace(args.id, promptReplacementWithPatch(prompt, patch));
    } else {
      await ctx.db.patch(args.id, patch);
    }
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
      runs.map((run) => deletePromptRunWithArtifacts(ctx, run._id))
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
            excerpt: promptExcerptFor(prompt),
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
    browserEngine: v.optional(vBrowserEngine),
    providerSlugs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const prompts = await assertPromptIdsOwned(ctx, args.promptIds);
    const queuedCount = await enqueuePromptRunDocs(ctx, prompts, args.label, {
      browserEngine: args.browserEngine,
      providerSlugs: args.providerSlugs,
    });
    return { queuedCount };
  },
});

export const triggerPromptGroupNow = mutation({
  args: {
    promptGroupId: v.id("promptGroups"),
    label: v.optional(v.string()),
    browserEngine: v.optional(vBrowserEngine),
    providerSlugs: v.optional(v.array(v.string())),
    includeDrafts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const promptGroup = await assertPromptGroup(ctx, args.promptGroupId);
    const prompts = (
      await ctx.db
        .query("prompts")
        .withIndex("promptGroupId", (q) =>
          q.eq("promptGroupId", args.promptGroupId)
        )
        .collect()
    ).filter(
      (prompt) =>
        prompt.active &&
        promptReviewStateFor(prompt) !== "archived" &&
        (args.includeDrafts || promptReviewStateFor(prompt) === "approved")
    );
    if (!prompts.length) {
      throw new Error("Prompt group has no approved active prompts");
    }
    const queuedCount = await enqueuePromptRunDocs(
      ctx,
      prompts,
      args.label?.trim() || promptGroup.name,
      {
        browserEngine: args.browserEngine,
        providerSlugs: args.providerSlugs,
      }
    );
    return { queuedCount };
  },
});

export const triggerEntityPromptsNow = mutation({
  args: {
    entityId: v.id("trackedEntities"),
    label: v.optional(v.string()),
    browserEngine: v.optional(vBrowserEngine),
    providerSlugs: v.optional(v.array(v.string())),
    includeDrafts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entity = await assertTrackedEntity(ctx, args.entityId);
    const prompts = (
      await ctx.db
        .query("prompts")
        .withIndex("entityId", (q) => q.eq("entityId", args.entityId))
        .collect()
    ).filter(
      (prompt) =>
        prompt.active &&
        promptReviewStateFor(prompt) !== "archived" &&
        (args.includeDrafts || promptReviewStateFor(prompt) === "approved")
    );
    if (!prompts.length) {
      throw new Error("Entity has no approved active prompts");
    }
    const queuedCount = await enqueuePromptRunDocs(
      ctx,
      prompts,
      args.label?.trim() || entity.name,
      {
        browserEngine: args.browserEngine,
        providerSlugs: args.providerSlugs,
      }
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
      runGroupQueuedAt: queuedAt,
      promptId: run.promptId,
      entityId: run.entityId,
      promptGroupId: run.promptGroupId,
      promptGroupName: run.promptGroupName,
      intentCategory: run.intentCategory,
      sentimentLens: run.sentimentLens,
      funnelStage: run.funnelStage,
      audience: run.audience,
      topic: run.topic,
      priority: run.priority,
      reviewState: run.reviewState,
      providerId: run.providerId,
      providerSlug: run.providerSlug,
      providerName: run.providerName,
      providerUrl: run.providerUrl,
      channelSlug: run.channelSlug,
      channelName: run.channelName,
      transport: run.transport,
      sessionMode: run.sessionMode,
      sessionProfileDir: run.sessionProfileDir,
      browserEngine: run.browserEngine,
      promptQueryParam: run.promptQueryParam,
      submitStrategy: run.submitStrategy,
      promptExcerpt: run.promptExcerpt ?? promptExcerptFor(prompt),
      status: "queued",
      attempt: nextAttempt,
      retryOfRunId: run.retryOfRunId ?? run._id,
      queuedAt,
      startedAt: queuedAt,
      runLabel:
        args.label?.trim() ||
        run.runLabel ||
        run.promptExcerpt ||
        promptExcerptFor(prompt),
    });
    await ctx.db.patch(retryRunId, { runGroupId: String(retryRunId) });
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

export const deletePromptRun = mutation({
  args: {
    runId: v.id("promptRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run == null) {
      throw new Error("Prompt run not found");
    }
    if (run.status !== "queued") {
      throw new Error("Only queued runs can be deleted.");
    }

    await deletePromptRunWithArtifacts(ctx, args.runId);
    return { runId: args.runId, deleted: true };
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

/** Docker Compose: schedule legacy promptRuns excerpt backfill (anonymous local Convex only). */
export const requestKickPromptRunExcerptBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.CONVEX_AGENT_MODE !== "anonymous") {
      throw new Error(
        "requestKickPromptRunExcerptBackfill runs only when CONVEX_AGENT_MODE=anonymous (local Convex)."
      );
    }
    await ctx.scheduler.runAfter(
      0,
      internal.migrations.kickPromptRunExcerptBackfill,
      {}
    );
    return { ok: true };
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
            providerName:
              latestQueuedRun.providerName ??
              latestQueuedRun.providerSlug ??
              "Unknown provider",
          }
        : null,
    };
  },
});

async function buildClaimedPromptRunPayload(
  ctx: MutationCtx,
  run: PromptRunDoc,
  prompt: PromptDoc,
  args: {
    browserEngine?: BrowserEngine;
  }
) {
  const excerpt = excerptForPromptRun(run, prompt);
  const resolvedProvider = await getProviderDocForRun(ctx, run);
  if (resolvedProvider == null) {
    throw new Error("No providers configured.");
  }

  const base = providerSnapshot(resolvedProvider);
  const queuedProviderSnapshot = {
    providerId: run.providerId ?? base.providerId,
    providerSlug: run.providerSlug ?? base.providerSlug,
    providerName: run.providerName ?? base.providerName,
    providerUrl: run.providerUrl ?? base.providerUrl,
    channelSlug: run.channelSlug ?? base.channelSlug,
    channelName: run.channelName ?? base.channelName,
    transport: run.transport ?? base.transport,
    sessionMode: run.sessionMode ?? base.sessionMode,
    sessionProfileDir: run.sessionProfileDir ?? base.sessionProfileDir,
    promptQueryParam: run.promptQueryParam ?? base.promptQueryParam,
    submitStrategy: run.submitStrategy ?? base.submitStrategy,
  };

  const providerDefaults = defaultProviderDefinitionFor(
    queuedProviderSnapshot.providerSlug
  );
  const effectiveSlug =
    queuedProviderSnapshot.providerSlug ?? resolvedProvider.slug;
  const channelSlug =
    queuedProviderSnapshot.channelSlug ??
    providerDefaults?.channelSlug ??
    `${effectiveSlug}-web`;
  const channelName =
    queuedProviderSnapshot.channelName ??
    providerDefaults?.channelName ??
    `${queuedProviderSnapshot.providerName} web`;

  return {
    runId: run._id,
    runGroupId: runGroupKey(run),
    queuedAt: run.queuedAt ?? run.startedAt,
    startedAt: run.startedAt,
    prompt: {
      id: prompt._id,
      excerpt,
      promptText: prompt.promptText,
      providerId: queuedProviderSnapshot.providerId,
      providerSlug: queuedProviderSnapshot.providerSlug,
      providerName: queuedProviderSnapshot.providerName,
      providerUrl: queuedProviderSnapshot.providerUrl,
      channelSlug,
      channelName,
      transport: queuedProviderSnapshot.transport,
      sessionMode: queuedProviderSnapshot.sessionMode,
      sessionProfileDir: queuedProviderSnapshot.sessionProfileDir,
      browserEngine: run.browserEngine ?? args.browserEngine,
      promptQueryParam: queuedProviderSnapshot.promptQueryParam,
      submitStrategy: queuedProviderSnapshot.submitStrategy,
      providerSessionJson: resolvedProvider.sessionJson,
    },
    runLabel: run.runLabel ?? excerpt,
    attempt: run.attempt ?? 1,
    retryOfRunId: run.retryOfRunId,
  };
}

export const claimNextQueuedPromptRun = mutation({
  args: {
    runner: v.optional(v.string()),
    browserEngine: v.optional(vBrowserEngine),
    maxConcurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxConcurrent = Math.max(1, Math.floor(args.maxConcurrent ?? 2));
    const activeRuns = (
      await ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", "running"))
        .collect()
    ).filter((run) => runMatchesWorkerEngine(run, args.browserEngine));

    if (activeRuns.length >= maxConcurrent) {
      return null;
    }

    const queuedRuns = await ctx.db
      .query("promptRuns")
      .withIndex("status_startedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .collect();
    const queuedRun = queuedRuns.find((run) =>
      runMatchesWorkerEngine(run, args.browserEngine)
    );

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
        browserEngine: args.browserEngine ?? queuedRun.browserEngine,
      });
      return null;
    }
    const startedAt = Date.now();
    await ctx.db.patch(queuedRun._id, {
      status: "running",
      startedAt,
      warnings: [],
      runner: args.runner?.trim() || "local-playwright-worker",
      browserEngine: args.browserEngine ?? queuedRun.browserEngine,
    });

    return await buildClaimedPromptRunPayload(
      ctx,
      {
        ...queuedRun,
        status: "running",
        startedAt,
        warnings: [],
        runner: args.runner?.trim() || "local-playwright-worker",
        browserEngine: args.browserEngine ?? queuedRun.browserEngine,
      },
      prompt,
      args
    );
  },
});

export const claimNextQueuedPromptRunGroup = mutation({
  args: {
    runner: v.optional(v.string()),
    browserEngine: v.optional(vBrowserEngine),
    maxConcurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxConcurrentGroups = Math.max(
      1,
      Math.floor(args.maxConcurrent ?? 1)
    );
    const activeRuns = (
      await ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", "running"))
        .collect()
    ).filter((run) => runMatchesWorkerEngine(run, args.browserEngine));

    const activeGroups = new Set(activeRuns.map(runGroupKey));
    if (activeGroups.size >= maxConcurrentGroups) {
      return null;
    }

    const queuedRuns = await ctx.db
      .query("promptRuns")
      .withIndex("status_startedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .collect();
    const queuedRun = queuedRuns.find((run) =>
      runMatchesWorkerEngine(run, args.browserEngine)
    );

    if (queuedRun == null) {
      return null;
    }

    const groupId = runGroupKey(queuedRun);
    const groupRuns = queuedRun.runGroupId
      ? await ctx.db
          .query("promptRuns")
          .withIndex("runGroupId", (q) => q.eq("runGroupId", groupId))
          .collect()
      : [queuedRun];
    const queuedGroupRuns = groupRuns
      .filter(
        (run) =>
          run.status === "queued" &&
          runMatchesWorkerEngine(run, args.browserEngine)
      )
      .sort((left, right) =>
        (left.providerName ?? "").localeCompare(right.providerName ?? "")
      );

    if (!queuedGroupRuns.length) {
      return null;
    }

    const prompt = await ctx.db.get(queuedRun.promptId);
    if (prompt == null) {
      await Promise.all(
        queuedGroupRuns.map((run) =>
          ctx.db.patch(run._id, {
            status: "failed",
            finishedAt: Date.now(),
            responseSummary: "Prompt was deleted before the run could execute.",
            warnings: ["Prompt was deleted before execution."],
            runner: args.runner?.trim() || "local-playwright-worker",
            browserEngine: args.browserEngine ?? run.browserEngine,
          })
        )
      );
      return null;
    }

    const startedAt = Date.now();
    const runner = args.runner?.trim() || "local-playwright-worker";
    await Promise.all(
      queuedGroupRuns.map((run) =>
        ctx.db.patch(run._id, {
          status: "running",
          startedAt,
          warnings: [],
          runner,
          browserEngine: args.browserEngine ?? run.browserEngine,
        })
      )
    );

    const claimedRuns = await Promise.all(
      queuedGroupRuns.map((run) =>
        buildClaimedPromptRunPayload(
          ctx,
          {
            ...run,
            status: "running",
            startedAt,
            runner,
            browserEngine: args.browserEngine ?? run.browserEngine,
          },
          prompt,
          args
        )
      )
    );

    return {
      runGroupId: groupId,
      queuedAt: runQueuedAt(queuedRun),
      startedAt,
      runLabel: queuedRun.runLabel ?? queuedRun.promptExcerpt,
      prompt: {
        id: prompt._id,
        excerpt: queuedRun.promptExcerpt,
        promptText: prompt.promptText,
      },
      runs: claimedRuns,
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
    model: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    runner: v.optional(v.string()),
    browserEngine: v.optional(vBrowserEngine),
    sessionMode: v.optional(v.union(v.literal("guest"), v.literal("stored"))),
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

    await ctx.db.patch(
      args.runId,
      compactPatch({
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
        model: args.model,
        warnings: mergedWarnings.length ? mergedWarnings : undefined,
        runner: args.runner ?? run.runner,
        browserEngine: args.browserEngine ?? run.browserEngine,
        sessionMode: args.sessionMode ?? run.sessionMode,
      })
    );

    if (shouldPersistCitations) {
      await insertCitationsForRun(ctx, args.runId, citationInputs);
      const persistedCitations = await ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
        .collect();
      const mentions = await replaceRunEntityMentions(
        ctx,
        args.runId,
        args.responseText ??
          run.responseText ??
          args.responseSummary ??
          run.responseSummary,
        persistedCitations
      );
      await queueRunMentionAnalysis(ctx, args.runId, mentions.length);
    } else {
      const existingMentions = await ctx.db
        .query("runEntityMentions")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
        .collect();
      await Promise.all(
        existingMentions.map((mention) => ctx.db.delete(mention._id))
      );
      const existingAnalyses = await ctx.db
        .query("runMentionAnalyses")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", args.runId))
        .collect();
      await Promise.all(
        existingAnalyses
          .filter((analysis) => analysis.status === "queued")
          .map((analysis) => ctx.db.delete(analysis._id))
      );
    }

    return { runId: args.runId, citationCount: citationInputs.length };
  },
});

export const claimNextRunMentionAnalysis = mutation({
  args: {
    runner: v.optional(v.string()),
    maxConcurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxConcurrent = Math.max(1, Math.floor(args.maxConcurrent ?? 1));
    const running = await ctx.db
      .query("runMentionAnalyses")
      .withIndex("status_queuedAt", (q) => q.eq("status", "running"))
      .collect();
    if (running.length >= maxConcurrent) {
      return null;
    }

    const queued = await ctx.db
      .query("runMentionAnalyses")
      .withIndex("status_queuedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    if (!queued) {
      return null;
    }

    const run = await ctx.db.get(queued.promptRunId);
    if (run == null || !isSuccessfulRunStatus(run.status)) {
      await ctx.db.patch(
        queued._id,
        compactPatch({
          status: "failed",
          finishedAt: Date.now(),
          runner: args.runner?.trim() || "mention-analysis-worker",
          error:
            run == null
              ? "Prompt run was deleted before mention analysis."
              : "Only successful prompt runs can be analyzed for mentions.",
        })
      );
      return null;
    }

    const prompt = await ctx.db.get(run.promptId);
    if (prompt == null) {
      await ctx.db.patch(
        queued._id,
        compactPatch({
          status: "failed",
          finishedAt: Date.now(),
          runner: args.runner?.trim() || "mention-analysis-worker",
          error: "Prompt was deleted before mention analysis.",
        })
      );
      return null;
    }

    const [citations, deterministicMentions, trackedEntities] =
      await Promise.all([
        ctx.db
          .query("citations")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
          .collect(),
        ctx.db
          .query("runEntityMentions")
          .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
          .collect(),
        ctx.db.query("trackedEntities").collect(),
      ]);

    const startedAt = Date.now();
    const runner = args.runner?.trim() || "mention-analysis-worker";
    await ctx.db.patch(queued._id, {
      status: "running",
      startedAt,
      runner,
    });

    return {
      analysisId: queued._id,
      run: {
        id: run._id,
        promptId: run.promptId,
        promptExcerpt: run.promptExcerpt,
        providerName: run.providerName,
        providerSlug: run.providerSlug,
        responseText: run.responseText,
        responseSummary: run.responseSummary,
      },
      prompt: {
        id: prompt._id,
        promptText: prompt.promptText,
        excerpt: promptExcerptFor(prompt),
      },
      citations: citations.map((citation) => ({
        id: citation._id,
        domain: citation.domain,
        url: citation.url,
        title: citation.title,
        snippet: citation.snippet,
        type: citation.type,
        position: citation.position,
        trackedEntityId: citation.trackedEntityId,
        trackedEntityName: citation.trackedEntityName,
        trackedEntitySlug: citation.trackedEntitySlug,
      })),
      deterministicMentions: deterministicMentions.map((mention) => ({
        id: mention._id,
        trackedEntityId: mention.trackedEntityId,
        name: mention.name,
        slug: mention.slug,
        kind: mention.kind,
        mentionCount: mention.mentionCount,
        citationCount: mention.citationCount,
        matchedTerms: mention.matchedTerms,
      })),
      trackedEntities: trackedEntities
        .filter((entity) => entity.active)
        .map((entity) => ({
          id: entity._id,
          name: entity.name,
          slug: entity.slug,
          kind: entity.kind,
          aliases: entity.aliases,
          ownedDomains: entity.ownedDomains,
        })),
    };
  },
});

export const completeRunMentionAnalysis = mutation({
  args: {
    analysisId: v.id("runMentionAnalyses"),
    status: vMentionAnalysisStatus,
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    mentions: v.optional(
      v.array(
        v.object({
          trackedEntityId: v.optional(v.id("trackedEntities")),
          name: v.string(),
          slug: v.optional(v.string()),
          kind: v.optional(vEntityKind),
          mentionCount: v.optional(v.float64()),
          sentiment: v.optional(vMentionSentiment),
          confidence: v.optional(v.float64()),
          evidence: v.optional(v.string()),
          matchedTerms: v.optional(v.array(v.string())),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (analysis == null) {
      throw new Error("Run mention analysis not found");
    }

    if (args.status !== "success") {
      await ctx.db.patch(
        args.analysisId,
        compactPatch({
          status: "failed",
          finishedAt: Date.now(),
          model: args.model?.trim(),
          error: args.error?.trim() || "Mention analysis failed.",
          warnings: args.warnings,
        })
      );
      return { analysisId: args.analysisId, codexMentionCount: 0 };
    }

    const run = await ctx.db.get(analysis.promptRunId);
    if (run == null || !isSuccessfulRunStatus(run.status)) {
      await ctx.db.patch(
        args.analysisId,
        compactPatch({
          status: "failed",
          finishedAt: Date.now(),
          model: args.model?.trim(),
          error:
            run == null
              ? "Prompt run was deleted before mention analysis completed."
              : "Only successful prompt runs can receive mention analysis.",
          warnings: args.warnings,
        })
      );
      return { analysisId: args.analysisId, codexMentionCount: 0 };
    }

    const [existingMentions, trackedEntities, citations] = await Promise.all([
      ctx.db
        .query("runEntityMentions")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
        .collect(),
      ctx.db.query("trackedEntities").collect(),
      ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", run._id))
        .collect(),
    ]);
    const existingByKey = new Map(
      existingMentions.map((mention) => [mentionKeyFor(mention), mention])
    );

    let codexMentionCount = 0;
    let candidateMentionCount = 0;
    for (const rawMention of args.mentions ?? []) {
      const name = rawMention.name.trim();
      if (!name) {
        continue;
      }

      const trackedEntity = findTrackedEntityForMention(
        trackedEntities,
        rawMention
      );
      const slug = trackedEntity?.slug ?? sanitizeSlug(rawMention.slug ?? name);
      if (!slug) {
        continue;
      }

      const kind = trackedEntity?.kind ?? rawMention.kind ?? "other";
      const cited = trackedEntity
        ? citationsForEntity(citations, trackedEntity)
        : [];
      const key = trackedEntity
        ? `entity:${String(trackedEntity._id)}`
        : `candidate:${slug}`;
      const existing = existingByKey.get(key);
      const mentionCount = Math.max(
        1,
        Math.floor(rawMention.mentionCount ?? existing?.mentionCount ?? 1)
      );
      const matchedTerms = uniqueStrings([
        ...(existing?.matchedTerms ?? []),
        ...(rawMention.matchedTerms ?? []),
        name,
      ]);
      const patch = compactPatch({
        analysisId: args.analysisId,
        trackedEntityId: trackedEntity?._id,
        name: trackedEntity?.name ?? name,
        slug,
        kind,
        mentionCount: Math.max(existing?.mentionCount ?? 0, mentionCount),
        citationCount: Math.max(existing?.citationCount ?? 0, cited.length),
        ownedCitationCount: Math.max(
          existing?.ownedCitationCount ?? 0,
          cited.filter((citation) => citation.isOwned).length
        ),
        matchedTerms,
        detectionSource: existing?.detectionSource ?? "codex",
        sentiment: rawMention.sentiment,
        confidence: normalizeMentionConfidence(rawMention.confidence),
        evidence: rawMention.evidence?.trim(),
      });

      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("runEntityMentions", {
          promptRunId: run._id,
          analysisId: args.analysisId,
          trackedEntityId: trackedEntity?._id,
          name: trackedEntity?.name ?? name,
          slug,
          kind,
          mentionCount,
          citationCount: cited.length,
          ownedCitationCount: cited.filter((citation) => citation.isOwned)
            .length,
          matchedTerms,
          detectionSource: "codex",
          sentiment: rawMention.sentiment,
          confidence: normalizeMentionConfidence(rawMention.confidence),
          evidence: rawMention.evidence?.trim(),
        });
      }

      codexMentionCount += 1;
      if (!trackedEntity) {
        candidateMentionCount += 1;
      }
    }

    await ctx.db.patch(
      args.analysisId,
      compactPatch({
        status: "success",
        finishedAt: Date.now(),
        model: args.model?.trim(),
        warnings: args.warnings,
        codexMentionCount,
        candidateMentionCount,
      })
    );

    return {
      analysisId: args.analysisId,
      codexMentionCount,
      candidateMentionCount,
    };
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
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("entityId", (q) => q.eq("entityId", args.id))
      .collect();
    const promptGroups = await ctx.db
      .query("promptGroups")
      .withIndex("entityId", (q) => q.eq("entityId", args.id))
      .collect();
    await Promise.all(
      citations
        .filter((citation) => citation.trackedEntityId === args.id)
        .map((citation) =>
          ctx.db.patch(citation._id, {
            trackedEntityId: undefined,
          })
        )
    );
    await Promise.all(
      prompts.map((prompt) =>
        ctx.db.patch(prompt._id, {
          entityId: undefined,
          updatedAt: Date.now(),
        })
      )
    );
    await Promise.all(
      promptGroups.map((promptGroup) =>
        ctx.db.patch(promptGroup._id, {
          entityId: undefined,
          updatedAt: Date.now(),
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
    provider: v.optional(v.string()),
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
    model: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    browserEngine: v.optional(vBrowserEngine),
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
    const provider = await providerBySlugOrDefault(ctx, args.provider);
    const promptGroup = prompt.promptGroupId
      ? await ctx.db.get(prompt.promptGroupId)
      : null;

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
      runGroupQueuedAt: args.startedAt,
      promptId: args.promptId,
      ...promptRunSnapshotFor(prompt, promptGroup),
      ...providerSnapshot(provider),
      promptExcerpt: promptExcerptFor(prompt),
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
      runLabel: args.runLabel?.trim() || promptExcerptFor(prompt),
      sourceCount: shouldPersistCitations
        ? (args.sourceCount ??
          new Set(
            citationInputs.map((citation) => normalizeDomain(citation.domain))
          ).size)
        : undefined,
      deeplinkUsed: args.deeplinkUsed,
      evidencePath: args.evidencePath,
      output: args.output,
      model: args.model,
      warnings: args.warnings,
      browserEngine: args.browserEngine,
      ingestId: args.ingestId?.trim(),
    });
    await ctx.db.patch(runId, { runGroupId: String(runId) });

    if (shouldPersistCitations) {
      await insertCitationsForRun(ctx, runId, citationInputs);
      const persistedCitations = await ctx.db
        .query("citations")
        .withIndex("promptRunId", (q) => q.eq("promptRunId", runId))
        .collect();
      const mentions = await replaceRunEntityMentions(
        ctx,
        runId,
        args.responseText ?? args.responseSummary,
        persistedCitations
      );
      await queueRunMentionAnalysis(ctx, runId, mentions.length);
    }

    return { runId, citationCount: citationInputs.length };
  },
});

export const listPromptRuns = query({
  args: {
    promptId: v.optional(v.id("prompts")),
    provider: v.optional(v.string()),
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
    } else if (args.provider) {
      runs = await ctx.db
        .query("promptRuns")
        .withIndex("providerSlug_startedAt", (q) =>
          q.eq("providerSlug", args.provider!)
        )
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

    if (args.provider) {
      runs = runs.filter((run) => run.providerSlug === args.provider);
    }
    if (args.status) {
      runs = runs.filter((run) => run.status === args.status);
    }
    runs = runs.slice(0, limit);

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
      runGroupId: runGroupKey(run),
      runGroupQueuedAt: runQueuedAt(run),
      promptId: run.promptId,
      promptExcerpt: promptExcerptForRun(run),
      entityId: run.entityId,
      promptGroupId: run.promptGroupId,
      promptGroupName: run.promptGroupName,
      intentCategory: run.intentCategory,
      sentimentLens: run.sentimentLens,
      funnelStage: run.funnelStage,
      audience: run.audience,
      topic: run.topic,
      priority: run.priority,
      reviewState: run.reviewState,
      providerSlug: providerSlugForRun(run),
      providerName: providerNameForRun(run),
      providerUrl: providerUrlForRun(run),
      channelSlug: run.channelSlug,
      channelName: run.channelName,
      transport: run.transport,
      sessionMode: run.sessionMode,
      browserEngine: run.browserEngine,
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
      runner: run.runner,
      warnings: run.warnings,
      citationCount: citationMap.get(run._id)?.length ?? 0,
    }));
  },
});

export const listRunGroups = query({
  args: {
    provider: v.optional(v.string()),
    status: v.optional(vRunStatus),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = clamp(Math.floor(args.limit ?? 30), 1, 100);
    const scanLimit = limit * 6;

    let seedRuns: PromptRunDoc[];
    if (args.provider) {
      seedRuns = await ctx.db
        .query("promptRuns")
        .withIndex("providerSlug_startedAt", (q) =>
          q.eq("providerSlug", args.provider!)
        )
        .order("desc")
        .collect();
    } else if (args.status) {
      seedRuns = await ctx.db
        .query("promptRuns")
        .withIndex("status_startedAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      seedRuns = await ctx.db
        .query("promptRuns")
        .withIndex("startedAt")
        .order("desc")
        .take(scanLimit);
    }

    seedRuns = seedRuns
      .filter((run) => !args.status || run.status === args.status)
      .slice(0, scanLimit);

    const groupSeeds = new Map<string, PromptRunDoc>();
    for (const run of seedRuns) {
      const key = runGroupKey(run);
      const existing = groupSeeds.get(key);
      if (!existing || runQueuedAt(run) > runQueuedAt(existing)) {
        groupSeeds.set(key, run);
      }
    }

    const groupedRuns = await Promise.all(
      [...groupSeeds.entries()].map(async ([groupId, seed]) => {
        if (!seed.runGroupId) {
          return [seed];
        }
        return await ctx.db
          .query("promptRuns")
          .withIndex("runGroupId", (q) => q.eq("runGroupId", groupId))
          .collect();
      })
    );

    const runIds = groupedRuns
      .flat()
      .filter((run) => isSuccessfulRunStatus(run.status))
      .map((run) => run._id);
    const citationsByRun = buildCitationMap(
      await collectCitationsForRuns(ctx, runIds)
    );

    return groupedRuns
      .filter((runs) => runs.length > 0)
      .map((runs) => {
        const sortedRuns = runs
          .slice()
          .sort((left, right) =>
            (left.providerName ?? "").localeCompare(right.providerName ?? "")
          );
        const latestRun = sortedRuns
          .slice()
          .sort((left, right) => right.startedAt - left.startedAt)[0];
        const citations = sortedRuns.flatMap(
          (run) => citationsByRun.get(run._id) ?? []
        );
        return {
          id: runGroupKey(latestRun),
          promptId: latestRun.promptId,
          promptExcerpt: promptExcerptForRun(latestRun),
          entityId: latestRun.entityId,
          promptGroupId: latestRun.promptGroupId,
          promptGroupName: latestRun.promptGroupName,
          intentCategory: latestRun.intentCategory,
          sentimentLens: latestRun.sentimentLens,
          reviewState: latestRun.reviewState,
          runLabel: latestRun.runLabel,
          queuedAt: runQueuedAt(latestRun),
          startedAt: latestRunStartedAt(sortedRuns),
          finishedAt: sortedRuns
            .map((run) => run.finishedAt)
            .filter((value): value is number => typeof value === "number")
            .sort((left, right) => right - left)[0],
          status: summarizeRunGroupStatus(sortedRuns),
          providerCount: sortedRuns.length,
          sourceCount: uniqueStrings(
            citations.map((citation) => citation.domain)
          ).length,
          citationCount: citations.length,
          providers: sortedRuns.map((run) => ({
            runId: run._id,
            providerSlug: providerSlugForRun(run),
            providerName: providerNameForRun(run),
            providerUrl: providerUrlForRun(run),
            channelName: run.channelName,
            sessionMode: run.sessionMode,
            browserEngine: run.browserEngine,
            runner: run.runner,
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            latencyMs: run.latencyMs,
            responseSummary: run.responseSummary,
            sourceCount: isSuccessfulRunStatus(run.status)
              ? (run.sourceCount ?? citationsByRun.get(run._id)?.length ?? 0)
              : undefined,
            citationCount: citationsByRun.get(run._id)?.length ?? 0,
            warnings: run.warnings,
          })),
        };
      })
      .sort((left, right) => right.queuedAt - left.queuedAt)
      .slice(0, limit);
  },
});

export const getRunGroup = query({
  args: { runGroupId: v.string() },
  handler: async (ctx, args) => {
    let runs = await ctx.db
      .query("promptRuns")
      .withIndex("runGroupId", (q) => q.eq("runGroupId", args.runGroupId))
      .collect();

    if (!runs.length) {
      const fallbackRun = await ctx.db.get(args.runGroupId as Id<"promptRuns">);
      runs = fallbackRun ? [fallbackRun] : [];
    }

    if (!runs.length) {
      throw new Error("Run group not found");
    }

    runs = runs
      .slice()
      .sort((left, right) =>
        (left.providerName ?? "").localeCompare(right.providerName ?? "")
      );
    const prompt = await ctx.db.get(runs[0].promptId);
    const [promptGroup, entity] = await Promise.all([
      prompt?.promptGroupId ? ctx.db.get(prompt.promptGroupId) : null,
      prompt?.entityId ? ctx.db.get(prompt.entityId) : null,
    ]);
    const successfulRunIds = runs
      .filter((run) => isSuccessfulRunStatus(run.status))
      .map((run) => run._id);
    const citationsByRun = buildCitationMap(
      await collectCitationsForRuns(ctx, successfulRunIds)
    );
    const mentionsByRun = buildRunEntityMentionMap(
      await collectRunEntityMentionsForRuns(ctx, successfulRunIds)
    );
    const allCitations = runs.flatMap(
      (run) => citationsByRun.get(run._id) ?? []
    );
    const latestRun = runs
      .slice()
      .sort((left, right) => right.startedAt - left.startedAt)[0];

    return {
      group: {
        id: runGroupKey(latestRun),
        promptId: latestRun.promptId,
        promptExcerpt: promptExcerptForRun(latestRun, prompt),
        entityId: latestRun.entityId,
        promptGroupId: latestRun.promptGroupId,
        promptGroupName: latestRun.promptGroupName,
        intentCategory: latestRun.intentCategory,
        sentimentLens: latestRun.sentimentLens,
        reviewState: latestRun.reviewState,
        runLabel: latestRun.runLabel,
        queuedAt: runQueuedAt(latestRun),
        startedAt: latestRunStartedAt(runs),
        finishedAt: runs
          .map((run) => run.finishedAt)
          .filter((value): value is number => typeof value === "number")
          .sort((left, right) => right - left)[0],
        status: summarizeRunGroupStatus(runs),
        providerCount: runs.length,
        sourceCount: uniqueStrings(
          allCitations.map((citation) => citation.domain)
        ).length,
        citationCount: allCitations.length,
      },
      prompt: prompt
        ? {
            _id: prompt._id,
            excerpt: promptExcerptFor(prompt),
            promptText: prompt.promptText,
            ...promptMetadataFor(prompt, promptGroup, entity),
          }
        : null,
      runs: runs.map((run) => ({
        ...run,
        runGroupId: runGroupKey(run),
        runGroupQueuedAt: runQueuedAt(run),
        promptExcerpt: promptExcerptForRun(run, prompt),
        providerSlug: providerSlugForRun(run),
        providerName: providerNameForRun(run),
        providerUrl: providerUrlForRun(run),
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
        citations: citationsByRun.get(run._id) ?? [],
        mentions: mentionsByRun.get(run._id) ?? [],
      })),
    };
  },
});

export const listPromptResponseAnalytics = query({
  args: {
    active: v.optional(v.boolean()),
    rangeDays: v.optional(v.float64()),
    entityId: v.optional(v.id("trackedEntities")),
    promptGroupId: v.optional(v.id("promptGroups")),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    reviewState: v.optional(vPromptReviewState),
    generatedBy: v.optional(vPromptGeneratedBy),
  },
  handler: async (ctx, args) => {
    let prompts = await ctx.db.query("prompts").collect();

    if (args.active !== undefined) {
      prompts = prompts.filter((prompt) => prompt.active === args.active);
    }
    if (args.entityId) {
      prompts = prompts.filter((prompt) => prompt.entityId === args.entityId);
    }
    if (args.promptGroupId) {
      prompts = prompts.filter(
        (prompt) => prompt.promptGroupId === args.promptGroupId
      );
    }
    if (args.intentCategory) {
      prompts = prompts.filter(
        (prompt) => promptIntentCategoryFor(prompt) === args.intentCategory
      );
    }
    if (args.sentimentLens) {
      prompts = prompts.filter(
        (prompt) => promptSentimentLensFor(prompt) === args.sentimentLens
      );
    }
    if (args.reviewState) {
      prompts = prompts.filter(
        (prompt) => promptReviewStateFor(prompt) === args.reviewState
      );
    }
    if (args.generatedBy) {
      prompts = prompts.filter(
        (prompt) => promptGeneratedByFor(prompt) === args.generatedBy
      );
    }
    const groupMap = await promptGroupByIdMap(
      ctx,
      prompts.map((prompt) => prompt.promptGroupId)
    );
    const entityMap = await trackedEntityByIdMap(
      ctx,
      prompts.map((prompt) => prompt.entityId)
    );
    const rangeStart =
      args.rangeDays !== undefined
        ? Date.now() - args.rangeDays * 24 * 60 * 60 * 1000
        : undefined;

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
          (run) => rangeStart === undefined || run.startedAt >= rangeStart
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
        const runCount = uniqueStrings(promptRuns.map(runGroupKey)).length;
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
          excerpt: promptExcerptFor(prompt),
          ...promptMetadataFor(
            prompt,
            prompt.promptGroupId ? groupMap.get(prompt.promptGroupId) : null,
            prompt.entityId ? entityMap.get(prompt.entityId) : null
          ),
          active: prompt.active,
          responseCount: successfulRuns.length,
          latestRunAt: latestSuccessfulRun?.startedAt,
          latestRunId: latestSuccessfulRun?._id,
          latestRunGroupId: latestSuccessfulRun
            ? runGroupKey(latestSuccessfulRun)
            : undefined,
          latestStatus: latestSuccessfulRun?.status,
          latestAttempt:
            promptRuns[0]?.attempt ?? latestSuccessfulRun?.attempt ?? 1,
          latestExecutionStatus: promptRuns[0]?.status,
          latestResponseSummary:
            latestSuccessfulRun?.responseSummary ??
            latestSuccessfulRun?.responseText ??
            undefined,
          runCount,
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
          left.excerpt.localeCompare(right.excerpt)
      );
  },
});

export const getPromptAnalysis = query({
  args: {
    promptId: v.id("prompts"),
    provider: v.optional(v.string()),
    rangeDays: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.promptId);
    if (prompt == null) {
      return null;
    }
    const [promptGroup, entity] = await Promise.all([
      prompt.promptGroupId ? ctx.db.get(prompt.promptGroupId) : null,
      prompt.entityId ? ctx.db.get(prompt.entityId) : null,
    ]);

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
      if (args.provider && run.providerSlug !== args.provider) {
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
        runGroupId: runGroupKey(run),
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        providerSlug: providerSlugForRun(run),
        providerName: providerNameForRun(run),
        providerUrl: providerUrlForRun(run),
        browserEngine: run.browserEngine,
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
      prompt: {
        _id: prompt._id,
        excerpt: promptExcerptFor(prompt),
        promptText: prompt.promptText,
        active: prompt.active,
        ...promptMetadataFor(prompt, promptGroup, entity),
      },
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
        runGroupId: runGroupKey(run),
        runGroupQueuedAt: runQueuedAt(run),
        promptExcerpt: promptExcerptForRun(run, prompt),
        providerSlug: providerSlugForRun(run),
        providerName: providerNameForRun(run),
        providerUrl: providerUrlForRun(run),
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
      prompt: prompt
        ? {
            _id: prompt._id,
            excerpt: promptExcerptFor(prompt),
            promptText: prompt.promptText,
          }
        : null,
      output,
      mentions: mentionSnapshots.map((mention) => ({
        entityId: mention.trackedEntityId,
        analysisId: mention.analysisId,
        name: mention.name,
        slug: mention.slug,
        kind: mention.kind,
        mentionCount: mention.mentionCount,
        citationCount: mention.citationCount,
        ownedCitationCount: mention.ownedCitationCount,
        matchedTerms: mention.matchedTerms,
        detectionSource: mention.detectionSource,
        sentiment: mention.sentiment,
        confidence: mention.confidence,
        evidence: mention.evidence,
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
    provider: v.optional(v.string()),
    type: v.optional(vCitationType),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const rangeMs = (args.rangeDays ?? 30) * 24 * 60 * 60 * 1000;
    const rangeStart = Date.now() - rangeMs;

    const selectedRuns = (await collectRunsSince(ctx, rangeStart))
      .filter(
        (run) =>
          (!args.provider || run.providerSlug === args.provider) &&
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
          promptExcerpts: uniqueStrings(
            entry.citations.map((citation) => {
              const run = runById.get(citation.promptRunId);
              return run
                ? promptById.get(run.promptId)?.promptText
                  ? promptExcerptFor(promptById.get(run.promptId)!)
                  : run.promptExcerpt
                : undefined;
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
                promptExcerpt: promptExcerptForRun(run, prompt),
                providerName: providerNameForRun(run),
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
                promptExcerpt: string;
                providerName: string;
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
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rangeDays = args.rangeDays ?? 30;
    const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
    const referenceTime = Date.now();
    const currentStart = referenceTime - rangeMs;
    const previousStart = referenceTime - rangeMs * 2;

    const filteredRuns = (await collectRunsSince(ctx, previousStart)).filter(
      (run) =>
        (args.provider ? run.providerSlug === args.provider : true) &&
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
    const promptById = new Map(prompts.map((prompt) => [prompt._id, prompt]));
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

    const providerSet = new Set<string>(
      [
        ...currentSuccessfulRuns.map((run) => providerNameForRun(run)),
        ...previousSuccessfulRuns.map((run) => providerNameForRun(run)),
      ].filter((name): name is string => Boolean(name?.trim()))
    );
    const providerComparison = [...providerSet]
      .map((providerName) => {
        const providerCurrent = currentSuccessfulRuns.filter(
          (run) => providerNameForRun(run) === providerName
        );
        const providerPrevious = previousSuccessfulRuns.filter(
          (run) => providerNameForRun(run) === providerName
        );
        const providerCurrentMetrics = summarizeRunMetrics(providerCurrent);
        const providerPreviousMetrics = summarizeRunMetrics(providerPrevious);
        return {
          provider: providerName,
          runCount: providerCurrentMetrics.runCount,
          visibility: providerCurrentMetrics.visibility,
          citationQuality: providerCurrentMetrics.citationQuality,
          averagePosition: providerCurrentMetrics.position,
          deltaVisibility:
            providerCurrentMetrics.visibility !== undefined &&
            providerPreviousMetrics.visibility !== undefined
              ? providerCurrentMetrics.visibility -
                providerPreviousMetrics.visibility
              : undefined,
          deltaCitationQuality:
            providerCurrentMetrics.citationQuality !== undefined &&
            providerPreviousMetrics.citationQuality !== undefined
              ? providerCurrentMetrics.citationQuality -
                providerPreviousMetrics.citationQuality
              : undefined,
          deltaPosition:
            providerCurrentMetrics.position !== undefined &&
            providerPreviousMetrics.position !== undefined
              ? providerCurrentMetrics.position -
                providerPreviousMetrics.position
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
          excerpt: promptExcerptFor(prompt),
          providerName: providerNameForRun(latestRun),
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
      providerComparison,
      promptComparison,
      topSources,
      domainTypeBreakdown,
      entityLeaderboard,
      recentRuns: currentRuns.slice(0, 8).map((run) => ({
        _id: run._id,
        startedAt: run.startedAt,
        promptExcerpt: promptExcerptForRun(run, promptById.get(run.promptId)),
        providerName: providerNameForRun(run),
        status: run.status,
        finishedAt: run.finishedAt,
        latencyMs: run.latencyMs,
        sourceCount: run.sourceCount,
        citationCount: currentCitationsByRun.get(run._id)?.length ?? 0,
      })),
    };
  },
});
