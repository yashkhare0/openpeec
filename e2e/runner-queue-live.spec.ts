import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("runner queue completes Playwright fixture job against live Convex", async () => {
  test.skip(
    process.env.OPENPEEC_E2E_LIVE === "0",
    "Requires Vite + Convex (OPENPEEC_E2E_LIVE≠0)."
  );

  const script = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "runner-queue-verify.mjs"
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: {
        ...process.env,
        E2E_CONVEX_URL:
          process.env.E2E_CONVEX_URL?.trim() || "http://127.0.0.1:3210",
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`runner-queue-verify.mjs exited ${code}`));
    });
  });

  expect(true).toBe(true);
});
