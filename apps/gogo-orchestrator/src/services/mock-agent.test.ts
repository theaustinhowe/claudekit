import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/duckdb", () => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));
vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
  sendLogToSubscribers: vi.fn(),
}));

import { queryOne } from "@devkit/duckdb";
import { isRunning, startMockRun, stopMockRun } from "./mock-agent.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mock-agent", () => {
  it("isRunning returns false for unknown job", () => {
    expect(isRunning("unknown-job")).toBe(false);
  });

  it("startMockRun makes job running when job is queued", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "queued" } as never);

    const result = await startMockRun("job-1");

    expect(result.success).toBe(true);
    expect(isRunning("job-1")).toBe(true);

    // Clean up
    stopMockRun("job-1");
  });

  it("startMockRun returns error when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined as never);

    const result = await startMockRun("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("startMockRun returns error when job not queued", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "running" } as never);

    const result = await startMockRun("job-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("queued");
  });

  it("stopMockRun clears the job", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "queued" } as never);

    await startMockRun("job-1");
    expect(isRunning("job-1")).toBe(true);

    const stopped = stopMockRun("job-1");
    expect(stopped).toBe(true);
    expect(isRunning("job-1")).toBe(false);
  });

  it("stopMockRun returns false for unknown job", () => {
    expect(stopMockRun("unknown")).toBe(false);
  });
});
