import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

interface DevServer {
  process: ChildProcess;
  url: string;
  pid: number;
}

/** Bind to port 0 and let the OS pick a free port. */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export async function startDevServer(projectPath: string): Promise<DevServer> {
  const pkgJson = JSON.parse(await readFile(join(projectPath, "package.json"), "utf-8"));

  // Detect package manager
  const fs = await import("node:fs");
  let pm = "npm";
  if (fs.existsSync(join(projectPath, "pnpm-lock.yaml"))) pm = "pnpm";
  else if (fs.existsSync(join(projectPath, "yarn.lock"))) pm = "yarn";
  else if (fs.existsSync(join(projectPath, "bun.lockb"))) pm = "bun";

  // Always use a dynamically assigned free port to avoid conflicts with B4U
  // (the target project may share the same port via env, config, or CLI flags).
  // PORT env var is respected by Next.js (when no -p flag), Vite, Express, etc.
  const port = await findFreePort();
  const url = `http://localhost:${port}`;

  // Capture stderr for diagnostics
  const stderrChunks: string[] = [];
  let exited = false;
  let exitCode: number | null = null;

  const child = spawn(pm, ["run", "dev"], {
    cwd: projectPath,
    env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  if (!child.pid) throw new Error("Failed to spawn dev server process");

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString());
  });

  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });

  // Poll until server responds, but bail early if process crashes
  const maxWait = 60_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (exited) {
      const stderr = stderrChunks.join("").slice(-500);
      throw new Error(
        `Dev server exited (code ${exitCode}) before becoming ready on ${url}${stderr ? `\n${stderr}` : ""}`,
      );
    }
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) {
        return { process: child, url, pid: child.pid };
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const stderr = stderrChunks.join("").slice(-500);
  child.kill("SIGTERM");
  throw new Error(
    `Dev server failed to start within ${maxWait / 1000}s (polling ${url})${stderr ? `\n${stderr}` : ""}`,
  );
}

export function stopDevServer(child: ChildProcess): void {
  try {
    if (child.pid) {
      // Kill process group
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // Process already gone
  }
}
