import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMOUFOX_STORAGE_STATE_PATH,
  DEFAULT_OPENAI_USER_DATA_DIR,
  classifyChatGptPageState,
  detectAccessBlocker,
  getAccessBlockerReason,
  isOpenAiGenerationErrorResponse,
  loadRunnerSessionMaterial,
  normalizeRunnerConfig,
  parseSessionJsonMaterial,
  runMonitor,
} from "../runner/run-monitor.mjs";
import {
  detectAntiBotBlock,
  detectAntiBotNetworkBlock,
} from "../runner/anti-bot-detector.mjs";
import { DEFAULT_DOMAIN_HOPS } from "../runner/session-warmup.mjs";

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
  it("blocks non-OpenAI providers without opening a browser", async () => {
    const result = await runMonitor({
      provider: "claude",
      navigation: {
        url: "https://claude.ai/",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("OpenAI is the only active v0 provider");
  });
});
