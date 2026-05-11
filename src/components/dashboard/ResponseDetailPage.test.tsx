import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
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

const successfulRunDetail = {
  run: {
    _id: "run_2" as Id<"promptRuns">,
    promptId: "prompt_1" as Id<"prompts">,
    status: "success",
    startedAt: Date.now() - 120_000,
    finishedAt: Date.now() - 90_000,
    latencyMs: 30_000,
    providerSlug: "chatgpt",
    providerName: "ChatGPT",
    providerUrl: "https://chatgpt.com",
    channelName: "ChatGPT web",
    sessionMode: "stored" as const,
    promptExcerpt: "Best AI visibility monitoring workflow?",
    responseText: "Use a repeatable prompt set and compare cited sources.",
    sourceCount: 1,
    citationQualityScore: 88,
    deeplinkUsed: "https://chatgpt.com/?q=visibility",
    evidencePath:
      "/app/runner/artifacts/Best_AI_visibility_monitoring_workflow/response.png",
    output: JSON.stringify({
      finalUrl: "https://chatgpt.com/c/example",
      artifacts: {
        responseScreenshot:
          "/app/runner/artifacts/Best_AI_visibility_monitoring_workflow/response.png",
        screenshot:
          "/app/runner/artifacts/Best_AI_visibility_monitoring_workflow/page.png",
      },
    }),
  },
  prompt: {
    excerpt: "Best AI visibility monitoring workflow?",
    promptText: "Best AI visibility monitoring workflow?",
  },
  mentions: [],
  citations: [
    {
      domain: "docs.example.com",
      url: "https://docs.example.com/ai-visibility",
      title: "Docs Example",
      snippet: "A practical guide to tracking AI visibility.",
      type: "docs",
      position: 1,
      qualityScore: 88,
      isOwned: true,
      trackedEntity: {
        name: "OpenPeec",
        slug: "openpeec",
      },
    },
  ],
};

const queuedRunDetail = {
  ...successfulRunDetail,
  run: {
    ...successfulRunDetail.run,
    _id: "run_queued" as Id<"promptRuns">,
    status: "queued",
    finishedAt: undefined,
    latencyMs: undefined,
    responseText: undefined,
    responseSummary: undefined,
  },
  citations: [],
};

describe("ResponseDetailPage", () => {
  it("keeps blocked provider runs focused on status, summary, and evidence", () => {
    renderResponseDetail(
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

  it("renders citation rows as full external source links", () => {
    renderResponseDetail(
      <ResponseDetailPage runDetail={successfulRunDetail} />
    );

    const citationLink = screen.getByLabelText(
      "Open source Docs Example from docs.example.com"
    );

    expect(citationLink.tagName).toBe("A");
    expect(citationLink.getAttribute("href")).toBe(
      "https://docs.example.com/ai-visibility"
    );
    expect(screen.getByText("Response screenshot")).toBeTruthy();
  });

  it("allows queued runs to be cancelled or deleted", async () => {
    const user = userEvent.setup();
    const onCancelRun = vi.fn();
    const onDeleteRun = vi.fn();

    renderResponseDetail(
      <ResponseDetailPage
        runDetail={queuedRunDetail}
        onCancelRun={onCancelRun}
        onDeleteRun={onDeleteRun}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /cancel queued run/i })
    );
    expect(onCancelRun).toHaveBeenCalledWith("run_queued");

    await user.click(screen.getByRole("button", { name: /delete run/i }));
    expect(onDeleteRun).toHaveBeenCalledWith("run_queued");
  });
});

function renderResponseDetail(component: ReactElement) {
  return render(<TooltipProvider>{component}</TooltipProvider>);
}
