import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
  sendLogToSubscribers: vi.fn(),
}));

vi.mock("./health-events.js", () => ({
  emitHealthEvent: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";
import { emitHealthEvent } from "./health-events.js";
import { checkStaleJobs } from "./stale-job-monitor.js";

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

describe("stale-job-monitor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  it("should return zero counts when no running jobs", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const result = await checkStaleJobs();

    expect(result).toEqual({ checked: 0, paused: 0, warned: 0 });
  });

  it("should skip jobs that are not stale", async () => {
    const recentTime = new Date(Date.now() - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "job-1", status: "running", updated_at: new Date().toISOString(), process_pid: 1234 },
    ]);
    vi.mocked(queryOne).mockResolvedValue({ created_at: recentTime });

    const result = await checkStaleJobs();

    expect(result).toEqual({ checked: 1, paused: 0, warned: 0 });
  });

  it("should pause stale job when process is dead", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    const stalePid = 999999;

    vi.mocked(queryAll).mockResolvedValue([
      { id: "stale-1", status: "running", updated_at: oldTime, process_pid: stalePid },
    ]);
    // Last log entry is old
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ created_at: oldTime }) // last log
      .mockResolvedValueOnce({ id: "stale-1", status: "paused" }); // updated job

    // Mock process.kill to throw (process is dead)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("No such process");
    });

    const result = await checkStaleJobs();

    expect(result.paused).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE jobs SET status = ?"),
      expect.arrayContaining(["paused"]),
    );
    expect(broadcast).toHaveBeenCalledWith({
      type: "job:updated",
      payload: expect.objectContaining({ id: "stale-1" }),
    });
    expect(emitHealthEvent).toHaveBeenCalledWith(
      "stale_job_detected",
      expect.any(String),
      expect.objectContaining({ jobId: "stale-1", action: "paused" }),
    );

    killSpy.mockRestore();
  });

  it("should warn when process is alive but silent", async () => {
    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "silent-1", status: "running", updated_at: oldTime, process_pid: process.pid },
    ]);
    // Last log is old
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ created_at: oldTime }) // last log
      .mockResolvedValueOnce(null); // no recent system warning

    const result = await checkStaleJobs();

    expect(result.warned).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO job_logs"),
      expect.arrayContaining(["silent-1", "system"]),
    );
    expect(sendLogToSubscribers).toHaveBeenCalledWith("silent-1", {
      stream: "system",
      content: expect.stringContaining("no output for"),
      sequence: expect.any(Number),
    });
  });

  it("should not re-warn if recent system warning exists", async () => {
    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    const recentWarning = new Date(Date.now() - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "warned-1", status: "running", updated_at: oldTime, process_pid: process.pid },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ created_at: oldTime }) // last log
      .mockResolvedValueOnce({ id: "warn-1", created_at: recentWarning }); // recent system warning

    const result = await checkStaleJobs();

    expect(result.warned).toBe(0);
    expect(sendLogToSubscribers).not.toHaveBeenCalled();
  });

  it("should handle jobs with no process_pid (dead process path)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "no-pid", status: "running", updated_at: oldTime, process_pid: null },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ created_at: oldTime })
      .mockResolvedValueOnce({ id: "no-pid", status: "paused" });

    const result = await checkStaleJobs();

    expect(result.paused).toBe(1);
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE jobs SET status = ?"),
      expect.arrayContaining(["paused"]),
    );
  });

  it("should use job updated_at when no logs exist", async () => {
    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "no-logs", status: "running", updated_at: oldTime, process_pid: null },
    ]);
    // No logs at all
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null) // no last log
      .mockResolvedValueOnce({ id: "no-logs", status: "paused" }); // updated job

    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await checkStaleJobs();

    expect(result.paused).toBe(1);
  });

  it("should check multiple running jobs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const oldTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    const recentTime = new Date(Date.now() - 1000).toISOString();

    vi.mocked(queryAll).mockResolvedValue([
      { id: "fresh-1", status: "running", updated_at: recentTime, process_pid: process.pid },
      { id: "stale-2", status: "running", updated_at: oldTime, process_pid: null },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ created_at: recentTime }) // fresh-1 last log
      .mockResolvedValueOnce({ created_at: oldTime }) // stale-2 last log
      .mockResolvedValueOnce({ id: "stale-2", status: "paused" }); // stale-2 updated

    const result = await checkStaleJobs();

    expect(result.checked).toBe(2);
    expect(result.paused).toBe(1);
  });
});
