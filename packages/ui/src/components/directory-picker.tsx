"use client";

import { ChevronUp, Eye, EyeOff, FolderOpen } from "lucide-react";
import { useCallback, useState } from "react";
import type { BrowseResult, DirectoryEntry } from "../types";
import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
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

  const breadcrumbs = browsePath
    ? browsePath
        .split("/")
        .filter(Boolean)
        .map((segment, i, arr) => ({
          name: segment,
          path: `/${arr.slice(0, i + 1).join("/")}`,
        }))
    : [];

  return (
    <>
      <div className={`flex items-center gap-2 ${className || ""}`}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-mono"
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

          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!parentPath || loading}
                    onClick={() => parentPath && browse(parentPath, showHidden)}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Up</TooltipContent>
              </Tooltip>
              <div className="flex-1 min-w-0 overflow-x-auto">
                <div className="flex items-center gap-0.5 text-sm font-mono whitespace-nowrap">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.path} className="flex items-center">
                      {i > 0 && <span className="text-muted-foreground mx-0.5">/</span>}
                      <button
                        type="button"
                        className="hover:text-primary hover:underline text-muted-foreground transition-colors"
                        onClick={() => browse(crumb.path, showHidden)}
                        disabled={loading}
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleToggleHidden}>
                    {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showHidden ? "Hide hidden" : "Show hidden"}</TooltipContent>
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
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No subdirectories found
              </div>
            ) : (
              <div className="space-y-0.5">
                {entries.map((entry) => (
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
                ))}
              </div>
            )}
          </ScrollArea>

          {browsePath && <div className="text-xs font-mono text-muted-foreground truncate px-1">{browsePath}</div>}

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
