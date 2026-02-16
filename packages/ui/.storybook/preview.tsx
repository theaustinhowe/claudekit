import type { Decorator, Preview } from "@storybook/react";
import { useEffect } from "react";
import "../src/storybook.css";

const THEME_IDS = [
  "amethyst",
  "sapphire",
  "emerald",
  "ruby",
  "amber",
  "slate",
  "midnight",
  "sunset",
  "forest",
] as const;

const withTheme: Decorator = (Story, context) => {
  const mode = context.globals.mode || "light";
  const theme = context.globals.theme || "amethyst";

  const themeClass = theme === "amethyst" ? "" : `theme-${theme}`;
  const modeClass = mode === "dark" ? "dark" : "";
  const className = [themeClass, modeClass, "bg-background", "text-foreground"].filter(Boolean).join(" ");

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark", ...THEME_IDS.map((t) => `theme-${t}`));
    if (modeClass) html.classList.add(modeClass);
    if (themeClass) html.classList.add(themeClass);
    return () => {
      html.classList.remove("dark", ...THEME_IDS.map((t) => `theme-${t}`));
    };
  }, [mode, theme]);

  return (
    <div className={className}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    mode: {
      description: "Light or dark mode",
      toolbar: {
        title: "Mode",
        icon: "mirror",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Color theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "amethyst", title: "Amethyst" },
          { value: "sapphire", title: "Sapphire" },
          { value: "emerald", title: "Emerald" },
          { value: "ruby", title: "Ruby" },
          { value: "amber", title: "Amber" },
          { value: "slate", title: "Slate" },
          { value: "midnight", title: "Midnight" },
          { value: "sunset", title: "Sunset" },
          { value: "forest", title: "Forest" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    mode: "light",
    theme: "amethyst",
  },
  parameters: {
    layout: "centered",
  },
};

export default preview;
