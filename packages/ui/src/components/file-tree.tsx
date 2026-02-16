"use client";

import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeEntry } from "../types";
import { cn } from "../utils";
import { ScrollArea } from "./scroll-area";

interface FileTreeProps {
  rootEntries: FileTreeEntry[];
  currentPath: string;
  currentPathIsDirectory?: boolean;
  onSelect: (entry: FileTreeEntry) => void;
  fetchChildren: (dirPath: string) => Promise<FileTreeEntry[]>;
}

export function FileTree({ rootEntries, currentPath, currentPathIsDirectory, onSelect, fetchChildren }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    if (!currentPath) return new Set<string>();
    const parts = currentPath.split("/");
    const expanded = new Set<string>();
    const limit = currentPathIsDirectory ? parts.length : parts.length - 1;
    for (let i = 0; i < limit; i++) {
      expanded.add(parts.slice(0, i + 1).join("/"));
    }
    return expanded;
  });
  const [childrenCache, setChildrenCache] = useState<Map<string, FileTreeEntry[]>>(new Map());
  const prevPath = useRef("");

  // Auto-expand ancestor directories when currentPath changes
  useEffect(() => {
    if (currentPath === prevPath.current) return;
    prevPath.current = currentPath;
    if (!currentPath) return;

    const parts = currentPath.split("/");
    const ancestorPaths: string[] = [];
    const limit = currentPathIsDirectory ? parts.length : parts.length - 1;
    for (let i = 0; i < limit; i++) {
      ancestorPaths.push(parts.slice(0, i + 1).join("/"));
    }
    if (ancestorPaths.length === 0) return;

    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const p of ancestorPaths) next.add(p);
      return next;
    });

    const uncached = ancestorPaths.filter((p) => !childrenCache.has(p));
    if (uncached.length > 0) {
      Promise.all(uncached.map((p) => fetchChildren(p).then((children) => [p, children] as const))).then((results) => {
        setChildrenCache((prev) => {
          const next = new Map(prev);
          for (const [p, children] of results) next.set(p, children);
          return next;
        });
      });
    }
  }, [currentPath, currentPathIsDirectory, fetchChildren, childrenCache]);

  const toggleDir = useCallback(
    async (dirPath: string) => {
      const isExpanded = expandedDirs.has(dirPath);

      if (isExpanded) {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
        return;
      }

      setExpandedDirs((prev) => new Set(prev).add(dirPath));

      if (!childrenCache.has(dirPath)) {
        const children = await fetchChildren(dirPath);
        setChildrenCache((prev) => new Map(prev).set(dirPath, children));
      }
    },
    [fetchChildren, expandedDirs, childrenCache],
  );

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        {rootEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedDirs={expandedDirs}
            childrenCache={childrenCache}
            currentPath={currentPath}
            onToggle={toggleDir}
            onSelect={onSelect}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface TreeNodeProps {
  entry: FileTreeEntry;
  depth: number;
  expandedDirs: Set<string>;
  childrenCache: Map<string, FileTreeEntry[]>;
  currentPath: string;
  onToggle: (path: string) => void;
  onSelect: (entry: FileTreeEntry) => void;
}

function TreeNode({ entry, depth, expandedDirs, childrenCache, currentPath, onToggle, onSelect }: TreeNodeProps) {
  const isDir = entry.type === "directory";
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = entry.path === currentPath;
  const children = childrenCache.get(entry.path) || [];

  const handleClick = () => {
    if (isDir) {
      onToggle(entry.path);
    }
    onSelect(entry);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1 w-full px-2 py-1 text-sm hover:bg-muted/50 transition-colors text-left",
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className="w-4 h-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDir &&
        isExpanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            expandedDirs={expandedDirs}
            childrenCache={childrenCache}
            currentPath={currentPath}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
