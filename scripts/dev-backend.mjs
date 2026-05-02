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
  // Keep pnpm dev non-interactive when Convex needs to migrate the local backend binary.
  const args = [
    "exec",
    "convex",
    "dev",
    "--local",
    "--tail-logs",
    "--local-force-upgrade",
  ];
  const envFile = process.env.OPENPEEC_CONVEX_ENV_FILE?.trim();
  const localCloudPort = process.env.OPENPEEC_CONVEX_LOCAL_CLOUD_PORT?.trim();
  const localSitePort = process.env.OPENPEEC_CONVEX_LOCAL_SITE_PORT?.trim();

  if (process.env.OPENPEEC_CONVEX_CONFIGURE_LOCAL === "1") {
    args.push("--configure", "new", "--dev-deployment", "local");
  }

  if (envFile) {
    args.push("--env-file", envFile);
  }

  if (localCloudPort || localSitePort) {
    if (!localCloudPort || !localSitePort) {
      console.error(
        "[dev:backend] OPENPEEC_CONVEX_LOCAL_CLOUD_PORT and OPENPEEC_CONVEX_LOCAL_SITE_PORT must be set together."
      );
      process.exit(1);
    }
    args.push(
      "--local-cloud-port",
      localCloudPort,
      "--local-site-port",
      localSitePort
    );
  }

  const child =
    process.platform === "win32"
      ? spawn(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", `pnpm.cmd ${args.join(" ")}`],
          {
            cwd: process.cwd(),
            stdio: "inherit",
            shell: false,
            env: process.env,
          }
        )
      : spawn("pnpm", args, {
          cwd: process.cwd(),
          stdio: "inherit",
          shell: false,
          env: process.env,
        });

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
  const convexDeployment = await resolveEnvValue("CONVEX_DEPLOYMENT");
  if (
    convexDeployment?.startsWith("anonymous:") &&
    !process.env.CONVEX_AGENT_MODE
  ) {
    process.env.CONVEX_AGENT_MODE = "anonymous";
  }

  let warnedAboutForeignBackend = false;

  while (true) {
    if (await canQueryExpectedBackend(convexUrl)) {
      await reuseExistingBackend(convexUrl);
      return;
    }

    if (await portIsReachable(convexUrl)) {
      if (!warnedAboutForeignBackend) {
        console.warn(
          `[dev:backend] Port for ${convexUrl} is already in use, but it does not appear to be this project's Convex backend. Waiting for that process to exit so OpenPeec can start its local backend.`
        );
        warnedAboutForeignBackend = true;
      }
      await sleep(5000);
      continue;
    }

    runConvexDev();
    return;
  }
}

await main();
