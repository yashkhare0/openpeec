import { startTransition } from "react";
import {
  Activity,
  FileStack,
  FileText,
  Link2,
  ListTree,
  MessageSquareText,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type PageKey =
  | "overview"
  | "prompts"
  | "runs"
  | "groups"
  | "responses"
  | "sources";

const mainPages: Array<{ key: PageKey; label: string; icon: typeof Activity }> =
  [
    { key: "overview", label: "Overview", icon: Activity },
    { key: "prompts", label: "Prompts", icon: FileText },
    { key: "runs", label: "Runs", icon: FileStack },
    { key: "groups", label: "Groups", icon: ListTree },
    { key: "responses", label: "Responses", icon: MessageSquareText },
    { key: "sources", label: "Sources", icon: Link2 },
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
            <SidebarMenuButton size="lg" tooltip="OpenPeec">
              <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                <span className="text-sm font-bold">O</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">OpenPeec</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
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
      </SidebarContent>
    </Sidebar>
  );
}
