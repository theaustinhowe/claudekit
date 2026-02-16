"use client";

import { Badge } from "@devkit/ui/components/badge";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DiffViewer } from "@/components/code/diff-viewer";
import { getCommitDetailAction, getCommitFilePatch } from "@/lib/actions/code-browser";
import type { CommitDetail, CommitFile, CommitFileStatus } from "@/lib/types";
import { cn } from "@devkit/ui";

interface CodeCommitDetailProps {
  repoId: string;
  sha: string;
  onFileClick?: (path: string) => void;
}

const STATUS_LABELS: Record<CommitFileStatus, { label: string; className: string }> = {
  added: { label: "A", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  modified: { label: "M", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  deleted: { label: "D", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  renamed: { label: "R", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  copied: { label: "C", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
};

export function CodeCommitDetail({ repoId, sha, onFileClick }: CodeCommitDetailProps) {
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (detail) {
      setExpanded(!expanded);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getCommitDetailAction(repoId, sha);
      if (result) {
        setDetail(result);
        setExpanded(true);
      } else {
        setError("Failed to load commit details");
      }
    } catch {
      setError("Failed to load commit details");
    } finally {
      setLoading(false);
    }
  }, [repoId, sha, detail, expanded]);

  const toggleFileDiff = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={loadDetail}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>{expanded ? "Hide" : "Show"} files</span>
      </button>

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {expanded && detail && (
        <div className="mt-2 border rounded-lg overflow-hidden">
          {/* Stats header */}
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 border-b text-xs">
            <span className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{detail.files.length} changed files</span>
            </span>
            <span className="text-green-600 dark:text-green-400">+{detail.stats.additions}</span>
            <span className="text-red-600 dark:text-red-400">-{detail.stats.deletions}</span>
          </div>

          {/* File list */}
          <div className="divide-y">
            {detail.files.map((file) => (
              <CommitFileRow
                key={file.path}
                repoId={repoId}
                sha={sha}
                file={file}
                isExpanded={expandedFiles.has(file.path)}
                onToggleDiff={() => toggleFileDiff(file.path)}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommitFileRow({
  repoId,
  sha,
  file,
  isExpanded,
  onToggleDiff,
  onFileClick,
}: {
  repoId: string;
  sha: string;
  file: CommitFile;
  isExpanded: boolean;
  onToggleDiff: () => void;
  onFileClick?: (path: string) => void;
}) {
  const statusInfo = STATUS_LABELS[file.status];
  const [loadedPatch, setLoadedPatch] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const hasPatch = file.patch || loadedPatch;

  const handleToggle = useCallback(async () => {
    // If we already have patch data, just toggle
    if (file.patch || loadedPatch) {
      onToggleDiff();
      return;
    }

    // Fetch on demand
    setPatchLoading(true);
    setPatchError(null);
    try {
      const result = await getCommitFilePatch(repoId, sha, file.path);
      if (result.patch) {
        setLoadedPatch(result.patch);
        onToggleDiff();
      } else {
        setPatchError(result.error || "No diff available");
      }
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setPatchLoading(false);
    }
  }, [repoId, sha, file.path, file.patch, loadedPatch, onToggleDiff]);

  const patch = file.patch || loadedPatch;

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors text-sm">
        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 p-0.5 hover:bg-muted rounded"
          disabled={patchLoading}
        >
          {patchLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : hasPatch && isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>

        <Badge variant="outline" className={cn("text-[10px] font-mono px-1 py-0 h-4 shrink-0", statusInfo.className)}>
          {statusInfo.label}
        </Badge>

        <button
          type="button"
          onClick={() => onFileClick?.(file.path)}
          className="font-mono text-xs truncate hover:underline text-left flex-1 min-w-0"
        >
          {file.previousPath && <span className="text-muted-foreground">{file.previousPath} &rarr; </span>}
          {file.path}
        </button>

        <div className="flex items-center gap-1 shrink-0 text-xs font-mono">
          {file.additions > 0 && <span className="text-green-600 dark:text-green-400">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>}
        </div>
      </div>

      {patchError && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-t">
          Diff unavailable: {patchError}
        </div>
      )}

      {isExpanded && patch && <DiffViewer patch={patch} />}
    </div>
  );
}
