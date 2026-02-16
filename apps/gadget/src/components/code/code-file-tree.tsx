"use client";

import type { FileTreeEntry } from "@devkit/ui";
import { FileTree } from "@devkit/ui/components/file-tree";
import { useCallback } from "react";
import { getDirectoryContents } from "@/lib/actions/code-browser";

interface CodeFileTreeProps {
  rootEntries: FileTreeEntry[];
  currentPath: string;
  currentPathIsDirectory?: boolean;
  onSelect: (entry: FileTreeEntry) => void;
  fetchChildren?: (dirPath: string) => Promise<FileTreeEntry[]>;
  repoId?: string;
}

export function CodeFileTree({
  repoId,
  rootEntries,
  currentPath,
  currentPathIsDirectory,
  onSelect,
  fetchChildren,
}: CodeFileTreeProps) {
  const loadChildren = useCallback(
    (dirPath: string) => {
      if (fetchChildren) return fetchChildren(dirPath);
      if (!repoId) return Promise.resolve([]);
      return getDirectoryContents(repoId, dirPath);
    },
    [fetchChildren, repoId],
  );

  return (
    <FileTree
      rootEntries={rootEntries}
      currentPath={currentPath}
      currentPathIsDirectory={currentPathIsDirectory}
      onSelect={onSelect}
      fetchChildren={loadChildren}
    />
  );
}
