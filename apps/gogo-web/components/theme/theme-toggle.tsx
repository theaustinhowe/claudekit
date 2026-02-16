"use client";

import { THEMES, useAppTheme } from "@devkit/hooks";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@devkit/ui/components/button";
import { Label } from "@devkit/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { cn } from "@devkit/ui";

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ showLabel = false, className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { theme: appTheme, setTheme: setAppTheme, mounted: themeMounted } = useAppTheme({ legacyKeys: ["gogo-theme"] });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled className={cn("h-9 w-9", className)}>
        <Sun className="h-4 w-4" />
        <span className="sr-only">Display settings</span>
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <Popover>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size={showLabel ? "sm" : "icon"}
                className={cn(showLabel ? "gap-2" : "h-9 w-9", className)}
              >
                <Monitor className="h-4 w-4" />
                {showLabel && <span>{theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}</span>}
                <span className="sr-only">Display settings</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Display Settings</TooltipContent>
          <PopoverContent align="end" className="w-80 p-3">
            <div className="space-y-3">
              {/* Mode */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <div className="flex gap-1">
                  <Button
                    variant={mounted && theme === "light" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setTheme("light")}
                  >
                    <Sun className="w-3.5 h-3.5 mr-1.5" />
                    Light
                  </Button>
                  <Button
                    variant={mounted && theme === "dark" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setTheme("dark")}
                  >
                    <Moon className="w-3.5 h-3.5 mr-1.5" />
                    Dark
                  </Button>
                  <Button
                    variant={mounted && theme === "system" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setTheme("system")}
                  >
                    <Monitor className="w-3.5 h-3.5 mr-1.5" />
                    System
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* Theme */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Theme</Label>
                <div className="flex flex-wrap gap-2 justify-center">
                  <TooltipProvider>
                    {THEMES.map((t) => (
                      <Tooltip key={t.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setAppTheme(t.id)}
                            className={cn(
                              "w-6 h-6 rounded-full transition-all",
                              themeMounted && appTheme === t.id
                                ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                                : "hover:scale-110",
                            )}
                            style={{
                              backgroundColor: `hsl(${t.hue}, 70%, 50%)`,
                            }}
                            aria-label={t.label}
                          />
                        </TooltipTrigger>
                        <TooltipContent>{t.label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </Tooltip>
    </TooltipProvider>
  );
}
