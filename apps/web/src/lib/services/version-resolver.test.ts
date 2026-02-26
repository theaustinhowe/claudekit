import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { isNewerVersion, resolveLatestVersion } from "./version-resolver";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  });
}

describe("isNewerVersion", () => {
  it("returns true when latest is newer", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    expect(isNewerVersion("1.2.3", "1.3.0")).toBe(true);
  });

  it("returns false when latest is older", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
    expect(isNewerVersion("1.1.0", "1.0.9")).toBe(false);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("handles v-prefix", () => {
    expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true);
    expect(isNewerVersion("v2.0.0", "1.0.0")).toBe(false);
  });

  it("handles mismatched segment counts", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
  });
});

describe("resolveLatestVersion", () => {
  it("returns null for source type none", async () => {
    const result = await resolveLatestVersion({ type: "none" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves from npm", async () => {
    fetchMock.mockReturnValue(jsonResponse({ version: "10.5.0" }));

    const result = await resolveLatestVersion({ type: "npm", package: "pnpm" });

    expect(result).toBe("10.5.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/pnpm/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("resolves from github-release (strips v-prefix)", async () => {
    fetchMock.mockReturnValue(jsonResponse({ tag_name: "v4.5.0" }));

    const result = await resolveLatestVersion({ type: "github-release", repo: "Homebrew/brew" });

    expect(result).toBe("4.5.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/Homebrew/brew/releases/latest",
      expect.objectContaining({
        headers: { Accept: "application/vnd.github.v3+json" },
      }),
    );
  });

  it("resolves from url with nodejs-lts parser", async () => {
    const nodeDistData = [
      { version: "v23.0.0", lts: false },
      { version: "v22.11.0", lts: "Jod" },
      { version: "v20.18.0", lts: "Iron" },
    ];
    fetchMock.mockReturnValue(jsonResponse(nodeDistData));

    const result = await resolveLatestVersion({
      type: "url",
      url: "https://nodejs.org/dist/index.json",
      parser: "nodejs-lts",
    });

    expect(result).toBe("22.11.0");
  });

  it("resolves from url with python-eol parser", async () => {
    fetchMock.mockReturnValue(jsonResponse([{ latest: "3.13.1" }, { latest: "3.12.8" }]));

    const result = await resolveLatestVersion({
      type: "url",
      url: "https://endoflife.date/api/python.json",
      parser: "python-eol",
    });

    expect(result).toBe("3.13.1");
  });

  it("returns cached value within TTL", async () => {
    fetchMock.mockReturnValue(jsonResponse({ version: "1.0.0" }));

    const first = await resolveLatestVersion({ type: "npm", package: "test-pkg" });
    expect(first).toBe("1.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await resolveLatestVersion({ type: "npm", package: "test-pkg" });
    expect(second).toBe("1.0.0");
    // Should use cache — no additional fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after cache TTL expires", async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(jsonResponse({ version: "1.0.0" }));

    await resolveLatestVersion({ type: "npm", package: "ttl-test" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past 10 min TTL
    vi.advanceTimersByTime(11 * 60 * 1000);

    fetchMock.mockReturnValue(jsonResponse({ version: "1.1.0" }));
    const result = await resolveLatestVersion({ type: "npm", package: "ttl-test" });

    expect(result).toBe("1.1.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    const result = await resolveLatestVersion({ type: "npm", package: "fail-pkg" });

    expect(result).toBeNull();
  });

  it("returns null when response is not ok", async () => {
    fetchMock.mockReturnValue(jsonResponse(null, false));

    const result = await resolveLatestVersion({ type: "npm", package: "not-found" });

    expect(result).toBeNull();
  });
});
