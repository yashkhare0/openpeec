import path from "path";
import fs from "fs";
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), serveRunnerArtifacts()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5999,
  },
});
