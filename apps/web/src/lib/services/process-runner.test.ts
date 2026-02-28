import { EventEmitter } from "node:events";
import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runCommand } from "./process-runner";

const mockSpawn = vi.mocked(spawn);

function createMockChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 12345;
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks;
}

function parseSSE(raw: string): Array<{ type: string; data?: string; exitCode?: number }> {
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^data: (.+)$/);
      return match ? JSON.parse(match[1]) : null;
    })
    .filter(Boolean);
}

describe("runCommand", () => {
  it("returns a ReadableStream", () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(cast(child));

    const stream = runCommand("echo hello");

    expect(stream).toBeInstanceOf(ReadableStream);
    // Emit close to finish the stream
    child.emit("close", 0);
  });

  it("forwards stdout as SSE output events", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(cast(child));

    const stream = runCommand("echo hello");

    // Emit data then close
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("hello world\n"));
      child.emit("close", 0);
    });

    const chunks = await readStream(stream);
    const events = chunks.flatMap(parseSSE);

    expect(events).toContainEqual({ type: "output", data: "hello world\n" });
    expect(events).toContainEqual({ type: "done", exitCode: 0 });
  });

  it("forwards stderr as SSE output events", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(cast(child));

    const stream = runCommand("failing-cmd");

    queueMicrotask(() => {
      child.stderr.emit("data", Buffer.from("error msg\n"));
      child.emit("close", 1);
    });

    const chunks = await readStream(stream);
    const events = chunks.flatMap(parseSSE);

    expect(events).toContainEqual({ type: "output", data: "error msg\n" });
    expect(events).toContainEqual({ type: "done", exitCode: 1 });
  });

  it("sends error event on spawn error", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(cast(child));

    const stream = runCommand("bad-cmd");

    queueMicrotask(() => {
      child.emit("error", new Error("spawn ENOENT"));
    });

    const chunks = await readStream(stream);
    const events = chunks.flatMap(parseSSE);

    expect(events).toContainEqual({ type: "error", data: "spawn ENOENT" });
  });

  it("spawns bash with correct arguments", () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(cast(child));

    runCommand("npm install -g something");

    expect(mockSpawn).toHaveBeenCalledWith(
      "bash",
      ["-l", "-c", "npm install -g something"],
      expect.objectContaining({
        env: expect.objectContaining({ FORCE_COLOR: "0" }),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );

    child.emit("close", 0);
  });
});
