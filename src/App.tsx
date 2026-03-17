import { ThemeProvider } from "./components/ThemeProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { MonitoringDashboard } from "./components/dashboard/MonitoringDashboard";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <MonitoringDashboard />
      </TooltipProvider>
    </ThemeProvider>
  );
}
