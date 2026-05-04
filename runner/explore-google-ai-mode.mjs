#!/usr/bin/env node
// Recon script: drive Camoufox through an organic Google search and into AI Mode.
// Captures URL transitions, screenshots, and candidate selectors for the runner.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { launchCamoufoxBrowserContext } from "./engines/camoufox.mjs";

const QUERY =
  process.env.OPENPEEC_RECON_QUERY ?? "what is the tallest mountain in europe";
const ARTIFACT_DIR = path.resolve(process.cwd(), "runner/artifacts/google-recon");
const PYTHON =
  process.env.CAMOUFOX_PYTHON ?? "runner/.venv-camoufox/bin/python";

async function shot(page, name) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function dumpHtml(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.html`);
  await fs.writeFile(file, await page.content(), "utf8");
  return file;
}

async function findAiModeTab(page) {
  const candidates = [
    'a[href*="udm=50"]',
    'a:has-text("AI Mode")',
    'div[role="link"]:has-text("AI Mode")',
    '[aria-label="AI Mode"]',
  ];
  for (const sel of candidates) {
    const handle = await page.locator(sel).first();
    if (await handle.count()) {
      return { selector: sel, handle };
    }
  }
  return null;
}

async function main() {
  console.log("[recon] launching camoufox...");
  const ctx = await launchCamoufoxBrowserContext({
    browserOptions: {
      headless: false,
      camoufox: {
        python: PYTHON,
        humanize: 0.8,
        geoip: false,
      },
    },
    contextOptions: { viewport: null },
    persistentProfileDir: null,
    headed: true,
  });
  for (const w of ctx.warnings ?? []) console.warn("[recon]", w);

  const page = await ctx.context.newPage();
  const transitions = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) {
      transitions.push({ at: Date.now(), url: f.url() });
    }
  });

  try {
    console.log("[recon] goto google.com");
    await page.goto("https://www.google.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await shot(page, "01-home");

    // Dismiss consent banner if it shows (EU-ish flow).
    const consent = page
      .locator('button:has-text("Accept all"), button:has-text("Reject all")')
      .first();
    if (await consent.count()) {
      console.log("[recon] consent banner present");
      await consent.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Type into the search box organically.
    const box = page.locator('textarea[name="q"], input[name="q"]').first();
    await box.click();
    await box.type(QUERY, { delay: 90 });
    await shot(page, "02-typed");
    await page.keyboard.press("Enter");

    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, "03-serp");
    await dumpHtml(page, "03-serp");
    console.log("[recon] SERP url:", page.url());

    const tab = await findAiModeTab(page);
    if (!tab) {
      console.error(
        "[recon] AI Mode tab not found. Dumping all toolbar links for inspection."
      );
      const links = await page
        .locator('div[role="navigation"] a, div[role="list"] a, [role="tablist"] a')
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            text: n.textContent?.trim().slice(0, 40),
            href: n.getAttribute("href"),
          }))
        );
      await fs.writeFile(
        path.join(ARTIFACT_DIR, "tab-candidates.json"),
        JSON.stringify(links, null, 2)
      );
    } else {
      console.log("[recon] AI Mode tab matched selector:", tab.selector);
      await tab.handle.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
      await page.waitForTimeout(4000);
      await shot(page, "04-ai-mode");
      await dumpHtml(page, "04-ai-mode");
      console.log("[recon] AI Mode url:", page.url());

      // Try to find the response container — common AI Mode roots.
      const responseProbes = [
        '[data-subtree="aim"]',
        '[role="article"]',
        'div[jsname][data-async-context]',
        'main [data-async-trigger]',
      ];
      const found = [];
      for (const sel of responseProbes) {
        const count = await page.locator(sel).count();
        if (count) found.push({ selector: sel, count });
      }
      await fs.writeFile(
        path.join(ARTIFACT_DIR, "response-probes.json"),
        JSON.stringify(found, null, 2)
      );
      console.log("[recon] response container probes:", found);
    }

    await fs.writeFile(
      path.join(ARTIFACT_DIR, "transitions.json"),
      JSON.stringify(transitions, null, 2)
    );
    console.log("[recon] artifacts written to", ARTIFACT_DIR);
  } catch (error) {
    console.error("[recon] FAILED:", error.message);
    await shot(page, "99-error").catch(() => {});
    await dumpHtml(page, "99-error").catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
