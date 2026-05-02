import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { StatusBanner } from "./components/StatusBanner";
import { OverviewPage } from "./OverviewPage";
import { PromptDetailPage } from "./PromptDetailPage";
import { PromptsPage } from "./PromptsPage";
import { ProvidersPage } from "./ProvidersPage";
import { ResponseDetailPage } from "./ResponseDetailPage";
import { ResponsesPage } from "./ResponsesPage";
import { RunsPage } from "./RunsPage";
import { SourcesPage } from "./SourcesPage";

type PageKey =
  | "overview"
  | "prompts"
  | "providers"
  | "runs"
  | "responses"
  | "sources";
type Tone = "positive" | "negative" | "neutral";
type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";
type RunDetailContext = "prompts" | "runs" | "responses" | null;

const DASHBOARD_PAGES: PageKey[] = [
  "overview",
  "prompts",
  "providers",
  "runs",
  "responses",
  "sources",
];

function isPageKey(value: string | null): value is PageKey {
  return value !== null && DASHBOARD_PAGES.includes(value as PageKey);
}

function parseDashboardUrlState(): {
  page: PageKey;
  rangeDays: number;
  providerFilter: string;
  promptSearch: string;
  selectedPromptId: Id<"prompts"> | null;
  selectedRunId: Id<"promptRuns"> | null;
  runDetailContext: RunDetailContext;
} {
  const params = new URLSearchParams(window.location.search);
  const rangeValue = Number(params.get("range"));
  const pageValue = params.get("page");
  const contextValue = params.get("context");

  return {
    page: isPageKey(pageValue) ? pageValue : "overview",
    rangeDays: Number.isFinite(rangeValue) && rangeValue > 0 ? rangeValue : 7,
    providerFilter: params.get("provider")?.trim() || "all",
    promptSearch: params.get("search")?.trim() || "",
    selectedPromptId:
      (params.get("prompt")?.trim() as Id<"prompts"> | null) ?? null,
    selectedRunId:
      (params.get("run")?.trim() as Id<"promptRuns"> | null) ?? null,
    runDetailContext: (contextValue === "prompts" ||
    contextValue === "runs" ||
    contextValue === "responses"
      ? contextValue
      : null) as RunDetailContext,
  };
}

function writeDashboardUrlState(state: {
  page: PageKey;
  rangeDays: number;
  providerFilter: string;
  promptSearch: string;
  selectedPromptId: Id<"prompts"> | null;
  selectedRunId: Id<"promptRuns"> | null;
  runDetailContext: RunDetailContext;
}) {
  const params = new URLSearchParams();
  if (state.page !== "overview") {
    params.set("page", state.page);
  }
  if (state.rangeDays !== 7) {
    params.set("range", String(state.rangeDays));
  }
  if (state.page !== "prompts" && state.providerFilter !== "all") {
    params.set("provider", state.providerFilter);
  }
  if (state.promptSearch) {
    params.set("search", state.promptSearch);
  }
  if (state.selectedPromptId) {
    params.set("prompt", String(state.selectedPromptId));
  }
  if (state.selectedRunId) {
    params.set("run", String(state.selectedRunId));
  }
  if (state.runDetailContext) {
    params.set("context", state.runDetailContext);
  }

  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", nextUrl);
  }
}

export function MonitoringDashboard() {
  const initialUrlState = useMemo(() => parseDashboardUrlState(), []);
  const [page, setPage] = useState<PageKey>(initialUrlState.page);
  const [rangeDays, setRangeDays] = useState(initialUrlState.rangeDays);
  const [providerFilter, setProviderFilter] = useState(
    initialUrlState.providerFilter
  );
  const [promptSearch, setPromptSearch] = useState(
    initialUrlState.promptSearch
  );
  const [promptCreateOpen, setPromptCreateOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] =
    useState<Id<"prompts"> | null>(initialUrlState.selectedPromptId);
  const [selectedRunId, setSelectedRunId] = useState<Id<"promptRuns"> | null>(
    initialUrlState.selectedRunId
  );
  const [runDetailContext, setRunDetailContext] = useState<RunDetailContext>(
    initialUrlState.runDetailContext
  );
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityKind, setNewEntityKind] = useState<TrackedKind>("brand");
  const [newEntityDomain, setNewEntityDomain] = useState("");
  const search = useDeferredValue(promptSearch.trim().toLowerCase());

  const promptView =
    page === "prompts"
      ? selectedRunId && runDetailContext === "prompts"
        ? "response"
        : selectedPromptId
          ? "prompt"
          : "list"
      : "list";
  const isOverviewPage = page === "overview";
  const isPromptsPage = page === "prompts";
  const isProvidersPage = page === "providers";
  const isRunsPage = page === "runs";
  const isResponsesPage = page === "responses";
  const isSourcesPage = page === "sources";
  const showingRunDetailForRuns =
    page === "runs" && runDetailContext === "runs" && selectedRunId !== null;
  const showingRunDetailForResponses =
    page === "responses" &&
    runDetailContext === "responses" &&
    selectedRunId !== null;
  const showingRunDetail =
    (isPromptsPage && promptView === "response") ||
    showingRunDetailForRuns ||
    showingRunDetailForResponses;
  const shouldLoadPromptAnalytics = isPromptsPage && promptView === "list";
  const shouldLoadRunsList =
    isOverviewPage ||
    (isRunsPage && !showingRunDetailForRuns) ||
    (isResponsesPage && !showingRunDetailForResponses);
  const provider =
    providerFilter === "all" || isPromptsPage ? undefined : providerFilter;

  const ensureProvidersSeeded = useMutation(
    api.analytics.ensureProvidersSeeded
  );
  const updateProvider = useMutation(api.analytics.updateProvider);
  const createPrompt = useMutation(api.analytics.createPrompt);
  const updatePrompt = useMutation(api.analytics.updatePrompt);
  const deletePrompt = useMutation(api.analytics.deletePrompt);
  const triggerSelectedPromptsNow = useMutation(
    api.analytics.triggerSelectedPromptsNow
  );
  const retryPromptRun = useMutation(api.analytics.retryPromptRun);
  const cancelPromptRun = useMutation(api.analytics.cancelPromptRun);
  const createTrackedEntity = useMutation(api.analytics.createTrackedEntity);
  const updateTrackedEntity = useMutation(api.analytics.updateTrackedEntity);
  const deleteTrackedEntity = useMutation(api.analytics.deleteTrackedEntity);

  useEffect(() => {
    void ensureProvidersSeeded({}).catch(() => {
      // Ignore seed races during first render; the providers query will settle.
    });
  }, [ensureProvidersSeeded]);

  const overview = useQuery(
    api.analytics.getOverview,
    isOverviewPage ? { rangeDays, provider } : "skip"
  );
  const providers = useQuery(api.analytics.listProviders, {});
  const promptAnalytics = useQuery(
    api.analytics.listPromptResponseAnalytics,
    shouldLoadPromptAnalytics ? { provider, rangeDays } : "skip"
  );
  const queueStatus = useQuery(api.analytics.getQueueStatus, {});
  const runs = useQuery(
    api.analytics.listPromptRuns,
    shouldLoadRunsList
      ? {
          limit: isOverviewPage ? 4 : 200,
          provider,
        }
      : "skip"
  );
  const sources = useQuery(
    api.analytics.listSources,
    isOverviewPage || isSourcesPage
      ? {
          rangeDays,
          provider,
          limit: isOverviewPage ? 8 : 80,
        }
      : "skip"
  );
  const promptAnalysis = useQuery(
    api.analytics.getPromptAnalysis,
    promptView === "prompt" && selectedPromptId
      ? { promptId: selectedPromptId, provider, rangeDays }
      : "skip"
  );
  const entities = useQuery(
    api.analytics.listTrackedEntities,
    isSourcesPage ? {} : "skip"
  );
  const runDetail = useQuery(
    api.analytics.getPromptRun,
    selectedRunId ? { id: selectedRunId } : "skip"
  );

  const overviewLoading =
    isOverviewPage &&
    (overview === undefined || sources === undefined || runs === undefined);
  const promptsPageLoading =
    isPromptsPage &&
    promptView === "list" &&
    (providers === undefined || promptAnalytics === undefined);
  const providersPageLoading = isProvidersPage && providers === undefined;
  const runsPageLoading = isRunsPage && runs === undefined;
  const responsesPageLoading = isResponsesPage && runs === undefined;
  const sourcesPageLoading =
    isSourcesPage && (sources === undefined || entities === undefined);
  const promptDetailLoading =
    promptView === "prompt" &&
    selectedPromptId !== null &&
    promptAnalysis === undefined;
  const runDetailLoading = selectedRunId !== null && runDetail === undefined;
  const pageLoading =
    overviewLoading ||
    promptsPageLoading ||
    providersPageLoading ||
    runsPageLoading ||
    responsesPageLoading ||
    sourcesPageLoading ||
    promptDetailLoading ||
    runDetailLoading;
  const hasData = !!overview && overview.kpis.totalRuns > 0;

  const promptRows = useMemo(
    () =>
      (promptAnalytics ?? []).filter((row) =>
        !search
          ? true
          : `${row.excerpt} ${(row.providerNames ?? []).join(" ")} ${row.latestProviderName ?? ""} ${row.latestResponseSummary ?? ""} ${(row.topEntities ?? []).join(" ")} ${(row.topSources ?? []).join(" ")}`
              .toLowerCase()
              .includes(search)
      ),
    [promptAnalytics, search]
  );

  const providerOptions = useMemo(
    () => [
      { label: "All providers", value: "all" },
      ...((providers ?? [])
        .filter((item) => item.active)
        .map((item) => ({
          label: item.name,
          value: item.slug,
        })) ?? []),
    ],
    [providers]
  );

  useEffect(() => {
    const validProviders = new Set(
      providerOptions.map((option) => option.value)
    );
    if (!validProviders.has(providerFilter)) {
      setProviderFilter("all");
    }
  }, [providerFilter, providerOptions]);

  useEffect(() => {
    const handlePopState = () => {
      const next = parseDashboardUrlState();
      setPage(next.page);
      setRangeDays(next.rangeDays);
      setProviderFilter(next.providerFilter);
      setPromptSearch(next.promptSearch);
      setSelectedPromptId(next.selectedPromptId);
      setSelectedRunId(next.selectedRunId);
      setRunDetailContext(next.runDetailContext);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    writeDashboardUrlState({
      page,
      rangeDays,
      providerFilter,
      promptSearch,
      selectedPromptId,
      selectedRunId,
      runDetailContext,
    });
  }, [
    page,
    promptSearch,
    providerFilter,
    rangeDays,
    runDetailContext,
    selectedPromptId,
    selectedRunId,
  ]);

  useEffect(() => {
    if (promptView !== "list") {
      return;
    }

    if (!promptRows.length) {
      setSelectedPromptId(null);
      if (runDetailContext === "prompts") {
        setSelectedRunId(null);
        setRunDetailContext(null);
      }
      return;
    }

    if (
      selectedPromptId &&
      promptRows.some((row) => row.id === selectedPromptId)
    ) {
      return;
    }

    setSelectedPromptId(null);
    if (runDetailContext === "prompts") {
      setSelectedRunId(null);
      setRunDetailContext(null);
    }
  }, [promptRows, promptView, runDetailContext, selectedPromptId]);

  const queueStatusHydratedRef = useRef(false);
  const lastFinishedRunIdRef = useRef<Id<"promptRuns"> | null>(null);
  const previousActiveQueueCountRef = useRef(0);
  const queueToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!queueStatus) {
      return;
    }

    const activeQueueCount = queueStatus.queuedCount + queueStatus.runningCount;
    const latestFinishedRunId = queueStatus.latestFinishedRun?.id ?? null;
    if (!queueStatusHydratedRef.current) {
      queueStatusHydratedRef.current = true;
      lastFinishedRunIdRef.current = latestFinishedRunId;
      previousActiveQueueCountRef.current = activeQueueCount;
      return;
    }

    if (activeQueueCount > 0) {
      queueToastIdRef.current = toast.loading(
        formatQueueToastMessage(queueStatus),
        queueToastIdRef.current != null
          ? { id: queueToastIdRef.current }
          : undefined
      );
    } else if (queueToastIdRef.current != null) {
      toast.dismiss(queueToastIdRef.current);
      queueToastIdRef.current = null;
    }

    if (
      latestFinishedRunId &&
      latestFinishedRunId !== lastFinishedRunIdRef.current &&
      previousActiveQueueCountRef.current > 0
    ) {
      const label = queueStatus.latestFinishedRun?.runLabel ?? "Run";
      if (queueStatus.latestFinishedRun?.status === "success") {
        toast.success(`${label} completed.`);
      } else if (queueStatus.latestFinishedRun?.status === "blocked") {
        toast.warning(
          `${label} was blocked before a valid response was captured.`
        );
      } else {
        toast.error(`${label} failed.`);
      }
    }

    lastFinishedRunIdRef.current = latestFinishedRunId;
    previousActiveQueueCountRef.current = activeQueueCount;
  }, [queueStatus]);

  const trend = useMemo(() => {
    if (!overview) return [];
    return overview.trendSeries.map((item) => ({
      label: formatDay(item.day),
      citation: item.citationQuality ?? 0,
      coverage: clamp(
        (item.runCount / Math.max(overview.kpis.totalRuns, 1)) * 100,
        0,
        100
      ),
    }));
  }, [overview]);

  const responseRows = useMemo(
    () =>
      (runs ?? []).filter(
        (run) =>
          run.responseSummary ||
          run.status === "success" ||
          run.status === "failed"
      ),
    [runs]
  );

  const kpis = useMemo(
    () => mapKpis(overview, sources?.meta.totalDomains),
    [overview, sources?.meta.totalDomains]
  );

  const recentRuns = useMemo(
    () =>
      (overview?.recentRuns ?? []).map((run) => ({
        id: String(run._id),
        promptExcerpt: run.promptExcerpt,
        providerName: run.providerName,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        latencyMs: run.latencyMs,
        sourceCount: run.sourceCount,
        citationCount: run.citationCount,
      })),
    [overview?.recentRuns]
  );

  const navigatePage = (nextPage: PageKey) => {
    setPage(nextPage);
    setPromptCreateOpen(false);
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setRunDetailContext(null);
  };

  const openPrompt = (promptId: Id<"prompts"> | null) => {
    setPage("prompts");
    setPromptCreateOpen(false);
    setSelectedPromptId(promptId);
    setSelectedRunId(null);
    setRunDetailContext(null);
  };

  const openRunFromPromptDetail = (runId: Id<"promptRuns"> | null) => {
    setSelectedRunId(runId);
    setRunDetailContext(runId ? "prompts" : null);
  };

  const openGlobalRunDetail = (
    nextPage: "runs" | "responses",
    runId: Id<"promptRuns"> | null
  ) => {
    setPage(nextPage);
    setSelectedRunId(runId);
    setRunDetailContext(runId ? nextPage : null);
  };

  const handleRetryRun = async (runId: Id<"promptRuns">) => {
    const result = await retryPromptRun({ runId });
    toast.success("Run requeued.", {
      description: `Queued ${String(result.runId)}.`,
    });
  };

  const handleCancelRun = async (runId: Id<"promptRuns">) => {
    await cancelPromptRun({ runId });
    toast.success("Run cancelled.");
  };

  const breadcrumbs = (() => {
    if (page === "prompts") {
      const items: Array<{ label: string; onClick?: () => void }> = [
        {
          label: "Prompts",
          onClick: promptView !== "list" ? () => openPrompt(null) : undefined,
        },
      ];

      if (promptView === "response") {
        items.push({
          label:
            runDetail?.prompt?.excerpt ??
            runDetail?.run.promptExcerpt ??
            "Response",
        });
        return items;
      }

      if (promptView !== "list" && promptAnalysis?.prompt.excerpt) {
        items.push({
          label: promptAnalysis.prompt.excerpt,
        });
      }

      return items;
    }

    if (showingRunDetailForRuns) {
      return [
        { label: "Runs", onClick: () => openGlobalRunDetail("runs", null) },
        { label: runDetail?.run.promptExcerpt ?? "Run" },
      ];
    }

    if (showingRunDetailForResponses) {
      return [
        {
          label: "Responses",
          onClick: () => openGlobalRunDetail("responses", null),
        },
        { label: runDetail?.run.promptExcerpt ?? "Response" },
      ];
    }

    return [{ label: page.charAt(0).toUpperCase() + page.slice(1) }];
  })();

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar page={page} onPage={navigatePage} />
        <SidebarInset className="min-w-0">
          <SiteHeader
            rangeDays={rangeDays}
            onRangeDays={setRangeDays}
            providerFilter={providerFilter}
            onProviderFilter={setProviderFilter}
            providerOptions={providerOptions}
            showRangeFilter={!isProvidersPage && !showingRunDetail}
            showProviderFilter={
              !isPromptsPage && !isProvidersPage && !showingRunDetail
            }
            searchValue={
              isPromptsPage && promptView === "list" ? promptSearch : undefined
            }
            onSearchValue={
              isPromptsPage && promptView === "list"
                ? setPromptSearch
                : undefined
            }
            searchPlaceholder="Search prompts..."
            action={
              isPromptsPage && promptView === "list" ? (
                <Button
                  type="button"
                  aria-label="New prompt"
                  className="px-2 sm:px-2.5"
                  onClick={() => setPromptCreateOpen(true)}
                >
                  <Plus data-icon="inline-start" />
                  <span aria-hidden="true" className="hidden sm:inline">
                    New prompt
                  </span>
                </Button>
              ) : undefined
            }
            breadcrumbs={breadcrumbs}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            {pageLoading ? (
              <div className="flex flex-col gap-2 px-4 pt-4 lg:px-6">
                <StatusBanner text="Loading analytics data..." />
              </div>
            ) : null}

            {page === "overview" ? (
              <OverviewPage
                loading={overviewLoading}
                hasData={hasData}
                kpis={kpis}
                trend={trend}
                overview={overview}
                sources={sources?.items ?? []}
                recentRuns={recentRuns}
              />
            ) : null}

            {page === "prompts" ? (
              <>
                {promptView === "list" ? (
                  <PromptsPage
                    loading={promptsPageLoading}
                    rows={promptRows}
                    selectedPromptId={selectedPromptId}
                    onSelectPrompt={openPrompt}
                    createOpen={promptCreateOpen}
                    onCreateOpenChange={setPromptCreateOpen}
                    onCreatePrompt={createPrompt}
                    onUpdatePrompt={updatePrompt}
                    onDeletePrompt={deletePrompt}
                    onTriggerSelectedNow={triggerSelectedPromptsNow}
                  />
                ) : null}
                {promptView === "prompt" ? (
                  <PromptDetailPage
                    loading={promptDetailLoading}
                    promptAnalysis={promptAnalysis}
                    onBack={() => openPrompt(null)}
                    selectedRunId={selectedRunId}
                    onOpenRun={openRunFromPromptDetail}
                  />
                ) : null}
                {promptView === "response" ? (
                  <ResponseDetailPage
                    loading={runDetailLoading}
                    runDetail={runDetail}
                    onRetryRun={handleRetryRun}
                    onCancelRun={handleCancelRun}
                  />
                ) : null}
              </>
            ) : null}

            {page === "runs" ? (
              showingRunDetailForRuns ? (
                <ResponseDetailPage
                  loading={runDetailLoading}
                  runDetail={runDetail}
                  onRetryRun={handleRetryRun}
                  onCancelRun={handleCancelRun}
                  onOpenPrompt={
                    runDetail?.run.promptId
                      ? () => openPrompt(runDetail.run.promptId)
                      : undefined
                  }
                />
              ) : (
                <RunsPage
                  loading={runsPageLoading}
                  runs={runs ?? []}
                  selectedRunId={selectedRunId}
                  onOpenRun={(runId) => openGlobalRunDetail("runs", runId)}
                  onOpenPrompt={openPrompt}
                />
              )
            ) : null}

            {page === "responses" ? (
              showingRunDetailForResponses ? (
                <ResponseDetailPage
                  loading={runDetailLoading}
                  runDetail={runDetail}
                  onRetryRun={handleRetryRun}
                  onCancelRun={handleCancelRun}
                  onOpenPrompt={
                    runDetail?.run.promptId
                      ? () => openPrompt(runDetail.run.promptId)
                      : undefined
                  }
                />
              ) : (
                <ResponsesPage
                  loading={responsesPageLoading}
                  runs={responseRows}
                  selectedRunId={selectedRunId}
                  onOpenRun={(runId) => openGlobalRunDetail("responses", runId)}
                  onOpenPrompt={openPrompt}
                />
              )
            ) : null}

            {page === "providers" ? (
              <ProvidersPage
                loading={providersPageLoading}
                providers={providers ?? []}
                onUpdateProvider={updateProvider}
              />
            ) : null}

            {page === "sources" ? (
              <SourcesPage
                loading={sourcesPageLoading}
                sources={sources?.items ?? []}
                entities={entities ?? []}
                newEntityName={newEntityName}
                onNewEntityName={setNewEntityName}
                newEntityKind={newEntityKind}
                onNewEntityKind={setNewEntityKind}
                newEntityDomain={newEntityDomain}
                onNewEntityDomain={setNewEntityDomain}
                onCreateEntity={createTrackedEntity}
                onUpdateEntity={updateTrackedEntity}
                onDeleteEntity={deleteTrackedEntity}
              />
            ) : null}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

type Kpi = { label: string; value: string; delta: string; tone: Tone };

function mapKpis(
  overview:
    | {
        kpis: {
          citationQuality?: number;
          deltaCitationQuality?: number;
          runSuccessRate?: number;
          totalRuns: number;
          totalCitations: number;
        };
        recentRuns: Array<{ startedAt: number }>;
      }
    | undefined,
  totalDomains: number | undefined
): Kpi[] {
  if (!overview) return [];
  return [
    {
      label: "Captured runs",
      value: String(overview.kpis.totalRuns),
      delta:
        overview.recentRuns[0] !== undefined
          ? formatFreshness(overview.recentRuns[0].startedAt)
          : "No recent run",
      tone: "neutral",
    },
    {
      label: "Citation quality",
      value:
        overview.kpis.citationQuality !== undefined
          ? `${Math.round(overview.kpis.citationQuality)} / 100`
          : "-",
      delta: formatDelta(overview.kpis.deltaCitationQuality),
      tone: trendTone(overview.kpis.deltaCitationQuality),
    },
    {
      label: "Source coverage",
      value: `${totalDomains ?? 0} domains`,
      delta: `${overview.kpis.totalCitations} citations`,
      tone: "neutral",
    },
    {
      label: "Run health",
      value: formatPercent(overview.kpis.runSuccessRate),
      delta: `${overview.kpis.totalRuns} total`,
      tone:
        overview.kpis.runSuccessRate !== undefined &&
        overview.kpis.runSuccessRate >= 90
          ? "positive"
          : "negative",
    },
  ];
}

function formatQueueToastMessage(queueStatus: {
  queuedCount: number;
  runningCount: number;
}) {
  if (queueStatus.runningCount > 0 && queueStatus.queuedCount > 0) {
    return `${formatRunCount(queueStatus.runningCount)} in progress, ${formatRunCount(queueStatus.queuedCount)} queued...`;
  }
  if (queueStatus.runningCount > 0) {
    return `${formatRunCount(queueStatus.runningCount)} in progress...`;
  }
  return `${formatRunCount(queueStatus.queuedCount)} queued...`;
}

function formatRunCount(count: number) {
  return `${count} run${count === 1 ? "" : "s"}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return "No baseline";
  if (Math.abs(value) < 0.1) return "Flat";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function trendTone(value: number | undefined): Tone {
  if (value === undefined || Math.abs(value) < 0.1) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function formatDay(key: string): string {
  const date = new Date(key);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFreshness(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
