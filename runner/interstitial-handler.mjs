/**
 * Best-effort dismissal of cookie banners, consent dialogs, and other
 * interstitials that can show up on any page during a run. Runs are NEVER
 * aborted by failures here — the caller decides what to do if dismissal
 * fails. Designed to be cheap enough to call after every navigation and
 * inside response-wait loops.
 *
 * Playwright-only (camoufox / playwright engines). The nodriver Python path
 * has its own handling.
 */

/**
 * Frame-scoped click attempt. Returns true if a visible matching control
 * was clicked, false otherwise.
 *
 * @param {import("playwright").Frame} frame
 * @param {string[]} selectors
 * @param {{ clickTimeoutMs?: number }} [options]
 */
async function clickFirstVisible(frame, selectors, options = {}) {
  const clickTimeoutMs = options.clickTimeoutMs ?? 2500;
  for (const selector of selectors) {
    const target = frame.locator(selector).first();
    const exists = await target.count().catch(() => 0);
    if (!exists) {
      continue;
    }
    const visible = await target.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    try {
      await target.click({ timeout: clickTimeoutMs });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

/**
 * Selectors covering the common shapes of consent / cookie / "continue
 * without signing in" / generic dismiss controls we've seen across providers.
 *
 * Order matters: prefer "reject"-style buttons before "accept", and explicit
 * cookie-consent buttons before generic close-X buttons (so we don't
 * accidentally close a chat thread or warning modal that happens to be
 * sitting under a banner).
 */
const INTERSTITIAL_SELECTOR_GROUPS = [
  // Google EU consent (consent.google.com + inline banners)
  {
    name: "google-consent",
    selectors: [
      "button[aria-label='Reject all']",
      "form[action*='consent'] button:has-text('Reject all')",
      "form[action*='consent'] button:has-text('Accept all')",
      "button:has-text('Reject all')",
      "button:has-text('Accept all')",
      "[role='dialog'] button:has-text('Reject all')",
      "[role='dialog'] button:has-text('Accept all')",
    ],
  },
  // Generic GDPR / cookie banners
  {
    name: "cookie-banner",
    selectors: [
      "button:has-text('Reject non-essential')",
      "button:has-text('Reject non-essential cookies')",
      "button:has-text('Reject All')",
      "button:has-text('Accept all cookies')",
      "button:has-text('Accept All')",
      "button:has-text('Accept cookies')",
      "button:has-text('I agree')",
      "button:has-text('Got it')",
      "button:has-text('OK')",
      "#onetrust-reject-all-handler",
      "#onetrust-accept-btn-handler",
      "[id*='cookie'] button:has-text('Reject')",
      "[id*='cookie'] button:has-text('Accept')",
      "[class*='cookie'] button:has-text('Reject')",
      "[class*='cookie'] button:has-text('Accept')",
    ],
  },
  // Generic close / dismiss controls on modal dialogs
  {
    name: "generic-dismiss",
    selectors: [
      "[role='dialog'] button[aria-label='Close']",
      "[role='dialog'] button[aria-label='Dismiss']",
      "button[aria-label='Close']",
      "button[aria-label='Dismiss']",
    ],
  },
];

/**
 * Try every selector group on every frame of the page. Returns the number of
 * dismissals that succeeded (usually 0 or 1; can be >1 if multiple banners
 * stack). Never throws.
 *
 * @param {import("playwright").Page} page
 * @param {object} [options]
 * @param {number} [options.clickTimeoutMs]  Per-click timeout (default 2500).
 * @param {number} [options.postClickSettleMs]  Pause after each successful
 *   click so the page can transition (default 350).
 * @param {boolean} [options.includeIframes]  Also scan child frames (default true).
 */
export async function dismissInterstitials(page, options = {}) {
  if (!page || typeof page.locator !== "function") {
    return 0;
  }
  const clickTimeoutMs = options.clickTimeoutMs ?? 2500;
  const postClickSettleMs = options.postClickSettleMs ?? 350;
  const includeIframes = options.includeIframes ?? true;

  let dismissed = 0;
  const frames = includeIframes ? page.frames() : [page.mainFrame()];

  for (const group of INTERSTITIAL_SELECTOR_GROUPS) {
    for (const frame of frames) {
      let clicked = false;
      try {
        clicked = await clickFirstVisible(frame, group.selectors, {
          clickTimeoutMs,
        });
      } catch {
        clicked = false;
      }
      if (clicked) {
        dismissed += 1;
        if (postClickSettleMs > 0) {
          await page.waitForTimeout(postClickSettleMs).catch(() => {});
        }
        // After clicking, the DOM may have changed; restart the outer loop so
        // any newly-revealed banner gets a chance in the next iteration.
        break;
      }
    }
  }

  return dismissed;
}

/**
 * Convenience wrapper for the common case ("just dismiss whatever is on the
 * page right now, I don't care how many"). Same as dismissInterstitials but
 * returns boolean. Useful when callers only want to know whether they should
 * re-check page state.
 *
 * @param {import("playwright").Page} page
 * @param {Parameters<typeof dismissInterstitials>[1]} [options]
 */
export async function dismissInterstitialsOnce(page, options) {
  const count = await dismissInterstitials(page, options);
  return count > 0;
}
