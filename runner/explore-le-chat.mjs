#!/usr/bin/env node
// Recon script: drive Camoufox through Mistral Le Chat as a guest, type a
// search-prone prompt, and capture HTML + screenshots at each stage so we can
// pick stable selectors for the runner provider adapter.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { launchCamoufoxBrowserContext } from "./engines/camoufox.mjs";

const QUERY =
  process.env.OPENPEEC_RECON_QUERY ??
  "what are the most recent updates on Mistral AI's latest model release?";
const ARTIFACT_DIR = path.resolve(process.cwd(), "runner/artifacts/le-chat-recon");
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

/** Try a list of selectors and return the first one that has a visible match. */
async function findFirst(page, candidates, label) {
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    const visible = await loc.isVisible().catch(() => false);
    if (visible) {
      console.log(`[recon] ${label} matched: ${sel}`);
      return { selector: sel, locator: loc };
    }
  }
  console.warn(`[recon] ${label} NOT found among ${candidates.length} candidates`);
  return null;
}

async function probeProbes(page, probes, name) {
  const found = [];
  for (const sel of probes) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count) found.push({ selector: sel, count });
  }
  await fs.writeFile(
    path.join(ARTIFACT_DIR, `${name}.json`),
    JSON.stringify(found, null, 2)
  );
  console.log(`[recon] ${name}:`, found);
  return found;
}

async function main() {
  console.log("[recon] launching camoufox (headed)...");
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
    console.log("[recon] goto chat.mistral.ai");
    await page.goto("https://chat.mistral.ai/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);
    await shot(page, "01-landing");
    await dumpHtml(page, "01-landing");
    console.log("[recon] landing url:", page.url());

    // Many Mistral landing flows redirect to /chat after a moment; if not, try
    // a "Continue without signing in" / "Try Le Chat" / "Get started" button.
    if (!/\/chat($|[/?#])/.test(page.url())) {
      const guestEntry = await findFirst(
        page,
        [
          'a:has-text("Try Le Chat")',
          'a:has-text("Continue")',
          'button:has-text("Continue")',
          'a:has-text("Get started")',
          'button:has-text("Get started")',
          'a[href*="/chat"]',
        ],
        "guest entry button"
      );
      if (guestEntry) {
        await guestEntry.locator.click().catch(() => {});
        await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    await shot(page, "02-after-entry");
    await dumpHtml(page, "02-after-entry");
    console.log("[recon] after-entry url:", page.url());

    // Dismiss any cookie banner.
    const cookieBtn = page
      .locator(
        'button:has-text("Accept"), button:has-text("Reject"), button:has-text("OK")'
      )
      .first();
    if (await cookieBtn.count().catch(() => 0)) {
      console.log("[recon] dismissing cookie/consent banner");
      await cookieBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Find the composer.
    const composer = await findFirst(
      page,
      [
        'textarea[placeholder*="message" i]',
        'textarea[placeholder*="ask" i]',
        'textarea[name="message"]',
        'textarea[data-testid*="prompt" i]',
        'div[contenteditable="true"]',
        "textarea",
      ],
      "composer"
    );
    if (!composer) {
      console.error("[recon] No composer found, dumping page html and exiting.");
      await shot(page, "99-no-composer");
      await dumpHtml(page, "99-no-composer");
      return;
    }

    // Probe for tools/search toggles in the composer area BEFORE typing — they
    // may be hidden until the user interacts.
    await probeProbes(
      page,
      [
        'button[aria-label*="search" i]',
        'button[aria-label*="web" i]',
        'button:has-text("Web Search")',
        'button:has-text("Search")',
        'button:has-text("Tools")',
        'button[data-testid*="search" i]',
        'button[data-testid*="tools" i]',
        'button[role="switch"]',
      ],
      "tools-and-search-buttons-pre-type"
    );

    // Click composer and type the query.
    await composer.locator.click({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await composer.locator.type(QUERY, { delay: 40 });
    await page.waitForTimeout(700);
    await shot(page, "03-typed");

    // Probe again after typing — the submit/send button often becomes enabled.
    await probeProbes(
      page,
      [
        'button[aria-label*="send" i]',
        'button[aria-label*="submit" i]',
        'button[type="submit"]',
        'button[data-testid*="send" i]',
        'button[data-testid*="submit" i]',
        'form button:not([type="button"])',
      ],
      "send-buttons-post-type"
    );

    // Submit via Enter (primary path); we may fall back to button click.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    await shot(page, "04-just-submitted");
    await dumpHtml(page, "04-just-submitted");

    // Wait for response generation. Heuristic: look for a streaming "stop"
    // button to disappear, or for a markdown answer container to appear.
    console.log("[recon] waiting up to 90s for response to settle...");
    const startedAt = Date.now();
    let lastSize = 0;
    let stableSince = null;
    while (Date.now() - startedAt < 90_000) {
      const html = await page.content();
      const size = html.length;
      if (size === lastSize) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince > 5000) break;
      } else {
        stableSince = null;
        lastSize = size;
      }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    await shot(page, "05-response-final");
    await dumpHtml(page, "05-response-final");
    console.log("[recon] final url:", page.url());

    // Probe response container candidates.
    await probeProbes(
      page,
      [
        '[data-message-role="assistant"]',
        '[data-role="assistant"]',
        '[data-testid*="message" i]',
        '[data-testid*="assistant" i]',
        '[data-testid*="response" i]',
        '[data-testid*="bubble" i]',
        '[role="article"]',
        "article",
        'div[class*="message"]',
        'div[class*="assistant"]',
        'div[class*="markdown"]',
        ".prose",
      ],
      "response-container-probes"
    );

    // Probe citation/source markers.
    await probeProbes(
      page,
      [
        'a[href^="https://"]:not([href*="mistral.ai"])',
        '[data-testid*="citation" i]',
        '[data-testid*="source" i]',
        'aside',
        'footer',
        'sup a',
        'cite',
        'a[target="_blank"]',
      ],
      "citation-probes"
    );

    // Click the "Sources" button below the assistant message to open the
    // side sheet — that's where Le Chat exposes the real source URLs (the
    // inline citations are buttons that show only the domain, no href).
    const sourcesBtn = await findFirst(
      page,
      [
        'button:has-text("Sources")',
        'button[aria-label*="ources" i]',
      ],
      "Sources button"
    );
    if (sourcesBtn) {
      await sourcesBtn.locator
        .scrollIntoViewIfNeeded({ timeout: 3_000 })
        .catch(() => {});
      await sourcesBtn.locator.click({ timeout: 5_000 }).catch((e) => {
        console.warn("[recon] sources button click failed:", e.message);
      });
      await page.waitForTimeout(2000);
      await shot(page, "06-sources-opened");
      await dumpHtml(page, "06-sources-opened");

      await probeProbes(
        page,
        [
          '[role="dialog"]',
          '[role="dialog"][data-state="open"]',
          'aside',
          'aside[role="complementary"]',
          'div[class*="sheet"]',
          'div[class*="drawer"]',
          'div[class*="panel"]',
          '[data-state="open"][role="dialog"]',
          '[data-testid*="ources" i]',
          '[data-testid*="ide-panel" i]',
        ],
        "sheet-probes-after-click"
      );
    }

    // Capture all unique external URLs we can see right now.
    const urls = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll("a[href]")) {
        try {
          const u = new URL(a.getAttribute("href"), location.href);
          if (!/^https?:$/.test(u.protocol)) continue;
          const host = u.hostname.replace(/^www\./, "");
          if (host.endsWith("mistral.ai")) continue;
          const s = u.toString();
          if (seen.has(s)) continue;
          seen.add(s);
          out.push({ url: s, text: (a.textContent ?? "").trim().slice(0, 80) });
          if (out.length >= 30) break;
        } catch {
          continue;
        }
      }
      return out;
    });
    await fs.writeFile(
      path.join(ARTIFACT_DIR, "external-urls.json"),
      JSON.stringify(urls, null, 2)
    );
    console.log(`[recon] captured ${urls.length} external URLs`);

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
