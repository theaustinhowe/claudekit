import { getToolById } from "@/lib/constants/tools";
import { runProcess } from "@/lib/services/process-runner";
import type { SessionRunner } from "@/lib/services/session-manager";

export function createToolboxCommandRunner(metadata: Record<string, unknown>): SessionRunner {
  const toolId = metadata.toolId as string;
  const action = metadata.action as "install" | "update";

  const installMethod = metadata.installMethod as string | undefined;

  return async ({ onProgress, signal }) => {
    const tool = getToolById(toolId);
    if (!tool) throw new Error("Tool not found");

    let command: string | undefined;
    if (installMethod === "homebrew") {
      command = action === "update" ? `brew upgrade ${tool.binary}` : `brew install ${tool.binary}`;
    } else {
      command = action === "update" ? (tool.updateCommand ?? tool.installCommand) : tool.installCommand;
    }
    if (!command) throw new Error("No command available for this tool");

    onProgress({
      type: "log",
      log: `$ ${command}\n`,
      logType: "status",
      data: { command, toolId, action },
    });

    const result = await runProcess({
      command,
      signal,
      onStdout: (data) => {
        onProgress({ type: "log", log: data, logType: "status" });
      },
      onStderr: (data) => {
        onProgress({ type: "log", log: data, logType: "status" });
      },
    });

    return { result: { exitCode: result.exitCode, toolId, action } };
  };
}
