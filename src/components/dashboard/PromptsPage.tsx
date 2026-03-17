import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function PromptsPage({
  groups,
  selectedGroup,
  onSelectGroup,
  rows,
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
  search: string;
  onSearch: (value: string) => void;
  runDetail:
    | {
        run: { status: string; startedAt: number; model: string };
        citations: Array<{
          domain: string;
          position: number;
          qualityScore?: number;
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
  onNotice: (text: string) => void;
}) {
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

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 xl:grid-cols-[1fr_340px] lg:px-6">
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
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
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
                  <div className="rounded-md border p-3">
                    <p className="font-medium">{runDetail.run.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {titleCase(runDetail.run.status)} |{" "}
                      {formatFreshness(runDetail.run.startedAt)}
                    </p>
                  </div>
                  {runDetail.citations.slice(0, 5).map((c, i) => (
                    <div
                      key={`${c.domain}-${i}`}
                      className="rounded-md border p-3"
                    >
                      <p className="text-sm font-medium">{c.domain}</p>
                      <p className="text-xs text-muted-foreground">
                        Position #{c.position}
                        {c.qualityScore !== undefined
                          ? ` | Quality ${Math.round(c.qualityScore)}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
