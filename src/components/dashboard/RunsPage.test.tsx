import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { RunsPage } from "./RunsPage";

const baseRun = {
  _id: "run_1" as Id<"promptRuns">,
  promptId: "prompt_1" as Id<"prompts">,
  promptExcerpt: "Best AI visibility tools",
  providerSlug: "openai",
  providerName: "OpenAI",
  channelName: "ChatGPT web",
  sessionMode: "stored" as const,
  status: "success",
  startedAt: Date.now(),
  finishedAt: Date.now(),
  latencyMs: 1200,
  responseSummary: "OpenPeec is cited in the result.",
  citationQualityScore: 81,
  sourceCount: 3,
  citationCount: 3,
};

describe("RunsPage", () => {
  it("shows the queued browser engine as a run chip", () => {
    render(
      <RunsPage
        runs={[{ ...baseRun, browserEngine: "nodriver" }]}
        selectedRunId={null}
        onOpenRun={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("Nodriver")).toBeTruthy();
  });

  it("keeps prompt details under the Prompt column and engine under Engine", () => {
    render(
      <RunsPage
        runs={[{ ...baseRun, browserEngine: "nodriver" }]}
        selectedRunId={null}
        onOpenRun={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    const dataRow = screen
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Best AI visibility tools"));
    expect(dataRow).toBeTruthy();

    const cells = within(dataRow!).getAllByRole("cell");
    expect(cells[1]?.textContent).toContain("Best AI visibility tools");
    expect(cells[2]?.textContent).toBe("Nodriver");
  });

  it("derives older run engine chips from the runner name", () => {
    render(
      <RunsPage
        runs={[{ ...baseRun, runner: "local-camoufox-worker" }]}
        selectedRunId={null}
        onOpenRun={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("Camoufox")).toBeTruthy();
  });
});
