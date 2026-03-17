import { KpiCards } from "./components/KpiCards";
import { TrendChart } from "./components/TrendChart";
import { CompetitorTable } from "./components/CompetitorTable";
import { DomainTable } from "./components/DomainTable";
import { SourceMixChart } from "./components/SourceMixChart";
import { EmptyState } from "./components/EmptyState";

type Tone = "positive" | "negative" | "neutral";
type TrendPoint = {
  label: string;
  visibility: number;
  citation: number;
  coverage: number;
};

export function OverviewPage({
  loading,
  hasData,
  kpis,
  trend,
  overview,
  sources,
  sourceMix,
  onOpenSettings,
}: {
  loading: boolean;
  hasData: boolean;
  kpis: Array<{ label: string; value: string; delta: string; tone: Tone }>;
  trend: TrendPoint[];
  overview:
    | {
        modelComparison: Array<{
          model: string;
          visibility: number | undefined;
          citationQuality: number | undefined;
          averagePosition: number | undefined;
          deltaVisibility: number | undefined;
        }>;
      }
    | undefined;
  sources: Array<{
    domain: string;
    type: string;
    usedShare: number;
    avgCitationsPerRun: number;
    avgQualityScore: number | undefined;
  }>;
  sourceMix: Array<{ type: string; share: number }>;
  onOpenSettings: () => Promise<void>;
}) {
  if (!loading && !hasData) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <EmptyState
            title="No analytics runs yet"
            description="Run the local ChatGPT monitor once and ingest the result to populate visibility, citation quality, and source coverage."
            actionLabel="Review runner setup"
            onAction={onOpenSettings}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div data-tour="kpi-cards" className="px-4 lg:px-6">
        <KpiCards kpis={kpis} />
      </div>

      <div data-tour="charts-area" className="grid gap-4 px-4 xl:grid-cols-[1.4fr_1fr] lg:px-6">
        <TrendChart trend={trend} />
        <CompetitorTable rows={overview?.modelComparison ?? []} />
      </div>

      <div className="grid gap-4 px-4 xl:grid-cols-[1.2fr_0.8fr] lg:px-6">
        <DomainTable sources={sources} />
        <SourceMixChart sourceMix={sourceMix} />
      </div>
    </div>
  );
}
