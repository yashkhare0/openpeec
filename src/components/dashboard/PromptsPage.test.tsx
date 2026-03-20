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

const promptRow = {
  id: "prompt_1" as Id<"prompts">,
  name: "Best AI visibility tools",
  group: "Acquisition",
  model: "gpt-5",
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

const promptGroups = [
  { _id: "group_1" as Id<"promptGroups">, name: "Acquisition" },
];

describe("PromptsPage", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("queues a prompt from the overflow actions menu", async () => {
    const user = userEvent.setup();
    const onTriggerSelectedNow = vi.fn().mockResolvedValue({ queuedCount: 1 });

    render(
      <PromptsPage
        groups={promptGroups}
        selectedGroup="all"
        onSelectGroup={vi.fn()}
        rows={[promptRow]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        search=""
        onSearch={vi.fn()}
        onCreateGroup={vi.fn().mockResolvedValue("group_2")}
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
    expect(toast.success).toHaveBeenCalledWith("Prompt queued.");
  });

  it("queues a prompt when the ChatGPT session is ready", async () => {
    const user = userEvent.setup();
    const onTriggerSelectedNow = vi.fn().mockResolvedValue({ queuedCount: 1 });

    render(
      <PromptsPage
        groups={promptGroups}
        selectedGroup="all"
        onSelectGroup={vi.fn()}
        rows={[promptRow]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
        search=""
        onSearch={vi.fn()}
        onCreateGroup={vi.fn().mockResolvedValue("group_2")}
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
    expect(toast.success).toHaveBeenCalledWith("Prompt queued.");
  });
});
