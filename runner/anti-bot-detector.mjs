const TIER_1_PATTERNS = [
  {
    pattern: /Reference\s*#\s*[\d]+\.[0-9a-f]+\.\d+\.[0-9a-f]+/i,
    reason: "Akamai block reference",
  },
  {
    pattern: /Pardon\s+Our\s+Interruption/i,
    reason: "Akamai challenge page",
  },
  {
    pattern: /challenge-form[\s\S]*?__cf_chl_f_tk=/i,
    reason: "Cloudflare challenge form",
  },
  {
    pattern: /<span\s+class=["']cf-error-code["']>\d{4}<\/span>/i,
    reason: "Cloudflare firewall block",
  },
  {
    pattern: /\/cdn-cgi\/challenge-platform\/\S*orchestrate/i,
    reason: "Cloudflare JavaScript challenge",
  },
  {
    pattern: /window\._pxAppId\s*=/i,
    reason: "PerimeterX block page",
  },
  {
    pattern: /captcha\.px-cdn\.net/i,
    reason: "PerimeterX captcha",
  },
  {
    pattern: /captcha-delivery\.com/i,
    reason: "DataDome captcha",
  },
  {
    pattern: /_Incapsula_Resource/i,
    reason: "Imperva or Incapsula block",
  },
  {
    pattern: /Incapsula\s+incident\s+ID/i,
    reason: "Imperva or Incapsula incident",
  },
  {
    pattern: /Sucuri\s+WebSite\s+Firewall/i,
    reason: "Sucuri firewall block",
  },
  {
    pattern: /KPSDK\.scriptStart\s*=\s*KPSDK\.now\(\)/i,
    reason: "Kasada challenge",
  },
  {
    pattern: /blocked\s+by\s+network\s+security/i,
    reason: "Network security block",
  },
];

const TIER_2_PATTERNS = [
  {
    pattern: /Access\s+Denied/i,
    reason: "Access denied block page",
  },
  {
    pattern: /Checking\s+your\s+browser/i,
    reason: "Browser verification page",
  },
  {
    pattern: /<title>\s*Just\s+a\s+moment/i,
    reason: "Cloudflare interstitial",
  },
  {
    pattern: /class=["']g-recaptcha["']/i,
    reason: "reCAPTCHA challenge",
  },
  {
    pattern: /class=["']h-captcha["']/i,
    reason: "hCaptcha challenge",
  },
  {
    pattern: /Access\s+to\s+This\s+Page\s+Has\s+Been\s+Blocked/i,
    reason: "PerimeterX block page",
  },
  {
    pattern: /blocked\s+by\s+security/i,
    reason: "Security block page",
  },
  {
    pattern: /Request\s+unsuccessful/i,
    reason: "Imperva request block",
  },
];

const TEXT_BLOCK_PATTERNS = [
  {
    pattern: /verify\s+you\s+are\s+human/i,
    reason: "Human verification challenge",
  },
  {
    pattern: /checking\s+your\s+browser/i,
    reason: "Browser verification page",
  },
  {
    pattern: /blocked\s+the\s+security\s+verification\s+process/i,
    reason: "Security verification block",
  },
  {
    pattern:
      /incompatible\s+browser\s+extension\s+or\s+network\s+configuration/i,
    reason: "Security verification block",
  },
  {
    pattern: /challenges\.cloudflare\.com/i,
    reason: "Cloudflare challenge",
  },
];

const CHALLENGE_URL_PATTERNS = [
  {
    pattern: /challenges\.cloudflare\.com/i,
    reason: "Cloudflare challenge request",
  },
  {
    pattern: /\/cdn-cgi\/challenge-platform\//i,
    reason: "Cloudflare challenge request",
  },
  {
    pattern: /captcha\.px-cdn\.net/i,
    reason: "PerimeterX captcha request",
  },
  {
    pattern: /captcha-delivery\.com/i,
    reason: "DataDome captcha request",
  },
  {
    pattern: /_Incapsula_Resource/i,
    reason: "Imperva challenge request",
  },
];

const TIER_2_MAX_SIZE = 10_000;
const STRUCTURAL_MAX_SIZE = 50_000;
const EMPTY_CONTENT_THRESHOLD = 100;

const BODY_PATTERN = /<body\b/i;
const CONTENT_ELEMENT_PATTERN = /<(?:p|h[1-6]|article|section|li|td|a|pre)\b/i;
const SCRIPT_PATTERN = /<script\b/i;
const STYLE_BLOCK_PATTERN = /<style\b[\s\S]*?<\/style>/gi;
const SCRIPT_BLOCK_PATTERN = /<script\b[\s\S]*?<\/script>/gi;
const TAG_PATTERN = /<[^>]+>/g;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripScriptsAndStyles(html) {
  return String(html ?? "")
    .replace(SCRIPT_BLOCK_PATTERN, "")
    .replace(STYLE_BLOCK_PATTERN, "");
}

function looksLikeDataPayload(html) {
  const stripped = String(html ?? "").trim();
  if (!stripped) {
    return false;
  }

  if (stripped.startsWith("{") || stripped.startsWith("[")) {
    return true;
  }

  const start = stripped.slice(0, 10).toLowerCase();
  if (start.startsWith("<html") || start.startsWith("<!")) {
    return /<body[^>]*>\s*<pre[^>]*>\s*[{\[]/i.test(stripped.slice(0, 500));
  }

  return (
    stripped.startsWith("<") && !/<html|<body/i.test(stripped.slice(0, 500))
  );
}

function detectByPatterns(patterns, haystack) {
  for (const { pattern, reason } of patterns) {
    if (pattern.test(haystack)) {
      return reason;
    }
  }
  return null;
}

function detectStructuralBlock(html) {
  const htmlText = String(html ?? "");
  const htmlLength = htmlText.length;
  if (
    !htmlText ||
    htmlLength > STRUCTURAL_MAX_SIZE ||
    looksLikeDataPayload(htmlText)
  ) {
    return null;
  }

  if (!BODY_PATTERN.test(htmlText)) {
    return `Structurally incomplete page: no body tag (${htmlLength} bytes)`;
  }

  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(htmlText);
  const bodyContent = bodyMatch?.[1] ?? htmlText;
  const visibleText = stripScriptsAndStyles(bodyContent)
    .replace(TAG_PATTERN, "")
    .trim();
  const visibleLength = visibleText.length;
  const signals = [];

  if (visibleLength < 50) {
    signals.push("minimal visible text");
  }
  if (!CONTENT_ELEMENT_PATTERN.test(htmlText)) {
    signals.push("no content elements");
  }
  if (SCRIPT_PATTERN.test(htmlText) && visibleLength < 100) {
    signals.push("script-heavy empty shell");
  }

  if (signals.length >= 2) {
    return `Structurally incomplete page: ${signals.join(", ")} (${htmlLength} bytes)`;
  }

  if (signals.length === 1 && htmlLength < 5_000) {
    return `Structurally incomplete page: ${signals[0]} (${htmlLength} bytes)`;
  }

  return null;
}

export function detectAntiBotBlock({
  statusCode,
  html,
  title,
  bodyText,
  url,
} = {}) {
  const htmlText = String(html ?? "");
  const titleText = normalizeText(title);
  const body = normalizeText(bodyText);
  const htmlLength = htmlText.length;
  const textHaystack = `${titleText} ${body} ${url ?? ""}`;
  const htmlHaystack = htmlText || textHaystack;
  const status = Number.isFinite(statusCode) ? statusCode : null;

  if (status === 429) {
    return { blocked: true, reason: "HTTP 429 rate limit", confidence: "high" };
  }

  const tier1Reason =
    detectByPatterns(TIER_1_PATTERNS, htmlHaystack.slice(0, 15_000)) ??
    (htmlLength > 15_000
      ? detectByPatterns(
          TIER_1_PATTERNS,
          stripScriptsAndStyles(htmlText.slice(0, 500_000)).slice(0, 30_000)
        )
      : null);
  if (tier1Reason) {
    return { blocked: true, reason: tier1Reason, confidence: "high" };
  }

  const textReason = detectByPatterns(TEXT_BLOCK_PATTERNS, textHaystack);
  if (textReason) {
    return { blocked: true, reason: textReason, confidence: "high" };
  }

  if ((status === 403 || status === 503) && !looksLikeDataPayload(htmlText)) {
    if (htmlLength < EMPTY_CONTENT_THRESHOLD) {
      return {
        blocked: true,
        reason: `HTTP ${status} with near-empty response`,
        confidence: "high",
      };
    }

    const statusHaystack =
      htmlLength > TIER_2_MAX_SIZE
        ? stripScriptsAndStyles(htmlText.slice(0, 500_000)).slice(0, 30_000)
        : htmlHaystack.slice(0, 15_000);
    const statusReason = detectByPatterns(TIER_2_PATTERNS, statusHaystack);
    return {
      blocked: true,
      reason: statusReason
        ? `${statusReason} (HTTP ${status})`
        : `HTTP ${status} with HTML content`,
      confidence: "high",
    };
  }

  if (status && status >= 400 && htmlLength < TIER_2_MAX_SIZE) {
    const errorReason = detectByPatterns(
      TIER_2_PATTERNS,
      htmlHaystack.slice(0, 15_000)
    );
    if (errorReason) {
      return {
        blocked: true,
        reason: `${errorReason} (HTTP ${status})`,
        confidence: "medium",
      };
    }
  }

  if (status === 200 && htmlText.trim().length < EMPTY_CONTENT_THRESHOLD) {
    return {
      blocked: true,
      reason: "HTTP 200 with near-empty content",
      confidence: "medium",
    };
  }

  const structuralReason = detectStructuralBlock(htmlText);
  if (structuralReason) {
    return {
      blocked: true,
      reason: structuralReason,
      confidence: "medium",
    };
  }

  return { blocked: false, reason: null, confidence: "none" };
}

export function detectAntiBotNetworkBlock(networkEvents = []) {
  for (const event of networkEvents) {
    const url = String(event?.url ?? "");
    const challengeReason = detectByPatterns(CHALLENGE_URL_PATTERNS, url);
    if (challengeReason) {
      return {
        blocked: true,
        reason: challengeReason,
        confidence: "high",
      };
    }
  }

  const blockedDocument = networkEvents.find((event) => {
    const status = event?.status;
    return (
      (status === 403 || status === 429 || status === 503) &&
      (event?.resourceType === "document" || event?.isNavigationRequest)
    );
  });
  if (blockedDocument) {
    return {
      blocked: true,
      reason: `Navigation request returned HTTP ${blockedDocument.status}`,
      confidence: "medium",
    };
  }

  return { blocked: false, reason: null, confidence: "none" };
}
