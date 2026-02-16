import { execSync } from "node:child_process";
import path from "node:path";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { createUpgradeTasks, deleteUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { getDb } from "@/lib/db";
import { execute } from "@/lib/db/helpers";
import { runClaude } from "@/lib/services/claude-runner";
import { safeGitCommit } from "@/lib/services/git-utils";
import { buildImplementationPrompt, buildUpgradePlanPrompt } from "@/lib/services/scaffold-prompt";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setCleanupFn, setSessionPid } from "@/lib/services/session-manager";
import { expandTilde, generateId, nowTimestamp } from "@/lib/utils";

export function createUpgradeInitRunner(_metadata: Record<string, unknown>, contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const projectId = contextId as string;
    const project = await getGeneratorProject(projectId);
    if (!project) throw new Error("Project not found");

    if (project.status !== "designing" && project.status !== "scaffolding") {
      throw new Error(`Cannot upgrade: project status is "${project.status}"`);
    }

    const projectDir = path.join(expandTilde(project.project_path), project.project_name);

    // Register cleanup: reset status on cancel/error
    setCleanupFn(sessionId, async () => {
      try {
        await updateGeneratorProject(projectId, { status: "designing" });
      } catch {
        // ignore DB errors during rollback
      }
    });

    // 1. Set status to upgrading
    await updateGeneratorProject(projectId, { status: "upgrading" });
    onProgress({ type: "progress", phase: "Starting upgrade...", progress: 5 });

    // 2. Git init + initial commit
    onProgress({ type: "log", log: "Initializing git repository...", logType: "status" });
    try {
      execSync("git init", { cwd: projectDir, stdio: "pipe" });
    } catch {
      // git init failure is non-fatal if repo already exists
      onProgress({ type: "log", log: "Git repository may already exist, continuing...", logType: "status" });
    }
    const initCommit = safeGitCommit(projectDir, "Initial prototype");
    if (initCommit.committed) {
      onProgress({ type: "log", log: "Git repository initialized with initial commit", logType: "status" });
    } else if (initCommit.error) {
      onProgress({ type: "log", log: `Git setup warning: ${initCommit.error}`, logType: "status" });
    }

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 3. Create repo record
    onProgress({ type: "progress", phase: "Creating repository record...", progress: 15 });
    const repoId = generateId();
    const db = await getDb();
    await execute(
      db,
      `INSERT INTO repos (id, name, local_path, package_manager, repo_type, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'local', ?)
       ON CONFLICT(local_path) DO UPDATE SET name = excluded.name`,
      [repoId, project.project_name, projectDir, project.package_manager, project.platform, nowTimestamp()],
    );
    await updateGeneratorProject(projectId, { repo_id: repoId });
    onProgress({ type: "progress", data: { repoId }, progress: 20 });

    // 4. Lazy-generate the implementation prompt
    let implPrompt = project.implementation_prompt;
    if (!implPrompt) {
      implPrompt = buildImplementationPrompt(project);
      await updateGeneratorProject(projectId, { implementation_prompt: implPrompt });
    }

    // 5. Delete existing tasks + generate new breakdown
    onProgress({ type: "progress", phase: "Generating task breakdown with Claude...", progress: 25 });
    await deleteUpgradeTasks(projectId);

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress({ type: "progress", phase: "Analyzing project structure...", progress: 30 });

    const taskPrompt = buildUpgradePlanPrompt(implPrompt, projectDir);
    let claudeOutput = "";
    let claudeStarted = false;

    const result = await runClaude({
      cwd: projectDir,
      prompt: taskPrompt,
      allowedTools: "Read,Glob,Grep",
      disallowedTools: "Write,Edit,Bash",
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        if (info.chunk) {
          claudeOutput += info.chunk;
          if (!claudeStarted) {
            claudeStarted = true;
            onProgress({ type: "progress", phase: "Generating implementation plan...", progress: 50 });
          }
        }
        onProgress({ type: "log", log: info.log, logType: info.logType, message: info.message });
      },
      timeoutMs: 5 * 60_000,
    });

    if (!claudeOutput && result.stdout) claudeOutput = result.stdout;

    // Parse JSON array from Claude output
    const jsonMatch = claudeOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await updateGeneratorProject(projectId, { status: "designing" });
      throw new Error("Failed to parse task breakdown from Claude's response");
    }

    const rawTasks = JSON.parse(jsonMatch[0]) as { title: string; description?: string; step_type?: string }[];
    const tasks = await createUpgradeTasks(
      projectId,
      rawTasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        step_type: (t.step_type as "validate" | "implement" | "env_setup") || "implement",
      })),
    );

    onProgress({ type: "progress", progress: 90, data: { tasks, repoId } });

    return { result: { tasks, repoId } };
  };
}
