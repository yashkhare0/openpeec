import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";

import {
  CAMOUFOX_ENGINE,
  launchRunnerBrowserContext,
  normalizeBrowserEngine,
} from "./browser-engine.mjs";
import { warmUpSession } from "./session-warmup.mjs";

const DEFAULT_PLAYWRIGHT_STORAGE_STATE_PATH =
  "runner/chatgpt.storage-state.json";
const DEFAULT_CAMOUFOX_STORAGE_STATE_PATH =
  "runner/camoufox.storage-state.json";

export function parseArgs(argv) {
  const args = {
    out: undefined,
    url: "https://chatgpt.com/",
    browser: "chrome",
    engine: process.env.OPENPEEC_BROWSER_ENGINE ?? "camoufox",
    profileDir: "runner/profiles/chatgpt-chrome",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--out") {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--url") {
      args.url = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--browser") {
      args.browser = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--engine") {
      args.engine = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--camoufox") {
      args.engine = "camoufox";
      continue;
    }
    if (token === "--profile-dir") {
      args.profileDir = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

export function resolvePathIfRelative(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

async function dismissCookieBanner(page) {
  const selectors = [
    "button:has-text('Reject non-essential')",
    "button:has-text('Reject all')",
    "button:has-text('Accept all')",
    "button:has-text('Accept all cookies')",
    "button:has-text('I agree')",
    "button[aria-label='Close']",
    "button[aria-label='Dismiss']",
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    const exists = await button.count().catch(() => 0);
    if (!exists) {
      continue;
    }
    const visible = await button.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    try {
      await button.click({ timeout: 2500 });
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function openCaptureSession(options = {}) {
  const engine = normalizeBrowserEngine(options.engine);
  const outputPath = resolvePathIfRelative(
    options.out ??
      (engine === CAMOUFOX_ENGINE
        ? DEFAULT_CAMOUFOX_STORAGE_STATE_PATH
        : DEFAULT_PLAYWRIGHT_STORAGE_STATE_PATH)
  );
  const profileDir =
    engine === CAMOUFOX_ENGINE
      ? null
      : resolvePathIfRelative(
          options.profileDir ?? "runner/profiles/chatgpt-chrome"
        );
  if (profileDir) {
    await fs.mkdir(profileDir, { recursive: true });
  }
  const browserSession = await launchRunnerBrowserContext({
    browserOptions: {
      engine,
      channel: options.browser ?? "chrome",
      headless: false,
      camoufox: options.camoufox ?? {},
    },
    contextOptions: {},
    persistentProfileDir: profileDir,
    headed: true,
  });
  const { context } = browserSession;
  const page =
    context.pages().find((existingPage) => !existingPage.isClosed()) ??
    (await context.newPage());
  await warmUpSession(page);
  await page.goto(options.url ?? "https://chatgpt.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await dismissCookieBanner(page);

  return {
    context,
    page,
    engine,
    outputPath,
    profileDir,
    async save() {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await context.storageState({ path: outputPath });
      return {
        outputPath,
        profileDir,
        engine,
      };
    },
    async close() {
      await browserSession.close();
    },
  };
}

export async function captureSession(options = {}) {
  const session = await openCaptureSession(options);

  console.log("");
  console.log(
    "Complete the ChatGPT login and any verification steps in the opened browser."
  );
  console.log(
    "When you can open chatgpt.com and see the actual app, return here and press Enter."
  );
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await rl.question("Press Enter to save storage state... ");
  } finally {
    rl.close();
  }

  const saved = await session.save();

  console.log(`Saved storage state to ${saved.outputPath}`);
  if (saved.profileDir) {
    console.log(
      `Persistent Chrome profile is available at ${saved.profileDir}`
    );
  } else {
    console.log("Camoufox session state was saved as Playwright storageState.");
  }

  await session.close();
  return saved.outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await captureSession(args);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Session capture failed: ${message}`);
    process.exit(1);
  });
}
