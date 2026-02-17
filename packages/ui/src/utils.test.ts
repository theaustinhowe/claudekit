import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  formatBytes,
  formatElapsed,
  generateId,
  IMAGE_EXTENSIONS,
  nowTimestamp,
  parseGitHubUrl,
  timeAgo,
} from "./utils";

describe("cn", () => {
  it("returns a single class string unchanged", () => {
    expect(cn("px-4")).toBe("px-4");
  });

  it("merges multiple class strings", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("ignores falsy values", () => {
    expect(cn("px-4", false, null, undefined, 0, "", "py-2")).toBe("px-4 py-2");
  });

  it("resolves Tailwind class conflicts by keeping the last value", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("bg-white", "bg-black")).toBe("bg-black");
  });

  it("accepts array inputs", () => {
    expect(cn(["px-4", "py-2"])).toBe("px-4 py-2");
    expect(cn(["px-4"], ["py-2", "mt-1"])).toBe("px-4 py-2 mt-1");
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("returns an empty string when all inputs are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("formatBytes", () => {
  it("formats values below 1024 as bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats the 1024 boundary as kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats kilobyte values with one decimal place", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10240)).toBe("10.0 KB");
    expect(formatBytes(524288)).toBe("512.0 KB");
  });

  it("formats the 1048576 boundary as megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("formats megabyte values with one decimal place", () => {
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(10485760)).toBe("10.0 MB");
    expect(formatBytes(104857600)).toBe("100.0 MB");
  });
});

describe("IMAGE_EXTENSIONS", () => {
  it("includes common raster image extensions", () => {
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".avif", ".ico"]) {
      expect(IMAGE_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it("includes TIFF extensions", () => {
    expect(IMAGE_EXTENSIONS.has(".tiff")).toBe(true);
    expect(IMAGE_EXTENSIONS.has(".tif")).toBe(true);
  });

  it("includes SVG", () => {
    expect(IMAGE_EXTENSIONS.has(".svg")).toBe(true);
  });

  it("does not include non-image extensions", () => {
    for (const ext of [".ts", ".json", ".html", ".css", ".js", ".txt", ".md", ".mp4"]) {
      expect(IMAGE_EXTENSIONS.has(ext)).toBe(false);
    }
  });

  it("contains exactly 11 extensions", () => {
    expect(IMAGE_EXTENSIONS.size).toBe(11);
  });
});

describe("formatElapsed", () => {
  it("formats seconds only when under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(90)).toBe("1m 30s");
    expect(formatElapsed(3600)).toBe("60m 0s");
  });

  it("formats exact minutes with zero seconds", () => {
    expect(formatElapsed(60)).toBe("1m 0s");
  });
});

describe("generateId", () => {
  it("returns a string in UUID format", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns unique values across calls", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId()));
    expect(ids.size).toBe(10);
  });
});

describe("nowTimestamp", () => {
  it("returns an ISO 8601 string", () => {
    const ts = nowTimestamp();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("is close to current time", () => {
    const before = Date.now();
    const ts = new Date(nowTimestamp()).getTime();
    const after = Date.now();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for less than 60 seconds", () => {
    expect(timeAgo(new Date("2025-06-15T11:59:30Z"))).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(timeAgo("2025-06-15T11:55:00Z")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(timeAgo(new Date("2025-06-15T09:00:00Z"))).toBe("3h ago");
  });

  it("returns days ago", () => {
    expect(timeAgo("2025-06-12T12:00:00Z")).toBe("3d ago");
  });

  it("returns formatted date for over a week", () => {
    const result = timeAgo("2025-05-01T12:00:00Z");
    expect(result).toContain("May");
    expect(result).toContain("2025");
  });
});

describe("parseGitHubUrl", () => {
  it("parses HTTPS URLs", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses SSH URLs", () => {
    expect(parseGitHubUrl("git@github.com:owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("strips .git suffix", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles URLs with path fragments", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/pull/123")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("not a url")).toBeNull();
  });
});
