import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import { SourceDetailPage } from "./SourceDetailPage";

const source = {
  domain: "github.com",
  type: "docs",
  citations: 3,
  responseCount: 1,
  promptCount: 1,
  usedShare: 13,
  avgCitationsPerRun: 0.4,
  avgQualityScore: 100,
  avgPosition: 9.7,
  ownedShare: 0,
  promptExcerpts: ["How to build mcp-ui applications quickly?"],
  latestResponses: [
    {
      runId: "run_1" as Id<"promptRuns">,
      promptId: "prompt_1" as Id<"prompts">,
      promptExcerpt: "How to build mcp-ui applications quickly?",
      providerName: "Google AI Mode",
      startedAt: Date.now(),
      responseSummary: "To build MCP-UI applications quickly...",
      position: 3,
    },
  ],
  mentionedEntities: [],
};

describe("SourceDetailPage", () => {
  it("keeps source context focused on data tables", () => {
    render(<SourceDetailPage source={source} onOpenRun={vi.fn()} />);

    const sourceLink = screen.getByRole("link", { name: /github\.com/i });
    expect(sourceLink.getAttribute("href")).toBe("https://github.com");
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.queryByText("Visit domain")).toBeNull();
    expect(screen.queryByText(/citation share/i)).toBeNull();
    expect(
      screen.queryByText("To build MCP-UI applications quickly...")
    ).toBeNull();
    expect(screen.queryByText(/ago$/i)).toBeNull();
    expect(screen.getByText("Responses citing this source")).toBeTruthy();
    expect(screen.getByText("Prompts citing this source")).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toContain("Responses");
    expect(screen.queryByText("No entity mentions captured.")).toBeNull();
    expect(screen.queryByText("Entities")).toBeNull();
  });
});
