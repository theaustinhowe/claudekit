"use client";

import { Button } from "@devkit/ui/components/button";
import { GitCommit, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { CodeCommitDetail } from "@/components/code/code-commit-detail";
import { getCommitLog } from "@/lib/actions/code-browser";
import type { CodeCommitInfo } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

interface CodeCommitLogProps {
  repoId: string;
  commits: CodeCommitInfo[];
  branch?: string;
  filePath?: string;
  onFileClick?: (path: string) => void;
}

export function CodeCommitLog({ repoId, commits: initialCommits, branch, filePath, onFileClick }: CodeCommitLogProps) {
  const [commits, setCommits] = useState(initialCommits);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCommits.length >= 10);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      // Get commits beyond what we already have
      const allCommits = await getCommitLog(repoId, branch, commits.length + 10, filePath);
      const newCommits = allCommits.slice(commits.length);
      if (newCommits.length === 0) {
        setHasMore(false);
      } else {
        setCommits((prev) => [...prev, ...newCommits]);
        setHasMore(newCommits.length >= 10);
      }
    } finally {
      setLoading(false);
    }
  }, [repoId, branch, filePath, commits.length]);

  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No commits found</p>;
  }

  return (
    <div className="space-y-1">
      {commits.map((commit, idx) => (
        <div key={`${commit.sha}-${idx}`} className="px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-3">
            <GitCommit className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{commit.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium">{commit.author}</span>
                <span className="mx-1">&middot;</span>
                <span>{timeAgo(commit.date)}</span>
              </p>
              <div className="mt-1.5">
                <CodeCommitDetail repoId={repoId} sha={commit.sha} onFileClick={onFileClick} />
              </div>
            </div>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {commit.sha.slice(0, 7)}
            </code>
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="text-center pt-2">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
