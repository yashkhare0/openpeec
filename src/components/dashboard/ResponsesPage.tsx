import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type ResponseRow = {
  _id: Id<"promptRuns">;
  promptId: Id<"prompts">;
  promptName: string;
  model: string;
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
      `${run.promptName} ${run.model} ${run.responseSummary ?? ""}`
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
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Responses</CardTitle>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search responses..."
                  className="h-8 w-[240px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              {responseRuns.length === 0 ? (
                <InlineEmpty text="No responses captured yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Captured</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                      <TableHead className="text-right">Citation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responseRuns.map((run) => (
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
                              {titleCase(run.status)} | {run.model}
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
                          </button>
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-2 text-sm">
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

function formatScore(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value)}`;
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
