import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { FolderPlus, MoreHorizontal, Play, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { InlineEmpty } from "./components/EmptyState";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

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
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

export function PromptsPage({
  loading = false,
  groups,
  selectedGroup,
  onSelectGroup,
  rows,
  selectedPromptId,
  onSelectPrompt,
  search,
  onSearch,
  onCreateGroup,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onTriggerSelectedNow,
}: {
  loading?: boolean;
  groups: Array<{ _id: Id<"promptGroups">; name: string }>;
  selectedGroup: Id<"promptGroups"> | "all";
  onSelectGroup: (value: Id<"promptGroups"> | "all") => void;
  rows: Array<{
    id: Id<"prompts">;
    name: string;
    group: string;
    model: string;
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
  search: string;
  onSearch: (value: string) => void;
  onCreateGroup: (args: { name: string }) => Promise<Id<"promptGroups">>;
  onCreatePrompt: (args: {
    name: string;
    promptText: string;
    targetModel: string;
    groupId?: Id<"promptGroups">;
  }) => Promise<Id<"prompts">>;
  onUpdatePrompt: (args: {
    id: Id<"prompts">;
    active?: boolean;
    groupId?: Id<"promptGroups">;
  }) => Promise<Id<"prompts">>;
  onDeletePrompt: (args: { id: Id<"prompts"> }) => Promise<Id<"prompts">>;
  onTriggerSelectedNow: (args: {
    promptIds: Array<Id<"prompts">>;
    label?: string;
  }) => Promise<{ queuedCount: number }>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [groupPickerPromptId, setGroupPickerPromptId] =
    useState<Id<"prompts"> | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptModel, setNewPromptModel] = useState("gpt-5");
  const [newPromptGroup, setNewPromptGroup] = useState<
    Id<"promptGroups"> | "none"
  >("none");

  const topGroups = groups.slice(0, 5);
  const selectedRow =
    rows.find((row) => row.id === groupPickerPromptId) ?? null;

  const queuePrompt = async (promptId: Id<"prompts">, label: string) => {
    try {
      const result = await onTriggerSelectedNow({
        promptIds: [promptId],
        label,
      });
      toast.success(
        result.queuedCount === 1
          ? "Prompt queued."
          : `${result.queuedCount} prompts queued.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const assignPromptToGroup = async (
    promptId: Id<"prompts">,
    groupId?: Id<"promptGroups">,
    successMessage?: string
  ) => {
    try {
      await onUpdatePrompt({ id: promptId, groupId });
      toast.success(
        successMessage ??
          (groupId ? "Prompt added to group." : "Prompt removed from group.")
      );
      setGroupPickerPromptId(null);
      setNewGroupName("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createGroupAndAssign = async () => {
    if (!groupPickerPromptId) return;
    if (!newGroupName.trim()) {
      toast.error("Group name is required.");
      return;
    }
    try {
      const groupId = await onCreateGroup({ name: newGroupName.trim() });
      setNewGroupName("");
      await assignPromptToGroup(
        groupPickerPromptId,
        groupId,
        "Group created and prompt assigned."
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createPrompt = async () => {
    if (!newPromptName.trim() || !newPromptText.trim()) {
      toast.error("Prompt name and prompt text are required.");
      return;
    }
    try {
      await onCreatePrompt({
        name: newPromptName.trim(),
        promptText: newPromptText.trim(),
        targetModel: newPromptModel,
        groupId: newPromptGroup === "none" ? undefined : newPromptGroup,
      });
      setNewPromptName("");
      setNewPromptText("");
      setNewPromptModel("gpt-5");
      setNewPromptGroup("none");
      setCreateOpen(false);
      toast.success("Prompt created.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton
            titleWidth="w-24"
            controlsWidth="w-[420px]"
            rows={6}
            columns={7}
          />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Prompts</CardTitle>
                  <CardDescription>
                    One row per prompt, with the latest response and a compact
                    actions menu.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selectedGroup}
                    onValueChange={(value) =>
                      onSelectGroup(value as Id<"promptGroups"> | "all")
                    }
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="All groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All groups</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={String(group._id)} value={group._id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search prompts..."
                    className="h-8 w-[240px]"
                  />
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    New prompt
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <InlineEmpty text="No prompts yet. Add one to start capturing real responses and source evidence." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Latest run</TableHead>
                      <TableHead className="text-right">Responses</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                      <TableHead className="text-right">Drift</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={String(row.id)}
                        className={
                          selectedPromptId === row.id ? "bg-muted/40" : ""
                        }
                        onClick={() => onSelectPrompt(row.id)}
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {row.model}
                            </p>
                            {!row.active ? (
                              <Badge variant="outline">Paused</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{row.group}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge
                              variant="secondary"
                              className={
                                statusTone[row.latestStatus ?? ""] ?? ""
                              }
                            >
                              {titleCase(row.latestStatus ?? "not_run")}
                            </Badge>
                            <p className="text-muted-foreground text-xs">
                              {row.latestRunAt
                                ? formatFreshness(row.latestRunAt)
                                : "No run yet"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.responseCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.sourceDiversity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.responseDrift)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={`Actions for ${row.name}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem
                                  onClick={() =>
                                    void queuePrompt(row.id, row.name)
                                  }
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Run
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <FolderPlus className="mr-2 h-4 w-4" />
                                    Add to group
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="w-56">
                                    {topGroups.map((group) => (
                                      <DropdownMenuItem
                                        key={String(group._id)}
                                        onClick={() =>
                                          void assignPromptToGroup(
                                            row.id,
                                            group._id
                                          )
                                        }
                                      >
                                        {group.name}
                                      </DropdownMenuItem>
                                    ))}
                                    {groups.length > topGroups.length ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          setGroupPickerPromptId(row.id)
                                        }
                                      >
                                        View all
                                      </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setGroupPickerPromptId(row.id)
                                      }
                                    >
                                      Create a new group
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void assignPromptToGroup(
                                          row.id,
                                          undefined
                                        )
                                      }
                                    >
                                      Remove from group
                                    </DropdownMenuItem>
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    void onUpdatePrompt({
                                      id: row.id,
                                      active: !row.active,
                                    })
                                      .then(() =>
                                        toast.success(
                                          row.active
                                            ? "Prompt paused."
                                            : "Prompt resumed."
                                        )
                                      )
                                      .catch((error: unknown) =>
                                        toast.error(errorMessage(error))
                                      )
                                  }
                                >
                                  {row.active ? "Pause" : "Resume"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    void onDeletePrompt({ id: row.id })
                                      .then(() => {
                                        if (selectedPromptId === row.id) {
                                          onSelectPrompt(null);
                                        }
                                        toast.success("Prompt deleted.");
                                      })
                                      .catch((error: unknown) =>
                                        toast.error(errorMessage(error))
                                      )
                                  }
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New prompt</SheetTitle>
            <SheetDescription>
              Create a prompt with only the fields the backend actually uses.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <Input
              value={newPromptName}
              onChange={(e) => setNewPromptName(e.target.value)}
              placeholder="Prompt name"
              className="h-8"
            />
            <Textarea
              value={newPromptText}
              onChange={(e) => setNewPromptText(e.target.value)}
              placeholder="Prompt text"
              className="min-h-24 text-sm"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={newPromptModel} onValueChange={setNewPromptModel}>
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
                onValueChange={(value) =>
                  setNewPromptGroup(value as Id<"promptGroups"> | "none")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={String(group._id)} value={group._id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => void createPrompt()}>
              Create prompt
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={groupPickerPromptId !== null}
        onOpenChange={(open) => !open && setGroupPickerPromptId(null)}
      >
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Add to group</SheetTitle>
            <SheetDescription>
              {selectedRow
                ? `Assign "${selectedRow.name}" to an existing group or create a new one.`
                : "Assign this prompt to a group."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                groupPickerPromptId
                  ? void assignPromptToGroup(groupPickerPromptId, undefined)
                  : undefined
              }
            >
              No group
            </Button>
            {groups.map((group) => (
              <Button
                key={String(group._id)}
                variant="outline"
                className="w-full justify-start"
                onClick={() =>
                  groupPickerPromptId
                    ? void assignPromptToGroup(groupPickerPromptId, group._id)
                    : undefined
                }
              >
                {group.name}
              </Button>
            ))}
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm font-medium">Create new group</p>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                className="h-8"
              />
              <Button
                className="w-full"
                onClick={() => void createGroupAndAssign()}
              >
                Create and assign
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
