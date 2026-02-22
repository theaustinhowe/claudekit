"use client";

import { cn } from "@claudekit/ui";
import { FileCode, FileMinus, FilePlus, FileQuestion, FileText, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChangedFile } from "@/lib/api";

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  status?: ChangedFile["status"];
  children?: FileTreeNode[];
}

function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const folderMap = new Map<string, FileTreeNode>();

  // Sort files alphabetically
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split("/");
    let currentPath = "";
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isFile) {
        currentLevel.push({
          name: part,
          path: file.path,
          type: "file",
          status: file.status,
        });
      } else {
        let folder = folderMap.get(currentPath);
        if (!folder) {
          folder = {
            name: part,
            path: currentPath,
            type: "folder",
            children: [],
          };
          folderMap.set(currentPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children ?? [];
      }
    }
  }

  return root;
}

function getStatusIcon(status: ChangedFile["status"] | undefined) {
  switch (status) {
    case "added":
      return <FilePlus className="h-4 w-4 text-green-500" />;
    case "deleted":
      return <FileMinus className="h-4 w-4 text-red-500" />;
    case "modified":
      return <FileCode className="h-4 w-4 text-yellow-500" />;
    case "renamed":
    case "copied":
      return <FileText className="h-4 w-4 text-blue-500" />;
    default:
      return <FileQuestion className="h-4 w-4 text-muted-foreground" />;
  }
}

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

function FileTreeItem({ node, depth, selectedPath, onSelect, expandedFolders, onToggleFolder }: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted")}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => onToggleFolder(node.path)}
        >
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted",
        isSelected && "bg-primary/10 text-primary",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onSelect(node.path)}
    >
      {getStatusIcon(node.status)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface FileBrowserProps {
  files: ChangedFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  className?: string;
}

export function FileBrowser({ files, selectedPath, onSelectFile, className }: FileBrowserProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Expand all folders by default
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      let currentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        folders.add(currentPath);
      }
    }
    return folders;
  });

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-4 text-sm text-muted-foreground", className)}>
        No changed files
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto py-2", className)}>
      {tree.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelectFile}
          expandedFolders={expandedFolders}
          onToggleFolder={handleToggleFolder}
        />
      ))}
    </div>
  );
}
