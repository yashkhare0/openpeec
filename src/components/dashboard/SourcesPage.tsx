import type { Id } from "../../../convex/_generated/dataModel";
import { ListChecks, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import {
  clickableTableRowClassName,
  InfoTooltip,
} from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";

type SourceLatestResponse = {
  runId: Id<"promptRuns">;
  promptId: Id<"prompts">;
  promptExcerpt: string;
  providerName: string;
  startedAt: number;
  responseSummary: string;
  position: number;
};

type SourceItem = {
  domain: string;
  type: string;
  citations: number;
  responseCount: number;
  promptCount: number;
  usedShare: number;
  avgCitationsPerRun: number;
  avgQualityScore?: number;
  avgPosition?: number;
  ownedShare: number;
  latestResponses?: SourceLatestResponse[];
};

type TrackedEntity = {
  _id: Id<"trackedEntities">;
  name: string;
  kind: TrackedKind;
  ownedDomains?: string[];
  active: boolean;
};

type SourcesPageProps = {
  loading?: boolean;
  sources: SourceItem[];
  entities: TrackedEntity[];
  newEntityName: string;
  onNewEntityName: (value: string) => void;
  newEntityKind: TrackedKind;
  onNewEntityKind: (value: TrackedKind) => void;
  newEntityDomain: string;
  onNewEntityDomain: (value: string) => void;
  onCreateEntity: (args: {
    name: string;
    kind: TrackedKind;
    ownedDomains?: string[];
  }) => Promise<Id<"trackedEntities">>;
  onUpdateEntity: (args: {
    id: Id<"trackedEntities">;
    name?: string;
    active?: boolean;
  }) => Promise<Id<"trackedEntities">>;
  onDeleteEntity: (args: {
    id: Id<"trackedEntities">;
  }) => Promise<Id<"trackedEntities">>;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
  promptFilter?: {
    promptId: Id<"prompts">;
    promptExcerpt: string;
  } | null;
  onPromptFilterClear?: () => void;
};

const trackedKindOptions: TrackedKind[] = [
  "brand",
  "competitor",
  "product",
  "feature",
  "other",
];

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

export function SourcesPage({
  loading = false,
  sources,
  entities,
  newEntityName,
  onNewEntityName,
  newEntityKind,
  onNewEntityKind,
  newEntityDomain,
  onNewEntityDomain,
  onCreateEntity,
  onUpdateEntity,
  onDeleteEntity,
  onOpenRun,
  promptFilter,
  onPromptFilterClear,
}: SourcesPageProps) {
  const visibleSources = promptFilter
    ? sources.filter((source) =>
        source.latestResponses?.some(
          (response) => response.promptId === promptFilter.promptId
        )
      )
    : sources;

  const createEntity = async () => {
    if (!newEntityName.trim()) {
      toast.error("Entity name is required.");
      return;
    }
    const ownedDomains = newEntityDomain
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      await onCreateEntity({
        name: newEntityName.trim(),
        kind: newEntityKind,
        ownedDomains: ownedDomains.length ? ownedDomains : undefined,
      });
      onNewEntityName("");
      onNewEntityDomain("");
      toast.success("Tracked entity created.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renameEntity = async (
    id: Id<"trackedEntities">,
    currentName: string
  ) => {
    const next = window.prompt("New entity name", currentName);
    if (!next || next.trim() === currentName) return;
    try {
      await onUpdateEntity({ id, name: next.trim() });
      toast.success("Tracked entity updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleEntityActive = async (entity: TrackedEntity) => {
    try {
      await onUpdateEntity({ id: entity._id, active: !entity.active });
      toast.success(entity.active ? "Entity paused." : "Entity resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteEntity = async (id: Id<"trackedEntities">) => {
    try {
      await onDeleteEntity({ id });
      toast.success("Entity deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-20" rows={6} columns={6} />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {promptFilter ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="max-w-full">
                      <span className="text-muted-foreground mr-1">Prompt</span>
                      <span className="truncate">
                        {promptFilter.promptExcerpt}
                      </span>
                    </Badge>
                    {onPromptFilterClear ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onPromptFilterClear}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div />
                )}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Manage tracked entities"
                    >
                      <ListChecks data-icon="inline-start" />
                      Entities
                      <span className="text-muted-foreground tabular-nums">
                        {entities.length}
                      </span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-md">
                    <SheetHeader>
                      <SheetTitle>Tracked Entities</SheetTitle>
                      <SheetDescription className="sr-only">
                        Add, update, pause, or delete tracked entities.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
                      <div className="grid gap-2 rounded-lg border p-3">
                        <Input
                          value={newEntityName}
                          onChange={(e) => onNewEntityName(e.target.value)}
                          aria-label="Entity name"
                          placeholder="Entity name"
                          className="h-8"
                        />
                        <Select
                          value={newEntityKind}
                          onValueChange={(v) =>
                            onNewEntityKind(v as TrackedKind)
                          }
                        >
                          <SelectTrigger
                            className="h-8"
                            aria-label="Entity kind"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {trackedKindOptions.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {titleCase(kind)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={newEntityDomain}
                          onChange={(e) => onNewEntityDomain(e.target.value)}
                          aria-label="Owned domains"
                          placeholder="Owned domains"
                          className="h-8"
                        />
                        <Button size="sm" onClick={() => void createEntity()}>
                          Add entity
                        </Button>
                      </div>

                      {entities.length === 0 ? (
                        <InlineEmpty text="No tracked entities yet." />
                      ) : (
                        <div className="flex flex-col gap-2">
                          {entities.map((entity) => {
                            const ownedDomains =
                              (entity.ownedDomains ?? []).join(", ") ||
                              "No domains";

                            return (
                              <div
                                key={String(entity._id)}
                                className="rounded-lg border p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {entity.name}
                                    </p>
                                    <p className="text-muted-foreground line-clamp-2 text-xs">
                                      {titleCase(entity.kind)} | {ownedDomains}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Badge
                                      variant={
                                        entity.active ? "default" : "secondary"
                                      }
                                      className={cn(
                                        entity.active
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                                          : ""
                                      )}
                                    >
                                      {entity.active ? "Active" : "Paused"}
                                    </Badge>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`Open actions for ${entity.name}`}
                                        >
                                          <MoreHorizontal />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-36"
                                      >
                                        <DropdownMenuGroup>
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              void renameEntity(
                                                entity._id,
                                                entity.name
                                              )
                                            }
                                          >
                                            Rename
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              void toggleEntityActive(entity)
                                            }
                                          >
                                            {entity.active ? "Pause" : "Resume"}
                                          </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          variant="destructive"
                                          onSelect={() =>
                                            void deleteEntity(entity._id)
                                          }
                                        >
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              {visibleSources.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Used share
                          <InfoTooltip label="Used share definition">
                            Share of captured source citations attributed to
                            this domain.
                          </InfoTooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Responses
                          <InfoTooltip label="Responses definition">
                            Number of AI responses where this domain appeared as
                            a source.
                          </InfoTooltip>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          Avg quality
                          <InfoTooltip label="Average quality definition">
                            Mean source quality score for responses citing this
                            domain.
                          </InfoTooltip>
                        </div>
                      </TableHead>
                      <TableHead>Latest response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSources.map((source) => {
                      const latestResponse = source.latestResponses?.[0];
                      const canOpenLatestResponse =
                        latestResponse !== undefined && onOpenRun !== undefined;
                      const openLatestResponse = () => {
                        if (!latestResponse || !onOpenRun) return;
                        onOpenRun(latestResponse.runId);
                      };

                      return (
                        <TableRow
                          key={source.domain}
                          className={cn(
                            canOpenLatestResponse && clickableTableRowClassName
                          )}
                          tabIndex={canOpenLatestResponse ? 0 : undefined}
                          aria-label={
                            canOpenLatestResponse
                              ? `Open latest response for ${source.domain}`
                              : undefined
                          }
                          onClick={
                            canOpenLatestResponse
                              ? openLatestResponse
                              : undefined
                          }
                          onKeyDown={
                            canOpenLatestResponse
                              ? (event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openLatestResponse();
                                  }
                                }
                              : undefined
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="bg-muted flex size-6 items-center justify-center rounded">
                                <img
                                  src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                                  alt=""
                                  className="size-4 rounded-sm"
                                  onError={(event) => {
                                    (
                                      event.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              </div>
                              <span className="font-medium">
                                {source.domain}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {titleCase(source.type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(source.usedShare)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {source.responseCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {source.avgQualityScore !== undefined
                              ? Math.round(source.avgQualityScore)
                              : "-"}
                          </TableCell>
                          <TableCell className="min-w-[280px] whitespace-normal">
                            <div className="flex flex-col gap-1">
                              {latestResponse ? (
                                <>
                                  <p className="line-clamp-2 text-sm font-medium">
                                    {latestResponse.promptExcerpt}
                                  </p>
                                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                                    {formatFreshness(latestResponse.startedAt)}{" "}
                                    | {latestResponse.providerName} | #
                                    {latestResponse.position}
                                  </div>
                                </>
                              ) : (
                                <p className="text-muted-foreground text-sm">
                                  No latest response
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <InlineEmpty
                  text={
                    promptFilter
                      ? "No source analytics matched this prompt."
                      : "No source analytics available yet."
                  }
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatFreshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
