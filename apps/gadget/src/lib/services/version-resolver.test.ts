import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNewerVersion, resolveLatestVersion } from "@/lib/services/version-resolver";

describe("isNewerVersion", () => {
  it("detects newer major version", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("detects newer minor version", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("detects newer patch version", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns false for same version", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("handles v prefix on current", () => {
    expect(isNewerVersion("v1.0.0", "2.0.0")).toBe(true);
  });

  it("handles v prefix on latest", () => {
    expect(isNewerVersion("1.0.0", "v2.0.0")).toBe(true);
  });

  it("handles v prefix on both", () => {
    expect(isNewerVersion("v1.0.0", "v2.0.0")).toBe(true);
  });

  it("handles different length versions (short current)", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
  });

  it("handles different length versions (short latest)", () => {
    expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
  });

  it("treats missing parts as 0", () => {
    expect(isNewerVersion("1", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1")).toBe(false);
  });

  it("compares multi-digit parts correctly", () => {
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(true);
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(false);
  });
});

describe("resolveLatestVersion", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "5.0.0" }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for source type 'none'", async () => {
    const result = await resolveLatestVersion({ type: "none" });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches from npm registry", async () => {
    const result = await resolveLatestVersion({ type: "npm", package: "react" });
    expect(result).toBe("5.0.0");
    expect(fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/react/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("fetches from GitHub releases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v3.2.1" }),
      }),
    );

    const result = await resolveLatestVersion({ type: "github-release", repo: "owner/repo" });
    expect(result).toBe("3.2.1");
  });

  it("strips v prefix from GitHub release tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v10.0.0" }),
      }),
    );

    const result = await resolveLatestVersion({ type: "github-release", repo: "other-owner/other-repo" });
    expect(result).toBe("10.0.0");
  });

  it("returns null on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await resolveLatestVersion({ type: "npm", package: "nonexistent" });
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await resolveLatestVersion({ type: "npm", package: "network-fail-pkg" });
    expect(result).toBeNull();
  });

  it("fetches nodejs-lts from URL source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { version: "v22.0.0", lts: false },
            { version: "v20.11.0", lts: "Iron" },
          ]),
      }),
    );

    const result = await resolveLatestVersion({
      type: "url",
      url: "https://nodejs.org/dist/index.json",
      parser: "nodejs-lts",
    });
    expect(result).toBe("20.11.0");
  });

  it("fetches python-eol from URL source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ latest: "3.12.1" }, { latest: "3.11.7" }]),
      }),
    );

    const result = await resolveLatestVersion({
      type: "url",
      url: "https://endoflife.date/api/python.json",
      parser: "python-eol",
    });
    expect(result).toBe("3.12.1");
  });
});
