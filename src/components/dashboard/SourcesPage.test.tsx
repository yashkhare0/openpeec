import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SourcesPage } from "./SourcesPage";

const source = {
  domain: "github.com",
  type: "docs",
  citations: 3,
  responseCount: 2,
  promptCount: 1,
  usedShare: 13,
  avgCitationsPerRun: 0.4,
  avgQualityScore: 82,
  avgPosition: 2,
  ownedShare: 0,
  latestResponses: [
    {
      runId: "run_1" as Id<"promptRuns">,
      promptId: "prompt_1" as Id<"prompts">,
      promptExcerpt: "How should teams build MCP apps?",
      providerName: "OpenAI",
      startedAt: Date.now(),
      responseSummary: "Use official SDKs and cite implementation examples.",
      position: 1,
    },
  ],
};

function renderSourcesPage(
  props: Partial<ComponentProps<typeof SourcesPage>> = {}
) {
  return render(
    <TooltipProvider>
      <SourcesPage sources={[source]} {...props} />
    </TooltipProvider>
  );
}

describe("SourcesPage", () => {
  it("opens source details from a source row click", async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();

    renderSourcesPage({ onOpenSource });

    await user.click(
      screen.getByLabelText("Open source details for github.com")
    );

    expect(onOpenSource).toHaveBeenCalledWith("github.com");
  });

  it("splits latest response metadata into source columns", () => {
    renderSourcesPage();

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toContain("Most used by");
    expect(headers).toContain("Latest response");
    expect(headers).toContain("Last seen");
    expect(headers).toContain("Rank");

    const row = screen.getByRole("row", {
      name: /github\.com docs 13% 2 82 openai how should teams build mcp apps\? 1m ago #1/i,
    });
    const cells = within(row).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "github.com",
      "Docs",
      "13%",
      "2",
      "82",
      "OpenAI",
      "How should teams build MCP apps?",
      "1m ago",
      "#1",
    ]);
  });
});
