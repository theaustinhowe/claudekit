import { describe, expect, it } from "vitest";
import { cn, formatBytes, IMAGE_EXTENSIONS } from "./utils";

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
