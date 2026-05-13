/**
 * Google CAPTCHA / "unusual traffic" page handler.
 *
 * Used by both run-monitor.mjs (in the OpenAI organic flow) and the
 * google-ai-mode provider's wait loop (deeplink flow). Lives in its own
 * module to avoid a circular import:
 *   run-monitor -> providers/index -> google-ai-mode -> run-monitor (cycle)
 *
 * Two CAPTCHA shapes are handled:
 *   1. Classic /sorry/ URL with a full-page reCAPTCHA challenge.
 *   2. Inline "We detected unusual traffic..." wall served at the original
 *      URL (e.g. /search). Same reCAPTCHA iframe, different framing.
 *
 * Solving the audio challenge requires the Buster Camoufox addon to be
 * loaded into the browser context. If Buster is missing, the iframe will
 * not be found (or the click will not advance) and the solver returns
 * `solved: false` with a descriptive reason.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Strong markers that, if present in the page body, are by themselves enough
// to conclude this is Google's anti-bot / unusual-traffic wall — even when
// the URL is not /sorry/.
const GOOGLE_BOT_WALL_STRONG_MARKERS = [
  /unusual traffic from your computer network/i,
  /detected unusual traffic/i,
  /automated requests/i,
];

/**
 * @param {import("playwright").Page} page
 */
export async function pageLooksLikeGoogleBotWall(page) {
  try {
    return await page.evaluate(
      (sources) => {
        const text = (
          document.body?.innerText ??
          document.body?.textContent ??
          ""
        ).slice(0, 4000);
        return sources
          .map((s) => new RegExp(s.source, s.flags))
          .some((re) => re.test(text));
      },
      GOOGLE_BOT_WALL_STRONG_MARKERS.map((re) => ({
        source: re.source,
        flags: re.flags,
      }))
    );
  } catch {
    return false;
  }
}

/**
 * If the page is on Google's /sorry/index reCAPTCHA interstitial OR the
 * "unusual traffic" inline wall, click the "I'm not a robot" checkbox to
 * trigger the Buster Camoufox addon (which solves audio reCAPTCHA v2
 * challenges automatically), then wait for the page to navigate back to a
 * real search/result URL. Returns { handled, solved, reason } so the caller
 * can continue or fail clearly.
 *
 * @param {import("playwright").Page} page
 * @param {{ timeoutMs?: number }} [options]
 */
export async function solveGoogleSorryCaptcha(page, options = {}) {
  const url = page.url();
  const isOnSorryUrl = /\/sorry\//i.test(url);
  const isOnBotWall = isOnSorryUrl
    ? true
    : await pageLooksLikeGoogleBotWall(page);
  if (!isOnSorryUrl && !isOnBotWall) {
    return {
      handled: false,
      solved: false,
      reason: "no /sorry/ URL and no unusual-traffic markers in body",
    };
  }

  const totalTimeoutMs = clamp(
    Math.floor(options.timeoutMs ?? 90_000),
    10_000,
    300_000
  );
  const startedAt = Date.now();

  // Find the reCAPTCHA iframe ("I'm not a robot" anchor frame).
  const anchorFrame = page
    .frames()
    .find((frame) => /\/recaptcha\/api2\/anchor/i.test(frame.url()));
  if (!anchorFrame) {
    return {
      handled: true,
      solved: false,
      reason:
        "no reCAPTCHA anchor iframe found — Buster addon may not be loaded",
    };
  }

  try {
    const checkbox = anchorFrame
      .locator("#recaptcha-anchor, .recaptcha-checkbox")
      .first();
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });
    await checkbox.click({ timeout: 10_000 });
  } catch (error) {
    return {
      handled: true,
      solved: false,
      reason: `failed to click reCAPTCHA checkbox: ${
        error instanceof Error ? error.message.split("\n")[0] : "unknown"
      }`,
    };
  }

  // Buster needs time to fetch the audio challenge and submit the answer.
  // Success signal differs by which CAPTCHA shape we hit:
  //   - /sorry/ flow: navigation AWAY from /sorry/
  //   - inline bot wall: the unusual-traffic body markers disappear
  while (Date.now() - startedAt < totalTimeoutMs) {
    await page.waitForTimeout(1_500);
    const current = page.url();
    if (isOnSorryUrl && !/\/sorry\//i.test(current)) {
      return { handled: true, solved: true, reason: null, finalUrl: current };
    }
    if (!isOnSorryUrl && !(await pageLooksLikeGoogleBotWall(page))) {
      return { handled: true, solved: true, reason: null, finalUrl: current };
    }
  }

  return {
    handled: true,
    solved: false,
    reason: `Buster did not resolve reCAPTCHA within ${totalTimeoutMs}ms`,
  };
}
