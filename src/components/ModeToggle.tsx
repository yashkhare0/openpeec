import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "./ThemeProvider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [systemDark, setSystemDark] = useState(false);
  const checked = theme === "dark" || (theme === "system" && systemDark);
  const Icon = checked ? Moon : Sun;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemDark(mediaQuery.matches);
    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon />
      <span className="group-data-[collapsible=icon]:hidden">Theme</span>
      <Switch
        checked={checked}
        onCheckedChange={(nextChecked) =>
          setTheme(nextChecked ? "dark" : "light")
        }
        aria-label="Toggle dark mode"
        className="ml-auto group-data-[collapsible=icon]:hidden"
      />
    </div>
  );
}
