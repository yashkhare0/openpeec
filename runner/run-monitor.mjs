import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { chromium } from "playwright";
import { api } from "../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    config: "runner/example.monitor.json",
    output: undefined,
    ingest: false,
    headed: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      args.config = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--output") {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--ingest") {
      args.ingest = true;
      continue;
    }
    if (token === "--headed") {
      args.headed = true;
    }
  }

  return args;
}

export async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function resolvePathIfRelative(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

export async function loadAuthProfileMaterial(authProfileConfig) {
  if (!authProfileConfig) {
    return {};
  }

  if (authProfileConfig.authType === "file") {
    const filePath = resolvePathIfRelative(authProfileConfig.localRef);
    return await readJsonFile(filePath);
  }

  if (authProfileConfig.authType === "env") {
    const envValue = process.env[authProfileConfig.localRef];
    if (!envValue) {
      throw new Error(
        `Missing environment variable for auth profile reference: ${authProfileConfig.localRef}`
      );
    }

    try {
      const parsed = JSON.parse(envValue);
      return parsed;
    } catch {
      const filePath = resolvePathIfRelative(envValue);
      return await readJsonFile(filePath);
    }
  }

  return {};
}

function ensureWebDeepLink(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `This runner currently supports web deep links only. Received: ${url}`
    );
  }
}

function sanitizeForFilename(input) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeText(input, maxChars = 240) {
  const text = normalizeText(input);
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1)}...`;
}

function cleanCitationTitle(input) {
  return normalizeText(String(input ?? "").replace(/\s*\+\d+\s*$/g, ""));
}

function extractCitationBadgeCount(input) {
  const match = String(input ?? "").match(/\+(\d+)\s*$/);
  if (!match) {
    return 0;
  }
  return Number(match[1]);
}

function canonicalizeCitationUrl(input) {
  const text = normalizeText(input);
  if (!text) {
    return "";
  }

  try {
    const parsed = new URL(text);
    const removableParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
    ];
    for (const name of removableParams) {
      parsed.searchParams.delete(name);
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return text;
  }
}

export function detectAccessBlocker(title, responseText) {
  const haystack =
    `${normalizeText(title)} ${normalizeText(responseText)}`.toLowerCase();
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
  return patterns.some((pattern) => haystack.includes(pattern));
}

function resolvePromptReadyTimeoutMs(config) {
  const responseTimeoutMs = config.timing.responseTimeoutMs ?? 300000;
  const configuredTimeout = config.timing.promptReadyTimeoutMs;
  const defaultTimeout = Math.min(responseTimeoutMs, 15000);
  return clamp(
    Math.floor(configuredTimeout ?? defaultTimeout),
    3000,
    responseTimeoutMs
  );
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

export async function snapshotPageGateState(page) {
  return await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText ?? "",
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
  title,
  bodyText,
  promptVisible,
  networkEvents = [],
}) {
  if (detectAccessBlocker(title, bodyText)) {
    return {
      state: "blocked",
      reason: "ChatGPT access was blocked before the prompt could run.",
    };
  }

  const normalizedBody = normalizeText(bodyText).toLowerCase();
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

  return {
    state: "pending",
  };
}

function classifySourceType(domain) {
  const host = domain.toLowerCase();
  if (!host || host === "unknown") {
    return "other";
  }
  if (host.includes("reddit") || host.includes("stack")) {
    return "ugc";
  }
  if (
    host.includes("wikipedia") ||
    host.includes("arxiv") ||
    host.includes("nature") ||
    host.includes("science")
  ) {
    return "editorial";
  }
  if (
    host.includes("youtube") ||
    host.includes("vimeo") ||
    host.includes("tiktok")
  ) {
    return "social";
  }
  if (
    host.includes("github") ||
    host.includes("docs") ||
    host.includes("developer") ||
    host.includes("readme")
  ) {
    return "docs";
  }
  if (
    host.includes("news") ||
    host.includes("blog") ||
    host.includes("medium") ||
    host.includes("substack")
  ) {
    return "editorial";
  }
  return "corporate";
}

function qualityScoreForCitation(citation) {
  let score = 0.2;
  if (citation.url.startsWith("https://")) {
    score += 0.2;
  }
  if (citation.title.length >= 8) {
    score += 0.25;
  }
  if (citation.snippet.length >= 40) {
    score += 0.2;
  }
  if (!citation.domain.startsWith("chatgpt.com")) {
    score += 0.15;
  }
  if (citation.position <= 3) {
    score += 0.1;
  }
  return Number((clamp(score, 0, 1) * 100).toFixed(1));
}

export function normalizeRunnerConfig(rawConfig) {
  const deepLink = rawConfig.navigation ?? rawConfig.deepLink ?? {};
  const browser = rawConfig.browser ?? {};
  const prompt = rawConfig.prompt ?? {};
  const extraction = rawConfig.extraction ?? {};
  const selectors = rawConfig.selectors ?? {};
  const assertions = rawConfig.assertions ?? {};
  const timing = rawConfig.timing ?? {};
  const ingest = rawConfig.ingest ?? {};
  const navigationUrl = deepLink.url;

  return {
    schemaVersion: 2,
    monitorId: rawConfig.monitorId ?? null,
    promptId: rawConfig.promptId ?? prompt.id ?? null,
    runLabel: rawConfig.runLabel ?? rawConfig.monitorName ?? "prompt-run",
    client: rawConfig.client ?? "chatgpt",
    platform: rawConfig.platform ?? "web",
    model: rawConfig.model ?? prompt.targetModel ?? "chatgpt-web",
    browser: {
      channel: browser.channel ?? null,
      headless: browser.headless ?? true,
      userDataDir: browser.userDataDir ?? null,
    },
    authProfile: rawConfig.authProfile,
    navigation: {
      url: navigationUrl,
      promptQueryParam: deepLink.promptQueryParam ?? null,
      waitUntil: deepLink.waitUntil ?? "domcontentloaded",
      timeoutMs: deepLink.timeoutMs ?? 30000,
    },
    prompt: {
      text: prompt.text ?? rawConfig.promptText ?? "",
      inputSelector:
        prompt.inputSelector ??
        selectors.promptInputSelector ??
        "div#prompt-textarea[contenteditable='true'], #prompt-textarea[contenteditable='true'], [contenteditable='true']:visible, textarea:visible",
      submitSelector:
        prompt.submitSelector ??
        selectors.submitButtonSelector ??
        "button[data-testid='send-button'], button[aria-label*='Send']",
      submitKey: prompt.submitKey ?? "Enter",
      clearExisting: prompt.clearExisting ?? true,
    },
    extraction: {
      responseContainerSelector:
        extraction.responseContainerSelector ??
        selectors.responseContainerSelector ??
        "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
      responseTextSelector:
        extraction.responseTextSelector ??
        selectors.responseTextSelector ??
        "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
      citationLinkSelector:
        extraction.citationLinkSelector ??
        selectors.citationLinkSelector ??
        "a[href]",
      maxCitations: extraction.maxCitations ?? 20,
    },
    assertions: {
      waitForSelector: assertions.waitForSelector ?? null,
      urlIncludes: assertions.urlIncludes ?? null,
      titleIncludes: assertions.titleIncludes ?? null,
    },
    timing: {
      responseTimeoutMs: timing.responseTimeoutMs ?? 300000,
      promptReadyTimeoutMs: timing.promptReadyTimeoutMs,
      healthCheckTimeoutMs: timing.healthCheckTimeoutMs,
      responseStartTimeoutMs: timing.responseStartTimeoutMs,
      settleDelayMs: timing.settleDelayMs ?? 1500,
    },
    ingest: {
      target: ingest.target ?? "auto",
    },
  };
}

export async function writeJson(filePath, data) {
  const absolutePath = resolvePathIfRelative(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(data, null, 2), "utf8");
  return absolutePath;
}

async function writeText(filePath, content) {
  const absolutePath = resolvePathIfRelative(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getRunnerPreflight(config) {
  const normalizedConfig = normalizeRunnerConfig(config);
  const authMaterial = await loadAuthProfileMaterial(
    normalizedConfig.authProfile
  );

  if (authMaterial.storageStatePath) {
    const storageStatePath = resolvePathIfRelative(
      authMaterial.storageStatePath
    );
    if (!(await pathExists(storageStatePath))) {
      return {
        ok: true,
        status: "success",
        warning: `Storage state not found at ${storageStatePath}; continuing with a fresh browser session.`,
      };
    }
  }

  return { ok: true, status: "success" };
}

async function dismissCookieBanner(page) {
  const selectors = [
    "button:has-text('Accept all')",
    "button:has-text('Reject non-essential')",
    "button:has-text('Manage Cookies')",
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

    await button.click({ timeout: 1500 }).catch(() => {});
    return true;
  }

  return false;
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

    const promptVisible = await isPromptComposerVisible(
      page,
      config.prompt.inputSelector
    );
    const gateState = await snapshotPageGateState(page);
    const pageState = classifyChatGptPageState({
      title: gateState.title,
      bodyText: gateState.bodyText,
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
    title: gateState.title,
    bodyText: gateState.bodyText,
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

  while (Date.now() < deadline) {
    const responseVisible =
      (await response.count().catch(() => 0)) > 0 &&
      (await response.isVisible().catch(() => false));
    if (responseVisible) {
      return { ok: true };
    }

    const promptVisible = await isPromptComposerVisible(
      page,
      config.prompt.inputSelector
    );
    const gateState = await snapshotPageGateState(page);
    const pageState = classifyChatGptPageState({
      title: gateState.title,
      bodyText: gateState.bodyText,
      promptVisible,
      networkEvents,
    });

    if (pageState.state === "blocked") {
      return {
        ok: false,
        status: "blocked",
        reason: pageState.reason,
      };
    }

    await page.waitForTimeout(1000);
  }

  return {
    ok: false,
    status: "failed",
    reason: `Response did not start within ${timeoutMs}ms.`,
  };
}

async function extractResponseAndCitations(page, config) {
  const payload = await page.evaluate(
    ({
      responseContainerSelector,
      responseTextSelector,
      citationLinkSelector,
      maxCitations,
    }) => {
      const fallbackContainer = document.querySelector("main") ?? document.body;
      const explicitResponseContainer = document.querySelector(
        responseContainerSelector
      );
      const responseContainer = explicitResponseContainer ?? fallbackContainer;
      const responseContainerFound = Boolean(explicitResponseContainer);

      const responseTextNode = responseContainer.matches?.(responseTextSelector)
        ? responseContainer
        : (responseContainer.querySelector?.(responseTextSelector) ??
          responseContainer);

      const responseText = (responseTextNode?.innerText ?? "").trim();
      const rawLinks = responseContainerFound
        ? Array.from(
            responseContainer.querySelectorAll(citationLinkSelector)
          ).slice(0, maxCitations)
        : [];

      const citations = rawLinks.map((anchor, index) => {
        const href = anchor.getAttribute("href") ?? "";
        const absoluteUrl = href
          ? new URL(href, window.location.href).toString()
          : window.location.href;

        const nearestTextContainer =
          anchor.closest("li, article, section, div, p") ?? anchor;

        return {
          index: index + 1,
          url: absoluteUrl,
          rawTitle:
            (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "")
              .replace(/\s+/g, " ")
              .trim() || absoluteUrl,
          snippet: (nearestTextContainer.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 260),
        };
      });

      return {
        pageTitle: document.title,
        finalUrl: window.location.href,
        responseContainerFound,
        responseText: responseText || fallbackContainer.innerText || "",
        responseHtml: responseContainer.outerHTML ?? "",
        citations,
      };
    },
    {
      responseContainerSelector: config.extraction.responseContainerSelector,
      responseTextSelector: config.extraction.responseTextSelector,
      citationLinkSelector: config.extraction.citationLinkSelector,
      maxCitations: config.extraction.maxCitations,
    }
  );

  const seen = new Set();
  const citations = [];
  const sourceArtifacts = [];
  for (const item of payload.citations) {
    const originalUrl = normalizeText(item.url);
    const url = canonicalizeCitationUrl(originalUrl);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);

    let domain = "";
    try {
      domain = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      domain = "unknown";
    }

    const citation = {
      position: item.index,
      domain,
      url,
      title: summarizeText(cleanCitationTitle(item.rawTitle || url), 140),
      snippet: summarizeText(item.snippet, 220),
      type: classifySourceType(domain),
    };
    citation.qualityScore = qualityScoreForCitation(citation);
    citations.push(citation);
    sourceArtifacts.push({
      ...citation,
      originalUrl,
      rawTitle: summarizeText(item.rawTitle || url, 140),
      badgeCount: extractCitationBadgeCount(item.rawTitle || ""),
    });
  }

  return {
    pageTitle: payload.pageTitle,
    finalUrl: payload.finalUrl,
    responseContainerFound: payload.responseContainerFound,
    responseText: normalizeText(payload.responseText),
    responseHtml: payload.responseHtml,
    citations,
    sourceArtifacts,
  };
}

function computeAnalytics(resultFields) {
  const uniqueDomains = new Set(resultFields.citations.map((c) => c.domain))
    .size;
  const sourceCount = uniqueDomains;
  const avgCitationPosition = resultFields.citations.length
    ? Number(
        (
          resultFields.citations.reduce((sum, c) => sum + c.position, 0) /
          resultFields.citations.length
        ).toFixed(2)
      )
    : null;
  const citationQualityScore = resultFields.citations.length
    ? Number(
        (
          resultFields.citations.reduce((sum, c) => sum + c.qualityScore, 0) /
          resultFields.citations.length
        ).toFixed(2)
      )
    : 0;
  const visibilityScore = Number(
    (
      clamp(resultFields.responseText.length / 1800, 0, 1) * 45 +
      clamp(resultFields.citations.length / 8, 0, 1) * 30 +
      clamp(sourceCount / 6, 0, 1) * 25
    ).toFixed(2)
  );

  return {
    sourceCount,
    averageCitationPosition: avgCitationPosition,
    citationQualityScore,
    visibilityScore,
    responseSummary: summarizeText(resultFields.responseText, 300),
  };
}

async function ingestRunIfRequested(config, result, shouldIngest) {
  if (!shouldIngest) {
    return { ok: false, skipped: "Ingest disabled" };
  }

  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    return { ok: false, skipped: "VITE_CONVEX_URL is not set" };
  }

  const client = new ConvexHttpClient(convexUrl);
  const target = config.ingest.target ?? "auto";
  const ingestKey = process.env.PEEC_RUN_INGEST_KEY;

  const errors = [];

  const canTryAnalytics = target === "auto" || target === "analytics";
  const canTryMonitoring = target === "auto" || target === "monitoring";

  if (canTryAnalytics && config.promptId) {
    try {
      await client.mutation(api.analytics.ingestPromptRun, {
        promptId: config.promptId,
        model: result.model,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        latencyMs: result.latencyMs,
        responseText: result.responseText,
        responseSummary: result.responseSummary,
        visibilityScore: result.visibilityScore,
        citationQualityScore: result.citationQualityScore,
        averageCitationPosition: result.averageCitationPosition ?? undefined,
        sourceCount: result.sourceCount,
        runLabel: config.runLabel,
        citations: result.citations,
        ingestKey,
      });
      return { ok: true, target: "analytics" };
    } catch (error) {
      errors.push(
        `analytics ingest failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  if (canTryMonitoring && config.monitorId) {
    try {
      await client.mutation(api.monitoring.ingestMonitorRun, {
        monitorId: config.monitorId,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        latencyMs: result.latencyMs,
        summary: result.summary,
        deeplinkUsed: result.deeplinkUsed,
        evidencePath: result.evidencePath,
        output: JSON.stringify({
          ...result.output,
          responseSummary: result.responseSummary,
          sourceCount: result.sourceCount,
          citations: result.citations,
          visibilityScore: result.visibilityScore,
          citationQualityScore: result.citationQualityScore,
          averageCitationPosition: result.averageCitationPosition,
        }),
        runner: "local-playwright",
        client: config.client,
        platform: config.platform,
        ingestKey,
      });
      return { ok: true, target: "monitoring" };
    } catch (error) {
      errors.push(
        `monitoring ingest failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  if (errors.length) {
    return { ok: false, error: errors.join(" | ") };
  }
  if (!config.promptId && !config.monitorId) {
    return { ok: false, skipped: "No promptId/monitorId provided for ingest" };
  }
  if (!canTryAnalytics && !canTryMonitoring) {
    return { ok: false, skipped: `Unsupported ingest target: ${target}` };
  }
  return { ok: false, skipped: "No ingestion path succeeded" };
}

export async function runMonitor(config, options = {}) {
  const normalizedConfig = normalizeRunnerConfig(config);
  const warnings = [];
  const preflight = await getRunnerPreflight(normalizedConfig);
  if (!preflight.ok) {
    const finishedAt = Date.now();
    const result = {
      schemaVersion: 2,
      monitorId: normalizedConfig.monitorId,
      promptId: normalizedConfig.promptId,
      runLabel: normalizedConfig.runLabel,
      client: normalizedConfig.client,
      platform: normalizedConfig.platform,
      model: normalizedConfig.model,
      status: "blocked",
      startedAt: finishedAt,
      finishedAt,
      latencyMs: 0,
      summary: preflight.reason,
      deeplinkUsed: buildDeepLinkUrl(normalizedConfig),
      evidencePath: null,
      fallbackUsed: true,
      warnings: [preflight.reason],
      responseText: "",
      responseSummary: preflight.reason,
      sourceCount: undefined,
      citations: [],
      visibilityScore: undefined,
      citationQualityScore: undefined,
      averageCitationPosition: undefined,
      output: {
        preflight: preflight.reason,
      },
    };
    const ingest = await ingestRunIfRequested(
      normalizedConfig,
      result,
      options.ingest
    );
    return { ...result, ingest };
  }
  if (preflight.warning) {
    warnings.push(preflight.warning);
  }

  const startedAt = Date.now();
  let status = "success";
  let summary = "Run completed";
  let evidencePath = null;
  let output = {};
  let responseText = "";
  let citations = [];
  let sourceArtifacts = [];
  let responseSummary = "";
  let sourceCount = undefined;
  let visibilityScore = undefined;
  let citationQualityScore = undefined;
  let averageCitationPosition = undefined;
  let fallbackUsed = false;
  const networkEvents = [];
  const consoleEvents = [];

  const deepLinkUrl = buildDeepLinkUrl(normalizedConfig);
  if (!deepLinkUrl) {
    throw new Error("Missing navigation.url (or deepLink.url)");
  }
  ensureWebDeepLink(deepLinkUrl);

  const authMaterial = await loadAuthProfileMaterial(
    normalizedConfig.authProfile
  );
  const promptReadyTimeoutMs = resolvePromptReadyTimeoutMs(normalizedConfig);
  const persistentProfileDir = normalizedConfig.browser.userDataDir
    ? resolvePathIfRelative(normalizedConfig.browser.userDataDir)
    : null;
  let browser = null;
  let context;
  let page;
  let pageVideo = null;
  let runDir = null;
  let tracePath = null;
  let videoPath = null;
  let pageHtmlPath = null;
  let responseHtmlPath = null;
  let sourcesPath = null;
  let networkPath = null;
  let consolePath = null;

  try {
    const artifactsDir = path.resolve(__dirname, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });
    const monitorSlug = sanitizeForFilename(normalizedConfig.runLabel);
    runDir = path.join(artifactsDir, `${monitorSlug}-${startedAt}`);
    await fs.mkdir(runDir, { recursive: true });

    const contextOptions = {
      recordVideo: {
        dir: runDir,
        size: { width: 1440, height: 900 },
      },
    };
    if (persistentProfileDir) {
      await fs.mkdir(persistentProfileDir, { recursive: true });
      if (authMaterial.storageStatePath || authMaterial.storageState) {
        warnings.push(
          "Persistent Chrome profile is enabled; storage state bootstrap material is ignored in favor of the local profile directory."
        );
      }
    } else if (authMaterial.storageStatePath) {
      const storageStatePath = resolvePathIfRelative(
        authMaterial.storageStatePath
      );
      if (await pathExists(storageStatePath)) {
        contextOptions.storageState = storageStatePath;
      } else {
        warnings.push(
          `Storage state not found at ${storageStatePath}; continuing with a fresh browser session.`
        );
      }
    } else if (authMaterial.storageState) {
      contextOptions.storageState = authMaterial.storageState;
    }

    if (persistentProfileDir) {
      context = await chromium.launchPersistentContext(persistentProfileDir, {
        ...contextOptions,
        channel: normalizedConfig.browser.channel ?? undefined,
        headless: options.headed ? false : normalizedConfig.browser.headless,
      });
    } else {
      browser = await chromium.launch({
        channel: normalizedConfig.browser.channel ?? undefined,
        headless: options.headed ? false : normalizedConfig.browser.headless,
      });
      context = await browser.newContext(contextOptions);
    }
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    if (authMaterial.cookies && Array.isArray(authMaterial.cookies)) {
      await context.addCookies(authMaterial.cookies);
    }
    if (authMaterial.headers && typeof authMaterial.headers === "object") {
      await context.setExtraHTTPHeaders(authMaterial.headers);
    }

    page = await context.newPage();
    for (const existingPage of context.pages()) {
      if (existingPage === page) {
        continue;
      }
      await existingPage.close().catch(() => {});
    }
    pageVideo = page.video();
    const browserUserAgent = await page.evaluate(() => navigator.userAgent);
    const screenshotPath = path.join(runDir, "page.png");
    tracePath = path.join(runDir, "trace.zip");
    pageHtmlPath = path.join(runDir, "page.html");
    responseHtmlPath = path.join(runDir, "response.html");
    sourcesPath = path.join(runDir, "sources.json");
    networkPath = path.join(runDir, "network.json");
    consolePath = path.join(runDir, "console.json");

    page.on("console", (message) => {
      consoleEvents.push({
        type: message.type(),
        text: message.text(),
      });
    });

    page.on("response", (response) => {
      const request = response.request();
      networkEvents.push({
        url: response.url(),
        status: response.status(),
        method: request.method(),
        resourceType: request.resourceType(),
        contentType: response.headers()["content-type"] ?? null,
      });
    });

    const timeoutMs = normalizedConfig.navigation.timeoutMs;
    const waitUntil = normalizedConfig.navigation.waitUntil;
    await page.goto(deepLinkUrl, { waitUntil, timeout: timeoutMs });

    if (normalizedConfig.assertions.waitForSelector) {
      await page.waitForSelector(normalizedConfig.assertions.waitForSelector, {
        timeout: timeoutMs,
      });
    }

    const readiness = await waitForChatGptComposer(
      page,
      normalizedConfig,
      networkEvents
    );
    if (!readiness.ok) {
      fallbackUsed = true;
      status = readiness.status ?? "failed";
      summary = readiness.reason;
      responseText = "";
      responseSummary = summary;
      warnings.push(
        status === "blocked"
          ? "Access blocker detected on chatgpt.com before prompt submission; metrics are not treated as a valid monitoring run."
          : "ChatGPT did not reach a usable prompt composer before prompt submission."
      );
    }

    let promptSubmitted = false;

    if (status !== "success") {
      promptSubmitted = false;
    } else if (!normalizedConfig.prompt.text) {
      warnings.push("No prompt text configured; running extraction-only mode.");
    } else {
      try {
        await dismissCookieBanner(page);
        const input = page
          .locator(normalizedConfig.prompt.inputSelector)
          .first();
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
        const expectedPrompt = normalizeText(normalizedConfig.prompt.text);

        if (existingInputText !== expectedPrompt) {
          if (normalizedConfig.prompt.clearExisting) {
            await page.keyboard.press(
              process.platform === "darwin" ? "Meta+A" : "Control+A"
            );
            await page.keyboard.press("Backspace");
          }
          await page.keyboard.type(normalizedConfig.prompt.text);
        }

        if (normalizedConfig.prompt.submitSelector) {
          const submit = page
            .locator(normalizedConfig.prompt.submitSelector)
            .first();
          if ((await submit.count()) > 0) {
            await submit.click({ timeout: 2000 });
          } else {
            await page.keyboard.press(normalizedConfig.prompt.submitKey);
          }
        } else {
          await page.keyboard.press(normalizedConfig.prompt.submitKey);
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
        normalizedConfig,
        networkEvents
      );
      if (!responseStart.ok) {
        if (responseStart.status === "blocked") {
          status = "blocked";
          fallbackUsed = true;
          summary = responseStart.reason;
          responseSummary = summary;
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

    await page.waitForTimeout(normalizedConfig.timing.settleDelayMs);

    const extracted = await extractResponseAndCitations(page, normalizedConfig);
    responseText = extracted.responseText;
    citations = extracted.citations;
    sourceArtifacts = extracted.sourceArtifacts ?? [];
    output = {
      title: extracted.pageTitle,
      finalUrl: extracted.finalUrl,
      browser: {
        channel: normalizedConfig.browser.channel,
        userAgent: browserUserAgent,
        persistentProfileDir,
      },
      responseContainerSelector:
        normalizedConfig.extraction.responseContainerSelector,
    };

    if (
      status === "success" &&
      detectAccessBlocker(extracted.pageTitle, extracted.responseText)
    ) {
      status = "blocked";
      fallbackUsed = true;
      summary = "ChatGPT access was blocked before the prompt could run.";
      responseText = "";
      responseSummary = summary;
      warnings.push(
        "Access blocker detected on chatgpt.com; metrics are not treated as a valid monitoring run."
      );
      citations = [];
      sourceArtifacts = [];
    }

    if (
      normalizedConfig.assertions.titleIncludes &&
      !String(output.title ?? "").includes(
        normalizedConfig.assertions.titleIncludes
      )
    ) {
      throw new Error(
        `Title assertion failed: expected to include "${normalizedConfig.assertions.titleIncludes}", got "${output.title ?? ""}"`
      );
    }

    if (
      normalizedConfig.assertions.urlIncludes &&
      !String(output.finalUrl ?? "").includes(
        normalizedConfig.assertions.urlIncludes
      )
    ) {
      throw new Error(
        `URL assertion failed: expected to include "${normalizedConfig.assertions.urlIncludes}", got "${output.finalUrl ?? ""}"`
      );
    }

    if (normalizedConfig.prompt.text && !responseText) {
      warnings.push("No response text extracted from assistant output.");
    }

    if (status === "success") {
      const metrics = computeAnalytics({ responseText, citations });
      if (!responseSummary) {
        responseSummary = metrics.responseSummary;
      }
      sourceCount = metrics.sourceCount;
      visibilityScore = metrics.visibilityScore;
      citationQualityScore = metrics.citationQualityScore;
      averageCitationPosition = metrics.averageCitationPosition;
    }

    const missingUsableAssistantResponse = warnings.some((warning) =>
      warning.startsWith("Response container not found after submit:")
    );
    const genericGuestShellResponse =
      citations.length === 0 &&
      /You said:/i.test(responseText) &&
      /ChatGPT can make mistakes/i.test(responseText);

    if (
      status === "success" &&
      promptSubmitted &&
      (missingUsableAssistantResponse || genericGuestShellResponse)
    ) {
      status = "failed";
      fallbackUsed = true;
      summary =
        "Prompt submission did not produce a usable assistant response.";
      responseSummary = summary;
    }

    if (
      status === "success" &&
      normalizedConfig.prompt.text &&
      !responseText &&
      citations.length === 0
    ) {
      status = "failed";
      fallbackUsed = true;
      summary =
        "Prompt flow completed but no response/citations were extracted.";
      responseSummary = summary;
    }

    await writeText(pageHtmlPath, await page.content());
    await writeText(responseHtmlPath, extracted.responseHtml ?? "");
    await writeJson(sourcesPath, sourceArtifacts);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    evidencePath = screenshotPath;
    output.screenshot = screenshotPath;
    output.citationsExtracted = citations.length;
    output.sourcesRecorded = sourceArtifacts.length;
    output.artifacts = {
      runDir,
      screenshot: screenshotPath,
      trace: tracePath,
      video: null,
      pageHtml: pageHtmlPath,
      responseHtml: responseHtmlPath,
      sources: sourcesPath,
      network: networkPath,
      console: consolePath,
    };
  } catch (error) {
    status = "failed";
    summary = error instanceof Error ? error.message : "Unknown runner error";
    fallbackUsed = true;
    warnings.push("Fell back to minimal run output due to extraction failure.");

    if (page) {
      try {
        const artifactsDir = path.resolve(__dirname, "artifacts");
        await fs.mkdir(artifactsDir, { recursive: true });
        const screenshotPath = path.join(
          artifactsDir,
          `${sanitizeForFilename(normalizedConfig.runLabel)}-${startedAt}-fallback.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        evidencePath = screenshotPath;
        if (pageHtmlPath) {
          await writeText(pageHtmlPath, await page.content());
        }
        output = {
          title: await page.title(),
          finalUrl: page.url(),
          screenshot: screenshotPath,
          artifacts: {
            runDir,
            screenshot: screenshotPath,
            trace: tracePath,
            video: null,
            pageHtml: pageHtmlPath,
            responseHtml: responseHtmlPath,
            sources: sourcesPath,
            network: networkPath,
            console: consolePath,
          },
        };
      } catch {
        // Intentionally swallow to keep fallback behavior non-fatal.
      }
    }
  } finally {
    if (networkPath) {
      await writeJson(networkPath, networkEvents);
    }
    if (consolePath) {
      await writeJson(consolePath, consoleEvents);
    }
    if (context && tracePath) {
      try {
        await context.tracing.stop({ path: tracePath });
      } catch {
        // Ignore trace persistence failures to preserve the run result.
      }
    }
    if (page) {
      const capturedVideo = pageVideo;
      await page.close();
      if (capturedVideo) {
        try {
          videoPath = await capturedVideo.path();
        } catch {
          videoPath = null;
        }
      }
    }
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }

  const finishedAt = Date.now();
  const result = {
    schemaVersion: 2,
    monitorId: normalizedConfig.monitorId,
    promptId: normalizedConfig.promptId,
    runLabel: normalizedConfig.runLabel,
    client: normalizedConfig.client,
    platform: normalizedConfig.platform,
    model: normalizedConfig.model,
    status,
    startedAt,
    finishedAt,
    latencyMs: finishedAt - startedAt,
    summary,
    deeplinkUsed: deepLinkUrl,
    evidencePath,
    fallbackUsed,
    warnings,
    responseText,
    responseSummary,
    sourceCount,
    citations,
    visibilityScore,
    citationQualityScore,
    averageCitationPosition,
    output,
  };

  if (result.output?.artifacts) {
    result.output.artifacts.video = videoPath;
  }

  const ingest = await ingestRunIfRequested(
    normalizedConfig,
    result,
    options.ingest
  );
  return { ...result, ingest };
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const configPath = resolvePathIfRelative(cliArgs.config);
  const config = await readJsonFile(configPath);
  const result = await runMonitor(config, cliArgs);

  if (cliArgs.output) {
    const outputPath = await writeJson(cliArgs.output, result);
    console.log(`Wrote run result to ${outputPath}`);
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "success") {
    process.exitCode = 1;
  }
  if (cliArgs.ingest && result.ingest?.ok === false) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Runner failed: ${message}`);
    process.exit(1);
  });
}
function buildDeepLinkUrl(config) {
  const baseUrl = config.navigation.url;
  if (!baseUrl || !config.navigation.promptQueryParam || !config.prompt.text) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set(
      config.navigation.promptQueryParam,
      config.prompt.text
    );
    return url.toString();
  } catch {
    return baseUrl;
  }
}
