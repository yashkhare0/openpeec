import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        {value}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 xl:grid-cols-[1.1fr_0.9fr] lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Auth Profile & Runtime</CardTitle>
            <CardDescription>
              ChatGPT-first auth and deeplink config.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingField label="Client" value="ChatGPT" />
            <SettingField
              label="Profile source"
              value="Local storageState JSON or env-backed auth profile"
            />
            <SettingField
              label="Web entrypoint"
              value="https://chatgpt.com/"
            />
            <SettingField
              label="Runner command"
              value="npm run runner:prompt:example -- --ingest"
            />
            <SettingField
              label="Artifacts directory"
              value="runner/artifacts/<run-label>-<timestamp>/"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence Bundle</CardTitle>
            <CardDescription>
              Every real run should leave enough evidence to diagnose content gaps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingField label="Screenshot" value="page.png" />
            <SettingField label="Session recording" value="playwright video file" />
            <SettingField label="Trace" value="trace.zip for replay and DOM inspection" />
            <SettingField label="DOM capture" value="page.html and response.html" />
            <SettingField label="Source evidence" value="sources.json plus full last-run.json result" />
            <SettingField label="Network evidence" value="network.json and console.json" />
            <Separator />
            <p className="text-xs text-muted-foreground">
              No dummy data is injected. The dashboard reflects only authenticated, ingested runs from the local runner.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
