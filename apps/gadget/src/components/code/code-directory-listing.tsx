"use client";

import { cn, formatBytes } from "@claudekit/ui";
import { File, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { getLastCommitForPath } from "@/lib/actions/code-browser";
import type { CodeCommitInfo, CodeTreeEntry } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

interface CodeDirectoryListingProps {
  repoId: string;
  entries: CodeTreeEntry[];
  onNavigate: (entry: CodeTreeEntry) => void;
}

export function CodeDirectoryListing({ repoId, entries, onNavigate }: CodeDirectoryListingProps) {
  const [commitCache, setCommitCache] = useState<Map<string, CodeCommitInfo | null>>(new Map());

  // Fetch last commit for visible entries (batch)
  useEffect(() => {
    const toFetch = entries.filter((e) => !commitCache.has(e.path)).slice(0, 30);
    if (toFetch.length === 0) return;

    let cancelled = false;
    for (const entry of toFetch) {
      getLastCommitForPath(repoId, entry.path).then((commit) => {
        if (cancelled) return;
        setCommitCache((prev) => {
          const next = new Map(prev);
          next.set(entry.path, commit);
          return next;
        });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [repoId, entries, commitCache]);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Empty directory</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left font-medium text-muted-foreground px-3 py-2">Name</th>
            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Last commit</th>
            <th className="text-right font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell w-24">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const commit = commitCache.get(entry.path);
            return (
              <tr
                key={entry.path}
                className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onNavigate(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onNavigate(entry);
                }}
                tabIndex={0}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {entry.type === "directory" ? (
                      <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span
                      className={cn(
                        "truncate",
                        entry.type === "directory" ? "text-primary font-medium" : "text-foreground",
                      )}
                    >
                      {entry.name}
                    </span>
                    {entry.type === "file" && entry.size !== undefined && (
                      <span className="text-xs text-muted-foreground ml-1 shrink-0 sm:hidden">
                        {formatBytes(entry.size)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  <span className="text-muted-foreground truncate block max-w-[300px]">{commit?.message || ""}</span>
                </td>
                <td className="px-3 py-2 text-right hidden sm:table-cell">
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {commit?.date ? timeAgo(commit.date) : ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
