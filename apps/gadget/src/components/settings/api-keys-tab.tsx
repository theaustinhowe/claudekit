"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Check, ExternalLink, Eye, EyeOff, HelpCircle, Key, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { writeEnvKey } from "@/lib/actions/env-keys";

const KEY_HELP: Record<string, { title: string; steps: string[]; url: string; urlLabel: string }> = {
  GITHUB_PERSONAL_ACCESS_TOKEN: {
    title: "Create a GitHub Personal Access Token",
    steps: [
      'Give the token a descriptive name (e.g. "Devkit")',
      "Set an expiration (90 days recommended)",
      "The repo and workflow scopes will be pre-selected via the link below",
      'Click "Generate token" and copy the value',
    ],
    url: "https://github.com/settings/tokens/new?scopes=repo,workflow",
    urlLabel: "Create Token on GitHub",
  },
};

export interface ServerKeyGroup {
  name: string;
  description: string;
  keys: string[];
  tags: string[];
}

interface ApiKeysTabProps {
  envKeys: Record<string, string>;
  serverKeys: ServerKeyGroup[];
}

export function ApiKeysTab({ envKeys: initialEnvKeys, serverKeys }: ApiKeysTabProps) {
  const [envKeys, setEnvKeys] = useState(initialEnvKeys);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const allKeys = serverKeys.flatMap((s) => s.keys);
  const configuredCount = allKeys.filter((k) => envKeys[k]?.length > 0).length;

  const toggleVisible = useCallback((key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = useCallback(
    async (key: string) => {
      const value = editValues[key] ?? envKeys[key] ?? "";
      setSavingKey(key);
      try {
        const result = await writeEnvKey(key, value);
        if (result.success) {
          setEnvKeys((prev) => ({ ...prev, [key]: value }));
          setEditValues((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Failed to save key");
      } finally {
        setSavingKey(null);
      }
    },
    [editValues, envKeys],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            {configuredCount} of {allKeys.length} keys configured &middot; Stored in{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code>
          </CardDescription>
        </CardHeader>
      </Card>

      {serverKeys.map((server) => {
        const serverConfigured = server.keys.every((k) => envKeys[k]?.length > 0);
        return (
          <Card key={server.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{server.name}</CardTitle>
                  {serverConfigured ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  )}
                </div>
                <div className="flex gap-1">
                  {server.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <CardDescription className="text-xs">{server.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {server.keys.map((key) => {
                const currentValue = editValues[key] ?? envKeys[key] ?? "";
                const savedValue = envKeys[key] ?? "";
                const isDirty = (editValues[key] ?? undefined) !== undefined && editValues[key] !== savedValue;
                const isVisible = visibleKeys.has(key);
                const isSaving = savingKey === key;
                const isConfigured = savedValue.length > 0;

                const help = KEY_HELP[key];

                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label
                        className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"
                        htmlFor={key}
                      >
                        {isConfigured && <Check className="w-3 h-3 text-green-500" />}
                        {key}
                      </label>
                      {help && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>{help.title}</DialogTitle>
                              <DialogDescription>Follow these steps to create your token</DialogDescription>
                            </DialogHeader>
                            <ol className="space-y-2 text-sm list-decimal list-inside">
                              {help.steps.map((step) => (
                                <li key={step} className="text-muted-foreground leading-relaxed">
                                  {step}
                                </li>
                              ))}
                            </ol>
                            <div className="pt-2">
                              <Button asChild variant="default" className="w-full">
                                <a href={help.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4 mr-2" />
                                  {help.urlLabel}
                                </a>
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id={key}
                          type={isVisible ? "text" : "password"}
                          value={currentValue}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder="Enter API key..."
                          className="pr-9 font-mono text-sm"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full w-9"
                                onClick={() => toggleVisible(key)}
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isVisible ? "Hide" : "Show"}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant={isDirty ? "default" : "outline"}
                              disabled={!isDirty || isSaving}
                              onClick={() => handleSave(key)}
                            >
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Save</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground text-center">
        Keys are stored locally in <code className="bg-muted px-1 py-0.5 rounded">.env.local</code>. Restart the dev
        server after changes for Next.js to pick them up.{" "}
        <Link href="/ai-integrations" className="text-primary hover:underline">
          View AI Integrations
        </Link>
      </p>
    </div>
  );
}
