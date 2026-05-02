import {
  getCamoufoxPreflight,
  launchCamoufoxBrowserContext,
  resolveCamoufoxPython,
} from "./engines/camoufox.mjs";
import {
  getNodriverPreflight,
  resolveNodriverPython,
} from "./engines/nodriver.mjs";
import {
  getPlaywrightPreflight,
  launchPlaywrightBrowserContext,
} from "./engines/playwright.mjs";

export const DEFAULT_BROWSER_ENGINE = "playwright";
export const CAMOUFOX_ENGINE = "camoufox";
export const NODRIVER_ENGINE = "nodriver";
export const PLAYWRIGHT_ENGINE = "playwright";

export function normalizeBrowserEngine(value) {
  const normalized = String(value ?? DEFAULT_BROWSER_ENGINE)
    .trim()
    .toLowerCase();
  if (["camoufox", "firefox-stealth", "stealth-firefox"].includes(normalized)) {
    return CAMOUFOX_ENGINE;
  }
  if (["nodriver", "cdp", "undetected-chromedriver"].includes(normalized)) {
    return NODRIVER_ENGINE;
  }
  if (["playwright", "chromium", "chrome"].includes(normalized)) {
    return PLAYWRIGHT_ENGINE;
  }
  return DEFAULT_BROWSER_ENGINE;
}

export function browserEngineRunnerName(engine, suffix = "") {
  const normalized = normalizeBrowserEngine(engine);
  const base =
    normalized === CAMOUFOX_ENGINE
      ? "local-camoufox"
      : normalized === NODRIVER_ENGINE
        ? "local-nodriver"
        : "local-playwright";
  return suffix ? `${base}-${suffix}` : base;
}

export { resolveCamoufoxPython, resolveNodriverPython };

export async function getBrowserEnginePreflight(browserOptions = {}) {
  const engine = normalizeBrowserEngine(browserOptions.engine);
  if (engine === NODRIVER_ENGINE) {
    return await getNodriverPreflight(browserOptions);
  }

  if (engine !== CAMOUFOX_ENGINE) {
    return getPlaywrightPreflight(browserOptions);
  }

  return await getCamoufoxPreflight(browserOptions);
}

export async function launchRunnerBrowserContext({
  browserOptions,
  contextOptions,
  persistentProfileDir,
  headed,
}) {
  const engine = normalizeBrowserEngine(browserOptions.engine);
  const warnings = [];

  if (engine === CAMOUFOX_ENGINE) {
    const session = await launchCamoufoxBrowserContext({
      browserOptions,
      contextOptions,
      persistentProfileDir,
      headed,
    });
    return {
      engine,
      ...session,
      warnings: [...warnings, ...session.warnings],
    };
  }

  const session = await launchPlaywrightBrowserContext({
    browserOptions,
    contextOptions,
    persistentProfileDir,
    headed,
  });
  return {
    engine,
    ...session,
    warnings: [...warnings, ...session.warnings],
  };
}
