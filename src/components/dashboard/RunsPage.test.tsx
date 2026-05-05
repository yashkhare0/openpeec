import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
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

function renderRunsPage(props: Partial<ComponentProps<typeof RunsPage>> = {}) {
  return render(
    <TooltipProvider>
      <RunsPage
        groups={[baseGroup]}
        searchValue=""
        statusFilters={[]}
        selectedRunGroupId={null}
        onOpenRun={vi.fn()}
        onOpenRunGroup={vi.fn()}
        onOpenPrompt={vi.fn()}
        onCancelRuns={vi.fn()}
        onDeleteRuns={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe("RunsPage", () => {
  it("shows one compact provider status summary on grouped runs", () => {
    renderRunsPage({
      groups: [
        {
          ...baseGroup,
          providers: [
            baseGroup.providers[0],
            {
              ...baseGroup.providers[0],
              runId: "run_2" as Id<"promptRuns">,
              providerSlug: "google-ai-mode",
              providerName: "Google AI Mode",
              channelName: "Google AI Mode",
              status: "blocked",
              latencyMs: 2400,
              citationCount: 1,
            },
          ],
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: /open google ai mode run/i })
    ).toBeTruthy();
    expect(screen.getByText("1 Blocked")).toBeTruthy();
    expect(screen.queryByText("OpenAI Success")).toBeNull();
    expect(screen.queryByText("Google AI Mode Blocked")).toBeNull();
    expect(screen.queryByText("OpenAI · Camoufox")).toBeNull();
  });

  it("keeps prompt details under the Prompt column and providers under Providers", () => {
    renderRunsPage();

    const dataRow = screen
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Best AI visibility tools"));
    expect(dataRow).toBeTruthy();

    const cells = within(dataRow!).getAllByRole("cell");
    expect(cells[1]?.textContent).toContain("Best AI visibility tools");
    expect(cells[1]?.textContent).not.toContain("Manual run");
    expect(cells[2]?.textContent).toContain("Successful");
    expect(cells[2]?.textContent).not.toContain("OpenAI");
    expect(cells[2]?.textContent).not.toContain("Camoufox");
  });

  it("filters runs from header-owned search and status values", () => {
    renderRunsPage({
      searchValue: "blocked provider",
      statusFilters: ["blocked"],
      groups: [
        baseGroup,
        {
          ...baseGroup,
          id: "run_group_2",
          status: "blocked",
          promptExcerpt: "Blocked provider flow",
          providers: [
            {
              ...baseGroup.providers[0],
              runId: "run_2" as Id<"promptRuns">,
              providerSlug: "google-ai-mode",
              providerName: "Google AI Mode",
              status: "blocked",
              responseSummary: "Google blocked the page.",
            },
          ],
        },
      ],
    });

    expect(screen.getByText("Blocked provider flow")).toBeTruthy();
    expect(screen.queryByText("Best AI visibility tools")).toBeNull();
  });

  it("derives older provider engines from the runner name in details", async () => {
    const user = userEvent.setup();

    renderRunsPage({
      groups: [
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
      ],
    });

    expect(screen.getByText("Successful")).toBeTruthy();
    await user.hover(screen.getByRole("button", { name: /open openai run/i }));
    expect((await screen.findAllByText(/Nodriver/)).length).toBeGreaterThan(0);
  });

  it("opens grouped run rows by click and keyboard without hijacking nested controls", async () => {
    const user = userEvent.setup();
    const onOpenRunGroup = vi.fn();
    const onOpenRun = vi.fn();
    const onOpenPrompt = vi.fn();

    renderRunsPage({ onOpenRun, onOpenRunGroup, onOpenPrompt });

    const dataRow = screen.getByRole("row", {
      name: "Open run group for Best AI visibility tools",
    });

    await user.click(dataRow);
    expect(onOpenRunGroup).toHaveBeenCalledWith("run_group_1");

    await user.click(
      within(dataRow).getByRole("button", {
        name: /best ai visibility tools/i,
      })
    );
    expect(onOpenPrompt).toHaveBeenCalledWith("prompt_1");
    expect(onOpenRunGroup).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText(/Timing for run queued/i));
    expect(onOpenRunGroup).toHaveBeenCalledTimes(1);

    await user.click(
      within(dataRow).getByRole("button", { name: /open openai run/i })
    );
    expect(onOpenRun).toHaveBeenCalledWith("run_1");
    expect(onOpenRunGroup).toHaveBeenCalledTimes(1);

    dataRow.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpenRunGroup).toHaveBeenCalledTimes(3);
  });

  it("offers cancel and delete actions for queued provider runs", async () => {
    const user = userEvent.setup();
    const onCancelRuns = vi.fn().mockResolvedValue(undefined);
    const onDeleteRuns = vi.fn().mockResolvedValue(undefined);

    renderRunsPage({
      onCancelRuns,
      onDeleteRuns,
      groups: [
        {
          ...baseGroup,
          status: "queued",
          providers: [
            {
              ...baseGroup.providers[0],
              status: "queued",
            },
          ],
        },
      ],
    });

    await user.click(screen.getByLabelText(/actions for queued runs/i));
    await user.click(screen.getByRole("menuitem", { name: /cancel queued/i }));
    expect(onCancelRuns).toHaveBeenCalledWith(["run_1"]);

    await user.click(screen.getByLabelText(/actions for queued runs/i));
    await user.click(screen.getByRole("menuitem", { name: /delete queued/i }));
    expect(onDeleteRuns).toHaveBeenCalledWith(["run_1"]);
  });

  it("does not repeat a run label that matches the prompt text", () => {
    renderRunsPage({
      groups: [
        {
          ...baseGroup,
          runLabel: "Best AI visibility tools",
        },
      ],
    });

    const dataRow = screen.getByRole("row", {
      name: "Open run group for Best AI visibility tools",
    });
    const promptCell = within(dataRow).getAllByRole("cell")[1];

    expect(promptCell?.textContent).toBe("Best AI visibility tools");
  });
});
