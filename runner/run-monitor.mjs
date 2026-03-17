import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function resolvePathIfRelative(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

async function loadAuthProfileMaterial(authProfileConfig) {
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
  return String(input ?? "").replace(/\s+/g, " ").trim();
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

function detectAccessBlocker(title, responseText) {
  const haystack = `${normalizeText(title)} ${normalizeText(responseText)}`.toLowerCase();
  const patterns = [
    "just a moment",
    "security verification",
    "blocked the security verification process",
    "challenges.cloudflare.com",
    "verify you are human",
    "checking your browser",
  ];
  return patterns.some((pattern) => haystack.includes(pattern));
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

function normalizeRunnerConfig(rawConfig) {
  const deepLink = rawConfig.navigation ?? rawConfig.deepLink ?? {};
  const browser = rawConfig.browser ?? {};
  const prompt = rawConfig.prompt ?? {};
  const extraction = rawConfig.extraction ?? {};
  const selectors = rawConfig.selectors ?? {};
  const assertions = rawConfig.assertions ?? {};
  const timing = rawConfig.timing ?? {};
  const ingest = rawConfig.ingest ?? {};

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
    },
    authProfile: rawConfig.authProfile,
    navigation: {
      url: deepLink.url,
      waitUntil: deepLink.waitUntil ?? "domcontentloaded",
      timeoutMs: deepLink.timeoutMs ?? 30000,
    },
    prompt: {
      text: prompt.text ?? rawConfig.promptText ?? "",
      inputSelector:
        prompt.inputSelector ??
        selectors.promptInputSelector ??
        "#prompt-textarea, [contenteditable='true'], textarea",
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
      responseTimeoutMs: timing.responseTimeoutMs ?? 45000,
      settleDelayMs: timing.settleDelayMs ?? 1500,
    },
    ingest: {
      target: ingest.target ?? "auto",
    },
  };
}

async function writeJson(filePath, data) {
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

async function extractResponseAndCitations(page, config) {
  const payload = await page.evaluate(
    ({
      responseContainerSelector,
      responseTextSelector,
      citationLinkSelector,
      maxCitations,
    }) => {
      const fallbackContainer = document.querySelector("main") ?? document.body;
      const responseContainer =
        document.querySelector(responseContainerSelector) ?? fallbackContainer;

      const responseTextNode =
        responseContainer.matches?.(responseTextSelector)
          ? responseContainer
          : responseContainer.querySelector?.(responseTextSelector) ??
            responseContainer;

      const responseText = (responseTextNode?.innerText ?? "").trim();
      const rawLinks = Array.from(
        responseContainer.querySelectorAll(citationLinkSelector)
      ).slice(0, maxCitations);

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
          title:
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
  for (const item of payload.citations) {
    const url = normalizeText(item.url);
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
      title: summarizeText(item.title, 140),
      snippet: summarizeText(item.snippet, 220),
      type: classifySourceType(domain),
    };
    citation.qualityScore = qualityScoreForCitation(citation);
    citations.push(citation);
  }

  return {
    pageTitle: payload.pageTitle,
    finalUrl: payload.finalUrl,
    responseText: normalizeText(payload.responseText),
    responseHtml: payload.responseHtml,
    citations,
  };
}

function computeAnalytics(resultFields) {
  const uniqueDomains = new Set(resultFields.citations.map((c) => c.domain)).size;
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

async function runMonitor(config, options) {
  const normalizedConfig = normalizeRunnerConfig(config);

  const startedAt = Date.now();
  let status = "success";
  let summary = "Run completed";
  let evidencePath = null;
  let output = {};
  let responseText = "";
  let citations = [];
  let responseSummary = "";
  let sourceCount = 0;
  let visibilityScore = 0;
  let citationQualityScore = 0;
  let averageCitationPosition = null;
  let fallbackUsed = false;
  const warnings = [];
  const networkEvents = [];
  const consoleEvents = [];

  const deepLinkUrl = normalizedConfig.navigation.url;
  if (!deepLinkUrl) {
    throw new Error("Missing navigation.url (or deepLink.url)");
  }
  ensureWebDeepLink(deepLinkUrl);

  const authMaterial = await loadAuthProfileMaterial(normalizedConfig.authProfile);
  const browser = await chromium.launch({
    channel: normalizedConfig.browser.channel ?? undefined,
    headless: options.headed ? false : normalizedConfig.browser.headless,
  });
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
    if (authMaterial.storageStatePath) {
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

    context = await browser.newContext(contextOptions);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    if (authMaterial.cookies && Array.isArray(authMaterial.cookies)) {
      await context.addCookies(authMaterial.cookies);
    }
    if (authMaterial.headers && typeof authMaterial.headers === "object") {
      await context.setExtraHTTPHeaders(authMaterial.headers);
    }

    page = await context.newPage();
    pageVideo = page.video();
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

    let promptSubmitted = false;
    if (normalizedConfig.prompt.text) {
      try {
        const input = page.locator(normalizedConfig.prompt.inputSelector).first();
        await input.waitFor({
          state: "visible",
          timeout: normalizedConfig.timing.responseTimeoutMs,
        });
        await input.click({ timeout: normalizedConfig.timing.responseTimeoutMs });

        if (normalizedConfig.prompt.clearExisting) {
          await page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A"
          );
          await page.keyboard.press("Backspace");
        }
        await page.keyboard.type(normalizedConfig.prompt.text);

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
    } else {
      warnings.push("No prompt text configured; running extraction-only mode.");
    }

    if (promptSubmitted) {
      try {
        await page.waitForSelector(
          normalizedConfig.extraction.responseContainerSelector,
          { timeout: normalizedConfig.timing.responseTimeoutMs }
        );
      } catch (error) {
        warnings.push(
          `Response container not found after submit: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }

    await page.waitForTimeout(normalizedConfig.timing.settleDelayMs);

    const extracted = await extractResponseAndCitations(page, normalizedConfig);
    responseText = extracted.responseText;
    citations = extracted.citations;
    await writeText(pageHtmlPath, await page.content());
    await writeText(responseHtmlPath, extracted.responseHtml ?? "");
    await writeJson(sourcesPath, citations);
    output = {
      title: extracted.pageTitle,
      finalUrl: extracted.finalUrl,
      responseContainerSelector: normalizedConfig.extraction.responseContainerSelector,
    };

    if (detectAccessBlocker(extracted.pageTitle, extracted.responseText)) {
      status = "failed";
      fallbackUsed = true;
      summary = "ChatGPT access was blocked before the prompt could run.";
      warnings.push("Access blocker detected on chatgpt.com; metrics are not treated as a valid monitoring run.");
    }

    if (
      normalizedConfig.assertions.titleIncludes &&
      !String(output.title ?? "").includes(normalizedConfig.assertions.titleIncludes)
    ) {
      throw new Error(
        `Title assertion failed: expected to include "${normalizedConfig.assertions.titleIncludes}", got "${output.title ?? ""}"`
      );
    }

    if (
      normalizedConfig.assertions.urlIncludes &&
      !String(output.finalUrl ?? "").includes(normalizedConfig.assertions.urlIncludes)
    ) {
      throw new Error(
        `URL assertion failed: expected to include "${normalizedConfig.assertions.urlIncludes}", got "${output.finalUrl ?? ""}"`
      );
    }

    if (normalizedConfig.prompt.text && !responseText) {
      warnings.push("No response text extracted from assistant output.");
    }

    const metrics = computeAnalytics({ responseText, citations });
    responseSummary = metrics.responseSummary;
    sourceCount = metrics.sourceCount;
    visibilityScore = metrics.visibilityScore;
    citationQualityScore = metrics.citationQualityScore;
    averageCitationPosition = metrics.averageCitationPosition;

    if (status === "success" && normalizedConfig.prompt.text && !responseText && citations.length === 0) {
      status = "failed";
      fallbackUsed = true;
      summary = "Prompt flow completed but no response/citations were extracted.";
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    evidencePath = screenshotPath;
    output.screenshot = screenshotPath;
    output.citationsExtracted = citations.length;
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
    await browser.close();
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

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Runner failed: ${message}`);
  process.exit(1);
});
