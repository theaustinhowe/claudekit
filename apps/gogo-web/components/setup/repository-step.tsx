"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import {
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Loader2,
  Lock,
  Search,
  Tag,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
  onRemoveRepo: _onRemoveRepo,
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
  const githubRepos = useMemo(
    () =>
      discoveredRepos
        .filter((repo) => repo.owner && repo.name)
        .sort((a, b) => {
          const aExisting = existingRepoKeys.has(repoKey(a.owner || "", a.name || ""));
          const bExisting = existingRepoKeys.has(repoKey(b.owner || "", b.name || ""));
          if (aExisting === bExisting) return 0;
          return aExisting ? 1 : -1;
        }),
    [discoveredRepos, existingRepoKeys],
  );

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

          {/* Discovered repos — popover multi-select with inline config */}
          {githubRepos.length > 0 && (
            <div className="space-y-2">
              <Label>Found Repositories</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent transition-colors"
                  >
                    <span>
                      {selectedRepos.length > 0
                        ? `${selectedRepos.length} of ${githubRepos.length} repositories selected`
                        : `${githubRepos.length} repositories found`}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="max-h-80 overflow-y-auto p-1"
                  style={{ width: "var(--anchor-width)" }}
                  side="bottom"
                  align="start"
                >
                  {githubRepos.map((repo) => {
                    const key = repoKey(repo.owner || "", repo.name || "");
                    const isExisting = existingRepoKeys.has(key);
                    const selectedIndex = selectedRepos.findIndex((r) => repoKey(r.owner, r.name) === key);
                    const isSelected = selectedIndex !== -1;
                    const selectedRepo = isSelected ? selectedRepos[selectedIndex] : null;
                    const verifyResult = isSelected ? verificationResults.get(key) : null;
                    const failed = verifyResult && !verifyResult.success;
                    return (
                      <div key={repo.path} className={cn("rounded-md transition-colors", isSelected && "bg-primary/5")}>
                        <button
                          type="button"
                          onClick={() => !isExisting && onToggleRepo(repo)}
                          disabled={isExisting}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            isExisting
                              ? "opacity-50 cursor-not-allowed"
                              : isSelected
                                ? "text-primary"
                                : "hover:bg-accent",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate font-medium">
                              {repo.owner}/{repo.name}
                            </span>
                            <span
                              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                              title={repo.path}
                            >
                              <GitBranch className="h-3 w-3" />
                              {repo.currentBranch}
                            </span>
                          </span>
                          {isExisting ? (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : isSelected ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </button>
                        {isSelected && selectedRepo && (
                          <div className="px-2 pb-2 pt-0.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <div className="relative">
                                <Tag className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  value={selectedRepo.triggerLabel}
                                  onChange={(e) =>
                                    onUpdateRepo(selectedIndex, {
                                      triggerLabel: e.target.value,
                                    })
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-7 pl-6 text-xs"
                                  placeholder="Trigger label"
                                />
                              </div>
                              <Input
                                value={selectedRepo.baseBranch}
                                onChange={(e) =>
                                  onUpdateRepo(selectedIndex, {
                                    baseBranch: e.target.value,
                                  })
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 text-xs"
                                placeholder="Base branch"
                              />
                            </div>
                            {failed && (
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                                <XCircle className="h-3 w-3" />
                                <span>{verifyResult?.error || "Verification failed"}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </PopoverContent>
              </Popover>
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

          <DialogBody>
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
          </DialogBody>

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
