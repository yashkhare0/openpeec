import { FormEvent, useCallback, useState } from "react";
import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { Id } from "convex/_generated/dataModel";

import { api } from "../../convex/_generated/api";
import { SignIn } from "./Profile";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type MonitorPlatform = "web" | "desktop" | "ios" | "android";

interface FormData {
  name: string;
  description: string;
  platform: MonitorPlatform;
  schedule: string;
  checkConfig: string;
  authProfileId: string;
  deepLinkTemplateId: string;
  enabled: boolean;
}

const initialFormData: FormData = {
  name: "",
  description: "",
  platform: "web",
  schedule: "*/10 * * * *",
  checkConfig: "",
  authProfileId: "",
  deepLinkTemplateId: "",
  enabled: true,
};

export function Register() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { isAuthenticated } = useConvexAuth();
  const authProfiles =
    useQuery(
      api.monitoring.listAuthProfiles,
      isAuthenticated ? { client: "chatgpt" } : "skip"
    ) ?? [];
  const deepLinks =
    useQuery(
      api.monitoring.listDeepLinkTemplates,
      isAuthenticated ? { client: "chatgpt" } : "skip"
    ) ?? [];
  const createMonitor = useMutation(api.monitoring.createMonitor);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = event.target;
    if (type === "checkbox") {
      const checked = (event.target as HTMLInputElement).checked;
      setFormData((current) => ({ ...current, [name]: checked }));
      return;
    }
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleCreateMonitor = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!formData.name.trim()) {
        setError("Monitor name is required.");
        return;
      }
      setError(null);

      try {
        await createMonitor({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          client: "chatgpt",
          platform: formData.platform,
          enabled: formData.enabled,
          schedule: formData.schedule.trim() || undefined,
          checkConfig: formData.checkConfig.trim() || undefined,
          authProfileId: formData.authProfileId
            ? (formData.authProfileId as Id<"authProfiles">)
            : undefined,
          deepLinkTemplateId: formData.deepLinkTemplateId
            ? (formData.deepLinkTemplateId as Id<"deepLinkTemplates">)
            : undefined,
        });
        setFormData(initialFormData);
        setOpen(false);
      } catch (err) {
        setError("Failed to create monitor.");
        console.error("Failed to create monitor:", err);
      }
    },
    [createMonitor, formData]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create monitor</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateMonitor(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>New ChatGPT Monitor</DialogTitle>
            <DialogDescription>
              Create a monitor definition backed by local auth profiles and deep
              link templates.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="ChatGPT: conversation health check"
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Checks deep-link launch and expected first response."
                className="col-span-3 min-h-16"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="platform" className="text-right">
                Platform
              </Label>
              <select
                id="platform"
                name="platform"
                value={formData.platform}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    platform: event.target.value as MonitorPlatform,
                  }))
                }
                className="col-span-3 h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="web">Web</option>
                <option value="desktop">Desktop</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="schedule" className="text-right">
                Schedule
              </Label>
              <Input
                id="schedule"
                name="schedule"
                value={formData.schedule}
                onChange={handleChange}
                placeholder="*/10 * * * *"
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="authProfileId" className="text-right">
                Auth profile
              </Label>
              <select
                id="authProfileId"
                name="authProfileId"
                value={formData.authProfileId}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    authProfileId: event.target.value,
                  }))
                }
                className="col-span-3 h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {authProfiles.map((profile) => (
                  <option key={profile._id} value={profile._id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deepLinkTemplateId" className="text-right">
                Deep link
              </Label>
              <select
                id="deepLinkTemplateId"
                name="deepLinkTemplateId"
                value={formData.deepLinkTemplateId}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    deepLinkTemplateId: event.target.value,
                  }))
                }
                className="col-span-3 h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {deepLinks.map((link) => (
                  <option key={link._id} value={link._id}>
                    {link.name} ({link.platform})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="checkConfig" className="pt-2 text-right">
                Check config
              </Label>
              <Textarea
                id="checkConfig"
                name="checkConfig"
                value={formData.checkConfig}
                onChange={handleChange}
                placeholder='{"assertions":["urlLoaded","threadVisible"]}'
                className="col-span-3 min-h-20"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="enabled" className="text-right">
                Enabled
              </Label>
              <label className="col-span-3 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  id="enabled"
                  name="enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={handleChange}
                />
                Run this monitor on schedule.
              </label>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-4 items-center gap-4">
            <div className="col-span-3 text-left text-red-500">
              {isAuthenticated ? error : "Must be signed in to create a monitor."}
            </div>
            <Authenticated>
              <Button type="submit" className="col-span-1">
                Save monitor
              </Button>
            </Authenticated>
            <Unauthenticated>
              <SignIn />
            </Unauthenticated>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
