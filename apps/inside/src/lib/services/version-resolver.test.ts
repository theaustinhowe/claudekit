import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Clear the module cache between tests so the internal cache resets
let isNewerVersion: typeof import("./version-resolver").isNewerVersion;
let resolveLatestVersion: typeof import("./version-resolver").resolveLatestVersion;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  const mod = await import("./version-resolver");
  isNewerVersion = mod.isNewerVersion;
  resolveLatestVersion = mod.resolveLatestVersion;
});

describe("isNewerVersion", () => {
  it("returns true when latest is newer (major)", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when latest is older", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns true when latest has newer minor", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest has newer patch", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("handles missing patch version", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
  });

  it("handles v prefix", () => {
    expect(isNewerVersion("v1.0.0", "v2.0.0")).toBe(true);
    expect(isNewerVersion("v2.0.0", "v1.0.0")).toBe(false);
  });

  it("handles mixed v prefix", () => {
    expect(isNewerVersion("v1.0.0", "2.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "v2.0.0")).toBe(true);
  });
});

describe("resolveLatestVersion", () => {
  it("returns null for type 'none'", async () => {
    const result = await resolveLatestVersion({ type: "none" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches from npm registry", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "5.0.0" }),
    });

    const result = await resolveLatestVersion({ type: "npm", package: "typescript" });
    expect(result).toBe("5.0.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/typescript/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("fetches from github releases", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: "v3.2.1" }),
    });

    const result = await resolveLatestVersion({ type: "github-release", repo: "owner/repo" });
    expect(result).toBe("3.2.1"); // v prefix stripped
  });

  it("fetches from URL with nodejs-lts parser", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { version: "v22.0.0", lts: false },
          { version: "v20.12.0", lts: "Iron" },
          { version: "v18.19.0", lts: "Hydrogen" },
        ]),
    });

    const result = await resolveLatestVersion({
      type: "url",
      url: "https://nodejs.org/dist/index.json",
      parser: "nodejs-lts",
    });
    expect(result).toBe("20.12.0");
  });

  it("returns cached value within TTL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "5.0.0" }),
    });

    // First call — fetches
    await resolveLatestVersion({ type: "npm", package: "typescript" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call — cached
    const result = await resolveLatestVersion({ type: "npm", package: "typescript" });
    expect(result).toBe("5.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no additional fetch
  });

  it("returns null on fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const result = await resolveLatestVersion({ type: "npm", package: "nonexistent" });
    expect(result).toBeNull();
  });

  it("returns null when API returns non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await resolveLatestVersion({ type: "npm", package: "nonexistent" });
    expect(result).toBeNull();
  });
});
