import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../runner/run-monitor.mjs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../runner/run-monitor.mjs")>();
  return {
    ...actual,
    readJsonFile: vi.fn(),
    resolvePathIfRelative: vi.fn(),
    runMonitor: vi.fn(),
  };
});

describe("shouldAutoRetry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not retry access-gated or unauthenticated failures", async () => {
    const { shouldAutoRetry } =
      await import("../runner/process-queued-runs.mjs");

    expect(
      shouldAutoRetry(
        {
          status: "failed",
          summary: "ChatGPT access was blocked before the prompt could run.",
          warnings: [
            "Storage state not found at runner/chatgpt.storage-state.json; continuing with a fresh browser session.",
            "Access blocker detected on chatgpt.com before prompt submission; metrics are not treated as a valid monitoring run.",
          ],
        },
        "Manual run"
      )
    ).toBe(false);
  });

  it("retries first-pass response timeouts", async () => {
    const { shouldAutoRetry } =
      await import("../runner/process-queued-runs.mjs");

    expect(
      shouldAutoRetry(
        {
          status: "failed",
          summary:
            "Prompt submission did not produce a usable assistant response.",
          warnings: [
            "Response container not found after submit: page.waitForSelector: Timeout 45000ms exceeded.",
          ],
        },
        "Manual run"
      )
    ).toBe(true);
  });

  it("stops retrying once the attempt limit is reached", async () => {
    const { shouldAutoRetry } =
      await import("../runner/process-queued-runs.mjs");

    expect(
      shouldAutoRetry(
        {
          status: "failed",
          summary:
            "Prompt submission did not produce a usable assistant response.",
          warnings: [
            "Response container not found after submit: page.waitForSelector: Timeout 45000ms exceeded.",
          ],
        },
        { attempt: 2 },
        2
      )
    ).toBe(false);
  });
});

describe("buildRetryLabel", () => {
  it("increments retry labels from the base run label", async () => {
    const { buildRetryLabel } =
      await import("../runner/process-queued-runs.mjs");

    expect(buildRetryLabel("Manual run", 2)).toBe("Manual run [retry 2]");
    expect(buildRetryLabel("Manual run [retry 1]", 3)).toBe(
      "Manual run [retry 3]"
    );
  });
});

describe("buildRunConfig", () => {
  it("uses typed composer submission for OpenAI queue runs and defaults to local profile", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    expect(
      buildRunConfig(
        {
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
            providerSessionJson: '{"headers":{"x-test":"1"}}',
          },
          runLabel: "Manual run",
        }
      ).provider
    ).toBe("openai");

    expect(
      buildRunConfig(
        {
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
            providerSessionJson: '{"headers":{"x-test":"1"}}',
          },
          runLabel: "Manual run",
        }
      ).sessionJson
    ).toBe('{"headers":{"x-test":"1"}}');

    expect(
      buildRunConfig(
        {
          sessionMode: "guest",
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
            providerSessionJson: '{"headers":{"x-test":"1"}}',
          },
          runLabel: "Manual run",
        }
      ).sessionJson
    ).toBeUndefined();

    expect(
      buildRunConfig(
        {
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
          },
          runLabel: "Manual run",
        }
      ).navigation.promptQueryParam
    ).toBeNull();

    expect(
      buildRunConfig(
        {
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
            promptQueryParam: "q",
          },
          runLabel: "Manual run",
        }
      ).navigation.submitStrategy
    ).toBe("type");
  });

  it("uses ChatGPT q deeplinks only when the queued run requests deeplink submission", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        navigation: {
          url: "https://chatgpt.com/",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "What is drio?",
          promptText: "What is drio?",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
          promptQueryParam: "q",
          submitStrategy: "deeplink",
        },
        runLabel: "Manual run",
      }
    );

    expect(config.navigation.submitStrategy).toBe("deeplink");
    expect(config.navigation.promptQueryParam).toBe("q");
  });

  it("passes provider session material only in stored-session mode", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    expect(
      buildRunConfig(
        {
          sessionMode: "stored",
          browser: {
            userDataDir: "runner/profiles/chatgpt-chrome",
          },
          navigation: {
            url: "https://chatgpt.com/",
          },
          prompt: {},
        },
        {
          prompt: {
            id: "prompt_123",
            excerpt: "What is drio?",
            promptText: "What is drio?",
            providerSlug: "openai",
            providerUrl: "https://chatgpt.com/",
            providerSessionJson: '{"headers":{"x-test":"1"}}',
          },
          runLabel: "Manual run",
        }
      ).sessionJson
    ).toBe('{"headers":{"x-test":"1"}}');
  });

  it("uses the queued provider session snapshot before base runner defaults", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        sessionMode: "guest",
        browser: {
          userDataDir: "runner/profiles/default",
        },
        navigation: {
          url: "https://chatgpt.com/",
          promptQueryParam: "q",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "What is drio?",
          promptText: "What is drio?",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
          sessionMode: "stored",
          sessionProfileDir: "runner/profiles/chatgpt-chrome",
          promptQueryParam: "q",
          providerSessionJson: '{"headers":{"x-provider":"1"}}',
        },
        runLabel: "Manual run",
      }
    );

    expect(config.sessionMode).toBe("stored");
    expect(config.browser.userDataDir).toBe("runner/profiles/chatgpt-chrome");
    expect(config.sessionJson).toBe('{"headers":{"x-provider":"1"}}');
  });

  it("preserves domainHops from base deepLink when the queue overwrites navigation with url-only fields", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");
    const custom = [{ url: "https://example.com/queue-hop", waitAfterMs: 1 }];
    const config = buildRunConfig(
      {
        deepLink: {
          url: "https://chatgpt.com/",
          domainHops: custom,
        },
        navigation: {
          url: "https://chatgpt.com/",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "x",
          promptText: "x",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
        },
        runLabel: "Manual run",
      }
    );
    expect(config.navigation.domainHops).toEqual(custom);
  });

  it("defaults openai queued runs to stored mode and the default profile path", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        navigation: {
          url: "https://chatgpt.com/",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "Brand check",
          promptText: "What is ExampleCo?",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
        },
        runLabel: "Manual run",
      }
    );

    expect(config.sessionMode).toBe("stored");
    expect(config.browser.userDataDir).toBe("runner/profiles/chatgpt-chrome");
  });

  it("keeps Camoufox queue runs on storage state instead of a Chrome profile", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        browser: {
          engine: "camoufox",
          userDataDir: "runner/profiles/chatgpt-chrome",
        },
        navigation: {
          url: "https://chatgpt.com/",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "Brand check",
          promptText: "What is ExampleCo?",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
        },
        runLabel: "Manual run",
      }
    );

    expect(config.browser.engine).toBe("camoufox");
    expect(config.browser.userDataDir).toBeUndefined();
    expect(config.browser.storageStatePath).toBe(
      "runner/camoufox.storage-state.json"
    );
  });

  it("keeps Camoufox queue runs stored even when a stale provider snapshot says guest", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        browser: {
          engine: "camoufox",
          storageStatePath: "runner/camoufox.storage-state.json",
        },
        navigation: {
          url: "https://chatgpt.com/",
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "Brand check",
          promptText: "What is ExampleCo?",
          providerSlug: "openai",
          providerUrl: "https://chatgpt.com/",
          sessionMode: "guest",
        },
        runLabel: "Manual run",
      }
    );

    expect(config.sessionMode).toBe("stored");
    expect(config.browser.storageStatePath).toBe(
      "runner/camoufox.storage-state.json"
    );
  });

  it("propagates nodriver queue engine config without using Camoufox storage state", async () => {
    const { buildRunConfig } =
      await import("../runner/process-queued-runs.mjs");

    const config = buildRunConfig(
      {
        browser: {
          engine: "nodriver",
          userDataDir: "runner/profiles/nodriver-chrome",
          nodriver: {
            executablePath: "/usr/bin/chromium",
          },
        },
        navigation: {
          url: "http://127.0.0.1:5999/nodriver-fixture.html",
          domainHops: [],
        },
        prompt: {},
      },
      {
        prompt: {
          id: "prompt_123",
          excerpt: "Fixture check",
          promptText: "What is OpenPeec?",
          providerSlug: "openai",
          providerUrl: "http://127.0.0.1:5999/nodriver-fixture.html",
        },
        runLabel: "Fixture run",
      }
    );

    expect(config.browser.engine).toBe("nodriver");
    expect(config.browser.userDataDir).toBe("runner/profiles/nodriver-chrome");
    expect(config.browser.storageStatePath).toBeUndefined();
    expect(config.browser.nodriver.executablePath).toBe("/usr/bin/chromium");
    expect(config.navigation.domainHops).toEqual([]);
  });
});
