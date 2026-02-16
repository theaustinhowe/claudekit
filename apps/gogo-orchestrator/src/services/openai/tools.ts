/**
 * Tool definitions and executors for OpenAI Codex agent
 */

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentSignal } from "../agents/types.js";
import type { OpenAITool } from "./types.js";

const execAsync = promisify(exec);

/**
 * Shell command execution tool
 */
export const shellTool: OpenAITool = {
  type: "function",
  function: {
    name: "shell",
    description:
      "Execute a shell command in the working directory. Use this to run build commands, tests, git operations, etc.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
};

/**
 * File read tool
 */
export const readFileTool: OpenAITool = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read the contents of a file. Path is relative to the working directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read (relative to working directory)",
        },
      },
      required: ["path"],
    },
  },
};

/**
 * File write tool
 */
export const writeFileTool: OpenAITool = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Path is relative to working directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write (relative to working directory)",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
};

/**
 * List directory tool
 */
export const listDirectoryTool: OpenAITool = {
  type: "function",
  function: {
    name: "list_directory",
    description:
      "List the contents of a directory. Path is relative to working directory. Returns file names with indicators for directories.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to list (relative to working directory). Use '.' for current directory.",
        },
      },
      required: ["path"],
    },
  },
};

/**
 * Signal ready to create PR tool
 */
export const signalReadyToPrTool: OpenAITool = {
  type: "function",
  function: {
    name: "signal_ready_to_pr",
    description:
      "Signal that your work is complete and ready for a pull request to be created. Call this only when all changes are committed and tests pass.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

/**
 * Signal needs information tool
 */
export const signalNeedsInfoTool: OpenAITool = {
  type: "function",
  function: {
    name: "signal_needs_info",
    description:
      "Signal that you are blocked and need information from the user. This will pause execution and post your question to the GitHub issue.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user. Be specific about what information you need.",
        },
      },
      required: ["question"],
    },
  },
};

/**
 * Get all tools as an array
 */
export function getAllTools(): OpenAITool[] {
  return [shellTool, readFileTool, writeFileTool, listDirectoryTool, signalReadyToPrTool, signalNeedsInfoTool];
}

/**
 * Tool execution context
 */
export interface ToolContext {
  cwd: string;
  jobId: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  result: string;
  signal?: AgentSignal;
}

/**
 * Execute a shell command
 */
async function executeShell(command: string, cwd: string): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    let result = "";
    if (stdout) result += stdout;
    if (stderr) result += `\nSTDERR:\n${stderr}`;
    return { result: result || "(no output)" };
  } catch (error) {
    const err = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    let result = `Command failed with exit code ${err.code ?? "unknown"}`;
    if (err.stdout) result += `\nSTDOUT:\n${err.stdout}`;
    if (err.stderr) result += `\nSTDERR:\n${err.stderr}`;
    if (err.message && !err.stdout && !err.stderr) result += `\n${err.message}`;
    return { result };
  }
}

/**
 * Read a file
 */
async function readFile(filePath: string, cwd: string): Promise<ToolResult> {
  try {
    const fullPath = path.resolve(cwd, filePath);

    // Security check: ensure path is within cwd
    if (!fullPath.startsWith(path.resolve(cwd))) {
      return {
        result: "Error: Cannot read files outside the working directory",
      };
    }

    const content = await fs.readFile(fullPath, "utf-8");
    return { result: content };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "ENOENT") {
      return { result: `Error: File not found: ${filePath}` };
    }
    return { result: `Error reading file: ${err.message}` };
  }
}

/**
 * Write a file
 */
async function writeFile(filePath: string, content: string, cwd: string): Promise<ToolResult> {
  try {
    const fullPath = path.resolve(cwd, filePath);

    // Security check: ensure path is within cwd
    if (!fullPath.startsWith(path.resolve(cwd))) {
      return {
        result: "Error: Cannot write files outside the working directory",
      };
    }

    // Create directory if needed
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, "utf-8");
    return {
      result: `Successfully wrote ${content.length} bytes to ${filePath}`,
    };
  } catch (error) {
    const err = error as Error;
    return { result: `Error writing file: ${err.message}` };
  }
}

/**
 * List a directory
 */
async function listDirectory(dirPath: string, cwd: string): Promise<ToolResult> {
  try {
    const fullPath = path.resolve(cwd, dirPath);

    // Security check: ensure path is within cwd
    if (!fullPath.startsWith(path.resolve(cwd))) {
      return {
        result: "Error: Cannot list directories outside the working directory",
      };
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const lines = entries.map((entry) => {
      if (entry.isDirectory()) {
        return `${entry.name}/`;
      }
      return entry.name;
    });

    return { result: lines.join("\n") || "(empty directory)" };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "ENOENT") {
      return { result: `Error: Directory not found: ${dirPath}` };
    }
    return { result: `Error listing directory: ${err.message}` };
  }
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "shell":
      return executeShell(args.command as string, context.cwd);

    case "read_file":
      return readFile(args.path as string, context.cwd);

    case "write_file":
      return writeFile(args.path as string, args.content as string, context.cwd);

    case "list_directory":
      return listDirectory(args.path as string, context.cwd);

    case "signal_ready_to_pr":
      return { result: "OK", signal: { type: "ready_to_pr" } };

    case "signal_needs_info":
      return {
        result: "OK",
        signal: { type: "needs_info", question: args.question as string },
      };

    default:
      return { result: `Unknown tool: ${name}` };
  }
}
