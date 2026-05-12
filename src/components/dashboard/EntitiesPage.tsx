import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  ArrowUpRight,
  Bot,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
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
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import { clickableTableRowClassName } from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";
type GenerationStatus = "queued" | "running" | "success" | "failed";
type BrowserEngine = "camoufox" | "nodriver" | "playwright";

type EntityRow = {
  _id: Id<"trackedEntities">;
  name: string;
  slug: string;
  kind: TrackedKind;
  aliases: string[];
  ownedDomains: string[];
  active: boolean;
  promptCount: number;
  approvedPromptCount: number;
  draftPromptCount: number;
  promptGroupCount: number;
  runCount: number;
  responseCount: number;
  mentionedResponseCount: number;
  mentionCount: number;
  citationCount: number;
  ownedCitationCount: number;
  latestRunAt?: number;
  averageVisibility?: number;
  averageCitationQuality?: number;
  latestGeneration?: {
    id: Id<"entityPromptGenerationRuns">;
    status: GenerationStatus;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    model?: string;
    error?: string;
    generatedPromptCount?: number;
    generatedGroupCount?: number;
  };
};

type EntityMentionRow = {
  promptRunId: Id<"promptRuns">;
  entityId?: Id<"trackedEntities">;
  name: string;
  slug: string;
  kind: TrackedKind;
  mentionCount: number;
  citationCount: number;
  ownedCitationCount: number;
  sentiment?: "positive" | "neutral" | "negative" | "mixed";
  detectionSource?: "deterministic" | "codex";
  confidence?: number;
  evidence?: string;
  matchedTerms: string[];
  promptId: Id<"prompts">;
  promptExcerpt: string;
  providerName: string;
  startedAt: number;
};

type EntityVisibilityData = {
  entities: EntityRow[];
  recentMentions: EntityMentionRow[];
  meta: {
    entityCount: number;
    activeEntityCount: number;
    competitorCount: number;
    promptCount: number;
    draftPromptCount: number;
    mentionCount: number;
    citationCount: number;
  };
};

type CreateEntityArgs = {
  name: string;
  kind: TrackedKind;
  aliases?: string[];
  ownedDomains?: string[];
  websiteUrl?: string;
  researchSummary?: string;
};

type EntitiesPageProps = {
  loading?: boolean;
  data?: EntityVisibilityData;
  searchValue: string;
  onCreateEntity: (args: CreateEntityArgs) => Promise<{
    entityId: Id<"trackedEntities">;
    generationId: Id<"entityPromptGenerationRuns">;
  }>;
  onUpdateEntity: (args: {
    id: Id<"trackedEntities">;
    name?: string;
    active?: boolean;
  }) => Promise<Id<"trackedEntities">>;
  onDeleteEntity: (args: {
    id: Id<"trackedEntities">;
  }) => Promise<Id<"trackedEntities">>;
  onQueueEntityPromptGeneration: (args: {
    entityId: Id<"trackedEntities">;
    websiteUrl?: string;
    researchSummary?: string;
  }) => Promise<Id<"entityPromptGenerationRuns">>;
  onTriggerEntityPromptsNow: (args: {
    entityId: Id<"trackedEntities">;
    label?: string;
    browserEngine?: BrowserEngine;
  }) => Promise<{ queuedCount: number }>;
  onOpenPromptsForEntity: (entity: EntityRow) => void;
  onOpenRun: (runId: Id<"promptRuns">) => void;
};

const trackedKindOptions: TrackedKind[] = [
  "brand",
  "competitor",
  "product",
  "feature",
  "other",
];

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
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

function formatScore(value: number | undefined): string {
  if (typeof value !== "number") return "-";
  return String(Math.round(value));
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value)}%`;
}

function websiteUrlForEntity(entity: EntityRow): string | undefined {
  const domain = entity.ownedDomains[0];
  if (!domain) return undefined;
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

function generationLabel(generation: EntityRow["latestGeneration"]) {
  if (!generation) return "Not queued";
  if (generation.status === "success") {
    const promptCount = generation.generatedPromptCount ?? 0;
    const groupCount = generation.generatedGroupCount ?? 0;
    return `${groupCount} groups, ${promptCount} prompts`;
  }
  return titleCase(generation.status);
}

function generationTone(generation: EntityRow["latestGeneration"]) {
  if (!generation) return "secondary" as const;
  if (generation.status === "success") return "default" as const;
  if (generation.status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function approvalPercent(entity: EntityRow): number {
  if (!entity.promptCount) return 0;
  return Math.round((entity.approvedPromptCount / entity.promptCount) * 100);
}

function CreateEntityDialog({
  open,
  onOpenChange,
  onCreateEntity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEntity: EntitiesPageProps["onCreateEntity"];
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TrackedKind>("brand");
  const [website, setWebsite] = useState("");
  const [aliases, setAliases] = useState("");
  const [researchSummary, setResearchSummary] = useState("");
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setName("");
    setKind("brand");
    setWebsite("");
    setAliases("");
    setResearchSummary("");
  };

  const createEntity = async () => {
    if (creating) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Entity name is required.");
      return;
    }

    const ownedDomains = parseCommaList(website);
    const websiteUrl = ownedDomains[0] ?? website.trim();
    try {
      setCreating(true);
      const result = await onCreateEntity({
        name: trimmedName,
        kind,
        aliases: parseCommaList(aliases),
        ownedDomains: ownedDomains.length ? ownedDomains : undefined,
        websiteUrl,
        researchSummary: researchSummary.trim() || undefined,
      });
      toast.success("Entity created. Codex curation queued.", {
        description: `Generation ${String(result.generationId)} is ready for the bridge worker.`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (creating) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New tracked entity</DialogTitle>
          <DialogDescription>
            Entity creation queues Codex to draft categorised GEO/AEO prompt
            groups.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="entity-name">Entity name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. OpenPeec"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entity-kind">Kind</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as TrackedKind)}
            >
              <SelectTrigger id="entity-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {trackedKindOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {titleCase(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entity-website">Website / owned domains</Label>
            <Input
              id="entity-website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="e.g. https://openpeec.ai"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entity-aliases">Known aliases</Label>
            <Input
              id="entity-aliases"
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder="e.g. Open Peec, OpenPeec AI"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entity-research">Research notes</Label>
            <Textarea
              id="entity-research"
              value={researchSummary}
              onChange={(event) => setResearchSummary(event.target.value)}
              rows={4}
              placeholder="Add positioning, audience, product, or competitor notes for Codex."
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-8"
            disabled={creating}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 sm:h-8"
            disabled={creating}
            onClick={() => void createEntity()}
          >
            {creating ? (
              <RefreshCw data-icon="inline-start" className="animate-spin" />
            ) : (
              <Bot data-icon="inline-start" />
            )}
            {creating ? "Creating..." : "Create and curate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EntitiesPage({
  loading = false,
  data,
  searchValue,
  onCreateEntity,
  onUpdateEntity,
  onDeleteEntity,
  onQueueEntityPromptGeneration,
  onTriggerEntityPromptsNow,
  onOpenPromptsForEntity,
  onOpenRun,
}: EntitiesPageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const needle = searchValue.trim().toLowerCase();

  const filteredEntities = useMemo(() => {
    const entities = data?.entities ?? [];
    return entities.filter((entity) => {
      if (!needle) return true;
      return `${entity.name} ${entity.slug} ${entity.kind} ${entity.aliases.join(" ")} ${entity.ownedDomains.join(" ")} ${generationLabel(entity.latestGeneration)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.entities, needle]);

  const filteredMentions = useMemo(() => {
    const recentMentions = data?.recentMentions ?? [];
    return recentMentions.filter((mention) => {
      if (!needle) return true;
      return `${mention.name} ${mention.kind} ${mention.promptExcerpt} ${mention.providerName} ${mention.sentiment ?? ""} ${mention.evidence ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.recentMentions, needle]);

  const createGeneration = async (entity: EntityRow) => {
    try {
      const generationId = await onQueueEntityPromptGeneration({
        entityId: entity._id,
        websiteUrl: websiteUrlForEntity(entity),
      });
      toast.success("Codex curation queued.", {
        description: `Generation ${String(generationId)} is ready for the bridge worker.`,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const runEntity = async (entity: EntityRow) => {
    try {
      const result = await onTriggerEntityPromptsNow({
        entityId: entity._id,
        label: entity.name,
        browserEngine: "camoufox",
      });
      toast.success(
        result.queuedCount === 1
          ? "Entity run queued."
          : `Queued ${result.queuedCount} entity runs.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renameEntity = async (entity: EntityRow) => {
    const next = window.prompt("New entity name", entity.name);
    if (!next || next.trim() === entity.name) return;
    try {
      await onUpdateEntity({ id: entity._id, name: next.trim() });
      toast.success("Entity updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleEntity = async (entity: EntityRow) => {
    try {
      await onUpdateEntity({ id: entity._id, active: !entity.active });
      toast.success(entity.active ? "Entity paused." : "Entity resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteEntity = async (entity: EntityRow) => {
    if (!window.confirm(`Delete ${entity.name}?`)) return;
    try {
      await onDeleteEntity({ id: entity._id });
      toast.success("Entity deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <CreateEntityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateEntity={onCreateEntity}
      />

      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Entities</h1>
            <p className="text-muted-foreground text-sm">
              Track brands, competitors, citations, mentions, and generated
              prompt coverage.
            </p>
          </div>
          <Button
            type="button"
            className="h-10 sm:h-8"
            onClick={() => setCreateOpen(true)}
          >
            <Plus data-icon="inline-start" />
            New entity
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <MetricCard
          label="Active entities"
          value={String(data?.meta.activeEntityCount ?? 0)}
          detail={`${data?.meta.competitorCount ?? 0} competitors`}
        />
        <MetricCard
          label="Prompt coverage"
          value={String(data?.meta.promptCount ?? 0)}
          detail={`${data?.meta.draftPromptCount ?? 0} drafts`}
        />
        <MetricCard
          label="Mentions"
          value={String(data?.meta.mentionCount ?? 0)}
          detail="Tracked responses"
        />
        <MetricCard
          label="Citations"
          value={String(data?.meta.citationCount ?? 0)}
          detail="Entity-linked sources"
        />
      </div>

      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-20" rows={6} columns={7} />
        ) : (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Tracked entities</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredEntities.length === 0 ? (
                <InlineEmpty text="No tracked entities match the current search." />
              ) : (
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Library</TableHead>
                      <TableHead className="text-right">Mentions</TableHead>
                      <TableHead className="text-right">Citations</TableHead>
                      <TableHead className="text-right">Scores</TableHead>
                      <TableHead>Codex curation</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntities.map((entity) => (
                      <TableRow key={String(entity._id)}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {entity.name}
                              </span>
                              <Badge
                                variant={
                                  entity.active ? "default" : "secondary"
                                }
                              >
                                {entity.active ? "Active" : "Paused"}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                              <span>{titleCase(entity.kind)}</span>
                              <span>{entity.slug}</span>
                              {entity.ownedDomains.slice(0, 2).map((domain) => (
                                <Badge key={domain} variant="outline">
                                  {domain}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="flex flex-col gap-2">
                            <div className="text-sm">
                              <span className="font-medium">
                                {entity.promptGroupCount}
                              </span>{" "}
                              groups /{" "}
                              <span className="font-medium">
                                {entity.promptCount}
                              </span>{" "}
                              prompts
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={approvalPercent(entity)}
                                className="max-w-28"
                                aria-label={`${entity.name} prompt approval coverage`}
                              />
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {entity.approvedPromptCount} approved
                              </span>
                            </div>
                            {entity.draftPromptCount > 0 ? (
                              <Badge variant="secondary" className="w-fit">
                                {entity.draftPromptCount} drafts
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="font-medium">
                            {entity.mentionCount}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {entity.mentionedResponseCount} responses
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="font-medium">
                            {entity.citationCount}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {entity.ownedCitationCount} owned
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="font-medium">
                            {formatScore(entity.averageVisibility)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            CQ {formatScore(entity.averageCitationQuality)}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={generationTone(entity.latestGeneration)}
                              className={cn(
                                "w-fit",
                                entity.latestGeneration?.status === "success" &&
                                  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                              )}
                            >
                              {generationLabel(entity.latestGeneration)}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              Latest run {formatFreshness(entity.latestRunAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <EntityActions
                            entity={entity}
                            onOpenPrompts={() => onOpenPromptsForEntity(entity)}
                            onGenerate={() => void createGeneration(entity)}
                            onRun={() => void runEntity(entity)}
                            onRename={() => void renameEntity(entity)}
                            onToggle={() => void toggleEntity(entity)}
                            onDelete={() => void deleteEntity(entity)}
                          />
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

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent mentions</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredMentions.length === 0 ? (
              <InlineEmpty text="No entity mentions captured yet." />
            ) : (
              <Table className="min-w-[840px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">
                      Mention / citation
                    </TableHead>
                    <TableHead>Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMentions.map((mention) => (
                    <TableRow
                      key={`${String(mention.promptRunId)}-${mention.slug}`}
                      className={clickableTableRowClassName}
                      tabIndex={0}
                      onClick={() => onOpenRun(mention.promptRunId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenRun(mention.promptRunId);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="font-medium">{mention.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {titleCase(mention.kind)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal">
                        <div className="line-clamp-2 font-medium">
                          {mention.promptExcerpt}
                        </div>
                        {mention.evidence ? (
                          <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                            {mention.evidence}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>{mention.providerName}</div>
                        <div className="text-muted-foreground text-xs">
                          {formatFreshness(mention.startedAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mention.mentionCount} / {mention.citationCount}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {mention.sentiment ? (
                            <Badge variant="outline">
                              {titleCase(mention.sentiment)}
                            </Badge>
                          ) : null}
                          {mention.detectionSource ? (
                            <Badge variant="secondary">
                              {titleCase(mention.detectionSource)}
                            </Badge>
                          ) : null}
                          {mention.confidence !== undefined ? (
                            <Badge variant="outline">
                              {formatPercent(mention.confidence * 100)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
          {label}
        </div>
        <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-muted-foreground mt-1 text-xs">{detail}</div>
      </CardContent>
    </Card>
  );
}

function EntityActions({
  entity,
  onOpenPrompts,
  onGenerate,
  onRun,
  onRename,
  onToggle,
  onDelete,
}: {
  entity: EntityRow;
  onOpenPrompts: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onRename: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${entity.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onOpenPrompts}>
            <ArrowUpRight />
            Open prompts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onGenerate}>
            <RefreshCw />
            Curate prompts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRun}>
            <Play />
            Run approved prompts
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggle}>
            {entity.active ? "Pause" : "Resume"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
