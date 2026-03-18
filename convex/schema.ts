import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  promptGroups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.float64(),
  }).index("sortOrder", ["sortOrder"]),

  prompts: defineTable({
    groupId: v.optional(v.id("promptGroups")),
    name: v.string(),
    promptText: v.string(),
    targetModel: v.string(),
    tags: v.optional(v.array(v.string())),
    active: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("groupId", ["groupId"])
    .index("active", ["active"]),

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
    promptId: v.id("prompts"),
    model: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
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
  })
    .index("startedAt", ["startedAt"])
    .index("status_startedAt", ["status", "startedAt"])
    .index("promptId_startedAt", ["promptId", "startedAt"])
    .index("model_startedAt", ["model", "startedAt"]),

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
    isOwned: v.boolean(),
  })
    .index("promptRunId", ["promptRunId"])
    .index("domain", ["domain"])
    .index("type", ["type"]),
});
