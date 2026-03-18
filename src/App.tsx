import { ThemeProvider } from "./components/ThemeProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { MonitoringDashboard } from "./components/dashboard/MonitoringDashboard";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <MonitoringDashboard />
      </TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );
}
