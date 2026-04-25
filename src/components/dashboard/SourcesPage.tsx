import type { Id } from "../../../convex/_generated/dataModel";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  DashboardCardSkeleton,
  DashboardTableCardSkeleton,
} from "./components/LoadingState";

type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";

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

const typeColors: Record<string, string> = {
  ugc: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  editorial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  corporate:
    "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  docs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  social: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300",
  other: "bg-muted text-muted-foreground",
};

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
}: {
  loading?: boolean;
  sources: Array<{
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
    latestResponses?: Array<{
      runId: Id<"promptRuns">;
      promptId: Id<"prompts">;
      promptExcerpt: string;
      providerName: string;
      startedAt: number;
      responseSummary: string;
      position: number;
    }>;
  }>;
  entities: Array<{
    _id: Id<"trackedEntities">;
    name: string;
    kind: TrackedKind;
    ownedDomains?: string[];
    active: boolean;
  }>;
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
}) {
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

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1fr_360px]">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-20" rows={6} columns={6} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
              <CardDescription>
                Domains ranked by citation frequency and quality.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sources.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Used share</TableHead>
                      <TableHead className="text-right">Responses</TableHead>
                      <TableHead className="text-right">Avg quality</TableHead>
                      <TableHead>Latest response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sources.map((source) => (
                      <TableRow key={source.domain}>
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
                            <span className="font-medium">{source.domain}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              typeColors[source.type.toLowerCase()] ?? ""
                            }
                          >
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
                        <TableCell>
                          <div className="space-y-1">
                            {source.latestResponses?.[0] ? (
                              <>
                                <p className="text-sm font-medium">
                                  {source.latestResponses[0].promptExcerpt}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {formatFreshness(
                                    source.latestResponses[0].startedAt
                                  )}{" "}
                                  | {source.latestResponses[0].providerName}{" "}
                                  | #{source.latestResponses[0].position}
                                </p>
                              </>
                            ) : (
                              <p className="text-muted-foreground text-sm">
                                No response lineage
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <InlineEmpty text="No source analytics available yet." />
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <DashboardCardSkeleton
            titleWidth="w-32"
            descriptionWidth="w-48"
            contentClassName="space-y-3"
          >
            <div className="grid gap-2 rounded-lg border p-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Skeleton className="h-7 w-14" />
                    <Skeleton className="h-7 w-14" />
                    <Skeleton className="h-7 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </DashboardCardSkeleton>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Tracked Entities</CardTitle>
              <CardDescription>
                Maintain brand and competitor coverage targets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/30 grid gap-2 rounded-lg border p-3">
                <Input
                  value={newEntityName}
                  onChange={(e) => onNewEntityName(e.target.value)}
                  placeholder="Entity name"
                  className="h-8"
                />
                <Select
                  value={newEntityKind}
                  onValueChange={(v) => onNewEntityKind(v as TrackedKind)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["brand", "competitor", "product", "feature", "other"].map(
                      (kind) => (
                        <SelectItem key={kind} value={kind}>
                          {titleCase(kind)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <Input
                  value={newEntityDomain}
                  onChange={(e) => onNewEntityDomain(e.target.value)}
                  placeholder="Owned domains (comma-separated)"
                  className="h-8"
                />
                <Button size="sm" onClick={() => void createEntity()}>
                  Add entity
                </Button>
              </div>

              {entities.length === 0 ? (
                <InlineEmpty text="No tracked entities yet." />
              ) : (
                entities.map((entity) => (
                  <div
                    key={String(entity._id)}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{entity.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {titleCase(entity.kind)} |{" "}
                          {(entity.ownedDomains ?? []).join(", ") ||
                            "No domains"}
                        </p>
                      </div>
                      <Badge
                        variant={entity.active ? "default" : "secondary"}
                        className={cn(
                          entity.active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                            : ""
                        )}
                      >
                        {entity.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          void renameEntity(entity._id, entity.name)
                        }
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          void onUpdateEntity({
                            id: entity._id,
                            active: !entity.active,
                          })
                            .then(() =>
                              toast.success(
                                entity.active
                                  ? "Entity paused."
                                  : "Entity resumed."
                              )
                            )
                            .catch((error: unknown) =>
                              toast.error(errorMessage(error))
                            )
                        }
                      >
                        {entity.active ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-7 text-xs"
                        onClick={() =>
                          void onDeleteEntity({ id: entity._id })
                            .then(() => toast.success("Entity deleted."))
                            .catch((error: unknown) =>
                              toast.error(errorMessage(error))
                            )
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
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
