import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { PromptsPage } from "./PromptsPage";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (
    <div data-open={open}>{children}</div>
  ),
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

const promptRow = {
  id: "prompt_1" as Id<"prompts">,
  excerpt: "Best AI visibility tools",
  providerCount: 1,
  providerNames: ["OpenAI"],
  latestProviderName: "OpenAI",
  latestCitationQuality: 81,
  latestRunAt: Date.now(),
  latestRunId: "run_1" as Id<"promptRuns">,
  latestStatus: "success",
  latestResponseSummary: "OpenPeec is cited in the result.",
  latestSourceCount: 3,
  responseCount: 3,
  sourceDiversity: 4,
  topSources: ["docs.openpeec.ai"],
  topEntities: ["OpenPeec"],
  responseDrift: 24,
  sourceVariance: 18,
  active: true,
};

describe("PromptsPage", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("queues a prompt from the overflow actions menu using the excerpt label", async () => {
    const user = userEvent.setup();
    const onTriggerSelectedNow = vi.fn().mockResolvedValue({ queuedCount: 1 });

    render(
      <PromptsPage
        rows={[promptRow]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        onCreatePrompt={vi.fn().mockResolvedValue("prompt_2")}
        onUpdatePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={onTriggerSelectedNow}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /actions for best ai visibility tools/i,
      })
    );
    await user.click(screen.getByRole("menuitem", { name: /^run$/i }));

    await waitFor(() => {
      expect(onTriggerSelectedNow).toHaveBeenCalledWith({
        promptIds: ["prompt_1"],
        label: "Best AI visibility tools",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Provider run queued.");
  });

  it("creates a prompt with only text", async () => {
    const user = userEvent.setup();
    const onCreatePrompt = vi.fn().mockResolvedValue("prompt_2");

    render(
      <PromptsPage
        rows={[]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        createOpen
        onCreatePrompt={onCreatePrompt}
        onUpdatePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={vi.fn().mockResolvedValue({ queuedCount: 1 })}
      />
    );

    await user.type(
      screen.getByPlaceholderText(
        /ask about your category, product, or brand visibility/i
      ),
      "How visible is OpenPeec in AI search?"
    );
    await user.click(screen.getByRole("button", { name: /^create prompt$/i }));

    await waitFor(() => {
      expect(onCreatePrompt).toHaveBeenCalledWith({
        promptText: "How visible is OpenPeec in AI search?",
      });
    });
  });
});
