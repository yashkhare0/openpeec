import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function candidateBootstrapPython() {
  const localPython312 = process.env.HOME
    ? path.join(process.env.HOME, ".local/bin/python3.12")
    : null;
  return (
    process.env.OPENPEEC_NODRIVER_BOOTSTRAP_PYTHON ??
    process.env.OPENPEEC_NODRIVER_PYTHON ??
    process.env.NODRIVER_PYTHON ??
    (localPython312 && fs.existsSync(localPython312) ? localPython312 : null) ??
    "python3"
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
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

const venvDir = path.resolve(process.cwd(), "runner/.venv-nodriver");
const venvPython = path.join(venvDir, "bin/python");

try {
  if (!fs.existsSync(venvPython)) {
    await run(candidateBootstrapPython(), ["-m", "venv", venvDir]);
  }
  await run(venvPython, [
    "-m",
    "pip",
    "install",
    "-U",
    "-r",
    "runner/requirements-nodriver.txt",
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
