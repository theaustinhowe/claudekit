"use client";

import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Slider } from "@devkit/ui/components/slider";
import { FolderOpen, Loader2, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

interface GeneralSettingsState {
  workDirectory: string;
  maxParallelJobs: number;
}

const defaults: GeneralSettingsState = {
  workDirectory: "/tmp/agent-worktrees",
  maxParallelJobs: 3,
};

export function GeneralSettings() {
  const { data: serverSettings } = useSettings();
  const { mutate: saveSettings, isPending: isSaving } = useUpdateSettings();
  const [settings, setSettings] = useState<GeneralSettingsState>(defaults);

  useEffect(() => {
    if (serverSettings) {
      setSettings({
        workDirectory: (serverSettings.workDirectory as string) ?? defaults.workDirectory,
        maxParallelJobs: (serverSettings.maxParallelJobs as number) ?? defaults.maxParallelJobs,
      });
    }
  }, [serverSettings]);

  const hasUnsavedChanges = useMemo(() => {
    if (!serverSettings) return false;
    const savedWorkDir = (serverSettings.workDirectory as string) ?? defaults.workDirectory;
    const savedMaxJobs = (serverSettings.maxParallelJobs as number) ?? defaults.maxParallelJobs;
    return settings.workDirectory !== savedWorkDir || settings.maxParallelJobs !== savedMaxJobs;
  }, [serverSettings, settings]);

  const handleSave = () => {
    saveSettings(settings as unknown as Record<string, unknown>, {
      onSuccess: () => {
        toast.success("Settings Saved", {
          description: "General settings have been updated.",
        });
      },
      onError: (error) => {
        toast.error("Failed to save settings", { description: error.message });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <CardTitle>General Settings</CardTitle>
        </div>
        <CardDescription>Configure work directory and parallel job limits</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Work Directory */}
        <div className="space-y-2">
          <Label htmlFor="workDirectory">
            <FolderOpen className="mr-2 inline h-4 w-4" />
            Work Directory
          </Label>
          <Input
            id="workDirectory"
            placeholder="/tmp/agent-worktrees"
            value={settings.workDirectory}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                workDirectory: e.target.value,
              }))
            }
          />
          <p className="text-sm text-muted-foreground">Where git worktrees are created</p>
        </div>

        {/* Max Parallel Jobs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Max Parallel Jobs</Label>
            <span className="text-sm text-muted-foreground">
              {settings.maxParallelJobs} {settings.maxParallelJobs === 1 ? "job" : "jobs"}
            </span>
          </div>
          <Slider
            value={[settings.maxParallelJobs]}
            onValueChange={([value]) => setSettings((prev) => ({ ...prev, maxParallelJobs: value }))}
            min={1}
            max={10}
            step={1}
            className="py-2"
          />
          <p className="text-sm text-muted-foreground">Maximum agent instances across all repositories</p>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {hasUnsavedChanges && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          <Button onClick={handleSave} disabled={isSaving || !hasUnsavedChanges}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
