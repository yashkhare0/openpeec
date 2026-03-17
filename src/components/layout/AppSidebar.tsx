import { startTransition } from "react";
import {
  Activity,
  Bot,
  FileText,
  Link2,
  Search,
  Settings2,
} from "lucide-react";

import { ModeToggle } from "@/components/ModeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type PageKey = "overview" | "prompts" | "sources" | "models" | "settings";

const pages: Array<{ key: PageKey; label: string; icon: typeof Activity }> = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "prompts", label: "Prompts", icon: FileText },
  { key: "sources", label: "Sources", icon: Link2 },
  { key: "models", label: "Models", icon: Bot },
  { key: "settings", label: "Settings", icon: Settings2 },
];

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">O</span>
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-xs text-muted-foreground">OpenPeec</span>
                <span className="font-semibold">Visibility Lab</span>
              </div>
              <div className="ml-auto">
                <ModeToggle />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="text-muted-foreground">
                  <Search className="size-4" />
                  <span>Quick Actions</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={page === item.key}
                    onClick={() => startTransition(() => onPage(item.key))}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Active client
              </p>
              <p className="mt-1 text-sm font-semibold">ChatGPT</p>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
