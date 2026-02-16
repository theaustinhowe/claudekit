import path from "node:path";
import { createDesignMessage, getGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { runClaude } from "@/lib/services/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";
import { applyTaskMutations, parseTaskMutations } from "@/lib/services/task-mutation-parser";
import { expandTilde } from "@/lib/utils";

const STATUS_ICON: Record<string, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  failed: "[!]",
  skipped: "[-]",
};

export function createChatRunner(metadata: Record<string, unknown>, contextId?: string): SessionRunner {
  const userMessage = metadata.message as string;
  const upgradeMode = metadata.upgradeMode === true;

  return async ({ onProgress, signal, sessionId }) => {
    const projectId = contextId as string;
    const project = await getGeneratorProject(projectId);
    if (!project) throw new Error("Project not found");

    const projectDir = path.join(expandTilde(project.project_path), project.project_name);

    // Build design context
    let designContext = "";
    const designParts: string[] = [];

    if (project.design_vibes?.length > 0) {
      designParts.push(`Design vibes: ${project.design_vibes.join(", ")}`);
    }
    if (project.color_scheme?.primary || project.color_scheme?.accent) {
      const colors = [];
      if (project.color_scheme.primary) colors.push(`primary: ${project.color_scheme.primary}`);
      if (project.color_scheme.accent) colors.push(`accent: ${project.color_scheme.accent}`);
      designParts.push(`Color scheme: ${colors.join(", ")}`);
    }
    if (project.inspiration_urls?.length > 0) {
      designParts.push(`Inspiration: ${project.inspiration_urls.join(", ")}`);
    }

    if (designParts.length > 0) {
      designContext = `[Project design context: ${designParts.join(". ")}]\n\n`;
    }

    // Build upgrade context if in upgrade mode
    let upgradeContext = "";
    if (upgradeMode) {
      const tasks = await getUpgradeTasks(projectId);
      if (tasks.length > 0) {
        const taskLines = tasks.map(
          (t) => `${STATUS_ICON[t.status] || "[ ]"} ${t.title} (id: ${t.id}) — ${t.description || "No description"}`,
        );
        upgradeContext =
          "## Upgrade Tasks\n" +
          taskLines.join("\n") +
          "\n\n" +
          "You can modify pending/failed tasks by appending a task_mutations block at the very end of your response:\n" +
          '<!-- task_mutations: {"updates":[{"id":"task-id","title":"new title","description":"new desc"}],"additions":[{"title":"New Task","description":"desc","after_id":"task-id"}],"removals":["task-id"]} -->\n' +
          "Only pending or failed tasks can be removed or updated. Completed tasks cannot be changed.\n\n";
      }
    }

    // Save user message
    await createDesignMessage({
      project_id: projectId,
      role: "user",
      content: userMessage,
    });

    let fullContent = "";
    const collectedLogs: { log: string; logType: string }[] = [];

    const result = await runClaude({
      cwd: projectDir,
      prompt:
        designContext +
        upgradeContext +
        userMessage +
        '\n\nAfter completing the requested changes, end your response with exactly 3 follow-up suggestion options the user might want to try next, formatted as: <!-- suggestions: ["suggestion 1", "suggestion 2", "suggestion 3"] -->',
      allowedTools: "Write,Edit,Bash,Read,Glob,Grep,WebFetch",
      disallowedTools: "",
      timeoutMs: 10 * 60_000,
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        onProgress({
          type: "progress",
          message: info.message,
          log: info.log,
          logType: info.logType,
          data: info.chunk ? { text: info.chunk } : undefined,
        });
        if (info.log) {
          collectedLogs.push({ log: info.log, logType: info.logType || "info" });
        }
        if (info.chunk) {
          fullContent += info.chunk;
        }
      },
    });

    // Parse suggestions from response (dotAll so [\s\S]*? spans newlines)
    const suggestionsMatch = fullContent.match(/<!-- suggestions: (\[[\s\S]*?\]) -->/);
    let suggestions: string[] | null = null;
    if (suggestionsMatch) {
      try {
        suggestions = JSON.parse(suggestionsMatch[1]);
        fullContent = fullContent.replace(/\s*<!-- suggestions: \[[\s\S]*?\] -->/, "");
      } catch {
        // Ignore malformed suggestions
      }
    }

    // Parse and apply task mutations if in upgrade mode
    let taskMutationsApplied = false;
    if (upgradeMode) {
      const { cleanContent, mutations } = parseTaskMutations(fullContent);
      if (mutations) {
        fullContent = cleanContent;
        await applyTaskMutations(projectId, mutations);
        taskMutationsApplied = true;
      }
    }

    // Save assistant message
    await createDesignMessage({
      project_id: projectId,
      role: "assistant",
      content: fullContent || result.stdout,
      model_used: "claude-code",
      progress_logs: collectedLogs.length > 0 ? collectedLogs : null,
      suggestions,
    });

    return {
      result: {
        suggestions,
        content: fullContent || result.stdout,
        taskMutationsApplied,
      },
    };
  };
}
