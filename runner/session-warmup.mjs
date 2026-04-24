export const DEFAULT_SESSION_WARMUP_URLS = [
  "https://www.wikipedia.org/",
  "https://www.google.com/",
  "https://github.com/",
  "https://peec.ai/",
];

export async function warmUpSession(page, options = {}) {
  const urls = options.urls ?? DEFAULT_SESSION_WARMUP_URLS;
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const timeoutMs = options.timeoutMs ?? 8000;

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil, timeout: timeoutMs });
    } catch {
      // Warmup is best-effort: never block provider navigation on a transient
      // warmup failure.
    }
  }
}

