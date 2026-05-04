import type { Id } from "../../../convex/_generated/dataModel";
import { ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineEmpty } from "./components/EmptyState";
import { InfoTooltip } from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

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
  submitStrategy?: "type" | "deeplink";
  active: boolean;
};

const RUNNABLE_PROVIDER_SLUGS = new Set(["openai", "google-ai-mode"]);

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

function sessionModeLabel(mode: SessionMode | undefined) {
  return mode === "stored" ? "Stored" : "Guest";
}

function channelDetail(provider: ProviderRow) {
  return provider.channelSlug ?? "Browser";
}

function profileStatus(
  provider: ProviderRow,
  sessionMode: SessionMode,
  supportsStoredSession: boolean
) {
  if (!supportsStoredSession) {
    return {
      label: "Guest only",
      detail: undefined,
    };
  }

  if (!provider.sessionProfileDir) {
    return {
      label: "Not warmed",
      detail: "Warm once",
    };
  }

  return {
    label: provider.sessionProfileDir,
    detail: sessionMode === "stored" ? "In use" : "Saved",
  };
}

function readinessStatus(provider: ProviderRow, runnable: boolean) {
  if (!runnable) {
    return {
      label: "Pending",
      detail: "Not queueable",
      variant: "outline" as const,
    };
  }

  return {
    label: "Ready",
    detail:
      provider.submitStrategy === "deeplink" || provider.promptQueryParam
        ? "Deep link"
        : "Form",
    variant: "secondary" as const,
  };
}

function providerStateLabel(provider: ProviderRow, runnable: boolean) {
  if (provider.active) return "Active";
  return runnable ? "Paused" : "Unavailable";
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

  const toggleActive = async (provider: ProviderRow, checked: boolean) => {
    try {
      await onUpdateProvider({
        id: provider._id,
        active: checked,
      });
      toast.success(
        checked
          ? `${provider.name} enabled for queued runs.`
          : `${provider.name} paused.`
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

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
          description: "Warm the saved local session once.",
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
        checked ? "Stored session enabled." : "Guest session enabled."
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <DashboardTableCardSkeleton
            titleWidth="w-24"
            showControls={false}
            rows={4}
            columns={7}
          />
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
      <div className="px-4 lg:px-6">
        <Card className="shadow-none">
          <CardContent className="p-0">
            <Table className="min-w-[980px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[145px]">Provider</TableHead>
                  <TableHead className="w-[125px]">State</TableHead>
                  <TableHead className="w-[160px]">Channel</TableHead>
                  <TableHead className="w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <span>Session</span>
                      <InfoTooltip label="Session details" className="size-4">
                        Guest starts clean. Stored reuses a warmed local
                        session.
                      </InfoTooltip>
                    </div>
                  </TableHead>
                  <TableHead className="w-[190px]">
                    <div className="flex items-center gap-1.5">
                      <span>Profile</span>
                      <InfoTooltip label="Profile details" className="size-4">
                        Local path used by stored sessions.
                      </InfoTooltip>
                    </div>
                  </TableHead>
                  <TableHead className="w-[135px]">
                    <div className="flex items-center gap-1.5">
                      <span>Runner</span>
                      <InfoTooltip label="Runner details" className="size-4">
                        Provider contract readiness, not live worker health.
                      </InfoTooltip>
                    </div>
                  </TableHead>
                  <TableHead className="w-[130px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProviders.map((provider) => {
                  const sessionMode =
                    provider.sessionMode ??
                    (provider.slug === "openai" ? "stored" : "guest");
                  const supportsStoredSession = provider.slug === "openai";
                  const runnable = RUNNABLE_PROVIDER_SLUGS.has(provider.slug);
                  const canToggleActive = runnable || provider.active;
                  const profile = profileStatus(
                    provider,
                    sessionMode,
                    supportsStoredSession
                  );
                  const readiness = readinessStatus(provider, runnable);
                  const stateLabel = providerStateLabel(provider, runnable);
                  const activeSwitchId = `provider-active-${provider.slug}`;
                  const activeDetailId = `${activeSwitchId}-detail`;
                  const sessionSwitchId = `stored-session-${provider.slug}`;
                  const sessionDetailId = `${sessionSwitchId}-detail`;

                  return (
                    <TableRow key={String(provider._id)}>
                      <TableCell className="whitespace-normal">
                        <p className="truncate font-medium">{provider.name}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={activeSwitchId} className="sr-only">
                            {provider.active ? "Pause" : "Enable"}{" "}
                            {provider.name}
                          </Label>
                          <Switch
                            id={activeSwitchId}
                            checked={provider.active}
                            disabled={!canToggleActive}
                            aria-describedby={
                              !runnable ? activeDetailId : undefined
                            }
                            aria-label={`${provider.active ? "Pause" : "Enable"} ${provider.name}`}
                            onCheckedChange={(checked) =>
                              void toggleActive(provider, checked)
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{stateLabel}</p>
                            {!runnable ? (
                              <p
                                id={activeDetailId}
                                className="text-muted-foreground truncate text-xs"
                              >
                                Runner pending
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {provider.channelName ?? "Browser UI"}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {channelDetail(provider)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={sessionSwitchId} className="sr-only">
                            Use stored session for {provider.name}
                          </Label>
                          <Switch
                            id={sessionSwitchId}
                            checked={sessionMode === "stored"}
                            disabled={!supportsStoredSession}
                            aria-describedby={
                              !supportsStoredSession
                                ? sessionDetailId
                                : undefined
                            }
                            aria-label={`Use stored session for ${provider.name}`}
                            onCheckedChange={(checked) =>
                              void toggleStoredSession(provider, checked)
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {sessionModeLabel(sessionMode)}
                            </p>
                            {!supportsStoredSession ? (
                              <p
                                id={sessionDetailId}
                                className="text-muted-foreground truncate text-xs"
                              >
                                Not supported
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {profile.label}
                          </p>
                          {profile.detail ? (
                            <p className="text-muted-foreground truncate text-xs">
                              {profile.detail}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <Badge variant={readiness.variant}>
                            {readiness.label}
                          </Badge>
                          <p className="text-muted-foreground truncate text-xs">
                            {readiness.detail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!supportsStoredSession}
                            aria-describedby={
                              !supportsStoredSession
                                ? sessionDetailId
                                : undefined
                            }
                            onClick={() => void openSession(provider)}
                          >
                            <KeyRound data-icon="inline-start" />
                            Session
                          </Button>
                          <Button asChild size="icon-sm" variant="outline">
                            <a
                              href={provider.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${provider.name}`}
                              title={`Open ${provider.name}`}
                            >
                              <ExternalLink />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
