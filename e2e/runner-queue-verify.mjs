/**
 * Live integration: Convex HTTP client + one-shot queue worker against the
 * Playwright engine and `public/nodriver-fixture.html`. Invoked by Playwright
 * (see `runner-queue-live.spec.ts`) so `tsconfig.e2e` does not typecheck Convex.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function convexDeploymentUrl() {
  return process.env.E2E_CONVEX_URL?.trim() || "http://127.0.0.1:3210";
}

function fixtureProviderUrl() {
  return "http://127.0.0.1:5999/nodriver-fixture.html";
}

async function runQueueWorkerOnce() {
  const convexUrl = convexDeploymentUrl();
  const log = [];
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repoRoot, "runner/process-queued-runs.mjs"),
        "--config",
        "runner/example.playwright-queue-fixture.json",
        "--once",
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, VITE_CONVEX_URL: convexUrl },
      }
    );
    child.stdout?.on("data", (d) => log.push(String(d)));
    child.stderr?.on("data", (d) => log.push(String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`process-queued-runs exit ${code}\n${log.join("")}`));
    });
  });
}

async function main() {
  const client = new ConvexHttpClient(convexDeploymentUrl());
  await client.mutation(api.analytics.ensureProvidersSeeded, {});
  const providers = await client.query(api.analytics.listProviders, {});
  const openai = providers.find((p) => p.slug === "openai");
  const google = providers.find((p) => p.slug === "google-ai-mode");
  if (!openai || !google) {
    throw new Error("Expected OpenAI and Google AI Mode providers after seed.");
  }

  const originalOpenaiUrl = openai.url;
  const originalOpenaiSessionMode = openai.sessionMode ?? "stored";
  const originalOpenaiSubmitStrategy = openai.submitStrategy ?? "type";

  await client.mutation(api.analytics.updateProvider, {
    id: google._id,
    active: false,
  });
  await client.mutation(api.analytics.updateProvider, {
    id: openai._id,
    url: fixtureProviderUrl(),
    sessionMode: "guest",
    submitStrategy: "type",
  });

  const promptText =
    "OPENPEEC_E2E_RUNNER_PROMPT deterministic fixture visibility sentence.";
  let promptId = null;

  try {
    promptId = await client.mutation(api.analytics.createPrompt, {
      promptText,
    });

    const { queuedCount } = await client.mutation(
      api.analytics.triggerSelectedPromptsNow,
      {
        promptIds: [promptId],
        label: "e2e-playwright-queue-fixture",
        browserEngine: "playwright",
      }
    );
    if (queuedCount !== 1) {
      throw new Error(`Expected queuedCount 1, got ${queuedCount}`);
    }

    await runQueueWorkerOnce();

    const runs = await client.query(api.analytics.listPromptRuns, {
      promptId,
      limit: 10,
    });
    if (!runs.length || runs[0].status !== "success") {
      throw new Error(`Expected successful run, got ${JSON.stringify(runs[0])}`);
    }

    const detail = await client.query(api.analytics.getPromptRun, {
      id: runs[0]._id,
    });
    const body = detail.run.responseText ?? "";
    if (!body.includes("OpenPeec tracks")) {
      throw new Error(`Unexpected response body: ${body.slice(0, 200)}`);
    }
    if (detail.citations.length < 1) {
      throw new Error("Expected at least one extracted citation.");
    }
    if (!runs[0].runLabel?.includes("e2e-playwright-queue-fixture")) {
      throw new Error(`Unexpected runLabel: ${runs[0].runLabel}`);
    }
  } finally {
    await client.mutation(api.analytics.updateProvider, {
      id: openai._id,
      url: originalOpenaiUrl,
      sessionMode: originalOpenaiSessionMode,
      submitStrategy: originalOpenaiSubmitStrategy,
    });
    await client.mutation(api.analytics.updateProvider, {
      id: google._id,
      active: true,
    });
    if (promptId) {
      await client.mutation(api.analytics.deletePrompt, { id: promptId });
    }
  }
}

await main();
