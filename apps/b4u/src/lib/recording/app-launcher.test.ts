import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { stopDevServer } from "./app-launcher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stopDevServer", () => {
  it("kills the process group", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const child = { pid: 12345 } as import("node:child_process").ChildProcess;

    stopDevServer(child);

    expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
    killSpy.mockRestore();
  });

  it("does not throw when process already gone", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });
    const child = { pid: 99999 } as import("node:child_process").ChildProcess;

    expect(() => stopDevServer(child)).not.toThrow();
    killSpy.mockRestore();
  });

  it("does nothing when pid is undefined", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const child = { pid: undefined } as import("node:child_process").ChildProcess;

    stopDevServer(child);

    expect(killSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });
});
