import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

import { chromium } from "playwright";

function parseArgs(argv) {
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

function resolvePathIfRelative(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolvePathIfRelative(args.out);

  const browser = await chromium.launch({
    channel: args.browser,
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });

  console.log("");
  console.log("Complete the ChatGPT login and any verification steps in the opened browser.");
  console.log("When you can open chatgpt.com and see the actual app, return here and press Enter.");
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

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await context.storageState({ path: outputPath });

  console.log(`Saved storage state to ${outputPath}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Session capture failed: ${message}`);
  process.exit(1);
});
