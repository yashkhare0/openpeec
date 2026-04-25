import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { MoreHorizontal, Play } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { InlineEmpty } from "./components/EmptyState";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type PromptRow = {
  id: Id<"prompts">;
  excerpt: string;
  providerCount: number;
  providerNames: string[];
  latestProviderName?: string;
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
};

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
  blocked: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

const COMPACT_PROMPTS_QUERY = "(max-width: 1279px)";

function useCompactPromptsLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(COMPACT_PROMPTS_QUERY).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_PROMPTS_QUERY);
    const update = () => setCompact(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return compact;
}

function activateRowOnKey(
  event: KeyboardEvent<HTMLElement>,
  callback: () => void
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}

function getProviderLabel(row: PromptRow): string {
  if (row.providerCount === 1) {
    return row.providerNames[0] ?? "1 provider";
  }

  return `${row.providerCount} active providers`;
}

function PromptActions({
  row,
  compact = false,
  onRun,
  onToggle,
  onDelete,
}: {
  row: PromptRow;
  compact?: boolean;
  onRun: (promptId: Id<"prompts">, label: string) => Promise<void>;
  onToggle: (row: PromptRow) => Promise<void>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "icon-sm"}
          className={compact ? "size-11" : undefined}
          aria-label={`Actions for ${row.excerpt}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={() => void onRun(row.id, row.excerpt)}>
          <Play className="size-4" />
          Run
        </DropdownMenuItem>
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
  onRun: (promptId: Id<"prompts">, label: string) => Promise<void>;
  onToggle: (row: PromptRow) => Promise<void>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  return (
    <Table className="min-w-[920px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[38%]">Prompt</TableHead>
          <TableHead className="w-[170px]">Providers</TableHead>
          <TableHead className="w-[140px]">Latest</TableHead>
          <TableHead className="w-[96px] text-right">Responses</TableHead>
          <TableHead className="w-[84px] text-right">Sources</TableHead>
          <TableHead className="w-[90px] text-right">Citation</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={String(row.id)}
            className={selectedPromptId === row.id ? "bg-muted/30" : ""}
            tabIndex={0}
            onClick={() => onSelectPrompt(row.id)}
            onKeyDown={(event) =>
              activateRowOnKey(event, () => onSelectPrompt(row.id))
            }
          >
            <TableCell className="whitespace-normal">
              <div className="space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="line-clamp-2 min-w-0 font-medium break-words">
                    {row.excerpt}
                  </p>
                  {!row.active ? <Badge variant="outline">Paused</Badge> : null}
                </div>
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  {row.latestResponseSummary ??
                    "No captured response summary yet."}
                </p>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-medium">{getProviderLabel(row)}</p>
                {row.latestProviderName ? (
                  <p className="text-muted-foreground truncate text-xs">
                    Latest: {row.latestProviderName}
                  </p>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <p className="font-medium">
                  {row.latestRunAt
                    ? formatFreshness(row.latestRunAt)
                    : "No runs yet"}
                </p>
                {row.latestStatus ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                      statusTone[row.latestStatus] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {titleCase(row.latestStatus)}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.responseCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.latestSourceCount ?? row.sourceDiversity}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.latestCitationQuality)}
            </TableCell>
            <TableCell>
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
  );
}

function PromptMeta({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium tabular-nums">
        {value}
      </dd>
      {children ? (
        <dd className="text-muted-foreground mt-1 min-w-0 text-xs">
          {children}
        </dd>
      ) : null}
    </div>
  );
}

function PromptCompactList({
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
  onRun: (promptId: Id<"prompts">, label: string) => Promise<void>;
  onToggle: (row: PromptRow) => Promise<void>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={String(row.id)}
          className={`hover:bg-muted/40 rounded-lg border p-3 transition-colors ${
            selectedPromptId === row.id ? "bg-muted/30" : "bg-background"
          }`}
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <button
              type="button"
              aria-label={`Open prompt ${row.excerpt}`}
              className="focus-visible:border-ring focus-visible:ring-ring/50 -m-1 min-w-0 flex-1 rounded-md p-1 text-left outline-none focus-visible:ring-3"
              onClick={() => onSelectPrompt(row.id)}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="line-clamp-2 min-w-0 text-sm leading-snug font-medium break-words">
                  {row.excerpt}
                </p>
                {!row.active ? <Badge variant="outline">Paused</Badge> : null}
              </div>
              <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                {row.latestResponseSummary ??
                  "No captured response summary yet."}
              </p>
            </button>
            <PromptActions
              compact
              row={row}
              onRun={onRun}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-4">
            <PromptMeta label="Providers" value={getProviderLabel(row)}>
              {row.latestProviderName
                ? `Latest: ${row.latestProviderName}`
                : null}
            </PromptMeta>
            <PromptMeta
              label="Latest"
              value={
                row.latestRunAt ? formatFreshness(row.latestRunAt) : "No runs"
              }
            >
              {row.latestStatus ? (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 ${
                    statusTone[row.latestStatus] ??
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  {titleCase(row.latestStatus)}
                </span>
              ) : null}
            </PromptMeta>
            <PromptMeta label="Responses" value={row.responseCount} />
            <PromptMeta
              label="Sources / Citation"
              value={`${row.latestSourceCount ?? row.sourceDiversity} / ${formatPercent(
                row.latestCitationQuality
              )}`}
            />
          </dl>
        </div>
      ))}
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
  }) => Promise<{ queuedCount: number }>;
}) {
  const compactLayout = useCompactPromptsLayout();
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const isCreateOpen = createOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const queuePrompt = async (promptId: Id<"prompts">, label: string) => {
    try {
      const result = await onTriggerSelectedNow({
        promptIds: [promptId],
        label,
      });
      toast.success(
        result.queuedCount === 1
          ? "Provider run queued."
          : `${result.queuedCount} provider runs queued.`
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
            <CardHeader>
              <CardTitle>Prompts</CardTitle>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {rows.length === 0 ? (
                <InlineEmpty text="No prompts yet. Add one to start capturing real responses and source evidence." />
              ) : compactLayout ? (
                <PromptCompactList
                  rows={rows}
                  selectedPromptId={selectedPromptId}
                  onSelectPrompt={onSelectPrompt}
                  onRun={queuePrompt}
                  onToggle={togglePrompt}
                  onDelete={removePrompt}
                />
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
              Add prompt text. It will run across every active provider.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt-text">Prompt text</Label>
              <Textarea
                id="prompt-text"
                value={newPromptText}
                onChange={(event) => setNewPromptText(event.target.value)}
                placeholder="Ask about your category, product, or brand visibility..."
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void createPrompt()}>Create prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
