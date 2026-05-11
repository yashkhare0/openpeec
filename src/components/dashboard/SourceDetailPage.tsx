import { ArrowUpRightIcon, ExternalLinkIcon } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineEmpty } from "./components/EmptyState";
import type { SourceItem } from "./SourcesPage";

type SourceDetailPageProps = {
  loading?: boolean;
  source: SourceItem | undefined;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
};

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

function formatNumber(value: number | undefined): string {
  if (value === undefined) return "-";
  return String(Math.round(value));
}

function formatDecimal(value: number | undefined): string {
  if (value === undefined) return "-";
  return String(Math.round(value * 10) / 10);
}

function sourceUrl(domain: string) {
  return `https://${domain}`;
}

export function SourceDetailPage({
  loading = false,
  source,
  onOpenRun,
}: SourceDetailPageProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent>
              <div className="bg-muted/40 h-48 rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="Source not found." />
        </div>
      </div>
    );
  }

  const latestResponses = source.latestResponses ?? [];
  const promptExcerpts = source.promptExcerpts ?? [];
  const mentionedEntities = source.mentionedEntities ?? [];

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <section className="flex flex-col gap-4 border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-muted mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`}
                  alt=""
                  className="size-5 rounded-sm"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl leading-tight font-semibold">
                  <a
                    href={sourceUrl(source.domain)}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 rounded-sm break-words underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 break-words">{source.domain}</span>
                    <ExternalLinkIcon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline">{titleCase(source.type)}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Responses" value={String(source.responseCount)} />
            <Metric label="Citations" value={String(source.citations)} />
            <Metric label="Prompts" value={String(source.promptCount)} />
            <Metric
              label="Quality score"
              value={formatNumber(source.avgQualityScore)}
            />
            <Metric
              label="Avg rank"
              value={formatDecimal(source.avgPosition)}
            />
            <Metric
              label="Owned citations"
              value={formatPercent(source.ownedShare)}
            />
          </div>
          {mentionedEntities.length ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
              <span className="text-muted-foreground mr-1 text-xs font-medium uppercase">
                Entities
              </span>
              {mentionedEntities.map((entity) => (
                <Badge key={entity} variant="outline">
                  {entity}
                </Badge>
              ))}
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Responses citing this source</CardTitle>
            </CardHeader>
            <CardContent>
              {latestResponses.length ? (
                <Table className="block min-[840px]:table min-[840px]:table-fixed">
                  <TableHeader className="hidden min-[840px]:table-header-group">
                    <TableRow>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="w-[128px]">Provider</TableHead>
                      <TableHead className="w-[84px] text-right">
                        Rank
                      </TableHead>
                      <TableHead className="w-[88px] text-right">
                        View
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="block min-[840px]:table-row-group">
                    {latestResponses.map((response) => (
                      <TableRow
                        key={`${response.runId}-${response.position}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 py-3 min-[840px]:table-row min-[840px]:py-0"
                      >
                        <TableCell className="col-span-3 px-0 py-0 whitespace-normal min-[840px]:table-cell min-[840px]:p-2">
                          <p className="line-clamp-2 font-medium">
                            {response.promptExcerpt}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground min-[840px]:text-foreground min-w-0 px-0 py-0 text-sm min-[840px]:p-2">
                          {response.providerName}
                        </TableCell>
                        <TableCell className="px-0 py-0 text-right tabular-nums min-[840px]:p-2">
                          #{response.position}
                        </TableCell>
                        <TableCell className="px-0 py-0 text-right min-[840px]:p-2">
                          {onOpenRun ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-11 min-[840px]:size-7"
                              aria-label={`View response for ${response.promptExcerpt}`}
                              onClick={() => onOpenRun(response.runId)}
                            >
                              <ArrowUpRightIcon />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <InlineEmpty text="No responses cite this source yet." />
              )}
            </CardContent>
          </Card>

          {promptExcerpts.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Prompts citing this source</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="w-[112px] text-right">
                        Responses
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promptExcerpts.map((prompt) => {
                      const responseCount = latestResponses.filter(
                        (response) => response.promptExcerpt === prompt
                      ).length;

                      return (
                        <TableRow key={prompt}>
                          <TableCell className="whitespace-normal">
                            <p className="line-clamp-3 text-sm">{prompt}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {responseCount || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
