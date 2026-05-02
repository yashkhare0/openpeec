import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

import {
  detectAntiBotBlock,
  detectAntiBotNetworkBlock,
} from "./anti-bot-detector.mjs";
import {
  CAMOUFOX_ENGINE,
  NODRIVER_ENGINE,
  browserEngineRunnerName,
  getBrowserEnginePreflight,
  launchRunnerBrowserContext,
  normalizeBrowserEngine,
  resolveNodriverPython,
} from "./browser-engine.mjs";
import {
  DEFAULT_DOMAIN_HOPS,
  runDomainHopSequence,
} from "./session-warmup.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
const NODRIVER_WORKER_SCRIPT = path.join(__dirname, "nodriver-worker.py");

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

async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseEnvValue(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const currentKey = line.slice(0, separator).trim();
    if (currentKey !== key) {
      continue;
    }

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

async function resolveConvexUrl() {
  if (process.env.VITE_CONVEX_URL) {
    return process.env.VITE_CONVEX_URL;
  }

  const cwd = process.cwd();
  const envLocal = await readEnvFile(path.join(cwd, ".env.local"));
  const fromLocal = parseEnvValue(envLocal, "VITE_CONVEX_URL");
  if (fromLocal) {
    return fromLocal;
  }

  const env = await readEnvFile(path.join(cwd, ".env"));
  return parseEnvValue(env, "VITE_CONVEX_URL") ?? DEFAULT_LOCAL_CONVEX_URL;
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

export function parseSessionJsonMaterial(sessionJson) {
  const raw = typeof sessionJson === "string" ? sessionJson.trim() : "";
  if (!raw) {
    return { material: {}, warnings: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        material: {},
        warnings: [
          "Provider sessionJson is not a JSON object; continuing with the local browser profile.",
        ],
      };
    }

    if ("origins" in parsed) {
      return { material: { storageState: parsed }, warnings: [] };
    }

    if (
      "cookies" in parsed ||
      "headers" in parsed ||
      "storageState" in parsed ||
      "storageStatePath" in parsed
    ) {
      return { material: parsed, warnings: [] };
    }

    return { material: parsed, warnings: [] };
  } catch {
    return {
      material: {},
      warnings: [
        "Provider sessionJson is invalid JSON; continuing with the local browser profile.",
      ],
    };
  }
}

export async function loadRunnerSessionMaterial(config) {
  const authMaterial = await loadAuthProfileMaterial(config.authProfile);
  const { material: providerMaterial, warnings } = parseSessionJsonMaterial(
    config.sessionJson
  );
  const browserMaterial = config.browser?.storageStatePath
    ? { storageStatePath: config.browser.storageStatePath }
    : {};
  const headers =
    authMaterial.headers || providerMaterial.headers
      ? {
          ...(authMaterial.headers ?? {}),
          ...(providerMaterial.headers ?? {}),
        }
      : undefined;
  const cookies = [
    ...(Array.isArray(authMaterial.cookies) ? authMaterial.cookies : []),
    ...(Array.isArray(providerMaterial.cookies)
      ? providerMaterial.cookies
      : []),
  ];

  return {
    material: {
      ...browserMaterial,
      ...authMaterial,
      ...providerMaterial,
      ...(headers ? { headers } : {}),
      ...(cookies.length ? { cookies } : {}),
    },
    warnings,
  };
}

/** Default disk location for the local real-Chrome session (same as capture-session / open-session). */
export const DEFAULT_OPENAI_USER_DATA_DIR = "runner/profiles/chatgpt-chrome";
export const DEFAULT_CAMOUFOX_STORAGE_STATE_PATH =
  "runner/camoufox.storage-state.json";

/**
 * @param {Record<string, unknown>} rawConfig
 * @returns {"guest"|"stored"}
 */
export function resolveSessionMode(rawConfig) {
  const explicit = rawConfig.sessionMode ?? rawConfig.session?.mode;
  if (explicit === "guest") {
    return "guest";
  }
  if (explicit === "stored") {
    return "stored";
  }
  // Main path: local persistent Chrome (headed warm-up, real cookies). Ephemeral "guest" is opt-in.
  return "stored";
}

function resolveSubmitStrategy(rawConfig) {
  const explicit =
    rawConfig.prompt?.submitStrategy ??
    rawConfig.navigation?.submitStrategy ??
    rawConfig.deepLink?.submitStrategy;
  if (explicit === "deeplink") {
    return "deeplink";
  }
  if (explicit === "type") {
    return "type";
  }

  return "type";
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

/** When this appears in the assistant bubble, the model did not return a real answer. */
export function isOpenAiGenerationErrorResponse(responseText) {
  const t = normalizeText(responseText).toLowerCase();
  if (!t) {
    return false;
  }
  return t.includes("something went wrong") && t.includes("help.openai.com");
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

/**
 * Merge legacy `deepLink` and `navigation` so a partial `navigation` from the
 * queue (url + submit) does not erase `domainHops` that only exist on `deepLink`.
 * Later keys win.
 * @param {Record<string, unknown>} rawConfig
 */
function mergeNavigationLayer(rawConfig) {
  return { ...(rawConfig.deepLink ?? {}), ...(rawConfig.navigation ?? {}) };
}

export function normalizeRunnerConfig(rawConfig) {
  const mergedNav = mergeNavigationLayer(rawConfig);
  const browser = rawConfig.browser ?? {};
  const prompt = rawConfig.prompt ?? {};
  const extraction = rawConfig.extraction ?? {};
  const selectors = rawConfig.selectors ?? {};
  const assertions = rawConfig.assertions ?? {};
  const timing = rawConfig.timing ?? {};
  const ingest = rawConfig.ingest ?? {};
  const navigationUrl = mergedNav.url;
  const rawDomainHops = mergedNav.domainHops;
  const domainHops =
    rawDomainHops === undefined || rawDomainHops === null
      ? DEFAULT_DOMAIN_HOPS
      : Array.isArray(rawDomainHops)
        ? rawDomainHops
        : [];
  const provider = rawConfig.provider ?? "openai";
  const sessionMode = resolveSessionMode(rawConfig);
  const submitStrategy = resolveSubmitStrategy(rawConfig);
  const engine = normalizeBrowserEngine(
    browser.engine ??
      rawConfig.browserEngine ??
      process.env.OPENPEEC_BROWSER_ENGINE
  );
  let userDataDir =
    sessionMode === "stored" && engine !== CAMOUFOX_ENGINE
      ? (browser.userDataDir ?? null)
      : null;
  if (
    sessionMode === "stored" &&
    engine !== CAMOUFOX_ENGINE &&
    !userDataDir &&
    provider === "openai"
  ) {
    userDataDir = DEFAULT_OPENAI_USER_DATA_DIR;
  }
  let storageStatePath =
    sessionMode === "stored" ? (browser.storageStatePath ?? null) : null;
  if (
    sessionMode === "stored" &&
    engine === CAMOUFOX_ENGINE &&
    !storageStatePath
  ) {
    storageStatePath = DEFAULT_CAMOUFOX_STORAGE_STATE_PATH;
  }

  return {
    schemaVersion: 2,
    monitorId: rawConfig.monitorId ?? null,
    promptId: rawConfig.promptId ?? prompt.id ?? null,
    runLabel: rawConfig.runLabel ?? rawConfig.monitorName ?? "prompt-run",
    provider,
    platform: rawConfig.platform ?? "web",
    sessionMode,
    sessionJson:
      sessionMode === "stored" ? (rawConfig.sessionJson ?? null) : null,
    browser: {
      engine,
      channel: browser.channel ?? null,
      headless: browser.headless ?? true,
      userDataDir,
      storageStatePath,
      camoufox: browser.camoufox ?? rawConfig.camoufox ?? {},
      nodriver: browser.nodriver ?? rawConfig.nodriver ?? {},
    },
    authProfile: sessionMode === "stored" ? rawConfig.authProfile : undefined,
    navigation: {
      url: navigationUrl,
      domainHops,
      /** Hops use this (default `load`), not `waitUntil` — ChatGPT nav may stay on `domcontentloaded`. */
      hopWaitUntil: mergedNav.hopWaitUntil ?? "load",
      promptQueryParam:
        submitStrategy === "deeplink"
          ? (mergedNav.promptQueryParam ?? (provider === "openai" ? "q" : null))
          : null,
      submitStrategy,
      waitUntil: mergedNav.waitUntil ?? "domcontentloaded",
      timeoutMs: mergedNav.timeoutMs ?? 30000,
    },
    prompt: {
      text: prompt.text ?? rawConfig.promptText ?? "",
      submitStrategy,
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
      warmupGotoTimeoutMs: timing.warmupGotoTimeoutMs ?? 30000,
      postHopSettleMinMs: timing.postHopSettleMinMs ?? 2500,
      hopNetworkIdleMaxMs: timing.hopNetworkIdleMaxMs ?? 0,
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

async function applyAuthMaterialToContext(context, authMaterial) {
  if (authMaterial.cookies && Array.isArray(authMaterial.cookies)) {
    await context.addCookies(authMaterial.cookies);
  }
  if (authMaterial.headers && typeof authMaterial.headers === "object") {
    await context.setExtraHTTPHeaders(authMaterial.headers);
  }
}

async function persistStorageStateIfConfigured(context, config, warnings) {
  const storageStatePath = config.browser.storageStatePath;
  if (!storageStatePath) {
    return null;
  }

  const absolutePath = resolvePathIfRelative(storageStatePath);
  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await context.storageState({ path: absolutePath });
    return absolutePath;
  } catch (error) {
    warnings.push(
      `Failed to persist browser storage state: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return null;
  }
}

export async function createSharedRunnerBrowserSession(config, options = {}) {
  const normalizedConfig = normalizeRunnerConfig(config);
  if (normalizedConfig.browser.engine !== CAMOUFOX_ENGINE) {
    return null;
  }

  const preflight = await getRunnerPreflight(normalizedConfig);
  if (!preflight.ok) {
    throw new Error(preflight.reason);
  }

  const { material: authMaterial } =
    await loadRunnerSessionMaterial(normalizedConfig);
  const contextOptions = {};

  if (authMaterial.storageStatePath) {
    const storageStatePath = resolvePathIfRelative(
      authMaterial.storageStatePath
    );
    if (await pathExists(storageStatePath)) {
      contextOptions.storageState = storageStatePath;
    }
  } else if (authMaterial.storageState) {
    contextOptions.storageState = authMaterial.storageState;
  }

  const session = await launchRunnerBrowserContext({
    browserOptions: normalizedConfig.browser,
    contextOptions,
    persistentProfileDir: null,
    headed: options.headed,
  });
  await applyAuthMaterialToContext(session.context, authMaterial);

  return {
    ...session,
    shared: true,
    storageStatePath: normalizedConfig.browser.storageStatePath,
    warnings: [
      ...session.warnings,
      "Camoufox uses screenshots, traces, DOM, network, and console artifacts; Playwright video recording is disabled because Firefox remote server does not support it.",
    ],
  };
}

export async function getRunnerPreflight(config) {
  const normalizedConfig = normalizeRunnerConfig(config);
  const enginePreflight = await getBrowserEnginePreflight(
    normalizedConfig.browser
  );
  if (!enginePreflight.ok) {
    return enginePreflight;
  }

  const { material: authMaterial, warnings } =
    await loadRunnerSessionMaterial(normalizedConfig);

  if (authMaterial.storageStatePath) {
    const storageStatePath = resolvePathIfRelative(
      authMaterial.storageStatePath
    );
    if (!(await pathExists(storageStatePath))) {
      return {
        ok: true,
        status: "success",
        warning:
          normalizedConfig.browser.engine === CAMOUFOX_ENGINE
            ? `Storage state not found at ${storageStatePath}; continuing with a fresh Camoufox session.`
            : `Storage state not found at ${storageStatePath}; continuing with the local browser profile.`,
      };
    }
  }

  return { ok: true, status: "success", warning: warnings[0] };
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

async function waitForStableAssistantResponse(page, config) {
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

    latestExtracted = await extractResponseAndCitations(page, config).catch(
      () => null
    );
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

export function normalizeExtractedPayload(payload) {
  const seen = new Set();
  const citations = [];
  const sourceArtifacts = [];
  for (const item of payload.citations ?? []) {
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
    pageTitle: payload.pageTitle ?? "",
    finalUrl: payload.finalUrl ?? "",
    responseContainerFound: Boolean(payload.responseContainerFound),
    responseText: normalizeText(payload.responseText),
    responseHtml: payload.responseHtml ?? "",
    citations,
    sourceArtifacts,
  };
}

export async function extractResponseAndCitations(page, config) {
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

      const responseText = (
        responseTextNode?.innerText ??
        responseTextNode?.textContent ??
        ""
      ).trim();
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
        responseText:
          responseText ||
          fallbackContainer.innerText ||
          fallbackContainer.textContent ||
          "",
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

  return normalizeExtractedPayload(payload);
}

export async function captureResponseScreenshot(
  page,
  config,
  responseScreenshotPath
) {
  const response = page
    .locator(config.extraction.responseContainerSelector)
    .first();
  const responseFound = (await response.count().catch(() => 0)) > 0;
  if (!responseFound) {
    return null;
  }

  const responseVisible = await response.isVisible().catch(() => false);
  if (!responseVisible) {
    return null;
  }

  await response.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250).catch(() => {});
  await response.screenshot({ path: responseScreenshotPath, timeout: 15000 });
  return responseScreenshotPath;
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

  const convexUrl = await resolveConvexUrl();
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
        provider: result.provider,
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
        runner: browserEngineRunnerName(config.browser?.engine),
        client: config.provider === "openai" ? "chatgpt" : config.provider,
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

function collectProcessOutput(child, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin?.end(input);
  });
}

function parseWorkerJson(stdout) {
  const trimmed = String(stdout ?? "").trim();
  if (!trimmed) {
    throw new Error("Nodriver worker did not return JSON.");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start === -1) {
      throw new Error("Nodriver worker did not return a JSON object.");
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(trimmed.slice(start, index + 1));
        }
      }
    }
    throw new Error("Nodriver worker returned incomplete JSON.");
  }
}

async function invokeNodriverWorker(payload, config) {
  const python = resolveNodriverPython(config.browser);
  const child = spawn(python, [NODRIVER_WORKER_SCRIPT], {
    env: {
      ...process.env,
      ...(config.browser.nodriver?.executablePath
        ? {
            OPENPEEC_NODRIVER_BROWSER_PATH:
              config.browser.nodriver.executablePath,
          }
        : {}),
      OPENPEEC_NODRIVER_ARTIFACTS_DIR:
        config.browser.nodriver?.artifactsDir ??
        path.resolve(__dirname, "artifacts"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timeoutMs = Math.max(
    30_000,
    Math.floor(
      (config.navigation.timeoutMs ?? 30_000) +
        (config.timing.responseTimeoutMs ?? 300_000) +
        15_000
    )
  );
  const result = await collectProcessOutput(
    child,
    JSON.stringify(payload),
    timeoutMs
  );

  try {
    return {
      worker: parseWorkerJson(result.stdout),
      stderr: result.stderr.trim(),
      code: result.code,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nodriver worker parse failed.";
    throw new Error(
      `${message}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}`
    );
  }
}

async function runNodriverMonitor(normalizedConfig, options, initialWarnings) {
  const startedAt = Date.now();
  const deepLinkUrl = buildDeepLinkUrl(normalizedConfig);
  if (!deepLinkUrl) {
    throw new Error("Missing navigation.url (or deepLink.url)");
  }
  ensureWebDeepLink(deepLinkUrl);

  const artifactsDir = path.resolve(__dirname, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const monitorSlug = sanitizeForFilename(normalizedConfig.runLabel);
  const runDir = path.join(artifactsDir, `${monitorSlug}-${startedAt}`);
  await fs.mkdir(runDir, { recursive: true });

  const warnings = [
    ...initialWarnings,
    "Nodriver is enabled as an experimental local-only runner engine.",
  ];
  const persistentProfileDir = normalizedConfig.browser.userDataDir
    ? resolvePathIfRelative(normalizedConfig.browser.userDataDir)
    : null;
  if (normalizedConfig.authProfile || normalizedConfig.sessionJson) {
    warnings.push(
      "Nodriver spike does not apply provider auth material; use it only with local fixture configs."
    );
  }

  let workerPayload = null;
  try {
    const result = await invokeNodriverWorker(
      {
        config: normalizedConfig,
        deeplinkUrl: deepLinkUrl,
        runDir,
        headed: Boolean(options.headed),
      },
      normalizedConfig
    );
    workerPayload = result.worker;
    if (result.stderr && workerPayload.status !== "success") {
      warnings.push(`Nodriver stderr: ${summarizeText(result.stderr, 300)}`);
    }
  } catch (error) {
    workerPayload = {
      status: "failed",
      summary: error instanceof Error ? error.message : "Nodriver failed.",
      fallbackUsed: true,
      warnings: ["Nodriver worker failed before completing the run."],
      citations: [],
      artifacts: {
        runDir,
        result: path.join(runDir, "result.json"),
      },
    };
  }

  warnings.push(...(workerPayload.warnings ?? []));
  const extracted = normalizeExtractedPayload({
    pageTitle: workerPayload.pageTitle,
    finalUrl: workerPayload.finalUrl ?? deepLinkUrl,
    responseContainerFound: Boolean(workerPayload.responseText),
    responseText: workerPayload.responseText ?? "",
    responseHtml: workerPayload.responseHtml ?? "",
    citations: workerPayload.citations ?? [],
  });

  let status = workerPayload.status ?? "failed";
  let summary = workerPayload.summary ?? "Nodriver run completed.";
  let fallbackUsed = Boolean(workerPayload.fallbackUsed);
  let responseText = extracted.responseText;
  let responseSummary = status === "success" ? "" : summary;
  let citations = extracted.citations;
  let sourceArtifacts = extracted.sourceArtifacts;
  let sourceCount = undefined;
  let visibilityScore = undefined;
  let citationQualityScore = undefined;
  let averageCitationPosition = undefined;

  const blockerReason = getAccessBlockerReason(
    workerPayload.pageTitle,
    workerPayload.bodyText || workerPayload.responseText,
    {
      html: workerPayload.pageHtml,
      url: workerPayload.finalUrl,
    }
  );
  if (blockerReason) {
    status = "blocked";
    fallbackUsed = true;
    summary = blockerReason;
    responseText = "";
    responseSummary = summary;
    citations = [];
    sourceArtifacts = [];
    warnings.push(
      "Access blocker detected by nodriver; metrics are not treated as a valid monitoring run."
    );
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
      "Nodriver prompt flow completed but no response/citations were extracted.";
    responseSummary = summary;
  }

  if (status === "success") {
    const metrics = computeAnalytics({ responseText, citations });
    responseSummary = metrics.responseSummary;
    sourceCount = metrics.sourceCount;
    visibilityScore = metrics.visibilityScore;
    citationQualityScore = metrics.citationQualityScore;
    averageCitationPosition = metrics.averageCitationPosition;
  }

  const artifacts = {
    runDir,
    screenshot: workerPayload.artifacts?.screenshot ?? null,
    responseScreenshot: workerPayload.artifacts?.responseScreenshot ?? null,
    trace: workerPayload.artifacts?.trace ?? null,
    video: workerPayload.artifacts?.video ?? null,
    pageHtml: workerPayload.artifacts?.pageHtml ?? null,
    responseHtml: workerPayload.artifacts?.responseHtml ?? null,
    sources: workerPayload.artifacts?.sources ?? null,
    network: workerPayload.artifacts?.network ?? null,
    console: workerPayload.artifacts?.console ?? null,
    result: workerPayload.artifacts?.result ?? path.join(runDir, "result.json"),
  };
  const output = {
    title: extracted.pageTitle || workerPayload.pageTitle || "",
    finalUrl: extracted.finalUrl || workerPayload.finalUrl || deepLinkUrl,
    screenshot: artifacts.screenshot,
    browser: {
      engine: NODRIVER_ENGINE,
      channel: normalizedConfig.browser.channel,
      userAgent: null,
      persistentProfileDir,
      storageStatePath: normalizedConfig.browser.storageStatePath,
    },
    responseContainerSelector:
      normalizedConfig.extraction.responseContainerSelector,
    citationsExtracted: citations.length,
    sourcesRecorded: sourceArtifacts.length,
    artifacts,
  };
  const finishedAt = Date.now();
  const result = {
    schemaVersion: 2,
    monitorId: normalizedConfig.monitorId,
    promptId: normalizedConfig.promptId,
    runLabel: normalizedConfig.runLabel,
    provider: normalizedConfig.provider,
    platform: normalizedConfig.platform,
    status,
    startedAt,
    finishedAt,
    latencyMs: finishedAt - startedAt,
    summary,
    deeplinkUsed: deepLinkUrl,
    evidencePath: artifacts.screenshot,
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

  await writeJson(artifacts.sources, sourceArtifacts).catch(() => {});
  await writeJson(artifacts.result, result).catch(() => {});

  const ingest = await ingestRunIfRequested(
    normalizedConfig,
    result,
    options.ingest
  );
  return { ...result, ingest };
}

export async function runMonitor(config, options = {}) {
  const normalizedConfig = normalizeRunnerConfig(config);
  const warnings = [];
  if (normalizedConfig.provider !== "openai") {
    const finishedAt = Date.now();
    const reason = `Provider runner is not implemented for ${normalizedConfig.provider}; OpenAI is the only active v0 provider.`;
    const result = {
      schemaVersion: 2,
      monitorId: normalizedConfig.monitorId,
      promptId: normalizedConfig.promptId,
      runLabel: normalizedConfig.runLabel,
      provider: normalizedConfig.provider,
      platform: normalizedConfig.platform,
      status: "blocked",
      startedAt: finishedAt,
      finishedAt,
      latencyMs: 0,
      summary: reason,
      deeplinkUsed: buildDeepLinkUrl(normalizedConfig),
      evidencePath: null,
      fallbackUsed: true,
      warnings: [reason],
      responseText: "",
      responseSummary: reason,
      sourceCount: undefined,
      citations: [],
      visibilityScore: undefined,
      citationQualityScore: undefined,
      averageCitationPosition: undefined,
      output: {
        provider: normalizedConfig.provider,
      },
    };
    const ingest = await ingestRunIfRequested(
      normalizedConfig,
      result,
      options.ingest
    );
    return { ...result, ingest };
  }
  const preflight = await getRunnerPreflight(normalizedConfig);
  if (!preflight.ok) {
    const finishedAt = Date.now();
    const result = {
      schemaVersion: 2,
      monitorId: normalizedConfig.monitorId,
      promptId: normalizedConfig.promptId,
      runLabel: normalizedConfig.runLabel,
      provider: normalizedConfig.provider,
      platform: normalizedConfig.platform,
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

  if (normalizedConfig.browser.engine === NODRIVER_ENGINE) {
    return await runNodriverMonitor(normalizedConfig, options, warnings);
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

  const { material: authMaterial, warnings: sessionWarnings } =
    await loadRunnerSessionMaterial(normalizedConfig);
  warnings.push(...sessionWarnings);
  const promptReadyTimeoutMs = resolvePromptReadyTimeoutMs(normalizedConfig);
  const persistentProfileDir = normalizedConfig.browser.userDataDir
    ? resolvePathIfRelative(normalizedConfig.browser.userDataDir)
    : null;
  const externalBrowserSession = options.browserSession ?? null;
  const ownsBrowserSession = !externalBrowserSession;
  let browserSession = externalBrowserSession;
  let context;
  let page;
  let pageVideo = null;
  let responseStarted = false;
  let runDir = null;
  let tracePath = null;
  let videoPath = null;
  let pageHtmlPath = null;
  let responseHtmlPath = null;
  let sourcesPath = null;
  let networkPath = null;
  let consolePath = null;
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

  try {
    const artifactsDir = path.resolve(__dirname, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });
    const monitorSlug = sanitizeForFilename(normalizedConfig.runLabel);
    runDir = path.join(artifactsDir, `${monitorSlug}-${startedAt}`);
    await fs.mkdir(runDir, { recursive: true });

    if (!browserSession) {
      const contextOptions = {};
      if (normalizedConfig.browser.engine === CAMOUFOX_ENGINE) {
        warnings.push(
          "Camoufox uses screenshots, traces, DOM, network, and console artifacts; Playwright video recording is disabled because Firefox remote server does not support it."
        );
      } else {
        contextOptions.recordVideo = {
          dir: runDir,
          size: { width: 1440, height: 900 },
        };
      }
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

      browserSession = await launchRunnerBrowserContext({
        browserOptions: normalizedConfig.browser,
        contextOptions,
        persistentProfileDir,
        headed: options.headed,
      });
    }
    context = browserSession.context;
    warnings.push(...browserSession.warnings);
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    await applyAuthMaterialToContext(context, authMaterial);

    page = await context.newPage();
    if (!browserSession.shared) {
      for (const existingPage of context.pages()) {
        if (existingPage === page) {
          continue;
        }
        await existingPage.close().catch(() => {});
      }
    }
    await runDomainHopSequence(page, normalizedConfig.navigation.domainHops, {
      waitUntil: normalizedConfig.navigation.hopWaitUntil ?? "load",
      gotoTimeoutMs: normalizedConfig.timing.warmupGotoTimeoutMs ?? 30000,
      postHopSettleMinMs: normalizedConfig.timing.postHopSettleMinMs ?? 2500,
      hopNetworkIdleMaxMs: normalizedConfig.timing.hopNetworkIdleMaxMs ?? 0,
    });
    pageVideo = page.video();
    const browserUserAgent = await page.evaluate(() => navigator.userAgent);
    const screenshotPath = path.join(runDir, "page.png");
    const responseScreenshotPath = path.join(runDir, "response.png");
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
        isNavigationRequest: request.isNavigationRequest(),
        contentType: response.headers()["content-type"] ?? null,
      });
    });

    const timeoutMs = normalizedConfig.navigation.timeoutMs;
    const waitUntil = normalizedConfig.navigation.waitUntil;
    console.log(`[openpeec-runner] navigating to provider: ${deepLinkUrl}`);
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
              await page.keyboard.press(normalizedConfig.prompt.submitKey);
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
              await page.keyboard.press(normalizedConfig.prompt.submitKey);
            }
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
      responseStarted = responseStart.ok;
      noteLoggedOutUpsellDismissal(responseStart.dismissedLoggedOutUpsell);
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

    if (promptSubmitted && responseStarted) {
      const stableResponse = await waitForStableAssistantResponse(
        page,
        normalizedConfig
      );
      noteLoggedOutUpsellDismissal(stableResponse.dismissedLoggedOutUpsell);
      if (!stableResponse.ok) {
        warnings.push(stableResponse.reason);
      }
    }

    const finalLoggedOutDismissal = await dismissChatGptLoggedOutUpsell(page);
    noteLoggedOutUpsellDismissal(finalLoggedOutDismissal.dismissed);

    await page.waitForTimeout(normalizedConfig.timing.settleDelayMs);

    const extracted = await extractResponseAndCitations(page, normalizedConfig);
    responseText = extracted.responseText;
    citations = extracted.citations;
    sourceArtifacts = extracted.sourceArtifacts ?? [];
    output = {
      title: extracted.pageTitle,
      finalUrl: extracted.finalUrl,
      browser: {
        engine: normalizedConfig.browser.engine,
        channel: normalizedConfig.browser.channel,
        userAgent: browserUserAgent,
        persistentProfileDir,
        storageStatePath: normalizedConfig.browser.storageStatePath,
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

    if (
      status === "success" &&
      normalizedConfig.prompt.text &&
      !promptSubmitted
    ) {
      status = "failed";
      fallbackUsed = true;
      summary = "Prompt submission failed before ChatGPT received the prompt.";
      responseSummary = summary;
    }

    if (status === "success" && isOpenAiGenerationErrorResponse(responseText)) {
      status = "failed";
      fallbackUsed = true;
      summary =
        "ChatGPT returned an error while generating the response instead of a normal answer.";
      responseSummary = summary;
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
    let responseScreenshotEvidencePath = null;
    try {
      responseScreenshotEvidencePath = await captureResponseScreenshot(
        page,
        normalizedConfig,
        responseScreenshotPath
      );
    } catch (error) {
      warnings.push(
        `Response screenshot failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    evidencePath = responseScreenshotEvidencePath ?? screenshotPath;
    output.screenshot = evidencePath;
    output.citationsExtracted = citations.length;
    output.sourcesRecorded = sourceArtifacts.length;
    output.artifacts = {
      runDir,
      screenshot: screenshotPath,
      responseScreenshot: responseScreenshotEvidencePath,
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
      await persistStorageStateIfConfigured(
        context,
        normalizedConfig,
        warnings
      );
    }
    if (browserSession && ownsBrowserSession) {
      await browserSession.close();
    }
  }

  const finishedAt = Date.now();
  const result = {
    schemaVersion: 2,
    monitorId: normalizedConfig.monitorId,
    promptId: normalizedConfig.promptId,
    runLabel: normalizedConfig.runLabel,
    provider: normalizedConfig.provider,
    platform: normalizedConfig.platform,
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
