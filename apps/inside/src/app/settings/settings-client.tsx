"use client";

import { useAppTheme } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@devkit/ui/components/alert-dialog";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Input } from "@devkit/ui/components/input";
import { Slider } from "@devkit/ui/components/slider";
import { Switch } from "@devkit/ui/components/switch";
import { Loader2, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeRepo, syncAllCommentsForRepo, syncPRs, syncRepo } from "@/lib/actions/github";
import { setSetting } from "@/lib/actions/settings";
import { FEEDBACK_CATEGORIES } from "@/lib/constants";

interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  last_synced_at: string | null;
}

interface SettingsClientProps {
  repos: Repo[];
  settings: Record<string, string>;
}

export function SettingsClient({ repos: initialRepos, settings }: SettingsClientProps) {
  const router = useRouter();
  const { theme: colorTheme, setTheme: setColorTheme, themes } = useAppTheme({ storageKey: "inside-theme" });
  const { theme: mode, setTheme: setMode } = useTheme();
  const [repos, setRepos] = useState(initialRepos);
  const [repoInput, setRepoInput] = useState("");
  const [minSize, setMinSize] = useState(Number(settings.min_split_size) || 400);
  const [ignoreBots, setIgnoreBots] = useState(settings.ignore_bots !== "false");
  const [temp, setTemp] = useState(Number(settings.temperature) || 0.7);
  const [selectedCats, setSelectedCats] = useState(() => {
    if (settings.feedback_categories) {
      try {
        return new Set<string>(JSON.parse(settings.feedback_categories));
      } catch {
        return new Set(FEEDBACK_CATEGORIES);
      }
    }
    return new Set(FEEDBACK_CATEGORIES);
  });
  const [isPending, startTransition] = useTransition();
  const [syncStatus, setSyncStatus] = useState("");
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);

  const handleAddRepo = () => {
    const parts = repoInput.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      toast.error("Invalid format. Use owner/repo");
      return;
    }

    const [owner, name] = parts;
    setSyncStatus("Connecting...");

    startTransition(async () => {
      try {
        const repo = await syncRepo(owner, name);
        setSyncStatus("Syncing PRs...");
        const prCount = await syncPRs(repo.id);
        setSyncStatus("Fetching comments...");
        const commentCount = await syncAllCommentsForRepo(repo.id);
        setSyncStatus("");
        setRepoInput("");
        toast.success(`Synced ${prCount} PRs with ${commentCount} comments`, {
          description: `${owner}/${name} connected`,
        });
        router.refresh();
      } catch (err) {
        setSyncStatus("");
        toast.error("Failed to connect repo", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const handleRemoveRepo = (repoId: string) => {
    startTransition(async () => {
      await removeRepo(repoId);
      setRepos((prev) => prev.filter((r) => r.id !== repoId));
      toast.success("Repository removed");
      router.refresh();
    });
  };

  const handleResync = (repoId: string) => {
    setSyncingRepoId(repoId);
    setSyncStatus("Resyncing...");
    startTransition(async () => {
      try {
        const count = await syncPRs(repoId);
        const commentCount = await syncAllCommentsForRepo(repoId);
        setSyncStatus("");
        setSyncingRepoId(null);
        toast.success(`Resynced ${count} PRs with ${commentCount} comments`);
        router.refresh();
      } catch (err) {
        setSyncStatus("");
        setSyncingRepoId(null);
        toast.error("Resync failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      setSetting("feedback_categories", JSON.stringify([...next]));
      return next;
    });
  };

  const modeOptions = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure analysis preferences and appearance</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {repos.map((repo) => (
            <div key={repo.id} className="flex items-center gap-3">
              <div className="flex-1">
                <code className="text-sm font-mono">{repo.full_name}</code>
                {repo.last_synced_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last synced: {new Date(repo.last_synced_at).toLocaleString()}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="bg-status-success/15 text-status-success shrink-0">
                Connected
              </Badge>
              <Button variant="outline" size="sm" onClick={() => handleResync(repo.id)} disabled={isPending}>
                {syncingRepoId === repo.id ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Syncing
                  </>
                ) : (
                  "Resync"
                )}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove repository?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all synced PRs, comments, skill analyses, and split plans for{" "}
                      <strong>{repo.full_name}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleRemoveRepo(repo.id)}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo"
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
            />
            <Button variant="outline" size="sm" onClick={handleAddRepo} disabled={isPending}>
              {isPending && !syncingRepoId ? "Connecting..." : "Add Repo"}
            </Button>
          </div>
          {syncStatus && <p className="text-xs text-muted-foreground">{syncStatus}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Minimum PR size for split suggestions</label>
            <div className="flex items-center gap-3">
              <Slider
                value={[minSize]}
                onValueChange={(v) => {
                  setMinSize(v[0]);
                  setSetting("min_split_size", String(v[0]));
                }}
                min={100}
                max={1000}
                step={50}
                className="flex-1"
              />
              <span className="font-mono text-sm w-16 text-right">{minSize}L</span>
            </div>
          </div>
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Feedback categories to track</label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_CATEGORIES.map((cat) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selectedCats.has(cat)} onCheckedChange={() => toggleCat(cat)} />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
              <label className="text-sm font-medium">Ignore bot comments</label>
              <p className="text-xs text-muted-foreground">Filter out automated review comments</p>
            </div>
            <Switch
              checked={ignoreBots}
              onCheckedChange={(v) => {
                setIgnoreBots(v);
                setSetting("ignore_bots", String(v));
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Temperature</label>
            <div className="flex items-center gap-3">
              <Slider
                value={[temp * 100]}
                onValueChange={(v) => {
                  const newTemp = v[0] / 100;
                  setTemp(newTemp);
                  setSetting("temperature", String(newTemp));
                }}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="font-mono text-sm w-10 text-right">{temp.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Analysis is powered by Claude via the claude-runner package. Configure the Claude CLI separately.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-3 block">Mode</label>
            <div className="flex gap-2">
              {modeOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-primary",
                    mode === opt.value ? "border-primary bg-primary/5" : "border-border",
                  )}
                  onClick={() => setMode(opt.value)}
                >
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-3 block">Theme</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {themes.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors hover:border-primary",
                    colorTheme === t.id ? "border-primary bg-primary/5" : "border-border",
                  )}
                  onClick={() => setColorTheme(t.id)}
                >
                  <div className="h-6 w-6 rounded-full" style={{ background: `hsl(${t.hue}, 70%, 50%)` }} />
                  <span className="text-[10px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
