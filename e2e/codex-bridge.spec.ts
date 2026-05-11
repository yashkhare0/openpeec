import { spawn, type ChildProcess } from "node:child_process";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, request, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function getFreePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  if (!port) {
    throw new Error("Failed to reserve a bridge test port.");
  }

  return port;
}

async function writeFakeCodexCli(binDir: string, argsLogPath: string) {
  const codexPath = path.join(binDir, "codex");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex-cli-test 0.0.0");
  process.exit(0);
}

if (args[0] !== "exec") {
  console.error("unexpected command: " + args.join(" "));
  process.exit(1);
}

let outputPath = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "-o") {
    outputPath = args[index + 1];
    index += 1;
  }
}

if (!outputPath) {
  console.error("missing -o output path");
  process.exit(1);
}

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(argsLogPath)}, JSON.stringify({ args, prompt }) + "\\n");
  const response = prompt.includes("Return exactly: bridge-ok") ? "bridge-ok" : "fake-codex-ok";
  fs.writeFileSync(outputPath, response, "utf8");
});
`;

  await fsp.writeFile(codexPath, script, "utf8");
  await fsp.chmod(codexPath, 0o755);
}

async function waitForHealth(port: number) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Bridge did not become healthy.");
}

test("Codex bridge serves the OpenAI-compatible API", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const tempRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "openpeec-codex-bridge-e2e-")
  );
  const homeDir = path.join(tempRoot, "home");
  const binDir = path.join(tempRoot, "bin");
  const argsLogPath = path.join(tempRoot, "codex-args.jsonl");
  const port = await getFreePort();
  let child: ChildProcess | null = null;

  await fsp.mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await fsp.mkdir(binDir, { recursive: true });
  await fsp.writeFile(path.join(homeDir, ".codex", "auth.json"), "{}", "utf8");
  await fsp.writeFile(
    path.join(homeDir, ".codex", "models_cache.json"),
    JSON.stringify({
      models: [{ slug: "gpt-5.5", priority: 100, supported_in_api: true }],
    }),
    "utf8"
  );
  await writeFakeCodexCli(binDir, argsLogPath);

  try {
    child = spawn("pnpm", ["exec", "tsx", "src/cli/codex-bridge-start.ts"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        CODEX_BRIDGE_PORT: String(port),
        CODEX_BRIDGE_API_KEY: "test-key",
        CODEX_BRIDGE_MODEL: "gpt-5.5",
        CODEX_BRIDGE_REASONING: "medium",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForHealth(port);

    const api = await request.newContext({
      baseURL: `http://127.0.0.1:${port}`,
      extraHTTPHeaders: {
        Authorization: "Bearer test-key",
      },
    });

    try {
      const health = await api.get("/health");
      await expect(health).toBeOK();
      expect(await health.json()).toEqual({ status: "ok" });

      const models = await api.get("/v1/models");
      await expect(models).toBeOK();
      expect(await models.json()).toMatchObject({
        object: "list",
        data: [{ id: "gpt-5.5:medium" }],
        defaults: { model: "gpt-5.5:medium" },
      });

      const rejected = await api.post("/v1/chat/completions", {
        headers: { Authorization: "Bearer wrong-key" },
        data: {
          model: "gpt-5.5:medium",
          messages: [{ role: "user", content: "Return exactly: bridge-ok" }],
        },
      });
      expect(rejected.status()).toBe(401);

      const completion = await api.post("/v1/chat/completions", {
        data: {
          model: "gpt-5.5:medium",
          messages: [{ role: "user", content: "Return exactly: bridge-ok" }],
        },
      });
      await expect(completion).toBeOK();
      expect(await completion.json()).toMatchObject({
        object: "chat.completion",
        model: "gpt-5.5:medium",
        choices: [
          {
            message: {
              role: "assistant",
              content: "bridge-ok",
            },
            finish_reason: "stop",
          },
        ],
      });

      const stream = await api.post("/v1/chat/completions", {
        data: {
          model: "gpt-5.5:medium",
          stream: true,
          messages: [{ role: "user", content: "Return exactly: bridge-ok" }],
        },
      });
      await expect(stream).toBeOK();
      expect(await stream.text()).toContain("data: [DONE]");

      const argsLog = await fsp.readFile(argsLogPath, "utf8");
      const invocations = argsLog
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { args: string[]; prompt: string });
      expect(invocations).toHaveLength(2);
      expect(invocations[0].args).toEqual(
        expect.arrayContaining([
          "exec",
          "-m",
          "gpt-5.5",
          "-s",
          "read-only",
          "--skip-git-repo-check",
        ])
      );
      expect(invocations[0].prompt).toContain(
        "[USER]\nReturn exactly: bridge-ok"
      );
    } finally {
      await api.dispose();
    }
  } finally {
    child?.kill();
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
});
