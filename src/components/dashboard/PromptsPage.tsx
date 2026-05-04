import { useState, type KeyboardEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { MoreHorizontal, Play } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import {
  clickableTableRowClassName,
  InfoTooltip,
} from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type PromptRow = {
  id: Id<"prompts">;
  excerpt: string;
  runCount: number;
  sourceDiversity: number;
  topEntities: string[];
  active: boolean;
};

type BrowserEngine = "camoufox" | "nodriver" | "playwright";

const browserEngineOptions: Array<{ value: BrowserEngine; label: string }> = [
  { value: "camoufox", label: "Camoufox" },
  { value: "nodriver", label: "Nodriver" },
  { value: "playwright", label: "Playwright" },
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function PromptActions({
  row,
  onRun,
  onToggle,
  onDelete,
}: {
  row: PromptRow;
  onRun: (
    promptId: Id<"prompts">,
    label: string,
    browserEngine: BrowserEngine
  ) => Promise<void>;
  onToggle: (row: PromptRow) => Promise<void>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipPrimitive.Trigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${row.excerpt}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </TooltipPrimitive.Trigger>
        </DropdownMenuTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {browserEngineOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => void onRun(row.id, row.excerpt, option.value)}
          >
            <Play />
            Run all providers with {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => void onToggle(row)}>
          {row.active ? "Pause" : "Resume"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void onDelete(row)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  promptId: Id<"prompts">,
  onSelectPrompt: (value: Id<"prompts"> | null) => void
) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  onSelectPrompt(promptId);
}

function MetricHead({
  label,
  tooltip,
  className,
}: {
  label: string;
  tooltip: string;
  className: string;
}) {
  return (
    <TableHead className={className}>
      <div className="flex items-center justify-end gap-1">
        {label}
        <InfoTooltip label={`${label} metric`}>{tooltip}</InfoTooltip>
      </div>
    </TableHead>
  );
}

function PromptTable({
  rows,
  selectedPromptId,
  onSelectPrompt,
  onRun,
  onToggle,
  onDelete,
}: {
  rows: PromptRow[];
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  onRun: (
    promptId: Id<"prompts">,
    label: string,
    browserEngine: BrowserEngine
  ) => Promise<void>;
  onToggle: (row: PromptRow) => Promise<void>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[640px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            <MetricHead
              label="Runs"
              tooltip="Total runs."
              className="w-[110px] text-right"
            />
            <MetricHead
              label="Sources"
              tooltip="Unique citation sources."
              className="w-[120px] text-right"
            />
            <MetricHead
              label="Entities"
              tooltip="Tracked entities found."
              className="w-[120px] text-right"
            />
            <TableHead className="w-[92px]">State</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={String(row.id)}
              tabIndex={0}
              aria-label={`Open prompt details for ${row.excerpt}`}
              aria-selected={selectedPromptId === row.id}
              className={cn(
                clickableTableRowClassName,
                selectedPromptId === row.id && "bg-muted/30"
              )}
              onClick={() => onSelectPrompt(row.id)}
              onKeyDown={(event) =>
                handleRowKeyDown(event, row.id, onSelectPrompt)
              }
            >
              <TableCell className="whitespace-normal">
                <div className="line-clamp-2 font-medium break-words">
                  {row.excerpt}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.runCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.sourceDiversity}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.topEntities.length}
              </TableCell>
              <TableCell>
                {row.active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Paused</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PromptActions
                  row={row}
                  onRun={onRun}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PromptsPage({
  loading = false,
  rows,
  selectedPromptId,
  onSelectPrompt,
  createOpen,
  onCreateOpenChange,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onTriggerSelectedNow,
}: {
  loading?: boolean;
  rows: PromptRow[];
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onCreatePrompt: (args: {
    promptText: string;
    active?: boolean;
  }) => Promise<Id<"prompts">>;
  onUpdatePrompt: (args: {
    id: Id<"prompts">;
    active?: boolean;
  }) => Promise<Id<"prompts">>;
  onDeletePrompt: (args: { id: Id<"prompts"> }) => Promise<Id<"prompts">>;
  onTriggerSelectedNow: (args: {
    promptIds: Array<Id<"prompts">>;
    label?: string;
    browserEngine?: BrowserEngine;
  }) => Promise<{ queuedCount: number }>;
}) {
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const isCreateOpen = createOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const queuePrompt = async (
    promptId: Id<"prompts">,
    label: string,
    browserEngine: BrowserEngine
  ) => {
    try {
      const result = await onTriggerSelectedNow({
        promptIds: [promptId],
        label,
        browserEngine,
      });
      const engineLabel =
        browserEngineOptions.find((option) => option.value === browserEngine)
          ?.label ?? "Selected engine";
      toast.success(
        result.queuedCount === 1
          ? `${engineLabel} run queued.`
          : `${engineLabel} run queued across ${result.queuedCount} providers.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const togglePrompt = async (row: PromptRow) => {
    try {
      await onUpdatePrompt({ id: row.id, active: !row.active });
      toast.success(row.active ? "Prompt paused." : "Prompt resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removePrompt = async (row: PromptRow) => {
    try {
      await onDeletePrompt({ id: row.id });
      toast.success("Prompt deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createPrompt = async () => {
    if (!newPromptText.trim()) {
      toast.error("Prompt text is required.");
      return;
    }

    try {
      await onCreatePrompt({
        promptText: newPromptText.trim(),
      });
      setNewPromptText("");
      setCreateOpen(false);
      toast.success("Prompt created.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="min-w-0 px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton
            titleWidth="w-24"
            controlsWidth="w-[420px]"
            rows={6}
            columns={6}
          />
        ) : (
          <Card className="min-w-0">
            <CardContent className="min-w-0">
              {rows.length === 0 ? (
                <InlineEmpty text="No prompts yet. Add one to start tracking visibility." />
              ) : (
                <PromptTable
                  rows={rows}
                  selectedPromptId={selectedPromptId}
                  onSelectPrompt={onSelectPrompt}
                  onRun={queuePrompt}
                  onToggle={togglePrompt}
                  onDelete={removePrompt}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New prompt</DialogTitle>
            <DialogDescription>
              Runs on every enabled provider.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt-text">Prompt text</Label>
            <Textarea
              id="prompt-text"
              value={newPromptText}
              onChange={(event) => setNewPromptText(event.target.value)}
              placeholder="Ask about your brand, product, or category..."
              rows={8}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => void createPrompt()}>Create prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
