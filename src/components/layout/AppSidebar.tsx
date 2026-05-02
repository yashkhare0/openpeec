import { startTransition } from "react";
import {
  Activity,
  FileStack,
  FileText,
  Globe2,
  Link2,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { ModeToggle } from "@/components/ModeToggle";
import { OpenPeecMark } from "@/components/layout/OpenPeecMark";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

type PageKey =
  | "overview"
  | "prompts"
  | "providers"
  | "runs"
  | "responses"
  | "sources";

type PageItem = { key: PageKey; label: string; icon: typeof Activity };

const pageItems: PageItem[] = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "prompts", label: "Prompts", icon: FileText },
  { key: "providers", label: "Providers", icon: Globe2 },
  { key: "runs", label: "Runs", icon: FileStack },
  { key: "responses", label: "Responses", icon: MessageSquareText },
  { key: "sources", label: "Sources", icon: Link2 },
];

const navButtonClassName =
  "h-9 rounded-lg border border-transparent px-3 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:border-sidebar-border/80 data-[active=true]:bg-sidebar-accent/85 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2!";

function SidebarCollapseButton() {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  const isExpanded = state === "expanded";
  const Icon = isExpanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
      title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
      className="text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:rounded-lg"
      onClick={toggleSidebar}
    >
      <Icon />
    </Button>
  );
}

export function AppSidebar({
  page,
  onPage,
  ...props
}: {
  page: PageKey;
  onPage: (page: PageKey) => void;
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Overview"
                className="hover:bg-sidebar-accent/45 h-10 rounded-xl px-2.5"
                onClick={() => startTransition(() => onPage("overview"))}
              >
                <div className="bg-sidebar-primary/8 text-sidebar-foreground border-sidebar-border/70 flex size-8 shrink-0 items-center justify-center rounded-lg border">
                  <OpenPeecMark className="size-5" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarCollapseButton />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-3" />

      <SidebarContent className="px-3 py-2" data-tour="sidebar-nav">
        <SidebarMenu className="gap-1">
          {pageItems.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                isActive={page === item.key}
                onClick={() => startTransition(() => onPage(item.key))}
                tooltip={item.label}
                className={navButtonClassName}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarSeparator className="mx-3" />

      <SidebarFooter className="gap-2 px-3 pt-2 pb-3">
        <ModeToggle className={navButtonClassName} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
