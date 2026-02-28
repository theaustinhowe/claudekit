"use client";

import { useAppTheme, useSessionStream } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import { AboutCard } from "@claudekit/ui/components/about-card";
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
} from "@claudekit/ui/components/alert-dialog";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { Input } from "@claudekit/ui/components/input";
import { ProcessCleanup } from "@claudekit/ui/components/process-cleanup";
import { Progress } from "@claudekit/ui/components/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { CheckCircle2, ChevronDown, Loader2, RefreshCw, Square, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startAccountSync } from "@/lib/actions/account";
import { removeRepo, syncAllCommentsForRepo, syncPRs, syncRepo } from "@/lib/actions/github";
import type { GitHubUser } from "@/lib/types";

interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  last_synced_at: string | null;
}

interface GeneralTabProps {
  repos: Repo[];
  hasPAT: boolean;
  user: GitHubUser | null;
}

export function GeneralTab({ repos: initialRepos, hasPAT, user }: GeneralTabProps) {
  const router = useRouter();
  const { theme: colorTheme, setTheme: setColorTheme, themes } = useAppTheme({ storageKey: "inspector-theme" });
  const [repos, setRepos] = useState(initialRepos);
  const [repoInput, setRepoInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [syncStatus, setSyncStatus] = useState("");
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [syncSessionId, setSyncSessionId] = useState<string | null>(null);

  const syncStream = useSessionStream({
    sessionId: syncSessionId,
    onComplete: (event) => {
      if (event.type === "done") {
        const data = event.data as { totalSynced?: number; reposDiscovered?: number } | undefined;
        toast.success(`Synced ${data?.totalSynced ?? 0} PRs`, {
          description: `Discovered ${data?.reposDiscovered ?? 0} new repos`,
        });
        router.refresh();
      } else if (event.type === "error") {
        toast.error("Sync failed", { description: event.message ?? "Unknown error" });
      } else if (event.type === "cancelled") {
        toast.info("Sync cancelled");
      }
      setSyncSessionId(null);
    },
  });

  const isAccountSyncing = syncSessionId !== null && syncStream.status !== "done" && syncStream.status !== "error";

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

  return (
    <div className="space-y-4">
      <Card>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Connection</CardTitle>
                <div className="flex items-center gap-2">
                  {hasPAT ? (
                    <Badge variant="secondary" className="bg-status-success/15 text-status-success gap-1">
                      <CheckCircle2 className="h-3 w-3" /> PAT
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> No PAT
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {repos.length} repo{repos.length !== 1 ? "s" : ""}
                  </Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-open]_&]:rotate-180" />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {hasPAT ? (
                    <Badge variant="secondary" className="bg-status-success/15 text-status-success gap-1">
                      <CheckCircle2 className="h-3 w-3" /> PAT Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> No PAT
                    </Badge>
                  )}
                  {user && (
                    <div className="flex items-center gap-2">
                      {user.avatarUrl && (
                        // biome-ignore lint/performance/noImgElement: external avatar URL
                        <img src={user.avatarUrl} alt={user.login} className="h-6 w-6 rounded-full" />
                      )}
                      <span className="text-sm font-medium">{user.name || user.login}</span>
                    </div>
                  )}
                </div>
                {hasPAT && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const sessionId = await startAccountSync();
                        setSyncSessionId(sessionId);
                      } catch (err) {
                        toast.error("Failed to start sync", {
                          description: err instanceof Error ? err.message : "Unknown error",
                        });
                      }
                    }}
                    disabled={isPending || isAccountSyncing}
                  >
                    {isAccountSyncing ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing...
                      </>
                    ) : (
                      "Sync All Account PRs"
                    )}
                  </Button>
                )}
              </div>
              {!hasPAT && (
                <p className="text-xs text-muted-foreground">
                  Add <code className="font-mono bg-muted px-1 rounded">GITHUB_PERSONAL_ACCESS_TOKEN</code> to your{" "}
                  <code className="font-mono bg-muted px-1 rounded">.env.local</code> with{" "}
                  <code className="font-mono bg-muted px-1 rounded">repo</code> scope, then restart the dev server.
                </p>
              )}
              {isAccountSyncing && (
                <div className="space-y-2 pt-2">
                  <Progress value={syncStream.progress ?? 0} className="h-2" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {syncStream.phase ?? "Starting..."} — {syncStream.progress ?? 0}%
                    </p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={syncStream.cancel}>
                      <Square className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                  {syncStream.logs.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {syncStream.logs[syncStream.logs.length - 1].log}
                    </p>
                  )}
                </div>
              )}

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
                  <TooltipProvider>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>Remove repository</TooltipContent>
                      </Tooltip>
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
                  </TooltipProvider>
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
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
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

      <AboutCard appName="Inspector" version="0.1.0" port={2400}>
        <ProcessCleanup />
      </AboutCard>
    </div>
  );
}
