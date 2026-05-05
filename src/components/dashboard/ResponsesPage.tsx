import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import {
  clickableTableRowClassName,
  InfoTooltip,
} from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type ResponseRow = {
  _id: Id<"promptRuns">;
  promptId: Id<"prompts">;
  promptExcerpt: string;
  providerName: string;
  status: string;
  startedAt: number;
  responseSummary?: string;
  citationQualityScore?: number;
  sourceCount?: number;
  citationCount: number;
  queuedAt?: number;
  finishedAt?: number;
  runGroupId?: string;
  providerSlug?: string;
  browserEngine?: BrowserEngine;
  runner?: string;
  warnings?: string[];
};

type BrowserEngine = "camoufox" | "nodriver" | "playwright";
export type ResponseStatusFilterValue =
  | "queued"
  | "running"
  | "blocked"
  | "success"
  | "failed";
type ProviderOption = {
  slug: string;
  name: string;
  active: boolean;
};
type TriggerSelectedPromptsNow = (args: {
  promptIds: Id<"prompts">[];
  label?: string;
  browserEngine?: BrowserEngine;
  providerSlugs?: string[];
}) => Promise<{ queuedCount: number }>;

const browserEngineOptions: Array<{ value: BrowserEngine; label: string }> = [
  { value: "camoufox", label: "Camoufox" },
  { value: "nodriver", label: "Nodriver" },
  { value: "playwright", label: "Playwright" },
];
const defaultBrowserEngine: BrowserEngine = "camoufox";

export function ResponsesPage({
  loading = false,
  runs,
  searchValue,
  statusFilters,
  providerFilters,
  providers,
  selectedRunId,
  onOpenRun,
  onOpenPrompt,
  onRetryRun,
  onCancelRun,
  onDeleteRun,
  onTriggerSelectedNow,
}: {
  loading?: boolean;
  runs: ResponseRow[];
  searchValue: string;
  statusFilters: ResponseStatusFilterValue[];
  providerFilters: string[];
  providers: ProviderOption[];
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
  onRetryRun: (runId: Id<"promptRuns">) => Promise<void>;
  onCancelRun: (runId: Id<"promptRuns">) => Promise<void>;
  onDeleteRun: (runId: Id<"promptRuns">) => Promise<void>;
  onTriggerSelectedNow: TriggerSelectedPromptsNow;
}) {
  const filteredRuns = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    return runs.filter((run) => {
      if (
        statusFilters.length > 0 &&
        !statusFilters.includes(run.status as ResponseStatusFilterValue)
      ) {
        return false;
      }
      if (
        providerFilters.length > 0 &&
        !providerFilters.includes(run.providerSlug ?? run.providerName)
      ) {
        return false;
      }
      if (!needle) {
        return true;
      }

      return `${run.promptExcerpt} ${run.providerName} ${run.providerSlug ?? ""} ${run.status} ${run.responseSummary ?? ""} ${(run.warnings ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [providerFilters, runs, searchValue, statusFilters]);

  const responseRuns = useMemo(
    () =>
      filteredRuns.filter(
        (run) =>
          run.status === "success" ||
          run.status === "failed" ||
          run.status === "blocked" ||
          run.status === "running" ||
          run.status === "queued" ||
          !!run.responseSummary
      ),
    [filteredRuns]
  );

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-24" rows={6} columns={8} />
        ) : (
          <Card className="min-w-0">
            <CardContent>
              {responseRuns.length === 0 ? (
                <InlineEmpty text="No responses captured yet." />
              ) : (
                <Table className="min-w-[1080px] table-fixed">
                  <colgroup>
                    <col className="w-[140px]" />
                    <col className="w-[128px]" />
                    <col className="w-[118px]" />
                    <col className="w-[24%]" />
                    <col />
                    <col className="w-[104px]" />
                    <col className="w-[116px]" />
                    <col className="w-12" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Run at</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center justify-end gap-1">
                          Sources
                          <InfoTooltip label="Sources definition">
                            Captured source links. Falls back to citations when
                            unavailable.
                          </InfoTooltip>
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center justify-end gap-1">
                          Citation
                          <InfoTooltip label="Citation quality definition">
                            0-100 evidence quality score.
                          </InfoTooltip>
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responseRuns.map((run) => (
                      <TableRow
                        key={String(run._id)}
                        role="button"
                        aria-label={`Open response from ${run.providerName}: ${run.promptExcerpt}`}
                        data-state={
                          selectedRunId === run._id ? "selected" : undefined
                        }
                        className={clickableTableRowClassName}
                        tabIndex={0}
                        onClick={() => onOpenRun(run._id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenRun(run._id);
                          }
                        }}
                      >
                        <TableCell>
                          <ProviderChip run={run} />
                        </TableCell>
                        <TableCell>
                          <StatusSummary run={run} />
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          <div className="flex flex-col gap-0.5">
                            <span>{formatFreshness(run.startedAt)}</span>
                            <span className="text-xs">
                              {formatShortTimestamp(run.startedAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <button
                            type="button"
                            className="hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 block max-w-full rounded-sm text-left transition-colors outline-none focus-visible:ring-3"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenPrompt(run.promptId);
                            }}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <p className="line-clamp-2 font-medium break-words">
                              {run.promptExcerpt}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p className="line-clamp-2 text-sm break-words">
                            {run.responseSummary ||
                              "No response summary captured yet."}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.sourceCount ?? run.citationCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatScore(run.citationQualityScore)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ResponseActions
                            run={run}
                            providerOptions={providers}
                            onOpenRun={onOpenRun}
                            onRetryRun={onRetryRun}
                            onCancelRun={onCancelRun}
                            onDeleteRun={onDeleteRun}
                            onTriggerSelectedNow={onTriggerSelectedNow}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProviderChip({ run }: { run: ResponseRow }) {
  return (
    <Badge variant="secondary" className="max-w-full justify-start">
      <span className="truncate">{run.providerName}</span>
    </Badge>
  );
}

function StatusSummary({ run }: { run: ResponseRow }) {
  return (
    <RowControl>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${formatStatus(run.status)} status details`}
            className="focus-visible:border-ring focus-visible:ring-ring/50 inline-flex rounded-sm outline-none focus-visible:ring-3"
          >
            <Badge variant={statusBadgeVariant(run.status)}>
              <StatusIcon status={run.status} data-icon="inline-start" />
              {formatStatus(run.status)}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-none">
          <div className="flex min-w-56 flex-col gap-2 text-left">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">{formatStatus(run.status)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{run.providerName}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Engine</span>
              <span className="font-medium">
                {formatBrowserEngine(resolveBrowserEngine(run))}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Run at</span>
              <span className="font-medium">
                {formatCaptureTime(run.startedAt)}
              </span>
            </div>
            {run.warnings?.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Warnings</span>
                <span className="max-w-72">{run.warnings[0]}</span>
              </div>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </RowControl>
  );
}

function ResponseActions({
  run,
  providerOptions,
  onOpenRun,
  onRetryRun,
  onCancelRun,
  onDeleteRun,
  onTriggerSelectedNow,
}: {
  run: ResponseRow;
  providerOptions: ProviderOption[];
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onRetryRun: (runId: Id<"promptRuns">) => Promise<void>;
  onCancelRun: (runId: Id<"promptRuns">) => Promise<void>;
  onDeleteRun: (runId: Id<"promptRuns">) => Promise<void>;
  onTriggerSelectedNow: TriggerSelectedPromptsNow;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedProviderSlugs, setSelectedProviderSlugs] = useState<string[]>(
    []
  );
  const [selectedEngines, setSelectedEngines] = useState<BrowserEngine[]>([
    defaultBrowserEngine,
  ]);
  const [advancedRunning, setAdvancedRunning] = useState(false);
  const enabledProviderOptions = providerOptions.filter(
    (provider) => provider.active
  );
  const canCancel = run.status === "queued" || run.status === "running";
  const canDelete = run.status === "queued";
  const canRunAdvanced =
    selectedProviderSlugs.length > 0 &&
    selectedEngines.length > 0 &&
    !advancedRunning;

  const openAdvanced = () => {
    setSelectedProviderSlugs(
      enabledProviderOptions.map((provider) => provider.slug)
    );
    setSelectedEngines([defaultBrowserEngine]);
    setAdvancedOpen(true);
  };

  const runAdvanced = async () => {
    if (!canRunAdvanced) {
      return;
    }

    setAdvancedRunning(true);
    try {
      const results = await Promise.all(
        selectedEngines.map((browserEngine) =>
          onTriggerSelectedNow({
            promptIds: [run.promptId],
            label: run.promptExcerpt,
            browserEngine,
            providerSlugs: selectedProviderSlugs,
          })
        )
      );
      const queuedCount = results.reduce(
        (total, result) => total + result.queuedCount,
        0
      );
      toast.success(
        queuedCount === 1
          ? "Advanced run queued."
          : `Advanced run queued across ${queuedCount} jobs.`
      );
      setAdvancedOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdvancedRunning(false);
    }
  };

  return (
    <RowControl>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${run.promptExcerpt}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onOpenRun(run._id)}>
              <Eye />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onRetryRun(run._id)}>
              <RotateCcw />
              Re-run
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openAdvanced}>
              <SlidersHorizontal />
              Advanced run
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {canCancel || canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {canCancel ? (
                  <DropdownMenuItem onClick={() => void onCancelRun(run._id)}>
                    <XCircle />
                    {run.status === "queued"
                      ? "Cancel queued run"
                      : "Cancel run"}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void onDeleteRun(run._id)}
                  >
                    <Trash2 />
                    Delete queued run
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Advanced run</DialogTitle>
            <DialogDescription>
              Select enabled providers and browser engines to queue parallel
              runs for this prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium">Providers</legend>
              {enabledProviderOptions.length ? (
                enabledProviderOptions.map((provider) => {
                  const inputId = `response-advanced-provider-${String(run._id)}-${provider.slug}`;
                  return (
                    <div
                      key={provider.slug}
                      className="flex min-w-0 items-center gap-2 rounded-md border p-2"
                    >
                      <Checkbox
                        id={inputId}
                        checked={selectedProviderSlugs.includes(provider.slug)}
                        onCheckedChange={(checked) =>
                          setSelectedProviderSlugs((current) =>
                            toggleSelection(
                              current,
                              provider.slug,
                              checked === true
                            )
                          )
                        }
                      />
                      <Label
                        htmlFor={inputId}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="truncate">{provider.name}</span>
                      </Label>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm">
                  No enabled providers.
                </p>
              )}
            </fieldset>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium">Engines</legend>
              {browserEngineOptions.map((engine) => {
                const inputId = `response-advanced-engine-${String(run._id)}-${engine.value}`;
                return (
                  <div
                    key={engine.value}
                    className="flex min-w-0 items-center gap-2 rounded-md border p-2"
                  >
                    <Checkbox
                      id={inputId}
                      checked={selectedEngines.includes(engine.value)}
                      onCheckedChange={(checked) =>
                        setSelectedEngines((current) =>
                          toggleSelection(
                            current,
                            engine.value,
                            checked === true
                          )
                        )
                      }
                    />
                    <Label
                      htmlFor={inputId}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="truncate">{engine.label}</span>
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdvancedOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canRunAdvanced}
              onClick={() => void runAdvanced()}
            >
              <Play data-icon="inline-start" />
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RowControl>
  );
}

function RowControl({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </span>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function toggleSelection<T extends string>(
  values: T[],
  value: T,
  checked: boolean
) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((item) => item !== value);
}

function formatScore(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value)}`;
}

function statusBadgeVariant(
  status: string
): "secondary" | "destructive" | "outline" {
  if (status === "success") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

function StatusIcon({
  status,
  className,
  ...props
}: {
  status: string;
} & ComponentProps<typeof CheckCircle2>) {
  if (status === "success") {
    return <CheckCircle2 className={className} {...props} />;
  }
  if (status === "failed") {
    return <CircleAlert className={className} {...props} />;
  }
  if (status === "blocked") {
    return <Ban className={className} {...props} />;
  }
  if (status === "running") {
    return (
      <LoaderCircle className={cn("animate-spin", className)} {...props} />
    );
  }
  if (status === "queued") {
    return <Clock3 className={className} {...props} />;
  }
  return <CircleDashed className={className} {...props} />;
}

function formatStatus(status: string) {
  if (status === "success") {
    return "Successful";
  }
  if (status === "failed") {
    return "Error";
  }
  return titleCase(status);
}

function resolveBrowserEngine(
  run: Pick<ResponseRow, "browserEngine" | "runner">
): BrowserEngine | undefined {
  if (run.browserEngine) {
    return run.browserEngine;
  }
  if (run.runner?.includes("camoufox")) {
    return "camoufox";
  }
  if (run.runner?.includes("nodriver")) {
    return "nodriver";
  }
  if (run.runner?.includes("playwright")) {
    return "playwright";
  }
  return undefined;
}

function formatBrowserEngine(engine: BrowserEngine | undefined) {
  if (engine === "camoufox") {
    return "Camoufox";
  }
  if (engine === "nodriver") {
    return "Nodriver";
  }
  if (engine === "playwright") {
    return "Playwright";
  }
  return "Unknown";
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatFreshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function formatCaptureTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(timestamp));
}

function formatShortTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
