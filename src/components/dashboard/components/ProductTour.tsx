import { useCallback, useEffect, useRef } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

type PageKey = "overview" | "prompts" | "sources" | "models" | "settings";

function buildSteps(onNavigate: (page: PageKey) => void): DriveStep[] {
  return [
    {
      element: "[data-tour='sidebar-nav']",
      popover: {
        title: "Sidebar Navigation",
        description:
          "Switch between pages here. Overview shows your dashboard, Prompts lets you manage what to monitor, Sources tracks citation domains, and Models compares AI engines.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[data-tour='client-badge']",
      popover: {
        title: "Active Client",
        description:
          "This shows which AI platform you're currently monitoring. OpenPeec tracks how your brand appears in ChatGPT, Perplexity, Gemini, and others.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "[data-tour='header-filters']",
      popover: {
        title: "Filter Your Data",
        description:
          "Narrow your analytics by time range (7, 30, or 90 days) and by specific AI model. Changes apply across all dashboard views.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "[data-tour='auth-area']",
      popover: {
        title: "Sign In",
        description:
          "Sign in with GitHub, Google, or email to load your analytics data. All monitoring data is tied to your account.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: "[data-tour='kpi-cards']",
      popover: {
        title: "KPI Cards",
        description:
          "Your at-a-glance metrics: Visibility score, Citation quality, Source coverage, and Run health. Each card shows the current value and trend vs. the previous period.",
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
        title: "Trends & Model Comparison",
        description:
          "The trend chart tracks visibility, citations, and coverage over time. Toggle between series using the buttons. The table compares how different AI models represent your brand.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "[data-tour='export-btn']",
      popover: {
        title: "Export Data",
        description:
          "Download your analytics data for stakeholder reports and presentations.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: "[data-tour='tutorial-btn']",
      popover: {
        title: "You're All Set!",
        description:
          "That's the tour! Start by signing in, then configure your monitor in Settings. You can restart this tutorial anytime by clicking this button.",
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
