import { describe, expect, it } from "vitest";
import { detectLanguage, isBinaryFile } from "./language-detector";

describe("detectLanguage", () => {
  describe("extension mapping", () => {
    it.each([
      ["/src/index.ts", "typescript"],
      ["/src/App.tsx", "tsx"],
      ["/src/index.js", "javascript"],
      ["/src/App.jsx", "jsx"],
      ["/script.py", "python"],
      ["/style.css", "css"],
      ["/page.html", "html"],
      ["/config.yaml", "yaml"],
      ["/config.yml", "yaml"],
      ["/data.json", "json"],
      ["/readme.md", "markdown"],
      ["/lib.rs", "rust"],
      ["/main.go", "go"],
      ["/query.sql", "sql"],
      ["/schema.graphql", "graphql"],
      ["/script.sh", "bash"],
      ["/image.svg", "xml"],
    ])("%s → %s", (filePath, expected) => {
      expect(detectLanguage(filePath)).toBe(expected);
    });
  });

  describe("filename mapping", () => {
    it.each([
      ["Dockerfile", "dockerfile"],
      ["Makefile", "makefile"],
      ["Rakefile", "ruby"],
      ["Gemfile", "ruby"],
      ["Justfile", "just"],
      [".gitignore", "gitignore"],
      [".dockerignore", "gitignore"],
      [".npmrc", "ini"],
      ["tsconfig.json", "jsonc"],
      ["jsconfig.json", "jsonc"],
    ])("%s → %s", (filename, expected) => {
      expect(detectLanguage(filename)).toBe(expected);
    });
  });

  it("filename match takes precedence over extension", () => {
    // tsconfig.json should be "jsonc" not "json"
    expect(detectLanguage("tsconfig.json")).toBe("jsonc");
    // .gitignore filename map → "gitignore", not extension-based
    expect(detectLanguage(".gitignore")).toBe("gitignore");
  });

  it("returns 'text' for unknown extensions", () => {
    expect(detectLanguage("/file.xyz")).toBe("text");
    expect(detectLanguage("/file.unknown")).toBe("text");
  });
});

describe("isBinaryFile", () => {
  describe("binary extensions", () => {
    it.each([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".wasm",
      ".zip",
      ".pdf",
      ".duckdb",
      ".exe",
      ".woff2",
    ])("%s is binary", (ext) => {
      expect(isBinaryFile(`file${ext}`)).toBe(true);
    });
  });

  describe("non-binary extensions", () => {
    it.each([".svg", ".ts", ".json", ".js", ".html", ".css", ".md", ".txt"])("%s is not binary", (ext) => {
      expect(isBinaryFile(`file${ext}`)).toBe(false);
    });
  });

  it(".svg is explicitly not binary", () => {
    expect(isBinaryFile("image.svg")).toBe(false);
  });
});
