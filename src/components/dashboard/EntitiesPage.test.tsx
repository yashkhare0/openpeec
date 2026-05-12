import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { EntitiesPage } from "./EntitiesPage";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const entity = {
  _id: "entity_1" as Id<"trackedEntities">,
  name: "OpenPeec",
  slug: "openpeec",
  kind: "brand" as const,
  aliases: ["Open Peec"],
  ownedDomains: ["openpeec.ai"],
  active: true,
  promptCount: 8,
  draftPromptCount: 3,
  promptGroupCount: 2,
  runCount: 4,
  responseCount: 6,
  mentionedResponseCount: 3,
  mentionCount: 9,
  citationCount: 5,
  ownedCitationCount: 4,
  latestRunAt: Date.now(),
  averageVisibility: 74,
  averageCitationQuality: 82,
  latestGeneration: {
    id: "generation_1" as Id<"entityPromptGenerationRuns">,
    status: "success" as const,
    queuedAt: Date.now(),
    generatedGroupCount: 2,
    generatedPromptCount: 8,
  },
};

function defaultProps() {
  return {
    data: {
      meta: {
        entityCount: 1,
        activeEntityCount: 1,
        competitorCount: 0,
        promptCount: 8,
        draftPromptCount: 3,
        mentionCount: 9,
        citationCount: 5,
      },
      entities: [entity],
      recentMentions: [
        {
          promptRunId: "run_1" as Id<"promptRuns">,
          entityId: "entity_1" as Id<"trackedEntities">,
          name: "OpenPeec",
          slug: "openpeec",
          kind: "brand" as const,
          mentionCount: 2,
          citationCount: 1,
          ownedCitationCount: 1,
          sentiment: "positive" as const,
          detectionSource: "codex" as const,
          confidence: 0.91,
          evidence: "OpenPeec is cited for AI visibility monitoring.",
          matchedTerms: ["OpenPeec"],
          promptId: "prompt_1" as Id<"prompts">,
          promptExcerpt: "Best AI visibility tools",
          providerName: "OpenAI",
          startedAt: Date.now(),
        },
      ],
    },
    searchValue: "",
    onCreateEntity: vi.fn().mockResolvedValue({
      entityId: "entity_2",
      generationId: "generation_2",
    }),
    onUpdateEntity: vi.fn().mockResolvedValue("entity_1"),
    onDeleteEntity: vi.fn().mockResolvedValue("entity_1"),
    onQueueEntityPromptGeneration: vi.fn().mockResolvedValue("generation_3"),
    onTriggerEntityPromptsNow: vi.fn().mockResolvedValue({ queuedCount: 2 }),
    onOpenPromptsForEntity: vi.fn(),
    onOpenRun: vi.fn(),
  };
}

describe("EntitiesPage", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("renders tracked entity and mention tables", () => {
    render(<EntitiesPage {...defaultProps()} />);

    expect(screen.getByRole("heading", { name: "Entities" })).toBeTruthy();
    expect(screen.getAllByText("OpenPeec").length).toBeGreaterThan(1);
    expect(screen.getAllByText("2 groups, 8 prompts").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("Best AI visibility tools")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();
  });

  it("creates an entity and queues Codex prompt curation", async () => {
    const user = userEvent.setup();
    const props = defaultProps();

    render(<EntitiesPage {...props} />);

    await user.click(screen.getByRole("button", { name: /new entity/i }));
    await user.type(screen.getByLabelText(/entity name/i), "Acme Analytics");
    await user.type(
      screen.getByLabelText(/website \/ owned domains/i),
      "https://acme.test"
    );
    await user.type(screen.getByLabelText(/known aliases/i), "Acme AI");
    await user.type(
      screen.getByLabelText(/research notes/i),
      "Enterprise analytics platform"
    );
    await user.click(
      screen.getByRole("button", { name: /create and curate/i })
    );

    await waitFor(() => {
      expect(props.onCreateEntity).toHaveBeenCalledWith({
        name: "Acme Analytics",
        kind: "brand",
        aliases: ["Acme AI"],
        ownedDomains: ["https://acme.test"],
        websiteUrl: "https://acme.test",
        researchSummary: "Enterprise analytics platform",
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Entity created. Codex curation queued.",
      expect.any(Object)
    );
  });
});
