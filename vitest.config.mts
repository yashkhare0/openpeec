import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "convex/**/*.{test,spec}.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    environmentMatchGlobs: [
      ["src/**/*.test.tsx", "jsdom"],
      ["convex/**/*.test.ts", "edge-runtime"],
    ],
    setupFiles: ["src/test/setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
    coverage: {
      provider: "v8",
    },
  },
});
