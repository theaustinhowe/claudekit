"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { APP_NAME } from "@/lib/constants";

export function useTabNavigation(
  defaultTab: string,
  basePath: string,
  tabLabels: Record<string, string>,
  pageTitle?: string,
  tabAliases?: Record<string, string>,
) {
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get("tab") || defaultTab;
  const activeTab = tabAliases?.[rawTab] ?? rawTab;

  const setActiveTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (tab === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      window.history.pushState(null, "", `${basePath}${qs ? `?${qs}` : ""}`);
    },
    [searchParams, defaultTab, basePath],
  );

  useEffect(() => {
    const label = tabLabels[activeTab] || tabLabels[defaultTab] || defaultTab;
    const parts = pageTitle ? [label, pageTitle, APP_NAME] : [label, APP_NAME];
    document.title = parts.join(" | ");
  }, [activeTab, tabLabels, defaultTab, pageTitle]);

  return { activeTab, setActiveTab };
}
