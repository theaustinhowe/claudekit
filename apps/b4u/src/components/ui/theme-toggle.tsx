"use client";

import { useAppTheme } from "@devkit/hooks";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme: mode, setTheme: setMode } = useTheme();
  const { theme: colorTheme, setTheme: setColorTheme, themes } = useAppTheme({ storageKey: "b4u-theme" });

  return (
    <Tooltip.Provider delayDuration={300}>
      <Popover.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {mode === "dark" ? (
                  <Moon className="w-4 h-4" />
                ) : mode === "light" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            className="bg-popover text-popover-foreground px-2 py-1 rounded-md text-xs border border-border shadow-md"
          >
            Theme
          </Tooltip.Content>
        </Tooltip.Root>

        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            className="w-[220px] bg-popover border border-border rounded-lg shadow-lg p-3 z-50"
          >
            {/* Mode section */}
            <div className="mb-3">
              <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">Mode</span>
              <div className="flex gap-1 mt-1.5">
                {(
                  [
                    { value: "light", icon: Sun, label: "Light" },
                    { value: "dark", icon: Moon, label: "Dark" },
                    { value: "system", icon: Monitor, label: "System" },
                  ] as const
                ).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mode === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color theme section */}
            <div>
              <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">Color</span>
              <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                {themes.map((t) => (
                  <Tooltip.Root key={t.id}>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        onClick={() => setColorTheme(t.id)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          colorTheme === t.id
                            ? "border-foreground scale-110"
                            : "border-transparent hover:border-muted-foreground/50 hover:scale-105"
                        }`}
                        style={{
                          background: `hsl(${t.hue}, 70%, 50%)`,
                        }}
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Content
                      side="bottom"
                      className="bg-popover text-popover-foreground px-2 py-1 rounded-md text-xs border border-border shadow-md"
                    >
                      {t.label}
                    </Tooltip.Content>
                  </Tooltip.Root>
                ))}
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Tooltip.Provider>
  );
}
