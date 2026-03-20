import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../runner/run-monitor.mjs", () => ({
  readJsonFile: vi.fn(),
  resolvePathIfRelative: vi.fn(),
  runMonitor: vi.fn(),
}));

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
  it("does not inject the ChatGPT q deeplink when it is not configured", async () => {
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
            promptText: "What is drio?",
            targetModel: "chatgpt-web",
          },
          runLabel: "Manual run",
        }
      ).navigation.promptQueryParam
    ).toBeUndefined();
  });
});
