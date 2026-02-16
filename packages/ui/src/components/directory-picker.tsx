"use client";

import { Eye, EyeOff, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowseResult, DirectoryEntry } from "../types";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { ScrollArea } from "./scroll-area";
import { Skeleton } from "./skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface DirectoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  browse: (path: string, showHidden: boolean) => Promise<BrowseResult>;
  placeholder?: string;
  className?: string;
}

export function DirectoryPicker({
  value,
  onChange,
  browse: browseFn,
  placeholder = "~/path/to/directory",
  className,
}: DirectoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (browsePath !== null) setPathInput(browsePath);
  }, [browsePath]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const browse = useCallback(
    async (dirPath: string, hidden: boolean, isRetry = false) => {
      setLoading(true);
      setError(null);
      try {
        const data = await browseFn(dirPath, hidden);
        setBrowsePath(data.currentPath);
        setParentPath(data.parentPath);
        setEntries(data.entries);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isRetry && message.includes("Cannot read directory")) {
          return browse("~", hidden, true);
        }
        setError(message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [browseFn],
  );

  const handleOpen = () => {
    setOpen(true);
    const startPath = value.trim() || "~";
    browse(startPath, showHidden);
  };

  const handleSelect = () => {
    if (browsePath) {
      onChange(browsePath);
    }
    setOpen(false);
  };

  const handleToggleHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    if (browsePath) {
      browse(browsePath, next);
    }
  };

  const handlePathInputChange = useCallback(
    (value: string) => {
      setPathInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const trimmed = value.trim();
        if (trimmed) browse(trimmed, showHidden);
      }, 600);
    },
    [browse, showHidden],
  );

  return (
    <>
      <div className={`flex items-center gap-2 ${className || ""}`}>
        <Input
          value={value}
          readOnly
          onClick={handleOpen}
          placeholder={placeholder}
          className="font-mono cursor-pointer"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" onClick={handleOpen}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Browse</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Directory</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <Input
                  value={pathInput}
                  onChange={(e) => handlePathInputChange(e.target.value)}
                  disabled={loading}
                  className="flex-1 font-mono text-sm h-9"
                  placeholder="/path/to/directory"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleToggleHidden} className="shrink-0">
                      {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showHidden ? "Hide hidden files" : "Show hidden files"}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            <ScrollArea className="h-[300px] rounded-md border p-2">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static placeholder skeletons never reorder
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-sm text-destructive">{error}</div>
              ) : (
                <div className="space-y-0.5">
                  {parentPath && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => browse(parentPath, showHidden)}
                    >
                      <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>..</span>
                    </button>
                  )}
                  {entries.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No subdirectories found
                    </div>
                  ) : (
                    entries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
                        onClick={() => browse(entry.path, showHidden)}
                      >
                        <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
                        <span className="truncate">{entry.name}</span>
                        {entry.hasChildren && (
                          <span className="text-muted-foreground text-xs ml-auto shrink-0">&rsaquo;</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </ScrollArea>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={!browsePath}>
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
