import type { ClaudeStreamEvent, LogType, ParsedEvent } from "./types.js";

/**
 * Parse a single stream-json event from Claude CLI.
 * Extracted as a standalone function so any transport (SSE, WebSocket, etc.) can reuse it.
 *
 * @param evt - The parsed JSON event from Claude's `--output-format stream-json`
 * @param cwd - Working directory, used to shorten file paths in tool use logs
 */
export function parseStreamJsonEvent(evt: ClaudeStreamEvent, cwd: string): ParsedEvent {
  const t = evt.type as string;

  if (t === "system") return { log: "Connected", logType: "status" };

  if (t === "result") {
    const dur = evt.duration_ms ?? evt.duration_api_ms;
    return {
      log: `Done${dur ? ` in ${(Number(dur) / 1000).toFixed(1)}s` : ""}`,
      logType: "status",
    };
  }

  const msg = evt.message as Record<string, unknown> | undefined;
  const blocks = msg?.content as ClaudeStreamEvent[] | undefined;
  if (!blocks) return {};

  const shortPath = (p: string) => {
    if (typeof p !== "string") return String(p);
    return p.startsWith(cwd) ? p.slice(cwd.length + 1) : p;
  };

  const hasToolUse = blocks.some((b) => b.type === "tool_use");

  if (hasToolUse) {
    const result: { log?: string; logType?: LogType; chunk?: string } = {};

    for (const block of blocks) {
      if (block.type === "tool_use" && block.name === "Write") {
        const input = block.input as Record<string, unknown> | undefined;
        if (input?.content && typeof input.content === "string") {
          result.chunk = input.content;
        }
      }
    }

    const toolLines: string[] = [];
    const thinkingLines: string[] = [];

    for (const block of blocks) {
      if (block.type === "text") {
        const text = (block.text as string).trim();
        if (text) {
          const firstLine = text.split("\n")[0].slice(0, 80);
          thinkingLines.push(firstLine + (text.length > 80 ? "..." : ""));
        }
      }
      if (block.type === "tool_use") {
        const name = block.name as string;
        if (!["Read", "Glob", "Grep", "LS", "Bash", "Write", "Edit"].includes(name)) continue;
        let input = block.input as Record<string, unknown> | undefined;
        if (typeof input === "string") {
          try {
            input = JSON.parse(input);
          } catch {
            /* ignore */
          }
        }
        let arg = (input?.file_path ?? input?.pattern ?? input?.path ?? input?.command) as string | undefined;
        if (input?.pattern && input?.path && (name === "Glob" || name === "Grep")) {
          arg = `${input.pattern}  ${shortPath(input.path as string)}`;
        }
        toolLines.push(arg ? `${name}  ${shortPath(arg)}` : name);
      }
    }

    const allLines = [...thinkingLines, ...toolLines];
    if (allLines.length > 0) {
      result.log = thinkingLines
        .map((l) => `\t${l}`)
        .concat(toolLines)
        .join("\n");
      result.logType = "tool";
    }
    return result;
  }

  if (t === "assistant") {
    const texts = blocks.filter((b) => b.type === "text").map((b) => b.text as string);
    if (texts.length > 0) return { chunk: texts.join("") };
  }

  return {};
}
