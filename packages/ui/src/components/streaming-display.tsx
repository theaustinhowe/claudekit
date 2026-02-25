"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  FileCode,
  FolderOpen,
  Lightbulb,
  MessageSquareText,
  Terminal,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { cn } from "../utils";
import { Badge } from "./badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamEntryKind =
  | "file-write"
  | "file-edit"
  | "bash-command"
  | "read-op"
  | "thinking"
  | "status"
  | "phase-separator"
  | "prompt";

export interface StreamEntry {
  id: number;
  kind: StreamEntryKind;
  toolName?: string;
  filePath?: string;
  command?: string;
  thinkingText?: string;
  statusText?: string;
  phaseLabel?: string;
  rawText: string;
}

type GroupedStreamItem =
  | { type: "single"; entry: StreamEntry }
  | { type: "file-group"; dir: string; entries: StreamEntry[] }
  | { type: "file-batch"; dirs: { dir: string; entries: StreamEntry[] }[]; allEntries: StreamEntry[] }
  | { type: "bash-group"; entries: StreamEntry[] }
  | { type: "thinking-group"; entries: StreamEntry[] }
  | { type: "read-group"; entries: StreamEntry[] }
  | { type: "prompt-group"; label: string; entries: StreamEntry[] };

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

  // Phase separator: single entry for the whole log
  if (logType === "phase-separator") {
    entries.push({
      id: ++_streamIdCounter,
      kind: "phase-separator",
      phaseLabel: log,
      rawText: log,
    });
    return entries;
  }

  // Prompt lines: each line becomes a prompt entry
  if (logType === "prompt") {
    for (const raw of log.split("\n")) {
      entries.push({
        id: ++_streamIdCounter,
        kind: "prompt",
        statusText: raw,
        rawText: raw,
      });
    }
    return entries;
  }

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

    // Group phase-separator + consecutive prompt/status entries into a prompt-group
    // Also detect status entries that look like prompt separators (backwards compat with old sessions
    // where parseStreamLog didn't handle phase-separator logType)
    const isPromptSeparator =
      (entry.kind === "phase-separator" && entry.phaseLabel?.startsWith("Prompt")) ||
      (entry.kind === "status" && entry.statusText?.startsWith("Prompt"));
    if (isPromptSeparator) {
      const label = entry.phaseLabel || entry.statusText || "Prompt";
      const promptEntries: StreamEntry[] = [];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        // Stop at phase-separators (e.g. "Output") or status entries that look like separators
        if (next.kind === "phase-separator") break;
        if (next.kind === "status" && (next.statusText?.startsWith("Output") || next.statusText?.startsWith("---"))) {
          break;
        }
        if (next.kind === "prompt" || next.kind === "status") {
          promptEntries.push(next);
          j++;
        } else {
          break;
        }
      }
      if (promptEntries.length > 0) {
        groups.push({ type: "prompt-group", label, entries: promptEntries });
        i = j;
        continue;
      }
      // No prompt entries followed — render separator standalone
    }

    // Standalone phase-separator (e.g. "Output")
    // Also detect status entries that look like "Output" separators (backwards compat)
    if (entry.kind === "phase-separator" || (entry.kind === "status" && entry.statusText === "Output")) {
      // Normalize to phase-separator for rendering
      const normalized =
        entry.kind === "phase-separator"
          ? entry
          : { ...entry, kind: "phase-separator" as const, phaseLabel: entry.statusText };
      groups.push({ type: "single", entry: normalized });
      i++;
      continue;
    }

    // Standalone prompt entries (not grouped)
    if (entry.kind === "prompt") {
      groups.push({ type: "single", entry });
      i++;
      continue;
    }

    // Group consecutive file writes/edits across any directory (absorb interleaved thinking)
    if (entry.kind === "file-write" || entry.kind === "file-edit") {
      const fileEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if (next.kind === "file-write" || next.kind === "file-edit") {
          fileEntries.push(next);
          j++;
        } else if (next.kind === "thinking") {
          // Absorb thinking if followed by another file op
          let k = j + 1;
          while (k < entries.length && entries[k].kind === "thinking") k++;
          if (k < entries.length && (entries[k].kind === "file-write" || entries[k].kind === "file-edit")) {
            for (let t = j; t < k; t++) fileEntries.push(entries[t]);
            fileEntries.push(entries[k]);
            j = k + 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      if (fileEntries.length >= 2) {
        // Sub-group by directory
        const dirMap = new Map<string, StreamEntry[]>();
        for (const fe of fileEntries) {
          if (fe.kind === "thinking") continue;
          const d = fe.filePath ? dirOf(fe.filePath) : ".";
          if (!dirMap.has(d)) dirMap.set(d, []);
          dirMap.get(d)!.push(fe);
        }
        const dirs = Array.from(dirMap, ([dir, entries]) => ({ dir, entries }));
        groups.push({ type: "file-batch", dirs, allEntries: fileEntries });
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

    // Group consecutive bash commands (absorb interleaved thinking)
    if (entry.kind === "bash-command") {
      const bashEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if (next.kind === "bash-command") {
          bashEntries.push(next);
          j++;
        } else if (next.kind === "thinking") {
          let k = j + 1;
          while (k < entries.length && entries[k].kind === "thinking") k++;
          if (k < entries.length && entries[k].kind === "bash-command") {
            for (let t = j; t < k; t++) bashEntries.push(entries[t]);
            bashEntries.push(entries[k]);
            j = k + 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      const bashOnly = bashEntries.filter((e) => e.kind === "bash-command");
      if (bashOnly.length >= 2) {
        groups.push({ type: "bash-group", entries: bashEntries });
      } else {
        groups.push({ type: "single", entry });
      }
      i = j;
      continue;
    }

    // Group consecutive thinking entries (2+)
    if (entry.kind === "thinking") {
      const thinkEntries: StreamEntry[] = [entry];
      let j = i + 1;
      while (j < entries.length && entries[j].kind === "thinking") {
        thinkEntries.push(entries[j]);
        j++;
      }
      if (thinkEntries.length >= 2) {
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

function fileActionLabel(kind: StreamEntryKind): string {
  return kind === "file-edit" ? "Edited" : "Created";
}

function FileWriteRow({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const path = entry.filePath ?? "";
  const dir = dirOf(path);
  const name = fileNameOf(path);
  const action = fileActionLabel(entry.kind);

  if (variant === "chat") {
    return (
      <div className="flex items-center gap-2 py-0.5 px-2" title={`${action} ${path}`}>
        <FileCode className={cn("w-3.5 h-3.5 shrink-0", fileColorClass(path))} />
        <span>
          <span className="text-muted-foreground text-xs truncate">{dir}/</span>
          <span className="text-foreground text-xs font-medium truncate">{name}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1" title={`${action} ${path}`}>
      <FileCode className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
      <span>
        <span className="text-zinc-600 text-xs truncate">{dir}/</span>
        <span className="text-zinc-400 text-xs font-medium truncate">{name}</span>
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
        <div
          key={e.id}
          className="flex items-center gap-2 py-0.5 px-2"
          title={`${fileActionLabel(e.kind)} ${e.filePath ?? ""}`}
        >
          <FileCode className={cn("w-3 h-3 shrink-0", isChat ? fileColorClass(e.filePath ?? "") : "text-zinc-600")} />
          <span className={cn("text-xs font-medium truncate", isChat ? "text-foreground" : "text-zinc-400")}>
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

function FileBatchSection({
  dirs,
  allEntries,
  variant,
  live,
}: {
  dirs: { dir: string; entries: StreamEntry[] }[];
  allEntries: StreamEntry[];
  variant: Variant;
  live?: boolean;
}) {
  const isChat = variant === "chat";
  const totalFiles = allEntries.filter((e) => e.kind !== "thinking").length;
  const created = allEntries.filter((e) => e.kind === "file-write").length;
  const edited = allEntries.filter((e) => e.kind === "file-edit").length;

  const defaultExpanded = isChat ? (live ? true : false) : totalFiles <= 4;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors py-0.5",
          isChat ? "text-muted-foreground hover:text-foreground" : "text-zinc-600 hover:text-zinc-500",
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileCode className="w-3 h-3" />
        <span>
          {totalFiles} file{totalFiles !== 1 ? "s" : ""}
        </span>
        {created > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0 h-4",
              isChat ? "bg-emerald-500/10 text-emerald-600" : "bg-emerald-500/10 text-emerald-400",
            )}
          >
            {created} created
          </Badge>
        )}
        {edited > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0 h-4",
              isChat ? "bg-amber-500/10 text-amber-600" : "bg-amber-500/10 text-amber-400",
            )}
          >
            {edited} edited
          </Badge>
        )}
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
            <div className="pl-2 mt-0.5">
              {dirs.map((d) => (
                <FileGroupSection key={d.dir} dir={d.dir} entries={d.entries} variant={variant} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BashGroupSection({ entries, variant, live }: { entries: StreamEntry[]; variant: Variant; live?: boolean }) {
  const isChat = variant === "chat";
  const bashOnly = entries.filter((e) => e.kind === "bash-command");
  const defaultExpanded = isChat ? (live ? true : false) : live ? true : false;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors py-0.5",
          isChat ? "text-muted-foreground hover:text-foreground" : "text-zinc-600 hover:text-zinc-500",
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Terminal className="w-3 h-3" />
        <span>
          Ran {bashOnly.length} command{bashOnly.length !== 1 ? "s" : ""}
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
              {bashOnly.map((e) => (
                <BashEntry key={e.id} entry={e} variant={variant} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BashEntry({ entry, variant }: { entry: StreamEntry; variant: Variant }) {
  const full = entry.command || "bash";
  const firstLine = full.split("\n")[0];

  if (variant === "chat") {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs min-w-0">
        <Terminal className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <code className="text-muted-foreground truncate min-w-0" title={full}>
          {firstLine}
        </code>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1 text-xs min-w-0">
      <Terminal className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
      <code className="text-zinc-600 truncate min-w-0" title={full}>
        {firstLine}
      </code>
    </div>
  );
}

function ThinkingBlock({ entries, variant }: { entries: StreamEntry[]; variant: Variant }) {
  const [expanded, setExpanded] = useState(false);
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
        <Lightbulb className="w-3 h-3" />
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
          isChat ? "text-muted-foreground/70 hover:text-muted-foreground" : "text-zinc-600 hover:text-zinc-500",
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

function PhaseSeparatorEntry({ entry }: { entry: StreamEntry; variant: Variant }) {
  return (
    <div className="flex items-center gap-2 py-2 mt-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
        {entry.phaseLabel}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function PromptGroupSection({ label, entries, variant }: { label: string; entries: StreamEntry[]; variant: Variant }) {
  const [expanded, setExpanded] = useState(false);
  const nonEmptyEntries = entries.filter((e) => (e.statusText ?? e.rawText ?? "").trim());

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors rounded-md px-2 py-1",
          variant === "chat"
            ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            : "text-muted-foreground hover:text-foreground hover:bg-zinc-800/50",
        )}
      >
        {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <MessageSquareText className="w-3 h-3 shrink-0" />
        <span>
          {label} ({nonEmptyEntries.length} line{nonEmptyEntries.length !== 1 ? "s" : ""})
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
            <div className="pl-5 space-y-0 border-l border-border ml-1.5">
              {nonEmptyEntries.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "text-xs leading-relaxed py-0.5 whitespace-pre-wrap break-words",
                    variant === "chat" ? "text-muted-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {e.statusText ?? e.rawText}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

function StreamEntryList({
  grouped,
  variant,
  live,
}: {
  grouped: GroupedStreamItem[];
  variant: Variant;
  live?: boolean;
}) {
  return (
    <div className={variant === "terminal" ? "space-y-0" : "space-y-0.5"}>
      {grouped.map((group, idx) => {
        if (group.type === "file-batch") {
          return (
            <FileBatchSection
              key={`fb-${group.allEntries[0].id}-${idx}`}
              dirs={group.dirs}
              allEntries={group.allEntries}
              variant={variant}
              live={live}
            />
          );
        }
        if (group.type === "file-group") {
          return (
            <FileGroupSection
              key={`fg-${group.entries[0].id}-${idx}`}
              dir={group.dir}
              entries={group.entries}
              variant={variant}
            />
          );
        }
        if (group.type === "bash-group") {
          return (
            <BashGroupSection
              key={`bg-${group.entries[0].id}-${idx}`}
              entries={group.entries}
              variant={variant}
              live={live}
            />
          );
        }
        if (group.type === "thinking-group") {
          return <ThinkingBlock key={`tg-${group.entries[0].id}-${idx}`} entries={group.entries} variant={variant} />;
        }
        if (group.type === "read-group") {
          return (
            <ReadGroupSection key={`rg-${group.entries[0].id}-${idx}`} entries={group.entries} variant={variant} />
          );
        }
        if (group.type === "prompt-group") {
          return (
            <PromptGroupSection
              key={`pg-${group.entries[0].id}-${idx}`}
              label={group.label}
              entries={group.entries}
              variant={variant}
            />
          );
        }
        const entry = group.entry;
        if (entry.kind === "file-write" || entry.kind === "file-edit") {
          return <FileWriteRow key={`fw-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "bash-command") {
          return <BashEntry key={`bc-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "thinking") {
          return <ThinkingEntry key={`th-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "read-op") {
          return <ReadOpEntry key={`ro-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "status") {
          return <StatusEntry key={`st-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "phase-separator") {
          return <PhaseSeparatorEntry key={`ps-${entry.id}-${idx}`} entry={entry} variant={variant} />;
        }
        if (entry.kind === "prompt") {
          return <StatusEntry key={`pr-${entry.id}-${idx}`} entry={entry} variant={variant} />;
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
                <StreamEntryList grouped={grouped} variant={variant} live={live} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return <StreamEntryList grouped={grouped} variant={variant} live={live} />;
}
