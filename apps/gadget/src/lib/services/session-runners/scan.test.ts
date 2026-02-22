import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
  queryAll: vi.fn(),
  execute: vi.fn(),
  checkpoint: vi.fn(),
}));
vi.mock("@/lib/services/auditors", () => ({
  runAudit: vi.fn(),
}));
vi.mock("@/lib/services/fix-planner", () => ({
  planFixes: vi.fn(),
  storePlannedFixes: vi.fn(),
}));
vi.mock("@/lib/services/policy-matcher", () => ({
  matchPolicy: vi.fn(),
}));
vi.mock("@/lib/services/scanner", () => ({
  discoverRepos: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "gen-id"),
  nowTimestamp: vi.fn(() => "2025-01-01T00:00:00.000Z"),
  parsePolicy: vi.fn((row: Record<string, unknown>) => row),
}));

import { checkpoint, execute, queryAll, queryOne } from "@/lib/db";
import { runAudit } from "@/lib/services/auditors";
import { planFixes, storePlannedFixes } from "@/lib/services/fix-planner";
import { matchPolicy } from "@/lib/services/policy-matcher";
import { discoverRepos } from "@/lib/services/scanner";
import { createScanRunner } from "./scan";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scan runner", () => {
  const defaultPolicy = { id: "p1", name: "Default Policy", is_builtin: true };

  function setupHappyPath() {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      // policies
      .mockResolvedValueOnce([defaultPolicy])
      // repos
      .mockResolvedValueOnce([]);
    vi.mocked(planFixes).mockResolvedValue([]);
  }

  it("creates a scan record and completes successfully", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createScanRunner({ scanRoots: ["/home/user/projects"] });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO scans"),
      expect.arrayContaining(["gen-id"]),
    );
    expect(result).toEqual({ result: { scanId: "gen-id" } });
  });

  it("stores scan roots", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined); // no existing root
    setupHappyPath();

    const runner = createScanRunner({ scanRoots: ["/home/user/projects"] });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO scan_roots"),
      expect.any(Array),
    );
  });

  it("reuses existing scan root IDs", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "existing-root-id" });
    setupHappyPath();

    const runner = createScanRunner({ scanRoots: ["/home/user/projects"] });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO scan_root_entries"),
      ["gen-id", "existing-root-id"],
    );
  });

  it("discovers and stores repos", async () => {
    vi.mocked(discoverRepos).mockReturnValue([
      {
        name: "repo-a",
        localPath: "/repos/a",
        gitRemote: "https://github.com/user/a",
        defaultBranch: "main",
        packageManager: "pnpm",
        repoType: "library",
        isMonorepo: false,
        lastModifiedAt: "2025-01-01",
      },
    ] as never);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([]); // repos
    vi.mocked(planFixes).mockResolvedValue([]);

    const runner = createScanRunner({ scanRoots: ["/repos"] });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO repos"),
      expect.arrayContaining(["repo-a", "/repos/a"]),
    );
  });

  it("audits repos with matched policy", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([{ id: "r1", name: "repo-a", local_path: "/repos/a" }]); // repos
    vi.mocked(planFixes).mockResolvedValue([]);
    vi.mocked(matchPolicy).mockReturnValue(defaultPolicy as never);

    const onProgress = vi.fn();
    const runner = createScanRunner({ autoMatch: true });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(runAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "r1",
        repoPath: "/repos/a",
        scanId: "gen-id",
      }),
    );
  });

  it("filters repos by selectedRepoIds", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([
        { id: "r1", name: "repo-a", local_path: "/repos/a" },
        { id: "r2", name: "repo-b", local_path: "/repos/b" },
      ]); // repos
    vi.mocked(planFixes).mockResolvedValue([]);

    const runner = createScanRunner({ selectedRepoIds: ["r1"] });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runAudit).toHaveBeenCalledTimes(1);
    expect(runAudit).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: "r1" }),
    );
  });

  it("filters repos by selectedRepoPaths", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([
        { id: "r1", name: "repo-a", local_path: "/repos/a" },
        { id: "r2", name: "repo-b", local_path: "/repos/b" },
      ]); // repos
    vi.mocked(planFixes).mockResolvedValue([]);

    const runner = createScanRunner({ selectedRepoPaths: ["/repos/b"] });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runAudit).toHaveBeenCalledTimes(1);
    expect(runAudit).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: "r2" }),
    );
  });

  it("plans and stores fixes for audited repos", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([{ id: "r1", name: "repo-a", local_path: "/repos/a" }]); // repos
    vi.mocked(planFixes).mockResolvedValue([{ fixId: "fix1" }] as never);

    const runner = createScanRunner({});
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(storePlannedFixes).toHaveBeenCalledWith([{ fixId: "fix1" }], "r1", "gen-id");
  });

  it("marks scan as done on success", async () => {
    setupHappyPath();

    const runner = createScanRunner({});
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE scans SET status = 'done'"),
      expect.any(Array),
    );
    expect(checkpoint).toHaveBeenCalled();
  });

  it("marks scan as error on abort", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy]) // policies
      .mockResolvedValueOnce([{ id: "r1", name: "repo-a", local_path: "/repos/a" }]); // repos
    vi.mocked(runAudit).mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const runner = createScanRunner({});

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Aborted");

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE scans SET status = 'error'"),
      expect.any(Array),
    );
  });

  it("marks scan as error on unexpected error", async () => {
    vi.mocked(discoverRepos).mockImplementation(() => {
      throw new Error("Disk full");
    });

    const runner = createScanRunner({ scanRoots: ["/repos"] });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Disk full");

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE scans SET status = 'error'"),
      expect.any(Array),
    );
  });

  it("throws AbortError when signal is aborted before discovery", async () => {
    const controller = new AbortController();
    controller.abort();

    const runner = createScanRunner({});

    await expect(
      runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" }),
    ).rejects.toThrow("Aborted");
  });

  it("emits progress events for each phase", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createScanRunner({ scanRoots: ["/repos"] });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const phases = onProgress.mock.calls
      .filter(([evt]) => evt.phase)
      .map(([evt]) => evt.phase);
    expect(phases).toContain("Discovering");
    expect(phases).toContain("Analyzing");
    expect(phases).toContain("Generating Fixes");
    expect(phases).toContain("Complete");
  });

  it("uses policyOverrides when provided", async () => {
    vi.mocked(discoverRepos).mockReturnValue([]);
    const overridePolicy = { id: "p2", name: "Override Policy" };
    vi.mocked(queryAll)
      .mockResolvedValueOnce([defaultPolicy, overridePolicy]) // policies
      .mockResolvedValueOnce([{ id: "r1", name: "repo-a", local_path: "/repos/a" }]); // repos
    vi.mocked(planFixes).mockResolvedValue([]);

    const runner = createScanRunner({ policyOverrides: { "/repos/a": "p2" } });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: overridePolicy,
      }),
    );
  });
});
