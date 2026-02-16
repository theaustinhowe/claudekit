"use client";

import { THEMES, useAppTheme } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import { Label } from "@devkit/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@devkit/ui";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const {
    theme: appTheme,
    setTheme: setAppTheme,
    mounted: themeMounted,
  } = useAppTheme({ legacyKeys: ["workbench-theme", "workbench-color-scheme"] });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Monitor className="h-4 w-4" />
                <span className="sr-only">Display settings</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Display settings</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-3">
          {/* Mode */}
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
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
                        style={{ backgroundColor: `hsl(${t.hue}, 70%, 50%)` }}
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
  );
}
