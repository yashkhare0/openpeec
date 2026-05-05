import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ResponsesPage } from "./ResponsesPage";

const baseRun = {
  _id: "run_1" as Id<"promptRuns">,
  promptId: "prompt_1" as Id<"prompts">,
  promptExcerpt: "How visible is OpenPeec in AI search?",
  providerName: "OpenAI",
  providerSlug: "openai",
  status: "success",
  startedAt: Date.now(),
  browserEngine: "camoufox" as const,
  responseSummary: "OpenPeec appears in the answer.",
  sourceCount: 1,
  citationCount: 1,
  citationQualityScore: 100,
};

function renderResponsesPage(
  props: Partial<ComponentProps<typeof ResponsesPage>> = {}
) {
  return render(
    <TooltipProvider>
      <ResponsesPage
        runs={[baseRun]}
        searchValue=""
        statusFilters={[]}
        providerFilters={[]}
        providers={[{ slug: "openai", name: "OpenAI", active: true }]}
        selectedRunId={null}
        onOpenRun={vi.fn()}
        onOpenPrompt={vi.fn()}
        onRetryRun={vi.fn()}
        onCancelRun={vi.fn()}
        onDeleteRun={vi.fn()}
        onTriggerSelectedNow={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe("ResponsesPage", () => {
  it("splits provider, status, and run time into separate cells", () => {
    renderResponsesPage();

    const dataRow = screen.getByRole("button", {
      name: /open response from openai/i,
    });
    const cells = within(dataRow).getAllByRole("cell");

    expect(cells[0]?.textContent).toContain("OpenAI");
    expect(cells[1]?.textContent).toContain("Successful");
    expect(cells[2]?.textContent).not.toContain("OpenAI");
    expect(cells[2]?.textContent).not.toContain("Successful");
  });

  it("keeps response row actions out of the row click target", async () => {
    const user = userEvent.setup();
    const onOpenRun = vi.fn();
    const onRetryRun = vi.fn();

    renderResponsesPage({ onOpenRun, onRetryRun });

    await user.click(screen.getByLabelText(/actions for/i));
    await user.click(screen.getByRole("menuitem", { name: /view details/i }));
    expect(onOpenRun).toHaveBeenCalledWith("run_1");

    await user.click(screen.getByLabelText(/actions for/i));
    await user.click(screen.getByRole("menuitem", { name: /re-run/i }));
    expect(onRetryRun).toHaveBeenCalledWith("run_1");
  });

  it("shows cancellation only for active runs", async () => {
    const user = userEvent.setup();

    renderResponsesPage({
      runs: [
        {
          ...baseRun,
          status: "running",
          responseSummary: undefined,
        },
      ],
    });

    await user.click(screen.getByLabelText(/actions for/i));
    expect(screen.getByRole("menuitem", { name: /cancel run/i })).toBeTruthy();
  });

  it("allows queued responses to be cancelled or deleted", async () => {
    const user = userEvent.setup();
    const onCancelRun = vi.fn().mockResolvedValue(undefined);
    const onDeleteRun = vi.fn().mockResolvedValue(undefined);

    renderResponsesPage({
      onCancelRun,
      onDeleteRun,
      runs: [
        {
          ...baseRun,
          status: "queued",
          responseSummary: undefined,
        },
      ],
    });

    await user.click(screen.getByLabelText(/actions for/i));
    await user.click(
      screen.getByRole("menuitem", { name: /cancel queued run/i })
    );
    expect(onCancelRun).toHaveBeenCalledWith("run_1");

    await user.click(screen.getByLabelText(/actions for/i));
    await user.click(
      screen.getByRole("menuitem", { name: /delete queued run/i })
    );
    expect(onDeleteRun).toHaveBeenCalledWith("run_1");
  });
});
