import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

import {
  DEFAULT_CAMOUFOX_STORAGE_STATE_PATH,
  DEFAULT_OPENAI_USER_DATA_DIR,
  captureResponseScreenshot,
  classifyChatGptPageState,
  detectAccessBlocker,
  dismissChatGptLoggedOutUpsell,
  extractResponseAndCitations,
  getAccessBlockerReason,
  isOpenAiGenerationErrorResponse,
  loadRunnerSessionMaterial,
  normalizeExtractedPayload,
  normalizeRunnerConfig,
  parseSessionJsonMaterial,
  runMonitor,
} from "../runner/run-monitor.mjs";
import {
  browserEngineRunnerName,
  getBrowserEnginePreflight,
  normalizeBrowserEngine,
} from "../runner/browser-engine.mjs";
import {
  assertNodriverFixtureResult,
  NODRIVER_FIXTURE_CITATIONS,
  NODRIVER_FIXTURE_RESPONSE_TEXT,
} from "../runner/nodriver-fixture-contract.mjs";
import { extractGoogleAiModeResponse } from "../runner/providers/google-ai-mode.mjs";
import {
  detectAntiBotBlock,
  detectAntiBotNetworkBlock,
} from "../runner/anti-bot-detector.mjs";
import { DEFAULT_DOMAIN_HOPS } from "../runner/session-warmup.mjs";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  JSDOM: new (
    html: string,
    options?: { url?: string }
  ) => { window: Window & typeof globalThis };
};

describe("detectAntiBotBlock", () => {
  it("detects structural Cloudflare challenge markup", () => {
    const result = detectAntiBotBlock({
      statusCode: 403,
      html: '<html><body><form id="challenge-form"><input name="__cf_chl_f_tk=" /></form></body></html>',
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Cloudflare");
  });

  it("detects a script-heavy empty shell", () => {
    const result = detectAntiBotBlock({
      statusCode: 200,
      html: "<html><body><script>window.__challenge = true</script></body></html>",
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("near-empty content");
  });

  it("does not flag prose about access denial without challenge evidence", () => {
    const result = detectAntiBotBlock({
      title: "ChatGPT",
      bodyText: "A user might see Access Denied when a firewall blocks them.",
    });

    expect(result.blocked).toBe(false);
  });
});

describe("detectAntiBotNetworkBlock", () => {
  it("detects known challenge network requests", () => {
    const result = detectAntiBotNetworkBlock([
      {
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1",
        status: 200,
      },
    ]);

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Cloudflare");
  });
});

describe("detectAccessBlocker", () => {
  it("detects the incompatible browser extension blocker page", () => {
    expect(
      detectAccessBlocker(
        "ChatGPT",
        "Incompatible browser extension or network configuration. Your browser extensions or network settings have blocked the security verification process required by chatgpt.com."
      )
    ).toBe(true);
  });

  it("returns an operator action for human verification", () => {
    expect(
      getAccessBlockerReason("ChatGPT", "Verify you are human Cloudflare")
    ).toContain("runner:capture-session");
  });
});

describe("dismissChatGptLoggedOutUpsell", () => {
  it("clicks Stay logged out when ChatGPT shows the logged-out upsell", async () => {
    const click = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const visibleControl = {
      first: () => visibleControl,
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      click,
    };
    const emptyControl = {
      first: () => emptyControl,
      count: vi.fn().mockResolvedValue(0),
      isVisible: vi.fn().mockResolvedValue(false),
      click: vi.fn(),
    };
    const page = {
      locator: vi.fn((selector: string) =>
        selector.startsWith("button:has-text") ? visibleControl : emptyControl
      ),
      waitForTimeout,
    };

    await expect(
      dismissChatGptLoggedOutUpsell(page, { settleMs: 0 })
    ).resolves.toMatchObject({
      dismissed: true,
      selector: "button:has-text('Stay logged out')",
    });
    expect(click).toHaveBeenCalledWith({ timeout: 2500 });
    expect(waitForTimeout).not.toHaveBeenCalled();
  });
});

describe("isOpenAiGenerationErrorResponse", () => {
  it("detects the standard help center error from assistant output", () => {
    expect(
      isOpenAiGenerationErrorResponse(
        "Something went wrong while generating the response. If this issue persists please contact us through our help center at help.openai.com."
      )
    ).toBe(true);
  });

  it("ignores normal assistant text", () => {
    expect(isOpenAiGenerationErrorResponse("Here are three CRM options…")).toBe(
      false
    );
  });
});

describe("classifyChatGptPageState", () => {
  it("treats repeated critical 403s as a blocked guest session", () => {
    expect(
      classifyChatGptPageState({
        title: "ChatGPT",
        bodyText: "Something went wrong. Please contact help.openai.com.",
        promptVisible: false,
        networkEvents: [
          {
            url: "https://chatgpt.com/backend-anon/models?iim=false&is_gizmo=false",
            status: 403,
          },
          {
            url: "https://chatgpt.com/backend-anon/me",
            status: 403,
          },
          {
            url: "https://chatgpt.com/backend-anon/system_hints?mode=basic",
            status: 403,
          },
        ],
      }).state
    ).toBe("blocked");
  });

  it("treats conversation init 403 as blocked immediately", () => {
    expect(
      classifyChatGptPageState({
        title: "ChatGPT",
        bodyText: "",
        promptVisible: false,
        networkEvents: [
          {
            url: "https://chatgpt.com/backend-anon/conversation/init",
            status: 403,
          },
        ],
      }).reason
    ).toContain("conversation requests are being rejected");
  });

  it("marks the page ready once the composer is visible", () => {
    expect(
      classifyChatGptPageState({
        title: "ChatGPT",
        bodyText: "Ask anything",
        promptVisible: true,
        networkEvents: [],
      }).state
    ).toBe("ready");
  });

  it("treats the login wall as blocked with a session action", () => {
    const state = classifyChatGptPageState({
      url: "https://chatgpt.com/auth/login",
      title: "Get started | ChatGPT",
      bodyText: "Get started Log in Sign up for free",
      promptVisible: false,
      networkEvents: [],
    });

    expect(state.state).toBe("blocked");
    expect(state.reason).toContain("runner:capture-session");
  });

  it("treats challenge network requests as blocked", () => {
    const state = classifyChatGptPageState({
      url: "https://chatgpt.com/",
      title: "ChatGPT",
      bodyText: "",
      promptVisible: false,
      networkEvents: [
        {
          url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1",
          status: 200,
        },
      ],
    });

    expect(state.state).toBe("blocked");
    expect(state.reason).toContain("Cloudflare");
  });

  it("does not block a ready composer on passive Cloudflare telemetry", () => {
    const state = classifyChatGptPageState({
      url: "https://chatgpt.com/",
      title: "ChatGPT",
      bodyText: "What’s on your mind today?",
      promptVisible: true,
      networkEvents: [
        {
          url: "https://chatgpt.com/cdn-cgi/challenge-platform/scripts/jsd/main.js",
          status: 200,
        },
      ],
    });

    expect(state.state).toBe("ready");
  });
});

describe("extractResponseAndCitations", () => {
  it("records the assistant response without mixing in the logged-out upsell", async () => {
    const html = `
      <main>
        <article data-message-author-role="user">Hi how are you</article>
        <article data-message-author-role="assistant">
          <p>Hey! I’m doing well, thanks for asking. How about you?</p>
        </article>
        <div role="dialog" aria-modal="true">
          <h2>Thanks for trying ChatGPT</h2>
          <p>Log in or sign up to get smarter responses.</p>
          <button>Log in</button>
          <a href="#">Stay logged out</a>
        </div>
      </main>
    `;
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
        domainHops: [],
      },
      prompt: {
        text: "Hi how are you",
      },
    });
    const page = {
      evaluate: async (callback: (args: unknown) => unknown, args: unknown) => {
        const dom = new JSDOM(html, { url: "https://chatgpt.com/" });
        const globalWithDom = globalThis as typeof globalThis & {
          document?: Document;
          window?: Window;
        };
        const previousDocument = globalWithDom.document;
        const previousWindow = globalWithDom.window;
        globalWithDom.document = dom.window.document;
        globalWithDom.window = dom.window;

        try {
          return callback(args);
        } finally {
          if (previousDocument) {
            globalWithDom.document = previousDocument;
          } else {
            Reflect.deleteProperty(globalWithDom, "document");
          }
          if (previousWindow) {
            globalWithDom.window = previousWindow;
          } else {
            Reflect.deleteProperty(globalWithDom, "window");
          }
        }
      },
    };

    const extracted = await extractResponseAndCitations(page, config);

    expect(extracted.responseContainerFound).toBe(true);
    expect(extracted.responseText).toBe(
      "Hey! I’m doing well, thanks for asking. How about you?"
    );
    expect(extracted.responseText).not.toContain("Thanks for trying ChatGPT");
  });
});

describe("captureResponseScreenshot", () => {
  it("scrolls to the assistant response before capturing it", async () => {
    const response = {
      first: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(undefined),
    };
    response.first.mockReturnValue(response);
    const page = {
      locator: vi.fn().mockReturnValue(response),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
        domainHops: [],
      },
    });

    await expect(
      captureResponseScreenshot(page, config, "/tmp/response.png")
    ).resolves.toBe("/tmp/response.png");

    expect(page.locator).toHaveBeenCalledWith(
      config.extraction.responseContainerSelector
    );
    expect(response.scrollIntoViewIfNeeded).toHaveBeenCalledWith({
      timeout: 5000,
    });
    expect(response.screenshot).toHaveBeenCalledWith({
      path: "/tmp/response.png",
      timeout: 15000,
    });
  });

  it("skips capture when the response container is missing", async () => {
    const response = {
      first: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      isVisible: vi.fn().mockResolvedValue(false),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(undefined),
    };
    response.first.mockReturnValue(response);
    const page = {
      locator: vi.fn().mockReturnValue(response),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
        domainHops: [],
      },
    });

    await expect(
      captureResponseScreenshot(page, config, "/tmp/response.png")
    ).resolves.toBeNull();

    expect(response.scrollIntoViewIfNeeded).not.toHaveBeenCalled();
    expect(response.screenshot).not.toHaveBeenCalled();
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});

describe("normalizeRunnerConfig", () => {
  it("defaults openai to stored mode with the local profile directory", () => {
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
      },
    });
    expect(config.sessionMode).toBe("stored");
    expect(config.browser.userDataDir).toBe(DEFAULT_OPENAI_USER_DATA_DIR);
  });

  it("defaults navigation.domainHops to the pre-ChatGPT hop sequence", () => {
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
      },
    });
    expect(config.navigation.domainHops).toEqual(DEFAULT_DOMAIN_HOPS);
  });

  it("merges deepLink into navigation so domainHops on deepLink are not lost when navigation exists", () => {
    const custom = [
      { url: "https://example.com/merged-hop", waitAfterMs: 100 },
    ];
    const config = normalizeRunnerConfig({
      deepLink: {
        url: "https://chatgpt.com/",
        domainHops: custom,
      },
      navigation: {
        url: "https://chatgpt.com/",
      },
    });
    expect(config.navigation.domainHops).toEqual(custom);
  });

  it("allows disabling domain hops with an empty array", () => {
    expect(
      normalizeRunnerConfig({
        navigation: {
          url: "https://chatgpt.com/",
          domainHops: [],
        },
      }).navigation.domainHops
    ).toEqual([]);
  });

  it("in guest mode ignores a configured profile directory", () => {
    expect(
      normalizeRunnerConfig({
        sessionMode: "guest",
        navigation: {
          url: "https://chatgpt.com/",
        },
        browser: {
          channel: "chrome",
          headless: false,
          userDataDir: "runner/profiles/chatgpt-chrome",
        },
      }).browser.userDataDir
    ).toBeNull();
  });

  it("preserves a persistent Chrome profile directory in stored-session mode", () => {
    expect(
      normalizeRunnerConfig({
        sessionMode: "stored",
        navigation: {
          url: "https://chatgpt.com/",
        },
        browser: {
          channel: "chrome",
          headless: false,
          userDataDir: "runner/profiles/chatgpt-chrome",
        },
      }).browser.userDataDir
    ).toBe("runner/profiles/chatgpt-chrome");
  });

  it("uses storage state instead of a Chrome profile for Camoufox", () => {
    const config = normalizeRunnerConfig({
      sessionMode: "stored",
      navigation: {
        url: "https://chatgpt.com/",
      },
      browser: {
        engine: "camoufox",
        userDataDir: "runner/profiles/chatgpt-chrome",
      },
    });

    expect(config.browser.engine).toBe("camoufox");
    expect(config.browser.userDataDir).toBeNull();
    expect(config.browser.storageStatePath).toBe(
      DEFAULT_CAMOUFOX_STORAGE_STATE_PATH
    );
  });

  it("preserves experimental nodriver options", () => {
    const config = normalizeRunnerConfig({
      sessionMode: "guest",
      navigation: {
        url: "http://127.0.0.1:5999/nodriver-fixture.html",
      },
      browser: {
        engine: "nodriver",
        headless: true,
        nodriver: {
          executablePath: "/usr/bin/chromium",
          noSandbox: true,
        },
      },
    });

    expect(config.browser.engine).toBe("nodriver");
    expect(config.browser.userDataDir).toBeNull();
    expect(config.browser.nodriver.executablePath).toBe("/usr/bin/chromium");
    expect(config.browser.nodriver.noSandbox).toBe(true);
  });

  it("defaults the provider contract to openai", () => {
    expect(
      normalizeRunnerConfig({
        navigation: {
          url: "https://chatgpt.com/",
        },
      }).provider
    ).toBe("openai");
  });

  it("defaults OpenAI runs to typed composer submission", () => {
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
      },
    });

    expect(config.navigation.submitStrategy).toBe("type");
    expect(config.navigation.promptQueryParam).toBeNull();
  });

  it("ignores a prompt query param unless deeplink submission is explicit", () => {
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
        promptQueryParam: "q",
      },
    });

    expect(config.navigation.submitStrategy).toBe("type");
    expect(config.navigation.promptQueryParam).toBeNull();
  });

  it("does not default non-OpenAI runs to the ChatGPT q deeplink", () => {
    expect(
      normalizeRunnerConfig({
        provider: "claude",
        navigation: {
          url: "https://claude.ai/",
        },
      }).navigation.promptQueryParam
    ).toBeNull();
  });

  it("keeps the ChatGPT q deeplink only when explicitly requested", () => {
    const config = normalizeRunnerConfig({
      navigation: {
        url: "https://chatgpt.com/",
        submitStrategy: "deeplink",
        promptQueryParam: "q",
      },
    });

    expect(config.navigation.submitStrategy).toBe("deeplink");
    expect(config.navigation.promptQueryParam).toBe("q");
  });

  it("defaults Google AI Mode runs to q deeplinks and main-page extraction", () => {
    const config = normalizeRunnerConfig({
      provider: "google-ai-mode",
      prompt: {
        text: "how do i build mcp ui",
      },
    });

    expect(config.sessionMode).toBe("guest");
    expect(config.navigation.url).toBe("https://www.google.com/search?udm=50");
    expect(config.navigation.submitStrategy).toBe("deeplink");
    expect(config.navigation.promptQueryParam).toBe("q");
    expect(config.prompt.inputSelector).toBe("");
    expect(config.extraction.responseContainerSelector).toBe("main");
    expect(config.assertions.urlIncludes).toBe("google.com/search");
  });
});

describe("browser engine helpers", () => {
  it("normalizes nodriver and resolves its runner name", () => {
    expect(normalizeBrowserEngine("nodriver")).toBe("nodriver");
    expect(browserEngineRunnerName("nodriver")).toBe("local-nodriver");
    expect(browserEngineRunnerName("nodriver", "worker")).toBe(
      "local-nodriver-worker"
    );
  });

  it("fails nodriver preflight cleanly when the configured python is invalid", async () => {
    const result = await getBrowserEnginePreflight({
      engine: "nodriver",
      nodriver: {
        python: process.execPath,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reason).toBeTruthy();
  });
});

describe("normalizeExtractedPayload", () => {
  it("maps fixture response text and citations into the runner citation contract", () => {
    const extracted = normalizeExtractedPayload({
      pageTitle: "OpenPeec Nodriver Fixture",
      finalUrl: "http://127.0.0.1:5999/nodriver-fixture.html",
      responseContainerFound: true,
      responseText:
        "OpenPeec tracks how a brand appears in AI answer surfaces.",
      responseHtml: "<article>OpenPeec</article>",
      citations: [
        {
          index: 1,
          url: "https://example.com/openpeec-guide?utm_source=test",
          rawTitle: "OpenPeec guide",
          snippet: "Useful references: OpenPeec guide",
        },
      ],
    });

    expect(extracted.responseText).toContain("OpenPeec tracks");
    expect(extracted.citations).toHaveLength(1);
    expect(extracted.citations[0].domain).toBe("example.com");
    expect(extracted.citations[0].url).toBe(
      "https://example.com/openpeec-guide"
    );
    expect(extracted.sourceArtifacts[0].rawTitle).toBe("OpenPeec guide");
  });
});

describe("extractGoogleAiModeResponse", () => {
  it("extracts the AI Mode answer and source links from the rendered page", async () => {
    const html = `
      <main>
        <h1>Search Results</h1>
        <h2>how do i build mcp ui</h2>
        <p>Build an MCP UI by returning an iframe-backed app resource.</p>
        <p>Use a resource template and connect it to a tool result.</p>
        <a href="https://modelcontextprotocol.io/docs/develop/build-server?utm_source=google">Model Context Protocol</a>
        <button>Copy text</button>
        <p>AI can make mistakes, so double-check responses</p>
      </main>
    `;
    const dom = new JSDOM(html, {
      url: "https://www.google.com/search?udm=50&q=how+do+i+build+mcp+ui",
    });
    const page = {
      evaluate: async (fn: (args: unknown) => unknown, args: unknown) => {
        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        globalThis.document = dom.window.document;
        globalThis.window = dom.window;
        try {
          return fn(args);
        } finally {
          globalThis.document = previousDocument;
          globalThis.window = previousWindow;
        }
      },
    };

    const raw = await extractGoogleAiModeResponse(page, {
      prompt: { text: "how do i build mcp ui" },
      extraction: { maxCitations: 10 },
    });
    const extracted = normalizeExtractedPayload(raw);

    expect(extracted.responseText).toContain("Build an MCP UI");
    expect(extracted.responseText).not.toContain("Copy text");
    expect(extracted.citations).toHaveLength(1);
    expect(extracted.citations[0].domain).toBe("modelcontextprotocol.io");
    expect(extracted.citations[0].url).toBe(
      "https://modelcontextprotocol.io/docs/develop/build-server"
    );
  });
});

describe("nodriver fixture result contract", () => {
  const fixtureCitations = NODRIVER_FIXTURE_CITATIONS as Array<{
    domain: string;
    title: string;
    url: string;
  }>;
  const successfulFixtureResult = {
    status: "success",
    responseText: NODRIVER_FIXTURE_RESPONSE_TEXT,
    sourceCount: fixtureCitations.length,
    citations: fixtureCitations.map((citation, index) => ({
      position: index + 1,
      qualityScore: 100,
      type: index === 0 ? "corporate" : "docs",
      snippet: "Useful references: OpenPeec guide and AI visibility docs.",
      ...citation,
    })),
    output: {
      citationsExtracted: NODRIVER_FIXTURE_CITATIONS.length,
      sourcesRecorded: NODRIVER_FIXTURE_CITATIONS.length,
      artifacts: {},
    },
  };

  it("passes only when the exact fixture response text was recorded", async () => {
    await expect(
      assertNodriverFixtureResult(successfulFixtureResult, {
        checkArtifacts: false,
      })
    ).resolves.toMatchObject({
      responseText: NODRIVER_FIXTURE_RESPONSE_TEXT,
      citations: fixtureCitations.map((citation) => citation.url),
    });
  });

  it("fails when the fixture response text is missing or changed", async () => {
    await expect(
      assertNodriverFixtureResult(
        {
          ...successfulFixtureResult,
          responseText: "",
        },
        { checkArtifacts: false }
      )
    ).rejects.toThrow("Expected nodriver fixture responseText");
  });
});

describe("parseSessionJsonMaterial", () => {
  it("accepts provider session JSON in auth material shape", () => {
    const parsed = parseSessionJsonMaterial(
      JSON.stringify({
        headers: { "x-test": "1" },
        cookies: [{ name: "a", value: "b", domain: ".chatgpt.com", path: "/" }],
      })
    );

    expect(parsed.warnings).toEqual([]);
    expect(parsed.material.headers["x-test"]).toBe("1");
    expect(parsed.material.cookies).toHaveLength(1);
  });

  it("treats Playwright storage state JSON as storageState material", () => {
    const parsed = parseSessionJsonMaterial(
      JSON.stringify({
        cookies: [],
        origins: [{ origin: "https://chatgpt.com", localStorage: [] }],
      })
    );

    expect(parsed.material.cookies).toBeUndefined();
    expect(parsed.material.storageState.origins).toHaveLength(1);
  });

  it("warns and continues when provider session JSON is invalid", () => {
    const parsed = parseSessionJsonMaterial("{nope");

    expect(parsed.material).toEqual({});
    expect(parsed.warnings[0]).toContain("invalid JSON");
  });
});

describe("loadRunnerSessionMaterial", () => {
  it("uses normalized browser storage state path as auth material", async () => {
    const config = normalizeRunnerConfig({
      sessionMode: "stored",
      navigation: {
        url: "https://chatgpt.com/",
      },
      browser: {
        engine: "camoufox",
      },
    });

    const loaded = await loadRunnerSessionMaterial(config);

    expect(loaded.material.storageStatePath).toBe(
      DEFAULT_CAMOUFOX_STORAGE_STATE_PATH
    );
  });
});

describe("runMonitor", () => {
  it("blocks non-runnable providers without opening a browser", async () => {
    const result = await runMonitor({
      provider: "claude",
      navigation: {
        url: "https://claude.ai/",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("Provider runner is not implemented");
  });
});
