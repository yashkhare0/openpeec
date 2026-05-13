import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

export default defineSchema({
  // Registered http request-sending jobs.
  jobs: defineTable({
    // This name is unrelated to the name of the actual cron itself. The latter
    // is an optional unique identifier across all crons whereas the name in
    // this table is just a convenient per-user name for showing in their UI.
    name: v.optional(v.string()),
    url: v.string(),
    method: v.string(), // "GET", "POST", etc.
    headers: v.optional(v.string()), // TODO: migrate to Record type when we add it
    body: v.optional(v.string()),
    cronId: v.optional(v.string()),
  }),

  /** One row per bootstrap / schema data backfill tracked in Convex. */
  schemaMigrations: defineTable({
    name: v.string(),
    startedAt: v.optional(v.float64()),
    completedAt: v.optional(v.float64()),
    patchedRuns: v.optional(v.float64()),
  }).index("name", ["name"]),

  // Web logs from outgoing requests.
  weblogs: defineTable({
    url: v.string(),
    method: v.string(),
    headers: v.optional(v.string()),
    body: v.optional(v.string()),
    status: v.float64(),
    response: v.string(),
  }),

  // Product-domain entities for local-first monitoring.
  monitors: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    // ChatGPT is the only real client in v0.
    client: v.string(),
    platform: v.union(
      v.literal("web"),
      v.literal("desktop"),
      v.literal("ios"),
      v.literal("android")
    ),
    enabled: v.boolean(),
    schedule: v.optional(v.string()),
    authProfileId: v.optional(v.id("authProfiles")),
    deepLinkTemplateId: v.optional(v.id("deepLinkTemplates")),
    checkConfig: v.optional(v.string()),
  }).index("client", ["client"]),

  authProfiles: defineTable({
    // Local-only reference to credentials. Raw secrets do not live in Convex.
    client: v.string(),
    name: v.string(),
    authType: v.union(v.literal("file"), v.literal("env"), v.literal("manual")),
    localRef: v.string(),
    notes: v.optional(v.string()),
    metadata: v.optional(v.string()),
    isDefault: v.boolean(),
  }).index("client", ["client"]),

  deepLinkTemplates: defineTable({
    client: v.string(),
    name: v.string(),
    platform: v.union(
      v.literal("web"),
      v.literal("desktop"),
      v.literal("ios"),
      v.literal("android")
    ),
    urlTemplate: v.string(),
    purpose: v.optional(v.string()),
    isDefault: v.boolean(),
  })
    .index("client", ["client"])
    .index("client_platform", ["client", "platform"]),

  monitorRuns: defineTable({
    monitorId: v.id("monitors"),
    client: v.string(),
    platform: v.union(
      v.literal("web"),
      v.literal("desktop"),
      v.literal("ios"),
      v.literal("android")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("blocked"),
      v.literal("success"),
      v.literal("failed")
    ),
    queuedAt: v.optional(v.float64()),
    startedAt: v.float64(),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    summary: v.optional(v.string()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    runner: v.optional(v.string()),
  })
    .index("startedAt", ["startedAt"])
    .index("monitorId_startedAt", ["monitorId", "startedAt"]),

  // Analytics domain entities for visibility/citation monitoring.
  providers: defineTable({
    slug: v.string(),
    name: v.string(),
    url: v.string(),
    channelSlug: v.optional(v.string()),
    channelName: v.optional(v.string()),
    transport: v.optional(v.literal("browser")),
    sessionMode: v.optional(v.union(v.literal("guest"), v.literal("stored"))),
    sessionProfileDir: v.optional(v.string()),
    promptQueryParam: v.optional(v.string()),
    submitStrategy: v.optional(
      v.union(v.literal("type"), v.literal("deeplink"))
    ),
    sessionJson: v.optional(v.string()),
    active: v.boolean(),
  })
    .index("slug", ["slug"])
    .index("active", ["active"]),

  prompts: defineTable({
    promptText: v.string(),
    entityId: v.optional(v.id("trackedEntities")),
    promptGroupId: v.optional(v.id("promptGroups")),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    funnelStage: v.optional(vPromptFunnelStage),
    audience: v.optional(v.string()),
    topic: v.optional(v.string()),
    priority: v.optional(vPromptPriority),
    generatedBy: v.optional(vPromptGeneratedBy),
    generationRationale: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    sourceGenerationId: v.optional(v.id("entityPromptGenerationRuns")),
    createdAt: v.optional(v.float64()),
    updatedAt: v.optional(v.float64()),
    active: v.boolean(),
  })
    .index("active", ["active"])
    .index("entityId", ["entityId"])
    .index("promptGroupId", ["promptGroupId"])
    .index("entityId_promptGroupId", ["entityId", "promptGroupId"]),

  promptGroups: defineTable({
    entityId: v.optional(v.id("trackedEntities")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    intentCategory: vPromptIntentCategory,
    sentimentLens: vPromptSentimentLens,
    active: v.boolean(),
    archivedAt: v.optional(v.float64()),
    systemManaged: v.boolean(),
    sortOrder: v.optional(v.float64()),
    sourceGenerationId: v.optional(v.id("entityPromptGenerationRuns")),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("slug", ["slug"])
    .index("entityId", ["entityId"])
    .index("entityId_active", ["entityId", "active"]),

  promptJobs: defineTable({
    name: v.string(),
    promptIds: v.array(v.id("prompts")),
    schedule: v.optional(v.string()),
    enabled: v.boolean(),
    cronId: v.optional(v.string()),
    lastTriggeredAt: v.optional(v.float64()),
    lastQueuedCount: v.optional(v.float64()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  }).index("enabled", ["enabled"]),

  trackedEntities: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.union(
      v.literal("brand"),
      v.literal("competitor"),
      v.literal("product"),
      v.literal("feature"),
      v.literal("other")
    ),
    aliases: v.optional(v.array(v.string())),
    ownedDomains: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    active: v.boolean(),
  })
    .index("slug", ["slug"])
    .index("active", ["active"]),

  promptRuns: defineTable({
    runGroupId: v.optional(v.string()),
    runGroupQueuedAt: v.optional(v.float64()),
    promptId: v.id("prompts"),
    entityId: v.optional(v.id("trackedEntities")),
    promptGroupId: v.optional(v.id("promptGroups")),
    promptGroupName: v.optional(v.string()),
    intentCategory: v.optional(vPromptIntentCategory),
    sentimentLens: v.optional(vPromptSentimentLens),
    funnelStage: v.optional(vPromptFunnelStage),
    audience: v.optional(v.string()),
    topic: v.optional(v.string()),
    priority: v.optional(vPromptPriority),
    /** Optional for legacy runs ingested before provider snapshot fields existed */
    providerId: v.optional(v.id("providers")),
    providerSlug: v.optional(v.string()),
    providerName: v.optional(v.string()),
    providerUrl: v.optional(v.string()),
    channelSlug: v.optional(v.string()),
    channelName: v.optional(v.string()),
    model: v.optional(v.string()),
    transport: v.optional(v.literal("browser")),
    sessionMode: v.optional(v.union(v.literal("guest"), v.literal("stored"))),
    sessionProfileDir: v.optional(v.string()),
    browserEngine: v.optional(
      v.union(
        v.literal("playwright"),
        v.literal("camoufox"),
        v.literal("nodriver")
      )
    ),
    promptQueryParam: v.optional(v.string()),
    submitStrategy: v.optional(
      v.union(v.literal("type"), v.literal("deeplink"))
    ),
    promptExcerpt: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("blocked"),
      v.literal("success"),
      v.literal("failed")
    ),
    attempt: v.optional(v.float64()),
    retryOfRunId: v.optional(v.id("promptRuns")),
    queuedAt: v.optional(v.float64()),
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
    runner: v.optional(v.string()),
    ingestId: v.optional(v.string()),
  })
    .index("startedAt", ["startedAt"])
    .index("status_startedAt", ["status", "startedAt"])
    .index("runGroupId", ["runGroupId"])
    .index("runGroupId_startedAt", ["runGroupId", "startedAt"])
    .index("promptId_startedAt", ["promptId", "startedAt"])
    .index("entityId_startedAt", ["entityId", "startedAt"])
    .index("promptGroupId_startedAt", ["promptGroupId", "startedAt"])
    .index("providerSlug_startedAt", ["providerSlug", "startedAt"])
    .index("ingestId", ["ingestId"]),

  citations: defineTable({
    promptRunId: v.id("promptRuns"),
    domain: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    snippet: v.optional(v.string()),
    type: v.union(
      v.literal("ugc"),
      v.literal("editorial"),
      v.literal("corporate"),
      v.literal("docs"),
      v.literal("social"),
      v.literal("other")
    ),
    position: v.float64(),
    qualityScore: v.optional(v.float64()),
    trackedEntityId: v.optional(v.id("trackedEntities")),
    trackedEntityName: v.optional(v.string()),
    trackedEntitySlug: v.optional(v.string()),
    trackedEntityKind: v.optional(
      v.union(
        v.literal("brand"),
        v.literal("competitor"),
        v.literal("product"),
        v.literal("feature"),
        v.literal("other")
      )
    ),
    isOwned: v.boolean(),
  })
    .index("promptRunId", ["promptRunId"])
    .index("domain", ["domain"])
    .index("type", ["type"]),

  runMentionAnalyses: defineTable({
    promptRunId: v.id("promptRuns"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
    queuedAt: v.float64(),
    startedAt: v.optional(v.float64()),
    finishedAt: v.optional(v.float64()),
    runner: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    deterministicMentionCount: v.optional(v.float64()),
    codexMentionCount: v.optional(v.float64()),
    candidateMentionCount: v.optional(v.float64()),
  })
    .index("promptRunId", ["promptRunId"])
    .index("status_queuedAt", ["status", "queuedAt"]),

  entityPromptGenerationRuns: defineTable({
    entityId: v.id("trackedEntities"),
    status: vPromptGenerationStatus,
    queuedAt: v.float64(),
    startedAt: v.optional(v.float64()),
    finishedAt: v.optional(v.float64()),
    runner: v.optional(v.string()),
    model: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    researchSummary: v.optional(v.string()),
    entitySummary: v.optional(v.string()),
    competitorNotes: v.optional(v.string()),
    error: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    generatedPromptCount: v.optional(v.float64()),
    generatedGroupCount: v.optional(v.float64()),
  })
    .index("entityId_queuedAt", ["entityId", "queuedAt"])
    .index("status_queuedAt", ["status", "queuedAt"]),

  runEntityMentions: defineTable({
    promptRunId: v.id("promptRuns"),
    analysisId: v.optional(v.id("runMentionAnalyses")),
    trackedEntityId: v.optional(v.id("trackedEntities")),
    name: v.string(),
    slug: v.string(),
    kind: v.union(
      v.literal("brand"),
      v.literal("competitor"),
      v.literal("product"),
      v.literal("feature"),
      v.literal("other")
    ),
    mentionCount: v.float64(),
    citationCount: v.float64(),
    ownedCitationCount: v.float64(),
    matchedTerms: v.array(v.string()),
    detectionSource: v.optional(
      v.union(v.literal("deterministic"), v.literal("codex"))
    ),
    sentiment: v.optional(
      v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative"),
        v.literal("mixed")
      )
    ),
    confidence: v.optional(v.float64()),
    evidence: v.optional(v.string()),
  })
    .index("promptRunId", ["promptRunId"])
    .index("trackedEntityId", ["trackedEntityId"]),
});
