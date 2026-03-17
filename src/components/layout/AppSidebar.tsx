import { startTransition } from "react";
import {
  Activity,
  Bot,
  FileText,
  Link2,
  Settings2,
} from "lucide-react";

import { ModeToggle } from "@/components/ModeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type PageKey = "overview" | "prompts" | "sources" | "models" | "settings";

const mainPages: Array<{ key: PageKey; label: string; icon: typeof Activity }> =
  [
    { key: "overview", label: "Overview", icon: Activity },
    { key: "prompts", label: "Prompts", icon: FileText },
    { key: "sources", label: "Sources", icon: Link2 },
    { key: "models", label: "Models", icon: Bot },
  ];

const secondaryItems = [
  { key: "settings" as PageKey, label: "Settings", icon: Settings2 },
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
            <SidebarMenuButton asChild size="lg">
              <a href="#">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-sm font-bold">O</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">OpenPeec</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Visibility Lab
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainPages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={page === item.key}
                    onClick={() => startTransition(() => onPage(item.key))}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={page === item.key}
                    onClick={() => startTransition(() => onPage(item.key))}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <ModeToggle />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
