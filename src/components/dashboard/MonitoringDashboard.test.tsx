import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const promptsPageMock = vi.hoisted(() => vi.fn());
const siteHeaderMock = vi.hoisted(() => vi.fn());
const mutationFns = vi.hoisted(() => ({
  ensureProvidersSeeded: vi.fn().mockResolvedValue([]),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  triggerSelectedPromptsNow: vi.fn(),
  retryPromptRun: vi.fn(),
  cancelPromptRun: vi.fn(),
  createTrackedEntity: vi.fn(),
  updateTrackedEntity: vi.fn(),
  deleteTrackedEntity: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: useMutationMock,
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    analytics: {
      ensureProvidersSeeded: "ensureProvidersSeeded",
      listProviders: "listProviders",
      getOverview: "getOverview",
      listPromptResponseAnalytics: "listPromptResponseAnalytics",
      getQueueStatus: "getQueueStatus",
      listPromptRuns: "listPromptRuns",
      listSources: "listSources",
      getPromptAnalysis: "getPromptAnalysis",
      listTrackedEntities: "listTrackedEntities",
      getPromptRun: "getPromptRun",
      createPrompt: "createPrompt",
      updatePrompt: "updatePrompt",
      deletePrompt: "deletePrompt",
      triggerSelectedPromptsNow: "triggerSelectedPromptsNow",
      retryPromptRun: "retryPromptRun",
      cancelPromptRun: "cancelPromptRun",
      createTrackedEntity: "createTrackedEntity",
      updateTrackedEntity: "updateTrackedEntity",
      deleteTrackedEntity: "deleteTrackedEntity",
    },
  },
}));

vi.mock("@/components/ModeToggle", () => ({
  ModeToggle: () => <div>Theme toggle</div>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SidebarHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarRail: () => null,
  SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  SidebarSeparator: () => <hr />,
  useSidebar: () => ({
    state: "expanded",
    toggleSidebar: vi.fn(),
    isMobile: false,
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/layout/SiteHeader", () => ({
  SiteHeader: (props: {
    providerFilter: string;
    providerOptions: Array<{ label: string; value: string }>;
    onProviderFilter: (value: string) => void;
    showProviderFilter?: boolean;
    searchValue?: string;
    onSearchValue?: (value: string) => void;
  }) => {
    siteHeaderMock(props);
    return (
      <div>
        {props.showProviderFilter === false ? null : (
          <>
            <div>{props.providerFilter}</div>
            <div>
              {props.providerOptions.map((option) => option.label).join(",")}
            </div>
            <button onClick={() => props.onProviderFilter("claude")}>
              Set Claude
            </button>
          </>
        )}
        {props.onSearchValue ? (
          <button onClick={() => props.onSearchValue?.("openpeec")}>
            Set Search
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("./PromptsPage", () => ({
  PromptsPage: (props: { rows: Array<{ excerpt: string }> }) => {
    promptsPageMock(props);
    return (
      <div>
        Prompts Surface
        <div>{props.rows.map((row) => row.excerpt).join(",")}</div>
      </div>
    );
  },
}));

vi.mock("./OverviewPage", () => ({
  OverviewPage: () => <div>Overview Surface</div>,
}));

vi.mock("./PromptDetailPage", () => ({
  PromptDetailPage: () => <div>Prompt Detail Surface</div>,
}));

vi.mock("./ResponseDetailPage", () => ({
  ResponseDetailPage: () => <div>Response Detail Surface</div>,
}));

vi.mock("./RunsPage", () => ({
  RunsPage: () => <div>Runs Surface</div>,
}));

vi.mock("./ResponsesPage", () => ({
  ResponsesPage: () => <div>Responses Surface</div>,
}));

vi.mock("./SourcesPage", () => ({
  SourcesPage: () => <div>Sources Surface</div>,
}));

const providers = [
  {
    _id: "provider_openai",
    slug: "openai",
    name: "OpenAI",
    url: "https://chatgpt.com/",
    active: true,
  },
  {
    _id: "provider_claude",
    slug: "claude",
    name: "Claude",
    url: "https://claude.ai/",
    active: true,
  },
];

const promptRows = [
  {
    id: "prompt_1",
    excerpt: "Best AI visibility tools",
    providerCount: 2,
    providerNames: ["OpenAI", "Claude"],
    latestProviderName: "OpenAI",
    latestCitationQuality: 81,
    latestRunAt: Date.now(),
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
  },
];

const overview = {
  kpis: {
    totalRuns: 1,
    totalCitations: 3,
    citationQuality: 81,
    deltaCitationQuality: 4,
    runSuccessRate: 100,
  },
  trendSeries: [],
  providerComparison: [],
  promptComparison: [],
  topSources: [],
  domainTypeBreakdown: [],
  entityLeaderboard: [],
  recentRuns: [
    {
      _id: "run_1",
      promptExcerpt: "Best AI visibility tools",
      providerName: "OpenAI",
      status: "success",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      latencyMs: 1200,
      sourceCount: 3,
      citationCount: 3,
    },
  ],
};

const runRows = [
  {
    _id: "run_1",
    promptId: "prompt_1",
    promptExcerpt: "Best AI visibility tools",
    providerSlug: "openai",
    providerName: "OpenAI",
    status: "success",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    latencyMs: 1200,
    responseSummary: "OpenPeec is cited in the result.",
    citationQualityScore: 81,
    sourceCount: 3,
    citationCount: 3,
  },
];

describe("MonitoringDashboard", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    promptsPageMock.mockReset();
    siteHeaderMock.mockReset();
    Object.values(mutationFns).forEach((fn) => fn.mockClear());

    useMutationMock.mockImplementation((name: keyof typeof mutationFns) => {
      return mutationFns[name];
    });

    useQueryMock.mockImplementation((name: string, args: unknown) => {
      switch (name) {
        case "listProviders":
          return providers;
        case "getOverview":
          return args === "skip" ? undefined : overview;
        case "listPromptResponseAnalytics":
          return args === "skip" ? undefined : promptRows;
        case "getQueueStatus":
          return {
            queuedCount: 0,
            runningCount: 0,
            latestFinishedRun: null,
            latestQueuedRun: null,
          };
        case "listPromptRuns":
          return args === "skip" ? undefined : runRows;
        case "listSources":
          return args === "skip"
            ? undefined
            : { meta: { totalDomains: 1 }, items: [] };
        case "getPromptAnalysis":
          return undefined;
        case "listTrackedEntities":
          return [];
        case "getPromptRun":
          return undefined;
        default:
          return undefined;
      }
    });

    window.history.replaceState({}, "", "/?page=prompts&provider=openai");
  });

  it("loads prompt analytics and omits the groups page", async () => {
    const { MonitoringDashboard } = await import("./MonitoringDashboard");

    render(<MonitoringDashboard />);

    expect(await screen.findByText("Prompts Surface")).toBeTruthy();
    expect(screen.queryByText("Groups")).toBeNull();

    expect(promptsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({ excerpt: "Best AI visibility tools" }),
        ]),
      })
    );

    expect(siteHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showProviderFilter: false,
        providerFilter: "openai",
        providerOptions: expect.arrayContaining([
          expect.objectContaining({ label: "All providers", value: "all" }),
          expect.objectContaining({ label: "OpenAI", value: "openai" }),
        ]),
      })
    );

    await waitFor(() => {
      expect(mutationFns.ensureProvidersSeeded).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain("provider=");
    });
  });

  it("writes the provider filter into URL state instead of model", async () => {
    const user = userEvent.setup();
    const { MonitoringDashboard } = await import("./MonitoringDashboard");

    window.history.replaceState({}, "", "/?page=runs&provider=openai");
    render(<MonitoringDashboard />);

    await user.click(screen.getByRole("button", { name: /set claude/i }));

    await waitFor(() => {
      expect(window.location.search).toContain("provider=claude");
    });
    expect(window.location.search).not.toContain("model=");
  });

  it("routes prompt search through the header", async () => {
    const user = userEvent.setup();
    const { MonitoringDashboard } = await import("./MonitoringDashboard");

    render(<MonitoringDashboard />);

    await user.click(screen.getByRole("button", { name: /set search/i }));

    await waitFor(() => {
      expect(window.location.search).toContain("search=openpeec");
    });
    expect(siteHeaderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchValue: "openpeec",
      })
    );
  });

  it("does not query prompt analysis while showing a prompt run detail", async () => {
    const { MonitoringDashboard } = await import("./MonitoringDashboard");
    window.history.replaceState(
      {},
      "",
      "/?page=prompts&prompt=prompt_missing&run=run_1&context=prompts"
    );

    render(<MonitoringDashboard />);

    expect(await screen.findByText("Response Detail Surface")).toBeTruthy();
    const promptAnalysisCalls = useQueryMock.mock.calls.filter(
      ([name]) => name === "getPromptAnalysis"
    );
    expect(promptAnalysisCalls).toEqual([["getPromptAnalysis", "skip"]]);
  });
});
