"use client";

import { THEMES, useAppTheme } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Label } from "@claudekit/ui/components/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { FolderOpen, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/directory-picker";
import { setSetting } from "@/lib/actions/settings";

interface SettingsClientProps {
  defaultProjectPath: string;
}

export function SettingsClient({ defaultProjectPath: initialPath }: SettingsClientProps) {
  const { theme, setTheme } = useTheme();
  const { theme: appTheme, setTheme: setAppTheme, mounted: themeMounted } = useAppTheme({ storageKey: "inside-theme" });
  const [mounted, setMounted] = useState(false);
  const [projectPath, setProjectPath] = useState(initialPath);

  useEffect(() => setMounted(true), []);

  const handlePathChange = async (value: string) => {
    setProjectPath(value);
    try {
      await setSetting("default_project_path", value);
      toast.success("Default project path saved");
    } catch {
      toast.error("Failed to save project path");
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sun className="w-5 h-5" />
            Appearance
          </CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <Label>Theme</Label>
              <p className="text-sm text-muted-foreground">Choose light or dark mode</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={mounted && theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
              >
                <Sun className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Light</span>
              </Button>
              <Button
                variant={mounted && theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
              >
                <Moon className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Dark</span>
              </Button>
              <Button
                variant={mounted && theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
              >
                <Monitor className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">System</span>
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <Label>Accent Color</Label>
                <p className="text-sm text-muted-foreground">Set the accent color</p>
              </div>
              <div className="flex gap-2">
                <TooltipProvider>
                  {THEMES.map((t) => (
                    <Tooltip key={t.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setAppTheme(t.id)}
                          className={cn(
                            "w-8 h-8 rounded-full transition-all",
                            themeMounted && appTheme === t.id
                              ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                              : "hover:scale-110",
                          )}
                          style={{ backgroundColor: `hsl(${t.hue}, 70%, 50%)` }}
                          aria-label={t.label}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{t.label}</p>
                        <p className="text-xs opacity-80">{t.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Project Defaults
          </CardTitle>
          <CardDescription>Default settings for new projects</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Default Project Path</Label>
            <p className="text-sm text-muted-foreground">Base directory for new projects</p>
            <DirectoryPicker
              value={projectPath}
              onChange={handlePathChange}
              placeholder="~/Projects"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
