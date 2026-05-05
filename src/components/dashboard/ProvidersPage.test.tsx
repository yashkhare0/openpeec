import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ProvidersPage } from "./ProvidersPage";

type ProvidersPageProps = ComponentProps<typeof ProvidersPage>;

const providers: ProvidersPageProps["providers"] = [
  {
    _id: "provider_google_ai_mode" as Id<"providers">,
    slug: "google-ai-mode",
    name: "Google AI Mode",
    url: "https://www.google.com/search",
    channelSlug: "google-ai-mode-web",
    channelName: "Google AI Mode web",
    promptQueryParam: "q",
    submitStrategy: "deeplink",
    active: true,
  },
  {
    _id: "provider_openai" as Id<"providers">,
    slug: "openai",
    name: "OpenAI",
    url: "https://chatgpt.com",
    channelSlug: "openai-chatgpt-web",
    channelName: "ChatGPT web",
    sessionMode: "stored",
    sessionProfileDir: "runner/profiles/chatgpt",
    submitStrategy: "deeplink",
    active: true,
  },
  {
    _id: "provider_claude" as Id<"providers">,
    slug: "claude",
    name: "Claude",
    url: "https://claude.ai",
    channelSlug: "claude-web",
    channelName: "Claude web",
    active: false,
  },
];

function renderProvidersPage(props: Partial<ProvidersPageProps> = {}) {
  return render(
    <TooltipProvider>
      <ProvidersPage
        providers={providers}
        onUpdateProvider={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe("ProvidersPage", () => {
  it("keeps secondary provider details out of the table and on tooltip triggers", async () => {
    const user = userEvent.setup();

    renderProvidersPage();

    expect(screen.queryByText("google-ai-mode-web")).toBeNull();
    expect(screen.queryByText("Deep link")).toBeNull();
    expect(screen.queryByText("Runner pending")).toBeNull();
    expect(screen.queryByText("Not supported")).toBeNull();

    const unavailable = screen.getByText("Unavailable");
    await user.hover(unavailable);
    expect(
      (await screen.findAllByText("Runner pending")).length
    ).toBeGreaterThan(0);
    await user.unhover(unavailable);

    expect(
      screen.getAllByRole("button", { name: "Ready: Deep link" }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Guest: Not supported" }).length
    ).toBeGreaterThan(0);
  });
});
