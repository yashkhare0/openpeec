import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";
import {
  readJsonFile,
  resolvePathIfRelative,
  runMonitor,
} from "./run-monitor.mjs";

function parseArgs(argv) {
  const args = {
    config: "runner/example.monitor.json",
    once: false,
    headed: false,
    pollIntervalMs: 10000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--config") {
      args.config = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--once") {
      args.once = true;
      continue;
    }
    if (token === "--headed") {
      args.headed = true;
      continue;
    }
    if (token === "--poll-interval-ms") {
      args.pollIntervalMs = Number(argv[index + 1] ?? args.pollIntervalMs);
      index += 1;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch {
    return "";
  }
}

function parseEnvValue(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const currentKey = line.slice(0, separator).trim();
    if (currentKey !== key) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

async function resolveConvexUrl() {
  if (process.env.VITE_CONVEX_URL) {
    return process.env.VITE_CONVEX_URL;
  }

  const cwd = process.cwd();
  const envLocal = await readEnvFile(path.join(cwd, ".env.local"));
  const fromLocal = parseEnvValue(envLocal, "VITE_CONVEX_URL");
  if (fromLocal) {
    return fromLocal;
  }

  const env = await readEnvFile(path.join(cwd, ".env"));
  return parseEnvValue(env, "VITE_CONVEX_URL");
}

function buildRunConfig(baseConfig, claimedRun) {
  return {
    ...baseConfig,
    promptId: claimedRun.prompt.id,
    runLabel: claimedRun.runLabel,
    model: claimedRun.prompt.targetModel || baseConfig.model || "chatgpt-web",
    navigation: {
      ...(baseConfig.navigation ?? {}),
      url: baseConfig.navigation?.url ?? "https://chatgpt.com/",
      promptQueryParam: baseConfig.navigation?.promptQueryParam,
    },
    prompt: {
      ...(baseConfig.prompt ?? {}),
      text: claimedRun.prompt.promptText,
    },
    ingest: {
      target: "none",
    },
  };
}

async function completeRunFromError(client, claimedRun, error) {
  const message = error instanceof Error ? error.message : String(error);
  await client.mutation(api.analytics.completePromptRun, {
    runId: claimedRun.runId,
    status: "failed",
    finishedAt: Date.now(),
    latencyMs: 0,
    responseSummary: message,
    warnings: [message],
    citations: [],
    runLabel: claimedRun.runLabel,
    runner: "local-playwright-worker",
  });
}

async function processClaimedRun(client, baseConfig, claimedRun, cliArgs) {
  const runConfig = buildRunConfig(baseConfig, claimedRun);

  try {
    const result = await runMonitor(runConfig, {
      headed: cliArgs.headed,
      ingest: false,
    });

    await client.mutation(api.analytics.completePromptRun, {
      runId: claimedRun.runId,
      status: result.status,
      finishedAt: result.finishedAt,
      latencyMs: result.latencyMs,
      responseText: result.responseText || undefined,
      responseSummary: result.responseSummary || result.summary,
      visibilityScore: result.visibilityScore,
      citationQualityScore: result.citationQualityScore,
      averageCitationPosition: result.averageCitationPosition ?? undefined,
      sourceCount: result.sourceCount,
      runLabel: result.runLabel,
      deeplinkUsed: result.deeplinkUsed,
      evidencePath: result.evidencePath ?? undefined,
      output: result.output ? JSON.stringify(result.output) : undefined,
      warnings: result.warnings?.length ? result.warnings : undefined,
      citations: result.citations,
      runner: "local-playwright-worker",
    });

    console.log(
      `[queue-worker] ${claimedRun.prompt.name}: ${result.status} with ${result.citations.length} citations`
    );
    return result.status === "success";
  } catch (error) {
    await completeRunFromError(client, claimedRun, error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[queue-worker] ${claimedRun.prompt.name}: ${message}`);
    return false;
  }
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const convexUrl = await resolveConvexUrl();
  if (!convexUrl) {
    throw new Error(
      "VITE_CONVEX_URL is required to process queued runs (env or .env.local)."
    );
  }

  const baseConfig = await readJsonFile(resolvePathIfRelative(cliArgs.config));
  const client = new ConvexHttpClient(convexUrl);
  let hadFailure = false;

  await client.mutation(api.analytics.recoverStaleRunningPromptRuns, {
    olderThanMs: 10 * 60 * 1000,
    runner: "local-playwright-worker",
    summary: "Recovered stale running job after worker interruption.",
  });

  while (true) {
    const claimedRun = await client.mutation(
      api.analytics.claimNextQueuedPromptRun,
      { runner: "local-playwright-worker" }
    );

    if (!claimedRun) {
      if (cliArgs.once) {
        break;
      }
      await sleep(cliArgs.pollIntervalMs);
      continue;
    }

    const ok = await processClaimedRun(client, baseConfig, claimedRun, cliArgs);
    hadFailure = hadFailure || !ok;
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[queue-worker] ${message}`);
  process.exit(1);
});
