import { useCallback, useEffect, useRef } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

type PageKey =
  | "overview"
  | "prompts"
  | "providers"
  | "runs"
  | "responses"
  | "sources";

function buildSteps(onNavigate: (page: PageKey) => void): DriveStep[] {
  return [
    {
      element: "[data-tour='sidebar-nav']",
      popover: {
        title: "Sidebar Navigation",
        description:
          "Switch between pages here. Overview shows the dashboard, Prompts manages monitored questions, Runs and Responses drill into execution detail, and Sources tracks citation domains.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[data-tour='header-filters']",
      popover: {
        title: "Filter Your Data",
        description:
          "Narrow your analytics by time range (7, 30, or 90 days) and by provider. Changes apply across all dashboard views.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "[data-tour='kpi-cards']",
      popover: {
        title: "KPI Cards",
        description:
          "Your at-a-glance metrics: captured runs, citation quality, source coverage, and run health. Each card shows the current value with a compact comparison or freshness signal.",
        side: "bottom",
        align: "start",
      },
      onHighlightStarted: () => {
        onNavigate("overview");
      },
    },
    {
      element: "[data-tour='charts-area']",
      popover: {
        title: "Trends & Provider Comparison",
        description:
          "The trend chart tracks citation quality and coverage over time. Use the surrounding pages to move from prompt setup into run and response inspection.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "[data-tour='tutorial-btn']",
      popover: {
        title: "You're All Set!",
        description:
          "That's the tour! Configure your monitor and run the local runner to populate the dashboard with real data. You can restart this tutorial anytime by clicking this button.",
        side: "bottom",
        align: "end",
      },
    },
  ];
}

export function ProductTour({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: PageKey) => void;
}) {
  const driverRef = useRef<Driver | null>(null);

  const start = useCallback(() => {
    // Always navigate to overview first so initial steps are visible
    onNavigate("overview");

    // Small delay to let React render the overview page before driver.js
    // tries to find the elements
    setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "black",
        stagePadding: 8,
        stageRadius: 8,
        popoverClass: "openpeec-tour",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Done",
        progressText: "{{current}} of {{total}}",
        steps: buildSteps(onNavigate),
        onDestroyed: () => {
          driverRef.current = null;
          onClose();
        },
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }, 150);
  }, [onNavigate, onClose]);

  // Start when open becomes true
  useEffect(() => {
    if (open) {
      start();
    }
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, [open, start]);

  return null;
}
