import { chromium } from "playwright";

export function getPlaywrightPreflight() {
  return { ok: true, status: "success" };
}

export async function launchPlaywrightBrowserContext({
  browserOptions,
  contextOptions,
  persistentProfileDir,
  headed,
}) {
  if (persistentProfileDir) {
    const context = await chromium.launchPersistentContext(
      persistentProfileDir,
      {
        ...contextOptions,
        channel: browserOptions.channel ?? undefined,
        headless: headed ? false : browserOptions.headless,
      }
    );
    return {
      browser: null,
      context,
      warnings: [],
      async close() {
        await context.close().catch(() => {});
      },
    };
  }

  const browser = await chromium.launch({
    channel: browserOptions.channel ?? undefined,
    headless: headed ? false : browserOptions.headless,
  });
  const context = await browser.newContext(contextOptions);
  return {
    browser,
    context,
    warnings: [],
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
