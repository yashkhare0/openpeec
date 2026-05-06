import path from "path";
import fs from "fs";
import { spawn, type ChildProcess } from "child_process";
import type { IncomingMessage, ServerResponse } from "http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".zip": "application/zip",
    ".webm": "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

function serveRunnerArtifacts(): Plugin {
  const artifactsRoot = path.resolve(__dirname, "runner", "artifacts");

  return {
    name: "serve-runner-artifacts",
    configureServer(server) {
      server.middlewares.use("/runner-artifacts", (req, res, next) => {
        const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const relativePath = requestPath.replace(/^\/+/, "");
        const absolutePath = path.resolve(artifactsRoot, relativePath);

        if (!absolutePath.startsWith(artifactsRoot)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        fs.stat(absolutePath, (error, stats) => {
          if (error || !stats.isFile()) {
            next();
            return;
          }

          res.setHeader("Content-Type", contentTypeFor(absolutePath));
          fs.createReadStream(absolutePath).pipe(res);
        });
      });
    },
  };
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function localProviderSessionApi(): Plugin {
  const sessionProcesses = new Map<string, ChildProcess>();
  const providerDefaults: Record<
    string,
    {
      url: string;
      engine: "camoufox" | "playwright";
      storageStatePath: string;
      profileDir?: string;
      browser?: string;
    }
  > = {
    openai: {
      url: "https://chatgpt.com/",
      engine: "camoufox",
      storageStatePath: "runner/camoufox.storage-state.json",
    },
  };

  return {
    name: "local-provider-session-api",
    configureServer(server) {
      server.middlewares.use("/local-provider-session/open", (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          let body: { providerSlug?: string } = {};
          try {
            const rawBody = await readRequestBody(req);
            body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            sendJson(res, 400, { error: "Invalid JSON body" });
            return;
          }

          const providerSlug = body.providerSlug ?? "openai";
          const defaults = providerDefaults[providerSlug];
          if (!defaults) {
            sendJson(res, 400, {
              error: "Only OpenAI session windows are supported in v0",
            });
            return;
          }

          const existing = sessionProcesses.get(providerSlug);
          if (existing && existing.exitCode === null && !existing.killed) {
            sendJson(res, 200, {
              status: "already_open",
              providerSlug,
              engine: defaults.engine,
              storageStatePath: defaults.storageStatePath,
              profileDir: defaults.profileDir ?? null,
              url: defaults.url,
            });
            return;
          }

          const args = [
            "runner/open-session-window.mjs",
            "--url",
            defaults.url,
            "--engine",
            defaults.engine,
            "--out",
            defaults.storageStatePath,
          ];
          if (defaults.profileDir) {
            args.push("--profile-dir", defaults.profileDir);
          }
          if (defaults.browser) {
            args.push("--browser", defaults.browser);
          }

          const child = spawn(process.execPath, args, {
            cwd: __dirname,
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          sessionProcesses.set(providerSlug, child);
          child.once("exit", () => {
            sessionProcesses.delete(providerSlug);
          });

          sendJson(res, 200, {
            status: "opening",
            providerSlug,
            engine: defaults.engine,
            storageStatePath: defaults.storageStatePath,
            profileDir: defaults.profileDir ?? null,
            url: defaults.url,
          });
        })();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    serveRunnerArtifacts(),
    localProviderSessionApi(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5999,
    watch: {
      ignored: [
        "**/e2e/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/findings.md",
        "**/progress.md",
        "**/task_plan.md",
        "**/runner/artifacts/**",
      ],
    },
  },
});
