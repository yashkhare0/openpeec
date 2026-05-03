import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_DIR = __dirname;
const REPO_DIR = path.dirname(RUNNER_DIR);
const VENV_DIR = path.join(RUNNER_DIR, ".venv-camoufox");
const VENV_PYTHON = path.join(VENV_DIR, "bin", "python");
const REQUIREMENTS_FILE = path.join(RUNNER_DIR, "requirements-camoufox.txt");
const CAMOUFOX_CHECK_SCRIPT = path.join(RUNNER_DIR, "camoufox-server.py");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_DIR,
      stdio: options.stdio ?? "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated by ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`Command exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

function collect(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: REPO_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Exited ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function localPython312() {
  return process.env.HOME
    ? path.join(process.env.HOME, ".local/bin/python3.12")
    : null;
}

function bundledCodexPython() {
  return process.env.HOME
    ? path.join(
        process.env.HOME,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
      )
    : null;
}

function candidateBootstrapPythons() {
  return [
    process.env.OPENPEEC_CAMOUFOX_BOOTSTRAP_PYTHON,
    localPython312(),
    bundledCodexPython(),
    "python3.12",
    "python3",
  ].filter(Boolean);
}

async function pythonVersion(python) {
  const result = await collect(python, [
    "-c",
    "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
  ]);
  return result.stdout.trim();
}

function assertStablePython(python, version) {
  const [major, minor] = version.split(".").map(Number);
  if (major !== 3 || minor < 10 || minor >= 15) {
    throw new Error(
      `Refusing to install Camoufox with ${python} (${version}). Use Python 3.10-3.14 or set OPENPEEC_CAMOUFOX_BOOTSTRAP_PYTHON.`
    );
  }
}

async function chooseBootstrapPython() {
  for (const python of candidateBootstrapPythons()) {
    try {
      const version = await pythonVersion(python);
      assertStablePython(python, version);
      return { python, version };
    } catch (error) {
      if (process.env.OPENPEEC_CAMOUFOX_BOOTSTRAP_PYTHON === python) {
        throw error;
      }
    }
  }
  throw new Error("No stable Python 3.10-3.14 interpreter found for Camoufox.");
}

try {
  const explicitPython = process.env.CAMOUFOX_PYTHON;
  let installPython = explicitPython;

  if (!installPython) {
    if (!fs.existsSync(VENV_PYTHON)) {
      const bootstrap = await chooseBootstrapPython();
      console.log(
        `[camoufox-install] Creating ${VENV_DIR} with ${bootstrap.python} (${bootstrap.version}).`
      );
      await run(bootstrap.python, ["-m", "venv", VENV_DIR]);
    }
    installPython = VENV_PYTHON;
  }

  const version = await pythonVersion(installPython);
  assertStablePython(installPython, version);
  console.log(
    `[camoufox-install] Installing with ${installPython} (${version}).`
  );
  await run(installPython, [
    "-m",
    "pip",
    "install",
    "-U",
    "-r",
    REQUIREMENTS_FILE,
  ]);
  await run(installPython, ["-m", "camoufox", "fetch"]);
  await run(installPython, [CAMOUFOX_CHECK_SCRIPT, "--check"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
