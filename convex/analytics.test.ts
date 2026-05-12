/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("ensureProvidersSeeded creates OpenAI and Google AI Mode providers", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(api.analytics.ensureProvidersSeeded, {});
  const slugs = new Set(seeded.map((p) => p.slug));
  expect(slugs.has("openai")).toBe(true);
  expect(slugs.has("google-ai-mode")).toBe(true);
});

test("createPrompt rejects empty text", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.analytics.createPrompt, { promptText: "   " })
  ).rejects.toThrow(/required/i);
});

test("prompt categorisation supports groups, filters, and uncategorized defaults", async () => {
  const t = convexTest(schema, modules);
  const entityId = await t.mutation(api.analytics.createTrackedEntity, {
    name: "OpenPeec",
    kind: "brand",
    ownedDomains: ["openpeec.ai"],
  });
  const promptGroupId = await t.mutation(api.analytics.createPromptGroup, {
    entityId,
    name: "Category discovery",
    intentCategory: "category_discovery",
    sentimentLens: "neutral",
  });
  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "What are the best AI visibility tools?",
    entityId,
    promptGroupId,
    intentCategory: "category_discovery",
    sentimentLens: "neutral",
    funnelStage: "awareness",
    audience: "SEO marketers",
    topic: "AI visibility",
    priority: "high",
    reviewState: "approved",
    generatedBy: "manual",
    generationRationale: "Tracks unaided category discovery.",
    sourceUrls: ["https://openpeec.ai"],
  });
  await t.mutation(api.analytics.createPrompt, {
    promptText: "Legacy prompt without categorisation.",
  });

  const categoryPrompts = await t.query(api.analytics.listPrompts, {
    intentCategory: "category_discovery",
  });
  expect(categoryPrompts).toHaveLength(1);
  expect(categoryPrompts[0]).toMatchObject({
    _id: promptId,
    entityName: "OpenPeec",
    promptGroupName: "Category discovery",
    sentimentLens: "neutral",
    reviewState: "approved",
    generatedBy: "manual",
  });

  const uncategorized = await t.query(api.analytics.listPrompts, {
    intentCategory: "uncategorized",
  });
  expect(uncategorized.map((prompt) => prompt.promptText)).toContain(
    "Legacy prompt without categorisation."
  );

  await t.mutation(api.analytics.updatePrompt, {
    id: promptId,
    sentimentLens: "comparative",
    reviewState: "draft",
    promptGroupId: null,
  });
  const drafts = await t.query(api.analytics.listPrompts, {
    reviewState: "draft",
  });
  expect(drafts[0]).toMatchObject({
    _id: promptId,
    sentimentLens: "comparative",
  });
  expect(drafts[0].promptGroupId).toBeUndefined();
});

test("group and entity scoped runs snapshot prompt categorisation", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});
  const entityId = await t.mutation(api.analytics.createTrackedEntity, {
    name: "OpenPeec",
    kind: "brand",
    ownedDomains: ["openpeec.ai"],
  });
  const promptGroupId = await t.mutation(api.analytics.createPromptGroup, {
    entityId,
    name: "Risk perception",
    intentCategory: "risk_objection",
    sentimentLens: "negative",
  });
  await t.mutation(api.analytics.createPrompt, {
    promptText: "What are common complaints about OpenPeec?",
    promptGroupId,
    intentCategory: "risk_objection",
    sentimentLens: "negative",
    reviewState: "approved",
  });
  await t.mutation(api.analytics.createPrompt, {
    promptText: "Draft prompt should not run by default.",
    entityId,
    promptGroupId,
    intentCategory: "risk_objection",
    sentimentLens: "negative",
    reviewState: "draft",
  });

  const groupResult = await t.mutation(api.analytics.triggerPromptGroupNow, {
    promptGroupId,
    label: "risk-test",
    browserEngine: "playwright",
    providerSlugs: ["openai"],
  });
  expect(groupResult.queuedCount).toBe(1);

  const runs = await t.query(api.analytics.listPromptRuns, { limit: 5 });
  expect(runs[0]).toMatchObject({
    entityId,
    promptGroupId,
    promptGroupName: "Risk perception",
    intentCategory: "risk_objection",
    sentimentLens: "negative",
    reviewState: "approved",
  });

  const entityResult = await t.mutation(api.analytics.triggerEntityPromptsNow, {
    entityId,
    label: "entity-test",
    browserEngine: "playwright",
    providerSlugs: ["openai"],
  });
  expect(entityResult.queuedCount).toBe(1);
});

test("entity prompt generation creates draft groups and deduplicates prompts", async () => {
  const t = convexTest(schema, modules);
  const entityId = await t.mutation(api.analytics.createTrackedEntity, {
    name: "OpenPeec",
    kind: "brand",
    aliases: ["Open Peec"],
    ownedDomains: ["openpeec.ai"],
  });
  const generationId = await t.mutation(
    api.analytics.queueEntityPromptGeneration,
    {
      entityId,
      websiteUrl: "https://openpeec.ai",
      researchSummary: "OpenPeec tracks AI visibility.",
    }
  );
  const claimed = await t.mutation(
    api.analytics.claimNextEntityPromptGeneration,
    {
      runner: "convex-prompt-generation-test",
      maxConcurrent: 1,
    }
  );
  expect(claimed?.generationId).toBe(generationId);
  expect(claimed?.entity.name).toBe("OpenPeec");

  const completed = await t.mutation(
    api.analytics.completeEntityPromptGeneration,
    {
      generationId,
      status: "success",
      model: "gpt-5.5:medium",
      entitySummary: "OpenPeec monitors AI answers.",
      competitorNotes: "No competitors supplied.",
      warnings: [],
      groups: [
        {
          name: "Category discovery",
          slug: "category-discovery",
          description: "Unaided category prompts.",
          intentCategory: "category_discovery",
          sentimentLens: "neutral",
          sortOrder: 0,
          prompts: [
            {
              promptText: "What are the best AI visibility tools?",
              intentCategory: "category_discovery",
              sentimentLens: "neutral",
              funnelStage: "awareness",
              audience: "SEO marketers",
              topic: "AI visibility",
              priority: "high",
              rationale: "Tests unaided recommendation visibility.",
              sourceUrls: ["https://openpeec.ai"],
            },
            {
              promptText: "What are the best AI visibility tools?",
              intentCategory: "category_discovery",
              sentimentLens: "neutral",
              funnelStage: "awareness",
              audience: "SEO marketers",
              topic: "AI visibility",
              priority: "high",
              rationale: "Duplicate prompt.",
              sourceUrls: ["https://openpeec.ai"],
            },
          ],
        },
      ],
    }
  );
  expect(completed.generatedGroupCount).toBe(1);
  expect(completed.generatedPromptCount).toBe(1);

  const groups = await t.query(api.analytics.listPromptGroups, { entityId });
  expect(groups[0]).toMatchObject({
    name: "Category discovery",
    intentCategory: "category_discovery",
    promptCount: 1,
    approvedPromptCount: 0,
  });
  const prompts = await t.query(api.analytics.listPrompts, {
    entityId,
    generatedBy: "codex",
  });
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toMatchObject({
    reviewState: "draft",
    generationRationale: "Tests unaided recommendation visibility.",
    sourceUrls: ["https://openpeec.ai"],
  });
});

test("queue workflow: enqueue single-provider run, claim group, complete success", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});

  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "OpenPeec convex-test deterministic prompt body.",
  });

  const { queuedCount } = await t.mutation(
    api.analytics.triggerSelectedPromptsNow,
    {
      promptIds: [promptId],
      label: "convex-test-queue",
      browserEngine: "playwright",
      providerSlugs: ["openai"],
    }
  );
  expect(queuedCount).toBe(1);

  const queueBefore = await t.query(api.analytics.getQueueStatus, {});
  expect(queueBefore.queuedCount).toBe(1);

  const claimed = await t.mutation(
    api.analytics.claimNextQueuedPromptRunGroup,
    {
      browserEngine: "playwright",
      runner: "convex-test-runner",
      maxConcurrent: 1,
    }
  );
  expect(claimed).not.toBeNull();
  expect(claimed!.runs).toHaveLength(1);
  expect(claimed!.runs[0].prompt.promptText).toContain("deterministic");

  const finishedAt = Date.now();
  await t.mutation(api.analytics.completePromptRun, {
    runId: claimed!.runs[0].runId,
    status: "success",
    finishedAt,
    latencyMs: 50,
    responseText: "Fixture assistant body for convex-test.",
    responseSummary: "Success (test)",
    citations: [
      {
        domain: "example.com",
        url: "https://example.com/openpeec-guide",
        title: "Guide",
        snippet: "Docs",
        type: "docs",
        position: 1,
        qualityScore: 0.9,
      },
    ],
    runner: "convex-test-runner",
    browserEngine: "playwright",
  });

  const runs = await t.query(api.analytics.listPromptRuns, {
    promptId,
    limit: 5,
  });
  expect(runs[0]?.status).toBe("success");

  const queueAfter = await t.query(api.analytics.getQueueStatus, {});
  expect(queueAfter.queuedCount).toBe(0);
});

test("successful runs queue Codex mention analysis and merge enriched mentions", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});
  const entityId = await t.mutation(api.analytics.createTrackedEntity, {
    name: "OpenPeec",
    kind: "brand",
    aliases: ["Open Peec"],
    ownedDomains: ["openpeec.ai"],
  });
  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "Which AI visibility tools should I compare?",
  });

  await t.mutation(api.analytics.triggerSelectedPromptsNow, {
    promptIds: [promptId],
    label: "mention-analysis-test",
    browserEngine: "playwright",
    providerSlugs: ["openai"],
  });
  const claimedRun = await t.mutation(
    api.analytics.claimNextQueuedPromptRunGroup,
    {
      browserEngine: "playwright",
      runner: "convex-test-runner",
      maxConcurrent: 1,
    }
  );
  expect(claimedRun).not.toBeNull();
  await t.mutation(api.analytics.completePromptRun, {
    runId: claimedRun!.runs[0].runId,
    status: "success",
    finishedAt: Date.now(),
    responseText:
      "OpenPeec is strong for citation monitoring. Acme Rival appears in enterprise comparisons.",
    responseSummary: "OpenPeec and Acme Rival were mentioned.",
    citations: [
      {
        domain: "openpeec.ai",
        url: "https://openpeec.ai/",
        title: "OpenPeec",
        type: "corporate",
        position: 1,
        qualityScore: 0.9,
      },
    ],
    runner: "convex-test-runner",
    browserEngine: "playwright",
  });

  const claimedAnalysis = await t.mutation(
    api.analytics.claimNextRunMentionAnalysis,
    {
      runner: "convex-mention-worker",
      maxConcurrent: 1,
    }
  );
  expect(claimedAnalysis).not.toBeNull();
  expect(claimedAnalysis!.deterministicMentions[0]?.name).toBe("OpenPeec");

  const result = await t.mutation(api.analytics.completeRunMentionAnalysis, {
    analysisId: claimedAnalysis!.analysisId,
    status: "success",
    model: "gpt-5.5:medium",
    mentions: [
      {
        trackedEntityId: entityId,
        name: "OpenPeec",
        mentionCount: 1,
        sentiment: "positive",
        confidence: 0.95,
        evidence: "OpenPeec is strong for citation monitoring.",
        matchedTerms: ["OpenPeec"],
      },
      {
        name: "Acme Rival",
        slug: "acme-rival",
        kind: "competitor",
        mentionCount: 1,
        sentiment: "neutral",
        confidence: 0.86,
        evidence: "Acme Rival appears in enterprise comparisons.",
        matchedTerms: ["Acme Rival"],
      },
    ],
    warnings: [],
  });
  expect(result.codexMentionCount).toBe(2);
  expect(result.candidateMentionCount).toBe(1);

  const runDetail = await t.query(api.analytics.getPromptRun, {
    id: claimedRun!.runs[0].runId,
  });
  const openPeecMention = runDetail!.mentions.find(
    (mention) => mention.name === "OpenPeec"
  );
  expect(openPeecMention?.detectionSource).toBe("deterministic");
  expect(openPeecMention?.sentiment).toBe("positive");
  expect(openPeecMention?.confidence).toBe(0.95);
  const candidateMention = runDetail!.mentions.find(
    (mention) => mention.name === "Acme Rival"
  );
  expect(candidateMention?.detectionSource).toBe("codex");
  expect(candidateMention?.entityId).toBeUndefined();
});

test("queued prompt runs can be cancelled or deleted", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});

  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "Queued run management prompt.",
  });

  await t.mutation(api.analytics.triggerSelectedPromptsNow, {
    promptIds: [promptId],
    label: "cancel-test",
    browserEngine: "playwright",
    providerSlugs: ["openai"],
  });
  const cancellableRuns = await t.query(api.analytics.listPromptRuns, {
    promptId,
    limit: 5,
  });
  const cancellableRun = cancellableRuns.find((run) => run.status === "queued");
  expect(cancellableRun).toBeDefined();

  await t.mutation(api.analytics.cancelPromptRun, {
    runId: cancellableRun!._id,
  });
  const cancelledRuns = await t.query(api.analytics.listPromptRuns, {
    promptId,
    limit: 5,
  });
  expect(
    cancelledRuns.find((run) => run._id === cancellableRun!._id)?.status
  ).toBe("failed");

  await t.mutation(api.analytics.triggerSelectedPromptsNow, {
    promptIds: [promptId],
    label: "delete-test",
    browserEngine: "playwright",
    providerSlugs: ["openai"],
  });
  const deletableRuns = await t.query(api.analytics.listPromptRuns, {
    promptId,
    limit: 5,
  });
  const deletableRun = deletableRuns.find((run) => run.status === "queued");
  expect(deletableRun).toBeDefined();

  await t.mutation(api.analytics.deletePromptRun, {
    runId: deletableRun!._id,
  });
  const remainingRuns = await t.query(api.analytics.listPromptRuns, {
    promptId,
    limit: 5,
  });
  expect(remainingRuns.some((run) => run._id === deletableRun!._id)).toBe(
    false
  );
  const queueStatus = await t.query(api.analytics.getQueueStatus, {});
  expect(queueStatus.queuedCount).toBe(0);
});

test("tracked entity round-trip", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.analytics.createTrackedEntity, {
    name: "Convex Test Brand",
    kind: "brand",
    ownedDomains: ["example-brand.test"],
  });
  const list = await t.query(api.analytics.listTrackedEntities, {});
  expect(
    list.some((row) => row._id === id && row.name === "Convex Test Brand")
  ).toBe(true);
});
