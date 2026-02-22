import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";

interface DevServer {
  process: ChildProcess;
  port: number;
  status: "starting" | "ready" | "error" | "stopped";
  logs: string[]; // ring buffer, last 500 lines
  readyResolve?: () => void;
  onLogCallbacks: Array<(line: string) => void>;
}

const MAX_LOG_LINES = 500;

// Cache on globalThis so the Map survives Next.js HMR reloads — prevents orphaned processes
const GLOBAL_KEY = "__inside_dev_servers__" as const;
const globalRecord = globalThis as Record<string, unknown>;
if (!globalRecord[GLOBAL_KEY]) {
  globalRecord[GLOBAL_KEY] = new Map<string, DevServer>();
}
const servers = globalRecord[GLOBAL_KEY] as Map<string, DevServer>;

function pushLog(server: DevServer, line: string) {
  server.logs.push(line);
  if (server.logs.length > MAX_LOG_LINES) {
    server.logs.splice(0, server.logs.length - MAX_LOG_LINES);
  }
  for (const cb of server.onLogCallbacks) {
    try {
      cb(line);
    } catch {
      // ignore callback errors
    }
  }
}

async function findAvailablePort(startPort = 2500): Promise<number> {
  let port = startPort;
  while (port < startPort + 100) {
    const available = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => {
        srv.close(() => resolve(true));
      });
      srv.listen(port, "127.0.0.1");
    });
    if (available) return port;
    port++;
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + 99}`);
}

export async function start(projectId: string, projectDir: string, pm: string): Promise<{ port: number }> {
  // Stop any existing server for this project
  stop(projectId);

  const port = await findAvailablePort();

  // Use PORT env var (set below) instead of --port flag.
  // Passing --port via `pnpm run dev -- --port N` breaks Next.js (treats --port as directory).
  const args = pm === "bun" ? ["dev"] : ["run", "dev"];

  const child = spawn(pm, args, {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port), BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const server: DevServer = {
    process: child,
    port: 0, // will be set from actual server output
    status: "starting",
    logs: [],
    onLogCallbacks: [],
  };
  servers.set(projectId, server);

  const readyPromise = new Promise<void>((resolve) => {
    server.readyResolve = resolve;
  });

  // Extract actual port from server output (handles Vite ignoring PORT env var)
  const portPattern = /http:\/\/localhost:(\d+)/;
  // Ready: require an actual localhost URL so we capture the real port.
  // Covers Next.js ("http://localhost:3000"), Vite ("Local: http://localhost:5173"), etc.
  const readyPattern = /http:\/\/localhost:\d+/;

  const handleData = (data: Buffer) => {
    const text = data.toString();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      pushLog(server, trimmed);
      if (server.status === "starting" && readyPattern.test(trimmed)) {
        const portMatch = trimmed.match(portPattern);
        if (portMatch) {
          server.port = Number.parseInt(portMatch[1], 10);
        }
        server.status = "ready";
        server.readyResolve?.();
        server.readyResolve = undefined;
      }
    }
  };

  child.stdout?.on("data", handleData);
  child.stderr?.on("data", handleData);

  child.on("error", (err) => {
    pushLog(server, `[error] ${err.message}`);
    server.status = "error";
    server.readyResolve?.();
    server.readyResolve = undefined;
  });

  child.on("close", (code) => {
    pushLog(server, `[exit] Process exited with code ${code}`);
    if (server.status !== "error") {
      server.status = "stopped";
    }
    server.readyResolve?.();
    server.readyResolve = undefined;
  });

  // Wait for ready or timeout after 30 seconds
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
  await Promise.race([readyPromise, timeout]);

  return { port: server.port };
}

export function stop(projectId: string): void {
  const server = servers.get(projectId);
  if (!server) return;
  server.onLogCallbacks.length = 0;
  if (server.process.exitCode === null) {
    server.process.kill("SIGTERM");
  }
  server.status = "stopped";
  servers.delete(projectId);
}

export function onLog(projectId: string, callback: (line: string) => void): () => void {
  const server = servers.get(projectId);
  if (!server) return () => {};
  server.onLogCallbacks.push(callback);
  return () => {
    const idx = server.onLogCallbacks.indexOf(callback);
    if (idx !== -1) server.onLogCallbacks.splice(idx, 1);
  };
}

export function getStatus(projectId: string): { running: boolean; port: number; pid: number; logs: string[] } | null {
  const server = servers.get(projectId);
  if (!server) return null;
  return {
    running: server.status === "starting" || server.status === "ready",
    port: server.port,
    pid: server.process.pid ?? 0,
    logs: server.logs,
  };
}

export function getLogs(projectId: string): string[] {
  const server = servers.get(projectId);
  return server?.logs ?? [];
}

export function listAll(): Array<{ projectId: string; port: number; pid: number }> {
  const result: Array<{ projectId: string; port: number; pid: number }> = [];
  for (const [id, server] of servers) {
    if (server.status === "starting" || server.status === "ready") {
      result.push({ projectId: id, port: server.port, pid: server.process.pid ?? 0 });
    }
  }
  return result;
}

export function stopAll(): number {
  let count = 0;
  for (const [id, server] of servers) {
    if (server.status === "starting" || server.status === "ready") {
      count++;
    }
    stop(id);
  }
  return count;
}

// Clean up on process exit
process.on("exit", stopAll);
