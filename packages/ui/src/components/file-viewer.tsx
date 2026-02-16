"use client";

import { Check, Code2, Copy, ExternalLink, Eye, FileWarning, ImageIcon, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { FileContent } from "../types";
import { cn, formatBytes, IMAGE_EXTENSIONS } from "../utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { MarkdownRenderer } from "./markdown-renderer";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SyntaxHighlighter } from "./syntax-highlighter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface FileViewerProps {
  file: FileContent;
  imageUrl?: string;
  truncated?: boolean;
  onShowFull?: () => void;
  onOpenInFinder?: () => void;
}

type ViewMode = "code" | "preview";

const PREVIEWABLE_LANGUAGES = new Set(["markdown", "mdx", "json", "jsonc", "json5"]);

function isJsonLanguage(lang: string): boolean {
  return lang === "json" || lang === "jsonc" || lang === "json5";
}

export function FileViewer({ file, imageUrl, truncated, onShowFull, onOpenInFinder }: FileViewerProps) {
  const [copied, setCopied] = useState(false);
  const hasPreview = PREVIEWABLE_LANGUAGES.has(file.language);
  const [viewMode, setViewMode] = useState<ViewMode>(hasPreview ? "preview" : "code");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (file.isBinary) {
    const isImage = IMAGE_EXTENSIONS.has(file.path.slice(file.path.lastIndexOf(".")).toLowerCase());
    const resolvedImageUrl = isImage ? imageUrl : undefined;

    return (
      <div className="border rounded-lg @container">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 gap-2">
          <TooltipProvider>
            <div className="flex items-center gap-1.5 min-w-0">
              {isImage ? (
                <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <FileWarning className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate max-w-[200px] @[500px]:max-w-[300px]">
                {file.path.split("/").pop()}
              </span>
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 @[600px]:hidden">
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>File info</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-auto px-3 py-2 text-xs">{formatBytes(file.size)}</PopoverContent>
              </Popover>
              <Badge variant="outline" className="text-xs shrink-0 hidden @[600px]:inline-flex">
                {formatBytes(file.size)}
              </Badge>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {onOpenInFinder && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenInFinder}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in Finder</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
        {resolvedImageUrl ? (
          <div className="flex items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
            <img
              src={resolvedImageUrl}
              alt={file.path.split("/").pop() || "Image"}
              className="max-w-full max-h-[70vh] object-contain rounded"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Binary file not shown</p>
          </div>
        )}
      </div>
    );
  }

  const lineCount = file.content.split("\n").length;

  return (
    <div className="border rounded-lg overflow-hidden @container">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 gap-2">
        <TooltipProvider>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate max-w-[200px] @[500px]:max-w-[300px]">
              {file.path.split("/").pop()}
            </span>
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 @[600px]:hidden">
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>File info</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-auto px-3 py-2 text-xs leading-relaxed">
                <span className="text-muted-foreground">Type:</span> {file.language}
                <br />
                <span className="text-muted-foreground">Size:</span> {formatBytes(file.size)}
                <br />
                <span className="text-muted-foreground">Lines:</span> {lineCount}
              </PopoverContent>
            </Popover>
            <Badge variant="outline" className="text-xs shrink-0 hidden @[600px]:inline-flex">
              {file.language}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0 hidden @[600px]:inline">
              {formatBytes(file.size)}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 hidden @[750px]:inline">{lineCount} lines</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {hasPreview && (
              <div className="flex items-center border rounded-md overflow-hidden mr-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                    viewMode === "preview"
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("code")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                    viewMode === "code" ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  <Code2 className="w-3 h-3" />
                  Code
                </button>
              </div>
            )}
            {onOpenInFinder && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenInFinder}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in Finder</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        {viewMode === "preview" && hasPreview ? (
          <PreviewContent file={file} />
        ) : (
          <SyntaxHighlighter code={file.content} language={file.language} />
        )}
      </div>
      {truncated && (
        <div className="border-t px-4 py-3 bg-muted/30 text-center">
          <Button variant="outline" size="sm" onClick={onShowFull}>
            Show full file ({formatBytes(file.size)})
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewContent({ file }: { file: FileContent }) {
  if (file.language === "markdown" || file.language === "mdx") {
    return (
      <div className="p-6">
        <MarkdownRenderer content={file.content} />
      </div>
    );
  }

  if (isJsonLanguage(file.language)) {
    return <JsonPreview content={file.content} />;
  }

  return null;
}

function JsonPreview({ content }: { content: string }) {
  const { parsed, error } = useMemo(() => {
    try {
      return { parsed: JSON.parse(content), error: null };
    } catch (e) {
      return { parsed: null, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [content]);

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-sm">
          <FileWarning className="w-4 h-4 shrink-0" />
          Parse error: {error}
        </div>
        <div className="mt-4">
          <SyntaxHighlighter code={content} language="json" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="whitespace-nowrap">
        <JsonNode value={parsed} name={null} depth={0} defaultExpanded />
      </div>
    </div>
  );
}

function JsonNode({
  value,
  name,
  depth,
  defaultExpanded = false,
}: {
  value: unknown;
  name: string | null;
  depth: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);

  if (value === null) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
        {name !== null && <span className="text-primary">{name}: </span>}
        <span className="text-muted-foreground italic">null</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
        {name !== null && <span className="text-primary">{name}: </span>}
        <span className="text-orange-600 dark:text-orange-400">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
        {name !== null && <span className="text-primary">{name}: </span>}
        <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
        {name !== null && <span className="text-primary">{name}: </span>}
        <span className="text-green-600 dark:text-green-400">"{value}"</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
          {name !== null && <span className="text-primary">{name}: </span>}
          <span className="text-muted-foreground">[]</span>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: `${depth * 16}px` }}
          className="py-0.5 text-sm font-mono hover:bg-muted/50 w-full text-left rounded transition-colors"
        >
          <span className="text-muted-foreground mr-1">{expanded ? "▼" : "▶"}</span>
          {name !== null && <span className="text-primary">{name}: </span>}
          <span className="text-muted-foreground">[{expanded ? "" : `${value.length} items`}</span>
          {!expanded && <span className="text-muted-foreground">]</span>}
        </button>
        {expanded && (
          <>
            {value.map((item, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: array indices are the natural keys for JSON arrays
              <JsonNode key={idx} value={item} name={String(idx)} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono text-muted-foreground">
              ]
            </div>
          </>
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
          {name !== null && <span className="text-primary">{name}: </span>}
          <span className="text-muted-foreground">{"{}"}</span>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: `${depth * 16}px` }}
          className="py-0.5 text-sm font-mono hover:bg-muted/50 w-full text-left rounded transition-colors"
        >
          <span className="text-muted-foreground mr-1">{expanded ? "▼" : "▶"}</span>
          {name !== null && <span className="text-primary">{name}: </span>}
          <span className="text-muted-foreground">
            {"{"}
            {expanded ? "" : `${entries.length} keys`}
          </span>
          {!expanded && <span className="text-muted-foreground">{"}"}</span>}
        </button>
        {expanded && (
          <>
            {entries.map(([key, val]) => (
              <JsonNode key={key} value={val} name={key} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono text-muted-foreground">
              {"}"}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }} className="py-0.5 text-sm font-mono">
      {name !== null && <span className="text-primary">{name}: </span>}
      <span className="text-foreground">{String(value)}</span>
    </div>
  );
}
