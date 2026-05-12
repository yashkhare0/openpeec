import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { derivePromptExcerpt } from "../src/lib/prompting";

const SCHEMA_MIGRATION_ID = "prompt_run_prompt_excerpt_v1";

export const kickPromptRunExcerptBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const marker = await ctx.db
      .query("schemaMigrations")
      .withIndex("name", (q) => q.eq("name", SCHEMA_MIGRATION_ID))
      .unique();

    if (marker?.completedAt) {
      return { status: "already_done" as const };
    }
    if (!marker) {
      await ctx.db.insert("schemaMigrations", {
        name: SCHEMA_MIGRATION_ID,
        startedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillPromptRunExcerptPage,
        { cursor: null, patchedTotal: 0 },
      );
      return { status: "started" as const };
    }

    // Convex restarted mid-batch; reschedule (idempotent patches).
    await ctx.scheduler.runAfter(
      0,
      internal.migrations.backfillPromptRunExcerptPage,
      { cursor: null, patchedTotal: 0 },
    );
    return { status: "resumed" as const };
  },
});

export const backfillPromptRunExcerptPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    patchedTotal: v.float64(),
  },
  handler: async (ctx, args) => {
    const PAGE_SIZE = 100;
    const res = await ctx.db
      .query("promptRuns")
      .order("desc")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });

    let patchedBatch = 0;
    for (const run of res.page) {
      if (typeof run.promptExcerpt === "string" && run.promptExcerpt.trim() !== "") {
        continue;
      }
      const prompt = await ctx.db.get(run.promptId);
      const excerpt =
        prompt != null
          ? derivePromptExcerpt(prompt.promptText)
          : "(deleted prompt)";
      await ctx.db.patch(run._id, { promptExcerpt: excerpt });
      patchedBatch += 1;
    }

    const nextTotal = args.patchedTotal + patchedBatch;
    if (!res.continueCursor) {
      const row = await ctx.db
        .query("schemaMigrations")
        .withIndex("name", (q) => q.eq("name", SCHEMA_MIGRATION_ID))
        .unique();
      if (row) {
        await ctx.db.patch(row._id, {
          completedAt: Date.now(),
          patchedRuns: nextTotal,
        });
      }
      return { done: true, patchedTotal: nextTotal };
    }

    await ctx.scheduler.runAfter(0, internal.migrations.backfillPromptRunExcerptPage, {
      cursor: res.continueCursor,
      patchedTotal: nextTotal,
    });
    return { done: false, patchedTotal: nextTotal };
  },
});
