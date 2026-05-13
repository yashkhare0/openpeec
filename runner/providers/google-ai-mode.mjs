import { dismissInterstitials } from "../interstitial-handler.mjs";
import { solveGoogleSorryCaptcha } from "../captcha-handler.mjs";

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

// "Before you continue to Google" heading on the EU consent page, in each
// locale we want to recognize. Lower-cased to match the haystack.
const CONSENT_PAGE_HEADINGS = [
  "before you continue to google",
  "bevor sie zu google weitergehen", // de
  "avant de continuer sur google", // fr
  "antes de continuar en google", // es
  "prima di continuare su google", // it
  "voordat u doorgaat naar google", // nl
  "förekommer du fortsätter till google", // sv (approx)
  "google'a devam etmeden önce", // tr
];
const CONSENT_COOKIE_KEYWORDS = ["cookies", "cookie"];

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
  const hasConsentHeading = CONSENT_PAGE_HEADINGS.some((heading) =>
    haystack.includes(heading)
  );
  const hasCookieMention = CONSENT_COOKIE_KEYWORDS.some((kw) =>
    haystack.includes(kw)
  );
  if (hasConsentHeading && hasCookieMention) {
    return "Google is showing a cookie consent page before the AI Mode answer.";
  }
  return null;
}

// Localized strings Google AI Mode uses for the "answer ready" disclaimer
// (≈"AI can make mistakes") and the "in flight" indicator (≈"Searching…").
// Detection is locale-bound, so we have to match each language we run in.
const AI_MODE_READY_MARKERS = [
  "AI Mode response is ready",
  "Antwort im KI-Modus ist bereit", // de
  "Réponse du mode IA prête", // fr
  "Modo IA listo", // es
  "Risposta della modalità IA pronta", // it
];
const AI_MODE_DONE_MARKERS = [
  "AI can make mistakes",
  "KI kann Fehler machen", // de
  "L'IA peut faire des erreurs", // fr
  "La IA puede cometer errores", // es
  "L'IA può commettere errori", // it
  "AI のレスポンスにはミス", // ja approx
];
const AI_MODE_SEARCHING_MARKERS = [
  "Searching",
  "Sucht", // de
  "Recherche en cours", // fr
  "Buscando", // es
  "Ricerca", // it
];

async function snapshotGoogleAiModeState(page, config) {
  return await page.evaluate(
    ({ promptText, readyMarkers, doneMarkers, searchingMarkers }) => {
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
      const matchAny = (haystack, needles) =>
        needles.some((needle) => haystack.includes(needle));
      const explicitReady = matchAny(normalizedBody, readyMarkers);
      const searching = matchAny(normalizedMain, searchingMarkers);
      const finishedDisclaimer = matchAny(normalizedMain, doneMarkers);
      const ready =
        explicitReady ||
        (finishedDisclaimer && !searching && hasPromptHeading);

      return {
        url: window.location.href,
        title: document.title,
        bodyText,
        html: document.documentElement?.outerHTML ?? "",
        ready,
        searching,
      };
    },
    {
      promptText: config.prompt.text,
      readyMarkers: AI_MODE_READY_MARKERS,
      doneMarkers: AI_MODE_DONE_MARKERS,
      searchingMarkers: AI_MODE_SEARCHING_MARKERS,
    }
  );
}

export async function waitForGoogleAiModeResponse({ page, config }) {
  const timeoutMs = resolveResponseStartTimeoutMs(config);
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  let cookieDismissAttempts = 0;
  let captchaAttempts = 0;
  const MAX_COOKIE_DISMISS_ATTEMPTS = 2;
  const MAX_CAPTCHA_ATTEMPTS = 1;
  // Buster needs up to ~90s to fetch + solve the audio challenge; cap at
  // whatever remains of our overall timeout so we don't overrun the run.
  const captchaTimeoutMs = Math.max(15_000, timeoutMs - 10_000);

  while (Date.now() < deadline) {
    lastState = await snapshotGoogleAiModeState(page, config);
    const blockerReason = getGoogleAiModeAccessBlockerReason(
      lastState.title,
      lastState.bodyText,
      { html: lastState.html, url: lastState.url }
    );
    if (blockerReason) {
      const reasonLower = blockerReason.toLowerCase();
      const looksLikeCookieConsent =
        reasonLower.includes("cookie") &&
        cookieDismissAttempts < MAX_COOKIE_DISMISS_ATTEMPTS;
      if (looksLikeCookieConsent) {
        cookieDismissAttempts += 1;
        const clicked = await dismissInterstitials(page).catch(() => 0);
        if (clicked > 0) {
          // Consent form usually navigates back to the original URL; give it
          // time to settle before re-snapshotting.
          await page
            .waitForLoadState("domcontentloaded", { timeout: 10_000 })
            .catch(() => {});
          await page.waitForTimeout(750);
          continue;
        }
        // Fall through to "blocked" if we couldn't find a button to click.
      }
      // "Google blocked" reason covers both the /sorry/ reCAPTCHA and the
      // inline "unusual traffic" wall. Try Buster once; if it solves, keep
      // polling — otherwise fail through to the blocked return below.
      const looksLikeBotWall =
        reasonLower.includes("blocked") &&
        captchaAttempts < MAX_CAPTCHA_ATTEMPTS;
      if (looksLikeBotWall) {
        captchaAttempts += 1;
        const result = await solveGoogleSorryCaptcha(page, {
          timeoutMs: captchaTimeoutMs,
        }).catch((error) => ({
          handled: true,
          solved: false,
          reason:
            error instanceof Error ? error.message : "captcha solver threw",
        }));
        if (result.solved) {
          await page
            .waitForLoadState("domcontentloaded", { timeout: 10_000 })
            .catch(() => {});
          await page.waitForTimeout(750);
          continue;
        }
        // Fall through to blocked with the original reason; surface why the
        // solver couldn't help so the user can debug (missing Buster addon,
        // no anchor frame, IP-flagged, etc.).
        return {
          status: "blocked",
          summary: `${blockerReason} (captcha solver: ${result.reason ?? "no progress"})`,
          fallbackUsed: true,
          promptSubmitted: false,
          responseStarted: false,
        };
      }
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
    // Late-appearing banners can show up during the wait — dismiss
    // best-effort each tick. Cheap (no-op if nothing matches).
    await dismissInterstitials(page).catch(() => 0);
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
