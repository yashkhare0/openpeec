import { describe, expect, it } from "vitest";

import {
  classifyChatGptPageState,
  detectAccessBlocker,
  normalizeRunnerConfig,
} from "../runner/run-monitor.mjs";

describe("detectAccessBlocker", () => {
  it("detects the incompatible browser extension blocker page", () => {
    expect(
      detectAccessBlocker(
        "ChatGPT",
        "Incompatible browser extension or network configuration. Your browser extensions or network settings have blocked the security verification process required by chatgpt.com."
      )
    ).toBe(true);
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
});

describe("normalizeRunnerConfig", () => {
  it("preserves a persistent Chrome profile directory", () => {
    expect(
      normalizeRunnerConfig({
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

  it("does not auto-enable the ChatGPT q deeplink", () => {
    expect(
      normalizeRunnerConfig({
        navigation: {
          url: "https://chatgpt.com/",
        },
      }).navigation.promptQueryParam
    ).toBeNull();
  });
});
