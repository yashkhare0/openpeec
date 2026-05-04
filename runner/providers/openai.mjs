import process from "node:process";

import {
  detectAntiBotBlock,
  detectAntiBotNetworkBlock,
} from "../anti-bot-detector.mjs";

export const OPENAI_PROVIDER = "openai";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHealthCheckTimeoutMs(config) {
  const responseTimeoutMs = config.timing.responseTimeoutMs ?? 300000;
  const configuredTimeout = config.timing.healthCheckTimeoutMs;
  const defaultTimeout = Math.min(responseTimeoutMs, 15000);
  return clamp(
    Math.floor(configuredTimeout ?? defaultTimeout),
    5000,
    responseTimeoutMs
  );
}

function resolveResponseStartTimeoutMs(config) {
  const responseTimeoutMs = config.timing.responseTimeoutMs ?? 300000;
  const configuredTimeout = config.timing.responseStartTimeoutMs;
  const defaultTimeout = Math.min(responseTimeoutMs, 45000);
  return clamp(
    Math.floor(configuredTimeout ?? defaultTimeout),
    5000,
    responseTimeoutMs
  );
}

export function isOpenAiGenerationErrorResponse(responseText) {
  const t = normalizeText(responseText).toLowerCase();
  if (!t) {
    return false;
  }
  return t.includes("something went wrong") && t.includes("help.openai.com");
}

export function detectAccessBlocker(title, responseText, options = {}) {
  return Boolean(getAccessBlockerReason(title, responseText, options));
}

export function getAccessBlockerReason(title, responseText, options = {}) {
  const haystack =
    `${normalizeText(title)} ${normalizeText(responseText)} ${normalizeText(options.url)}`.toLowerCase();
  if (
    haystack.includes("verify you are human") ||
    haystack.includes("challenges.cloudflare.com") ||
    haystack.includes("checking your browser")
  ) {
    return "ChatGPT is showing a human verification challenge. Open `pnpm runner:capture-session -- --engine camoufox` and complete it manually in the local browser session.";
  }

  const antiBot = detectAntiBotBlock({
    statusCode: options.statusCode,
    html: options.html,
    title,
    bodyText: responseText,
    url: options.url,
  });
  if (antiBot.blocked) {
    return `ChatGPT access was blocked before the prompt could run (${antiBot.reason}).`;
  }

  const patterns = [
    "just a moment",
    "security verification",
    "blocked the security verification process",
    "challenges.cloudflare.com",
    "verify you are human",
    "checking your browser",
    "incompatible browser extension or network configuration",
    "your browser extensions or network settings have blocked the security verification process",
  ];
  return patterns.some((pattern) => haystack.includes(pattern))
    ? "ChatGPT access was blocked before the prompt could run."
    : null;
}

export async function snapshotPageGateState(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    bodyText: document.body?.innerText ?? "",
    html: document.documentElement?.outerHTML ?? "",
  }));
}

function matchesCriticalChatGpt403(url) {
  try {
    const parsed = new URL(url);
    if (!/chatgpt\.com$/i.test(parsed.hostname)) {
      return false;
    }

    return [
      "/backend-anon/conversation/init",
      "/backend-anon/models",
      "/backend-anon/me",
      "/backend-anon/sentinel/chat-requirements/prepare",
      "/backend-anon/system_hints",
      "/backend-anon/accounts/check",
      "/backend-anon/settings/voices",
      "/backend-anon/settings/redeemed_free_trial_on_device",
      "/backend-anon/checkout_pricing_config/countries",
      "/backend-anon/accounts/passkey/challenge",
    ].some((pathPrefix) => parsed.pathname.startsWith(pathPrefix));
  } catch {
    return false;
  }
}

export function classifyChatGptPageState({
  url,
  title,
  bodyText,
  html,
  statusCode,
  promptVisible,
  networkEvents = [],
}) {
  const blockerReason = getAccessBlockerReason(title, bodyText, {
    html,
    statusCode,
    url,
  });
  if (blockerReason) {
    return {
      state: "blocked",
      reason: blockerReason,
    };
  }

  const normalizedBody = normalizeText(bodyText).toLowerCase();
  const normalizedUrl = normalizeText(url).toLowerCase();
  const loginWallVisible =
    normalizedBody.includes("get started") &&
    normalizedBody.includes("log in") &&
    normalizedBody.includes("sign up");
  if (normalizedUrl.includes("/auth/login") || loginWallVisible) {
    return {
      state: "blocked",
      reason:
        "ChatGPT requires a logged-in or warmed local session before prompts can run. Run `pnpm runner:capture-session -- --engine camoufox` once to prime local storage state.",
    };
  }

  const critical403s = networkEvents.filter(
    (event) => event.status === 403 && matchesCriticalChatGpt403(event.url)
  );
  const hasAnonymousShellError =
    normalizedBody.includes("something went wrong") &&
    normalizedBody.includes("help.openai.com");

  if (critical403s.some((event) => event.url.includes("/conversation/init"))) {
    return {
      state: "blocked",
      reason:
        "ChatGPT guest session is unavailable because conversation requests are being rejected.",
      critical403Count: critical403s.length,
    };
  }

  if (!promptVisible && critical403s.length >= 3) {
    return {
      state: "blocked",
      reason: `ChatGPT guest session is unavailable because ${critical403s.length} critical requests were rejected.`,
      critical403Count: critical403s.length,
    };
  }

  if (!promptVisible && hasAnonymousShellError && critical403s.length > 0) {
    return {
      state: "blocked",
      reason:
        "ChatGPT loaded an anonymous error shell instead of a usable conversation view.",
      critical403Count: critical403s.length,
    };
  }

  if (promptVisible) {
    return {
      state: "ready",
    };
  }

  const networkBlocker = detectAntiBotNetworkBlock(networkEvents);
  if (networkBlocker.blocked) {
    return {
      state: "blocked",
      reason: `ChatGPT access was blocked before the prompt could run (${networkBlocker.reason}).`,
    };
  }

  return {
    state: "pending",
  };
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
      await page.waitForTimeout(250);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

const CHATGPT_LOGGED_OUT_UPSELL_SELECTORS = [
  "button:has-text('Stay logged out')",
  "a:has-text('Stay logged out')",
  "[role='button']:has-text('Stay logged out')",
  "[role='link']:has-text('Stay logged out')",
  "text=/^\\s*Stay logged out\\s*$/i",
];

export async function dismissChatGptLoggedOutUpsell(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2500;
  const settleMs = options.settleMs ?? 300;

  for (const selector of CHATGPT_LOGGED_OUT_UPSELL_SELECTORS) {
    const control = page.locator(selector).first();
    const exists = await control.count().catch(() => 0);
    if (!exists) {
      continue;
    }

    const visible = await control.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    try {
      await control.click({ timeout: timeoutMs });
      if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
      }
      return { dismissed: true, selector };
    } catch {
      continue;
    }
  }

  return { dismissed: false, selector: null };
}

async function isPromptComposerVisible(page, selector) {
  const input = page.locator(selector).first();
  const exists = await input.count().catch(() => 0);
  if (!exists) {
    return false;
  }
  return await input.isVisible().catch(() => false);
}

async function waitForChatGptComposer(page, config, networkEvents) {
  const timeoutMs = resolveHealthCheckTimeoutMs(config);
  const deadline = Date.now() + timeoutMs;
  let lastReason =
    "ChatGPT never reached a usable prompt composer before timing out.";

  while (Date.now() < deadline) {
    await dismissCookieBanner(page);
    await dismissChatGptLoggedOutUpsell(page);

    const promptVisible = await isPromptComposerVisible(
      page,
      config.prompt.inputSelector
    );
    const gateState = await snapshotPageGateState(page);
    const pageState = classifyChatGptPageState({
      url: gateState.url,
      title: gateState.title,
      bodyText: gateState.bodyText,
      html: gateState.html,
      promptVisible,
      networkEvents,
    });

    if (pageState.state === "ready") {
      return {
        ok: true,
        gateState,
      };
    }

    if (pageState.reason) {
      lastReason = pageState.reason;
    }

    if (pageState.state === "blocked") {
      return {
        ok: false,
        status: "blocked",
        reason: lastReason,
        gateState,
      };
    }

    await page.waitForTimeout(750);
  }

  const promptVisible = await isPromptComposerVisible(
    page,
    config.prompt.inputSelector
  );
  const gateState = await snapshotPageGateState(page);
  const pageState = classifyChatGptPageState({
    url: gateState.url,
    title: gateState.title,
    bodyText: gateState.bodyText,
    html: gateState.html,
    promptVisible,
    networkEvents,
  });

  if (pageState.state === "ready") {
    return {
      ok: true,
      gateState,
    };
  }

  return {
    ok: false,
    status: pageState.state === "blocked" ? "blocked" : "failed",
    reason: pageState.reason ?? lastReason,
    gateState,
  };
}

async function waitForAssistantResponse(page, config, networkEvents) {
  const timeoutMs = resolveResponseStartTimeoutMs(config);
  const deadline = Date.now() + timeoutMs;
  const response = page
    .locator(config.extraction.responseContainerSelector)
    .first();
  let dismissedLoggedOutUpsell = false;

  while (Date.now() < deadline) {
    const dismissal = await dismissChatGptLoggedOutUpsell(page);
    dismissedLoggedOutUpsell ||= dismissal.dismissed;

    const responseVisible =
      (await response.count().catch(() => 0)) > 0 &&
      (await response.isVisible().catch(() => false));
    if (responseVisible) {
      return { ok: true, dismissedLoggedOutUpsell };
    }

    const promptVisible = await isPromptComposerVisible(
      page,
      config.prompt.inputSelector
    );
    const gateState = await snapshotPageGateState(page);
    const pageState = classifyChatGptPageState({
      url: gateState.url,
      title: gateState.title,
      bodyText: gateState.bodyText,
      html: gateState.html,
      promptVisible,
      networkEvents,
    });

    if (pageState.state === "blocked") {
      return {
        ok: false,
        status: "blocked",
        reason: pageState.reason,
        dismissedLoggedOutUpsell,
      };
    }

    await page.waitForTimeout(1000);
  }

  return {
    ok: false,
    status: "failed",
    reason: `Response did not start within ${timeoutMs}ms.`,
    dismissedLoggedOutUpsell,
  };
}

async function isAssistantResponseStreaming(page) {
  const stopControl = page
    .locator(
      [
        "button[data-testid='stop-button']",
        "button[aria-label*='Stop']",
        "button[aria-label*='stop']",
        "button[aria-label*='stream']",
      ].join(", ")
    )
    .first();

  return (
    (await stopControl.count().catch(() => 0)) > 0 &&
    (await stopControl.isVisible().catch(() => false))
  );
}

async function waitForStableAssistantResponse(page, config, extractResponse) {
  const responseTimeoutMs = config.timing.responseTimeoutMs ?? 300000;
  const timeoutMs = clamp(
    Math.floor(
      config.timing.responseStableTimeoutMs ??
        Math.min(responseTimeoutMs, 120000)
    ),
    5000,
    responseTimeoutMs
  );
  const stableMs = clamp(
    Math.floor(config.timing.responseStableMs ?? 3500),
    1000,
    timeoutMs
  );
  const deadline = Date.now() + timeoutMs;
  let latestExtracted = null;
  let lastText = "";
  let stableSince = 0;
  let dismissedLoggedOutUpsell = false;

  while (Date.now() < deadline) {
    const dismissal = await dismissChatGptLoggedOutUpsell(page);
    dismissedLoggedOutUpsell ||= dismissal.dismissed;

    latestExtracted = await extractResponse(page, config).catch(() => null);
    const responseText = latestExtracted?.responseText ?? "";
    const streaming = await isAssistantResponseStreaming(page);

    if (responseText && responseText === lastText && !streaming) {
      stableSince ||= Date.now();
      if (Date.now() - stableSince >= stableMs) {
        return {
          ok: true,
          extracted: latestExtracted,
          dismissedLoggedOutUpsell,
        };
      }
    } else {
      lastText = responseText;
      stableSince = 0;
    }

    await page.waitForTimeout(750);
  }

  return {
    ok: false,
    extracted: latestExtracted,
    reason: `Response text did not stabilize within ${timeoutMs}ms.`,
    dismissedLoggedOutUpsell,
  };
}

export async function runOpenAiPromptFlow({
  page,
  config,
  networkEvents,
  warnings,
  promptReadyTimeoutMs,
  extractResponse,
  organicAlreadySubmitted = false,
}) {
  let status = "success";
  let summary = "Run completed";
  let fallbackUsed = false;
  let promptSubmitted = false;
  let responseStarted = false;
  let loggedOutUpsellDismissed = false;

  const noteLoggedOutUpsellDismissal = (dismissed) => {
    if (!dismissed || loggedOutUpsellDismissed) {
      return;
    }
    loggedOutUpsellDismissed = true;
    warnings.push(
      "ChatGPT logged-out upsell appeared; clicked Stay logged out and continued response extraction."
    );
  };

  if (organicAlreadySubmitted) {
    promptSubmitted = true;
  } else {
    const readiness = await waitForChatGptComposer(page, config, networkEvents);
    if (!readiness.ok) {
      fallbackUsed = true;
      status = readiness.status ?? "failed";
      summary = readiness.reason;
      warnings.push(
        status === "blocked"
          ? "Access blocker detected on chatgpt.com before prompt submission; metrics are not treated as a valid monitoring run."
          : "ChatGPT did not reach a usable prompt composer before prompt submission."
      );
    }

    if (status !== "success") {
      return {
        status,
        summary,
        fallbackUsed,
        promptSubmitted,
        responseStarted,
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
      await dismissCookieBanner(page);
      const input = page.locator(config.prompt.inputSelector).first();
      await input.waitFor({
        state: "visible",
        timeout: promptReadyTimeoutMs,
      });
      await input.click({ timeout: promptReadyTimeoutMs });

      const existingInputText = normalizeText(
        await input
          .evaluate((node) => {
            if (node instanceof HTMLTextAreaElement) {
              return node.value;
            }
            if (node instanceof HTMLElement) {
              return node.innerText || node.textContent || "";
            }
            return "";
          })
          .catch(() => "")
      );
      const expectedPrompt = normalizeText(config.prompt.text);

      if (existingInputText !== expectedPrompt) {
        if (config.prompt.clearExisting) {
          await page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A"
          );
          await page.keyboard.press("Backspace");
        }
        await page.keyboard.type(config.prompt.text);
      }

      if (config.prompt.submitSelector) {
        const submit = page.locator(config.prompt.submitSelector).first();
        const submitReady =
          (await submit.count()) > 0 &&
          (await submit.isVisible().catch(() => false)) &&
          (await submit.isEnabled().catch(() => true));
        if (submitReady) {
          let usedKeyboardSubmitFallback = false;
          try {
            await submit.click({ timeout: 2000 });
          } catch (error) {
            usedKeyboardSubmitFallback = true;
            warnings.push(
              `Submit button click failed; retried with keyboard submit: ${
                error instanceof Error
                  ? error.message.split("\n")[0]
                  : "unknown error"
              }`
            );
            await input.click({ timeout: 2000 }).catch(() => {});
            await page.keyboard.press(config.prompt.submitKey);
          }
          await page.waitForTimeout(1500);
          const remainingInputText = normalizeText(
            await input
              .evaluate((node) => {
                if (node instanceof HTMLTextAreaElement) {
                  return node.value;
                }
                if (node instanceof HTMLElement) {
                  return node.innerText || node.textContent || "";
                }
                return "";
              })
              .catch(() => "")
          );
          if (
            remainingInputText === expectedPrompt &&
            !usedKeyboardSubmitFallback
          ) {
            warnings.push(
              "Submit button click left the prompt in the composer; retried with keyboard submit."
            );
            await input.click({ timeout: 2000 }).catch(() => {});
            await page.keyboard.press(config.prompt.submitKey);
          }
        } else {
          await page.keyboard.press(config.prompt.submitKey);
        }
      } else {
        await page.keyboard.press(config.prompt.submitKey);
      }
      promptSubmitted = true;
    } catch (error) {
      warnings.push(
        `Prompt submission failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  if (promptSubmitted) {
    const responseStart = await waitForAssistantResponse(
      page,
      config,
      networkEvents
    );
    responseStarted = responseStart.ok;
    noteLoggedOutUpsellDismissal(responseStart.dismissedLoggedOutUpsell);
    if (!responseStart.ok) {
      if (responseStart.status === "blocked") {
        status = "blocked";
        fallbackUsed = true;
        summary = responseStart.reason;
        warnings.push(
          "Access blocker detected on chatgpt.com after prompt submission; metrics are not treated as a valid monitoring run."
        );
      } else {
        warnings.push(
          `Response container not found after submit: ${responseStart.reason}`
        );
      }
    }
  }

  if (promptSubmitted && responseStarted) {
    const stableResponse = await waitForStableAssistantResponse(
      page,
      config,
      extractResponse
    );
    noteLoggedOutUpsellDismissal(stableResponse.dismissedLoggedOutUpsell);
    if (!stableResponse.ok) {
      warnings.push(stableResponse.reason);
    }
  }

  const finalLoggedOutDismissal = await dismissChatGptLoggedOutUpsell(page);
  noteLoggedOutUpsellDismissal(finalLoggedOutDismissal.dismissed);

  return {
    status,
    summary,
    fallbackUsed,
    promptSubmitted,
    responseStarted,
  };
}

export const openaiProvider = {
  slug: OPENAI_PROVIDER,
  label: "OpenAI",
  runnable: true,
  requiresPromptSubmission: true,
  defaults: {
    sessionMode: "stored",
    navigation: {
      url: "https://chatgpt.com/",
      submitStrategy: "type",
      promptQueryParam: null,
    },
    prompt: {
      inputSelector:
        "div#prompt-textarea[contenteditable='true'], #prompt-textarea[contenteditable='true'], [contenteditable='true']:visible, textarea:visible",
      submitSelector:
        "button[data-testid='send-button'], button[aria-label*='Send']",
      submitKey: "Enter",
      clearExisting: true,
    },
    extraction: {
      responseContainerSelector:
        "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
      responseTextSelector:
        "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
      citationLinkSelector: "a[href]",
      maxCitations: 20,
    },
  },
  runPromptFlow: runOpenAiPromptFlow,
  getAccessBlockerReason,
  detectAccessBlocker,
  isGenerationErrorResponse: isOpenAiGenerationErrorResponse,
  accessBlockerWarning:
    "Access blocker detected on chatgpt.com; metrics are not treated as a valid monitoring run.",
  noResponseWarning: "No response text extracted from assistant output.",
  noOutputSummary:
    "Prompt flow completed but no response/citations were extracted.",
};
