import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

const vPlatform = v.union(
  v.literal("web"),
  v.literal("desktop"),
  v.literal("ios"),
  v.literal("android")
);

const vRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failed")
);

type PatchObject = Record<string, unknown>;

function compactPatch<T extends PatchObject>(patch: T): PatchObject {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
}

async function requireUserId(ctx: any): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId == null) {
    throw new Error("User not found");
  }
  return userId;
}

function assertChatGptClient(client: string) {
  if (client !== "chatgpt") {
    throw new Error("Only chatgpt is supported in v0");
  }
}

async function unsetDefaultAuthProfiles(
  ctx: any,
  userId: Id<"users">,
  client: string,
  exceptId?: Id<"authProfiles">
) {
  const profiles = await ctx.db
    .query("authProfiles")
    .withIndex("userId_client", (q: any) =>
      q.eq("userId", userId).eq("client", client)
    )
    .collect();
  await Promise.all(
    (profiles as any[])
      .filter((profile) => profile.isDefault && profile._id !== exceptId)
      .map((profile) => ctx.db.patch(profile._id, { isDefault: false }))
  );
}

async function unsetDefaultDeepLinks(
  ctx: any,
  userId: Id<"users">,
  client: string,
  platform: "web" | "desktop" | "ios" | "android",
  exceptId?: Id<"deepLinkTemplates">
) {
  const templates = await ctx.db
    .query("deepLinkTemplates")
    .withIndex("userId_client_platform", (q: any) =>
      q.eq("userId", userId).eq("client", client).eq("platform", platform)
    )
    .collect();
  await Promise.all(
    (templates as any[])
      .filter((template) => template.isDefault && template._id !== exceptId)
      .map((template) => ctx.db.patch(template._id, { isDefault: false }))
  );
}

export const createMonitor = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    client: v.string(),
    platform: vPlatform,
    enabled: v.optional(v.boolean()),
    schedule: v.optional(v.string()),
    authProfileId: v.optional(v.id("authProfiles")),
    deepLinkTemplateId: v.optional(v.id("deepLinkTemplates")),
    checkConfig: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertChatGptClient(args.client);
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("monitors", {
      userId,
      name: args.name,
      description: args.description,
      client: args.client,
      platform: args.platform,
      enabled: args.enabled ?? true,
      schedule: args.schedule,
      authProfileId: args.authProfileId,
      deepLinkTemplateId: args.deepLinkTemplateId,
      checkConfig: args.checkConfig,
    });
  },
});

export const listMonitors = query({
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("monitors")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const updateMonitor = mutation({
  args: {
    id: v.id("monitors"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    platform: v.optional(vPlatform),
    enabled: v.optional(v.boolean()),
    schedule: v.optional(v.string()),
    authProfileId: v.optional(v.id("authProfiles")),
    deepLinkTemplateId: v.optional(v.id("deepLinkTemplates")),
    checkConfig: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const monitor = await ctx.db.get(args.id);
    if (monitor == null) {
      throw new Error("Monitor not found");
    }
    if (monitor.userId !== userId) {
      throw new Error("User not authorized to update monitor");
    }

    const patch = compactPatch({
      name: args.name,
      description: args.description,
      platform: args.platform,
      enabled: args.enabled,
      schedule: args.schedule,
      authProfileId: args.authProfileId,
      deepLinkTemplateId: args.deepLinkTemplateId,
      checkConfig: args.checkConfig,
    });

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const deleteMonitor = mutation({
  args: { id: v.id("monitors") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const monitor = await ctx.db.get(args.id);
    if (monitor == null) {
      throw new Error("Monitor not found");
    }
    if (monitor.userId !== userId) {
      throw new Error("User not authorized to delete monitor");
    }

    const monitorRuns = await ctx.db
      .query("monitorRuns")
      .withIndex("monitorId_startedAt", (q) => q.eq("monitorId", args.id))
      .collect();
    await Promise.all(monitorRuns.map((run) => ctx.db.delete(run._id)));
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const createAuthProfile = mutation({
  args: {
    client: v.string(),
    name: v.string(),
    authType: v.union(v.literal("file"), v.literal("env"), v.literal("manual")),
    localRef: v.string(),
    notes: v.optional(v.string()),
    metadata: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertChatGptClient(args.client);
    const userId = await requireUserId(ctx);

    if (args.isDefault ?? false) {
      await unsetDefaultAuthProfiles(ctx, userId, args.client);
    }

    return await ctx.db.insert("authProfiles", {
      userId,
      client: args.client,
      name: args.name,
      authType: args.authType,
      localRef: args.localRef,
      notes: args.notes,
      metadata: args.metadata,
      isDefault: args.isDefault ?? false,
    });
  },
});

export const listAuthProfiles = query({
  args: {
    client: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.client) {
      return await ctx.db
        .query("authProfiles")
        .withIndex("userId_client", (q) =>
          q.eq("userId", userId).eq("client", args.client!)
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("authProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const updateAuthProfile = mutation({
  args: {
    id: v.id("authProfiles"),
    name: v.optional(v.string()),
    authType: v.optional(
      v.union(v.literal("file"), v.literal("env"), v.literal("manual"))
    ),
    localRef: v.optional(v.string()),
    notes: v.optional(v.string()),
    metadata: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.get(args.id);
    if (profile == null) {
      throw new Error("Auth profile not found");
    }
    if (profile.userId !== userId) {
      throw new Error("User not authorized to update auth profile");
    }

    if (args.isDefault === true) {
      await unsetDefaultAuthProfiles(ctx, userId, profile.client, args.id);
    }

    const patch = compactPatch({
      name: args.name,
      authType: args.authType,
      localRef: args.localRef,
      notes: args.notes,
      metadata: args.metadata,
      isDefault: args.isDefault,
    });

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const deleteAuthProfile = mutation({
  args: { id: v.id("authProfiles") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.get(args.id);
    if (profile == null) {
      throw new Error("Auth profile not found");
    }
    if (profile.userId !== userId) {
      throw new Error("User not authorized to delete auth profile");
    }
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const createDeepLinkTemplate = mutation({
  args: {
    client: v.string(),
    name: v.string(),
    platform: vPlatform,
    urlTemplate: v.string(),
    purpose: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertChatGptClient(args.client);
    const userId = await requireUserId(ctx);

    if (args.isDefault ?? false) {
      await unsetDefaultDeepLinks(ctx, userId, args.client, args.platform);
    }

    return await ctx.db.insert("deepLinkTemplates", {
      userId,
      client: args.client,
      name: args.name,
      platform: args.platform,
      urlTemplate: args.urlTemplate,
      purpose: args.purpose,
      isDefault: args.isDefault ?? false,
    });
  },
});

export const listDeepLinkTemplates = query({
  args: {
    client: v.optional(v.string()),
    platform: v.optional(vPlatform),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let templates = await ctx.db
      .query("deepLinkTemplates")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    if (args.client) {
      templates = templates.filter((template) => template.client === args.client);
    }
    if (args.platform) {
      templates = templates.filter(
        (template) => template.platform === args.platform
      );
    }
    return templates;
  },
});

export const updateDeepLinkTemplate = mutation({
  args: {
    id: v.id("deepLinkTemplates"),
    name: v.optional(v.string()),
    platform: v.optional(vPlatform),
    urlTemplate: v.optional(v.string()),
    purpose: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.id);
    if (template == null) {
      throw new Error("Deep link template not found");
    }
    if (template.userId !== userId) {
      throw new Error("User not authorized to update deep link template");
    }

    const nextPlatform = args.platform ?? template.platform;
    if (args.isDefault === true) {
      await unsetDefaultDeepLinks(ctx, userId, template.client, nextPlatform, args.id);
    }

    const patch = compactPatch({
      name: args.name,
      platform: args.platform,
      urlTemplate: args.urlTemplate,
      purpose: args.purpose,
      isDefault: args.isDefault,
    });

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const deleteDeepLinkTemplate = mutation({
  args: { id: v.id("deepLinkTemplates") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.id);
    if (template == null) {
      throw new Error("Deep link template not found");
    }
    if (template.userId !== userId) {
      throw new Error("User not authorized to delete deep link template");
    }
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const createMonitorRun = mutation({
  args: {
    monitorId: v.id("monitors"),
    status: vRunStatus,
    startedAt: v.float64(),
    client: v.optional(v.string()),
    platform: v.optional(vPlatform),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    summary: v.optional(v.string()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    runner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const monitor = await ctx.db.get(args.monitorId);
    if (monitor == null) {
      throw new Error("Monitor not found");
    }
    if (monitor.userId !== userId) {
      throw new Error("User not authorized to create run for monitor");
    }

    return await ctx.db.insert("monitorRuns", {
      userId,
      monitorId: args.monitorId,
      client: args.client ?? monitor.client,
      platform: args.platform ?? monitor.platform,
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      latencyMs: args.latencyMs,
      summary: args.summary,
      deeplinkUsed: args.deeplinkUsed,
      evidencePath: args.evidencePath,
      output: args.output,
      runner: args.runner,
    });
  },
});

// Optional local-runner ingestion path. If PEEC_RUN_INGEST_KEY is configured in
// Convex env, caller must provide matching ingestKey.
export const ingestMonitorRun = mutation({
  args: {
    monitorId: v.id("monitors"),
    status: vRunStatus,
    startedAt: v.float64(),
    client: v.optional(v.string()),
    platform: v.optional(vPlatform),
    finishedAt: v.optional(v.float64()),
    latencyMs: v.optional(v.float64()),
    summary: v.optional(v.string()),
    deeplinkUsed: v.optional(v.string()),
    evidencePath: v.optional(v.string()),
    output: v.optional(v.string()),
    runner: v.optional(v.string()),
    ingestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const monitor = await ctx.db.get(args.monitorId);
    if (monitor == null) {
      throw new Error("Monitor not found");
    }

    const requiredIngestKey = process.env.PEEC_RUN_INGEST_KEY;
    if (requiredIngestKey && args.ingestKey !== requiredIngestKey) {
      throw new Error("Invalid ingest key");
    }

    return await ctx.db.insert("monitorRuns", {
      userId: monitor.userId,
      monitorId: args.monitorId,
      client: args.client ?? monitor.client,
      platform: args.platform ?? monitor.platform,
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      latencyMs: args.latencyMs,
      summary: args.summary,
      deeplinkUsed: args.deeplinkUsed,
      evidencePath: args.evidencePath,
      output: args.output,
      runner: args.runner ?? "local-playwright",
    });
  },
});

export const listMonitorRuns = query({
  args: {
    monitorId: v.optional(v.id("monitors")),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)));

    if (args.monitorId) {
      const monitor = await ctx.db.get(args.monitorId);
      if (monitor == null) {
        throw new Error("Monitor not found");
      }
      if (monitor.userId !== userId) {
        throw new Error("User not authorized to list runs for monitor");
      }
      return await ctx.db
        .query("monitorRuns")
        .withIndex("monitorId_startedAt", (q) => q.eq("monitorId", args.monitorId!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("monitorRuns")
      .withIndex("userId_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
