"use client";

import { FileCode, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ChangedFile,
  fetchChangedFiles,
  fetchChangedFilesByPath,
  fetchFileDiff,
  fetchFileDiffByPath,
} from "@/lib/api";
import { DiffViewer } from "./diff-viewer";
import { FileBrowser } from "./file-browser";

interface ChangesDrawerProps {
  // Either jobId or worktreePath must be provided
  jobId?: string;
  worktreePath?: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangesDrawer({ jobId, worktreePath, title, open, onOpenChange }: ChangesDrawerProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [baseBranch, setBaseBranch] = useState<string>("main");
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Fetch changed files when drawer opens
  useEffect(() => {
    if (!open) return;
    if (!jobId && !worktreePath) return;

    setFilesLoading(true);
    setFilesError(null);
    setSelectedFile(null);

    const fetchPromise = jobId ? fetchChangedFiles(jobId) : fetchChangedFilesByPath(worktreePath ?? "");

    fetchPromise
      .then((response) => {
        if (response.error) {
          setFilesError(response.error);
        } else {
          setFiles(response.files);
          setBaseBranch(response.baseBranch);
          // Auto-select first file
          if (response.files.length > 0) {
            setSelectedFile(response.files[0].path);
          }
        }
      })
      .catch((err) => {
        setFilesError(err.message);
      })
      .finally(() => {
        setFilesLoading(false);
      });
  }, [open, jobId, worktreePath]);

  // Fetch diff when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setDiff("");
      return;
    }
    if (!jobId && !worktreePath) return;

    setDiffLoading(true);
    setDiffError(null);

    const fetchPromise = jobId
      ? fetchFileDiff(jobId, selectedFile)
      : fetchFileDiffByPath(worktreePath ?? "", selectedFile);

    fetchPromise
      .then((response) => {
        if (response.error) {
          setDiffError(response.error);
        } else {
          setDiff(response.diff);
        }
      })
      .catch((err) => {
        setDiffError(err.message);
      })
      .finally(() => {
        setDiffLoading(false);
      });
  }, [jobId, worktreePath, selectedFile]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-5xl p-0 sm:max-w-5xl">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              <span className="truncate">{title}</span>
            </SheetTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">Comparing to {baseBranch}</p>
        </SheetHeader>

        <div className="flex h-[calc(100vh-100px)]">
          {/* File browser on the left */}
          <div className="w-72 shrink-0 border-r">
            <div className="border-b px-4 py-2">
              <h3 className="text-sm font-medium">Changed Files ({files.length})</h3>
            </div>
            {filesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filesError ? (
              <div className="p-4 text-sm text-red-500">{filesError}</div>
            ) : (
              <ScrollArea className="h-[calc(100%-40px)]">
                <FileBrowser files={files} selectedPath={selectedFile} onSelectFile={setSelectedFile} />
              </ScrollArea>
            )}
          </div>

          {/* Diff viewer */}
          <div className="flex-1 overflow-hidden">
            {selectedFile && (
              <div className="border-b bg-muted/30 px-4 py-2">
                <code className="text-sm">{selectedFile}</code>
              </div>
            )}
            <ScrollArea className="h-[calc(100%-40px)]">
              {diffLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : diffError ? (
                <div className="p-4 text-sm text-red-500">{diffError}</div>
              ) : selectedFile ? (
                <DiffViewer diff={diff} filePath={selectedFile} />
              ) : !filesLoading && files.length === 0 && !filesError ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-center">
                  <FileCode className="h-8 w-8 mb-2 opacity-50" />
                  <p className="font-medium">No changes detected</p>
                  <p className="text-sm mt-1">This workspace has no file changes compared to {baseBranch}.</p>
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  Select a file to view changes
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
