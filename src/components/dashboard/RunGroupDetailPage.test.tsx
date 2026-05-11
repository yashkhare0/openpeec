import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
import { RunGroupDetailPage } from "./RunGroupDetailPage";

type RunGroupDetail = NonNullable<
  ComponentProps<typeof RunGroupDetailPage>["runGroupDetail"]
>;

function renderRunGroupDetail(
  runGroupDetail: RunGroupDetail,
  props: Partial<
    Omit<ComponentProps<typeof RunGroupDetailPage>, "runGroupDetail">
  > = {}
) {
  return render(
    <TooltipProvider>
      <RunGroupDetailPage runGroupDetail={runGroupDetail} {...props} />
    </TooltipProvider>
  );
}

function findAnswerParagraph(content: string) {
  return screen.getByText((_, element) => {
    return element?.tagName === "P" && element.textContent === content;
  });
}

describe("RunGroupDetailPage", () => {
  it("expands long provider answers in place", async () => {
    const user = userEvent.setup();
    const longAnswer = Array.from(
      { length: 36 },
      (_, index) =>
        `Segment ${index + 1}: OpenPeec tracks source coverage and response quality across provider runs.`
    ).join(" ");

    renderRunGroupDetail({
      group: {
        id: "group_1",
        promptId: "prompt_1" as Id<"prompts">,
        promptExcerpt: "How should marketers monitor AI visibility?",
        queuedAt: Date.now() - 90_000,
        startedAt: Date.now() - 60_000,
        finishedAt: Date.now(),
        status: "success",
        providerCount: 1,
        sourceCount: 0,
        citationCount: 0,
      },
      prompt: {
        _id: "prompt_1" as Id<"prompts">,
        excerpt: "How should marketers monitor AI visibility?",
        promptText: "How should marketers monitor AI visibility?",
      },
      runs: [
        {
          _id: "run_1" as Id<"promptRuns">,
          providerSlug: "openai",
          providerName: "OpenAI",
          providerUrl: "https://chatgpt.com",
          channelName: "ChatGPT web",
          sessionMode: "stored",
          browserEngine: "camoufox",
          status: "success",
          startedAt: Date.now() - 60_000,
          finishedAt: Date.now(),
          responseText: longAnswer,
          sourceCount: 0,
          citations: [],
          mentions: [],
        },
      ],
    });

    expect(screen.getByRole("tab", { name: "OpenAI" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /success/i })).toBeNull();
    const providerResponsesCard = screen
      .getByText("Provider responses")
      .closest("[data-slot='card']");
    expect(providerResponsesCard).toBeTruthy();
    expect(
      within(providerResponsesCard as HTMLElement).queryByText("Success")
    ).toBeNull();
    expect(
      within(providerResponsesCard as HTMLElement).queryByText("0 sources")
    ).toBeNull();
    expect(screen.getAllByText(longAnswer)).toHaveLength(1);

    const collapsedAnswer = findAnswerParagraph(longAnswer);
    expect(collapsedAnswer.classList.contains("line-clamp-8")).toBe(true);

    const toggle = screen.getByRole("button", { name: /show full answer/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);

    const expandedAnswer = findAnswerParagraph(longAnswer);
    expect(expandedAnswer.classList.contains("line-clamp-8")).toBe(false);
    expect(screen.getAllByText(longAnswer)).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: /show less/i })
        .getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("opens the selected provider response from the card header", async () => {
    const user = userEvent.setup();
    const onOpenRun = vi.fn();

    renderRunGroupDetail(
      {
        group: {
          id: "group_1",
          promptId: "prompt_1" as Id<"prompts">,
          promptExcerpt: "How should marketers monitor AI visibility?",
          queuedAt: Date.now() - 90_000,
          startedAt: Date.now() - 60_000,
          finishedAt: Date.now(),
          status: "success",
          providerCount: 2,
          sourceCount: 1,
          citationCount: 1,
        },
        prompt: {
          _id: "prompt_1" as Id<"prompts">,
          excerpt: "How should marketers monitor AI visibility?",
          promptText: "How should marketers monitor AI visibility?",
        },
        runs: [
          {
            _id: "run_openai" as Id<"promptRuns">,
            providerSlug: "openai",
            providerName: "OpenAI",
            providerUrl: "https://chatgpt.com",
            channelName: "ChatGPT web",
            sessionMode: "stored",
            browserEngine: "camoufox",
            status: "success",
            startedAt: Date.now() - 60_000,
            finishedAt: Date.now(),
            responseText: "OpenAI response",
            sourceCount: 0,
            citations: [],
            mentions: [],
          },
          {
            _id: "run_mistral" as Id<"promptRuns">,
            providerSlug: "mistral",
            providerName: "Mistral Le Chat",
            providerUrl: "https://chat.mistral.ai",
            channelName: "Mistral web",
            sessionMode: "stored",
            browserEngine: "camoufox",
            status: "success",
            startedAt: Date.now() - 58_000,
            finishedAt: Date.now(),
            responseText: "Mistral response",
            sourceCount: 1,
            citations: [
              {
                domain: "example.com",
                url: "https://example.com",
                title: "Example",
                position: 1,
              },
            ],
            mentions: [],
          },
        ],
      },
      { onOpenRun }
    );

    await user.click(
      screen.getByRole("button", { name: "Open OpenAI response" })
    );
    expect(onOpenRun).toHaveBeenLastCalledWith("run_openai");

    await user.click(screen.getByRole("tab", { name: "Mistral Le Chat" }));
    await user.click(
      screen.getByRole("button", { name: "Open Mistral Le Chat response" })
    );
    expect(onOpenRun).toHaveBeenLastCalledWith("run_mistral");
  });
});
