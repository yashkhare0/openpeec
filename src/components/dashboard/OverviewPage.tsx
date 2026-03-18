import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DomainTable } from "./components/DomainTable";
import { EmptyState, InlineEmpty } from "./components/EmptyState";
import { KpiCards } from "./components/KpiCards";
import { SourceMixChart } from "./components/SourceMixChart";
import { TrendChart } from "./components/TrendChart";

type Tone = "positive" | "negative" | "neutral";
type TrendPoint = {
  label: string;
  visibility: number;
  citation: number;
  coverage: number;
};

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

export function OverviewPage({
  loading,
  hasData,
  kpis,
  trend,
  overview,
  sources,
  sourceMix,
}: {
  loading: boolean;
  hasData: boolean;
  kpis: Array<{ label: string; value: string; delta: string; tone: Tone }>;
  trend: TrendPoint[];
  overview:
    | {
        promptComparison: Array<{
          promptId: string;
          name: string;
          responseCount: number;
          latestStatus: string;
          latestResponseSummary: string;
          sourceDiversity: number;
          responseDrift?: number;
          topEntity?: string;
        }>;
        entityLeaderboard: Array<{
          entityId: string;
          name: string;
          kind: string;
          mentionCount: number;
          responseCount: number;
          citationCount: number;
        }>;
      }
    | undefined;
  sources: Array<{
    domain: string;
    type: string;
    usedShare: number;
    avgCitationsPerRun: number;
    avgQualityScore: number | undefined;
    promptCount?: number;
    latestResponses?: Array<{
      promptName: string;
      responseSummary: string;
      position: number;
    }>;
  }>;
  sourceMix: Array<{ type: string; share: number }>;
}) {
  if (!loading && !hasData) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <EmptyState
            title="No response analytics yet"
            description="Run prompt monitoring locally to capture real responses, cited sources, and brand/entity mentions."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.12fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Visibility Command Center</CardTitle>
              <CardDescription>
                Track how prompts change over time, which brands appear in the
                answers, and which sources ChatGPT is actually using.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KpiCards kpis={kpis} />
            </CardContent>
          </Card>

          <div
            data-tour="charts-area"
            className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]"
          >
            <TrendChart trend={trend} />
            <Card>
              <CardHeader>
                <CardTitle>Prompt Response Variance</CardTitle>
                <CardDescription>
                  Which prompts are changing most across their captured
                  responses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(overview?.promptComparison?.length ?? 0) === 0 ? (
                  <InlineEmpty text="No prompt comparison data yet." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prompt</TableHead>
                        <TableHead className="text-right">Responses</TableHead>
                        <TableHead className="text-right">Drift</TableHead>
                        <TableHead className="text-right">Sources</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview?.promptComparison.slice(0, 6).map((row) => (
                        <TableRow key={row.promptId}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{row.name}</p>
                                <Badge variant="outline">
                                  {row.latestStatus}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground line-clamp-2 text-xs">
                                {row.latestResponseSummary ||
                                  "No completed response yet."}
                              </p>
                              {row.topEntity ? (
                                <p className="text-muted-foreground text-[11px] tracking-[0.16em] uppercase">
                                  Top brand/entity: {row.topEntity}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.responseCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(row.responseDrift)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.sourceDiversity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
            <DomainTable sources={sources} />
            <Card>
              <CardHeader>
                <CardTitle>Latest Source Attribution</CardTitle>
                <CardDescription>
                  Which prompt responses most recently cited each source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? (
                  <InlineEmpty text="No source attribution data yet." />
                ) : (
                  <div className="space-y-3">
                    {sources.slice(0, 6).map((source) => (
                      <div
                        key={source.domain}
                        className="bg-muted/20 rounded-xl border p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{source.domain}</p>
                            <p className="text-muted-foreground text-xs">
                              Used in {source.promptCount ?? 0} prompts
                            </p>
                          </div>
                          <Badge variant="outline">{source.type}</Badge>
                        </div>
                        {source.latestResponses?.[0] ? (
                          <div className="mt-3 space-y-1">
                            <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
                              Latest prompt
                            </p>
                            <p className="text-foreground/90 text-sm">
                              {source.latestResponses[0].promptName}
                            </p>
                            <p className="text-muted-foreground line-clamp-2 text-sm">
                              {source.latestResponses[0].responseSummary}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Brands and Entities</CardTitle>
              <CardDescription>
                Which brands or tracked entities are surfacing across responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(overview?.entityLeaderboard?.length ?? 0) === 0 ? (
                <InlineEmpty text="No tracked entity mentions yet." />
              ) : (
                <div className="space-y-3">
                  {overview?.entityLeaderboard.slice(0, 8).map((entity) => (
                    <div
                      key={entity.entityId}
                      className="bg-muted/20 rounded-xl border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{entity.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {entity.kind} across {entity.responseCount}{" "}
                            responses
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {entity.mentionCount} mentions
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {entity.citationCount} linked citations
                        </Badge>
                        <Badge variant="outline">
                          {entity.responseCount} responses
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <SourceMixChart sourceMix={sourceMix} />

          <Card>
            <CardHeader>
              <CardTitle>Coverage Signals</CardTitle>
              <CardDescription>
                Read the overview as prompt quality, source quality, and brand
                presence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SignalTile
                title="Prompt variance"
                description="High drift means the same prompt is producing materially different answers across runs."
              />
              <SignalTile
                title="Source concentration"
                description="Watch whether a small set of domains dominates citations or whether source coverage is broadening."
              />
              <SignalTile
                title="Brand surfacing"
                description="If tracked brands stop appearing in responses or citations, that is a content and visibility signal."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SignalTile({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-muted/20 rounded-xl border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {description}
      </p>
    </div>
  );
}
