import { render, screen } from "@testing-library/react";
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
      <SourcesPage
        sources={[source]}
        entities={[]}
        newEntityName=""
        onNewEntityName={vi.fn()}
        newEntityKind="brand"
        onNewEntityKind={vi.fn()}
        newEntityDomain=""
        onNewEntityDomain={vi.fn()}
        onCreateEntity={vi.fn().mockResolvedValue("entity_1")}
        onUpdateEntity={vi.fn().mockResolvedValue("entity_1")}
        onDeleteEntity={vi.fn().mockResolvedValue("entity_1")}
        {...props}
      />
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
});
