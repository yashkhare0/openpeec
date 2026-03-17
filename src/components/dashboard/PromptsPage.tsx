import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowUpRightIcon } from "lucide-react";

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

function domainFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const typeTone: Record<string, string> = {
  ugc: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  editorial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  corporate: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  docs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  social: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  other: "bg-muted text-muted-foreground",
};

export function PromptsPage({
  groups,
  selectedGroup,
  onSelectGroup,
  rows,
  promptJobs,
  search,
  onSearch,
  runDetail,
  selectedRunId,
  onSelectRun,
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
    visibility?: number;
    citation?: number;
    latestRunAt?: number;
    latestRunId?: Id<"promptRuns">;
    active: boolean;
  }>;
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
  search: string;
  onSearch: (value: string) => void;
  runDetail:
    | {
        run: {
          status: string;
          startedAt: number;
          model: string;
          responseSummary?: string;
          sourceCount?: number;
          visibilityScore?: number;
          citationQualityScore?: number;
        };
        prompt?: {
          name: string;
          promptText: string;
        } | null;
        citations: Array<{
          domain: string;
          url: string;
          title?: string;
          snippet?: string;
          type: string;
          position: number;
          qualityScore?: number;
          isOwned?: boolean;
          trackedEntity?: {
            name: string;
            slug: string;
          } | null;
        }>;
      }
    | undefined;
  selectedRunId: Id<"promptRuns"> | null;
  onSelectRun: (value: Id<"promptRuns"> | null) => void;
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

  const renameGroup = async (
    id: Id<"promptGroups">,
    currentName: string
  ) => {
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
      <div className="grid gap-4 px-4 xl:grid-cols-[1fr_360px] lg:px-6">
        {/* Main prompts table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Prompts</CardTitle>
                <CardDescription>
                  Prompt-level visibility and citation quality.
                </CardDescription>
              </div>
              <Input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search prompts..."
                className="h-8 w-[220px]"
              />
            </div>
          </CardHeader>
          <CardContent>
            {/* Add prompt form */}
            <div className="mb-4 grid gap-2 rounded-lg border bg-muted/30 p-3 md:grid-cols-[1fr_1.6fr_120px_140px_auto]">
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
              <Select
                value={newPromptModel}
                onValueChange={onNewPromptModel}
              >
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
              <InlineEmpty text="No prompts yet. Add one above, then run the local monitor to collect real evidence." />
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
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Visibility</TableHead>
                    <TableHead className="text-right">Citation</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPromptIds.includes(row.id)}
                          onCheckedChange={(checked) =>
                            togglePrompt(row.id, checked === true)
                          }
                          aria-label={`Select ${row.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.group}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.model}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.visibility !== undefined
                          ? formatPercent(row.visibility)
                          : "No runs"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.citation !== undefined
                          ? Math.round(row.citation)
                          : "No runs"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.latestRunAt
                          ? formatFreshness(row.latestRunAt)
                          : "Not run"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant={
                              selectedRunId && row.latestRunId === selectedRunId
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              onSelectRun(row.latestRunId ?? null)
                            }
                            disabled={!row.latestRunId}
                          >
                            Inspect
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              void onUpdatePrompt({
                                id: row.id,
                                active: !row.active,
                              })
                                .then(() =>
                                  onNotice(
                                    row.active
                                      ? "Prompt paused."
                                      : "Prompt resumed."
                                  )
                                )
                                .catch((e: unknown) =>
                                  onNotice(errorMessage(e))
                                )
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
                                .then(() => onNotice("Prompt deleted."))
                                .catch((e: unknown) =>
                                  onNotice(errorMessage(e))
                                )
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

        {/* Right sidebar: groups + run detail */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Prompt Groups</CardTitle>
              <CardDescription>
                Group prompts for scoped reporting.
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
                <div
                  key={String(g._id)}
                  className="flex items-center gap-1"
                >
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
                Queue selected prompts now or save a recurring batch.
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
                      {selectedRows.length > 3 ? "…" : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {selectedRows.length
                      ? selectedRows.map((row) => row.model).join(" / ")
                      : "No selection"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2">
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
                    Leave the cron field blank to save a manual batch only.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void queueSelectedNow()}>
                    Queue now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void savePromptPlan()}
                  >
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium">{job.name}</p>
                            <Badge variant={job.enabled ? "default" : "secondary"}>
                              {job.enabled ? "Live" : "Paused"}
                            </Badge>
                            <Badge variant="outline">
                              {job.schedule || "Manual"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {job.promptCount} prompts
                            {job.lastTriggeredAt
                              ? ` | Last trigger ${formatFreshness(job.lastTriggeredAt)}`
                              : " | Never triggered"}
                            {job.lastQueuedCount
                              ? ` | Queued ${job.lastQueuedCount}`
                              : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {job.prompts.map((prompt) => prompt.name).join(", ")}
                          </p>
                        </div>
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
                              .catch((error: unknown) =>
                                onNotice(errorMessage(error))
                              )
                          }
                        >
                          Run now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void onUpdatePromptJob({
                              id: job._id,
                              enabled: !job.enabled,
                            })
                              .then(() =>
                                onNotice(
                                  job.enabled
                                    ? "Execution plan paused."
                                    : "Execution plan resumed."
                                )
                              )
                              .catch((error: unknown) =>
                                onNotice(errorMessage(error))
                              )
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
                              .catch((error: unknown) =>
                                onNotice(errorMessage(error))
                              )
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

          <Card>
            <CardHeader>
              <CardTitle>Run Detail</CardTitle>
              <CardDescription>
                Inspect citations from the selected run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!runDetail ? (
                <InlineEmpty text="Select a prompt run to inspect." />
              ) : (
                <>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {runDetail.prompt?.name ?? "Selected run"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {runDetail.run.model} | {titleCase(runDetail.run.status)} |{" "}
                          {formatFreshness(runDetail.run.startedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {runDetail.run.sourceCount ?? runDetail.citations.length} sources
                        </Badge>
                        {runDetail.run.visibilityScore !== undefined && (
                          <Badge variant="outline">
                            Visibility {Math.round(runDetail.run.visibilityScore)}%
                          </Badge>
                        )}
                        {runDetail.run.citationQualityScore !== undefined && (
                          <Badge variant="outline">
                            Citation {Math.round(runDetail.run.citationQualityScore)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {runDetail.prompt?.promptText ? (
                      <div className="mt-3 rounded-lg border bg-background/80 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          Prompt
                        </p>
                        <p className="mt-1 text-sm leading-6 text-foreground/90">
                          {runDetail.prompt.promptText}
                        </p>
                      </div>
                    ) : null}
                    {runDetail.run.responseSummary ? (
                      <div className="mt-3 rounded-lg border bg-background/80 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          Response Summary
                        </p>
                        <p className="mt-1 text-sm leading-6 text-foreground/90">
                          {runDetail.run.responseSummary}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {runDetail.citations.length === 0 ? (
                    <InlineEmpty text="No citations were captured for this run." />
                  ) : (
                    <div className="space-y-2">
                      {runDetail.citations.slice(0, 8).map((c, i) => (
                        <div
                          key={`${c.url}-${i}`}
                          className="rounded-xl border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">#{c.position}</Badge>
                                <p className="truncate text-sm font-medium">
                                  {c.title || c.domain}
                                </p>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {domainFromUrl(c.url) || c.domain}
                              </p>
                            </div>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              Open
                              <ArrowUpRightIcon className="size-3.5" />
                            </a>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge
                              variant="secondary"
                              className={typeTone[c.type.toLowerCase()] ?? ""}
                            >
                              {titleCase(c.type)}
                            </Badge>
                            {c.qualityScore !== undefined && (
                              <Badge variant="outline">
                                Quality {Math.round(c.qualityScore)}
                              </Badge>
                            )}
                            {c.isOwned ? (
                              <Badge variant="outline">Owned</Badge>
                            ) : null}
                            {c.trackedEntity ? (
                              <Badge variant="outline">
                                {c.trackedEntity.name}
                              </Badge>
                            ) : null}
                          </div>
                          {c.snippet ? (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {c.snippet}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
