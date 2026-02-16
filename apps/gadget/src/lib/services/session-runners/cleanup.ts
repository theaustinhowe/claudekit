import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCleanupFiles } from "@/lib/actions/settings";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import { runClaude } from "@devkit/claude-runner";
import { runProcess } from "@/lib/services/process-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function createCleanupRunner(metadata: Record<string, unknown>): SessionRunner {
  const repoId = metadata.repoId as string;

  return async ({ onProgress, signal, sessionId }) => {
    // Look up repo
    const db = await getDb();
    const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
    if (!repo) throw new Error("Repo not found");

    const repoPath = expandHome(repo.local_path);
    if (!fs.existsSync(repoPath)) throw new Error("Repo path does not exist");

    const cleanupFiles = await getCleanupFiles();

    // Step 1: Delete invalid files (synchronous, fast)
    onProgress({ type: "progress", phase: "Removing invalid files...", progress: 3 });
    let removedCount = 0;
    for (const file of cleanupFiles) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const filePath = path.join(repoPath, file);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          removedCount++;
          onProgress({
            type: "progress",
            phase: `Removed ${file}`,
            progress: 3 + Math.round((removedCount / cleanupFiles.length) * 7),
          });
        }
      } catch {
        onProgress({ type: "log", log: `Failed to remove ${file}`, logType: "status" });
      }
    }
    onProgress({
      type: "progress",
      phase:
        removedCount > 0 ? `Removed ${removedCount} file${removedCount !== 1 ? "s" : ""}` : "No invalid files found",
      progress: 10,
    });

    // Step 2: Run knip --fix
    onProgress({ type: "progress", phase: "Running knip --fix...", progress: 12 });
    try {
      const knipResult = await runProcess({
        command: "npx knip --fix --no-progress",
        cwd: repoPath,
        signal,
        onStdout: (data) => {
          onProgress({ type: "log", log: data, logType: "status" });
        },
        onStderr: (data) => {
          onProgress({ type: "log", log: data, logType: "status" });
        },
      });
      // knip exits 1 when it finds issues — non-fatal
      if (knipResult.exitCode === 0 || knipResult.exitCode === 1) {
        onProgress({ type: "progress", phase: "knip --fix complete", progress: 30 });
      } else {
        onProgress({ type: "progress", phase: `knip exited with code ${knipResult.exitCode}`, progress: 30 });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      onProgress({
        type: "log",
        log: `knip failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        logType: "status",
      });
      onProgress({ type: "progress", phase: "knip failed", progress: 30 });
    }

    // Step 3: Reduce unnecessary indirection via Claude
    onProgress({ type: "progress", phase: "Analyzing indirection...", progress: 32 });
    try {
      await runClaude({
        cwd: repoPath,
        prompt: buildIndirectionPrompt(repoPath),
        allowedTools: "Write,Edit,Read,Glob,Grep",
        disallowedTools: "Bash",
        timeoutMs: 10 * 60_000,
        signal,
        onPid: (pid) => setSessionPid(sessionId, pid),
        onProgress: (info) => {
          const progress = Math.min(32 + Math.floor((info.bytesReceived / 5000) * 40), 72);
          onProgress({
            type: "progress",
            progress,
            phase: "Reducing unnecessary indirection...",
            log: info.log,
            logType: info.logType,
          });
        },
      });
      onProgress({ type: "progress", phase: "Indirection analysis complete", progress: 74 });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      onProgress({
        type: "log",
        log: `Indirection analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        logType: "status",
      });
      onProgress({ type: "progress", phase: "Indirection analysis failed", progress: 74 });
    }

    // Step 4: Git commit
    onProgress({ type: "progress", phase: "Committing changes...", progress: 76 });
    try {
      const gitResult = await runProcess({
        command: 'git add -A && git diff --cached --quiet || git commit -m "Repo cleanup by Gadget App"',
        cwd: repoPath,
        signal,
        onStdout: (data) => {
          onProgress({ type: "log", log: data, logType: "status" });
        },
        onStderr: (data) => {
          onProgress({ type: "log", log: data, logType: "status" });
        },
      });
      if (gitResult.exitCode === 0) {
        onProgress({ type: "progress", phase: "Changes committed", progress: 95 });
      } else {
        onProgress({ type: "progress", phase: "No changes to commit", progress: 95 });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      onProgress({
        type: "log",
        log: `Git error: ${err instanceof Error ? err.message : "Unknown"}`,
        logType: "status",
      });
      onProgress({ type: "progress", phase: "Git error", progress: 95 });
    }

    return { result: { removedCount } };
  };
}

function buildIndirectionPrompt(repoPath: string): string {
  return `You are a senior software engineer reviewing the project at ${repoPath} with the goal of reducing unnecessary indirection caused by legacy URL paths, redirects, re-exports, and compatibility layers.

Your focus is to identify places where the codebase maintains obsolete paths or indirection purely to avoid updating downstream imports or references — and determine whether those layers should be preserved, simplified, or removed.

Optimize for long-term clarity and maintainability, not short-term convenience.

### Focus Areas

#### 1. Legacy URL Paths & Redirects
- Identify routes, endpoints, or pages that exist only to redirect to newer paths.
- Evaluate whether these redirects are still needed:
  - Are they referenced externally?
  - Are they supporting backwards compatibility for users or clients?
- Recommend removal or consolidation when redirects are internal-only or no longer necessary.

#### 2. Re-exports & Barrel Files
- Identify files whose sole purpose is to re-export symbols from other modules.
- Detect deep or multi-hop re-export chains that obscure where logic actually lives.
- Evaluate whether re-exports:
  - Improve discoverability and API clarity, or
  - Exist only to avoid updating imports elsewhere.

#### 3. Compatibility Layers
- Find adapter files, alias modules, or wrapper functions that forward calls unchanged.
- Determine if they provide real abstraction or just historical inertia.
- Flag cases where updating call sites would be clearer and safer.

#### 4. Import & Path Strategy
- Identify inconsistent import paths for the same concepts.
- Evaluate the cost/benefit of normalizing imports vs preserving compatibility.
- Prefer a single "source of truth" for core concepts.

### Decision Guidelines
For each finding, decide explicitly:
- KEEP — indirection is justified and documented
- SIMPLIFY — reduce hops or collapse layers
- REMOVE — update call sites and delete compatibility code
- DEFER — change is too risky without broader context

Avoid mass churn. Only recommend updating imports or paths when the clarity and maintenance benefits clearly outweigh the cost.

### Instructions
1. Explore the project structure to understand routing, module boundaries, and import patterns.
2. Identify the highest-impact sources of unnecessary indirection.
3. Make safe, minimal changes where removal or simplification is clearly beneficial.
4. Do not introduce new aliasing, redirects, or re-export layers.
5. Preserve existing conventions unless they are the source of confusion.
6. If external consumers may rely on a path, treat it as a public API.

### Output
Provide a concise summary including:
- Indirection identified (routes, redirects, re-exports, adapters)
- Action taken (kept, simplified, removed, deferred)
- Rationale for each decision
- Any recommended follow-up work

The goal is to make paths and imports tell the truth about where things live.`;
}
