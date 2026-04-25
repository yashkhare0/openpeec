import type { Id } from "../../../convex/_generated/dataModel";
import { ExternalLink, Globe2, KeyRound, ShieldCheck } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InlineEmpty } from "./components/EmptyState";
import { DashboardCardSkeleton } from "./components/LoadingState";

type SessionMode = "guest" | "stored";

type ProviderRow = {
  _id: Id<"providers">;
  slug: string;
  name: string;
  url: string;
  channelSlug?: string;
  channelName?: string;
  transport?: "browser";
  sessionMode?: SessionMode;
  sessionProfileDir?: string;
  promptQueryParam?: string;
  active: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function sessionModeLabel(mode: SessionMode | undefined) {
  return mode === "stored" ? "Local Chrome profile" : "Ephemeral (no profile)";
}

async function openLocalSessionWindow(providerSlug: string) {
  const response = await fetch("/local-provider-session/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerSlug }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    status?: string;
    profileDir?: string;
    url?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Local session API unavailable. Start the window with `pnpm runner:open-session`."
    );
  }

  return payload;
}

export function ProvidersPage({
  loading = false,
  providers,
  onUpdateProvider,
}: {
  loading?: boolean;
  providers: ProviderRow[];
  onUpdateProvider: (args: {
    id: Id<"providers">;
    active?: boolean;
    sessionMode?: SessionMode;
    sessionProfileDir?: string;
  }) => Promise<Id<"providers">>;
}) {
  const sortedProviders = [...providers].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      left.name.localeCompare(right.name)
  );

  const openSession = async (provider: ProviderRow) => {
    try {
      const result = await openLocalSessionWindow(provider.slug);
      if (result.profileDir) {
        await onUpdateProvider({
          id: provider._id,
          sessionProfileDir: result.profileDir,
        });
      }
      toast.success(
        result.status === "already_open"
          ? "Session window is already open."
          : "Session window opened.",
        {
          description:
            "Log in or finish any checks in that window once; the runner reuses this Chrome profile.",
        }
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleStoredSession = async (
    provider: ProviderRow,
    checked: boolean
  ) => {
    try {
      await onUpdateProvider({
        id: provider._id,
        sessionMode: checked ? "stored" : "guest",
      });
      toast.success(
        checked
          ? "Local Chrome profile enabled for future OpenAI runs."
          : "Ephemeral guest runs enabled (no saved profile)."
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
          <DashboardCardSkeleton
            titleWidth="w-32"
            descriptionWidth="w-60"
            contentClassName="space-y-4"
          >
            <div className="bg-muted/40 h-28 rounded-xl" />
          </DashboardCardSkeleton>
          <DashboardCardSkeleton
            titleWidth="w-32"
            descriptionWidth="w-60"
            contentClassName="space-y-4"
          >
            <div className="bg-muted/40 h-28 rounded-xl" />
          </DashboardCardSkeleton>
        </div>
      </div>
    );
  }

  if (!providers.length) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="No providers are configured yet." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
        {sortedProviders.map((provider) => {
          const sessionMode = provider.sessionMode ?? "stored";
          const isOpenAi = provider.slug === "openai";
          const runnable = isOpenAi && provider.active;

          return (
            <Card key={String(provider._id)} className="min-w-0">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold">
                      {provider.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        {provider.name}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {provider.channelName ?? `${provider.name} web`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Badge variant={provider.active ? "default" : "secondary"}>
                      {provider.active ? "Active" : "Inactive"}
                    </Badge>
                    {!isOpenAi ? (
                      <Badge variant="outline">Runner pending</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Globe2 className="size-3.5" />
                      Channel
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      Browser UI capture
                    </p>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {provider.url}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <ShieldCheck className="size-3.5" />
                      Run mode
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {sessionModeLabel(sessionMode)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Future queued runs snapshot this mode.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`stored-session-${provider.slug}`}
                        className="text-sm"
                      >
                        Use local Chrome profile
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        Off = fresh guest context each run (no cookies; often
                        blocked). On = the profile you warm with the button
                        above.
                      </p>
                    </div>
                    <Switch
                      id={`stored-session-${provider.slug}`}
                      checked={sessionMode === "stored"}
                      disabled={!isOpenAi}
                      onCheckedChange={(checked) =>
                        void toggleStoredSession(provider, checked)
                      }
                    />
                  </div>
                  <p className="text-muted-foreground mt-3 truncate text-xs">
                    Profile: {provider.sessionProfileDir ?? "Not warmed yet"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={runnable ? "default" : "secondary"}
                    disabled={!isOpenAi}
                    onClick={() => void openSession(provider)}
                  >
                    <KeyRound data-icon="inline-start" />
                    Open session window
                  </Button>
                  <Button asChild variant="outline">
                    <a
                      href={provider.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink data-icon="inline-start" />
                      Open provider
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
