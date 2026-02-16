"use client";

import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Eye, EyeOff, Github, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

export function GitHubSettings() {
  const { data: serverSettings } = useSettings();
  const { mutate: saveSettings, isPending: isSaving } = useUpdateSettings();
  const [personalAccessToken, setPersonalAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (serverSettings) {
      setPersonalAccessToken((serverSettings.personalAccessToken as string) ?? "");
    }
  }, [serverSettings]);

  const handleSave = () => {
    saveSettings({ personalAccessToken } as Record<string, unknown>, {
      onSuccess: () => {
        toast.success("Settings Saved", {
          description: "GitHub token has been updated.",
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
          <Github className="h-5 w-5" />
          <CardTitle>GitHub Integration</CardTitle>
        </div>
        <CardDescription>Configure your GitHub personal access token for repository access</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* GitHub Token */}
        <div className="space-y-2">
          <Label htmlFor="personalAccessToken">Personal Access Token</Label>
          <div className="relative">
            <Input
              id="personalAccessToken"
              type={showToken ? "text" : "password"}
              placeholder="ghp_xxxxxxxxxxxx"
              className="pr-10"
              value={personalAccessToken}
              onChange={(e) => setPersonalAccessToken(e.target.value)}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showToken ? "Hide token" : "Show token"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-muted-foreground">
            Used to access all connected repositories. Requires{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">repo</code> scope.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save Token"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
