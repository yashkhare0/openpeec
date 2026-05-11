import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const promptsPageMock = vi.hoisted(() => vi.fn());
const runsPageMock = vi.hoisted(() => vi.fn());
const sourcesPageMock = vi.hoisted(() => vi.fn());
const sourceDetailPageMock = vi.hoisted(() => vi.fn());
const siteHeaderMock = vi.hoisted(() => vi.fn());
const mutationFns = vi.hoisted(() => ({
  ensureProvidersSeeded: vi.fn().mockResolvedValue([]),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  triggerSelectedPromptsNow: vi.fn(),
  retryPromptRun: vi.fn(),
  cancelPromptRun: vi.fn(),
  deletePromptRun: vi.fn(),
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
      listRunGroups: "listRunGroups",
      listSources: "listSources",
      getPromptAnalysis: "getPromptAnalysis",
      listTrackedEntities: "listTrackedEntities",
      getPromptRun: "getPromptRun",
      getRunGroup: "getRunGroup",
      createPrompt: "createPrompt",
      updatePrompt: "updatePrompt",
      deletePrompt: "deletePrompt",
      triggerSelectedPromptsNow: "triggerSelectedPromptsNow",
      retryPromptRun: "retryPromptRun",
      cancelPromptRun: "cancelPromptRun",
      deletePromptRun: "deletePromptRun",
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
    searchValue?: string;
    onSearchValue?: (value: string) => void;
    searchPlaceholder?: string;
    searchLabel?: string;
    action?: ReactNode;
  }) => {
    siteHeaderMock(props);
    return (
      <div>
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
  RunsPage: (props: { searchValue: string; statusFilters: string[] }) => {
    runsPageMock(props);
    return <div>Runs Surface</div>;
  },
}));

vi.mock("./ResponsesPage", () => ({
  ResponsesPage: () => <div>Responses Surface</div>,
}));

vi.mock("./SourcesPage", () => ({
  SourcesPage: (props: { onOpenSource?: (domain: string) => void }) => {
    sourcesPageMock(props);
    return (
      <div>
        Sources Surface
        <button onClick={() => props.onOpenSource?.("github.com")}>
          Open GitHub source
        </button>
      </div>
    );
  },
  TrackedEntitiesSheet: () => null,
}));

vi.mock("./SourceDetailPage", () => ({
  SourceDetailPage: (props: { source?: { domain: string } }) => {
    sourceDetailPageMock(props);
    return <div>Source Detail Surface {props.source?.domain}</div>;
  },
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
    latestCitationQuality: 81,
    latestRunAt: Date.now(),
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

const sourceRows = [
  {
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
    latestResponses: [],
  },
];

describe("MonitoringDashboard", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    promptsPageMock.mockReset();
    runsPageMock.mockReset();
    sourcesPageMock.mockReset();
    sourceDetailPageMock.mockReset();
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
        case "listRunGroups":
          return args === "skip" ? undefined : [];
        case "listSources":
          return args === "skip"
            ? undefined
            : { meta: { totalDomains: 1 }, items: sourceRows };
        case "getPromptAnalysis":
          return undefined;
        case "listTrackedEntities":
          return [];
        case "getPromptRun":
          return undefined;
        case "getRunGroup":
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
        searchValue: "",
      })
    );
    const promptAnalyticsCall = useQueryMock.mock.calls.find(
      ([name]) => name === "listPromptResponseAnalytics"
    );
    expect(promptAnalyticsCall?.[1]).toEqual({});

    await waitFor(() => {
      expect(mutationFns.ensureProvidersSeeded).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain("provider=");
    });
  });

  it("strips removed global filter params from URL state", async () => {
    const { MonitoringDashboard } = await import("./MonitoringDashboard");

    window.history.replaceState({}, "", "/?page=runs&provider=openai&range=30");
    render(<MonitoringDashboard />);

    await waitFor(() => {
      expect(window.location.search).not.toContain("provider=");
    });
    expect(window.location.search).not.toContain("range=");

    expect(
      useQueryMock.mock.calls.some(
        ([name, args]) =>
          name === "listRunGroups" &&
          JSON.stringify(args) === JSON.stringify({ limit: 200 })
      )
    ).toBe(true);
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

  it("routes runs search and status filters through the header", async () => {
    const { MonitoringDashboard } = await import("./MonitoringDashboard");
    window.history.replaceState(
      {},
      "",
      "/?page=runs&search=blocked&status=blocked"
    );

    render(<MonitoringDashboard />);

    expect(await screen.findByText("Runs Surface")).toBeTruthy();
    expect(siteHeaderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchValue: "blocked",
        searchPlaceholder: "Search runs...",
        searchLabel: "Search runs",
        action: expect.anything(),
      })
    );
    expect(runsPageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchValue: "blocked",
        statusFilters: ["blocked"],
      })
    );

    expect(window.location.search).toContain("status=blocked");
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

  it("opens source details from the sources list", async () => {
    const user = userEvent.setup();
    const { MonitoringDashboard } = await import("./MonitoringDashboard");
    window.history.replaceState({}, "", "/?page=sources");

    render(<MonitoringDashboard />);

    await user.click(
      await screen.findByRole("button", { name: /open github source/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/source detail surface github.com/i)
      ).toBeTruthy();
    });
    expect(sourceDetailPageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ domain: "github.com" }),
      })
    );
    expect(window.location.search).toContain("page=sources");
    expect(window.location.search).toContain("source=github.com");
  });
});
