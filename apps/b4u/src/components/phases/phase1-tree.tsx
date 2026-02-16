"use client";

import { useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase1TreeSkeleton } from "@/components/ui/phase-skeletons";
import type { FileTreeNode } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function TreeNode({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === "directory";
  const hasChildren = isDir && node.children && node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => isDir && setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left py-[2px] transition-colors group"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          color: isDir ? "hsl(var(--muted-foreground))" : "hsl(var(--muted-foreground) / 0.7)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "hsl(var(--muted))";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {isDir ? (
          <span className="text-2xs w-[12px] text-center text-muted-foreground">{expanded ? "▾" : "▸"}</span>
        ) : (
          <span className="w-[12px]" />
        )}
        <span className="text-2xs" style={{ color: isDir ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
          {isDir ? (expanded ? "📂" : "📁") : "·"}
        </span>
        <span className="text-xs truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children?.map((child) => (
            <TreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Phase1Tree() {
  const { data: fileTree, loading, error, refetch } = useApi<FileTreeNode>("/api/file-tree");

  if (loading) return <Phase1TreeSkeleton />;
  if (error || !fileTree) return <ErrorState message={error || "No file tree data"} onRetry={refetch} />;

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span className="text-primary">◊</span>
        PROJECT STRUCTURE
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <TreeNode node={fileTree} />
      </div>
      <div className="px-4 py-2 border-t border-border text-2xs text-muted-foreground">
        {countFiles(fileTree)} files · {countDirs(fileTree)} directories
      </div>
    </div>
  );
}

function countFiles(node: FileTreeNode): number {
  if (node.type === "file") return 1;
  return (node.children || []).reduce((sum, c) => sum + countFiles(c), 0);
}

function countDirs(node: FileTreeNode): number {
  if (node.type === "file") return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countDirs(c), 0);
}
