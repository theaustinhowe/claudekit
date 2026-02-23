import { execFileSync } from "node:child_process";

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
