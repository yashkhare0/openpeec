// Mistral Le Chat provider adapter for the OpenPeec runner.
//
// Le Chat (chat.mistral.ai/chat) is a guest-friendly chat surface that
// auto-performs web search for many queries. Citations render as a "Sources"
// button at the end of the assistant message; clicking it opens a 320px-wide
// side sheet on the right with the actual <a href> elements. Inline pills in
// the body are buttons that show only the domain name and have no href, so
// clicking the Sources button is required to extract URLs.

export const MISTRAL_PROVIDER = "mistral";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// Le Chat shows a "Le Chat Terms of Service / You must accept our Terms…
// Accept and continue" modal on the first guest visit; until it's clicked
// the composer is in the DOM but covered by the modal overlay, so clicks
// land on the overlay and time out. Cookie banners and similar consent
// dialogs follow the same pattern. List the most specific selectors first
// so we avoid clicking the wrong "Accept" elsewhere on the page.
const CONSENT_DISMISS_SELECTORS = [
  'button:has-text("Accept and continue")',
  'button:has-text("Accept all")',
  'button:has-text("Accept")',
  'button:has-text("Reject all")',
  'button:has-text("Reject")',
  'button:has-text("OK")',
  'button[aria-label="Close"]',
];

async function dismissConsentBanners(page, attempts = 3) {
  let dismissedAny = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let dismissedThisPass = false;
    for (const selector of CONSENT_DISMISS_SELECTORS) {
      const button = page.locator(selector).first();
      const exists = await button.count().catch(() => 0);
      if (!exists) continue;
      const visible = await button.isVisible().catch(() => false);
      if (!visible) continue;
      // Try a normal click first; if Playwright reports the click was
      // intercepted (Radix Dialog can lift overlays mid-animation) fall
      // back to a forced click and then a JS dispatch as last resort.
      let clicked = false;
      try {
        await button.click({ timeout: 2_000 });
        clicked = true;
      } catch {
        try {
          await button.click({ timeout: 2_000, force: true });
          clicked = true;
        } catch {
          try {
            await button.evaluate((el) => el.click());
            clicked = true;
          } catch {
            clicked = false;
          }
        }
      }
      if (clicked) {
        await page.waitForTimeout(500);
        dismissedThisPass = true;
        dismissedAny = true;
        break;
      }
    }
    if (!dismissedThisPass) break;
  }
  return dismissedAny;
}

const RATE_LIMIT_PATTERNS = [
  /you have reached the message limit/i,
  /please wait before sending/i,
  /try again later/i,
  /rate limit/i,
  /too many requests/i,
];

const AUTH_GATE_PATTERNS = [
  /sign in to (?:start|continue|use)/i,
  /create an account to/i,
  /please log in/i,
];

export function getMistralAccessBlockerReason(title, bodyText, options = {}) {
  const haystack = `${normalizeText(title)} ${normalizeText(bodyText)} ${normalizeText(
    options.url
  )}`.toLowerCase();
  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (pattern.test(haystack)) {
      return "Le Chat rate-limited the guest session before the answer could be read.";
    }
  }
  for (const pattern of AUTH_GATE_PATTERNS) {
    if (pattern.test(haystack)) {
      return "Le Chat required login before answering the prompt.";
    }
  }
  return null;
}

const MISTRAL_PROMPT_INPUT_SELECTOR = 'div[contenteditable="true"]';
const MISTRAL_SEND_BUTTON_SELECTOR =
  'button[aria-label*="send" i], button[type="submit"]';
const MISTRAL_ASSISTANT_MESSAGE_SELECTOR =
  '[data-message-author-role="assistant"]';
const MISTRAL_SOURCES_BUTTON_SELECTOR = 'button:has-text("Sources")';
// The side sheet is positioned 320px wide on the right edge; this is the most
// stable structural identifier we have because Le Chat does not put role or
// data-testid on the sheet itself.
const MISTRAL_SOURCES_SHEET_SELECTOR =
  'div[style*="width: 320px"][style*="inset-inline-end"]';

/**
 * Wait for the Le Chat composer (`div[contenteditable="true"]`) to become
 * visible. Returns `{ ok: true }` on success or a failure shape on timeout.
 */
async function waitForLeChatComposer(page, config, promptReadyTimeoutMs) {
  const composer = page.locator(MISTRAL_PROMPT_INPUT_SELECTOR).first();
  const timeout = clamp(
    promptReadyTimeoutMs ?? config.timing.promptReadyTimeoutMs ?? 15_000,
    2_000,
    60_000
  );
  try {
    await composer.waitFor({ state: "visible", timeout });
    return { ok: true, composer };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason: `Le Chat composer not visible within ${timeout}ms: ${
        error instanceof Error ? error.message.split("\n")[0] : "unknown"
      }`,
    };
  }
}

/**
 * After submission, wait for the assistant response to start streaming and
 * then for the page to settle (no further DOM growth for `responseStableMs`).
 * Two complementary signals:
 *   1. An assistant message element appears (`responseStarted`)
 *   2. document.documentElement.outerHTML.length stabilises for N ms
 */
async function waitForLeChatResponseSettled({
  page,
  config,
  promptText,
}) {
  const responseStartTimeoutMs = clamp(
    Math.floor(config.timing.responseStartTimeoutMs ?? 45_000),
    5_000,
    180_000
  );
  const responseTimeoutMs = clamp(
    Math.floor(config.timing.responseTimeoutMs ?? 180_000),
    10_000,
    600_000
  );
  const responseStableMs = clamp(
    Math.floor(config.timing.responseStableMs ?? 4_000),
    1_000,
    30_000
  );

  // 1) Wait for the assistant message bubble to appear.
  let responseStarted = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < responseStartTimeoutMs) {
    const exists = await page
      .locator(MISTRAL_ASSISTANT_MESSAGE_SELECTOR)
      .first()
      .count()
      .catch(() => 0);
    if (exists) {
      responseStarted = true;
      break;
    }
    // Re-check for an immediate access blocker (rate-limit text in body) so
    // we don't waste the full timeout sitting on a blocker page.
    const blockerHit = await page
      .evaluate(() => {
        const text = document.body?.innerText ?? "";
        return /rate limit|too many requests|message limit/i.test(text);
      })
      .catch(() => false);
    if (blockerHit) {
      return {
        responseStarted: false,
        settled: false,
        reason: "Le Chat rate-limited before the response started.",
      };
    }
    await page.waitForTimeout(500);
  }
  if (!responseStarted) {
    return {
      responseStarted: false,
      settled: false,
      reason: `Le Chat did not start streaming a response within ${responseStartTimeoutMs}ms.`,
    };
  }

  // 2) Poll HTML size for stability.
  const finishBy = Date.now() + responseTimeoutMs;
  let lastSize = 0;
  let stableSince = null;
  while (Date.now() < finishBy) {
    const size = await page
      .evaluate(() => document.documentElement.outerHTML.length)
      .catch(() => lastSize);
    if (size === lastSize) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= responseStableMs) {
        return { responseStarted: true, settled: true, reason: null };
      }
    } else {
      stableSince = null;
      lastSize = size;
    }
    await page.waitForTimeout(750);
  }
  return {
    responseStarted: true,
    settled: false,
    reason: `Le Chat response did not settle within ${responseTimeoutMs}ms.`,
  };
}

/**
 * Drive a Le Chat prompt run end-to-end:
 *   navigate → wait composer → click composer → type → Enter → wait response.
 * The runner has already navigated to `chat.mistral.ai/chat` before this is
 * called (via the deeplink path in run-monitor.mjs).
 */
export async function runMistralPromptFlow({
  page,
  config,
  warnings,
  promptReadyTimeoutMs,
}) {
  let status = "success";
  let summary = "Run completed";
  let fallbackUsed = false;
  let promptSubmitted = false;
  let responseStarted = false;

  // First-visit ToS modal can take ~1s to mount after the SPA hydrates, so
  // give it a beat then dismiss whatever consent dialog is up.
  await page.waitForTimeout(1_200);
  await dismissConsentBanners(page).catch(() => {});

  const readiness = await waitForLeChatComposer(
    page,
    config,
    promptReadyTimeoutMs
  );
  // ToS / cookie dialog can appear AFTER the composer is in the DOM, so
  // re-check consent before the click — otherwise the click lands on the
  // overlay and times out.
  await dismissConsentBanners(page).catch(() => {});
  if (!readiness.ok) {
    warnings.push(readiness.reason);
    return {
      status: readiness.status,
      summary: readiness.reason,
      fallbackUsed: true,
      promptSubmitted: false,
      responseStarted: false,
    };
  }

  if (!config.prompt.text) {
    warnings.push("No prompt text configured; running extraction-only mode.");
    return {
      status,
      summary,
      fallbackUsed,
      promptSubmitted,
      responseStarted,
    };
  }

  try {
    const composer = readiness.composer;
    await composer.click({ timeout: promptReadyTimeoutMs ?? 15_000 });
    if (config.prompt.clearExisting !== false) {
      // contenteditable: select all + delete instead of .fill()
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.press("Meta+A").catch(() => {});
      await page.keyboard.press("Delete").catch(() => {});
    }
    await composer.type(config.prompt.text, { delay: 35 });
    await page.waitForTimeout(400);

    const submitKey = config.prompt.submitKey || "Enter";
    await page.keyboard.press(submitKey);
    promptSubmitted = true;

    // Fall back to a click on the send button if Enter alone didn't submit.
    // Heuristic: if the composer still contains the prompt text after a beat,
    // try to click the send button.
    await page.waitForTimeout(800);
    const stillInComposer = await composer
      .evaluate(
        (node, expected) =>
          (node?.innerText ?? node?.textContent ?? "").includes(expected),
        config.prompt.text
      )
      .catch(() => false);
    if (stillInComposer) {
      const sendBtn = page
        .locator(
          config.prompt.submitSelector || MISTRAL_SEND_BUTTON_SELECTOR
        )
        .first();
      const sendExists = await sendBtn.count().catch(() => 0);
      if (sendExists) {
        await sendBtn.click({ timeout: 5_000 }).catch(() => {});
      }
    }
  } catch (error) {
    fallbackUsed = true;
    status = "failed";
    summary = `Le Chat prompt submission failed: ${
      error instanceof Error ? error.message.split("\n")[0] : "unknown"
    }`;
    warnings.push(summary);
    return {
      status,
      summary,
      fallbackUsed,
      promptSubmitted,
      responseStarted,
    };
  }

  const settled = await waitForLeChatResponseSettled({
    page,
    config,
    promptText: config.prompt.text,
  });
  responseStarted = settled.responseStarted;
  if (!settled.settled) {
    fallbackUsed = true;
    status = settled.responseStarted ? "success" : "failed";
    summary =
      settled.reason ?? "Le Chat response did not finish within the time budget.";
    warnings.push(summary);
  }

  return {
    status,
    summary,
    fallbackUsed,
    promptSubmitted,
    responseStarted,
  };
}

/**
 * Click the "Sources" button after the response completes so the right-hand
 * source sheet mounts in the DOM. The generic citation extractor then scans
 * its container for `<a href>` elements via auxiliaryContainerSelectors.
 *
 * No-op if no Sources button is present (response had no web search).
 */
export async function prepareMistralSourcesSheet(page, config) {
  void config;
  const auxiliaryContainerSelectors = [];

  // Pick the LAST visible "Sources" button so we target the most recent turn
  // even if the conversation has multiple assistant messages.
  const button = page.locator(MISTRAL_SOURCES_BUTTON_SELECTOR).last();
  const count = await button.count().catch(() => 0);
  if (count === 0) {
    return { auxiliaryContainerSelectors };
  }
  const visible = await button.isVisible().catch(() => false);
  if (!visible) {
    return { auxiliaryContainerSelectors };
  }

  try {
    await button.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
    await button.click({ timeout: 5_000 });
    // Sheet animates in over ~400ms; give it a beat plus a margin for the
    // anchors to render.
    await page.waitForTimeout(1_500);
  } catch {
    return { auxiliaryContainerSelectors };
  }

  auxiliaryContainerSelectors.push(MISTRAL_SOURCES_SHEET_SELECTOR);
  return { auxiliaryContainerSelectors };
}

export const mistralProvider = {
  slug: MISTRAL_PROVIDER,
  label: "Mistral Le Chat",
  runnable: true,
  requiresPromptSubmission: true,
  defaults: {
    sessionMode: "guest",
    navigation: {
      url: "https://chat.mistral.ai/chat",
      submitStrategy: "type",
      promptQueryParam: null,
      waitUntil: "domcontentloaded",
    },
    prompt: {
      inputSelector: MISTRAL_PROMPT_INPUT_SELECTOR,
      submitSelector: MISTRAL_SEND_BUTTON_SELECTOR,
      submitKey: "Enter",
      clearExisting: true,
    },
    extraction: {
      // Container scopes citation extraction to the latest assistant message.
      // Citations don't have hrefs inside the message body itself (inline
      // pills are buttons that show only the domain) — the runner relies on
      // prepareForExtraction to open the Sources sheet so the generic
      // extractor can scrape its anchors via auxiliary container selectors.
      responseContainerSelector:
        '[data-message-author-role="assistant"]:last-of-type',
      // Use the dedicated answer body instead of the whole assistant message
      // to avoid capturing the "Worked for Xs" streaming indicator, which
      // Le Chat renders as one inline-block span per character — innerText
      // then inserts spaces between letters and produces "W o r k e d  f o r"
      // garbage at the start of every response.
      responseTextSelector: '[data-message-part-type="answer"]:last-of-type',
      citationLinkSelector: 'a[href]',
      maxCitations: 30,
    },
    assertions: {
      urlIncludes: "chat.mistral.ai",
    },
  },
  runPromptFlow: runMistralPromptFlow,
  prepareForExtraction: prepareMistralSourcesSheet,
  getAccessBlockerReason: getMistralAccessBlockerReason,
  detectAccessBlocker: (title, responseText, options = {}) =>
    Boolean(getMistralAccessBlockerReason(title, responseText, options)),
  isGenerationErrorResponse: () => false,
  accessBlockerWarning:
    "Access blocker detected on Le Chat; metrics are not treated as a valid monitoring run.",
  noResponseWarning: "No response text extracted from Le Chat output.",
  noOutputSummary:
    "Le Chat loaded but no answer text or citations were extracted.",
};
