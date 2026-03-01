import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// We use a stable createServer mock that we can configure per-test
const mockCreateServer = vi.fn();
const mockSpawn = vi.fn();

// Mock net.Socket for probePort tests — must be a real class so `new net.Socket()` works
const mockSocketConfig = { behavior: "connect" as "connect" | "timeout" | "error" };
class MockSocket extends EventEmitter {
  setTimeout = vi.fn();
  destroy = vi.fn();
  connect() {
    const behavior = mockSocketConfig.behavior;
    process.nextTick(() => {
      if (behavior === "connect") this.emit("connect");
      else if (behavior === "timeout") this.emit("timeout");
      else this.emit("error", new Error("ECONNREFUSED"));
    });
  }
}

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("node:net", () => ({
  default: {
    createServer: mockCreateServer,
    Socket: MockSocket,
  },
  createServer: mockCreateServer,
}));

const GLOBAL_KEY = "__inside_dev_servers__";

let devServerManager: typeof import("./dev-server-manager");

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];

  mockSocketConfig.behavior = "connect";

  // Re-apply stable mocks after resetModules
  vi.doMock("node:child_process", () => ({
    spawn: mockSpawn,
  }));
  vi.doMock("node:net", () => ({
    default: {
      createServer: mockCreateServer,
      Socket: MockSocket,
    },
    createServer: mockCreateServer,
  }));

  devServerManager = await import("./dev-server-manager");
});

function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    pid: number;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.pid = 12345;
  proc.exitCode = null;
  proc.kill = vi.fn();
  return proc;
}

function setupPortMock() {
  const mockServer = new EventEmitter() as EventEmitter & {
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  mockServer.listen = vi.fn().mockImplementation(function (this: EventEmitter) {
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

describe("isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(devServerManager.isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a non-existent PID", () => {
    expect(devServerManager.isProcessAlive(99999999)).toBe(false);
  });
});

describe("probePort", () => {
  it("returns true when socket connects", async () => {
    mockSocketConfig.behavior = "connect";
    const result = await devServerManager.probePort(3000);
    expect(result).toBe(true);
  });

  it("returns false on timeout", async () => {
    mockSocketConfig.behavior = "timeout";
    const result = await devServerManager.probePort(3000);
    expect(result).toBe(false);
  });

  it("returns false on error", async () => {
    mockSocketConfig.behavior = "error";
    const result = await devServerManager.probePort(3000);
    expect(result).toBe(false);
  });
});

describe("adopt", () => {
  it("creates entry visible via getStatus with correct port and pid", () => {
    devServerManager.adopt("proj-adopt", 3456, 11111);

    const status = devServerManager.getStatus("proj-adopt");
    expect(status).not.toBeNull();
    expect(status?.running).toBe(true);
    expect(status?.port).toBe(3456);
    expect(status?.pid).toBe(11111);
  });

  it("does not overwrite an existing active server", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:3456\n");
    await startPromise;

    // Attempt to adopt over existing server — should be ignored
    devServerManager.adopt("proj-1", 9999, 99999);

    const status = devServerManager.getStatus("proj-1");
    expect(status?.port).toBe(3456);
    expect(status?.pid).toBe(12345);
  });

  it("appears in listAll", () => {
    devServerManager.adopt("proj-adopt", 3456, 11111);

    const list = devServerManager.listAll();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ projectId: "proj-adopt", port: 3456, pid: 11111 });
  });

  it("logs contain adopted message", () => {
    devServerManager.adopt("proj-adopt", 3456, 11111);

    const logs = devServerManager.getLogs("proj-adopt");
    expect(logs.some((l) => l.includes("[adopted]"))).toBe(true);
  });
});

describe("stop (adopted server)", () => {
  it("kills via process.kill for adopted server", () => {
    devServerManager.adopt("proj-adopt", 3456, process.pid);

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    devServerManager.stop("proj-adopt");

    expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
    expect(devServerManager.getStatus("proj-adopt")).toBeNull();
    killSpy.mockRestore();
  });

  it("handles already-dead PID gracefully", () => {
    devServerManager.adopt("proj-adopt", 3456, 99999999);

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });
    expect(() => devServerManager.stop("proj-adopt")).not.toThrow();
    expect(devServerManager.getStatus("proj-adopt")).toBeNull();
    killSpy.mockRestore();
  });
});

describe("start sanitizes pnpm/npm env vars", () => {
  it("strips all pnpm/npm workspace vars from spawned process env", async () => {
    process.env.npm_config_globalconfig = "/some/path";
    process.env.npm_config_recursive = "true";
    process.env.npm_package_name = "my-package";
    process.env.npm_lifecycle_event = "dev";
    process.env.pnpm_config_verify_deps_before_run = "install";
    process.env.npm_command = "run-script";
    process.env.npm_execpath = "/usr/local/bin/pnpm";
    process.env.npm_node_execpath = "/usr/local/bin/node";

    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-env", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:2550\n");
    await startPromise;

    const spawnEnv = mockSpawn.mock.calls[0][2].env;

    expect(spawnEnv.npm_config_globalconfig).toBeUndefined();
    expect(spawnEnv.npm_config_recursive).toBeUndefined();
    expect(spawnEnv.npm_package_name).toBeUndefined();
    expect(spawnEnv.npm_lifecycle_event).toBeUndefined();
    expect(spawnEnv.pnpm_config_verify_deps_before_run).toBeUndefined();
    expect(spawnEnv.npm_command).toBeUndefined();
    expect(spawnEnv.npm_execpath).toBeUndefined();
    expect(spawnEnv.npm_node_execpath).toBeUndefined();

    // Clean up
    delete process.env.npm_config_globalconfig;
    delete process.env.npm_config_recursive;
    delete process.env.npm_package_name;
    delete process.env.npm_lifecycle_event;
    delete process.env.pnpm_config_verify_deps_before_run;
    delete process.env.npm_command;
    delete process.env.npm_execpath;
    delete process.env.npm_node_execpath;
  });

  it("preserves PATH/HOME and applies extraEnv", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-env", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:2550\n");
    await startPromise;

    const spawnEnv = mockSpawn.mock.calls[0][2].env;

    expect(spawnEnv.PATH).toBe(process.env.PATH);
    expect(spawnEnv.HOME).toBe(process.env.HOME);
    expect(spawnEnv.PORT).toBeDefined();
    expect(spawnEnv.BROWSER).toBe("none");
  });

  it("does not mutate process.env", async () => {
    process.env.npm_config_test_var = "should-stay";

    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-env", "/tmp/proj", "npm");
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:2550\n");
    await startPromise;

    expect(process.env.npm_config_test_var).toBe("should-stay");
    delete process.env.npm_config_test_var;
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
    if (!status) throw new Error("status is null");
    expect(status.running).toBe(true);
    expect(status.port).toBe(3456);
    expect(status.pid).toBe(12345);
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

  it("passes preferredPort to findAvailablePort", async () => {
    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);
    setupPortMock();

    const startPromise = devServerManager.start("proj-1", "/tmp/proj", "npm", undefined, 4000);
    await new Promise((r) => process.nextTick(r));
    mockProcess.stdout.push("http://localhost:4000\n");
    await startPromise;

    // The first createServer call should be for the preferred port 4000
    expect(mockCreateServer).toHaveBeenCalled();
    const firstListenCall = mockCreateServer.mock.results[0].value.listen.mock.calls[0];
    expect(firstListenCall[0]).toBe(4000);
  });
});
