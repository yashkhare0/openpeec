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

test("queue workflow: enqueue single-provider run, claim group, complete success", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});
  const providers = await t.query(api.analytics.listProviders, {});
  const google = providers.find((p) => p.slug === "google-ai-mode");
  expect(google).toBeDefined();
  await t.mutation(api.analytics.updateProvider, {
    id: google!._id,
    active: false,
  });

  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "OpenPeec convex-test deterministic prompt body.",
  });

  const { queuedCount } = await t.mutation(
    api.analytics.triggerSelectedPromptsNow,
    {
      promptIds: [promptId],
      label: "convex-test-queue",
      browserEngine: "playwright",
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

test("queued prompt runs can be cancelled or deleted", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.analytics.ensureProvidersSeeded, {});
  const providers = await t.query(api.analytics.listProviders, {});
  const google = providers.find((p) => p.slug === "google-ai-mode");
  expect(google).toBeDefined();
  await t.mutation(api.analytics.updateProvider, {
    id: google!._id,
    active: false,
  });

  const promptId = await t.mutation(api.analytics.createPrompt, {
    promptText: "Queued run management prompt.",
  });

  await t.mutation(api.analytics.triggerSelectedPromptsNow, {
    promptIds: [promptId],
    label: "cancel-test",
    browserEngine: "playwright",
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
