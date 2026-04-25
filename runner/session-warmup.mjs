/**
 * Default hop sequence before the provider URL: establish a more “natural”
 * browsing path (best-effort; failures never abort the run).
 * `waitAfterMs` is *extra* dwell time after the page is considered loaded and settled.
 */
export const DEFAULT_DOMAIN_HOPS = [
  { url: "https://www.google.com/", waitAfterMs: 6000 },
  { url: "https://en.wikipedia.org/wiki/Main_Page", waitAfterMs: 5000 },
  { url: "https://github.com/", waitAfterMs: 5000 },
  { googleSearch: "open source software", waitAfterMs: 5000 },
];

export const DEFAULT_SESSION_WARMUP_URLS = [
  "https://www.wikipedia.org/",
  "https://www.google.com/",
  "https://github.com/",
  "https://peec.ai/",
];

/**
 * After navigation: confirm load (and optionally a bounded network-idle), then
 * apply minimum settle + per-hop dwell time.
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {number} opts.loadTimeout
 * @param {number} [opts.postHopSettleMinMs]
 * @param {number} [opts.waitAfterMs]
 * @param {number} [opts.hopNetworkIdleMaxMs] 0 = skip networkidle
 */
export async function settleAfterPageLoad(page, opts) {
  const loadTimeout = opts.loadTimeout;
  const postHop = Math.max(0, Math.floor(opts.postHopSettleMinMs ?? 0));
  const waitAfter = Math.max(0, Math.floor(opts.waitAfterMs ?? 0));
  const idleMax = Math.max(0, Math.floor(opts.hopNetworkIdleMaxMs ?? 0));

  try {
    await page.waitForLoadState("load", { timeout: loadTimeout });
  } catch {
    // page may have errored; still run dwell for observability
  }
  if (idleMax > 0) {
    try {
      await page.waitForLoadState("networkidle", { timeout: idleMax });
    } catch {
      // long-polling / analytics — never block the run
    }
  }
  if (postHop > 0) {
    await page.waitForTimeout(postHop);
  }
  if (waitAfter > 0) {
    await page.waitForTimeout(waitAfter);
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {Array<Record<string, unknown> | string>} [hops]
 * @param {object} [options]
 * @param {string} [options.waitUntil]  Playwright page.goto `waitUntil` (default: load)
 * @param {number} [options.gotoTimeoutMs]
 * @param {number} [options.postHopSettleMinMs]  Minimum pause after page load+idle, before `waitAfterMs`
 * @param {number} [options.hopNetworkIdleMaxMs]  If >0, try networkidle up to this many ms after load
 */
export async function runDomainHopSequence(page, hops, options = {}) {
  const waitUntil = options.waitUntil ?? "load";
  const gotoTimeoutMs = options.gotoTimeoutMs ?? 30_000;
  const postHopSettleMinMs = Math.max(
    0,
    Math.floor(options.postHopSettleMinMs ?? 2500)
  );
  const hopNetworkIdleMaxMs = Math.max(
    0,
    Math.floor(options.hopNetworkIdleMaxMs ?? 0)
  );
  const loadCap = Math.min(gotoTimeoutMs, 60_000);

  if (!hops || hops.length === 0) {
    return;
  }

  const total = hops.length;
  let index = 0;
  for (const raw of hops) {
    index += 1;
    const label =
      typeof raw === "string"
        ? raw
        : raw != null && typeof raw === "object" && "googleSearch" in raw
          ? `Google search: ${String(raw.googleSearch).slice(0, 40)}${String(raw.googleSearch).length > 40 ? "..." : ""}`
          : raw != null && typeof raw === "object" && "url" in raw
            ? String(/** @type {any} */ (raw).url)
            : `hop ${index}`;
    console.log(`[openpeec-runner] domain hop ${index}/${total}: ${label}`);
    if (typeof raw === "string") {
      try {
        await page.goto(raw, {
          waitUntil,
          timeout: gotoTimeoutMs,
        });
        await settleAfterPageLoad(page, {
          loadTimeout: loadCap,
          postHopSettleMinMs,
          waitAfterMs: 2000,
          hopNetworkIdleMaxMs,
        });
      } catch {
        // best-effort
      }
      continue;
    }

    if (raw == null || typeof raw !== "object") {
      continue;
    }

    const waitAfter =
      typeof raw.waitAfterMs === "number" && raw.waitAfterMs >= 0
        ? raw.waitAfterMs
        : 0;

    if (typeof raw.googleSearch === "string" && raw.googleSearch.trim()) {
      const query = raw.googleSearch.trim();
      try {
        await page.goto("https://www.google.com/", {
          waitUntil,
          timeout: gotoTimeoutMs,
        });
        await settleAfterPageLoad(page, {
          loadTimeout: loadCap,
          postHopSettleMinMs: Math.min(postHopSettleMinMs, 2000),
          waitAfterMs: 0,
          hopNetworkIdleMaxMs,
        });
        const search = page
          .locator(
            'textarea[name="q"], input[name="q"], textarea[aria-label*="Search" i], input[aria-label*="Search" i]'
          )
          .first();
        await search.waitFor({ state: "visible", timeout: 12_000 });
        await search.click({ timeout: 5000 });
        await search.fill("");
        await page.keyboard.type(query, { delay: 40 });
        await page.keyboard.press("Enter");
        await settleAfterPageLoad(page, {
          loadTimeout: loadCap,
          postHopSettleMinMs,
          waitAfterMs: waitAfter,
          hopNetworkIdleMaxMs,
        });
      } catch {
        // best-effort
      }
      continue;
    }

    if (typeof raw.url === "string" && raw.url.trim()) {
      try {
        await page.goto(raw.url, { waitUntil, timeout: gotoTimeoutMs });
        await settleAfterPageLoad(page, {
          loadTimeout: loadCap,
          postHopSettleMinMs,
          waitAfterMs: waitAfter,
          hopNetworkIdleMaxMs,
        });
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * @deprecated Prefer {@link runDomainHopSequence} with {@link DEFAULT_DOMAIN_HOPS} or a custom `navigation.domainHops` config.
 */
export async function warmUpSession(page, options = {}) {
  const urls = options.urls ?? DEFAULT_SESSION_WARMUP_URLS;
  const hops = urls.map((url) => ({ url, waitAfterMs: 0 }));
  return runDomainHopSequence(page, hops, {
    waitUntil: options.waitUntil ?? "load",
    gotoTimeoutMs: options.timeoutMs ?? 8000,
    postHopSettleMinMs: options.postHopSettleMinMs ?? 1500,
    hopNetworkIdleMaxMs: options.hopNetworkIdleMaxMs ?? 0,
  });
}
