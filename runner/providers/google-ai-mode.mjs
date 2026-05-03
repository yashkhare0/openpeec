export const GOOGLE_AI_MODE_PROVIDER = "google-ai-mode";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

export function getGoogleAiModeAccessBlockerReason(
  title,
  bodyText,
  options = {}
) {
  const haystack =
    `${normalizeText(title)} ${normalizeText(bodyText)} ${normalizeText(options.url)}`.toLowerCase();
  if (
    haystack.includes("unusual traffic") ||
    haystack.includes("/sorry/") ||
    haystack.includes("detected unusual traffic")
  ) {
    return "Google blocked the AI Mode page before the answer could be read.";
  }
  if (
    haystack.includes("before you continue to google") &&
    haystack.includes("cookies")
  ) {
    return "Google is showing a cookie consent page before the AI Mode answer.";
  }
  return null;
}

async function snapshotGoogleAiModeState(page, config) {
  return await page.evaluate((promptText) => {
    const main = document.querySelector("main") ?? document.body;
    const bodyText =
      document.body?.innerText ?? document.body?.textContent ?? "";
    const mainText = main?.innerText ?? main?.textContent ?? bodyText;
    const normalizedBody = bodyText.replace(/\s+/g, " ").trim();
    const normalizedMain = mainText.replace(/\s+/g, " ").trim();
    const prompt = String(promptText ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const hasPromptHeading = prompt ? normalizedMain.includes(prompt) : true;
    const ready =
      normalizedBody.includes("AI Mode response is ready") ||
      (normalizedMain.includes("AI can make mistakes") &&
        !normalizedMain.includes("Searching") &&
        hasPromptHeading);

    return {
      url: window.location.href,
      title: document.title,
      bodyText,
      html: document.documentElement?.outerHTML ?? "",
      ready,
      searching: normalizedMain.includes("Searching"),
    };
  }, config.prompt.text);
}

export async function waitForGoogleAiModeResponse({ page, config }) {
  const timeoutMs = resolveResponseStartTimeoutMs(config);
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await snapshotGoogleAiModeState(page, config);
    const blockerReason = getGoogleAiModeAccessBlockerReason(
      lastState.title,
      lastState.bodyText,
      { html: lastState.html, url: lastState.url }
    );
    if (blockerReason) {
      return {
        status: "blocked",
        summary: blockerReason,
        fallbackUsed: true,
        promptSubmitted: false,
        responseStarted: false,
      };
    }
    if (lastState.ready) {
      return {
        status: "success",
        summary: "Run completed",
        fallbackUsed: false,
        promptSubmitted: false,
        responseStarted: true,
      };
    }
    await page.waitForTimeout(750);
  }

  return {
    status: "failed",
    summary: `Google AI Mode response did not become ready within ${timeoutMs}ms.`,
    fallbackUsed: true,
    promptSubmitted: false,
    responseStarted: false,
  };
}

export async function extractGoogleAiModeResponse(page, config) {
  return await page.evaluate(
    ({ promptText, maxCitations }) => {
      const normalizeLine = (line) => line.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main") ?? document.body;
      const rawText =
        main?.innerText ??
        main?.textContent ??
        document.body?.innerText ??
        document.body?.textContent ??
        "";
      const prompt = normalizeLine(promptText ?? "");
      const isUtilityLine = (line) =>
        [
          /^Search Results$/i,
          /^AI Mode history$/i,
          /^New thread$/i,
          /^View related links$/i,
          /^Copy text$/i,
          /^Share$/i,
          /^Good response$/i,
          /^Bad response$/i,
          /^About this result$/i,
          /^Show all$/i,
          /^Ask anything$/i,
          /^More input options$/i,
          /^Microphone$/i,
          /^AI Mode response is ready$/i,
          /^\d+\s+sites$/i,
        ].some((pattern) => pattern.test(line));
      const unwrapRedirect = (url) => {
        try {
          const parsed = new URL(url);
          const host = parsed.hostname.replace(/^www\./i, "");
          if (host === "google.com" && parsed.pathname === "/url") {
            const target =
              parsed.searchParams.get("q") || parsed.searchParams.get("url");
            if (target && /^https?:\/\//i.test(target)) {
              return target;
            }
          }
        } catch {
          return url;
        }
        return url;
      };
      const lines = rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean);

      let startIndex = 0;
      if (prompt) {
        const promptIndex = lines.findIndex((line) => line === prompt);
        if (promptIndex >= 0) {
          startIndex = promptIndex + 1;
        }
      }

      const answerLines = [];
      for (const line of lines.slice(startIndex)) {
        if (/^AI can make mistakes/i.test(line)) {
          break;
        }
        if (isUtilityLine(line)) {
          continue;
        }
        answerLines.push(line);
      }

      const seen = new Set();
      const citations = [];
      const anchors = Array.from(main?.querySelectorAll("a[href]") ?? []);
      for (const anchor of anchors) {
        if (citations.length >= maxCitations) {
          break;
        }
        const rawHref = anchor.getAttribute("href") ?? "";
        if (!rawHref) {
          continue;
        }
        const absoluteUrl = new URL(rawHref, window.location.href).toString();
        const unwrappedUrl = unwrapRedirect(absoluteUrl);
        let parsed;
        try {
          parsed = new URL(unwrappedUrl);
        } catch {
          continue;
        }
        if (!/^https?:$/i.test(parsed.protocol)) {
          continue;
        }
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (
          host === "google.com" ||
          host === "accounts.google.com" ||
          host === "support.google.com"
        ) {
          continue;
        }
        const url = parsed.toString();
        if (seen.has(url)) {
          continue;
        }
        seen.add(url);
        const nearestTextContainer =
          anchor.closest("li, article, section, div, p") ?? anchor;
        const rawTitle =
          (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "")
            .replace(/\s+/g, " ")
            .trim() || url;
        citations.push({
          index: citations.length + 1,
          url,
          rawTitle,
          snippet: (nearestTextContainer.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 260),
        });
      }

      return {
        pageTitle: document.title,
        finalUrl: window.location.href,
        responseContainerFound: Boolean(main),
        responseText: answerLines.join("\n"),
        responseHtml: main?.outerHTML ?? "",
        citations,
      };
    },
    {
      promptText: config.prompt.text,
      maxCitations: config.extraction.maxCitations,
    }
  );
}

export const googleAiModeProvider = {
  slug: GOOGLE_AI_MODE_PROVIDER,
  label: "Google AI Mode",
  runnable: true,
  requiresPromptSubmission: false,
  defaults: {
    sessionMode: "guest",
    navigation: {
      url: "https://www.google.com/search?udm=50",
      submitStrategy: "deeplink",
      promptQueryParam: "q",
      waitUntil: "domcontentloaded",
    },
    prompt: {
      inputSelector: "",
      submitSelector: "",
      submitKey: "Enter",
      clearExisting: true,
    },
    extraction: {
      responseContainerSelector: "main",
      responseTextSelector: "main",
      citationLinkSelector: "a[href]",
      maxCitations: 24,
    },
    assertions: {
      urlIncludes: "google.com/search",
    },
  },
  runPromptFlow: waitForGoogleAiModeResponse,
  extractRawResponse: extractGoogleAiModeResponse,
  getAccessBlockerReason: getGoogleAiModeAccessBlockerReason,
  detectAccessBlocker: (title, responseText, options = {}) =>
    Boolean(getGoogleAiModeAccessBlockerReason(title, responseText, options)),
  isGenerationErrorResponse: () => false,
  accessBlockerWarning:
    "Access blocker detected on Google AI Mode; metrics are not treated as a valid monitoring run.",
  noResponseWarning: "No response text extracted from Google AI Mode output.",
  noOutputSummary:
    "Google AI Mode loaded but no answer text or citations were extracted.",
};
