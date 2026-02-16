"use client";

import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import {
  CheckCircle2,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Loader2,
  Lock,
  Search,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useBrowseDirectory } from "@/hooks/use-setup";
import type { DiscoveredRepo, VerifyRepositoryResponse } from "@/lib/api";
import type { SelectedRepo } from "./setup-wizard";

interface RepositoryStepProps {
  selectedRepos: SelectedRepo[];
  existingRepoKeys: Set<string>;
  onToggleRepo: (repo: DiscoveredRepo) => void;
  onUpdateRepo: (index: number, updates: Partial<SelectedRepo>) => void;
  onRemoveRepo: (index: number) => void;
  onBack: () => void;
  onContinue: () => void;
  isVerifying: boolean;
  verificationResults: Map<string, VerifyRepositoryResponse>;
  verifyError: string | null;
  // Discovery props
  discoveryPath: string;
  onDiscoveryPathChange: (path: string) => void;
  onDiscoveryPathSelect: (path: string) => void;
  onDiscover: () => void;
  isDiscovering: boolean;
  discoveredRepos: DiscoveredRepo[];
  discoveryError: string | null;
}

function repoKey(owner: string, name: string) {
  return `${owner}/${name}`;
}

export function RepositoryStep({
  selectedRepos,
  existingRepoKeys,
  onToggleRepo,
  onUpdateRepo,
  onRemoveRepo,
  onBack,
  onContinue,
  isVerifying,
  verificationResults,
  verifyError,
  discoveryPath,
  onDiscoveryPathChange,
  onDiscoveryPathSelect,
  onDiscover,
  isDiscovering,
  discoveredRepos,
  discoveryError,
}: RepositoryStepProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("~");
  const [browseDirectories, setBrowseDirectories] = useState<string[]>([]);
  const [browseResolvedPath, setBrowseResolvedPath] = useState("");
  const [browseParent, setBrowseParent] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browseDirectory = useBrowseDirectory();

  const navigateTo = useCallback(
    (targetPath: string) => {
      setBrowseError(null);
      browseDirectory.mutate(targetPath, {
        onSuccess: (result) => {
          if (result.success && result.data) {
            setBrowseResolvedPath(result.data.path);
            setBrowseParent(result.data.parent);
            setBrowseDirectories(result.data.directories);
            setBrowsePath(result.data.path);
          } else {
            setBrowseError(result.error || "Failed to browse directory");
          }
        },
        onError: (error) => {
          setBrowseError(error.message);
        },
      });
    },
    [browseDirectory],
  );

  const handleOpenBrowse = useCallback(() => {
    setBrowseOpen(true);
    navigateTo(discoveryPath || "~");
  }, [discoveryPath, navigateTo]);

  const handleSelectDirectory = useCallback(() => {
    onDiscoveryPathSelect(browseResolvedPath);
    setBrowseOpen(false);
  }, [browseResolvedPath, onDiscoveryPathSelect]);

  // Filter to only show repos with GitHub remote
  const githubRepos = discoveredRepos.filter((repo) => repo.owner && repo.name);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-5 w-5" />
          <CardTitle>Select Repositories</CardTitle>
        </div>
        <CardDescription>Choose the GitHub repositories that the agent will work on</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discovery-path">Directory to Scan</Label>
            <div className="flex gap-2">
              <Input
                id="discovery-path"
                placeholder="~/Documents or /path/to/projects"
                value={discoveryPath}
                onChange={(e) => onDiscoveryPathChange(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleOpenBrowse} title="Browse directories">
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button onClick={onDiscover} disabled={!discoveryPath || isDiscovering}>
                {isDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Scan</span>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Scans for git repositories with GitHub remotes (max depth: 3)
            </p>
          </div>

          {/* Discovery error */}
          {discoveryError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{discoveryError}</span>
              </div>
            </div>
          )}

          {/* Discovered repos — multi-select */}
          {githubRepos.length > 0 && (
            <div className="space-y-2">
              <Label>Found Repositories ({githubRepos.length})</Label>
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border p-2">
                {[...githubRepos]
                  .sort((a, b) => {
                    const aExisting = existingRepoKeys.has(repoKey(a.owner || "", a.name || ""));
                    const bExisting = existingRepoKeys.has(repoKey(b.owner || "", b.name || ""));
                    if (aExisting === bExisting) return 0;
                    return aExisting ? 1 : -1;
                  })
                  .map((repo) => {
                    const key = repoKey(repo.owner || "", repo.name || "");
                    const isExisting = existingRepoKeys.has(key);
                    const isSelected = selectedRepos.some((r) => repoKey(r.owner, r.name) === key);
                    return (
                      <button
                        type="button"
                        key={repo.path}
                        onClick={() => !isExisting && onToggleRepo(repo)}
                        disabled={isExisting}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isExisting
                            ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                            : isSelected
                              ? "border-primary bg-primary/5 hover:bg-accent"
                              : "border-border hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {repo.owner}/{repo.name}
                          </span>
                          {isExisting ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Already added
                            </span>
                          ) : isSelected ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 truncate" title={repo.path}>
                            <FolderGit2 className="h-3 w-3" />
                            {repo.path}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {repo.currentBranch}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* No repos found message */}
          {discoveredRepos.length > 0 && githubRepos.length === 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Found {discoveredRepos.length} git repositories, but none have GitHub remotes configured.
              </p>
            </div>
          )}
        </div>

        {/* Selected repos — per-repo collapsibles */}
        {selectedRepos.length > 0 && (
          <div className="space-y-2">
            <Label>Selected Repositories ({selectedRepos.length})</Label>
            {selectedRepos.map((repo, index) => {
              const key = repoKey(repo.owner, repo.name);
              const verifyResult = verificationResults.get(key);
              const failed = verifyResult && !verifyResult.success;
              return (
                <Collapsible key={key} defaultOpen={false}>
                  <div
                    className={`rounded-lg border ${
                      failed ? "border-destructive/30 bg-destructive/5" : "border-border"
                    }`}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors group"
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[open]:rotate-90" />
                        <span className="font-medium flex-1">
                          {repo.owner}/{repo.name}
                        </span>
                        {failed && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        <div
                          role="button"
                          tabIndex={0}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveRepo(index);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              onRemoveRepo(index);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Trigger Label</Label>
                            <div className="relative">
                              <Tag className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={repo.triggerLabel}
                                onChange={(e) =>
                                  onUpdateRepo(index, {
                                    triggerLabel: e.target.value,
                                  })
                                }
                                className="h-8 pl-7 text-sm"
                                placeholder="agent"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Base Branch</Label>
                            <Input
                              value={repo.baseBranch}
                              onChange={(e) =>
                                onUpdateRepo(index, {
                                  baseBranch: e.target.value,
                                })
                              }
                              className="h-8 text-sm"
                              placeholder="main"
                            />
                          </div>
                        </div>
                        {failed && (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>{verifyResult?.error || "Verification failed"}</span>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Verify error */}
        {verifyError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">{verifyError}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onContinue} disabled={selectedRepos.length === 0 || isVerifying}>
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </CardContent>

      {/* Directory picker dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Browse Directory</DialogTitle>
            <DialogDescription>Navigate to a directory to scan for repositories</DialogDescription>
          </DialogHeader>

          {/* Current path */}
          <div className="rounded-md border bg-muted/50 px-3 py-2">
            <p className="text-sm font-mono truncate" title={browseResolvedPath}>
              {browseResolvedPath || browsePath}
            </p>
          </div>

          {browseError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{browseError}</span>
              </div>
            </div>
          )}

          {/* Directory listing */}
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {browseDirectory.isPending ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y">
                {/* Parent directory */}
                {browseResolvedPath && browseParent !== browseResolvedPath && (
                  <button
                    type="button"
                    onClick={() => navigateTo(browseParent)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">..</span>
                  </button>
                )}
                {browseDirectories.length === 0 && !browseDirectory.isPending && (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">No subdirectories</div>
                )}
                {browseDirectories.map((dir) => (
                  <button
                    type="button"
                    key={dir}
                    onClick={() => navigateTo(browseResolvedPath ? `${browseResolvedPath}/${dir}` : dir)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <Folder className="h-4 w-4 text-blue-500" />
                    <span className="flex-1 truncate">{dir}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBrowseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSelectDirectory} disabled={!browseResolvedPath}>
              Select This Directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
