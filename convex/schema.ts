import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Registered http request-sending jobs.
  jobs: defineTable({
    userId: v.id("users"),
    // This name is unrelated to the name of the actual cron itself. The latter
    // is an optional unique identifier across all crons whereas the name in
    // this table is just a convenient per-user name for showing in their UI.
    name: v.optional(v.string()),
    url: v.string(),
    method: v.string(), // "GET", "POST", etc.
    headers: v.optional(v.string()), // TODO: migrate to Record type when we add it
    body: v.optional(v.string()),
    cronId: v.optional(v.string()),
  }).index("userId", ["userId"]),

  // Web logs from outgoing requests.
  weblogs: defineTable({
    userId: v.id("users"),
    url: v.string(),
    method: v.string(),
    headers: v.optional(v.string()),
    body: v.optional(v.string()),
    status: v.float64(),
    response: v.string(),
  }).index("userId", ["userId"]),

  // Product-domain entities for local-first monitoring.
  monitors: defineTable({
    userId: v.id("users"),
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
  })
    .index("userId", ["userId"])
    .index("userId_client", ["userId", "client"]),

  authProfiles: defineTable({
    userId: v.id("users"),
    // Local-only reference to credentials. Raw secrets do not live in Convex.
    client: v.string(),
    name: v.string(),
    authType: v.union(v.literal("file"), v.literal("env"), v.literal("manual")),
    localRef: v.string(),
    notes: v.optional(v.string()),
    metadata: v.optional(v.string()),
    isDefault: v.boolean(),
  })
    .index("userId", ["userId"])
    .index("userId_client", ["userId", "client"]),

  deepLinkTemplates: defineTable({
    userId: v.id("users"),
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
    .index("userId", ["userId"])
    .index("userId_client", ["userId", "client"])
    .index("userId_client_platform", ["userId", "client", "platform"]),

  monitorRuns: defineTable({
    userId: v.id("users"),
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
    startedAt: v.float64(),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    summary: v.optional(v.string()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    runner: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("userId_startedAt", ["userId", "startedAt"])
    .index("monitorId_startedAt", ["monitorId", "startedAt"]),

  // Analytics domain entities for visibility/citation monitoring.
  promptGroups: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.float64(),
  })
    .index("userId", ["userId"])
    .index("userId_sortOrder", ["userId", "sortOrder"]),

  prompts: defineTable({
    userId: v.id("users"),
    groupId: v.optional(v.id("promptGroups")),
    name: v.string(),
    promptText: v.string(),
    targetModel: v.string(),
    tags: v.optional(v.array(v.string())),
    active: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("userId_groupId", ["userId", "groupId"])
    .index("userId_active", ["userId", "active"]),

  trackedEntities: defineTable({
    userId: v.id("users"),
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
    .index("userId", ["userId"])
    .index("userId_slug", ["userId", "slug"])
    .index("userId_active", ["userId", "active"]),

  promptRuns: defineTable({
    userId: v.id("users"),
    promptId: v.id("prompts"),
    model: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
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
  })
    .index("userId", ["userId"])
    .index("userId_startedAt", ["userId", "startedAt"])
    .index("promptId_startedAt", ["promptId", "startedAt"])
    .index("userId_model_startedAt", ["userId", "model", "startedAt"]),

  citations: defineTable({
    userId: v.id("users"),
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
    .index("userId", ["userId"])
    .index("promptRunId", ["promptRunId"])
    .index("userId_domain", ["userId", "domain"])
    .index("userId_type", ["userId", "type"]),
});
