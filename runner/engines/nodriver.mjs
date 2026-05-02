import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_DIR = path.dirname(__dirname);
const NODRIVER_WORKER_SCRIPT = path.join(RUNNER_DIR, "nodriver-worker.py");

export function resolveNodriverPython(browserOptions = {}) {
  const projectNodriverPython = path.join(
    RUNNER_DIR,
    ".venv-nodriver",
    "bin",
    "python"
  );
  const bundledCodexPython = process.env.HOME
    ? path.join(
        process.env.HOME,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
      )
    : null;
  const localPython312 = process.env.HOME
    ? path.join(process.env.HOME, ".local/bin/python3.12")
    : null;
  return (
    browserOptions.nodriver?.python ??
    process.env.OPENPEEC_NODRIVER_PYTHON ??
    process.env.NODRIVER_PYTHON ??
    process.env.PYTHON ??
    (fs.existsSync(projectNodriverPython) ? projectNodriverPython : null) ??
    (localPython312 && fs.existsSync(localPython312) ? localPython312 : null) ??
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

export async function getNodriverPreflight(browserOptions = {}) {
  const python = resolveNodriverPython(browserOptions);
  const child = spawn(python, [NODRIVER_WORKER_SCRIPT, "--check"], {
    env: {
      ...process.env,
      ...(browserOptions.nodriver?.executablePath
        ? {
            OPENPEEC_NODRIVER_BROWSER_PATH:
              browserOptions.nodriver.executablePath,
          }
        : {}),
      ...(browserOptions.nodriver?.artifactsDir
        ? {
            OPENPEEC_NODRIVER_ARTIFACTS_DIR:
              browserOptions.nodriver.artifactsDir,
          }
        : {}),
    },
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
        "Nodriver is not installed or Chrome/Chromium is not available.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "blocked",
      reason:
        error instanceof Error ? error.message : "Nodriver preflight failed.",
    };
  }
}
