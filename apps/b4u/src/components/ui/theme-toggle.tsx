"use client";

import { useAppTheme } from "@devkit/hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@devkit/ui/components/tooltip";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme: mode, setTheme: setMode } = useTheme();
  const { theme: colorTheme, setTheme: setColorTheme, themes } = useAppTheme({ legacyKeys: ["b4u-theme"] });

  return (
    <TooltipProvider delayDuration={300}>
      <Popover>
        <UITooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
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
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Theme</TooltipContent>
        </UITooltip>

        <PopoverContent side="bottom" align="end" sideOffset={8} className="w-[220px] p-3">
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
                <UITooltip key={t.id}>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t.label}</TooltipContent>
                </UITooltip>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
