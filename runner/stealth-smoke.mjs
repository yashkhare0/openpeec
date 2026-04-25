import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { detectAntiBotBlock } from "./anti-bot-detector.mjs";
import {
  CAMOUFOX_ENGINE,
  getBrowserEnginePreflight,
  launchRunnerBrowserContext,
  normalizeBrowserEngine,
} from "./browser-engine.mjs";
import { writeJson } from "./run-monitor.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DETECTOR_URLS = [
  "https://bot.sannysoft.com/",
  "https://browserleaks.com/javascript",
];

function parseArgs(argv) {
  const args = {
    engine: process.env.OPENPEEC_BROWSER_ENGINE ?? CAMOUFOX_ENGINE,
    headed: false,
    output: undefined,
    urls: [],
    detectors: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--engine") {
      args.engine = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--headed") {
      args.headed = true;
      continue;
    }
    if (token === "--output") {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--url") {
      args.urls.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--detectors") {
      args.detectors = true;
    }
  }

  return args;
}

function sanitizeForFilename(input) {
  return String(input ?? "page").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function collectLocalFingerprint(page) {
  await page.goto(
    "data:text/html,<html><head><title>OpenPeec stealth smoke</title></head><body>probe</body></html>"
  );

  return await page.evaluate(async () => {
    const webgl = (() => {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        return null;
      }
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        renderer: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    })();

    const permissionState = await navigator.permissions
      ?.query({ name: "notifications" })
      .then((result) => result.state)
      .catch(() => null);

    return {
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      languages: navigator.languages,
      vendor: navigator.vendor,
      pluginsLength: navigator.plugins?.length ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory ?? null,
      maxTouchPoints: navigator.maxTouchPoints,
      cookieEnabled: navigator.cookieEnabled,
      notificationPermissionState: permissionState,
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
      viewport: {
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        devicePixelRatio,
      },
      webgl,
      playwrightGlobals: {
        binding: "__playwright__binding__" in window,
        initScripts: "__pwInitScripts" in window,
      },
    };
  });
}

function summarizeFingerprintLeaks(fingerprint) {
  const leaks = [];
  if (fingerprint.webdriver === true) {
    leaks.push("navigator.webdriver is true");
  }
  if (/Headless/i.test(fingerprint.userAgent ?? "")) {
    leaks.push("userAgent contains Headless");
  }
  if (fingerprint.playwrightGlobals?.binding) {
    leaks.push("window.__playwright__binding__ is present");
  }
  if (fingerprint.playwrightGlobals?.initScripts) {
    leaks.push("window.__pwInitScripts is present");
  }
  return leaks;
}

async function probeDetectorUrl(page, url, runDir) {
  const startedAt = Date.now();
  const slug = sanitizeForFilename(new URL(url).hostname);
  const screenshotPath = path.join(runDir, `${slug}.png`);

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const [title, bodyText, html] = await Promise.all([
      page.title(),
      page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => ""),
      page.content(),
    ]);
    const antiBot = detectAntiBotBlock({
      statusCode: response?.status(),
      title,
      bodyText,
      html,
      url,
    });
    return {
      url,
      status: "ok",
      statusCode: response?.status() ?? null,
      title,
      antiBot,
      screenshot: screenshotPath,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      screenshot: null,
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function runEngineSmoke(engine, options) {
  const normalizedEngine = normalizeBrowserEngine(engine);
  const startedAt = Date.now();
  const runDir = path.join(
    __dirname,
    "artifacts",
    `stealth-smoke-${normalizedEngine}-${startedAt}`
  );

  const browserOptions = {
    engine: normalizedEngine,
    headless: !options.headed,
    camoufox: {
      humanize: 0.8,
      ...(options.camoufox ?? {}),
    },
  };
  const preflight = await getBrowserEnginePreflight(browserOptions);
  if (!preflight.ok) {
    return {
      engine: normalizedEngine,
      status: "blocked",
      startedAt,
      finishedAt: Date.now(),
      runDir: null,
      preflight,
      fingerprint: null,
      leaks: [preflight.reason],
      detectors: [],
    };
  }

  await fs.mkdir(runDir, { recursive: true });
  const session = await launchRunnerBrowserContext({
    browserOptions,
    contextOptions: {},
    persistentProfileDir: null,
    headed: options.headed,
  });

  try {
    const page = await session.context.newPage();
    const fingerprint = await collectLocalFingerprint(page);
    const leaks = summarizeFingerprintLeaks(fingerprint);
    const urls = [
      ...(options.detectors ? DETECTOR_URLS : []),
      ...(options.urls ?? []),
    ];
    const detectors = [];
    for (const url of urls) {
      detectors.push(await probeDetectorUrl(page, url, runDir));
    }

    return {
      engine: normalizedEngine,
      status: leaks.length ? "attention" : "pass",
      startedAt,
      finishedAt: Date.now(),
      runDir,
      fingerprint,
      leaks,
      detectors,
    };
  } finally {
    await session.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const engines =
    String(args.engine).toLowerCase() === "all"
      ? ["playwright", CAMOUFOX_ENGINE]
      : [args.engine];
  const results = [];

  for (const engine of engines) {
    results.push(await runEngineSmoke(engine, args));
  }

  const result = {
    schemaVersion: 1,
    startedAt: results[0]?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    results,
  };
  const outputPath =
    args.output ??
    path.join(__dirname, "artifacts", `stealth-smoke-${Date.now()}.json`);
  const savedPath = await writeJson(outputPath, result);
  console.log(`Wrote stealth smoke result to ${savedPath}`);
  console.log(JSON.stringify(result, null, 2));

  if (results.some((entry) => entry.status === "blocked")) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Stealth smoke failed: ${message}`);
    process.exit(1);
  });
}
