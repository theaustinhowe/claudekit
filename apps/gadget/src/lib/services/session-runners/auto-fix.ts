import { runClaude } from "@claudekit/claude-runner";
import { saveAutoFixRun, updateAutoFixRun } from "@/lib/actions/auto-fix";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createAutoFixRunner(metadata: Record<string, unknown>): SessionRunner {
  const errorMessage = metadata.errorMessage as string;
  const errorSignature = metadata.errorSignature as string;
  const attemptNumber = (metadata.attemptNumber as number) ?? 1;
  const projectDir = metadata.projectDir as string;
  const contextLines = (metadata.contextLines as number) ?? 50;

  return async ({ onProgress, signal, sessionId }) => {
    const logs: Array<{ log: string; logType: string }> = [];

    // Save auto fix run record
    const runId = await saveAutoFixRun({
      projectId: metadata.projectId as string,
      status: "running",
      errorSignature,
      errorMessage,
      attemptNumber,
      logs: [],
    });

    onProgress({ type: "progress", phase: "Analyzing error...", data: { runId } });

    // Build prompt with context
    const { getLogs } = await import("@/lib/services/dev-server-manager");
    const recentLogs = getLogs(metadata.projectId as string).slice(-contextLines);

    const prompt = `The dev server has a compilation/runtime error. Fix it minimally — only change what's needed to resolve the error.

ERROR:
${errorMessage}

RECENT DEV SERVER OUTPUT (last ${contextLines} lines):
${recentLogs.join("\n")}

Instructions:
- Read the relevant source files to understand the issue
- Make the minimal fix needed
- Do NOT refactor or change unrelated code
- Do NOT add comments explaining the fix
- The dev server has hot-reload, so just edit the files and it will pick up changes`;

    try {
      const result = await runClaude({
        cwd: projectDir,
        prompt,
        allowedTools: "Write,Edit,Read,Glob,Grep",
        disallowedTools: "Bash",
        timeoutMs: 3 * 60_000,
        signal,
        onPid: (pid) => setSessionPid(sessionId, pid),
        onProgress: (info) => {
          if (info.log) {
            const logEntry = { log: info.log, logType: info.logType ?? "status" };
            logs.push(logEntry);
            onProgress({
              type: "log",
              log: info.log,
              logType: info.logType,
              message: info.message,
            });
          } else if (info.message) {
            onProgress({ type: "progress", message: info.message });
          }
        },
      });

      const success = result.exitCode === 0;
      await updateAutoFixRun(runId, {
        status: success ? "success" : "failed",
        claudeOutput: result.stdout,
        logs,
      });

      if (!success) {
        throw new Error(`Claude exited with code ${result.exitCode}`);
      }

      return { result: { runId, status: "success" } };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await updateAutoFixRun(runId, { status: "cancelled", logs });
        throw err;
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      await updateAutoFixRun(runId, { status: "failed", claudeOutput: msg, logs });
      throw err;
    }
  };
}
