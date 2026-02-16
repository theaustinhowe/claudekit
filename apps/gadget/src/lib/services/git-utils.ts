import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function safeGitCommit(cwd: string, message: string): { committed: boolean; error?: string } {
  try {
    execFileSync("git", ["add", "-A"], { cwd, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", message], { cwd, stdio: "pipe" });
    return { committed: true };
  } catch (err) {
    const output = err instanceof Error ? (err as { stderr?: Buffer }).stderr?.toString() || err.message : "";
    if (output.includes("nothing to commit") || output.includes("nothing added to commit")) {
      return { committed: false };
    }
    return { committed: false, error: output.slice(0, 200) };
  }
}

export function sanitizeGitRef(ref: string): string {
  if (!/^[a-zA-Z0-9._\-/]+$/.test(ref)) {
    throw new Error(`Invalid git ref: ${ref}`);
  }
  return ref;
}

export function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function runShell(command: string, cwd: string): Promise<ShellResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn("bash", ["-l", "-c", command], {
        cwd,
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({ stdout: "", stderr: (err as Error).message, exitCode: 1 });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code });
    });
    child.on("error", (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

interface PushAndCreatePROptions {
  cwd: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
}

interface PushAndCreatePRResult {
  prUrl: string;
}

export async function pushBranchAndCreatePR(opts: PushAndCreatePROptions): Promise<PushAndCreatePRResult> {
  const safeBranch = sanitizeGitRef(opts.branch);

  // Push branch
  const pushResult = await runShell(`git push -u origin ${safeBranch}`, opts.cwd);
  if (pushResult.exitCode !== 0) {
    throw new Error(`Push failed: ${pushResult.stderr}. Branch ${opts.branch} still exists locally.`);
  }

  // Write body to temp file and create PR
  const bodyFile = path.join(os.tmpdir(), `gadget-pr-body-${Date.now()}.md`);
  fs.writeFileSync(bodyFile, opts.body, "utf-8");
  let prResult: ShellResult;
  try {
    prResult = await runShell(
      `gh pr create --title ${shellEscape(opts.title)} --body-file ${shellEscape(bodyFile)} --base ${sanitizeGitRef(opts.baseBranch)}`,
      opts.cwd,
    );
  } finally {
    fs.unlinkSync(bodyFile);
  }

  if (prResult.exitCode !== 0) {
    throw new Error(
      `PR creation failed: ${prResult.stderr}. Branch ${opts.branch} was pushed — you can create the PR manually.`,
    );
  }

  return { prUrl: prResult.stdout.trim() };
}
