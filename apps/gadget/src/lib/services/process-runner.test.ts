import { EventEmitter } from "node:events";
import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runProcess } from "./process-runner";

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("process-runner", () => {
  describe("runProcess", () => {
    it("resolves with exit code on success", async () => {
      const child = createMockChild();
      vi.mocked(spawn).mockReturnValue(cast(child));

      const controller = new AbortController();
      const promise = runProcess({ command: "echo hello", signal: controller.signal });

      child.emit("close", 0);

      const result = await promise;
      expect(result.exitCode).toBe(0);
    });

    it("streams stdout and stderr to callbacks", async () => {
      const child = createMockChild();
      vi.mocked(spawn).mockReturnValue(cast(child));

      const stdout: string[] = [];
      const stderr: string[] = [];
      const controller = new AbortController();

      const promise = runProcess({
        command: "test",
        signal: controller.signal,
        onStdout: (data) => stdout.push(data),
        onStderr: (data) => stderr.push(data),
      });

      child.stdout.emit("data", Buffer.from("out line"));
      child.stderr.emit("data", Buffer.from("err line"));
      child.emit("close", 0);

      await promise;
      expect(stdout).toEqual(["out line"]);
      expect(stderr).toEqual(["err line"]);
    });

    it("rejects immediately when already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(runProcess({ command: "test", signal: controller.signal })).rejects.toThrow("Aborted");
    });

    it("rejects on spawn error", async () => {
      const child = createMockChild();
      vi.mocked(spawn).mockReturnValue(cast(child));

      const controller = new AbortController();
      const promise = runProcess({ command: "test", signal: controller.signal });

      child.emit("error", new Error("spawn failed"));

      await expect(promise).rejects.toThrow("spawn failed");
    });

    it("kills child process on abort", async () => {
      const child = createMockChild();
      vi.mocked(spawn).mockReturnValue(cast(child));

      const controller = new AbortController();
      const promise = runProcess({ command: "test", signal: controller.signal });

      controller.abort();
      child.emit("close", null);

      await expect(promise).rejects.toThrow("Aborted");
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });
});
