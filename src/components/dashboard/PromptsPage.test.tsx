import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";

import { PromptsPage } from "./PromptsPage";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-open={open}>{children}</div> : null,
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

function renderWithTooltipProvider(children: ReactNode) {
  return render(<TooltipProvider>{children}</TooltipProvider>);
}

const promptRow = {
  id: "prompt_1" as Id<"prompts">,
  excerpt: "Best AI visibility tools",
  latestCitationQuality: 81,
  latestRunAt: Date.now(),
  latestRunId: "run_1" as Id<"promptRuns">,
  latestStatus: "success",
  latestResponseSummary: "OpenPeec is cited in the result.",
  latestSourceCount: 3,
  runCount: 2,
  responseCount: 3,
  sourceDiversity: 4,
  topSources: ["docs.openpeec.ai"],
  topEntities: ["OpenPeec"],
  responseDrift: 24,
  sourceVariance: 18,
  active: true,
};

const providerRows = [
  {
    slug: "openai",
    name: "OpenAI",
    active: true,
  },
  {
    slug: "google-ai-mode",
    name: "Google AI Mode",
    active: true,
  },
];

describe("PromptsPage", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("queues a Camoufox prompt run from the overflow actions menu", async () => {
    const user = userEvent.setup();
    const onSelectPrompt = vi.fn();
    const onTriggerSelectedNow = vi.fn().mockResolvedValue({ queuedCount: 1 });

    renderWithTooltipProvider(
      <PromptsPage
        rows={[promptRow]}
        providers={providerRows}
        selectedPromptId={null}
        onSelectPrompt={onSelectPrompt}
        onCreatePrompt={vi.fn().mockResolvedValue("prompt_2")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={onTriggerSelectedNow}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /actions for best ai visibility tools/i,
      })
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: /^run$/i,
      })
    );

    await waitFor(() => {
      expect(onTriggerSelectedNow).toHaveBeenCalledWith({
        promptIds: ["prompt_1"],
        label: "Best AI visibility tools",
        browserEngine: "camoufox",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Run queued.");
    expect(onSelectPrompt).not.toHaveBeenCalled();
  });

  it("queues advanced provider and engine selections in parallel", async () => {
    const user = userEvent.setup();
    const onTriggerSelectedNow = vi.fn().mockResolvedValue({ queuedCount: 1 });

    renderWithTooltipProvider(
      <PromptsPage
        rows={[promptRow]}
        providers={providerRows}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        onCreatePrompt={vi.fn().mockResolvedValue("prompt_2")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={onTriggerSelectedNow}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /actions for best ai visibility tools/i,
      })
    );
    await user.click(screen.getByRole("menuitem", { name: /^advanced$/i }));
    await user.click(screen.getByRole("checkbox", { name: /google ai mode/i }));
    await user.click(screen.getByRole("checkbox", { name: /^nodriver$/i }));
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(onTriggerSelectedNow).toHaveBeenCalledTimes(2);
    });
    expect(onTriggerSelectedNow).toHaveBeenNthCalledWith(1, {
      promptIds: ["prompt_1"],
      label: "Best AI visibility tools",
      browserEngine: "camoufox",
      providerSlugs: ["openai"],
    });
    expect(onTriggerSelectedNow).toHaveBeenNthCalledWith(2, {
      promptIds: ["prompt_1"],
      label: "Best AI visibility tools",
      browserEngine: "nodriver",
      providerSlugs: ["openai"],
    });
    expect(toast.success).toHaveBeenCalledWith("Queued 2 runs.");
  });

  it("opens prompt detail from full row click and keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelectPrompt = vi.fn();

    renderWithTooltipProvider(
      <PromptsPage
        rows={[promptRow]}
        providers={providerRows}
        selectedPromptId={null}
        onSelectPrompt={onSelectPrompt}
        onCreatePrompt={vi.fn().mockResolvedValue("prompt_2")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={vi.fn().mockResolvedValue({ queuedCount: 1 })}
      />
    );

    const row = screen.getByRole("row", {
      name: /open prompt details for best ai visibility tools/i,
    });

    await user.click(row);
    expect(onSelectPrompt).toHaveBeenLastCalledWith("prompt_1");

    onSelectPrompt.mockClear();
    row.focus();
    await user.keyboard("{Enter}");
    expect(onSelectPrompt).toHaveBeenLastCalledWith("prompt_1");

    onSelectPrompt.mockClear();
    await user.keyboard(" ");
    expect(onSelectPrompt).toHaveBeenLastCalledWith("prompt_1");
  });

  it("renders prompts as atomic data-table rows without provider or latest-run details", () => {
    renderWithTooltipProvider(
      <PromptsPage
        rows={[promptRow]}
        providers={providerRows}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        onCreatePrompt={vi.fn().mockResolvedValue("prompt_2")}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={vi.fn().mockResolvedValue({ queuedCount: 1 })}
      />
    );

    expect(screen.getByRole("columnheader", { name: /runs/i })).toBeTruthy();
    expect(screen.getByText("Best AI visibility tools")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "2" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();

    expect(
      screen.queryByRole("columnheader", { name: "Providers" })
    ).toBeNull();
    expect(screen.queryByText("OpenAI")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Prompts" })).toBeNull();
    expect(screen.queryByText("Latest")).toBeNull();
    expect(screen.queryByText("OpenPeec is cited in the result.")).toBeNull();
    expect(screen.queryByText("Success")).toBeNull();
  });

  it("creates a prompt with only text", async () => {
    const user = userEvent.setup();
    const onCreatePrompt = vi.fn().mockResolvedValue("prompt_2");

    renderWithTooltipProvider(
      <PromptsPage
        rows={[]}
        providers={providerRows}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        createOpen
        onCreatePrompt={onCreatePrompt}
        onDeletePrompt={vi.fn().mockResolvedValue("prompt_1")}
        onTriggerSelectedNow={vi.fn().mockResolvedValue({ queuedCount: 1 })}
      />
    );

    await user.type(
      screen.getByPlaceholderText(
        /ask about your brand, product, or category/i
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
