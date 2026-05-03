import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { RunsPage } from "./RunsPage";

const baseGroup = {
  id: "run_group_1",
  promptId: "prompt_1" as Id<"prompts">,
  promptExcerpt: "Best AI visibility tools",
  runLabel: "Manual run",
  status: "success",
  queuedAt: Date.now(),
  startedAt: Date.now(),
  finishedAt: Date.now(),
  sourceCount: 3,
  citationCount: 4,
  providers: [
    {
      runId: "run_1" as Id<"promptRuns">,
      providerSlug: "openai",
      providerName: "OpenAI",
      channelName: "ChatGPT web",
      sessionMode: "stored" as const,
      browserEngine: "camoufox" as const,
      status: "success",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      latencyMs: 1200,
      responseSummary: "OpenPeec is cited in the result.",
      sourceCount: 3,
      citationCount: 3,
    },
  ],
};

describe("RunsPage", () => {
  it("shows provider engine chips on grouped runs", () => {
    render(
      <RunsPage
        groups={[baseGroup]}
        selectedRunGroupId={null}
        onOpenRunGroup={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("OpenAI · Camoufox")).toBeTruthy();
  });

  it("keeps prompt details under the Prompt column and providers under Providers", () => {
    render(
      <RunsPage
        groups={[baseGroup]}
        selectedRunGroupId={null}
        onOpenRunGroup={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    const dataRow = screen
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Best AI visibility tools"));
    expect(dataRow).toBeTruthy();

    const cells = within(dataRow!).getAllByRole("cell");
    expect(cells[1]?.textContent).toContain("Best AI visibility tools");
    expect(cells[2]?.textContent).toContain("OpenAI");
    expect(cells[2]?.textContent).toContain("Camoufox");
  });

  it("derives older provider engine chips from the runner name", () => {
    render(
      <RunsPage
        groups={[
          {
            ...baseGroup,
            providers: [
              {
                ...baseGroup.providers[0],
                browserEngine: undefined,
                runner: "local-nodriver-worker",
              },
            ],
          },
        ]}
        selectedRunGroupId={null}
        onOpenRunGroup={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("OpenAI · Nodriver")).toBeTruthy();
  });
});
