"use client";

import { Button } from "@claudekit/ui/components/button";
import { FileViewer as CodeFileViewer } from "@claudekit/ui/components/file-viewer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeFileTree } from "@/components/code/code-file-tree";
import { openFolderInFinder } from "@/lib/actions/code-browser";
import { getProjectFileContent, getProjectTree } from "@/lib/actions/prototype-files";
import type { CodeFileContent, CodeTreeEntry } from "@/lib/types";

interface SpecFilesTabProps {
  projectId: string;
  projectPath: string;
  projectName: string;
}

export function SpecFilesTab({ projectId, projectPath, projectName }: SpecFilesTabProps) {
  const [rootEntries, setRootEntries] = useState<CodeTreeEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<CodeFileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);

  // Load root entries on mount
  useEffect(() => {
    setTreeLoading(true);
    getProjectTree(projectPath, projectName)
      .then(setRootEntries)
      .finally(() => setTreeLoading(false));
  }, [projectPath, projectName]);

  const selectFile = useCallback(
    async (filePath: string) => {
      setSelectedPath(filePath);
      setLoading(true);
      setFileContent(null);
      try {
        const result = await getProjectFileContent(projectPath, projectName, filePath);
        setFileContent(result);
      } finally {
        setLoading(false);
      }
    },
    [projectPath, projectName],
  );

  const fetchChildren = useCallback(
    (dirPath: string) => getProjectTree(projectPath, projectName, dirPath),
    [projectPath, projectName],
  );

  if (treeLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <p className="text-sm">Loading files...</p>
      </div>
    );
  }

  if (rootEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No project files yet. Scaffold a project to see files here.
      </p>
    );
  }

  return (
    <div className="flex gap-3 h-full">
      {/* Tree sidebar */}
      <div className="w-56 shrink-0 border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
          <span className="text-xs font-medium text-muted-foreground">Files</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={async () => {
                    const root = `${projectPath}/${projectName}`;
                    const target = selectedPath ? `${root}/${selectedPath}` : root;
                    const ok = await openFolderInFinder(target);
                    if (!ok) toast.error("Could not open in Finder");
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in Finder</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="h-[calc(100%-33px)]">
          <CodeFileTree
            rootEntries={rootEntries}
            currentPath={selectedPath ?? ""}
            onSelect={(entry) => {
              if (entry.type === "file") selectFile(entry.path);
            }}
            fetchChildren={fetchChildren}
          />
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-full border rounded-lg text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <p className="text-sm">Loading...</p>
          </div>
        ) : fileContent ? (
          <CodeFileViewer
            file={fileContent}
            imageUrl={`/api/projects/${projectId}/raw?path=${encodeURIComponent(fileContent.path)}`}
            onOpenInFinder={() => openFolderInFinder(`${projectPath}/${projectName}/${fileContent.path}`)}
          />
        ) : (
          <div className="flex items-center justify-center h-full border rounded-lg text-muted-foreground">
            <p className="text-sm">Select a file to view its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
