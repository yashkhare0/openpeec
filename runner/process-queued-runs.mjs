import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";
import {
  getRunnerPreflight,
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
    maxConcurrent: undefined,
    maxAttempts: undefined,
    staleThresholdMs: undefined,
    staleRecoveryIntervalMs: undefined,
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
      continue;
    }
    if (token === "--max-concurrent") {
      args.maxConcurrent = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--max-attempts") {
      args.maxAttempts = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--stale-threshold-ms") {
      args.staleThresholdMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--stale-recovery-interval-ms") {
      args.staleRecoveryIntervalMs = Number(argv[index + 1]);
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientConvexError(error) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("could not find public function") ||
    message.includes("server error")
  );
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

async function waitForBackendReady(client, cliArgs) {
  while (true) {
    try {
      await client.query(api.analytics.getQueueStatus, {});
      return;
    } catch (error) {
      if (cliArgs.once || !isTransientConvexError(error)) {
        throw error;
      }
      console.warn(
        `[queue-worker] Convex not ready yet: ${errorMessage(error)}. Retrying in ${cliArgs.pollIntervalMs}ms`
      );
      await sleep(cliArgs.pollIntervalMs);
    }
  }
}

function resolveWorkerConfig(baseConfig, cliArgs) {
  const worker = baseConfig.worker ?? {};
  const hasPersistentProfile = Boolean(baseConfig?.browser?.userDataDir);
  const requestedMaxConcurrent = Math.max(
    1,
    Math.floor(cliArgs.maxConcurrent ?? worker.maxConcurrent ?? 2)
  );

  return {
    maxConcurrent: hasPersistentProfile ? 1 : requestedMaxConcurrent,
    maxAttempts: Math.max(
      1,
      Math.floor(cliArgs.maxAttempts ?? worker.maxAttempts ?? 2)
    ),
    staleThresholdMs: Math.max(
      60_000,
      Math.floor(
        cliArgs.staleThresholdMs ?? worker.staleThresholdMs ?? 10 * 60_000
      )
    ),
    staleRecoveryIntervalMs: Math.max(
      5_000,
      Math.floor(
        cliArgs.staleRecoveryIntervalMs ??
          worker.staleRecoveryIntervalMs ??
          30_000
      )
    ),
  };
}

export function buildRunConfig(baseConfig, claimedRun) {
  const configuredResponseTimeout =
    baseConfig?.timing?.responseTimeoutMs ?? 300000;
  const navigationUrl =
    baseConfig.navigation?.url ??
    baseConfig.deepLink?.url ??
    "https://chatgpt.com/";
  const promptQueryParam =
    baseConfig.navigation?.promptQueryParam ??
    baseConfig.deepLink?.promptQueryParam;

  return {
    ...baseConfig,
    promptId: claimedRun.prompt.id,
    runLabel: claimedRun.runLabel,
    model: claimedRun.prompt.targetModel || baseConfig.model || "chatgpt-web",
    navigation: {
      ...(baseConfig.navigation ?? {}),
      url: navigationUrl,
      promptQueryParam,
    },
    prompt: {
      ...(baseConfig.prompt ?? {}),
      text: claimedRun.prompt.promptText,
    },
    ingest: {
      target: "none",
    },
    timing: {
      ...(baseConfig.timing ?? {}),
      responseTimeoutMs: configuredResponseTimeout,
    },
  };
}

function stripRetrySuffix(runLabel) {
  return String(runLabel ?? "")
    .replace(/\s+\[retry\s+\d+\]\s*$/i, "")
    .trim();
}

export function buildRetryLabel(runLabel, attempt) {
  const baseLabel = stripRetrySuffix(runLabel) || "Manual run";
  return `${baseLabel} [retry ${attempt}]`;
}

export function shouldAutoRetry(result, runContext, maxAttempts = 2) {
  if (result.status !== "failed") {
    return false;
  }

  const attempt =
    typeof runContext === "object" && runContext !== null
      ? (runContext.attempt ?? 1)
      : 1;
  if (attempt >= maxAttempts) {
    return false;
  }

  const haystack =
    `${result.summary ?? ""} ${(result.warnings ?? []).join(" ")}`.toLowerCase();
  const nonRetriablePatterns = [
    "access blocker detected",
    "access was blocked before the prompt could run",
    "security verification process",
    "verify you are human",
    "checking your browser",
    "just a moment",
    "challenges.cloudflare.com",
  ];
  if (nonRetriablePatterns.some((pattern) => haystack.includes(pattern))) {
    return false;
  }

  return (
    haystack.includes("response container not found after submit") ||
    haystack.includes("did not produce a usable assistant response") ||
    haystack.includes("timeout")
  );
}

async function queueRetry(client, claimedRun) {
  const nextAttempt = (claimedRun.attempt ?? 1) + 1;
  return await client.mutation(api.analytics.retryPromptRun, {
    runId: claimedRun.runId,
    label: buildRetryLabel(claimedRun.runLabel, nextAttempt),
  });
}

async function completeRunFromError(client, claimedRun, error) {
  const message = errorMessage(error);
  const finishedAt = Date.now();
  await client.mutation(api.analytics.completePromptRun, {
    runId: claimedRun.runId,
    status: "failed",
    finishedAt,
    latencyMs: Math.max(0, finishedAt - claimedRun.startedAt),
    responseSummary: message,
    warnings: [message],
    citations: [],
    runLabel: claimedRun.runLabel,
    runner: "local-playwright-worker",
  });
}

async function maybeRecoverStaleRuns(client, workerConfig, state) {
  const now = Date.now();
  if (
    state.lastRecoveryAt &&
    now - state.lastRecoveryAt < workerConfig.staleRecoveryIntervalMs
  ) {
    return;
  }

  state.lastRecoveryAt = now;
  const recovered = await client.mutation(
    api.analytics.recoverStaleRunningPromptRuns,
    {
      olderThanMs: workerConfig.staleThresholdMs,
      runner: "local-playwright-worker",
      summary:
        "Recovered stale running job after worker interruption or timeout watchdog.",
    }
  );
  if (recovered.recoveredCount > 0) {
    console.warn(
      `[queue-worker] Recovered ${recovered.recoveredCount} stale running run(s).`
    );
  }
}

async function claimNextRun(client, workerConfig, cliArgs) {
  try {
    return await client.mutation(api.analytics.claimNextQueuedPromptRun, {
      runner: "local-playwright-worker",
      maxConcurrent: workerConfig.maxConcurrent,
    });
  } catch (error) {
    if (cliArgs.once || !isTransientConvexError(error)) {
      throw error;
    }
    console.warn(
      `[queue-worker] Claim failed: ${errorMessage(error)}. Waiting for Convex and retrying.`
    );
    await waitForBackendReady(client, cliArgs);
    return null;
  }
}

async function processClaimedRun(
  client,
  baseConfig,
  claimedRun,
  cliArgs,
  workerConfig
) {
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

    if (shouldAutoRetry(result, claimedRun, workerConfig.maxAttempts)) {
      const retryRun = await queueRetry(client, claimedRun);
      console.log(
        `[queue-worker] ${claimedRun.prompt.name}: auto-requeued as attempt ${retryRun.runId ? (claimedRun.attempt ?? 1) + 1 : "unknown"}`
      );
    }

    return result.status === "success";
  } catch (error) {
    await completeRunFromError(client, claimedRun, error);
    const message = errorMessage(error);
    console.error(`[queue-worker] ${claimedRun.prompt.name}: ${message}`);

    if (
      shouldAutoRetry(
        { status: "failed", summary: message, warnings: [message] },
        claimedRun,
        workerConfig.maxAttempts
      )
    ) {
      await queueRetry(client, claimedRun);
      console.log(
        `[queue-worker] ${claimedRun.prompt.name}: auto-requeued after worker error`
      );
    }
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
  const workerConfig = resolveWorkerConfig(baseConfig, cliArgs);
  const client = new ConvexHttpClient(convexUrl);
  const activeTasks = new Set();
  const workerState = {
    lastRecoveryAt: 0,
    lastPreflightReason: null,
  };
  let hadFailure = false;

  await waitForBackendReady(client, cliArgs);

  while (true) {
    await maybeRecoverStaleRuns(client, workerConfig, workerState);

    let claimedAny = false;
    while (activeTasks.size < workerConfig.maxConcurrent) {
      const preflight = await getRunnerPreflight(baseConfig);
      if (!preflight.ok) {
        if (cliArgs.once) {
          console.error(`[queue-worker] ${preflight.reason}`);
          hadFailure = true;
          break;
        }
        if (workerState.lastPreflightReason !== preflight.reason) {
          console.warn(`[queue-worker] ${preflight.reason}`);
          workerState.lastPreflightReason = preflight.reason;
        }
        break;
      }

      workerState.lastPreflightReason = null;
      const claimedRun = await claimNextRun(client, workerConfig, cliArgs);
      if (!claimedRun) {
        break;
      }

      claimedAny = true;
      let task;
      task = processClaimedRun(
        client,
        baseConfig,
        claimedRun,
        cliArgs,
        workerConfig
      )
        .then((ok) => {
          hadFailure = hadFailure || !ok;
        })
        .finally(() => {
          activeTasks.delete(task);
        });
      activeTasks.add(task);
    }

    if (cliArgs.once && activeTasks.size === 0 && !claimedAny) {
      break;
    }

    if (activeTasks.size > 0) {
      await Promise.race(activeTasks);
      continue;
    }

    await sleep(cliArgs.pollIntervalMs);
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = errorMessage(error);
    console.error(`[queue-worker] ${message}`);
    process.exit(1);
  });
}
