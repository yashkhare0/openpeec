import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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
  OPENAI_PROVIDER,
  getProviderAdapter,
  providerDefaultsFor,
} from "./providers/index.mjs";
export {
  classifyChatGptPageState,
  detectAccessBlocker,
  dismissChatGptLoggedOutUpsell,
  getAccessBlockerReason,
  isOpenAiGenerationErrorResponse,
  snapshotPageGateState,
} from "./providers/index.mjs";
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

function resolveNavigationStrategy(rawConfig) {
  const explicit =
    rawConfig.navigation?.navigationStrategy ??
    rawConfig.deepLink?.navigationStrategy;
  if (explicit === "organic") {
    return "organic";
  }
  return "deeplink";
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
    if (
      parsed.hostname.replace(/^www\./i, "").toLowerCase() === "google.com" &&
      parsed.pathname === "/url"
    ) {
      const target =
        parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      if (target && /^https?:\/\//i.test(target)) {
        return canonicalizeCitationUrl(target);
      }
    }
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
  const provider = rawConfig.provider ?? OPENAI_PROVIDER;
  const providerDefaults = providerDefaultsFor(provider);
  const mergedNav = {
    ...(providerDefaults.navigation ?? {}),
    ...mergeNavigationLayer(rawConfig),
  };
  const browser = rawConfig.browser ?? {};
  const prompt = {
    ...(providerDefaults.prompt ?? {}),
    ...(rawConfig.prompt ?? {}),
  };
  const extraction = {
    ...(providerDefaults.extraction ?? {}),
    ...(rawConfig.extraction ?? {}),
  };
  const selectors = rawConfig.selectors ?? {};
  const assertions = {
    ...(providerDefaults.assertions ?? {}),
    ...(rawConfig.assertions ?? {}),
  };
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
  const sessionMode = resolveSessionMode({
    ...rawConfig,
    sessionMode:
      rawConfig.sessionMode ??
      rawConfig.session?.mode ??
      providerDefaults.sessionMode,
  });
  const submitStrategy = resolveSubmitStrategy({
    ...rawConfig,
    navigation: mergedNav,
    prompt,
  });
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
          ? (mergedNav.promptQueryParam ??
            (provider === OPENAI_PROVIDER ? "q" : null))
          : null,
      submitStrategy,
      navigationStrategy: resolveNavigationStrategy(rawConfig),
      organic: mergedNav.organic ?? null,
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

/**
 * If the page is on Google's /sorry/index reCAPTCHA interstitial, click the
 * "I'm not a robot" checkbox to trigger the Buster Camoufox addon (which
 * solves audio reCAPTCHA v2 challenges automatically), then wait for the
 * page to navigate back to a real search/result URL. Returns
 * { handled, solved, reason } so the caller can continue or fail clearly.
 *
 * The Buster addon is loaded via runner/addons/buster (see
 * browser.camoufox.addons in the monitor config). It listens for clicks on
 * the reCAPTCHA checkbox and then handles the audio challenge transparently.
 *
 * @param {import("playwright").Page} page
 * @param {{ timeoutMs?: number }} [options]
 */
async function solveGoogleSorryCaptcha(page, options = {}) {
  const url = page.url();
  if (!/\/sorry\//i.test(url)) {
    return { handled: false, solved: false, reason: "not on /sorry/" };
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
      reason: "no reCAPTCHA anchor iframe found on /sorry page",
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
  // Wait for the page to navigate AWAY from /sorry/ as the success signal.
  while (Date.now() - startedAt < totalTimeoutMs) {
    await page.waitForTimeout(1_500);
    const current = page.url();
    if (!/\/sorry\//i.test(current)) {
      return { handled: true, solved: true, reason: null, finalUrl: current };
    }
  }

  return {
    handled: true,
    solved: false,
    reason: `Buster did not resolve reCAPTCHA within ${totalTimeoutMs}ms`,
  };
}

/**
 * Drive an organic search-engine flow: navigate to the base URL, type the
 * prompt into the search box with realistic per-keystroke delay, press Enter
 * to load the SERP, then optionally click an "AI tab" (e.g. Google AI Mode)
 * to land on the response surface.
 *
 * @param {import("playwright").Page} page
 * @param {ReturnType<typeof normalizeRunnerConfig>} config
 * @returns {Promise<{aiTabClicked: boolean, finalUrl: string, captchaSolved: boolean}>}
 */
async function runOrganicNavigation(page, config) {
  const organic = config.navigation.organic ?? {};
  const searchInputSelector =
    organic.searchInputSelector ?? "textarea[name='q'], input[name='q']";
  const aiTabSelector = organic.aiTabSelector ?? null;
  const typeDelayMs = clamp(Math.floor(organic.typeDelayMs ?? 90), 0, 500);
  const postTypeSettleMs = clamp(
    Math.floor(organic.postTypeSettleMs ?? 400),
    0,
    5000
  );
  const postClickSettleMs = clamp(
    Math.floor(organic.postClickSettleMs ?? 2000),
    0,
    20000
  );
  const captchaTimeoutMs = clamp(
    Math.floor(organic.captchaTimeoutMs ?? 90_000),
    10_000,
    300_000
  );
  const baseUrl = config.navigation.url;
  const promptText = config.prompt.text;
  if (!baseUrl) {
    throw new Error("navigation.url is required for organic navigation.");
  }
  if (!promptText) {
    throw new Error("prompt.text is required for organic navigation.");
  }

  await page.goto(baseUrl, {
    waitUntil: config.navigation.waitUntil,
    timeout: config.navigation.timeoutMs,
  });
  await dismissCookieBanner(page);

  let captchaSolved = false;
  if (/\/sorry\//i.test(page.url())) {
    console.log(
      `[openpeec-runner] organic: hit Google /sorry/ on first nav; handing to Buster…`
    );
    const result = await solveGoogleSorryCaptcha(page, {
      timeoutMs: captchaTimeoutMs,
    });
    if (!result.solved) {
      throw new Error(
        `Google /sorry/ CAPTCHA not solved before search: ${result.reason}`
      );
    }
    captchaSolved = true;
    await dismissCookieBanner(page);
  }

  const input = page.locator(searchInputSelector).first();
  await input.waitFor({
    state: "visible",
    timeout: config.navigation.timeoutMs,
  });
  await input.click({ timeout: config.navigation.timeoutMs });
  await input.type(promptText, { delay: typeDelayMs });
  await page.waitForTimeout(postTypeSettleMs);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("domcontentloaded", {
    timeout: config.navigation.timeoutMs,
  });

  if (/\/sorry\//i.test(page.url())) {
    console.log(
      `[openpeec-runner] organic: hit Google /sorry/ after search; handing to Buster…`
    );
    const result = await solveGoogleSorryCaptcha(page, {
      timeoutMs: captchaTimeoutMs,
    });
    if (!result.solved) {
      throw new Error(
        `Google /sorry/ CAPTCHA not solved after search: ${result.reason}`
      );
    }
    captchaSolved = true;
    await page
      .waitForLoadState("domcontentloaded", {
        timeout: config.navigation.timeoutMs,
      })
      .catch(() => {});
    await page.waitForTimeout(1_500);
  }

  let aiTabClicked = false;
  if (aiTabSelector) {
    const tab = page.locator(aiTabSelector).first();
    try {
      await tab.waitFor({
        state: "visible",
        timeout: config.navigation.timeoutMs,
      });
      await tab.click({ timeout: config.navigation.timeoutMs });
      aiTabClicked = true;
      await page.waitForLoadState("domcontentloaded", {
        timeout: config.navigation.timeoutMs,
      });
    } catch (error) {
      throw new Error(
        `Organic AI tab click failed for "${aiTabSelector}": ${
          error instanceof Error ? error.message.split("\n")[0] : "unknown error"
        }`
      );
    }
  }

  if (postClickSettleMs > 0) {
    await page.waitForTimeout(postClickSettleMs);
  }

  return { aiTabClicked, finalUrl: page.url(), captchaSolved };
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

export async function extractResponseAndCitations(
  page,
  config,
  options = {}
) {
  const auxiliaryContainerSelectors = Array.isArray(
    options.auxiliaryContainerSelectors
  )
    ? options.auxiliaryContainerSelectors.filter(
        (s) => typeof s === "string" && s.length > 0
      )
    : [];

  const payload = await page.evaluate(
    ({
      responseContainerSelector,
      responseTextSelector,
      citationLinkSelector,
      maxCitations,
      auxiliaryContainerSelectors,
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

      const primaryLinks = responseContainerFound
        ? Array.from(
            responseContainer.querySelectorAll(citationLinkSelector)
          )
        : [];

      // Auxiliary containers are looked up at body scope (e.g. portal-rendered
      // sheets opened by a provider hook). Each container contributes its own
      // citation links; the loop dedupes by anchor identity to avoid double-
      // counting nested matches.
      const seenAnchors = new Set();
      const allLinks = [];
      for (const anchor of primaryLinks) {
        if (seenAnchors.has(anchor)) continue;
        seenAnchors.add(anchor);
        allLinks.push(anchor);
      }
      for (const sel of auxiliaryContainerSelectors ?? []) {
        let containers;
        try {
          containers = Array.from(document.querySelectorAll(sel));
        } catch {
          continue;
        }
        for (const container of containers) {
          if (!container) continue;
          const auxAnchors = Array.from(
            container.querySelectorAll(citationLinkSelector)
          );
          for (const anchor of auxAnchors) {
            if (seenAnchors.has(anchor)) continue;
            seenAnchors.add(anchor);
            allLinks.push(anchor);
          }
        }
      }

      const rawLinks = allLinks.slice(0, maxCitations);

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
      auxiliaryContainerSelectors,
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

  const providerAdapter = getProviderAdapter(normalizedConfig.provider);
  const blockerReason = providerAdapter?.getAccessBlockerReason?.(
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
  const providerAdapter = getProviderAdapter(normalizedConfig.provider);
  const warnings = [];
  if (!providerAdapter?.runnable) {
    const finishedAt = Date.now();
    const reason = `Provider runner is not implemented for ${normalizedConfig.provider}.`;
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
  let runDir = null;
  let tracePath = null;
  let videoPath = null;
  let pageHtmlPath = null;
  let responseHtmlPath = null;
  let sourcesPath = null;
  let networkPath = null;
  let consolePath = null;

  const extractForProvider = async (targetPage, targetConfig) => {
    if (providerAdapter.extractRawResponse) {
      const rawPayload = await providerAdapter.extractRawResponse(
        targetPage,
        targetConfig
      );
      return normalizeExtractedPayload(rawPayload);
    }
    let auxiliaryContainerSelectors = [];
    if (typeof providerAdapter.prepareForExtraction === "function") {
      try {
        const prep = await providerAdapter.prepareForExtraction(
          targetPage,
          targetConfig
        );
        if (prep && Array.isArray(prep.auxiliaryContainerSelectors)) {
          auxiliaryContainerSelectors = prep.auxiliaryContainerSelectors;
        }
      } catch (error) {
        warnings.push(
          `prepareForExtraction failed for ${providerAdapter.slug}: ${
            error instanceof Error ? error.message.split("\n")[0] : "unknown"
          }`
        );
      }
    }
    return await extractResponseAndCitations(targetPage, targetConfig, {
      auxiliaryContainerSelectors,
    });
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
    const isOpenAiOrganic =
      normalizedConfig.provider === OPENAI_PROVIDER &&
      normalizedConfig.navigation.navigationStrategy === "organic";

    let flow;

    if (isOpenAiOrganic) {
      console.log(
        `[openpeec-runner] organic navigation: ${normalizedConfig.navigation.url}`
      );
      try {
        const organicResult = await runOrganicNavigation(
          page,
          normalizedConfig
        );
        if (organicResult.captchaSolved) {
          warnings.push(
            "Solved Google /sorry/ reCAPTCHA via Buster before continuing."
          );
        }
        if (organicResult.aiTabClicked) {
          warnings.push(
            `Organic navigation reached AI tab at ${organicResult.finalUrl}.`
          );
        }
      } catch (error) {
        fallbackUsed = true;
        status = "failed";
        summary =
          error instanceof Error ? error.message : "Organic navigation failed.";
        responseSummary = summary;
        warnings.push(summary);
      }

      if (
        status === "success" &&
        normalizedConfig.assertions.waitForSelector
      ) {
        await page
          .waitForSelector(normalizedConfig.assertions.waitForSelector, {
            timeout: timeoutMs,
          })
          .catch(() => {});
      }

      if (status === "success") {
        flow = await providerAdapter.runPromptFlow({
          page,
          config: normalizedConfig,
          networkEvents,
          warnings,
          promptReadyTimeoutMs,
          extractResponse: extractForProvider,
          organicAlreadySubmitted: true,
        });
      } else {
        flow = {
          status,
          summary,
          fallbackUsed,
          promptSubmitted: false,
          responseStarted: false,
        };
      }
    } else {
      console.log(`[openpeec-runner] navigating to provider: ${deepLinkUrl}`);
      await page.goto(deepLinkUrl, { waitUntil, timeout: timeoutMs });

      if (normalizedConfig.assertions.waitForSelector) {
        await page.waitForSelector(normalizedConfig.assertions.waitForSelector, {
          timeout: timeoutMs,
        });
      }

      flow = await providerAdapter.runPromptFlow({
        page,
        config: normalizedConfig,
        networkEvents,
        warnings,
        promptReadyTimeoutMs,
        extractResponse: extractForProvider,
      });
    }

    status = flow.status ?? status;
    summary = flow.summary ?? summary;
    fallbackUsed = Boolean(flow.fallbackUsed);
    if (status !== "success") {
      responseText = "";
      responseSummary = summary;
    }

    const promptSubmitted = Boolean(flow.promptSubmitted);

    await page.waitForTimeout(normalizedConfig.timing.settleDelayMs);

    const extracted = await extractForProvider(page, normalizedConfig);
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

    const blockerReason = providerAdapter.getAccessBlockerReason?.(
      extracted.pageTitle,
      extracted.responseText,
      {
        html: extracted.responseHtml,
        url: extracted.finalUrl,
      }
    );
    if (status === "success" && blockerReason) {
      status = "blocked";
      fallbackUsed = true;
      summary = blockerReason;
      responseText = "";
      responseSummary = summary;
      warnings.push(providerAdapter.accessBlockerWarning);
      citations = [];
      sourceArtifacts = [];
    }

    if (status !== "success") {
      responseText = "";
      citations = [];
      sourceArtifacts = [];
      responseSummary ||= summary;
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
      warnings.push(providerAdapter.noResponseWarning);
    }

    if (
      status === "success" &&
      normalizedConfig.prompt.text &&
      providerAdapter.requiresPromptSubmission &&
      !promptSubmitted
    ) {
      status = "failed";
      fallbackUsed = true;
      summary =
        "Prompt submission failed before the provider received the prompt.";
      responseSummary = summary;
    }

    if (
      status === "success" &&
      providerAdapter.isGenerationErrorResponse?.(responseText)
    ) {
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
      providerAdapter.slug === OPENAI_PROVIDER &&
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
      summary = providerAdapter.noOutputSummary;
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
