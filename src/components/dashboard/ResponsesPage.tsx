import { useMemo, useState, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
};

export function ResponsesPage({
  loading = false,
  runs,
  selectedRunId,
  onOpenRun,
  onOpenPrompt,
}: {
  loading?: boolean;
  runs: ResponseRow[];
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredRuns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return runs;
    }
    return runs.filter((run) =>
      `${run.promptExcerpt} ${run.providerName} ${run.responseSummary ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [runs, search]);

  const responseRuns = useMemo(
    () =>
      filteredRuns.filter(
        (run) =>
          run.status === "success" ||
          run.status === "failed" ||
          !!run.responseSummary
      ),
    [filteredRuns]
  );

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-24" rows={6} columns={5} />
        ) : (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  className="h-8 w-[240px]"
                />
              </div>
              {responseRuns.length === 0 ? (
                <InlineEmpty text="No responses captured yet." />
              ) : (
                <Table className="min-w-[820px] table-fixed">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-[28%]" />
                    <col />
                    <col className="w-[104px]" />
                    <col className="w-[116px]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
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
                          <div className="flex flex-col gap-1.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0",
                                  statusTone(run.status)
                                )}
                              >
                                {titleCase(run.status)}
                              </Badge>
                              <span className="text-muted-foreground min-w-0 truncate text-xs">
                                {run.providerName}
                              </span>
                            </div>
                            <div className="text-muted-foreground flex items-center gap-1 text-xs">
                              <span>{formatFreshness(run.startedAt)}</span>
                              <RowControl>
                                <InfoTooltip label="Capture time">
                                  {formatCaptureTime(run.startedAt)}
                                </InfoTooltip>
                              </RowControl>
                            </div>
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

function formatScore(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value)}`;
}

function statusTone(status: string): string {
  if (status === "success") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "failed") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (status === "blocked") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "running") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  return "";
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
