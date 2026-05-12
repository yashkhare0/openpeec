#!/usr/bin/env node
/**
 * Docker Compose helper: waits for local Convex HTTP, then queues the data
 * backfill that restores promptRuns rows missing promptExcerpt (fixes schema
 * validation + worker claim semantics after shared volume carries older rows).
 */

import process from "node:process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";

const convexUrl =
  process.env.VITE_CONVEX_URL?.trim() || "http://backend:3212";

const deadlineMsRaw = Number.parseInt(
  process.env.OPENPEEC_CONVEX_BOOTSTRAP_TIMEOUT_MS ?? "180000",
  10,
);
const deadlineMs = Number.isFinite(deadlineMsRaw) ? deadlineMsRaw : 180000;

async function convexReachable() {
  try {
    const res = await fetch(convexUrl, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    return res.ok || res.status >= 400;
  } catch {
    return false;
  }
}

async function analyticsApiReady(client) {
  try {
    await client.query(api.analytics.getQueueStatus, {});
    return true;
  } catch {
    return false;
  }
}

async function kick(client) {
  await client.mutation(api.analytics.requestKickPromptRunExcerptBackfill, {});
}

async function main() {
  const started = Date.now();
  const client = new ConvexHttpClient(convexUrl);

  while (Date.now() - started < deadlineMs) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await convexReachable())) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    if (!(await analyticsApiReady(client))) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await kick(client);
      console.log("[convex-bootstrap] Queued promptRun excerpt backfill.");
      process.exitCode = 0;
      return;
    } catch (error) {
      console.warn(
        "[convex-bootstrap] Convex not ready for mutations yet;",
        error?.message ?? error,
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 2500);
      });
    }
  }

  console.error("[convex-bootstrap] Timed out waiting for Convex.");
  process.exitCode = 1;
}

await main();
