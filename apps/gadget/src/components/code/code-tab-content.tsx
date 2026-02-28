"use client";

import { Button } from "@claudekit/ui/components/button";
import { FileViewer as CodeFileViewer } from "@claudekit/ui/components/file-viewer";
import { MarkdownRenderer } from "@claudekit/ui/components/markdown-renderer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { AlertCircle, FolderGit2, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeChangesView } from "@/components/code/code-changes-view";
import { CodeCommitLog } from "@/components/code/code-commit-log";
import { CodeDirectoryListing } from "@/components/code/code-directory-listing";
import { CodeFileTree } from "@/components/code/code-file-tree";
import { CodeToolbar } from "@/components/code/code-toolbar";
import {
  getCodeFileContent,
  getCommitLog,
  getDirectoryContents,
  getGitChangedFileCount,
  getGitStatus,
  openInFinder,
} from "@/lib/actions/code-browser";
import type { CodeBranch, CodeCommitInfo, CodeFileContent, CodeTreeEntry, GitStatusResult } from "@/lib/types";

interface CodeTabContentProps {
  repoId: string;
  repoName: string;
  repoPath: string;
  branches: CodeBranch[];
  rootEntries: CodeTreeEntry[];
  readme: string | null;
}

type ViewMode = "directory" | "file" | "commits" | "changes";

export function CodeTabContent({
  repoId,
  repoName,
  repoPath,
  branches,
  rootEntries: initialRootEntries,
  readme: initialReadme,
}: CodeTabContentProps) {
  const viewModes = ["directory", "file", "commits", "changes"] as const;
  const [urlPath, setUrlPath] = useQueryState("path", parseAsString.withDefault(""));
  const [urlView, setUrlView] = useQueryState("view", parseAsStringLiteral(viewModes).withDefault("directory"));

  const [currentBranch, setCurrentBranch] = useState(
    () => branches.find((b) => b.isCurrent || b.isDefault)?.name || branches[0]?.name || "main",
  );
  const [showTree, setShowTree] = useState(true);

  // Data
  const needsInitialFetch = urlPath !== "" || urlView !== "directory";
  const [dirEntries, setDirEntries] = useState<CodeTreeEntry[]>(needsInitialFetch ? [] : initialRootEntries);
  const [fileContent, setFileContent] = useState<CodeFileContent | null>(null);
  const [commits, setCommits] = useState<CodeCommitInfo[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [readme] = useState<string | null>(initialReadme);
  const [changedFileCount, setChangedFileCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(needsInitialFetch);
  const [error, setError] = useState<string | null>(null);

  // Fetch changed file count on mount (fire-and-forget)
  useEffect(() => {
    getGitChangedFileCount(repoId)
      .then(setChangedFileCount)
      .catch(() => {});
  }, [repoId]);

  // Track what URL state we've already loaded data for
  const loadedRef = useRef<{ path: string; view: string } | null>(
    needsInitialFetch ? null : { path: "", view: "directory" },
  );

  // Push navigation state to URL
  const pushCodeUrl = useCallback(
    (codePath: string, view: ViewMode) => {
      setUrlPath(codePath || null);
      setUrlView(view === "directory" ? null : view);
    },
    [setUrlPath, setUrlView],
  );

  // Content loader ref (always has latest closure, avoids stale deps in effect)
  const loadContentRef = useRef<(codePath: string, view: ViewMode) => Promise<void>>(undefined);
  loadContentRef.current = async (codePath: string, view: ViewMode) => {
    setLoading(true);
    setError(null);
    try {
      switch (view) {
        case "directory":
          setFileContent(null);
          if (codePath === "") {
            setDirEntries(initialRootEntries);
          } else {
            setDirEntries(await getDirectoryContents(repoId, codePath));
          }
          break;
        case "file": {
          setShowTree(true);
          const content = await getCodeFileContent(repoId, codePath);
          if (content) {
            setFileContent(content);
          } else {
            setError("Failed to load file");
          }
          break;
        }
        case "commits":
          setCommits(await getCommitLog(repoId, currentBranch, 10));
          break;
        case "changes":
          setGitStatus(await getGitStatus(repoId));
          break;
      }
    } catch {
      setError("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  // Handle URL changes from back/forward navigation + initial non-default URL
  useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded && loaded.path === urlPath && loaded.view === urlView) return;
    loadedRef.current = { path: urlPath, view: urlView };
    loadContentRef.current?.(urlPath, urlView);
  }, [urlPath, urlView]);

  // Navigate to a directory
  const navigateToDir = useCallback(
    async (dirPath: string) => {
      pushCodeUrl(dirPath, "directory");
      loadedRef.current = { path: dirPath, view: "directory" };
      setLoading(true);
      setError(null);
      setFileContent(null);

      try {
        if (dirPath === "") {
          setDirEntries(initialRootEntries);
        } else {
          setDirEntries(await getDirectoryContents(repoId, dirPath));
        }
      } catch {
        setError("Failed to load directory");
        setDirEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [repoId, pushCodeUrl, initialRootEntries],
  );

  // Navigate to a file
  const navigateToFile = useCallback(
    async (filePath: string) => {
      pushCodeUrl(filePath, "file");
      loadedRef.current = { path: filePath, view: "file" };
      setLoading(true);
      setError(null);
      setShowTree(true);

      try {
        const content = await getCodeFileContent(repoId, filePath);
        if (content) {
          setFileContent(content);
        } else {
          setError("Failed to load file");
        }
      } catch {
        setError("Failed to load file");
      } finally {
        setLoading(false);
      }
    },
    [repoId, pushCodeUrl],
  );

  // Handle tree/listing navigation
  const handleNavigate = useCallback(
    (entry: CodeTreeEntry) => {
      if (entry.type === "directory") {
        navigateToDir(entry.path);
      } else {
        navigateToFile(entry.path);
      }
    },
    [navigateToDir, navigateToFile],
  );

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback(
    (path: string) => {
      navigateToDir(path);
    },
    [navigateToDir],
  );

  // Branch change
  const handleBranchChange = useCallback(
    async (branch: string) => {
      setCurrentBranch(branch);
      pushCodeUrl("", "directory");
      loadedRef.current = { path: "", view: "directory" };
      setLoading(true);
      setError(null);

      try {
        const entries = await getDirectoryContents(repoId, "");
        setDirEntries(entries);
      } catch {
        setError("Failed to load directory");
      } finally {
        setLoading(false);
      }
    },
    [repoId, pushCodeUrl],
  );

  // Toggle commits view
  const handleToggleCommits = useCallback(async () => {
    if (urlView === "commits") {
      navigateToDir(urlPath);
      return;
    }

    pushCodeUrl(urlPath, "commits");
    loadedRef.current = { path: urlPath, view: "commits" };
    setLoading(true);
    setError(null);

    try {
      const log = await getCommitLog(repoId, currentBranch, 10);
      setCommits(log);
    } catch {
      setError("Failed to load commits");
    } finally {
      setLoading(false);
    }
  }, [urlView, urlPath, repoId, currentBranch, pushCodeUrl, navigateToDir]);

  // Toggle changes view
  const handleToggleChanges = useCallback(async () => {
    if (urlView === "changes") {
      navigateToDir(urlPath);
      return;
    }

    pushCodeUrl(urlPath, "changes");
    loadedRef.current = { path: urlPath, view: "changes" };
    setLoading(true);
    setError(null);

    try {
      const status = await getGitStatus(repoId);
      setGitStatus(status);
    } catch {
      setError("Failed to load git status");
    } finally {
      setLoading(false);
    }
  }, [urlView, urlPath, repoId, pushCodeUrl, navigateToDir]);

  // File search selection
  const handleFileSelect = useCallback(
    (entry: CodeTreeEntry) => {
      handleNavigate(entry);
    },
    [handleNavigate],
  );

  // Missing local path
  if (!repoPath) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Repository path not found</h3>
        <p className="text-sm text-muted-foreground mt-1">The local path for this repository is not accessible.</p>
      </div>
    );
  }

  const hideTreeSidebar = urlView === "commits" || urlView === "changes";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <CodeToolbar
        repoId={repoId}
        repoName={repoName}
        currentPath={urlPath}
        branches={branches}
        currentBranch={currentBranch}
        showCommits={urlView === "commits"}
        showChanges={urlView === "changes"}
        changedFileCount={changedFileCount}
        onNavigate={handleBreadcrumbNavigate}
        onBranchChange={handleBranchChange}
        onToggleCommits={handleToggleCommits}
        onToggleChanges={handleToggleChanges}
        onFileSelect={handleFileSelect}
      />

      {/* Main content area */}
      <div className="flex gap-4">
        {/* File tree sidebar */}
        {showTree && !hideTreeSidebar && (
          <div className="hidden lg:block w-64 shrink-0">
            <div className="border rounded-lg h-[600px] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">Files</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowTree(false)}>
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Hide file tree</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <CodeFileTree
                repoId={repoId}
                rootEntries={initialRootEntries}
                currentPath={urlPath}
                currentPathIsDirectory={urlView === "directory"}
                onSelect={handleNavigate}
              />
            </div>
          </div>
        )}

        {/* Show tree toggle when hidden */}
        {!showTree && !hideTreeSidebar && (
          <div className="hidden lg:block">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowTree(true)}>
                    <PanelLeftOpen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show file tree</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : urlView === "changes" ? (
            <CodeChangesView
              repoId={repoId}
              initialStatus={gitStatus || { files: [], branch: "", ahead: 0, behind: 0 }}
              isLocalRepo={gitStatus !== null}
            />
          ) : urlView === "commits" ? (
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">
                Commit History
                {currentBranch && <span className="text-muted-foreground font-normal ml-2">on {currentBranch}</span>}
              </h3>
              <CodeCommitLog repoId={repoId} commits={commits} branch={currentBranch} onFileClick={navigateToFile} />
            </div>
          ) : urlView === "file" && fileContent ? (
            <CodeFileViewer
              file={fileContent}
              imageUrl={`/api/repos/${repoId}/raw?path=${encodeURIComponent(fileContent.path)}`}
              truncated={fileContent.size > 512 * 1024}
              onOpenInFinder={() => openInFinder(repoId, fileContent.path)}
            />
          ) : (
            <>
              <CodeDirectoryListing repoId={repoId} entries={dirEntries} onNavigate={handleNavigate} />

              {/* Show README at root */}
              {!urlPath && readme && (
                <div className="mt-6 border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 border-b bg-muted/50">
                    <span className="text-sm font-medium">README.md</span>
                  </div>
                  <div className="p-6">
                    <MarkdownRenderer content={readme} />
                  </div>
                </div>
              )}

              {/* Empty state */}
              {dirEntries.length === 0 && !loading && !error && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FolderGit2 className="w-10 h-10 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Empty repository</h3>
                  <p className="text-sm text-muted-foreground mt-1">No files found in this repository.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
