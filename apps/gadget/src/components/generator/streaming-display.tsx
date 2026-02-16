"use client";

import { Badge } from "@devkit/ui/components/badge";
import { CheckCircle2, ChevronDown, ChevronRight, Eye, FileCode, FolderOpen, Terminal, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { cn } from "@devkit/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamEntryKind = "file-write" | "file-edit" | "bash-command" | "read-op" | "thinking" | "status";

export interface StreamEntry {
  id: number;
  kind: StreamEntryKind;
  toolName?: string;
  filePath?: string;
  command?: string;
  thinkingText?: string;
  statusText?: string;
  rawText: string;
}

type GroupedStreamItem =
  | { type: "single"; entry: StreamEntry }
  | { type: "file-group"; dir: string; entries: StreamEntry[] }
  | { type: "thinking-group"; entries: StreamEntry[] }
  | { type: "read-group"; entries: StreamEntry[] };

// ---------------------------------------------------------------------------
// Helpers — file icon colors
// ---------------------------------------------------------------------------

const EXT_COLORS: Record<string, string> = {
  ts: "text-blue-400",
  tsx: "text-blue-400",
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  css: "text-purple-400",
  scss: "text-purple-400",
  json: "text-green-400",
  md: "text-zinc-400",
  html: "text-orange-400",
  svg: "text-orange-400",
  py: "text-emerald-400",
  yaml: "text-rose-400",
  yml: "text-rose-400",
  toml: "text-rose-400",
  lock: "text-zinc-500",
};

function fileColorClass(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "text-zinc-400";
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.slice(0, idx) : ".";
}

function fileNameOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(idx + 1) : filePath;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

let _streamIdCounter = 0;

export function resetStreamIdCounter(): void {
  _streamIdCounter = 0;
}

export function parseStreamLog(log: string, logType: string): StreamEntry[] {
  const entries: StreamEntry[] = [];
  const lines = log.split("\n");

  for (const raw of lines) {
    if (!raw) continue;

    // Tab-prefixed = thinking text
    if (raw.startsWith("\t")) {
      entries.push({
        id: ++_streamIdCounter,
        kind: "thinking",
        thinkingText: raw.slice(1),
        rawText: raw,
      });
      continue;
    }

    // Tool line: "ToolName  argument"
    const toolMatch = raw.match(/^(Write|Edit|Bash|Read|Glob|Grep|LS)\s{2}(.+)$/);
    if (toolMatch) {
      const [, toolName, arg] = toolMatch;
      if (toolName === "Write") {
        entries.push({
          id: ++_streamIdCounter,
          kind: "file-write",
          toolName,
          filePath: arg,
          rawText: raw,
        });
      } else if (toolName === "Edit") {
        entries.push({
          id: ++_streamIdCounter,
          kind: "file-edit",
          toolName,
          filePath: arg,
          rawText: raw,
        });
      } else if (toolName === "Bash") {
        // Classify exploratory bash commands as read-ops
        const isReadLike = /^(ls|cat|find|head|tail|wc|tree|file|stat|du)\s/.test(arg) || arg === "ls";
        if (isReadLike) {
          entries.push({
            id: ++_streamIdCounter,
            kind: "read-op",
            toolName: "Bash",
            command: arg,
            rawText: raw,
          });
        } else {
          entries.push({
            id: ++_streamIdCounter,
            kind: "bash-command",
            toolName,
            command: arg,
            rawText: raw,
          });
        }
      } else {
        // Read, Glob, Grep, LS
        entries.push({
          id: ++_streamIdCounter,
          kind: "read-op",
          toolName,
          filePath: arg,
          rawText: raw,
        });
      }
      continue;
    }

    // Tool line without argument (bare name)
    const bareToolMatch = raw.match(/^(Write|Edit|Bash|Read|Glob|Grep|LS)$/);
    if (bareToolMatch) {
      const toolName = bareToolMatch[1];
      if (toolName === "Bash") {
        entries.push({
          id: ++_streamIdCounter,
          kind: "bash-command",
          toolName,
          rawText: raw,
        });
      } else {
        entries.push({
          id: ++_streamIdCounter,
          kind: "read-op",
          toolName,
          rawText: raw,
        });
      }
      continue;
    }

    // Status-like lines
    if (raw === "Connected" || raw.startsWith("Done")) {
      entries.push({
        id: ++_streamIdCounter,
        kind: "status",
        statusText: raw,
        rawText: raw,
      });
      continue;
    }

    // Retry separator
    if (raw.startsWith("---")) {
      entries.push({
        id: ++_streamIdCounter,
        kind: "status",
        statusText: raw,
        rawText: raw,
      });
      continue;
    }

    // Stderr
    if (raw.startsWith("[stderr]")) {
      entries.push({
        id: ++_streamIdCounter,
        kind: "status",
        statusText: raw,
        rawText: raw,
      });
      continue;
    }

    // Fallback — treat as thinking if logType is thinking, otherwise status
    if (logType === "thinking") {
      entries.push({
        id: ++_streamIdCounter,
        kind: "thinking",
        thinkingText: raw,
        rawText: raw,
      });
    } else {
      entries.push({
        id: ++_streamIdCounter,
        kind: "status",
        statusText: raw,
        rawText: raw,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupStreamEntries(entries: StreamEntry[]): GroupedStreamItem[] {
  const groups: GroupedStreamItem[] = [];
  let i = 0;

  while (i < entries.length) {
    const entry = entries[i];

    // Group consecutive file writes/edits in the same directory
    if (entry.kind === "file-write" || entry.kind === "file-edit") {
      const dir = entry.filePath ? dirOf(entry.filePath) : "";
      const fileEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if ((next.kind === "file-write" || next.kind === "file-edit") && dirOf(next.filePath ?? "") === dir) {
          fileEntries.push(next);
          j++;
        } else {
          break;
        }
      }
      if (fileEntries.length >= 2) {
        groups.push({ type: "file-group", dir, entries: fileEntries });
      } else {
        groups.push({ type: "single", entry });
      }
      i = j;
      continue;
    }

    // Group consecutive read-ops (absorb interspersed thinking lines)
    if (entry.kind === "read-op") {
      const readEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if (next.kind === "read-op") {
          readEntries.push(next);
          j++;
        } else if (next.kind === "thinking") {
          // Absorb thinking if followed by another read-op
          let k = j + 1;
          while (k < entries.length && entries[k].kind === "thinking") k++;
          if (k < entries.length && entries[k].kind === "read-op") {
            // Include the thinking entries and continue
            for (let t = j; t < k; t++) readEntries.push(entries[t]);
            readEntries.push(entries[k]);
            j = k + 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      if (readEntries.length >= 2) {
        groups.push({ type: "read-group", entries: readEntries });
      } else {
        groups.push({ type: "single", entry });
      }
      i = j;
      continue;
    }

    // Group consecutive thinking entries (3+)
    if (entry.kind === "thinking") {
      const thinkEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length && entries[j].kind === "thinking") {
        thinkEntries.push(entries[j]);
        j++;
      }
      if (thinkEntries.length >= 3) {
        groups.push({ type: "thinking-group", entries: thinkEntries });
      } else {
        for (const te of thinkEntries) {
          groups.push({ type: "single", entry: te });
        }
      }
      i = j;
      continue;
    }

    groups.push({ type: "single", entry });
    i++;
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Variant = "terminal" | "chat";

function FileWriteRow({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const path = entry.filePath ?? "";
  const dir = dirOf(path);
  const name = fileNameOf(path);

  if (variant === "chat") {
    return (
      <div className="flex items-center gap-2 py-0.5 px-2" title={path}>
        <FileCode className={cn("w-3.5 h-3.5 shrink-0", fileColorClass(path))} />
        <span>
          <span className="text-muted-foreground text-xs truncate">{dir}/</span>
          <span className="text-foreground text-xs font-medium truncate">{name}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1" title={path}>
      <FileCode className={cn("w-3.5 h-3.5 shrink-0", fileColorClass(path))} />
      <span>
        <span className="text-zinc-500 text-xs truncate">{dir}/</span>
        <span className="text-zinc-200 text-xs font-medium truncate">{name}</span>
      </span>
    </div>
  );
}

function FileGroupSection({ dir, entries, variant }: { dir: string; entries: StreamEntry[]; variant: Variant }) {
  const isChat = variant === "chat";

  return (
    <div className={cn("border-l-2 pl-2 space-y-0.5 my-1", isChat ? "border-border" : "border-primary/20")}>
      <div
        className={cn("flex items-center gap-1.5 text-xs py-0.5", isChat ? "text-muted-foreground" : "text-zinc-500")}
      >
        <FolderOpen className="w-3 h-3" />
        <span className="truncate" title={dir}>
          {dir}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto shrink-0">
          {entries.length}
        </Badge>
      </div>
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-2 py-0.5 px-2" title={e.filePath ?? ""}>
          <FileCode className={cn("w-3 h-3 shrink-0", fileColorClass(e.filePath ?? ""))} />
          <span className={cn("text-xs font-medium truncate", isChat ? "text-foreground" : "text-zinc-200")}>
            {fileNameOf(e.filePath ?? "")}
          </span>
          {e.kind === "file-edit" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4",
                isChat ? "text-amber-500 border-amber-500/30" : "text-amber-400 border-amber-400/30",
              )}
            >
              edit
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function BashEntry({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  if (variant === "chat") {
    return (
      <div className="flex items-start gap-2 py-0.5 text-xs">
        <Terminal className="w-3.5 h-3.5 shrink-0 text-muted-foreground mt-0.5" />
        <code className="text-muted-foreground break-all">{entry.command || "bash"}</code>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <Terminal className="w-3.5 h-3.5 shrink-0 text-blue-500/70 mt-0.5" />
      <code className="text-blue-400/70 break-all">{entry.command || "bash"}</code>
    </div>
  );
}

function ThinkingBlock({ entries, variant }: { entries: StreamEntry[]; variant: Variant }) {
  const [expanded, setExpanded] = useState(variant !== "chat");
  const isChat = variant === "chat";

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors py-0.5",
          isChat ? "text-muted-foreground hover:text-foreground" : "text-zinc-300 hover:text-zinc-200",
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="italic">{entries.length} reasoning steps</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className={cn("pl-5 space-y-0 border-l ml-1.5", isChat ? "border-border" : "border-zinc-700")}>
              {entries.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "text-xs italic leading-relaxed truncate py-0.5",
                    isChat ? "text-muted-foreground/70" : "text-zinc-300",
                  )}
                  title={e.thinkingText}
                >
                  {e.thinkingText}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusEntry({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const text = entry.statusText ?? "";
  const isConnected = text === "Connected";
  const isDone = text.startsWith("Done");
  const isSeparator = text.startsWith("---");
  const isSterr = text.startsWith("[stderr]");
  const isChat = variant === "chat";

  if (isSeparator) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className={cn("flex-1 h-px", isChat ? "bg-border" : "bg-zinc-800")} />
        <span
          className={cn("text-[10px] uppercase tracking-wider", isChat ? "text-muted-foreground" : "text-zinc-600")}
        >
          Retrying
        </span>
        <div className={cn("flex-1 h-px", isChat ? "bg-border" : "bg-zinc-800")} />
      </div>
    );
  }

  if (isSterr) {
    return <div className="text-xs text-red-400/70 py-0.5 pl-2">{text}</div>;
  }

  return (
    <div className="flex items-center gap-1.5 text-xs py-0.5">
      {isConnected && <Zap className="w-3 h-3 text-emerald-400" />}
      {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
      <span
        className={cn(
          isChat ? "text-muted-foreground" : "text-zinc-500",
          isConnected && "text-emerald-400",
          isDone && "text-emerald-400",
        )}
      >
        {text}
      </span>
    </div>
  );
}

function ReadGroupSection({ entries, variant }: { entries: StreamEntry[]; variant: Variant }) {
  const [expanded, setExpanded] = useState(false);
  const isChat = variant === "chat";
  const readEntries = entries.filter((e) => e.kind === "read-op");
  const paths = readEntries.map((e) => e.filePath || e.command || e.toolName || "").filter(Boolean);

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors py-0.5",
          isChat ? "text-muted-foreground hover:text-foreground" : "text-zinc-500 hover:text-zinc-400",
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Eye className="w-3 h-3" />
        <span>
          Explored {readEntries.length} file
          {readEntries.length !== 1 ? "s" : ""}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className={cn("pl-5 space-y-0 border-l ml-1.5", isChat ? "border-border" : "border-zinc-800")}>
              {paths.map((p, idx) => (
                <div
                  key={`${p}-${entries[idx]?.id ?? idx}`}
                  className={cn("text-[11px] py-0.5 truncate", isChat ? "text-muted-foreground/70" : "text-zinc-600")}
                  title={p}
                >
                  {p}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReadOpEntry({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const isChat = variant === "chat";

  const fullText = `${entry.toolName} ${entry.filePath ?? ""}`;
  return (
    <div
      className={cn("text-[11px] py-0.5 truncate", isChat ? "text-muted-foreground/70" : "text-zinc-600")}
      title={fullText}
    >
      <span className={isChat ? "text-muted-foreground" : "text-zinc-700"}>{entry.toolName}</span> {entry.filePath}
    </div>
  );
}

function ThinkingEntry({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const isChat = variant === "chat";

  return (
    <div
      className={cn("text-xs italic py-0.5 truncate", isChat ? "text-muted-foreground/70" : "text-zinc-300")}
      title={entry.thinkingText}
    >
      {entry.thinkingText}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary helpers for chat variant
// ---------------------------------------------------------------------------

function summarizeEntries(entries: StreamEntry[]): string {
  let writes = 0;
  let edits = 0;
  let reads = 0;
  let commands = 0;

  for (const e of entries) {
    if (e.kind === "file-write") writes++;
    else if (e.kind === "file-edit") edits++;
    else if (e.kind === "read-op") reads++;
    else if (e.kind === "bash-command") commands++;
  }

  const parts: string[] = [];
  const totalFileOps = writes + edits;
  if (totalFileOps > 0) {
    if (writes > 0 && edits > 0) {
      parts.push(`${writes} created, ${edits} edited`);
    } else if (edits > 0) {
      parts.push(`${edits} file${edits !== 1 ? "s" : ""} edited`);
    } else {
      parts.push(`${writes} file${writes !== 1 ? "s" : ""} created`);
    }
  }
  if (reads > 0) parts.push(`explored ${reads} file${reads !== 1 ? "s" : ""}`);
  if (commands > 0) parts.push(`${commands} command${commands !== 1 ? "s" : ""}`);
  return parts.join(", ") || "processing";
}

// ---------------------------------------------------------------------------
// Inner display (renders all grouped entries)
// ---------------------------------------------------------------------------

function StreamEntryList({ grouped, variant }: { grouped: GroupedStreamItem[]; variant: Variant }) {
  return (
    <div className={variant === "terminal" ? "space-y-0" : "space-y-0.5"}>
      {grouped.map((group) => {
        if (group.type === "file-group") {
          return (
            <FileGroupSection key={group.entries[0].id} dir={group.dir} entries={group.entries} variant={variant} />
          );
        }
        if (group.type === "thinking-group") {
          return <ThinkingBlock key={group.entries[0].id} entries={group.entries} variant={variant} />;
        }
        if (group.type === "read-group") {
          return <ReadGroupSection key={group.entries[0].id} entries={group.entries} variant={variant} />;
        }
        const entry = group.entry;
        if (entry.kind === "file-write" || entry.kind === "file-edit") {
          return <FileWriteRow key={entry.id} entry={entry} variant={variant} />;
        }
        if (entry.kind === "bash-command") {
          return <BashEntry key={entry.id} entry={entry} variant={variant} />;
        }
        if (entry.kind === "thinking") {
          return <ThinkingEntry key={entry.id} entry={entry} variant={variant} />;
        }
        if (entry.kind === "read-op") {
          return <ReadOpEntry key={entry.id} entry={entry} variant={variant} />;
        }
        if (entry.kind === "status") {
          return <StatusEntry key={entry.id} entry={entry} variant={variant} />;
        }
        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface StreamingDisplayProps {
  entries: StreamEntry[];
  variant: "terminal" | "chat";
  /** Whether the display is for a live/streaming message (expanded by default) */
  live?: boolean;
}

export function StreamingDisplay({ entries, variant, live }: StreamingDisplayProps) {
  const grouped = useMemo(() => groupStreamEntries(entries), [entries]);
  const [expanded, setExpanded] = useState(live ?? variant === "terminal");
  const summary = useMemo(() => summarizeEntries(entries), [entries]);

  // In chat variant (non-live), wrap in a collapsible summary
  if (variant === "chat" && !live) {
    return (
      <div className="my-0.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Zap className="w-3 h-3" />
          <span>{summary}</span>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="pl-3 border-l border-border ml-1.5 mt-0.5">
                <StreamEntryList grouped={grouped} variant={variant} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return <StreamEntryList grouped={grouped} variant={variant} />;
}
