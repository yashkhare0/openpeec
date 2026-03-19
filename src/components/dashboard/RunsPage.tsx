import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineEmpty } from "./components/EmptyState";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type RunRow = {
  _id: Id<"promptRuns">;
  promptId: Id<"prompts">;
  promptName: string;
  model: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  responseSummary?: string;
  citationQualityScore?: number;
  sourceCount?: number;
  citationCount: number;
  warnings?: string[];
  runLabel?: string;
};

export function RunsPage({
  loading = false,
  runs,
  selectedRunId,
  onOpenRun,
  onOpenPrompt,
}: {
  loading?: boolean;
  runs: RunRow[];
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filteredRuns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (status !== "all" && run.status !== status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return `${run.promptName} ${run.model} ${run.runLabel ?? ""} ${run.responseSummary ?? ""} ${(run.warnings ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [runs, search, status]);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-16" rows={6} columns={6} />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Runs</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search runs..."
                    className="h-8 w-[240px]"
                  />
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRuns.length === 0 ? (
                <InlineEmpty text="No runs match the current filters." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Runtime</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                      <TableHead className="text-right">Citation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRuns.map((run) => (
                      <TableRow
                        key={String(run._id)}
                        className={
                          selectedRunId === run._id ? "bg-muted/30" : ""
                        }
                        tabIndex={0}
                        onClick={() => onOpenRun(run._id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenRun(run._id);
                          }
                        }}
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">
                              {formatFreshness(run.startedAt)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatTimestamp(run.startedAt)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="hover:text-foreground text-left transition-colors"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenPrompt(run.promptId);
                            }}
                          >
                            <p className="font-medium">{run.promptName}</p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {run.model}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className={statusClassName(run.status)}>
                            {titleCase(run.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRuntime(run)}
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

function getRuntimeMs(
  run: Pick<RunRow, "latencyMs" | "startedAt" | "finishedAt">
) {
  if (typeof run.latencyMs === "number") {
    return run.latencyMs;
  }
  if (typeof run.finishedAt === "number") {
    return Math.max(0, run.finishedAt - run.startedAt);
  }
  return undefined;
}

function formatRuntime(
  run: Pick<RunRow, "latencyMs" | "startedAt" | "finishedAt">
) {
  return formatDuration(getRuntimeMs(run));
}

function formatDuration(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function formatScore(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value)}`;
}

function statusClassName(status: string) {
  if (status === "success") {
    return "text-sm font-medium text-emerald-700 dark:text-emerald-300";
  }
  if (status === "failed") {
    return "text-sm font-medium text-rose-700 dark:text-rose-300";
  }
  if (status === "blocked") {
    return "text-sm font-medium text-amber-700 dark:text-amber-300";
  }
  if (status === "running") {
    return "text-sm font-medium text-blue-700 dark:text-blue-300";
  }
  if (status === "queued") {
    return "text-sm font-medium text-amber-700 dark:text-amber-300";
  }
  return "text-sm font-medium";
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

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
