"use client";

import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleMinus,
  CirclePlus,
  FileIcon,
  FileQuestion,
  GitBranch,
  Loader2,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DiffViewer } from "@/components/code/diff-viewer";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Textarea } from "@devkit/ui/components/textarea";
import { commitChanges, getGitStatus, getWorkingDiff, stageFiles, unstageFiles } from "@/lib/actions/code-browser";
import type { GitFileStatus, GitStatusFile, GitStatusResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CodeChangesViewProps {
  repoId: string;
  initialStatus: GitStatusResult;
  isLocalRepo: boolean;
}

const STATUS_CONFIG: Record<GitFileStatus, { label: string; icon: typeof FileIcon; className: string }> = {
  modified: {
    label: "M",
    icon: Circle,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  },
  added: {
    label: "A",
    icon: CirclePlus,
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  },
  deleted: {
    label: "D",
    icon: CircleMinus,
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  renamed: {
    label: "R",
    icon: FileIcon,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
  untracked: {
    label: "U",
    icon: FileQuestion,
    className: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400",
  },
};

export function CodeChangesView({ repoId, initialStatus, isLocalRepo }: CodeChangesViewProps) {
  const [status, setStatus] = useState<GitStatusResult>(initialStatus);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [fileDiffs, setFileDiffs] = useState<Map<string, string>>(new Map());
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [stagingAll, setStagingAll] = useState(false);
  const [unstagingAll, setUnstagingAll] = useState(false);

  if (!isLocalRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
        <GitBranch className="w-10 h-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Local repository only</h3>
        <p className="text-sm text-muted-foreground mt-1">Changes view is only available for local repositories.</p>
      </div>
    );
  }

  const sortByPath = (a: GitStatusFile, b: GitStatusFile) => a.path.localeCompare(b.path);
  const stagedFiles = status.files.filter((f) => f.staged).sort(sortByPath);
  const unstagedFiles = status.files.filter((f) => !f.staged).sort(sortByPath);

  const refreshStatus = async () => {
    const newStatus = await getGitStatus(repoId);
    if (newStatus) {
      setStatus(newStatus);
      // Clear diffs for files that are no longer in the list
      const currentPaths = new Set(newStatus.files.map((f) => `${f.path}:${f.staged}`));
      setExpandedFiles((prev) => {
        const next = new Set<string>();
        for (const key of prev) {
          if (currentPaths.has(key)) next.add(key);
        }
        return next;
      });
    }
  };

  const fileKey = (file: GitStatusFile) => `${file.path}:${file.staged}`;

  const toggleFileDiff = async (file: GitStatusFile) => {
    const key = fileKey(file);
    if (expandedFiles.has(key)) {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    // Load diff if not cached
    if (!fileDiffs.has(key)) {
      setLoadingDiffs((prev) => new Set(prev).add(key));
      try {
        const diff = await getWorkingDiff(repoId, file.path, file.staged);
        if (diff) {
          setFileDiffs((prev) => new Map(prev).set(key, diff));
        }
      } finally {
        setLoadingDiffs((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }

    setExpandedFiles((prev) => new Set(prev).add(key));
  };

  const handleStageFile = async (path: string) => {
    const success = await stageFiles(repoId, [path]);
    if (success) await refreshStatus();
  };

  const handleUnstageFile = async (path: string) => {
    const success = await unstageFiles(repoId, [path]);
    if (success) await refreshStatus();
  };

  const handleStageAll = async () => {
    const paths = unstagedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    setStagingAll(true);
    try {
      const success = await stageFiles(repoId, paths);
      if (success) await refreshStatus();
    } finally {
      setStagingAll(false);
    }
  };

  const handleUnstageAll = async () => {
    const paths = stagedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    setUnstagingAll(true);
    try {
      const success = await unstageFiles(repoId, paths);
      if (success) await refreshStatus();
    } finally {
      setUnstagingAll(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    try {
      const result = await commitChanges(repoId, commitMessage.trim());
      if (result.success) {
        toast.success("Changes committed", {
          description: result.sha ? `Commit ${result.sha.slice(0, 7)}` : undefined,
        });
        setCommitMessage("");
        setFileDiffs(new Map());
        setExpandedFiles(new Set());
        await refreshStatus();
      } else {
        toast.error("Commit failed", { description: result.error });
      }
    } finally {
      setCommitting(false);
    }
  };

  if (status.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
        <GitBranch className="w-10 h-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No changes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Working tree is clean on <span className="font-mono">{status.branch}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {status.files.length} changed file{status.files.length !== 1 ? "s" : ""}
          </span>
          {status.ahead > 0 && (
            <Badge variant="outline" className="text-xs">
              {status.ahead} ahead
            </Badge>
          )}
          {status.behind > 0 && (
            <Badge variant="outline" className="text-xs">
              {status.behind} behind
            </Badge>
          )}
        </div>
      </div>

      {/* Staged Changes */}
      <FileSection
        title="Staged Changes"
        staged
        files={stagedFiles}
        expandedFiles={expandedFiles}
        fileDiffs={fileDiffs}
        loadingDiffs={loadingDiffs}
        fileKey={fileKey}
        onToggleDiff={toggleFileDiff}
        onToggleStaged={handleUnstageFile}
        bulkLabel="Unstage All"
        bulkLoading={unstagingAll}
        onBulkAction={handleUnstageAll}
      />

      {/* Unstaged Changes */}
      <FileSection
        title="Changes"
        staged={false}
        files={unstagedFiles}
        expandedFiles={expandedFiles}
        fileDiffs={fileDiffs}
        loadingDiffs={loadingDiffs}
        fileKey={fileKey}
        onToggleDiff={toggleFileDiff}
        onToggleStaged={handleStageFile}
        bulkLabel="Stage All"
        bulkLoading={stagingAll}
        onBulkAction={handleStageAll}
      />

      {/* Commit box */}
      <div className="border rounded-lg p-4 space-y-3">
        <Textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          className="min-h-[80px] text-sm resize-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleCommit();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} staged
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!commitMessage.trim() || stagedFiles.length === 0 || committing}
            onClick={handleCommit}
          >
            {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Commit
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileSection({
  title,
  staged,
  files,
  expandedFiles,
  fileDiffs,
  loadingDiffs,
  fileKey,
  onToggleDiff,
  onToggleStaged,
  bulkLabel,
  bulkLoading,
  onBulkAction,
}: {
  title: string;
  staged: boolean;
  files: GitStatusFile[];
  expandedFiles: Set<string>;
  fileDiffs: Map<string, string>;
  loadingDiffs: Set<string>;
  fileKey: (file: GitStatusFile) => string;
  onToggleDiff: (file: GitStatusFile) => void;
  onToggleStaged: (path: string) => void;
  bulkLabel: string;
  bulkLoading: boolean;
  onBulkAction: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (files.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 border-b">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 flex-1 text-left hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="text-xs font-medium">
            {title} ({files.length})
          </span>
        </button>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={bulkLoading} onClick={onBulkAction}>
          {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          {bulkLabel}
        </Button>
      </div>

      {!collapsed && (
        <div className="divide-y">
          {files.map((file) => {
            const key = fileKey(file);
            const isExpanded = expandedFiles.has(key);
            const diff = fileDiffs.get(key);
            const isLoadingDiff = loadingDiffs.has(key);
            const config = STATUS_CONFIG[file.status];

            return (
              <div key={key}>
                <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors text-sm">
                  <Checkbox
                    checked={staged}
                    onCheckedChange={() => onToggleStaged(file.path)}
                    className="shrink-0"
                    title={staged ? "Unstage file" : "Stage file"}
                  />

                  <button
                    type="button"
                    onClick={() => onToggleDiff(file)}
                    className="shrink-0 p-0.5 hover:bg-muted rounded"
                  >
                    {isLoadingDiff ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    ) : isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>

                  <Badge
                    variant="outline"
                    className={cn("text-[10px] font-mono px-1 py-0 h-4 shrink-0", config.className)}
                  >
                    {config.label}
                  </Badge>

                  <span className="font-mono text-xs truncate flex-1 min-w-0">{file.path}</span>
                </div>

                {isExpanded && diff && <DiffViewer patch={diff} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
