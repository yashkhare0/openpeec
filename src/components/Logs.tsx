import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { formatDate } from "../utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const statusClass: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function Logs() {
  const { isAuthenticated } = useConvexAuth();
  const runs =
    useQuery(
      api.monitoring.listMonitorRuns,
      isAuthenticated ? { limit: 20 } : "skip"
    ) ?? [];
  const monitors =
    useQuery(api.monitoring.listMonitors, isAuthenticated ? {} : "skip") ?? [];

  const monitorNames = new Map(monitors.map((monitor) => [monitor._id, monitor.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Runs</CardTitle>
        <CardDescription>
          Latest run history emitted by ChatGPT monitor definitions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Monitor</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length ? (
              runs.map((run) => (
                <TableRow key={run._id}>
                  <TableCell>{formatDate(run.startedAt)}</TableCell>
                  <TableCell>{monitorNames.get(run.monitorId) || run.monitorId}</TableCell>
                  <TableCell>{run.platform.toUpperCase()}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${statusClass[run.status] ?? statusClass.queued}`}
                    >
                      {run.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {typeof run.latencyMs === "number"
                      ? `${Math.round(run.latencyMs)} ms`
                      : "n/a"}
                  </TableCell>
                  <TableCell className="max-w-[400px] truncate">
                    {run.summary || "No summary"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No monitor runs recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
