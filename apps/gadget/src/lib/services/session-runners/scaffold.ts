import fs from "node:fs";
import path from "node:path";
import { runClaude } from "@devkit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { buildInterfaceDesignSystem, writeInterfaceDesignFile, writeSkillFiles } from "@/lib/services/interface-design";
import { buildPrototypePrompt } from "@/lib/services/scaffold-prompt";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";
import { expandTilde } from "@/lib/utils";

export function createScaffoldRunner(metadata: Record<string, unknown>, contextId?: string): SessionRunner {
  const isRetry = metadata.retry === true;

  return async ({ onProgress, signal, sessionId }) => {
    const projectId = contextId as string;
    const project = await getGeneratorProject(projectId);
    if (!project) throw new Error("Project not found");

    let retryPrefix = "";
    if (isRetry) {
      if (project.status !== "scaffolding" && project.status !== "error") {
        throw new Error(`Cannot retry: project status is "${project.status}"`);
      }
      await updateGeneratorProject(projectId, { status: "scaffolding" });

      // Build retry context from existing scaffold_logs
      if (project.scaffold_logs && project.scaffold_logs.length > 0) {
        const lastLogs = project.scaffold_logs.slice(-30);
        const filesCreated = lastLogs
          .filter((e) => e.log?.match(/^Write\s{2}/))
          .map((e) => e.log?.replace(/^Write\s{2}/, ""))
          .filter(Boolean);
        const filesEdited = lastLogs
          .filter((e) => e.log?.match(/^Edit\s{2}/))
          .map((e) => e.log?.replace(/^Edit\s{2}/, ""))
          .filter(Boolean);
        const commands = lastLogs
          .filter((e) => e.log?.match(/^Bash\s{2}/))
          .map((e) => e.log?.replace(/^Bash\s{2}/, ""))
          .filter(Boolean);

        const parts: string[] = [];
        if (filesCreated.length > 0) parts.push(`Files created: ${filesCreated.join(", ")}`);
        if (filesEdited.length > 0) parts.push(`Files edited: ${filesEdited.join(", ")}`);
        if (commands.length > 0) parts.push(`Commands run: ${commands.slice(-5).join(", ")}`);

        const context = parts.join("\n");
        retryPrefix = context
          ? `IMPORTANT: This is a retry of a previous scaffolding attempt.\n\n## Previous Run Summary\n${context}\n\n## Instructions\n- Do NOT recreate files that already exist and are correct\n- Continue from where the previous run left off\n- If the previous run errored, fix the issue and proceed\n- Check the project directory for current state before making changes\n\n`
          : `IMPORTANT: This is a retry of a previous scaffolding attempt that may have partially completed. Check the project directory for any existing files and continue from where it left off. Do not recreate files that already exist and are correct. Fix any issues from the previous attempt.\n\n`;
      } else {
        retryPrefix = `IMPORTANT: This is a retry of a previous scaffolding attempt that may have partially completed. Check the project directory for any existing files and continue from where it left off. Do not recreate files that already exist and are correct. Fix any issues from the previous attempt.\n\n`;
      }
    } else {
      if (project.status !== "scaffolding") {
        throw new Error(`Project status is "${project.status}", expected "scaffolding"`);
      }
    }

    const basePrompt = buildPrototypePrompt(project);
    const prompt = isRetry ? `${retryPrefix}${basePrompt}` : basePrompt;

    const parentDir = expandTilde(project.project_path);
    const projectDir = path.join(parentDir, project.project_name);

    // Ensure directories exist
    fs.mkdirSync(projectDir, { recursive: true });

    // Write interface design system file and skill files
    const designContent = buildInterfaceDesignSystem(project);
    writeInterfaceDesignFile(projectDir, designContent);
    writeSkillFiles(projectDir);

    const collectedLogs: { log: string; logType: string }[] = [];

    const result = await runClaude({
      cwd: parentDir,
      prompt,
      allowedTools: "Write,Edit,Bash,Read,Glob,Grep,WebFetch",
      disallowedTools: "",
      timeoutMs: 15 * 60_000,
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        onProgress({
          type: "progress",
          message: info.message,
          log: info.log,
          logType: info.logType,
        });
        if (info.log) {
          collectedLogs.push({ log: info.log, logType: info.logType || "status" });
        }
      },
    });

    // Update project status based on result
    if (result.exitCode === 0) {
      await updateGeneratorProject(projectId, {
        status: "designing",
        scaffold_logs: collectedLogs.length > 0 ? collectedLogs : null,
      });
    } else {
      await updateGeneratorProject(projectId, {
        status: "error",
        scaffold_logs: collectedLogs.length > 0 ? collectedLogs : null,
      });
      throw new Error(`Claude exited with code ${result.exitCode}`);
    }

    return { result: { exitCode: result.exitCode } };
  };
}
