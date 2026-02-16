import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, rmSync, type WriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AppDef, apps, LOG_DIR, PID_DIR, pidFilePath } from "./dev-apps.js";

const MAX_RESTARTS = 3;
const UPTIME_RESET_MS = 30_000;
const LOG_RETENTION_DAYS = 14;
const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();

// --- NDJSON log writing ---

function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const logStreams = new Map<string, { stream: WriteStream; date: string }>();

function getLogStream(appId: string): WriteStream {
  const today = dateStamp();
  const existing = logStreams.get(appId);
  if (existing && existing.date === today) {
    return existing.stream;
  }
  // Close old stream if date rotated
  if (existing) {
    existing.stream.end();
  }
  const filePath = join(LOG_DIR, `${appId}.${today}.ndjson`);
  const stream = createWriteStream(filePath, { flags: "a" });
  logStreams.set(appId, { stream, date: today });
  return stream;
}

function writeLog(appId: string, entry: Record<string, unknown>): void {
  try {
    const stream = getLogStream(appId);
    stream.write(`${JSON.stringify(entry)}\n`);
  } catch {
    // Don't crash if we can't write
  }
}

function classifyStderrLevel(line: string): number {
  const lower = line.toLowerCase();
  const errorPatterns = [
    "error:",
    "typeerror",
    "referenceerror",
    "syntaxerror",
    "eaddrinuse",
    "enoent",
    "eacces",
    "unhandledrejection",
    "uncaughtexception",
    "fatal",
  ];
  if (errorPatterns.some((p) => lower.includes(p))) return 50;
  const infoPatterns = ["compiling", "ready", "compiled", "hmr", "starting", "listening", "built"];
  if (infoPatterns.some((p) => lower.includes(p))) return 30;
  return 40;
}

function isPinoLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith("{")) return null;
  try {
    const obj = JSON.parse(line);
    if (typeof obj.level === "number" && typeof obj.time === "number" && typeof obj.msg === "string") {
      return obj;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

function processLine(appId: string, line: string, source: "stdout" | "stderr"): void {
  // Check if it's already pino NDJSON
  const pino = isPinoLine(line);
  if (pino) {
    writeLog(appId, { ...pino, app: appId });
    return;
  }
  // Wrap plain text
  const level = source === "stderr" ? classifyStderrLevel(line) : 30;
  writeLog(appId, {
    level,
    time: Date.now(),
    msg: line,
    app: appId,
    service: source,
  });
}

// --- Log pruning ---

function pruneOldLogs(): void {
  try {
    const files = readdirSync(LOG_DIR);
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!file.endsWith(".ndjson")) continue;
      // Parse date from {app}.YYYY-MM-DD.ndjson
      const match = file.match(/\.(\d{4}-\d{2}-\d{2})\.ndjson$/);
      if (!match) continue;
      const fileDate = new Date(match[1]).getTime();
      if (fileDate < cutoff) {
        rmSync(join(LOG_DIR, file), { force: true });
      }
    }
  } catch {
    // Non-critical
  }
}

// --- App process management ---

interface ManagedApp {
  app: AppDef;
  proc: ChildProcess | null;
  restartCount: number;
  startTime: number;
}

const managed: ManagedApp[] = [];

function launchApp(entry: ManagedApp): void {
  const { app } = entry;

  const proc = spawn("pnpm", ["--filter", app.filter, "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: ROOT_DIR,
    detached: false,
  });

  entry.proc = proc;
  entry.startTime = Date.now();

  writeLog(app.id, {
    level: 30,
    time: Date.now(),
    msg: `Process started (PID ${proc.pid})`,
    app: app.id,
    service: "lifecycle",
  });

  let stdoutBuf = "";
  proc.stdout?.on("data", (data: Buffer) => {
    stdoutBuf += data.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) processLine(app.id, line, "stdout");
    }
  });

  let stderrBuf = "";
  proc.stderr?.on("data", (data: Buffer) => {
    stderrBuf += data.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) processLine(app.id, line, "stderr");
    }
  });

  proc.on("exit", (code, signal) => {
    // Flush remaining buffer
    if (stdoutBuf.trim()) processLine(app.id, stdoutBuf, "stdout");
    if (stderrBuf.trim()) processLine(app.id, stderrBuf, "stderr");

    writeLog(app.id, {
      level: code !== 0 && code !== null ? 50 : 30,
      time: Date.now(),
      msg: `Process exited (code=${code}, signal=${signal})`,
      app: app.id,
      service: "lifecycle",
    });

    entry.proc = null;

    // Don't restart if we're shutting down
    if (shuttingDown) return;

    if (code !== 0 && code !== null) {
      const uptime = Date.now() - entry.startTime;
      if (uptime > UPTIME_RESET_MS) {
        entry.restartCount = 0;
      }
      if (entry.restartCount < MAX_RESTARTS) {
        entry.restartCount++;
        const delay = 2 ** (entry.restartCount - 1) * 1000;
        writeLog(app.id, {
          level: 40,
          time: Date.now(),
          msg: `Restarting in ${delay}ms (attempt ${entry.restartCount}/${MAX_RESTARTS})`,
          app: app.id,
          service: "lifecycle",
        });
        setTimeout(() => launchApp(entry), delay);
      } else {
        writeLog(app.id, {
          level: 50,
          time: Date.now(),
          msg: "Max restarts reached, not restarting",
          app: app.id,
          service: "lifecycle",
        });
      }
    }
  });
}

// --- Shutdown ---

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const entry of managed) {
    if (entry.proc?.pid) {
      writeLog(entry.app.id, {
        level: 30,
        time: Date.now(),
        msg: "Stopping process",
        app: entry.app.id,
        service: "lifecycle",
      });
      try {
        process.kill(-entry.proc.pid, "SIGTERM");
      } catch {
        try {
          entry.proc.kill("SIGTERM");
        } catch {
          // Already dead
        }
      }
    }
  }

  // Clean up PID file
  try {
    rmSync(pidFilePath(), { force: true });
  } catch {
    // Non-critical
  }

  // Close all log streams
  for (const { stream } of logStreams.values()) {
    stream.end();
  }

  // Give children a moment to exit, then force exit
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// --- Main ---

// Ensure directories exist
mkdirSync(PID_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

// Write PID file
writeFileSync(pidFilePath(), String(process.pid));

// Prune old logs
pruneOldLogs();

// Start all apps
for (const app of apps) {
  const entry: ManagedApp = {
    app,
    proc: null,
    restartCount: 0,
    startTime: 0,
  };
  managed.push(entry);
  launchApp(entry);
}
