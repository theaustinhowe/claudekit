import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// We use a stable createServer mock that we can configure per-test
const mockCreateServer = vi.fn();
const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("node:net", () => ({
  default: { createServer: mockCreateServer },
  createServer: mockCreateServer,
}));

const GLOBAL_KEY = "__inside_dev_servers__";

let devServerManager: typeof import("./dev-server-manager");

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];

  // Re-apply stable mocks after resetModules
  vi.doMock("node:child_process", () => ({
    spawn: mockSpawn,
  }));
  vi.doMock("node:net", () => ({
    default: { createServer: mockCreateServer },
    createServer: mockCreateServer,
  }));

  devServerManager = await import("./dev-server-manager");
});

function createMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.pid = 12345;
  proc.exitCode = null;
  proc.kill = vi.fn();
  return proc;
}

function setupPortMock() {
  const mockServer = new EventEmitter() as any;
  mockServer.listen = vi.fn().mockImplementation(function (this: any) {
    process.nextTick(() => this.emit("listening"));
  });
  mockServer.close = vi.fn().mockImplementation((cb: () => void) => cb());
  mockCreateServer.mockReturnValue(mockServer);
}

describe("getLogs", () => {
  it("returns empty array for unknown project", () => {
    expect(devServerManager.getLogs("nonexistent")).toEqual([]);
  });
});

describe("getStatus", () => {
  it("returns null for unknown project", () => {
    expect(devServerManager.getStatus("nonexistent")).toBeNull();
  });
});

describe("listAll", () => {
  it("returns empty array when no servers exist", () => {
    expect(devServerManager.listAll()).toEqual([]);
  });
});

describe("stopAll", () => {
  it("returns 0 when no servers exist", () => {
    expect(devServerManager.stopAll()).toBe(0);
  });
});

describe("onLog", () => {
  it("returns no-op unsubscribe for unknown project", () => {
    const unsub = devServerManager.onLog("nonexistent", vi.fn());
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });
});

describe("stop", () => {
  it("is a no-op for unknown project", () => {
    expect(() => devServerManager.stop("nonexistent")).not.toThrow();
  });
});

describe("start / stop lifecycle", () => {
  it("starts a server, captures logs, and populates getStatus", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));

    mockProcess.stdout.push("Ready on http://localhost:3456\n");
    const result = await startPromise;

    expect(result.port).toBe(3456);
    const status = devServerManager.getStatus("proj-1");
    expect(status).not.toBeNull();
    expect(status!.running).toBe(true);
    expect(status!.port).toBe(3456);
    expect(status!.pid).toBe(12345);
  });

  it("stop kills process and removes from map", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    devServerManager.stop("proj-1");
    expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(devServerManager.getStatus("proj-1")).toBeNull();
  });

  it("onLog callback receives lines and unsubscribes cleanly", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    const received: string[] = [];
    const unsub = devServerManager.onLog("proj-1", (line) => received.push(line));

    mockProcess.stdout.push("New log line\n");
    expect(received).toContain("New log line");

    unsub();
    mockProcess.stdout.push("After unsub\n");
    expect(received).not.toContain("After unsub");
  });

  it("listAll only includes starting/ready servers", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    const list = devServerManager.listAll();
    expect(list).toHaveLength(1);
    expect(list[0].projectId).toBe("proj-1");
    expect(list[0].port).toBe(3456);
  });

  it("stopAll stops all servers and returns count", async () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    proc2.pid = 67890;
    mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);
    setupPortMock();

    const p1 = devServerManager.start("proj-1", "/tmp/p1", "npm");
    await new Promise((r) => process.nextTick(r));
    proc1.stdout.push("http://localhost:3456\n");
    await p1;

    setupPortMock();
    const p2 = devServerManager.start("proj-2", "/tmp/p2", "npm");
    await new Promise((r) => process.nextTick(r));
    proc2.stdout.push("http://localhost:3457\n");
    await p2;

    const count = devServerManager.stopAll();
    expect(count).toBe(2);
    expect(devServerManager.listAll()).toHaveLength(0);
  });

  it("ring buffer caps logs at 500 lines", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));

    // Push 600 lines then the ready URL
    const lines = Array.from({ length: 600 }, (_, i) => `Line ${i}`);
    mockProcess.stdout.push(`${lines.join("\n")}\nhttp://localhost:3456\n`);
    await startPromise;

    const logs = devServerManager.getLogs("proj-1");
    expect(logs.length).toBeLessThanOrEqual(500);
    expect(logs).not.toContain("Line 0");
    expect(logs).toContain("Line 599");
  });

  it("getLogs returns captured log lines", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    mockProcess.stdout.push("line one\nline two\n");
    const logs = devServerManager.getLogs("proj-1");
    expect(logs).toContain("line one");
    expect(logs).toContain("line two");
  });

  it("uses correct args for bun package manager", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "bun");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    expect(mockSpawn).toHaveBeenCalledWith("bun", ["dev"], expect.any(Object));
  });

  it("uses 'run dev' args for npm package manager", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    expect(mockSpawn).toHaveBeenCalledWith("npm", ["run", "dev"], expect.any(Object));
  });
});
