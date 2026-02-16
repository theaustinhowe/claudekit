import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { calculateModelCost } from "./pricing";
import type { TokenCounts } from "./types";

interface ModelTokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

interface TodayUsageWithCost {
  totalCostUSD: number;
  modelBreakdown: Record<string, ModelTokenBreakdown>;
}

interface DailyCostEntry {
  date: string;
  totalCostUSD: number;
}

// Module-level cache
let cachedResult: TodayUsageWithCost | null = null;
let cachedAt = 0;
let cachedRecentDays: DailyCostEntry[] | null = null;
let cachedRecentDaysAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/** Cached wrapper — returns today's token breakdown with cost, refreshes at most every 60s */
export async function getTodayUsageWithCost(): Promise<TodayUsageWithCost | null> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  try {
    cachedResult = await parseTodayJSONL();
    cachedAt = Date.now();
    return cachedResult;
  } catch {
    return null;
  }
}

/** Returns daily cost totals for the past N days (including today) */
export async function getRecentDailyCosts(days = 7): Promise<DailyCostEntry[]> {
  const now = Date.now();
  if (cachedRecentDays && now - cachedRecentDaysAt < CACHE_TTL_MS) {
    return cachedRecentDays;
  }

  try {
    cachedRecentDays = await parseRecentDaysJSONL(days);
    cachedRecentDaysAt = Date.now();
    return cachedRecentDays;
  } catch {
    return [];
  }
}

/** Parse JSONL files from the past N days, returning per-day cost totals */
async function parseRecentDaysJSONL(days: number): Promise<DailyCostEntry[]> {
  const projectsDir = join(homedir(), ".claude", "projects");

  // Build set of date strings we care about
  const dateStrings: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateStrings.push(d.toLocaleDateString("en-CA"));
  }
  const dateSet = new Set(dateStrings);
  const oldestDate = dateStrings[dateStrings.length - 1];

  // Collect .jsonl files modified within the window
  const jsonlFiles = await collectRecentJsonlFiles(projectsDir, oldestDate);

  // Per-date + per-message dedup map: messageId -> { date, model, usage }
  const messageMap = new Map<string, { date: string; model: string; usage: TokenCounts }>();

  for (const filePath of jsonlFiles) {
    await parseJsonlFileMultiDay(filePath, dateSet, messageMap);
  }

  // Aggregate per-date costs
  const dateCosts = new Map<string, number>();
  for (const ds of dateStrings) {
    dateCosts.set(ds, 0);
  }

  for (const { date, model, usage } of messageMap.values()) {
    const cost = calculateModelCost(model, usage);
    dateCosts.set(date, (dateCosts.get(date) ?? 0) + cost);
  }

  // Return sorted oldest-first
  return dateStrings.reverse().map((date) => ({ date, totalCostUSD: dateCosts.get(date) ?? 0 }));
}

/** Recursively collect .jsonl files modified on or after oldestDate */
async function collectRecentJsonlFiles(dir: string, oldestDate: string): Promise<string[]> {
  const files: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    try {
      const s = await stat(fullPath);

      if (s.isDirectory()) {
        const sub = await collectRecentJsonlFiles(fullPath, oldestDate);
        files.push(...sub);
      } else if (entry.endsWith(".jsonl")) {
        const modDate = new Date(s.mtime).toLocaleDateString("en-CA");
        if (modDate >= oldestDate) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return files;
}

/** Parse a single .jsonl file, extracting assistant messages for any date in dateSet */
async function parseJsonlFileMultiDay(
  filePath: string,
  dateSet: Set<string>,
  messageMap: Map<string, { date: string; model: string; usage: TokenCounts }>,
): Promise<void> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);
      if (entry.type !== "assistant") continue;

      const msg = entry.message;
      if (!msg?.usage || !msg?.id || !msg?.model) continue;

      const ts = entry.timestamp;
      if (!ts) continue;
      const entryDate = new Date(ts).toLocaleDateString("en-CA");
      if (!dateSet.has(entryDate)) continue;

      messageMap.set(msg.id, {
        date: entryDate,
        model: msg.model,
        usage: {
          inputTokens: msg.usage.input_tokens ?? 0,
          outputTokens: msg.usage.output_tokens ?? 0,
          cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
        },
      });
    } catch {
      // Skip malformed lines
    }
  }
}

// Walk all project dirs under ~/.claude/projects for today's .jsonl files
async function parseTodayJSONL(): Promise<TodayUsageWithCost> {
  const projectsDir = join(homedir(), ".claude", "projects");
  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

  // Collect all .jsonl files from project dirs (including subagents/)
  const jsonlFiles = await collectTodayJsonlFiles(projectsDir, todayStr);

  // Per-model aggregated tokens, keyed by model ID
  // Dedup by message.id — keep last entry per ID
  const messageMap = new Map<string, { model: string; usage: TokenCounts }>();

  for (const filePath of jsonlFiles) {
    await parseJsonlFile(filePath, todayStr, messageMap);
  }

  // Aggregate per-model
  const modelBreakdown: Record<string, ModelTokenBreakdown> = {};

  for (const { model, usage } of messageMap.values()) {
    if (!modelBreakdown[model]) {
      modelBreakdown[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      };
    }
    const m = modelBreakdown[model];
    m.inputTokens += usage.inputTokens;
    m.outputTokens += usage.outputTokens;
    m.cacheReadInputTokens += usage.cacheReadInputTokens;
    m.cacheCreationInputTokens += usage.cacheCreationInputTokens;
  }

  let totalCostUSD = 0;
  for (const [model, tokens] of Object.entries(modelBreakdown)) {
    tokens.costUSD = calculateModelCost(model, tokens);
    totalCostUSD += tokens.costUSD;
  }

  return { totalCostUSD, modelBreakdown };
}

/** Recursively collect .jsonl files modified today from a directory */
async function collectTodayJsonlFiles(dir: string, todayStr: string): Promise<string[]> {
  const files: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    try {
      const s = await stat(fullPath);

      if (s.isDirectory()) {
        // Recurse into subdirs (project dirs, subagents/)
        const sub = await collectTodayJsonlFiles(fullPath, todayStr);
        files.push(...sub);
      } else if (entry.endsWith(".jsonl")) {
        // Check if modified today
        const modDate = new Date(s.mtime).toLocaleDateString("en-CA");
        if (modDate === todayStr) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return files;
}

/** Parse a single .jsonl file, extracting assistant messages from today */
async function parseJsonlFile(
  filePath: string,
  todayStr: string,
  messageMap: Map<string, { model: string; usage: TokenCounts }>,
): Promise<void> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);

      // Only assistant messages with usage data
      if (entry.type !== "assistant") continue;

      const msg = entry.message;
      if (!msg?.usage || !msg?.id || !msg?.model) continue;

      // Filter to today's messages
      const ts = entry.timestamp;
      if (!ts) continue;
      const entryDate = new Date(ts).toLocaleDateString("en-CA");
      if (entryDate !== todayStr) continue;

      // Dedup: last entry per message ID wins (streaming chunks)
      messageMap.set(msg.id, {
        model: msg.model,
        usage: {
          inputTokens: msg.usage.input_tokens ?? 0,
          outputTokens: msg.usage.output_tokens ?? 0,
          cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
        },
      });
    } catch {
      // Skip malformed lines
    }
  }
}
