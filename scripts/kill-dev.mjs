import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizePathForMatch(value) {
  return value.replace(/\\/g, "/").toLowerCase();
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

function extractPort(url) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).port ? Number(new URL(url).port) : null;
  } catch {
    return null;
  }
}

async function getKnownPorts() {
  const ports = new Set([5999]);
  const convexUrl = await resolveEnvValue("VITE_CONVEX_URL");
  const convexSiteUrl = await resolveEnvValue("VITE_CONVEX_SITE_URL");

  for (const candidate of [convexUrl, convexSiteUrl]) {
    const port = extractPort(candidate);
    if (port) {
      ports.add(port);
    }
  }

  return [...ports];
}

async function listWindowsProcesses() {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    {
      cwd: process.cwd(),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
    }
  );

  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function listPortOwnersWindows(ports) {
  const uniquePorts = [...new Set(ports)].filter(Boolean);
  if (uniquePorts.length === 0) {
    return [];
  }

  const portList = uniquePorts.join(",");
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$ports = @(${portList})`,
    "Get-NetTCPConnection | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique | ConvertTo-Json -Compress",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    {
      cwd: process.cwd(),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    }
  );

  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function isKillCandidate(processInfo, projectRoot) {
  const commandLine = processInfo.CommandLine ?? "";
  const normalized = normalizePathForMatch(commandLine);

  if (!normalized.includes(projectRoot)) {
    return false;
  }

  const devMarkers = [
    "vite",
    "runner/process-queued-runs.mjs",
    "runner/run-monitor.mjs",
    "scripts/dev-backend.mjs",
    "npm-run-all",
    "dev:frontend",
    "dev:backend",
    "dev:runner",
    "convex dev",
  ];

  return devMarkers.some((marker) => normalized.includes(marker));
}

async function killWindowsProcesses(pids) {
  for (const pid of pids) {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        cwd: process.cwd(),
        windowsHide: true,
      });
      console.log(`[kill] Stopped process ${pid}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (
        message.includes("not found") ||
        message.includes("there is no running instance")
      ) {
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  if (process.platform !== "win32") {
    console.error(
      "[kill] This project kill script currently supports Windows only."
    );
    process.exit(1);
  }

  const projectRoot = normalizePathForMatch(process.cwd());
  const ports = await getKnownPorts();
  const [processes, portOwners] = await Promise.all([
    listWindowsProcesses(),
    listPortOwnersWindows(ports),
  ]);

  const currentPid = process.pid;
  const candidatePids = new Set(
    processes
      .filter((processInfo) => isKillCandidate(processInfo, projectRoot))
      .map((processInfo) => Number(processInfo.ProcessId))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== currentPid)
  );

  for (const pid of portOwners) {
    if (pid !== currentPid) {
      candidatePids.add(pid);
    }
  }

  const pids = [...candidatePids];
  if (pids.length === 0) {
    console.log("[kill] No openpeec dev processes were found.");
    return;
  }

  console.log(
    `[kill] Stopping ${pids.length} process${pids.length === 1 ? "" : "es"} for ports ${ports.join(", ")}.`
  );
  await killWindowsProcesses(pids);
}

await main();
