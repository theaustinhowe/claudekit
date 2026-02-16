export interface FileTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  sha?: string;
  children?: FileTreeEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  language: string;
  isBinary: boolean;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    authorEmail?: string;
    date: string;
  };
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasChildren: boolean;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}
