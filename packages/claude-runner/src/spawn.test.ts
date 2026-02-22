import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { buildArgs, spawnClaude } from "./spawn";

const mockedSpawn = spawn as unknown as MockInstance;

/** Create a fake ChildProcess with controllable stdout/stderr/stdin streams. */
function createFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: MockInstance;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.pid = 99999;
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("buildArgs", () => {
  it("builds minimal args with just prompt", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hello" });
    expect(args).toEqual(["--output-format", "stream-json", "--verbose", "-p", "hello"]);
  });

  it("includes --session-id when provided", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", sessionId: "abc-123" });
    expect(args).toContain("--session-id");
    expect(args[args.indexOf("--session-id") + 1]).toBe("abc-123");
  });

  it("includes --resume when provided (takes precedence over sessionId)", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", resume: "sess-1", sessionId: "sess-2" });
    expect(args).toContain("--resume");
    expect(args).not.toContain("--session-id");
  });

  it("places --resume before -p", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "continue", resume: "sess-1" });
    const resumeIdx = args.indexOf("--resume");
    const promptIdx = args.indexOf("-p");
    expect(resumeIdx).toBeLessThan(promptIdx);
  });

  it("includes --max-turns when provided", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", maxTurns: 10 });
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("10");
  });

  it("includes --dangerously-skip-permissions when true", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", dangerouslySkipPermissions: true });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("does not include --dangerously-skip-permissions when false", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", dangerouslySkipPermissions: false });
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("includes tool filtering flags", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", allowedTools: "Write", disallowedTools: "Bash" });
    expect(args).toContain("--allowedTools");
    expect(args).toContain("--disallowedTools");
  });

  it("omits tool filtering flags when empty strings", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", allowedTools: "", disallowedTools: "" });
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--disallowedTools");
  });

  it("omits --verbose when verbose is false", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", verbose: false });
    expect(args).not.toContain("--verbose");
  });

  it("appends extra args", () => {
    const args = buildArgs({ cwd: "/tmp", prompt: "hi", extraArgs: ["--model", "opus"] });
    expect(args).toContain("--model");
    expect(args).toContain("opus");
    // Extra args come before prompt
    const modelIdx = args.indexOf("--model");
    const promptIdx = args.indexOf("-p");
    expect(modelIdx).toBeLessThan(promptIdx);
  });

  it("puts -p <prompt> last", () => {
    const args = buildArgs({
      cwd: "/tmp",
      prompt: "do something",
      sessionId: "s1",
      maxTurns: 5,
      dangerouslySkipPermissions: true,
    });
    const len = args.length;
    expect(args[len - 2]).toBe("-p");
    expect(args[len - 1]).toBe("do something");
  });
});

describe("spawnClaude", () => {
  it("spawns claude with correct args and cwd", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    spawnClaude({ cwd: "/my/repo", prompt: "analyze" });

    expect(mockedSpawn).toHaveBeenCalledWith(
      "claude",
      ["--output-format", "stream-json", "--verbose", "-p", "analyze"],
      expect.objectContaining({
        cwd: "/my/repo",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
  });

  it("merges extra env vars", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    spawnClaude({ cwd: "/tmp", prompt: "hi", env: { FORCE_COLOR: "0" } });

    const opts = mockedSpawn.mock.calls[0][2];
    expect(opts.env.FORCE_COLOR).toBe("0");
  });

  it("returns pid from child process", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    expect(proc.pid).toBe(99999);
  });

  it("closes stdin on spawn", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    spawnClaude({ cwd: "/tmp", prompt: "hi" });
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("delivers parsed events via onEvent", async () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const events: unknown[] = [];
    proc.onEvent((evt) => events.push(evt));

    child.stdout.emit("data", Buffer.from(`${JSON.stringify({ type: "system" })}\n`));

    expect(events).toEqual([{ type: "system" }]);
  });

  it("delivers raw lines via onRawLine", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const lines: string[] = [];
    proc.onRawLine((line) => lines.push(line));

    child.stdout.emit("data", Buffer.from("raw line 1\nraw line 2\n"));

    expect(lines).toEqual(["raw line 1", "raw line 2"]);
  });

  it("delivers raw lines for malformed JSON (no event emitted)", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const rawLines: string[] = [];
    const events: unknown[] = [];
    proc.onRawLine((line) => rawLines.push(line));
    proc.onEvent((evt) => events.push(evt));

    child.stdout.emit("data", Buffer.from("not json\n"));

    expect(rawLines).toEqual(["not json"]);
    expect(events).toEqual([]);
  });

  it("handles line buffering across chunks", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const lines: string[] = [];
    proc.onRawLine((line) => lines.push(line));

    // Send partial line
    child.stdout.emit("data", Buffer.from('{"type":'));
    expect(lines).toEqual([]);

    // Complete the line
    child.stdout.emit("data", Buffer.from('"system"}\n'));
    expect(lines).toEqual(['{"type":"system"}']);
  });

  it("forwards stderr via onStderr", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const stderrMsgs: string[] = [];
    proc.onStderr((data) => stderrMsgs.push(data));

    child.stderr.emit("data", Buffer.from("warning\n"));

    expect(stderrMsgs).toEqual(["warning\n"]);
  });

  it("resolves exited promise on close", async () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });

    child.emit("close", 0, null);

    const code = await proc.exited;
    expect(code).toBe(0);
  });

  it("calls onExit handler on close", async () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];
    proc.onExit((code, signal) => exits.push({ code, signal }));

    child.emit("close", 1, "SIGTERM");

    expect(exits).toEqual([{ code: 1, signal: "SIGTERM" }]);
  });

  it("flushes remaining buffer on close", async () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const events: unknown[] = [];
    proc.onEvent((evt) => events.push(evt));

    // Send data without trailing newline (stays in buffer)
    child.stdout.emit("data", Buffer.from(JSON.stringify({ type: "result" })));
    expect(events).toEqual([]);

    // Close flushes the buffer
    child.emit("close", 0, null);
    expect(events).toEqual([{ type: "result" }]);
  });

  it("wraps ENOENT error with helpful message", async () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const errors: Error[] = [];
    proc.onError((err) => errors.push(err));

    const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    child.emit("error", err);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Claude Code CLI not found");
  });

  it("forwards non-ENOENT errors as-is", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    const errors: Error[] = [];
    proc.onError((err) => errors.push(err));

    child.emit("error", new Error("EPERM"));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("EPERM");
  });

  it("kills child on abort signal", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);
    const ac = new AbortController();

    spawnClaude({ cwd: "/tmp", prompt: "hi", signal: ac.signal });

    ac.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("removes abort listener on close", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);
    const ac = new AbortController();

    spawnClaude({ cwd: "/tmp", prompt: "hi", signal: ac.signal });

    child.emit("close", 0, null);

    // Aborting after close should not kill
    ac.abort();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("kill() sends SIGTERM by default", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    proc.kill();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("kill() sends custom signal", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    proc.kill("SIGKILL");

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("exposes child process", () => {
    const child = createFakeChild();
    mockedSpawn.mockReturnValue(child);

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi" });
    expect(proc.child).toBe(child);
  });

  it("returns error proc when signal is already aborted", () => {
    const ac = new AbortController();
    ac.abort();

    const proc = spawnClaude({ cwd: "/tmp", prompt: "hi", signal: ac.signal });

    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(proc.pid).toBeUndefined();

    const errors: Error[] = [];
    proc.onError((err) => errors.push(err));

    // Error is delivered via callback
    expect(errors).toHaveLength(1);
    expect(errors[0].name).toBe("AbortError");
  });
});
