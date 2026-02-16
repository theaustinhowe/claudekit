import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface DevServer {
  process: ChildProcess;
  url: string;
  pid: number;
}

export async function startDevServer(projectPath: string): Promise<DevServer> {
  // 1. Detect package manager by checking for pnpm-lock.yaml, yarn.lock, or package-lock.json
  // 2. Read package.json scripts.dev to find the dev command
  // 3. Spawn the dev command (e.g., pnpm dev, npm run dev)
  // 4. Poll http://localhost:3000 (or detected port) until it responds (max 30s)
  // 5. Return { process, url, pid }

  const pkgJson = JSON.parse(await readFile(join(projectPath, "package.json"), "utf-8"));

  // Detect package manager
  const fs = await import("node:fs");
  let pm = "npm";
  if (fs.existsSync(join(projectPath, "pnpm-lock.yaml"))) pm = "pnpm";
  else if (fs.existsSync(join(projectPath, "yarn.lock"))) pm = "yarn";
  else if (fs.existsSync(join(projectPath, "bun.lockb"))) pm = "bun";

  // Detect port from dev script
  const devScript = pkgJson.scripts?.dev || "";
  const portMatch = devScript.match(/-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)/);
  const port = portMatch ? parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10) : 3000;
  const url = `http://localhost:${port}`;

  // Spawn dev server
  const child = spawn(pm, ["run", "dev"], {
    cwd: projectPath,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  if (!child.pid) throw new Error("Failed to start dev server");

  // Poll until server responds
  const maxWait = 60_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
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

  child.kill("SIGTERM");
  throw new Error(`Dev server failed to start within ${maxWait / 1000}s`);
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
