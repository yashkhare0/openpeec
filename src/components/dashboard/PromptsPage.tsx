import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function formatFreshness(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

const statusTone: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

export function PromptsPage({
  groups,
  selectedGroup,
  onSelectGroup,
  rows,
  selectedPromptId,
  onSelectPrompt,
  promptJobs,
  queueSummary,
  search,
  onSearch,
  newGroupName,
  onNewGroupName,
  newPromptName,
  onNewPromptName,
  newPromptText,
  onNewPromptText,
  newPromptModel,
  onNewPromptModel,
  newPromptGroup,
  onNewPromptGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onCreatePromptJob,
  onUpdatePromptJob,
  onDeletePromptJob,
  onTriggerSelectedNow,
  onTriggerPromptJobNow,
  onNotice,
}: {
  groups: Array<{ _id: Id<"promptGroups">; name: string }>;
  selectedGroup: Id<"promptGroups"> | "all";
  onSelectGroup: (value: Id<"promptGroups"> | "all") => void;
  rows: Array<{
    id: Id<"prompts">;
    name: string;
    group: string;
    model: string;
    latestVisibility?: number;
    latestCitationQuality?: number;
    latestRunAt?: number;
    latestRunId?: Id<"promptRuns">;
    latestStatus?: string;
    latestResponseSummary?: string;
    latestSourceCount?: number;
    responseCount: number;
    sourceDiversity: number;
    topSources: string[];
    topEntities: string[];
    responseDrift?: number;
    sourceVariance?: number;
    active: boolean;
  }>;
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  promptJobs: Array<{
    _id: Id<"promptJobs">;
    name: string;
    promptIds: Array<Id<"prompts">>;
    promptCount: number;
    schedule?: string;
    enabled: boolean;
    lastTriggeredAt?: number;
    lastQueuedCount?: number;
    prompts: Array<{
      id: Id<"prompts">;
      name: string;
      model: string;
    }>;
  }>;
  queueSummary: {
    queuedCount: number;
    runningCount: number;
    latestCompletedAt?: number;
  };
  search: string;
  onSearch: (value: string) => void;
  newGroupName: string;
  onNewGroupName: (value: string) => void;
  newPromptName: string;
  onNewPromptName: (value: string) => void;
  newPromptText: string;
  onNewPromptText: (value: string) => void;
  newPromptModel: string;
  onNewPromptModel: (value: string) => void;
  newPromptGroup: Id<"promptGroups"> | "none";
  onNewPromptGroup: (value: Id<"promptGroups"> | "none") => void;
  onCreateGroup: (args: { name: string }) => Promise<Id<"promptGroups">>;
  onUpdateGroup: (args: {
    id: Id<"promptGroups">;
    name?: string;
  }) => Promise<Id<"promptGroups">>;
  onDeleteGroup: (args: {
    id: Id<"promptGroups">;
  }) => Promise<Id<"promptGroups">>;
  onCreatePrompt: (args: {
    name: string;
    promptText: string;
    targetModel: string;
    groupId?: Id<"promptGroups">;
  }) => Promise<Id<"prompts">>;
  onUpdatePrompt: (args: {
    id: Id<"prompts">;
    active?: boolean;
  }) => Promise<Id<"prompts">>;
  onDeletePrompt: (args: { id: Id<"prompts"> }) => Promise<Id<"prompts">>;
  onCreatePromptJob: (args: {
    name: string;
    promptIds: Array<Id<"prompts">>;
    schedule?: string;
    enabled?: boolean;
  }) => Promise<Id<"promptJobs">>;
  onUpdatePromptJob: (args: {
    id: Id<"promptJobs">;
    name?: string;
    promptIds?: Array<Id<"prompts">>;
    schedule?: string;
    enabled?: boolean;
  }) => Promise<Id<"promptJobs">>;
  onDeletePromptJob: (args: { id: Id<"promptJobs"> }) => Promise<Id<"promptJobs">>;
  onTriggerSelectedNow: (args: {
    promptIds: Array<Id<"prompts">>;
    label?: string;
  }) => Promise<{ queuedCount: number }>;
  onTriggerPromptJobNow: (args: {
    id: Id<"promptJobs">;
  }) => Promise<{ queuedCount: number }>;
  onNotice: (text: string) => void;
}) {
  const [selectedPromptIds, setSelectedPromptIds] = useState<Array<Id<"prompts">>>([]);
  const [jobName, setJobName] = useState("");
  const [jobSchedule, setJobSchedule] = useState("0 9 * * 1-5");

  useEffect(() => {
    setSelectedPromptIds((current) =>
      current.filter((id) => rows.some((row) => row.id === id))
    );
  }, [rows]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedPromptIds.includes(row.id));
  const selectedCount = selectedPromptIds.length;
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedPromptIds.includes(row.id)),
    [rows, selectedPromptIds]
  );

  const createGroup = async () => {
    if (!newGroupName.trim()) return onNotice("Group name is required.");
    try {
      await onCreateGroup({ name: newGroupName.trim() });
      onNewGroupName("");
      onNotice("Prompt group created.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  const createPrompt = async () => {
    if (!newPromptName.trim() || !newPromptText.trim()) {
      return onNotice("Prompt name and prompt text are required.");
    }
    try {
      await onCreatePrompt({
        name: newPromptName.trim(),
        promptText: newPromptText.trim(),
        targetModel: newPromptModel,
        groupId: newPromptGroup === "none" ? undefined : newPromptGroup,
      });
      onNewPromptName("");
      onNewPromptText("");
      onNotice("Prompt created.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  const renameGroup = async (id: Id<"promptGroups">, currentName: string) => {
    const next = window.prompt("New group name", currentName);
    if (!next || next.trim() === currentName) return;
    try {
      await onUpdateGroup({ id, name: next.trim() });
      onNotice("Prompt group updated.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  const togglePrompt = (id: Id<"prompts">, checked: boolean) => {
    setSelectedPromptIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    );
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedPromptIds((current) => {
      if (checked) {
        return [...new Set([...current, ...rows.map((row) => row.id)])];
      }
      return current.filter((id) => !rows.some((row) => row.id === id));
    });
  };

  const queueSelectedNow = async () => {
    if (!selectedCount) {
      onNotice("Select at least one prompt to queue.");
      return;
    }
    try {
      const result = await onTriggerSelectedNow({
        promptIds: selectedPromptIds,
        label: jobName.trim() || "Manual run",
      });
      onNotice(`${result.queuedCount} prompt runs queued.`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  const savePromptPlan = async () => {
    if (!selectedCount) {
      onNotice("Select at least one prompt to schedule.");
      return;
    }
    try {
      await onCreatePromptJob({
        name: jobName.trim() || `Prompt batch (${selectedCount})`,
        promptIds: selectedPromptIds,
        schedule: jobSchedule.trim() || undefined,
        enabled: true,
      });
      setJobName("");
      onNotice("Execution plan saved.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 xl:grid-cols-[minmax(0,1.15fr)_360px] lg:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Prompts</CardTitle>
                <CardDescription>
                  Select a prompt to inspect its response history, source mix, and
                  brand/entity mentions.
                </CardDescription>
              </div>
              <Input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search prompts, sources, or entities..."
                className="h-8 w-[280px]"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 md:grid-cols-[1fr_1.6fr_120px_150px_auto]">
              <Input
                value={newPromptName}
                onChange={(e) => onNewPromptName(e.target.value)}
                placeholder="Prompt name"
                className="h-8"
              />
              <Textarea
                value={newPromptText}
                onChange={(e) => onNewPromptText(e.target.value)}
                placeholder="Prompt text"
                className="min-h-8 py-2 text-sm"
              />
              <Select value={newPromptModel} onValueChange={onNewPromptModel}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["gpt-5", "gpt-4.1", "o3"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newPromptGroup}
                onValueChange={(v) =>
                  onNewPromptGroup(v as Id<"promptGroups"> | "none")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={String(g._id)} value={g._id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void createPrompt()}>
                Add prompt
              </Button>
            </div>

            {rows.length === 0 ? (
              <InlineEmpty text="No prompts yet. Add one above, then run the local monitor to collect real responses and source evidence." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                        aria-label="Select all prompts"
                      />
                    </TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Latest response</TableHead>
                    <TableHead>Top sources</TableHead>
                    <TableHead>Brands</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={String(row.id)}
                      className={cn(
                        "cursor-pointer",
                        selectedPromptId === row.id && "bg-muted/40"
                      )}
                      onClick={() => onSelectPrompt(row.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPromptIds.includes(row.id)}
                          onCheckedChange={(checked) =>
                            togglePrompt(row.id, checked === true)
                          }
                          aria-label={`Select ${row.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{row.name}</p>
                            <Badge variant="secondary">{row.model}</Badge>
                            <Badge variant="outline">{row.group}</Badge>
                            {!row.active ? <Badge variant="outline">Paused</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {row.responseCount} responses captured
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant="secondary"
                              className={statusTone[row.latestStatus ?? ""] ?? ""}
                            >
                              {titleCase(row.latestStatus ?? "not_run")}
                            </Badge>
                            {row.latestVisibility !== undefined ? (
                              <Badge variant="outline">
                                Visibility {formatPercent(row.latestVisibility)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {row.latestResponseSummary || "No completed response yet."}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.latestRunAt
                              ? `Last response ${formatFreshness(row.latestRunAt)}`
                              : "No response yet"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline">
                              {row.sourceDiversity} domains
                            </Badge>
                            <Badge variant="outline">
                              {row.latestSourceCount ?? 0} in latest
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {row.topSources.length
                              ? row.topSources.join(", ")
                              : "No sources extracted yet."}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.topEntities.length ? (
                            row.topEntities.slice(0, 3).map((entity) => (
                              <Badge key={`${row.id}-${entity}`} variant="outline">
                                {entity}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline">No tracked mentions</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1 tabular-nums">
                          <p>{formatPercent(row.responseDrift)}</p>
                          <p className="text-xs text-muted-foreground">
                            source {formatPercent(row.sourceVariance)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => onSelectPrompt(row.id)}
                          >
                            Open
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              void onUpdatePrompt({ id: row.id, active: !row.active })
                                .then(() =>
                                  onNotice(row.active ? "Prompt paused." : "Prompt resumed.")
                                )
                                .catch((e: unknown) => onNotice(errorMessage(e)))
                            }
                          >
                            {row.active ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={() =>
                              void onDeletePrompt({ id: row.id })
                                .then(() => {
                                  if (selectedPromptId === row.id) onSelectPrompt(null);
                                  onNotice("Prompt deleted.");
                                })
                                .catch((e: unknown) => onNotice(errorMessage(e)))
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Prompt Groups</CardTitle>
              <CardDescription>
                Group prompts for scoped reporting and analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newGroupName}
                  onChange={(e) => onNewGroupName(e.target.value)}
                  placeholder="New group name"
                  className="h-8"
                />
                <Button size="sm" onClick={() => void createGroup()}>
                  Add
                </Button>
              </div>
              <Separator />
              <button
                type="button"
                onClick={() => onSelectGroup("all")}
                className={cn(
                  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors",
                  selectedGroup === "all"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                All prompts
              </button>
              {groups.map((g) => (
                <div key={String(g._id)} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectGroup(g._id)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selectedGroup === g._id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {g.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void renameGroup(g._id, g.name)}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() =>
                      void onDeleteGroup({ id: g._id })
                        .then(() => onNotice("Group deleted."))
                        .catch((e: unknown) => onNotice(errorMessage(e)))
                    }
                  >
                    Del
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Execution Plans</CardTitle>
              <CardDescription>
                Queue one run per prompt now, or save a recurring prompt batch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {selectedCount} prompt{selectedCount === 1 ? "" : "s"} selected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedRows.length
                        ? selectedRows.slice(0, 3).map((row) => row.name).join(", ")
                        : "Select prompt rows to build a batch."}
                      {selectedRows.length > 3 ? "..." : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {selectedRows.length
                      ? selectedRows.map((row) => row.model).join(" / ")
                      : "No selection"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{queueSummary.queuedCount} queued</Badge>
                    <Badge variant="outline">{queueSummary.runningCount} running</Badge>
                    <Badge variant="secondary">
                      {queueSummary.latestCompletedAt
                        ? `Last completion ${formatFreshness(queueSummary.latestCompletedAt)}`
                        : "No completed runs yet"}
                    </Badge>
                  </div>
                  <Input
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="Batch name"
                    className="h-8"
                  />
                  <Input
                    value={jobSchedule}
                    onChange={(e) => setJobSchedule(e.target.value)}
                    placeholder="Cron schedule, e.g. 0 9 * * 1-5"
                    className="h-8 font-mono text-xs"
                  />
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    Leave the cron field blank to save a manual batch only. Run{" "}
                    <span className="font-mono">pnpm runner:queue</span> locally
                    to process queued prompts.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void queueSelectedNow()}>
                    Queue now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void savePromptPlan()}>
                    Save plan
                  </Button>
                </div>
              </div>

              {promptJobs.length === 0 ? (
                <InlineEmpty text="No saved execution plans yet." />
              ) : (
                <div className="space-y-2">
                  {promptJobs.map((job) => (
                    <div key={String(job._id)} className="rounded-xl border p-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium">{job.name}</p>
                          <Badge variant={job.enabled ? "default" : "secondary"}>
                            {job.enabled ? "Live" : "Paused"}
                          </Badge>
                          <Badge variant="outline">{job.schedule || "Manual"}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {job.promptCount} prompts
                          {job.lastTriggeredAt
                            ? ` | Last trigger ${formatFreshness(job.lastTriggeredAt)}`
                            : " | Never triggered"}
                          {job.lastQueuedCount ? ` | Queued ${job.lastQueuedCount}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.prompts.map((prompt) => prompt.name).join(", ")}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void onTriggerPromptJobNow({ id: job._id })
                              .then((result) =>
                                onNotice(`${result.queuedCount} prompt runs queued.`)
                              )
                              .catch((error: unknown) => onNotice(errorMessage(error)))
                          }
                        >
                          Run now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void onUpdatePromptJob({ id: job._id, enabled: !job.enabled })
                              .then(() =>
                                onNotice(
                                  job.enabled
                                    ? "Execution plan paused."
                                    : "Execution plan resumed."
                                )
                              )
                              .catch((error: unknown) => onNotice(errorMessage(error)))
                          }
                        >
                          {job.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() =>
                            void onDeletePromptJob({ id: job._id })
                              .then(() => onNotice("Execution plan deleted."))
                              .catch((error: unknown) => onNotice(errorMessage(error)))
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
