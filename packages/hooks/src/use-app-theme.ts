"use client";

import { useCallback, useEffect, useState } from "react";

export interface ThemeDefinition {
  id: string;
  label: string;
  description: string;
  hue: number;
}

export const THEMES: ThemeDefinition[] = [
  { id: "amethyst", label: "Amethyst", description: "Clean neutrals with purple accents", hue: 262 },
  { id: "sapphire", label: "Sapphire", description: "Cool blue-tinted surfaces, ocean accents", hue: 221 },
  { id: "emerald", label: "Emerald", description: "Warm sage backgrounds, natural green accents", hue: 150 },
  { id: "ruby", label: "Ruby", description: "Soft rose surfaces, rich crimson accents", hue: 346 },
  { id: "amber", label: "Amber", description: "Creamy ivory backgrounds, golden accents", hue: 36 },
  { id: "slate", label: "Slate", description: "Cool gray surfaces, crisp teal accents", hue: 180 },
  { id: "midnight", label: "Midnight", description: "Deep indigo surfaces, electric blue accents", hue: 235 },
  { id: "sunset", label: "Sunset", description: "Warm peach surfaces, coral accents", hue: 15 },
  { id: "forest", label: "Forest", description: "Olive-tinted surfaces, chartreuse accents", hue: 85 },
];

export type ThemeId = (typeof THEMES)[number]["id"];

const DEFAULT_THEME: ThemeId = "amethyst";

function applyThemeClass(themeId: string) {
  const html = document.documentElement;
  for (const cls of Array.from(html.classList)) {
    if (cls.startsWith("theme-")) {
      html.classList.remove(cls);
    }
  }
  // Amethyst is the default (no class needed, uses :root tokens)
  if (themeId !== "amethyst") {
    html.classList.add(`theme-${themeId}`);
  }
}

export interface UseAppThemeOptions {
  /** localStorage key for persisting the theme. Default: "devkit-theme" */
  storageKey?: string;
  /** Default theme when no stored value exists. Default: "amethyst" */
  defaultTheme?: ThemeId;
}

export interface UseAppThemeReturn {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  currentTheme: ThemeDefinition;
  themes: ThemeDefinition[];
  mounted: boolean;
}

export function useAppTheme(options: UseAppThemeOptions = {}): UseAppThemeReturn {
  const { storageKey = "devkit-theme", defaultTheme = DEFAULT_THEME } = options;

  const [theme, setThemeState] = useState<ThemeId>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && THEMES.some((t) => t.id === stored)) {
      setThemeState(stored);
      applyThemeClass(stored);
    }
    setMounted(true);
  }, [storageKey]);

  const setTheme = useCallback(
    (newTheme: ThemeId) => {
      setThemeState(newTheme);
      localStorage.setItem(storageKey, newTheme);
      applyThemeClass(newTheme);
    },
    [storageKey],
  );

  const currentTheme = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return { theme, setTheme, currentTheme, themes: THEMES, mounted };
}
