#!/usr/bin/env node
// Idempotent Camoufox installer.
//
// Creates a project-local Python 3.12 venv at runner/.venv-camoufox via uv,
// installs camoufox + playwright, fetches the Camoufox Firefox build, and
// drops a CommonJS marker next to camoufox's vendored launchServer.js so it
// loads correctly inside our `"type": "module"` repo. Skips work that's
// already done so it's safe to run on every `pnpm dev`.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const VENV_DIR = path.join(REPO_ROOT, "runner/.venv-camoufox");
const VENV_PY = path.join(VENV_DIR, "bin/python");
const PYTHON_VERSION = process.env.OPENPEEC_CAMOUFOX_PYTHON_VERSION ?? "3.12";
const SITE_PACKAGES_GLOB = `lib/python${PYTHON_VERSION}/site-packages/camoufox`;
const FORCE = process.argv.includes("--force");

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "command", [
    process.platform === "win32" ? cmd : "-v",
    cmd,
  ]);
  if (r.status === 0) return r.stdout.toString().split(/\r?\n/)[0].trim();
  return null;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited with ${r.status ?? "signal " + r.signal}`
    );
  }
}

function camoufoxBrowserPath() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox"
    );
  }
  if (process.platform === "linux") {
    return path.join(os.homedir(), ".cache/camoufox/camoufox");
  }
  if (process.platform === "win32") {
    return path.join(
      os.homedir(),
      "AppData/Local/camoufox/camoufox.exe"
    );
  }
  return null;
}

function ensureUv() {
  if (which("uv")) return "uv";
  const localUv = path.join(os.homedir(), ".local/bin/uv");
  if (fs.existsSync(localUv)) return localUv;
  console.error(
    "[install-camoufox] `uv` not found. Install it once with:\n  curl -LsSf https://astral.sh/uv/install.sh | sh\nor `brew install uv`. Re-run after installing."
  );
  process.exit(1);
}

function venvPythonOk(uv) {
  if (!fs.existsSync(VENV_PY)) return false;
  const r = spawnSync(VENV_PY, ["-c", "import sys; print(sys.version_info[:2])"]);
  if (r.status !== 0) return false;
  const out = r.stdout.toString().trim();
  // Want exactly the requested major.minor.
  const want = `(${PYTHON_VERSION.split(".").join(", ")})`;
  return out === want;
}

function camoufoxImportsOk() {
  const r = spawnSync(VENV_PY, [
    "-c",
    "import camoufox, playwright; print('ok')",
  ]);
  return r.status === 0 && r.stdout.toString().includes("ok");
}

function ensureCommonJsMarker() {
  const dir = path.join(VENV_DIR, SITE_PACKAGES_GLOB);
  if (!fs.existsSync(dir)) return;
  const marker = path.join(dir, "package.json");
  // Don't clobber if camoufox ever ships its own.
  if (fs.existsSync(marker)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (parsed.type === "commonjs") return;
    } catch {
      // Fall through and rewrite.
    }
  }
  fs.writeFileSync(marker, '{ "type": "commonjs" }\n');
}

const uv = ensureUv();

if (FORCE || !venvPythonOk(uv)) {
  console.log(
    `[install-camoufox] (re)creating venv at ${VENV_DIR} with Python ${PYTHON_VERSION}...`
  );
  fs.rmSync(VENV_DIR, { recursive: true, force: true });
  run(uv, ["venv", VENV_DIR, "--python", PYTHON_VERSION]);
}

if (FORCE || !camoufoxImportsOk()) {
  console.log("[install-camoufox] installing camoufox + playwright...");
  run(uv, [
    "pip",
    "install",
    "--python",
    VENV_PY,
    "-U",
    "camoufox[geoip]",
    "playwright==1.58.0",
  ]);
}

ensureCommonJsMarker();

const browser = camoufoxBrowserPath();
if (FORCE || !browser || !fs.existsSync(browser)) {
  console.log("[install-camoufox] fetching Camoufox Firefox build...");
  run(VENV_PY, ["-m", "camoufox", "fetch"]);
}

console.log(`[install-camoufox] ready: ${VENV_PY}`);
