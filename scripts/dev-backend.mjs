import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseEnvValue(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const currentKey = line.slice(0, separator).trim();
    if (currentKey !== key) {
      continue;
    }

    let value = line.slice(separator + 1).trim();
    const inlineComment = value.indexOf(" #");
    if (inlineComment !== -1) {
      value = value.slice(0, inlineComment).trim();
    }

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

async function resolveEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  const cwd = process.cwd();
  const envLocal = await readEnvFile(path.join(cwd, ".env.local"));
  const localValue = parseEnvValue(envLocal, key);
  if (localValue) {
    return localValue;
  }

  const env = await readEnvFile(path.join(cwd, ".env"));
  return parseEnvValue(env, key);
}

async function resolveConvexUrl() {
  return (await resolveEnvValue("VITE_CONVEX_URL")) ?? "http://127.0.0.1:3210";
}

async function canQueryExpectedBackend(convexUrl) {
  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.query(api.analytics.getQueueStatus, {});
    return true;
  } catch {
    return false;
  }
}

async function portIsReachable(convexUrl) {
  try {
    const response = await fetch(convexUrl, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok || response.status >= 400;
  } catch {
    return false;
  }
}

async function reuseExistingBackend(convexUrl) {
  console.log(
    `[dev:backend] Reusing local Convex backend at ${convexUrl}. Logs are attached to the existing backend process.`
  );

  let shuttingDown = false;
  const shutdown = () => {
    shuttingDown = true;
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  while (!shuttingDown) {
    const healthy = await canQueryExpectedBackend(convexUrl);
    if (!healthy) {
      console.error(
        `[dev:backend] Existing local backend at ${convexUrl} stopped responding. Stop this dev session and run pnpm dev again to restart it.`
      );
      process.exit(1);
    }
    await sleep(5000);
  }
}

function runConvexDev() {
  const child = spawn(
    "pnpm",
    ["exec", "convex", "dev", "--local", "--tail-logs"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  process.once("SIGINT", () => {
    child.kill("SIGINT");
  });
  process.once("SIGTERM", () => {
    child.kill("SIGTERM");
  });
}

async function main() {
  const convexUrl = await resolveConvexUrl();

  if (await canQueryExpectedBackend(convexUrl)) {
    await reuseExistingBackend(convexUrl);
    return;
  }

  if (await portIsReachable(convexUrl)) {
    console.error(
      `[dev:backend] Port for ${convexUrl} is already in use, but it does not appear to be this project's Convex backend. Stop the other process and run pnpm dev again.`
    );
    process.exit(1);
  }

  runConvexDev();
}

await main();
