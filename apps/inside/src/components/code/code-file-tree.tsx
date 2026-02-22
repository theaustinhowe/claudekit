"use client";

import type { FileTreeEntry } from "@claudekit/ui";
import { FileTree } from "@claudekit/ui/components/file-tree";

interface CodeFileTreeProps {
  rootEntries: FileTreeEntry[];
  currentPath: string;
  currentPathIsDirectory?: boolean;
  onSelect: (entry: FileTreeEntry) => void;
  fetchChildren?: (dirPath: string) => Promise<FileTreeEntry[]>;
}

export function CodeFileTree({
  rootEntries,
  currentPath,
  currentPathIsDirectory,
  onSelect,
  fetchChildren,
}: CodeFileTreeProps) {
  return (
    <FileTree
      rootEntries={rootEntries}
      currentPath={currentPath}
      currentPathIsDirectory={currentPathIsDirectory}
      onSelect={onSelect}
      fetchChildren={fetchChildren ?? (() => Promise.resolve([]))}
    />
  );
}
