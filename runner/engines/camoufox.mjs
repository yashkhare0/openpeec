import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { firefox } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_DIR = path.dirname(__dirname);
const CAMOUFOX_SERVER_SCRIPT = path.join(RUNNER_DIR, "camoufox-server.py");

const CAMOUFOX_OPTION_ALIASES = {
  blockImages: "block_images",
  blockWebrtc: "block_webrtc",
  blockWebgl: "block_webgl",
  customFontsOnly: "custom_fonts_only",
  disableCoop: "disable_coop",
  enableCache: "enable_cache",
  executablePath: "executable_path",
  ffVersion: "ff_version",
  firefoxUserPrefs: "firefox_user_prefs",
  iKnowWhatImDoing: "i_know_what_im_doing",
  mainWorldEval: "main_world_eval",
  virtualDisplay: "virtual_display",
  webglConfig: "webgl_config",
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeCamoufoxOptions(rawOptions = {}) {
  const options = {};
  for (const [key, value] of Object.entries(rawOptions)) {
    if (
      key === "python" ||
      key === "startupTimeoutMs" ||
      value === undefined ||
      value === null
    ) {
      continue;
    }
    options[CAMOUFOX_OPTION_ALIASES[key] ?? key] = value;
  }
  return options;
}

export function resolveCamoufoxPython(browserOptions = {}) {
  const bundledCodexPython = process.env.HOME
    ? path.join(
        process.env.HOME,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
      )
    : null;
  return (
    browserOptions.camoufox?.python ??
    process.env.CAMOUFOX_PYTHON ??
    process.env.PYTHON ??
    (bundledCodexPython && fs.existsSync(bundledCodexPython)
      ? bundledCodexPython
      : null) ??
    "python3"
  );
}

function collectProcessOutput(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function getCamoufoxPreflight(browserOptions = {}) {
  const python = resolveCamoufoxPython(browserOptions);
  const child = spawn(python, [CAMOUFOX_SERVER_SCRIPT, "--check"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const result = await collectProcessOutput(child);
    if (result.code === 0) {
      return {
        ok: true,
        status: "success",
        details: result.stdout.trim(),
      };
    }
    return {
      ok: false,
      status: "blocked",
      reason:
        result.stderr.trim() ||
        result.stdout.trim() ||
        "Camoufox is not installed or its browser binaries are not ready.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "blocked",
      reason:
        error instanceof Error ? error.message : "Camoufox preflight failed.",
    };
  }
}

async function startCamoufoxServer(browserOptions = {}, headed = false) {
  const python = resolveCamoufoxPython(browserOptions);
  const headless = headed ? false : browserOptions.headless;
  const launchConfig = {
    ...normalizeCamoufoxOptions(browserOptions.camoufox),
    headless,
  };
  const configB64 = Buffer.from(JSON.stringify(launchConfig)).toString(
    "base64"
  );
  const child = spawn(python, [CAMOUFOX_SERVER_SCRIPT], {
    env: {
      ...process.env,
      OPENPEEC_CAMOUFOX_CONFIG_B64: configB64,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let stderr = "";
  let settled = false;

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          `Timed out waiting for Camoufox websocket endpoint. ${stderr || output}`.trim()
        )
      );
    }, browserOptions.camoufox?.startupTimeoutMs ?? 60000);

    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/ws:\/\/[^\s\x1b]+/);
      if (!match || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(match[0]);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Camoufox server exited before it was ready (code ${code}). ${stderr || output}`.trim()
        )
      );
    });
  });

  const wsEndpoint = await ready;
  return {
    wsEndpoint,
    async close() {
      if (child.killed || child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(3000).then(() => {
          if (!child.killed && child.exitCode === null) {
            child.kill("SIGKILL");
          }
        }),
      ]);
    },
  };
}

export async function launchCamoufoxBrowserContext({
  browserOptions,
  contextOptions,
  persistentProfileDir,
  headed,
}) {
  const warnings = [];
  if (persistentProfileDir) {
    warnings.push(
      "Camoufox runner uses Playwright storageState instead of a persistent Chrome userDataDir."
    );
  }
  const server = await startCamoufoxServer(browserOptions, headed);
  let browser = null;
  try {
    browser = await firefox.connect(server.wsEndpoint);
    const context = await browser.newContext(contextOptions);
    return {
      browser,
      context,
      warnings,
      async close() {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        await server.close();
      },
    };
  } catch (error) {
    await browser?.close().catch(() => {});
    await server.close();
    throw error;
  }
}
