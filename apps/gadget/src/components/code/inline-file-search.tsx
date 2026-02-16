"use client";

import { cn } from "@devkit/ui";
import { Input } from "@devkit/ui/components/input";
import { File, Folder, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getFileTree } from "@/lib/actions/code-browser";
import { fuzzyMatch } from "@/lib/fuzzy-match";
import type { CodeTreeEntry } from "@/lib/types";

interface InlineFileSearchProps {
  repoId: string;
  onFileSelect: (entry: CodeTreeEntry) => void;
}

// Module-level cache for file trees per repo
const fileTreeCache = new Map<string, CodeTreeEntry[]>();

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indexSet = new Set(indices);
  return (
    <span>
      {text.split("").map((char, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: character positions are stable
        <span key={i} className={cn(indexSet.has(i) && "text-primary font-semibold")}>
          {char}
        </span>
      ))}
    </span>
  );
}

export function InlineFileSearch({ repoId, onFileSelect }: InlineFileSearchProps) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<CodeTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load file tree lazily on first focus
  const loadFiles = useCallback(async () => {
    const cached = fileTreeCache.get(repoId);
    if (cached) {
      setAllFiles(cached);
      return;
    }

    setLoading(true);
    try {
      const tree = await getFileTree(repoId);
      fileTreeCache.set(repoId, tree);
      setAllFiles(tree);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  const handleFocus = useCallback(() => {
    setOpen(true);
    if (allFiles.length === 0 && !loading) {
      loadFiles();
    }
  }, [allFiles.length, loading, loadFiles]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Filter and score
  const results =
    query.length > 0
      ? allFiles
          .map((file) => {
            const result = fuzzyMatch(query, file.path);
            return { file, ...result };
          })
          .filter((r) => r.matches)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
      : [];

  // Reset selection on query change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const list = dropdownRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const selectResult = useCallback(
    (entry: CodeTreeEntry) => {
      onFileSelect(entry);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [onFileSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        selectResult(results[selectedIndex].file);
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, selectedIndex, selectResult],
  );

  const showDropdown = open && query.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Go to file..."
          className="h-8 w-[160px] focus:w-[260px] transition-all duration-200 pl-7 pr-8 text-xs"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-[360px] max-h-[300px] overflow-y-auto bg-popover border rounded-lg shadow-lg z-50">
          <div ref={dropdownRef} className="py-1">
            {loading && <p className="text-xs text-muted-foreground text-center py-3">Loading files...</p>}
            {!loading && results.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No files found</p>
            )}
            {results.map((result, idx) => (
              <button
                key={result.file.path}
                type="button"
                onClick={() => selectResult(result.file)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors",
                  idx === selectedIndex && "bg-muted",
                )}
              >
                {result.file.type === "directory" ? (
                  <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                ) : (
                  <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate font-mono text-xs">
                  <HighlightedText text={result.file.path} indices={result.indices} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
