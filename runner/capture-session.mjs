import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

export function parseArgs(argv) {
  const args = {
    out: "runner/chatgpt.storage-state.json",
    url: "https://chatgpt.com/",
    browser: "msedge",
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

export async function openCaptureSession(options = {}) {
  const outputPath = resolvePathIfRelative(
    options.out ?? "runner/chatgpt.storage-state.json"
  );
  const browser = await chromium.launch({
    channel: options.browser ?? "msedge",
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(options.url ?? "https://chatgpt.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  return {
    browser,
    context,
    page,
    outputPath,
    async save() {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await context.storageState({ path: outputPath });
      return outputPath;
    },
    async close() {
      await context.close();
      await browser.close();
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

  const savedPath = await session.save();

  console.log(`Saved storage state to ${savedPath}`);

  await session.close();
  return savedPath;
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
