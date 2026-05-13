import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  FolderOpen,
  MoreHorizontal,
  Play,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import {
  PromptCategorisationFields,
  type PromptCategorisationValue,
  type PromptEntityOption,
  type PromptGroupOption,
} from "@/components/dashboard/components/PromptCategorisationFields";
import { cn } from "@/lib/utils";
import {
  promptGeneratedByOptions,
  promptIntentCategoryOptions,
  parseSourceUrls,
  promptOptionLabel,
  promptSentimentLensOptions,
  type PromptGeneratedBy,
  type PromptIntentCategory,
  type PromptSentimentLens,
} from "@/lib/prompt-categorisation";
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
  entityId?: Id<"trackedEntities">;
  entityName?: string;
  promptGroupId?: Id<"promptGroups">;
  promptGroupName?: string;
  intentCategory: PromptIntentCategory;
  sentimentLens: PromptSentimentLens;
  funnelStage?: PromptCategorisationValue["funnelStage"];
  audience?: string;
  topic?: string;
  priority?: PromptCategorisationValue["priority"];
  generatedBy: PromptGeneratedBy;
  generationRationale?: string;
  sourceUrls: string[];
  latestRunAt?: number;
};

type PromptGroupRow = PromptGroupOption & {
  intentCategory: PromptIntentCategory;
  sentimentLens: PromptSentimentLens;
  promptCount: number;
  activePromptCount: number;
  latestRunAt?: number;
};

type BrowserEngine = "camoufox" | "nodriver" | "playwright";
type ProviderOption = {
  slug: string;
  name: string;
  active: boolean;
};

const ALL_VALUE = "__all__";
const NONE_VALUE = "__none__";
const defaultBrowserEngine: BrowserEngine = "camoufox";
const browserEngineOptions: Array<{ value: BrowserEngine; label: string }> = [
  { value: "camoufox", label: "Camoufox" },
  { value: "nodriver", label: "Nodriver" },
  { value: "playwright", label: "Playwright" },
];

function defaultPromptCategorisation(): PromptCategorisationValue {
  return {
    intentCategory: "uncategorized",
    sentimentLens: "neutral",
    audience: "",
    topic: "",
    generatedBy: "manual",
    generationRationale: "",
    sourceUrlsText: "",
    active: true,
  };
}

function promptArgsFromForm(
  promptText: string,
  form: PromptCategorisationValue
) {
  return {
    promptText,
    entityId: form.entityId,
    promptGroupId: form.promptGroupId,
    intentCategory: form.intentCategory,
    sentimentLens: form.sentimentLens,
    funnelStage: form.funnelStage,
    audience: form.audience.trim() || undefined,
    topic: form.topic.trim() || undefined,
    priority: form.priority,
    generatedBy: form.generatedBy,
    generationRationale: form.generationRationale.trim() || undefined,
    sourceUrls: parseSourceUrls(form.sourceUrlsText),
    active: form.active,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function formatFreshness(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

function titleForIntent(value: PromptIntentCategory) {
  return promptOptionLabel(promptIntentCategoryOptions, value);
}

function titleForLens(value: PromptSentimentLens) {
  return promptOptionLabel(promptSentimentLensOptions, value);
}

function SelectFilter({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-[150px] flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>{children}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function PromptStateBadge({ row }: { row: PromptRow }) {
  if (!row.active) {
    return <Badge variant="outline">Inactive</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
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
  selectedPromptIds,
  onSelectedPromptIds,
  onSelectPrompt,
  onRun,
  onRunAdvanced,
  onDelete,
}: {
  rows: PromptRow[];
  providerOptions: ProviderOption[];
  selectedPromptId: Id<"prompts"> | null;
  selectedPromptIds: Id<"prompts">[];
  onSelectedPromptIds: (value: Id<"prompts">[]) => void;
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
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedPromptIds.includes(row.id));

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[960px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all visible prompts"
                checked={allVisibleSelected}
                onCheckedChange={(checked) =>
                  onSelectedPromptIds(
                    checked
                      ? [
                          ...new Set([
                            ...selectedPromptIds,
                            ...rows.map((row) => row.id),
                          ]),
                        ]
                      : selectedPromptIds.filter(
                          (promptId) => !rows.some((row) => row.id === promptId)
                        )
                  )
                }
              />
            </TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead className="w-[180px]">Group</TableHead>
            <TableHead className="w-[150px]">Intent</TableHead>
            <TableHead className="w-[120px]">Lens</TableHead>
            <MetricHead
              label="Runs"
              tooltip="Total run groups."
              className="w-[88px] text-right"
            />
            <MetricHead
              label="Sources"
              tooltip="Unique citation sources."
              className="w-[96px] text-right"
            />
            <MetricHead
              label="Entities"
              tooltip="Tracked entities found."
              className="w-[96px] text-right"
            />
            <TableHead className="w-[110px]">State</TableHead>
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
              <TableCell onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  aria-label={`Select ${row.excerpt}`}
                  checked={selectedPromptIds.includes(row.id)}
                  onCheckedChange={(checked) =>
                    onSelectedPromptIds(
                      toggleSelection(
                        selectedPromptIds,
                        row.id,
                        checked === true
                      )
                    )
                  }
                />
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="line-clamp-2 font-medium break-words">
                  {row.excerpt}
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-1 text-xs">
                  {row.entityName ? <span>{row.entityName}</span> : null}
                  {row.audience ? <span>{row.audience}</span> : null}
                  {row.topic ? <span>{row.topic}</span> : null}
                </div>
              </TableCell>
              <TableCell>
                <span className="line-clamp-1">
                  {row.promptGroupName ?? "Ungrouped"}
                </span>
              </TableCell>
              <TableCell>{titleForIntent(row.intentCategory)}</TableCell>
              <TableCell>{titleForLens(row.sentimentLens)}</TableCell>
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
                <PromptStateBadge row={row} />
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

function PromptGroupTable({
  groups,
  onRunGroup,
}: {
  groups: PromptGroupRow[];
  onRunGroup: (group: PromptGroupRow) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[760px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Prompt group</TableHead>
            <TableHead className="w-[160px]">Intent</TableHead>
            <TableHead className="w-[120px]">Lens</TableHead>
            <TableHead className="w-[110px] text-right">Prompts</TableHead>
            <TableHead className="w-[110px] text-right">Active</TableHead>
            <TableHead className="w-[120px]">Last run</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={String(group._id)}>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <FolderOpen className="text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{group.name}</div>
                    {group.entityId ? (
                      <div className="text-muted-foreground text-xs">
                        Entity scoped
                      </div>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>{titleForIntent(group.intentCategory)}</TableCell>
              <TableCell>{titleForLens(group.sentimentLens)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {group.promptCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {group.activePromptCount}
              </TableCell>
              <TableCell>{formatFreshness(group.latestRunAt)}</TableCell>
              <TableCell className="text-right">
                <Tooltip>
                  <TooltipPrimitive.Trigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Run ${group.name}`}
                      onClick={() => void onRunGroup(group)}
                    >
                      <Play />
                    </Button>
                  </TooltipPrimitive.Trigger>
                  <TooltipContent>Run group</TooltipContent>
                </Tooltip>
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
  promptGroups,
  entities,
  providers,
  selectedPromptId,
  onSelectPrompt,
  createOpen,
  onCreateOpenChange,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onTriggerSelectedNow,
  onTriggerPromptGroupNow,
  onQueueEntityPromptGeneration,
}: {
  loading?: boolean;
  rows: PromptRow[];
  promptGroups: PromptGroupRow[];
  entities: PromptEntityOption[];
  providers: ProviderOption[];
  selectedPromptId: Id<"prompts"> | null;
  onSelectPrompt: (value: Id<"prompts"> | null) => void;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onCreatePrompt: (
    args: ReturnType<typeof promptArgsFromForm>
  ) => Promise<Id<"prompts">>;
  onUpdatePrompt: (args: {
    id: Id<"prompts">;
    promptGroupId?: Id<"promptGroups"> | null;
    active?: boolean;
  }) => Promise<Id<"prompts">>;
  onDeletePrompt: (args: { id: Id<"prompts"> }) => Promise<Id<"prompts">>;
  onTriggerSelectedNow: (args: {
    promptIds: Array<Id<"prompts">>;
    label?: string;
    browserEngine?: BrowserEngine;
    providerSlugs?: string[];
  }) => Promise<{ queuedCount: number }>;
  onTriggerPromptGroupNow: (args: {
    promptGroupId: Id<"promptGroups">;
    label?: string;
    browserEngine?: BrowserEngine;
  }) => Promise<{ queuedCount: number }>;
  onQueueEntityPromptGeneration: (args: {
    entityId: Id<"trackedEntities">;
    websiteUrl?: string;
    researchSummary?: string;
  }) => Promise<Id<"entityPromptGenerationRuns">>;
}) {
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptForm, setNewPromptForm] = useState(
    defaultPromptCategorisation
  );
  const [viewMode, setViewMode] = useState<"prompts" | "groups">("prompts");
  const [entityFilter, setEntityFilter] = useState(ALL_VALUE);
  const [groupFilter, setGroupFilter] = useState(ALL_VALUE);
  const [intentFilter, setIntentFilter] = useState(ALL_VALUE);
  const [lensFilter, setLensFilter] = useState(ALL_VALUE);
  const [sourceFilter, setSourceFilter] = useState(ALL_VALUE);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Id<"prompts">[]>(
    []
  );
  const [bulkGroupId, setBulkGroupId] = useState<string>(NONE_VALUE);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationEntityId, setGenerationEntityId] = useState<string>("");
  const [generationWebsiteUrl, setGenerationWebsiteUrl] = useState("");
  const [generationResearchSummary, setGenerationResearchSummary] =
    useState("");
  const isCreateOpen = createOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (entityFilter !== ALL_VALUE && row.entityId !== entityFilter) {
          return false;
        }
        if (groupFilter !== ALL_VALUE && row.promptGroupId !== groupFilter) {
          return false;
        }
        if (intentFilter !== ALL_VALUE && row.intentCategory !== intentFilter) {
          return false;
        }
        if (lensFilter !== ALL_VALUE && row.sentimentLens !== lensFilter) {
          return false;
        }
        if (sourceFilter !== ALL_VALUE && row.generatedBy !== sourceFilter) {
          return false;
        }
        return true;
      }),
    [entityFilter, groupFilter, intentFilter, lensFilter, rows, sourceFilter]
  );

  const filteredGroups = useMemo(
    () =>
      promptGroups.filter((group) => {
        if (entityFilter !== ALL_VALUE && group.entityId !== entityFilter) {
          return false;
        }
        if (
          intentFilter !== ALL_VALUE &&
          group.intentCategory !== intentFilter
        ) {
          return false;
        }
        if (lensFilter !== ALL_VALUE && group.sentimentLens !== lensFilter) {
          return false;
        }
        return true;
      }),
    [entityFilter, intentFilter, lensFilter, promptGroups]
  );

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
      setSelectedPromptIds((current) =>
        current.filter((promptId) => promptId !== row.id)
      );
      toast.success("Prompt deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createPrompt = async () => {
    const promptText = newPromptText.trim();
    if (!promptText) {
      toast.error("Prompt text is required.");
      return;
    }

    try {
      await onCreatePrompt(promptArgsFromForm(promptText, newPromptForm));
      setNewPromptText("");
      setNewPromptForm(defaultPromptCategorisation());
      setCreateOpen(false);
      toast.success("Prompt created.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const bulkRunSelected = async () => {
    if (!selectedPromptIds.length) return;
    try {
      const result = await onTriggerSelectedNow({
        promptIds: selectedPromptIds,
        label: "Selected prompts",
        browserEngine: defaultBrowserEngine,
      });
      toast.success(`Queued ${result.queuedCount} runs.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const bulkArchive = async () => {
    try {
      await Promise.all(
        selectedPromptIds.map((id) => onUpdatePrompt({ id, active: false }))
      );
      toast.success(`Archived ${selectedPromptIds.length} prompts.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const bulkMove = async () => {
    try {
      await Promise.all(
        selectedPromptIds.map((id) =>
          onUpdatePrompt({
            id,
            promptGroupId:
              bulkGroupId === NONE_VALUE
                ? null
                : (bulkGroupId as Id<"promptGroups">),
          })
        )
      );
      toast.success(`Moved ${selectedPromptIds.length} prompts.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const runGroup = async (group: PromptGroupRow) => {
    try {
      const result = await onTriggerPromptGroupNow({
        promptGroupId: group._id,
        label: group.name,
        browserEngine: defaultBrowserEngine,
      });
      toast.success(`Queued ${result.queuedCount} runs.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const queueGeneration = async () => {
    if (!generationEntityId) {
      toast.error("Select an entity.");
      return;
    }
    try {
      await onQueueEntityPromptGeneration({
        entityId: generationEntityId as Id<"trackedEntities">,
        websiteUrl: generationWebsiteUrl.trim() || undefined,
        researchSummary: generationResearchSummary.trim() || undefined,
      });
      setGenerationOpen(false);
      setGenerationWebsiteUrl("");
      setGenerationResearchSummary("");
      toast.success("Prompt generation queued.");
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
            columns={8}
          />
        ) : (
          <Card className="min-w-0">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Prompt library</CardTitle>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Categorise GEO/AEO prompts by intent, sentiment lens,
                    entity, and group.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={viewMode === "prompts" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("prompts")}
                  >
                    Prompts
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "groups" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("groups")}
                  >
                    Groups
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGenerationEntityId(
                        entities.find((entity) => entity.active)?._id ?? ""
                      );
                      setGenerationOpen(true);
                    }}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Generate
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SelectFilter
                  label="Entity"
                  value={entityFilter}
                  onValueChange={(nextValue) => {
                    setEntityFilter(nextValue);
                    setGroupFilter(ALL_VALUE);
                  }}
                >
                  <SelectItem value={ALL_VALUE}>All entities</SelectItem>
                  {entities.map((entity) => (
                    <SelectItem key={String(entity._id)} value={entity._id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectFilter>
                <SelectFilter
                  label="Group"
                  value={groupFilter}
                  onValueChange={setGroupFilter}
                >
                  <SelectItem value={ALL_VALUE}>All groups</SelectItem>
                  {promptGroups
                    .filter(
                      (group) =>
                        entityFilter === ALL_VALUE ||
                        group.entityId === entityFilter ||
                        !group.entityId
                    )
                    .map((group) => (
                      <SelectItem key={String(group._id)} value={group._id}>
                        {group.name}
                      </SelectItem>
                    ))}
                </SelectFilter>
                <SelectFilter
                  label="Intent"
                  value={intentFilter}
                  onValueChange={setIntentFilter}
                >
                  <SelectItem value={ALL_VALUE}>All intents</SelectItem>
                  {promptIntentCategoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectFilter>
                <SelectFilter
                  label="Lens"
                  value={lensFilter}
                  onValueChange={setLensFilter}
                >
                  <SelectItem value={ALL_VALUE}>All lenses</SelectItem>
                  {promptSentimentLensOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectFilter>
                <SelectFilter
                  label="Source"
                  value={sourceFilter}
                  onValueChange={setSourceFilter}
                >
                  <SelectItem value={ALL_VALUE}>All sources</SelectItem>
                  {promptGeneratedByOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectFilter>
              </div>

              {selectedPromptIds.length ? (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                  <div className="text-muted-foreground flex h-8 items-center text-sm">
                    {selectedPromptIds.length} selected
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void bulkRunSelected()}
                  >
                    <Play data-icon="inline-start" />
                    Run selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void bulkArchive()}
                  >
                    Archive
                  </Button>
                  <Select value={bulkGroupId} onValueChange={setBulkGroupId}>
                    <SelectTrigger size="sm" className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={NONE_VALUE}>No group</SelectItem>
                        {promptGroups.map((group) => (
                          <SelectItem key={String(group._id)} value={group._id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void bulkMove()}
                  >
                    Move
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="min-w-0">
              {viewMode === "groups" ? (
                filteredGroups.length === 0 ? (
                  <InlineEmpty text="No prompt groups match the current filters." />
                ) : (
                  <PromptGroupTable
                    groups={filteredGroups}
                    onRunGroup={runGroup}
                  />
                )
              ) : filteredRows.length === 0 ? (
                <InlineEmpty text="No prompts match the current filters." />
              ) : (
                <PromptTable
                  rows={filteredRows}
                  providerOptions={providers}
                  selectedPromptId={selectedPromptId}
                  selectedPromptIds={selectedPromptIds}
                  onSelectedPromptIds={setSelectedPromptIds}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New prompt</DialogTitle>
            <DialogDescription>
              Add a prompt with GEO/AEO categorisation metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt-text">Prompt text</Label>
              <Textarea
                id="prompt-text"
                value={newPromptText}
                onChange={(event) => setNewPromptText(event.target.value)}
                placeholder="Ask about your brand, product, or category..."
                rows={6}
              />
            </div>
            <PromptCategorisationFields
              value={newPromptForm}
              entities={entities}
              promptGroups={promptGroups}
              onChange={setNewPromptForm}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => void createPrompt()}>Create prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generationOpen} onOpenChange={setGenerationOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate prompt groups</DialogTitle>
            <DialogDescription>
              Queue Codex to analyse the entity and draft editable prompt
              groups.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="generation-entity">Entity</Label>
              <Select
                value={generationEntityId || NONE_VALUE}
                onValueChange={(value) =>
                  setGenerationEntityId(value === NONE_VALUE ? "" : value)
                }
              >
                <SelectTrigger id="generation-entity" className="w-full">
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE_VALUE}>Select entity</SelectItem>
                    {entities
                      .filter((entity) => entity.active)
                      .map((entity) => (
                        <SelectItem key={String(entity._id)} value={entity._id}>
                          {entity.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="generation-website">Website URL</Label>
              <Input
                id="generation-website"
                value={generationWebsiteUrl}
                onChange={(event) =>
                  setGenerationWebsiteUrl(event.target.value)
                }
                placeholder="https://example.com"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="generation-research">Research notes</Label>
              <Textarea
                id="generation-research"
                value={generationResearchSummary}
                onChange={(event) =>
                  setGenerationResearchSummary(event.target.value)
                }
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void queueGeneration()}>
              Queue generation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
