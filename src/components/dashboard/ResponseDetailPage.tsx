import { ArrowUpRightIcon } from "lucide-react";
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
import { InlineEmpty } from "./components/EmptyState";

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function formatScore(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}`;
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

function domainFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseOutputPayload(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as {
      finalUrl?: string;
      artifacts?: {
        runDir?: string;
        screenshot?: string;
        video?: string | null;
        trace?: string;
        pageHtml?: string;
        responseHtml?: string;
        sources?: string;
      };
    };
  } catch {
    return null;
  }
}

const typeTone: Record<string, string> = {
  ugc: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  editorial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  corporate: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  docs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  social: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  other: "bg-muted text-muted-foreground",
};

export function ResponseDetailPage({
  runDetail,
  onBack,
}: {
  runDetail:
    | {
        run: {
          status: string;
          startedAt: number;
          model: string;
          responseSummary?: string;
          sourceCount?: number;
          visibilityScore?: number;
          citationQualityScore?: number;
          deeplinkUsed?: string;
          evidencePath?: string;
          output?: string;
          warnings?: string[];
        };
        prompt?: {
          name: string;
          promptText: string;
        } | null;
        mentions?: Array<{
          entityId: Id<"trackedEntities">;
          name: string;
          slug: string;
          kind: string;
          mentionCount: number;
          citationCount: number;
          ownedCitationCount: number;
          matchedTerms: string[];
        }>;
        citations: Array<{
          domain: string;
          url: string;
          title?: string;
          snippet?: string;
          type: string;
          position: number;
          qualityScore?: number;
          isOwned?: boolean;
          trackedEntity?: {
            name: string;
            slug: string;
          } | null;
        }>;
      }
    | undefined;
  onBack: () => void;
}) {
  const outputPayload = parseOutputPayload(runDetail?.run.output);

  if (!runDetail) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="No response detail available yet." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to prompt
        </Button>
      </div>

      <div className="grid gap-4 px-4 xl:grid-cols-[minmax(0,1.05fr)_380px] lg:px-6">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{runDetail.prompt?.name ?? "Selected response"}</CardTitle>
              <CardDescription>
                {runDetail.run.model} | {titleCase(runDetail.run.status)} |{" "}
                {formatFreshness(runDetail.run.startedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {runDetail.run.sourceCount ?? runDetail.citations.length} sources
                </Badge>
                {runDetail.run.visibilityScore !== undefined ? (
                  <Badge variant="outline">
                    Visibility {formatPercent(runDetail.run.visibilityScore)}
                  </Badge>
                ) : null}
                {runDetail.run.citationQualityScore !== undefined ? (
                  <Badge variant="outline">
                    Citation {formatScore(runDetail.run.citationQualityScore)}
                  </Badge>
                ) : null}
              </div>

              {runDetail.prompt?.promptText ? (
                <section className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Prompt
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">
                    {runDetail.prompt.promptText}
                  </p>
                </section>
              ) : null}

              {runDetail.run.responseSummary ? (
                <section className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Response Summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">
                    {runDetail.run.responseSummary}
                  </p>
                </section>
              ) : null}

              {runDetail.citations.length === 0 ? (
                <InlineEmpty text="No citations were captured for this response." />
              ) : (
                <Card className="border-dashed shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Sources Used in This Response</CardTitle>
                    <CardDescription>
                      These are the actual sources cited inside the captured answer.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {runDetail.citations.map((citation, index) => (
                      <div key={`${citation.url}-${index}`} className="rounded-xl border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">#{citation.position}</Badge>
                              <p className="truncate text-sm font-medium">
                                {citation.title || citation.domain}
                              </p>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {domainFromUrl(citation.url) || citation.domain}
                            </p>
                          </div>
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Open
                            <ArrowUpRightIcon className="size-3.5" />
                          </a>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge
                            variant="secondary"
                            className={typeTone[citation.type.toLowerCase()] ?? ""}
                          >
                            {titleCase(citation.type)}
                          </Badge>
                          {citation.qualityScore !== undefined ? (
                            <Badge variant="outline">
                              Quality {formatScore(citation.qualityScore)}
                            </Badge>
                          ) : null}
                          {citation.isOwned ? <Badge variant="outline">Owned</Badge> : null}
                          {citation.trackedEntity ? (
                            <Badge variant="outline">{citation.trackedEntity.name}</Badge>
                          ) : null}
                        </div>
                        {citation.snippet ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {citation.snippet}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Entity Mentions</CardTitle>
              <CardDescription>
                Brands and tracked entities that surfaced in this response.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {runDetail.mentions?.length ? (
                runDetail.mentions.map((mention) => (
                  <div key={String(mention.entityId)} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{mention.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {titleCase(mention.kind)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{mention.mentionCount} mentions</Badge>
                        <Badge variant="outline">{mention.citationCount} citations</Badge>
                      </div>
                    </div>
                    {mention.matchedTerms.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Terms: {mention.matchedTerms.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <InlineEmpty text="No tracked entity mentions were detected for this response." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence Paths</CardTitle>
              <CardDescription>
                Local artifacts for verifying what actually happened during the run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              {runDetail.run.deeplinkUsed ? (
                <p className="break-all">Deep link: {runDetail.run.deeplinkUsed}</p>
              ) : null}
              {runDetail.run.evidencePath ? (
                <p className="break-all">Screenshot: {runDetail.run.evidencePath}</p>
              ) : null}
              {outputPayload?.artifacts?.video ? (
                <p className="break-all">Video: {outputPayload.artifacts.video}</p>
              ) : null}
              {outputPayload?.artifacts?.trace ? (
                <p className="break-all">Trace: {outputPayload.artifacts.trace}</p>
              ) : null}
              {outputPayload?.artifacts?.pageHtml ? (
                <p className="break-all">Page HTML: {outputPayload.artifacts.pageHtml}</p>
              ) : null}
              {outputPayload?.artifacts?.responseHtml ? (
                <p className="break-all">Response HTML: {outputPayload.artifacts.responseHtml}</p>
              ) : null}
              {outputPayload?.artifacts?.sources ? (
                <p className="break-all">Sources JSON: {outputPayload.artifacts.sources}</p>
              ) : null}
              {runDetail.run.warnings?.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
                  {runDetail.run.warnings.join(" | ")}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
