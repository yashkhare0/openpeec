import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { ResponseDetailPage } from "./ResponseDetailPage";

const blockedRunDetail = {
  run: {
    _id: "run_1" as Id<"promptRuns">,
    promptId: "prompt_1" as Id<"prompts">,
    status: "blocked",
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now(),
    latencyMs: 49_200,
    providerSlug: "google-ai-mode",
    providerName: "Google AI Mode",
    providerUrl: "https://www.google.com/search?udm=50",
    channelName: "Google AI Mode web",
    sessionMode: "guest" as const,
    promptExcerpt: "How to build mcp-ui applications quickly?",
    responseSummary:
      "Google blocked the AI Mode page before the answer could be read.",
    sourceCount: 0,
    evidencePath:
      "/app/runner/artifacts/How_to_build_mcp-ui_applications_quickly/page.png",
    output: JSON.stringify({
      artifacts: {
        screenshot:
          "/app/runner/artifacts/How_to_build_mcp-ui_applications_quickly/page.png",
        sources:
          "/app/runner/artifacts/How_to_build_mcp-ui_applications_quickly/sources.json",
      },
    }),
    warnings: ["No response text extracted from Google AI Mode output."],
  },
  prompt: {
    excerpt: "How to build mcp-ui applications quickly?",
    promptText: "How to build mcp-ui applications quickly?",
  },
  mentions: [],
  citations: [],
};

describe("ResponseDetailPage", () => {
  it("keeps blocked provider runs focused on status, summary, and evidence", () => {
    render(
      <ResponseDetailPage
        runDetail={blockedRunDetail}
        onOpenPrompt={vi.fn()}
        onRetryRun={vi.fn()}
      />
    );

    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(
      screen.getByText(
        "Google blocked the AI Mode page before the answer could be read."
      )
    ).toBeTruthy();
    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(screen.getByText("Technical artifacts")).toBeTruthy();

    expect(screen.queryByText("Prompt")).toBeNull();
    expect(screen.queryByText("Entity Mentions")).toBeNull();
    expect(screen.queryByText("Sources", { selector: "h2" })).toBeNull();
    expect(
      screen.queryByText(
        "This run was blocked before ChatGPT produced a valid response, so no citations were recorded."
      )
    ).toBeNull();
  });
});
