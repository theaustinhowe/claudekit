import path from "node:path";
import { runClaude } from "@devkit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks, updateUpgradeTask } from "@/lib/actions/upgrade-tasks";
import { safeGitCommit } from "@/lib/services/git-utils";
import { buildEnvSetupPrompt, buildImplementationPrompt, buildUpgradeTaskPrompt } from "@/lib/services/scaffold-prompt";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";
import { expandTilde, nowTimestamp } from "@/lib/utils";

export function createUpgradeRunner(metadata: Record<string, unknown>, contextId?: string): SessionRunner {
  const singleTaskId = metadata.taskId as string | undefined;

  return async ({ onProgress, signal, sessionId }) => {
    const projectId = contextId as string;
    const project = await getGeneratorProject(projectId);
    if (!project) throw new Error("Project not found");

    if (project.status !== "upgrading") {
      throw new Error(`Cannot execute: project status is "${project.status}"`);
    }

    const implPrompt = project.implementation_prompt || buildImplementationPrompt(project);
    const projectDir = path.join(expandTilde(project.project_path), project.project_name);
    const tasks = await getUpgradeTasks(projectId);

    const singleTaskMode = !!singleTaskId;
    let pendingTasks: typeof tasks;

    if (singleTaskMode) {
      const targetTask = tasks.find((t) => t.id === singleTaskId);
      if (!targetTask) throw new Error("Task not found");
      if (targetTask.status !== "pending" && targetTask.status !== "failed") {
        throw new Error(`Task is already ${targetTask.status}`);
      }
      pendingTasks = [targetTask];
    } else {
      pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "failed");
    }

    if (pendingTasks.length === 0) throw new Error("No pending tasks to execute");

    let completedCount = 0;
    let failedCount = 0;

    for (const task of pendingTasks) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const startedAt = nowTimestamp();
      await updateUpgradeTask(task.id, { status: "in_progress", started_at: startedAt });

      onProgress({
        type: "progress",
        phase: task.title,
        data: { taskId: task.id, taskTitle: task.title, taskStatus: "in_progress" },
      });

      try {
        const isEnvSetup = task.step_type === "env_setup";
        const isValidate = task.step_type === "validate";

        let taskPrompt: string;
        let allowedTools: string;
        let disallowedTools: string;

        if (isEnvSetup) {
          taskPrompt = buildEnvSetupPrompt(projectDir, project.services);
          allowedTools = "Read,Glob,Grep";
          disallowedTools = "Write,Edit,Bash";
        } else if (isValidate) {
          taskPrompt = buildUpgradeTaskPrompt(task.title, task.description, implPrompt, projectDir);
          allowedTools = "Read,Glob,Grep";
          disallowedTools = "Write,Edit,Bash";
        } else {
          taskPrompt = buildUpgradeTaskPrompt(task.title, task.description, implPrompt, projectDir);
          allowedTools = "Write,Edit,Bash,Read,Glob,Grep";
          disallowedTools = "";
        }

        let claudeOutput = "";

        const result = await runClaude({
          cwd: projectDir,
          prompt: taskPrompt,
          allowedTools,
          disallowedTools,
          signal,
          onPid: (pid) => setSessionPid(sessionId, pid),
          onProgress: (info) => {
            if (info.chunk) claudeOutput += info.chunk;
            onProgress({
              type: "progress",
              message: info.message,
              log: info.log,
              logType: info.logType,
              data: { taskId: task.id },
            });
          },
          timeoutMs: 20 * 60_000,
        });

        if (!claudeOutput && result.stdout) claudeOutput = result.stdout;

        if (result.exitCode === 0) {
          await updateUpgradeTask(task.id, {
            status: "completed",
            claude_output: claudeOutput.slice(0, 50_000),
            completed_at: nowTimestamp(),
          });
          completedCount++;
          onProgress({
            type: "progress",
            data: { taskId: task.id, taskTitle: task.title, taskStatus: "completed" },
          });

          const commitResult = safeGitCommit(projectDir, `Upgrade: ${task.title}`);
          if (commitResult.committed) {
            onProgress({ type: "log", log: `Changes committed: ${task.title}`, logType: "status" });
          } else if (commitResult.error) {
            onProgress({ type: "log", log: `Git commit warning: ${commitResult.error}`, logType: "status" });
          }

          // For env_setup tasks, parse env var JSON
          if (isEnvSetup) {
            const envJsonMatch = claudeOutput.match(/\[[\s\S]*\]/);
            if (envJsonMatch) {
              try {
                const envVars = JSON.parse(envJsonMatch[0]);
                onProgress({
                  type: "progress",
                  data: { taskId: task.id, envSetup: true, variables: envVars },
                });
              } catch {
                // ignore parse errors
              }
            }
          }
        } else {
          await updateUpgradeTask(task.id, {
            status: "failed",
            claude_output: (claudeOutput || result.stderr).slice(0, 50_000),
            completed_at: nowTimestamp(),
          });
          failedCount++;
          onProgress({
            type: "log",
            log: `Task "${task.title}" failed: Claude exited with code ${result.exitCode}`,
            logType: "status",
            data: { taskId: task.id, taskTitle: task.title, taskStatus: "failed" },
          });
          // Stop on failure — user can retry the failed task before continuing
          break;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        await updateUpgradeTask(task.id, {
          status: "failed",
          claude_output: err instanceof Error ? err.message : "Task execution failed",
          completed_at: nowTimestamp(),
        });
        failedCount++;
        onProgress({
          type: "log",
          log: `Task "${task.title}" error: ${err instanceof Error ? err.message : "Unknown"}`,
          logType: "status",
          data: { taskId: task.id, taskTitle: task.title, taskStatus: "failed" },
        });
        // Stop on failure — user can retry the failed task before continuing
        break;
      }

      // Check for cancellation between tasks
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    }

    // In single-task mode, skip git commit and status update
    if (!singleTaskMode) {
      const finalCommit = safeGitCommit(projectDir, "Upgrade: remaining changes");
      if (finalCommit.committed) {
        onProgress({ type: "log", log: "Final changes committed to git", logType: "status" });
      } else if (finalCommit.error) {
        onProgress({ type: "log", log: `Git warning: ${finalCommit.error}`, logType: "status" });
      }

      if (failedCount === 0) {
        await updateGeneratorProject(projectId, { status: "archived" });
      }
    }

    return { result: { completedCount, failedCount } };
  };
}
