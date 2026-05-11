import { useState, type KeyboardEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { MoreHorizontal, Play, SlidersHorizontal } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuGroup,
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
type ProviderOption = {
  slug: string;
  name: string;
  active: boolean;
};

const browserEngineOptions: Array<{ value: BrowserEngine; label: string }> = [
  { value: "camoufox", label: "Camoufox" },
  { value: "nodriver", label: "Nodriver" },
  { value: "playwright", label: "Playwright" },
];
const defaultBrowserEngine: BrowserEngine = "camoufox";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function toggleSelection<T extends string>(
  values: T[],
  value: T,
  checked: boolean
) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((item) => item !== value);
}

function PromptActions({
  row,
  providerOptions,
  onRun,
  onRunAdvanced,
  onDelete,
}: {
  row: PromptRow;
  providerOptions: ProviderOption[];
  onRun: (promptId: Id<"prompts">, label: string) => Promise<void>;
  onRunAdvanced: (
    promptId: Id<"prompts">,
    label: string,
    providerSlugs: string[],
    browserEngines: BrowserEngine[]
  ) => Promise<boolean>;
  onDelete: (row: PromptRow) => Promise<void>;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedProviderSlugs, setSelectedProviderSlugs] = useState<string[]>(
    []
  );
  const [selectedEngines, setSelectedEngines] = useState<BrowserEngine[]>([
    defaultBrowserEngine,
  ]);
  const [advancedRunning, setAdvancedRunning] = useState(false);
  const enabledProviderOptions = providerOptions.filter(
    (provider) => provider.active
  );
  const canRunAdvanced =
    selectedProviderSlugs.length > 0 &&
    selectedEngines.length > 0 &&
    !advancedRunning;

  const openAdvanced = () => {
    setSelectedProviderSlugs(
      enabledProviderOptions.map((provider) => provider.slug)
    );
    setSelectedEngines([defaultBrowserEngine]);
    setAdvancedOpen(true);
  };

  const runAdvanced = async () => {
    if (!canRunAdvanced) {
      return;
    }

    setAdvancedRunning(true);
    try {
      const didQueue = await onRunAdvanced(
        row.id,
        row.excerpt,
        selectedProviderSlugs,
        selectedEngines
      );
      if (didQueue) {
        setAdvancedOpen(false);
      }
    } finally {
      setAdvancedRunning(false);
    }
  };

  return (
    <>
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
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void onRun(row.id, row.excerpt)}>
              <Play />
              Run
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openAdvanced}>
              <SlidersHorizontal />
              Advanced
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void onDelete(row)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Advanced run</DialogTitle>
            <DialogDescription>
              Select enabled providers and browser engines to queue parallel
              runs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium">Providers</legend>
              {enabledProviderOptions.length ? (
                enabledProviderOptions.map((provider) => {
                  const inputId = `advanced-provider-${String(row.id)}-${provider.slug}`;
                  return (
                    <div
                      key={provider.slug}
                      className="flex min-w-0 items-center gap-2 rounded-md border p-2"
                    >
                      <Checkbox
                        id={inputId}
                        checked={selectedProviderSlugs.includes(provider.slug)}
                        onCheckedChange={(checked) =>
                          setSelectedProviderSlugs((current) =>
                            toggleSelection(
                              current,
                              provider.slug,
                              checked === true
                            )
                          )
                        }
                      />
                      <Label
                        htmlFor={inputId}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="truncate">{provider.name}</span>
                      </Label>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm">
                  No enabled providers.
                </p>
              )}
            </fieldset>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium">Engines</legend>
              {browserEngineOptions.map((engine) => {
                const inputId = `advanced-engine-${String(row.id)}-${engine.value}`;
                return (
                  <div
                    key={engine.value}
                    className="flex min-w-0 items-center gap-2 rounded-md border p-2"
                  >
                    <Checkbox
                      id={inputId}
                      checked={selectedEngines.includes(engine.value)}
                      onCheckedChange={(checked) =>
                        setSelectedEngines((current) =>
                          toggleSelection(
                            current,
                            engine.value,
                            checked === true
                          )
                        )
                      }
                    />
                    <Label
                      htmlFor={inputId}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="truncate">{engine.label}</span>
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdvancedOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canRunAdvanced}
              onClick={() => void runAdvanced()}
            >
              <Play data-icon="inline-start" />
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  providerOptions,
  selectedPromptId,
  onSelectPrompt,
  onRun,
  onRunAdvanced,
  onDelete,
}: {
  rows: PromptRow[];
  providerOptions: ProviderOption[];
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  onRun: (promptId: Id<"prompts">, label: string) => Promise<void>;
  onRunAdvanced: (
    promptId: Id<"prompts">,
    label: string,
    providerSlugs: string[],
    browserEngines: BrowserEngine[]
  ) => Promise<boolean>;
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
                  <Badge variant="outline">Inactive</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PromptActions
                  row={row}
                  providerOptions={providerOptions}
                  onRun={onRun}
                  onRunAdvanced={onRunAdvanced}
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
  providers,
  selectedPromptId,
  onSelectPrompt,
  createOpen,
  onCreateOpenChange,
  onCreatePrompt,
  onDeletePrompt,
  onTriggerSelectedNow,
}: {
  loading?: boolean;
  rows: PromptRow[];
  providers: ProviderOption[];
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onCreatePrompt: (args: {
    promptText: string;
    active?: boolean;
  }) => Promise<Id<"prompts">>;
  onDeletePrompt: (args: { id: Id<"prompts"> }) => Promise<Id<"prompts">>;
  onTriggerSelectedNow: (args: {
    promptIds: Array<Id<"prompts">>;
    label?: string;
    browserEngine?: BrowserEngine;
    providerSlugs?: string[];
  }) => Promise<{ queuedCount: number }>;
}) {
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const isCreateOpen = createOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const queuePrompt = async (promptId: Id<"prompts">, label: string) => {
    try {
      const result = await onTriggerSelectedNow({
        promptIds: [promptId],
        label,
        browserEngine: defaultBrowserEngine,
      });
      toast.success(
        result.queuedCount === 1
          ? "Run queued."
          : `Run queued across ${result.queuedCount} providers.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const queueAdvancedPrompt = async (
    promptId: Id<"prompts">,
    label: string,
    providerSlugs: string[],
    browserEngines: BrowserEngine[]
  ) => {
    if (!providerSlugs.length) {
      toast.error("Select at least one provider.");
      return false;
    }
    if (!browserEngines.length) {
      toast.error("Select at least one engine.");
      return false;
    }

    try {
      const results = await Promise.all(
        browserEngines.map((browserEngine) =>
          onTriggerSelectedNow({
            promptIds: [promptId],
            label,
            browserEngine,
            providerSlugs,
          })
        )
      );
      const queuedCount = results.reduce(
        (sum, result) => sum + result.queuedCount,
        0
      );
      toast.success(
        queuedCount === 1 ? "Run queued." : `Queued ${queuedCount} runs.`
      );
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
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
                  providerOptions={providers}
                  selectedPromptId={selectedPromptId}
                  onSelectPrompt={onSelectPrompt}
                  onRun={queuePrompt}
                  onRunAdvanced={queueAdvancedPrompt}
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
