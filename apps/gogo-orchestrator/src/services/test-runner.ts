import { spawn } from "node:child_process";
import type { LogStream } from "@devkit/gogo-shared";
import { execute, parseJsonField, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbSetting } from "../db/schema.js";
import { sendLogToSubscribers } from "../ws/handler.js";

export interface TestResult {
  success: boolean;
  output: string;
  exitCode: number;
  commandsRun: string[];
}

interface LogState {
  sequence: number;
}

async function emitLog(
  jobId: string,
  stream: LogStream,
  content: string,
  state: LogState,
): Promise<void> {
  const sequence = state.sequence++;
  const conn = getConn();

  await execute(
    conn,
    "INSERT INTO job_logs (id, job_id, stream, content, sequence, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
    [jobId, stream, content, sequence, new Date().toISOString()],
  );

  sendLogToSubscribers(jobId, { stream, content, sequence });
}

async function getTestCommands(): Promise<string[]> {
  const conn = getConn();
  const setting = await queryOne<DbSetting>(
    conn,
    "SELECT * FROM settings WHERE key = ?",
    ["testCommands"],
  );

  if (!setting) {
    return ["npm test"];
  }

  const value = parseJsonField<string>(setting.value, "");
  if (typeof value !== "string") {
    return ["npm test"];
  }

  // Parse newline-separated commands
  return value
    .split("\n")
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0);
}

async function getMaxTestRetries(): Promise<number> {
  const conn = getConn();
  const setting = await queryOne<DbSetting>(
    conn,
    "SELECT * FROM settings WHERE key = ?",
    ["maxTestRetries"],
  );

  if (!setting) {
    return 3;
  }

  const value = parseJsonField<number>(setting.value, 3);
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 3;
  }

  return Math.max(1, Math.floor(value));
}

function runCommand(
  command: string,
  cwd: string,
): Promise<{ success: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const output: string[] = [];
    const [cmd, ...args] = command.split(/\s+/);

    // SECURITY: Use shell: false to prevent shell metacharacter injection.
    // Test commands come from DB settings; if an attacker can modify settings,
    // shell: true would allow arbitrary command chaining via ; && || etc.
    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        CI: "true",
        NODE_ENV: "test",
      },
    });

    child.stdout.on("data", (data: Buffer) => {
      output.push(data.toString());
    });

    child.stderr.on("data", (data: Buffer) => {
      output.push(data.toString());
    });

    child.on("error", (error) => {
      output.push(`Error: ${error.message}`);
      resolve({
        success: false,
        output: output.join(""),
        exitCode: 1,
      });
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: output.join(""),
        exitCode: code ?? 1,
      });
    });
  });
}

export async function runTests(
  jobId: string,
  worktreePath: string,
  logState: LogState,
  customTestCommand?: string | null,
): Promise<TestResult> {
  // Use custom test command if provided, otherwise fall back to global settings
  let testCommands: string[];
  if (customTestCommand !== undefined) {
    // If custom command is null or empty string, skip tests
    if (!customTestCommand || customTestCommand.trim() === "") {
      await emitLog(
        jobId,
        "system",
        "⏭️ No test command configured, skipping tests...",
        logState,
      );
      return {
        success: true,
        output: "Tests skipped - no test command configured",
        exitCode: 0,
        commandsRun: [],
      };
    }
    // Parse custom command (could be newline-separated)
    testCommands = customTestCommand
      .split("\n")
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0);
  } else {
    testCommands = await getTestCommands();
  }

  const commandsRun: string[] = [];
  const allOutput: string[] = [];
  let overallSuccess = true;

  await emitLog(jobId, "system", "🧪 Running tests...", logState);

  for (const command of testCommands) {
    await emitLog(jobId, "system", `$ ${command}`, logState);
    commandsRun.push(command);

    const result = await runCommand(command, worktreePath);
    allOutput.push(`$ ${command}\n${result.output}`);

    // Stream output to logs
    if (result.output.trim()) {
      const lines = result.output.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          await emitLog(
            jobId,
            result.success ? "stdout" : "stderr",
            line,
            logState,
          );
        }
      }
    }

    if (result.success) {
      await emitLog(jobId, "system", `✓ ${command} passed`, logState);
    } else {
      await emitLog(
        jobId,
        "stderr",
        `✗ ${command} failed (exit code: ${result.exitCode})`,
        logState,
      );
      overallSuccess = false;
      break; // Stop on first failure
    }
  }

  if (overallSuccess) {
    await emitLog(jobId, "system", "✓ All tests passed!", logState);
  } else {
    await emitLog(jobId, "stderr", "✗ Tests failed.", logState);
  }

  return {
    success: overallSuccess,
    output: allOutput.join("\n\n"),
    exitCode: overallSuccess ? 0 : 1,
    commandsRun,
  };
}

export { getTestCommands, getMaxTestRetries };
