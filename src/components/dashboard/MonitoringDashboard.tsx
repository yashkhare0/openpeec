import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  ListFilterDropdown,
  type ListFilterOption,
} from "./components/ListFilterDropdown";
import { StatusBanner } from "./components/StatusBanner";
import { OverviewPage } from "./OverviewPage";
import { PromptDetailPage } from "./PromptDetailPage";
import { PromptsPage } from "./PromptsPage";
import { ProvidersPage } from "./ProvidersPage";
import { ResponseDetailPage } from "./ResponseDetailPage";
import { ResponsesPage, type ResponseStatusFilterValue } from "./ResponsesPage";
import { RunGroupDetailPage } from "./RunGroupDetailPage";
import { RunsPage, type RunStatusFilterValue } from "./RunsPage";
import { SourceDetailPage } from "./SourceDetailPage";
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
type PromptStateFilterValue = "active" | "inactive";
type ProviderStateFilterValue = "active" | "paused" | "unavailable";
type ProviderSessionFilterValue = "stored" | "guest";

const DASHBOARD_PAGES: PageKey[] = [
  "overview",
  "prompts",
  "providers",
  "runs",
  "responses",
  "sources",
];
const DEFAULT_RANGE_DAYS = 7;
const RUN_STATUS_FILTER_OPTIONS: Array<{
  value: RunStatusFilterValue;
  label: string;
}> = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "blocked", label: "Blocked" },
  { value: "success", label: "Successful" },
  { value: "failed", label: "Failed" },
];
const RESPONSE_STATUS_FILTER_OPTIONS: Array<
  ListFilterOption<ResponseStatusFilterValue>
> = RUN_STATUS_FILTER_OPTIONS;
const PROMPT_STATE_FILTER_OPTIONS: Array<
  ListFilterOption<PromptStateFilterValue>
> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const PROVIDER_STATE_FILTER_OPTIONS: Array<
  ListFilterOption<ProviderStateFilterValue>
> = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "unavailable", label: "Unavailable" },
];
const PROVIDER_SESSION_FILTER_OPTIONS: Array<
  ListFilterOption<ProviderSessionFilterValue>
> = [
  { value: "stored", label: "Stored session" },
  { value: "guest", label: "Guest session" },
];

type PromptActionPrompt = {
  _id: Id<"prompts">;
  excerpt: string;
  promptText: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function promptActionLabel(prompt: PromptActionPrompt) {
  return prompt.excerpt.trim() || prompt.promptText.trim() || "Prompt";
}

function PromptDetailHeaderActions({
  prompt,
  onEdit,
  onRun,
  onDelete,
}: {
  prompt: PromptActionPrompt;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const label = promptActionLabel(prompt);

  return (
    <div className="flex items-center justify-end">
      <div className="hidden items-center gap-2 md:flex">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
        <Button type="button" size="sm" onClick={onRun}>
          <Play data-icon="inline-start" />
          Run
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRun}>
              <Play />
              Run
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function isPageKey(value: string | null): value is PageKey {
  return value !== null && DASHBOARD_PAGES.includes(value as PageKey);
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function readFilterValues<T extends string>(
  params: URLSearchParams,
  key: string,
  allowedValues?: readonly T[]
): T[] {
  const values = params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean) as T[];

  const filteredValues = allowedValues
    ? values.filter((value) => allowedValues.includes(value))
    : values;

  return uniqueValues(filteredValues);
}

function writeFilterValues<T extends string>(
  params: URLSearchParams,
  key: string,
  values: T[]
) {
  values.forEach((value) => params.append(key, value));
}

function filterOptionValues<T extends string>(
  options: Array<ListFilterOption<T>>
): T[] {
  return options.map((option) => option.value);
}

function toProviderSessionFilterValue(provider: {
  slug: string;
  sessionMode?: "guest" | "stored";
}): ProviderSessionFilterValue {
  return (
    provider.sessionMode ?? (provider.slug === "openai" ? "stored" : "guest")
  );
}

function toProviderStateFilterValue(provider: {
  slug: string;
  active: boolean;
}): ProviderStateFilterValue {
  if (provider.active) {
    return "active";
  }

  return provider.slug === "openai" || provider.slug === "google-ai-mode"
    ? "paused"
    : "unavailable";
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function parseDashboardUrlState(): {
  page: PageKey;
  promptSearch: string;
  promptStateFilters: PromptStateFilterValue[];
  runStatusFilters: RunStatusFilterValue[];
  responseStatusFilters: ResponseStatusFilterValue[];
  responseProviderFilters: string[];
  providerStateFilters: ProviderStateFilterValue[];
  providerSessionFilters: ProviderSessionFilterValue[];
  sourceTypeFilters: string[];
  selectedPromptId: Id<"prompts"> | null;
  selectedRunId: Id<"promptRuns"> | null;
  selectedRunGroupId: string | null;
  selectedSourceDomain: string | null;
  runDetailContext: RunDetailContext;
} {
  const params = new URLSearchParams(window.location.search);
  const pageValue = params.get("page");
  const contextValue = params.get("context");
  const page = isPageKey(pageValue) ? pageValue : "overview";

  return {
    page,
    promptSearch: params.get("search")?.trim() || "",
    promptStateFilters: readFilterValues(
      params,
      "promptState",
      filterOptionValues(PROMPT_STATE_FILTER_OPTIONS)
    ),
    runStatusFilters: readFilterValues(
      params,
      "status",
      filterOptionValues(RUN_STATUS_FILTER_OPTIONS)
    ),
    responseStatusFilters: readFilterValues(
      params,
      "responseStatus",
      filterOptionValues(RESPONSE_STATUS_FILTER_OPTIONS)
    ),
    responseProviderFilters: readFilterValues(params, "responseProvider"),
    providerStateFilters: readFilterValues(
      params,
      "providerState",
      filterOptionValues(PROVIDER_STATE_FILTER_OPTIONS)
    ),
    providerSessionFilters: readFilterValues(
      params,
      "providerSession",
      filterOptionValues(PROVIDER_SESSION_FILTER_OPTIONS)
    ),
    sourceTypeFilters: readFilterValues(params, "sourceType"),
    selectedPromptId:
      (params.get("prompt")?.trim() as Id<"prompts"> | null) ?? null,
    selectedRunId:
      (params.get("run")?.trim() as Id<"promptRuns"> | null) ?? null,
    selectedRunGroupId: params.get("group")?.trim() || null,
    selectedSourceDomain: params.get("source")?.trim() || null,
    runDetailContext: (contextValue === "prompts" ||
    contextValue === "runs" ||
    contextValue === "responses"
      ? contextValue
      : null) as RunDetailContext,
  };
}

function writeDashboardUrlState(state: {
  page: PageKey;
  promptSearch: string;
  promptStateFilters: PromptStateFilterValue[];
  runStatusFilters: RunStatusFilterValue[];
  responseStatusFilters: ResponseStatusFilterValue[];
  responseProviderFilters: string[];
  providerStateFilters: ProviderStateFilterValue[];
  providerSessionFilters: ProviderSessionFilterValue[];
  sourceTypeFilters: string[];
  selectedPromptId: Id<"prompts"> | null;
  selectedRunId: Id<"promptRuns"> | null;
  selectedRunGroupId: string | null;
  selectedSourceDomain: string | null;
  runDetailContext: RunDetailContext;
}) {
  const params = new URLSearchParams();
  if (state.page !== "overview") {
    params.set("page", state.page);
  }
  if (state.promptSearch) {
    params.set("search", state.promptSearch);
  }
  if (state.page === "prompts") {
    writeFilterValues(params, "promptState", state.promptStateFilters);
  }
  if (state.page === "runs") {
    writeFilterValues(params, "status", state.runStatusFilters);
  }
  if (state.page === "responses") {
    writeFilterValues(params, "responseStatus", state.responseStatusFilters);
    writeFilterValues(
      params,
      "responseProvider",
      state.responseProviderFilters
    );
  }
  if (state.page === "providers") {
    writeFilterValues(params, "providerState", state.providerStateFilters);
    writeFilterValues(params, "providerSession", state.providerSessionFilters);
  }
  if (state.page === "sources") {
    writeFilterValues(params, "sourceType", state.sourceTypeFilters);
  }
  if (state.selectedPromptId) {
    params.set("prompt", String(state.selectedPromptId));
  }
  if (state.selectedRunId) {
    params.set("run", String(state.selectedRunId));
  }
  if (state.selectedRunGroupId) {
    params.set("group", state.selectedRunGroupId);
  }
  if (state.page === "sources" && state.selectedSourceDomain) {
    params.set("source", state.selectedSourceDomain);
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
  const [promptSearch, setPromptSearch] = useState(
    initialUrlState.promptSearch
  );
  const [promptStateFilters, setPromptStateFilters] = useState<
    PromptStateFilterValue[]
  >(initialUrlState.promptStateFilters);
  const [runStatusFilters, setRunStatusFilters] = useState<
    RunStatusFilterValue[]
  >(initialUrlState.runStatusFilters);
  const [responseStatusFilters, setResponseStatusFilters] = useState<
    ResponseStatusFilterValue[]
  >(initialUrlState.responseStatusFilters);
  const [responseProviderFilters, setResponseProviderFilters] = useState<
    string[]
  >(initialUrlState.responseProviderFilters);
  const [providerStateFilters, setProviderStateFilters] = useState<
    ProviderStateFilterValue[]
  >(initialUrlState.providerStateFilters);
  const [providerSessionFilters, setProviderSessionFilters] = useState<
    ProviderSessionFilterValue[]
  >(initialUrlState.providerSessionFilters);
  const [sourceTypeFilters, setSourceTypeFilters] = useState<string[]>(
    initialUrlState.sourceTypeFilters
  );
  const [promptCreateOpen, setPromptCreateOpen] = useState(false);
  const [promptEditOpen, setPromptEditOpen] = useState(false);
  const [promptEditText, setPromptEditText] = useState("");
  const [selectedPromptId, setSelectedPromptId] =
    useState<Id<"prompts"> | null>(initialUrlState.selectedPromptId);
  const [selectedRunId, setSelectedRunId] = useState<Id<"promptRuns"> | null>(
    initialUrlState.selectedRunId
  );
  const [selectedRunGroupId, setSelectedRunGroupId] = useState<string | null>(
    initialUrlState.selectedRunGroupId
  );
  const [selectedSourceDomain, setSelectedSourceDomain] = useState<
    string | null
  >(initialUrlState.selectedSourceDomain);
  const [sourcePromptFilter, setSourcePromptFilter] = useState<{
    promptId: Id<"prompts">;
    promptExcerpt: string;
  } | null>(null);
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
  const showingPromptsList = isPromptsPage && promptView === "list";
  const showingRunDetailForRuns =
    page === "runs" && runDetailContext === "runs" && selectedRunId !== null;
  const showingRunGroupDetailForRuns =
    page === "runs" &&
    runDetailContext === "runs" &&
    selectedRunGroupId !== null;
  const showingRunsList =
    isRunsPage && !showingRunDetailForRuns && !showingRunGroupDetailForRuns;
  const showingRunDetailForResponses =
    page === "responses" &&
    runDetailContext === "responses" &&
    selectedRunId !== null;
  const showingResponsesList = isResponsesPage && !showingRunDetailForResponses;
  const showingSourceDetail = isSourcesPage && selectedSourceDomain !== null;
  const showingSourcesList = isSourcesPage && !showingSourceDetail;
  const showingListScreen =
    showingPromptsList ||
    showingRunsList ||
    showingResponsesList ||
    isProvidersPage ||
    showingSourcesList;
  const shouldLoadPromptAnalytics = showingPromptsList;
  const shouldLoadRunsList = isOverviewPage || showingResponsesList;

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
  const deletePromptRun = useMutation(api.analytics.deletePromptRun);
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
    isOverviewPage ? { rangeDays: DEFAULT_RANGE_DAYS } : "skip"
  );
  const providers = useQuery(api.analytics.listProviders, {});
  const promptAnalytics = useQuery(
    api.analytics.listPromptResponseAnalytics,
    shouldLoadPromptAnalytics ? {} : "skip"
  );
  const queueStatus = useQuery(api.analytics.getQueueStatus, {});
  const runs = useQuery(
    api.analytics.listPromptRuns,
    shouldLoadRunsList
      ? {
          limit: isOverviewPage ? 4 : 200,
        }
      : "skip"
  );
  const runGroups = useQuery(
    api.analytics.listRunGroups,
    isRunsPage && !showingRunDetailForRuns && !showingRunGroupDetailForRuns
      ? {
          limit: 200,
        }
      : "skip"
  );
  const sources = useQuery(
    api.analytics.listSources,
    isOverviewPage || isSourcesPage
      ? {
          rangeDays: DEFAULT_RANGE_DAYS,
          limit: isOverviewPage ? 8 : 80,
        }
      : "skip"
  );
  const promptAnalysis = useQuery(
    api.analytics.getPromptAnalysis,
    promptView === "prompt" && selectedPromptId
      ? { promptId: selectedPromptId, rangeDays: DEFAULT_RANGE_DAYS }
      : "skip"
  );
  const entities = useQuery(
    api.analytics.listTrackedEntities,
    showingSourcesList ? {} : "skip"
  );
  const runDetail = useQuery(
    api.analytics.getPromptRun,
    selectedRunId ? { id: selectedRunId } : "skip"
  );
  const runGroupDetail = useQuery(
    api.analytics.getRunGroup,
    selectedRunGroupId ? { runGroupId: selectedRunGroupId } : "skip"
  );

  const overviewLoading =
    isOverviewPage &&
    (overview === undefined || sources === undefined || runs === undefined);
  const promptsPageLoading =
    isPromptsPage && promptView === "list" && promptAnalytics === undefined;
  const providersPageLoading = isProvidersPage && providers === undefined;
  const runsPageLoading =
    isRunsPage &&
    !showingRunDetailForRuns &&
    !showingRunGroupDetailForRuns &&
    runGroups === undefined;
  const responsesPageLoading =
    isResponsesPage && !showingRunDetailForResponses && runs === undefined;
  const sourcesPageLoading =
    isSourcesPage &&
    (sources === undefined || (showingSourcesList && entities === undefined));
  const promptDetailLoading =
    promptView === "prompt" &&
    selectedPromptId !== null &&
    promptAnalysis === undefined;
  const runDetailLoading = selectedRunId !== null && runDetail === undefined;
  const runGroupDetailLoading =
    selectedRunGroupId !== null && runGroupDetail === undefined;
  const pageLoading =
    overviewLoading ||
    promptsPageLoading ||
    providersPageLoading ||
    runsPageLoading ||
    responsesPageLoading ||
    sourcesPageLoading ||
    promptDetailLoading ||
    runDetailLoading ||
    runGroupDetailLoading;
  const hasData = !!overview && overview.kpis.totalRuns > 0;

  const promptRows = useMemo(
    () =>
      (promptAnalytics ?? []).filter((row) => {
        const state: PromptStateFilterValue = row.active
          ? "active"
          : "inactive";
        if (
          promptStateFilters.length > 0 &&
          !promptStateFilters.includes(state)
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        return `${row.excerpt} ${row.latestResponseSummary ?? ""} ${(row.topEntities ?? []).join(" ")} ${(row.topSources ?? []).join(" ")}`
          .toLowerCase()
          .includes(search);
      }),
    [promptAnalytics, promptStateFilters, search]
  );

  useEffect(() => {
    const handlePopState = () => {
      const next = parseDashboardUrlState();
      setPage(next.page);
      setPromptSearch(next.promptSearch);
      setPromptStateFilters(next.promptStateFilters);
      setRunStatusFilters(next.runStatusFilters);
      setResponseStatusFilters(next.responseStatusFilters);
      setResponseProviderFilters(next.responseProviderFilters);
      setProviderStateFilters(next.providerStateFilters);
      setProviderSessionFilters(next.providerSessionFilters);
      setSourceTypeFilters(next.sourceTypeFilters);
      setSelectedPromptId(next.selectedPromptId);
      setSelectedRunId(next.selectedRunId);
      setSelectedRunGroupId(next.selectedRunGroupId);
      setSelectedSourceDomain(next.selectedSourceDomain);
      setRunDetailContext(next.runDetailContext);
      setSourcePromptFilter(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    writeDashboardUrlState({
      page,
      promptSearch,
      promptStateFilters,
      runStatusFilters,
      responseStatusFilters,
      responseProviderFilters,
      providerStateFilters,
      providerSessionFilters,
      sourceTypeFilters,
      selectedPromptId,
      selectedRunId,
      selectedRunGroupId,
      selectedSourceDomain,
      runDetailContext,
    });
  }, [
    page,
    promptSearch,
    promptStateFilters,
    runStatusFilters,
    responseStatusFilters,
    responseProviderFilters,
    providerStateFilters,
    providerSessionFilters,
    sourceTypeFilters,
    runDetailContext,
    selectedPromptId,
    selectedRunId,
    selectedRunGroupId,
    selectedSourceDomain,
  ]);

  useEffect(() => {
    if (promptView !== "list") {
      return;
    }

    if (!promptRows.length) {
      setSelectedPromptId(null);
      if (runDetailContext === "prompts") {
        setSelectedRunId(null);
        setSelectedRunGroupId(null);
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
      setSelectedRunGroupId(null);
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
          run.status === "failed" ||
          run.status === "blocked" ||
          run.status === "running" ||
          run.status === "queued"
      ),
    [runs]
  );

  const responseProviderFilterOptions = useMemo(
    () =>
      uniqueValues(
        responseRows
          .map((run) => run.providerSlug ?? run.providerName)
          .filter(Boolean)
      )
        .sort((left, right) => left.localeCompare(right))
        .map((value) => {
          const row = responseRows.find(
            (run) => (run.providerSlug ?? run.providerName) === value
          );
          return {
            value,
            label: row?.providerName ?? titleCase(value),
          };
        }),
    [responseRows]
  );

  const filteredProviders = useMemo(
    () =>
      (providers ?? []).filter((provider) => {
        const state = toProviderStateFilterValue(provider);
        const session = toProviderSessionFilterValue(provider);
        if (
          providerStateFilters.length > 0 &&
          !providerStateFilters.includes(state)
        ) {
          return false;
        }
        if (
          providerSessionFilters.length > 0 &&
          !providerSessionFilters.includes(session)
        ) {
          return false;
        }
        if (!search) {
          return true;
        }

        return `${provider.name} ${provider.slug} ${provider.channelName ?? ""} ${provider.channelSlug ?? ""} ${provider.url}`
          .toLowerCase()
          .includes(search);
      }),
    [providerSessionFilters, providerStateFilters, providers, search]
  );

  const sourceTypeFilterOptions = useMemo(
    () =>
      uniqueValues([
        ...(sources?.items ?? []).map((source) => source.type),
        ...sourceTypeFilters,
      ])
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({
          value,
          label: titleCase(value),
        })),
    [sourceTypeFilters, sources?.items]
  );

  const filteredSources = useMemo(
    () =>
      (sources?.items ?? []).filter((source) => {
        if (
          sourceTypeFilters.length > 0 &&
          !sourceTypeFilters.includes(source.type)
        ) {
          return false;
        }
        if (!search) {
          return true;
        }

        return `${source.domain} ${source.type} ${(source.latestResponses ?? [])
          .map(
            (response) =>
              `${response.promptExcerpt} ${response.providerName} ${response.responseSummary}`
          )
          .join(" ")}`
          .toLowerCase()
          .includes(search);
      }),
    [search, sourceTypeFilters, sources?.items]
  );

  const kpis = useMemo(
    () => mapKpis(overview, sources?.meta.totalDomains),
    [overview, sources?.meta.totalDomains]
  );
  const selectedSource = useMemo(
    () =>
      selectedSourceDomain
        ? (sources?.items ?? []).find(
            (source) => source.domain === selectedSourceDomain
          )
        : undefined,
    [selectedSourceDomain, sources?.items]
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
    setPromptEditOpen(false);
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setSelectedRunGroupId(null);
    setSelectedSourceDomain(null);
    setRunDetailContext(null);
    setSourcePromptFilter(null);
  };

  const openPrompt = (promptId: Id<"prompts"> | null) => {
    setPage("prompts");
    setPromptCreateOpen(false);
    setPromptEditOpen(false);
    setSelectedPromptId(promptId);
    setSelectedRunId(null);
    setSelectedRunGroupId(null);
    setSelectedSourceDomain(null);
    setRunDetailContext(null);
    setSourcePromptFilter(null);
  };

  const openRunFromPromptDetail = (runId: Id<"promptRuns"> | null) => {
    setSelectedRunId(runId);
    setSelectedRunGroupId(null);
    setRunDetailContext(runId ? "prompts" : null);
  };

  const openRunGroupFromPromptDetail = (runGroupId: string | null) => {
    setPage("runs");
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setSelectedRunGroupId(runGroupId);
    setSelectedSourceDomain(null);
    setRunDetailContext(runGroupId ? "runs" : null);
    setSourcePromptFilter(null);
  };

  const openRunGroup = (runGroupId: string | null) => {
    setPage("runs");
    setSelectedRunId(null);
    setSelectedRunGroupId(runGroupId);
    setSelectedSourceDomain(null);
    setRunDetailContext(runGroupId ? "runs" : null);
    setSourcePromptFilter(null);
  };

  const openGlobalRunDetail = (
    nextPage: "runs" | "responses",
    runId: Id<"promptRuns"> | null
  ) => {
    setPage(nextPage);
    setSelectedRunId(runId);
    setSelectedRunGroupId(null);
    setSelectedSourceDomain(null);
    setRunDetailContext(runId ? nextPage : null);
    setSourcePromptFilter(null);
  };

  const openSourcesForPrompt = (
    promptId: Id<"prompts">,
    promptExcerpt: string
  ) => {
    setPage("sources");
    setPromptCreateOpen(false);
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setSelectedRunGroupId(null);
    setSelectedSourceDomain(null);
    setRunDetailContext(null);
    setSourcePromptFilter({ promptId, promptExcerpt });
  };

  const openSource = (domain: string | null) => {
    setPage("sources");
    setPromptCreateOpen(false);
    setPromptEditOpen(false);
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setSelectedRunGroupId(null);
    setSelectedSourceDomain(domain);
    setRunDetailContext(null);
    setSourcePromptFilter(null);
  };

  const handleRetryRun = async (runId: Id<"promptRuns">) => {
    const result = await retryPromptRun({ runId });
    toast.success("Run requeued.", {
      description: `Queued ${String(result.runId)}.`,
    });
  };

  const handleCancelRuns = async (runIds: Array<Id<"promptRuns">>) => {
    await Promise.all(runIds.map((runId) => cancelPromptRun({ runId })));
    toast.success(
      runIds.length === 1
        ? "Run cancelled."
        : `${runIds.length} queued runs cancelled.`
    );
  };

  const handleCancelRun = async (runId: Id<"promptRuns">) => {
    await handleCancelRuns([runId]);
  };

  const handleDeleteRuns = async (runIds: Array<Id<"promptRuns">>) => {
    await Promise.all(runIds.map((runId) => deletePromptRun({ runId })));
    toast.success(
      runIds.length === 1
        ? "Queued run deleted."
        : `${runIds.length} queued runs deleted.`
    );
    if (selectedRunId && runIds.includes(selectedRunId)) {
      setSelectedRunId(null);
      setRunDetailContext(null);
    }
  };

  const handleDeleteRun = async (runId: Id<"promptRuns">) => {
    await handleDeleteRuns([runId]);
  };

  const promptActionPrompt =
    promptView === "prompt" && promptAnalysis ? promptAnalysis.prompt : null;

  const openPromptEditDialog = () => {
    if (!promptActionPrompt) {
      return;
    }
    setPromptEditText(promptActionPrompt.promptText);
    setPromptEditOpen(true);
  };

  const handleSavePromptEdit = async () => {
    if (!promptActionPrompt) {
      return;
    }

    const promptText = promptEditText.trim();
    if (!promptText) {
      toast.error("Prompt text is required.");
      return;
    }

    try {
      await updatePrompt({ id: promptActionPrompt._id, promptText });
      setPromptEditOpen(false);
      toast.success("Prompt updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleRunPrompt = async () => {
    if (!promptActionPrompt) {
      return;
    }

    try {
      const result = await triggerSelectedPromptsNow({
        promptIds: [promptActionPrompt._id],
        label: promptActionLabel(promptActionPrompt),
        browserEngine: "camoufox",
      });
      toast.success(
        result.queuedCount === 1
          ? "Run queued."
          : `Run queued across ${result.queuedCount} providers.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleDeletePrompt = async () => {
    if (!promptActionPrompt) {
      return;
    }

    try {
      await deletePrompt({ id: promptActionPrompt._id });
      setPromptEditOpen(false);
      toast.success("Prompt deleted.");
      openPrompt(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
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

    if (showingRunGroupDetailForRuns) {
      return [
        { label: "Runs", onClick: () => openRunGroup(null) },
        {
          label:
            runGroupDetail?.prompt?.excerpt ??
            runGroupDetail?.group.promptExcerpt ??
            "Run group",
        },
      ];
    }

    if (showingRunDetailForRuns) {
      return [
        { label: "Runs", onClick: () => openRunGroup(null) },
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

    if (showingSourceDetail) {
      return [
        {
          label: "Sources",
          onClick: () => openSource(null),
        },
        { label: selectedSource?.domain ?? selectedSourceDomain ?? "Source" },
      ];
    }

    return [{ label: page.charAt(0).toUpperCase() + page.slice(1) }];
  })();

  const headerSearchPlaceholder = showingRunsList
    ? "Search runs..."
    : showingResponsesList
      ? "Search responses..."
      : isProvidersPage
        ? "Search providers..."
        : showingSourcesList
          ? "Search sources..."
          : "Search prompts...";
  const headerSearchLabel = showingRunsList
    ? "Search runs"
    : showingResponsesList
      ? "Search responses"
      : isProvidersPage
        ? "Search providers"
        : showingSourcesList
          ? "Search sources"
          : "Search prompts";

  const headerAction = (() => {
    if (showingPromptsList) {
      return (
        <div className="flex items-center gap-2">
          <ListFilterDropdown
            label="Filter prompts"
            groups={[
              {
                label: "State",
                values: promptStateFilters,
                options: PROMPT_STATE_FILTER_OPTIONS,
                onValuesChange: (values) =>
                  setPromptStateFilters(values as PromptStateFilterValue[]),
              },
            ]}
          />
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
        </div>
      );
    }

    if (isPromptsPage && promptView === "prompt" && promptActionPrompt) {
      return (
        <PromptDetailHeaderActions
          prompt={promptActionPrompt}
          onEdit={openPromptEditDialog}
          onRun={handleRunPrompt}
          onDelete={handleDeletePrompt}
        />
      );
    }

    if (showingRunGroupDetailForRuns && runGroupDetail) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            openPrompt(
              runGroupDetail.prompt?._id ?? runGroupDetail.group.promptId
            )
          }
        >
          Open prompt
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      );
    }

    if (showingRunsList) {
      return (
        <ListFilterDropdown
          label="Filter runs by status"
          groups={[
            {
              label: "Status",
              values: runStatusFilters,
              options: RUN_STATUS_FILTER_OPTIONS,
              onValuesChange: (values) =>
                setRunStatusFilters(values as RunStatusFilterValue[]),
            },
          ]}
        />
      );
    }

    if (showingResponsesList) {
      return (
        <ListFilterDropdown
          label="Filter responses"
          groups={[
            {
              label: "Status",
              values: responseStatusFilters,
              options: RESPONSE_STATUS_FILTER_OPTIONS,
              onValuesChange: (values) =>
                setResponseStatusFilters(values as ResponseStatusFilterValue[]),
            },
            {
              label: "Provider",
              values: responseProviderFilters,
              options: responseProviderFilterOptions,
              onValuesChange: setResponseProviderFilters,
            },
          ]}
        />
      );
    }

    if (isProvidersPage) {
      return (
        <ListFilterDropdown
          label="Filter providers"
          groups={[
            {
              label: "State",
              values: providerStateFilters,
              options: PROVIDER_STATE_FILTER_OPTIONS,
              onValuesChange: (values) =>
                setProviderStateFilters(values as ProviderStateFilterValue[]),
            },
            {
              label: "Session",
              values: providerSessionFilters,
              options: PROVIDER_SESSION_FILTER_OPTIONS,
              onValuesChange: (values) =>
                setProviderSessionFilters(
                  values as ProviderSessionFilterValue[]
                ),
            },
          ]}
        />
      );
    }

    if (showingSourcesList) {
      return (
        <ListFilterDropdown
          label="Filter sources"
          groups={[
            {
              label: "Type",
              values: sourceTypeFilters,
              options: sourceTypeFilterOptions,
              onValuesChange: setSourceTypeFilters,
            },
          ]}
        />
      );
    }

    return undefined;
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
            searchValue={showingListScreen ? promptSearch : undefined}
            onSearchValue={showingListScreen ? setPromptSearch : undefined}
            searchPlaceholder={headerSearchPlaceholder}
            searchLabel={headerSearchLabel}
            action={headerAction}
            breadcrumbs={breadcrumbs}
          />

          {promptActionPrompt ? (
            <Dialog open={promptEditOpen} onOpenChange={setPromptEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit prompt</DialogTitle>
                  <DialogDescription>
                    Update the question used for future runs.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prompt-edit-text">Prompt text</Label>
                  <Textarea
                    id="prompt-edit-text"
                    value={promptEditText}
                    onChange={(event) => setPromptEditText(event.target.value)}
                    rows={8}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPromptEditOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSavePromptEdit()}
                  >
                    Save changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

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
                onOpenRun={(runId) =>
                  openGlobalRunDetail("runs", runId as Id<"promptRuns">)
                }
                onOpenPrompt={(promptId) =>
                  openPrompt(promptId as Id<"prompts">)
                }
              />
            ) : null}

            {page === "prompts" ? (
              <>
                {promptView === "list" ? (
                  <PromptsPage
                    loading={promptsPageLoading}
                    rows={promptRows}
                    providers={providers ?? []}
                    selectedPromptId={selectedPromptId}
                    onSelectPrompt={openPrompt}
                    createOpen={promptCreateOpen}
                    onCreateOpenChange={setPromptCreateOpen}
                    onCreatePrompt={createPrompt}
                    onDeletePrompt={deletePrompt}
                    onTriggerSelectedNow={triggerSelectedPromptsNow}
                  />
                ) : null}
                {promptView === "prompt" ? (
                  <PromptDetailPage
                    loading={promptDetailLoading}
                    promptAnalysis={promptAnalysis}
                    selectedRunId={selectedRunId}
                    onOpenRun={openRunFromPromptDetail}
                    onOpenRunGroup={openRunGroupFromPromptDetail}
                  />
                ) : null}
                {promptView === "response" ? (
                  <ResponseDetailPage
                    loading={runDetailLoading}
                    runDetail={runDetail}
                    onRetryRun={handleRetryRun}
                    onCancelRun={handleCancelRun}
                    onDeleteRun={handleDeleteRun}
                  />
                ) : null}
              </>
            ) : null}

            {page === "runs" ? (
              showingRunGroupDetailForRuns ? (
                <RunGroupDetailPage
                  loading={runGroupDetailLoading}
                  runGroupDetail={runGroupDetail}
                  onOpenRun={(runId) => openGlobalRunDetail("runs", runId)}
                  onOpenSourcesForPrompt={openSourcesForPrompt}
                />
              ) : showingRunDetailForRuns ? (
                <ResponseDetailPage
                  loading={runDetailLoading}
                  runDetail={runDetail}
                  onRetryRun={handleRetryRun}
                  onCancelRun={handleCancelRun}
                  onDeleteRun={handleDeleteRun}
                  onOpenPrompt={
                    runDetail?.run.promptId
                      ? () => openPrompt(runDetail.run.promptId)
                      : undefined
                  }
                />
              ) : (
                <RunsPage
                  loading={runsPageLoading}
                  groups={runGroups ?? []}
                  searchValue={promptSearch}
                  statusFilters={runStatusFilters}
                  selectedRunGroupId={selectedRunGroupId}
                  onOpenRun={(runId) => openGlobalRunDetail("runs", runId)}
                  onOpenRunGroup={openRunGroup}
                  onOpenPrompt={openPrompt}
                  onCancelRuns={handleCancelRuns}
                  onDeleteRuns={handleDeleteRuns}
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
                  onDeleteRun={handleDeleteRun}
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
                  searchValue={promptSearch}
                  statusFilters={responseStatusFilters}
                  providerFilters={responseProviderFilters}
                  providers={providers ?? []}
                  selectedRunId={selectedRunId}
                  onOpenRun={(runId) => openGlobalRunDetail("responses", runId)}
                  onOpenPrompt={openPrompt}
                  onRetryRun={handleRetryRun}
                  onCancelRun={handleCancelRun}
                  onDeleteRun={handleDeleteRun}
                  onTriggerSelectedNow={triggerSelectedPromptsNow}
                />
              )
            ) : null}

            {page === "providers" ? (
              <ProvidersPage
                loading={providersPageLoading}
                providers={filteredProviders}
                onUpdateProvider={updateProvider}
              />
            ) : null}

            {page === "sources" ? (
              showingSourceDetail ? (
                <SourceDetailPage
                  loading={sourcesPageLoading}
                  source={selectedSource}
                  onOpenRun={(runId) => openGlobalRunDetail("responses", runId)}
                />
              ) : (
                <SourcesPage
                  loading={sourcesPageLoading}
                  sources={filteredSources}
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
                  onOpenSource={openSource}
                  promptFilter={sourcePromptFilter}
                  onPromptFilterClear={() => setSourcePromptFilter(null)}
                />
              )
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
