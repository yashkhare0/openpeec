import { defineConfig, devices } from "@playwright/test";

const e2eConvexUrl =
  process.env.E2E_CONVEX_URL?.trim() || "http://127.0.0.1:3210";
const viteFrontendUrl = "http://127.0.0.1:5999";

/** When false, only Vite is started (static fixture tests only unless Convex is already up). */
const liveStack = process.env.OPENPEEC_E2E_LIVE !== "0";

const webServers = liveStack
  ? [
      {
        command: `env VITE_CONVEX_URL=${e2eConvexUrl} node scripts/dev-backend.mjs`,
        url: e2eConvexUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
      {
        command: `env VITE_CONVEX_URL=${e2eConvexUrl} pnpm exec vite --host 127.0.0.1 --port 5999 --strictPort`,
        url: viteFrontendUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ]
  : [
      {
        command: `env VITE_CONVEX_URL=${e2eConvexUrl} pnpm exec vite --host 127.0.0.1 --port 5999 --strictPort`,
        url: viteFrontendUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ];

export default defineConfig({
  testDir: "./e2e",
  timeout: liveStack ? 180_000 : 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: viteFrontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: webServers,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
