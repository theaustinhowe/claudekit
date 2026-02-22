import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/logger", () => ({
  getLogFilePath: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
  statSync: vi.fn(() => ({ size: 0 })),
}));

vi.mock("node:fs/promises", () => ({
  open: vi.fn(),
}));

vi.mock("node:readline", () => ({
  createInterface: vi.fn(),
}));

import { existsSync, statSync, watch } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";
import { getLogFilePath } from "@claudekit/logger";
import { GET } from "./route";

const mockGetLogFilePath = vi.mocked(getLogFilePath);
const mockExistsSync = vi.mocked(existsSync);
const mockOpen = vi.mocked(open);
const mockCreateInterface = vi.mocked(createInterface);
const mockWatch = vi.mocked(watch);
const mockStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetLogFilePath.mockReturnValue("/logs/gadget.2026-02-15.ndjson");
});

function buildRequest(appName: string, searchParams: Record<string, string> = {}) {
  const url = new URL(`http://localhost:2000/api/logs/${appName}/stream`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const req = new Request(url.toString());
  const params = Promise.resolve({ app: appName });
  return { req, params };
}

async function* asyncIter(lines: string[]) {
  for (const line of lines) {
    yield line;
  }
}

function setupFileMocks(logLines: string[]) {
  const mockFileHandle = {
    createReadStream: vi.fn(() => ({})),
    close: vi.fn(),
  };
  mockOpen.mockResolvedValue(mockFileHandle as never);
  mockCreateInterface.mockReturnValue(asyncIter(logLines) as never);
  return mockFileHandle;
}

async function drainAvailableChunks(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  const readWithTimeout = () =>
    Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 50),
      ),
    ]);

  let result = await readWithTimeout();
  while (!result.done) {
    chunks.push(decoder.decode(result.value));
    result = await readWithTimeout();
  }

  reader.releaseLock();
  return chunks.join("");
}

describe("GET /api/logs/[app]/stream", () => {
  it("returns 404 when log file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);
    const { req, params } = buildRequest("gadget");

    const response = await GET(req, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Log file not found");
  });

  it("returns SSE response headers", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);
    setupFileMocks([]);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });

  it("streams recent log lines as SSE data", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);
    setupFileMocks(['{"level":30,"msg":"line1"}', '{"level":30,"msg":"line2"}']);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    expect(response.body).not.toBeNull();
    const output = await drainAvailableChunks(response);

    expect(output).toContain('data: {"level":30,"msg":"line1"}');
    expect(output).toContain('data: {"level":30,"msg":"line2"}');
    expect(output).toContain(": connected");
  });

  it("passes date param to getLogFilePath", async () => {
    mockExistsSync.mockReturnValue(false);

    const { req, params } = buildRequest("gadget", { date: "2026-02-10" });
    await GET(req, { params });

    expect(mockGetLogFilePath).toHaveBeenCalledWith("gadget", undefined, "2026-02-10");
  });

  it("keeps only last 50 lines from file", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);
    const logLines = Array.from({ length: 60 }, (_, i) => `{"level":30,"msg":"line-${i}"}`);
    setupFileMocks(logLines);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    const output = await drainAvailableChunks(response);
    expect(output).not.toContain('"msg":"line-0"');
    expect(output).not.toContain('"msg":"line-9"');
    expect(output).toContain('"msg":"line-10"');
    expect(output).toContain('"msg":"line-59"');
  });

  it("skips empty lines when streaming", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);
    setupFileMocks(['{"level":30,"msg":"valid"}', "", '{"level":30,"msg":"also-valid"}']);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    const output = await drainAvailableChunks(response);
    const dataLines = output.split("\n").filter((l) => l.startsWith("data: "));
    expect(dataLines).toHaveLength(2);
  });

  it("closes file handle after reading initial lines", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);
    const mockFileHandle = setupFileMocks(['{"level":30,"msg":"test"}']);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    await drainAvailableChunks(response);
    expect(mockFileHandle.close).toHaveBeenCalled();
  });

  it("watcher streams new data when file grows", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);

    // Capture the watcher callback
    let watchCallback: (() => void) | undefined;
    const mockWatcherClose = vi.fn();
    mockWatch.mockImplementation((_path: unknown, cb: unknown) => {
      watchCallback = cb as () => void;
      return { close: mockWatcherClose } as never;
    });

    // Initial stat: file has 100 bytes
    mockStatSync.mockReturnValue({ size: 100 } as never);

    // Initial file handle for readline (no initial lines)
    const initialFh = {
      createReadStream: vi.fn(() => ({})),
      close: vi.fn(),
    };
    mockOpen.mockResolvedValueOnce(initialFh as never);
    mockCreateInterface.mockReturnValue(asyncIter([]) as never);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    // Drain initial output
    if (!response.body) throw new Error("Expected response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // Read the ": connected" message
    const initial = await reader.read();
    expect(decoder.decode(initial.value)).toContain(": connected");

    // Now simulate file growth — new data appended
    const newContent = '{"level":30,"msg":"new-line"}\n';
    mockStatSync.mockReturnValue({ size: 100 + newContent.length } as never);

    const watcherFh = {
      read: vi.fn(async (buf: Buffer) => {
        Buffer.from(newContent).copy(buf);
        return { bytesRead: newContent.length };
      }),
      close: vi.fn(),
    };
    mockOpen.mockResolvedValue(watcherFh as never);

    // Trigger the watcher callback
    watchCallback?.();

    // Allow the async watcher callback to complete
    await new Promise((r) => setTimeout(r, 50));

    // Read the new data from the stream
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 100)),
    ]);
    reader.releaseLock();

    if (!chunk.done && chunk.value) {
      const text = decoder.decode(chunk.value);
      expect(text).toContain("new-line");
    }

    expect(watcherFh.close).toHaveBeenCalled();
  });

  it("watcher ignores file when size has not grown", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);

    let watchCallback: (() => void) | undefined;
    mockWatch.mockImplementation((_path: unknown, cb: unknown) => {
      watchCallback = cb as () => void;
      return { close: vi.fn() } as never;
    });

    // File size stays at 100
    mockStatSync.mockReturnValue({ size: 100 } as never);

    const initialFh = {
      createReadStream: vi.fn(() => ({})),
      close: vi.fn(),
    };
    mockOpen.mockResolvedValueOnce(initialFh as never);
    mockCreateInterface.mockReturnValue(asyncIter([]) as never);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    // Drain initial data so start() completes and watch() is called
    await drainAvailableChunks(response);

    // open should have been called once for initial read
    const callsBefore = mockOpen.mock.calls.length;

    // Trigger watcher — size unchanged, should early-return
    watchCallback?.();
    await new Promise((r) => setTimeout(r, 50));

    // open should NOT have been called again (no new data to read)
    expect(mockOpen.mock.calls.length).toBe(callsBefore);
  });

  it("watcher handles errors gracefully during file rotation", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);

    let watchCallback: (() => void) | undefined;
    mockWatch.mockImplementation((_path: unknown, cb: unknown) => {
      watchCallback = cb as () => void;
      return { close: vi.fn() } as never;
    });

    // Initial stat succeeds
    mockStatSync
      .mockReturnValueOnce({ size: 0 } as never)
      // Second call (in watcher) throws — file rotating
      .mockImplementation(() => {
        throw new Error("ENOENT: file deleted during rotation");
      });

    setupFileMocks([]);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });
    await drainAvailableChunks(response);

    // Should not throw — error is caught silently
    watchCallback?.();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("heartbeat is sent every 15 seconds", async () => {
    mockExistsSync.mockReturnValue(true);

    mockWatch.mockImplementation(() => ({ close: vi.fn() }) as never);
    mockStatSync.mockReturnValue({ size: 0 } as never);

    setupFileMocks([]);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    if (!response.body) throw new Error("Expected response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Read initial output (": connected")
    await reader.read();

    // Advance timer by 15s to trigger heartbeat
    vi.advanceTimersByTime(15000);

    const heartbeatChunk = await reader.read();
    const text = decoder.decode(heartbeatChunk.value);
    expect(text).toContain(": heartbeat");

    reader.releaseLock();
  });

  it("heartbeat error triggers cleanup of watcher and interval", async () => {
    mockExistsSync.mockReturnValue(true);

    const mockWatcherClose = vi.fn();
    mockWatch.mockImplementation(() => ({ close: mockWatcherClose }) as never);
    mockStatSync.mockReturnValue({ size: 0 } as never);

    setupFileMocks([]);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    // Read initial data
    if (!response.body) throw new Error("Expected response body");
    const reader = response.body.getReader();
    await reader.read(); // ": connected"

    // Cancel the reader which closes the controller
    await reader.cancel();

    // Advance timer to trigger heartbeat — enqueue should throw, triggering cleanup
    await vi.advanceTimersByTimeAsync(15000);

    expect(mockWatcherClose).toHaveBeenCalled();
  });

  it("cancel calls cleanup to close watcher and clear interval", async () => {
    vi.useRealTimers();
    mockExistsSync.mockReturnValue(true);

    const mockWatcherClose = vi.fn();
    mockWatch.mockImplementation(() => ({ close: mockWatcherClose }) as never);
    mockStatSync.mockReturnValue({ size: 0 } as never);

    setupFileMocks([]);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req, { params });

    // Drain initial data so the stream start() completes
    await drainAvailableChunks(response);

    // Cancel the stream — should trigger cleanup
    await response.body?.cancel();

    expect(mockWatcherClose).toHaveBeenCalled();
  });
});
