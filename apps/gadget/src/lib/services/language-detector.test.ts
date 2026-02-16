import { describe, expect, it } from "vitest";
import { detectLanguage, isBinaryFile } from "@/lib/services/language-detector";

describe("detectLanguage", () => {
  it("detects TypeScript by extension", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
  });

  it("detects TSX by extension", () => {
    expect(detectLanguage("component.tsx")).toBe("tsx");
  });

  it("detects JavaScript by extension", () => {
    expect(detectLanguage("app.js")).toBe("javascript");
  });

  it("detects JSX by extension", () => {
    expect(detectLanguage("component.jsx")).toBe("jsx");
  });

  it("detects .mjs as javascript", () => {
    expect(detectLanguage("module.mjs")).toBe("javascript");
  });

  it("detects .cjs as javascript", () => {
    expect(detectLanguage("config.cjs")).toBe("javascript");
  });

  it("detects JSON", () => {
    expect(detectLanguage("package.json")).toBe("json");
  });

  it("detects Markdown", () => {
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it("detects MDX", () => {
    expect(detectLanguage("docs.mdx")).toBe("mdx");
  });

  it("detects CSS", () => {
    expect(detectLanguage("styles.css")).toBe("css");
  });

  it("detects SCSS", () => {
    expect(detectLanguage("styles.scss")).toBe("scss");
  });

  it("detects HTML", () => {
    expect(detectLanguage("index.html")).toBe("html");
  });

  it("detects YAML", () => {
    expect(detectLanguage("config.yaml")).toBe("yaml");
    expect(detectLanguage("config.yml")).toBe("yaml");
  });

  it("detects Python", () => {
    expect(detectLanguage("script.py")).toBe("python");
  });

  it("detects Rust", () => {
    expect(detectLanguage("main.rs")).toBe("rust");
  });

  it("detects Go", () => {
    expect(detectLanguage("main.go")).toBe("go");
  });

  it("detects Dockerfile by filename", () => {
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
  });

  it("detects Makefile by filename", () => {
    expect(detectLanguage("Makefile")).toBe("makefile");
  });

  it("detects .gitignore by filename", () => {
    expect(detectLanguage(".gitignore")).toBe("gitignore");
  });

  it("detects tsconfig.json as jsonc", () => {
    expect(detectLanguage("tsconfig.json")).toBe("jsonc");
  });

  it("detects .prettierrc as json", () => {
    expect(detectLanguage(".prettierrc")).toBe("json");
  });

  it("detects .npmrc as ini", () => {
    expect(detectLanguage(".npmrc")).toBe("ini");
  });

  it("returns text for unknown extensions", () => {
    expect(detectLanguage("file.xyz")).toBe("text");
  });

  it("filename match takes priority over extension match", () => {
    expect(detectLanguage("tsconfig.json")).toBe("jsonc");
  });

  it("handles nested paths", () => {
    expect(detectLanguage("/a/b/c/deep.ts")).toBe("typescript");
  });

  it("detects SVG as xml", () => {
    expect(detectLanguage("icon.svg")).toBe("xml");
  });

  it("detects shell scripts", () => {
    expect(detectLanguage("script.sh")).toBe("bash");
    expect(detectLanguage("script.bash")).toBe("bash");
    expect(detectLanguage("script.zsh")).toBe("bash");
  });

  it("detects SQL", () => {
    expect(detectLanguage("query.sql")).toBe("sql");
  });

  it("detects GraphQL", () => {
    expect(detectLanguage("schema.graphql")).toBe("graphql");
    expect(detectLanguage("schema.gql")).toBe("graphql");
  });

  it("detects Vue", () => {
    expect(detectLanguage("App.vue")).toBe("vue");
  });

  it("detects Svelte", () => {
    expect(detectLanguage("App.svelte")).toBe("svelte");
  });

  it("detects Prisma", () => {
    expect(detectLanguage("schema.prisma")).toBe("prisma");
  });
});

describe("isBinaryFile", () => {
  it("returns true for image files", () => {
    expect(isBinaryFile("image.png")).toBe(true);
    expect(isBinaryFile("photo.jpg")).toBe(true);
    expect(isBinaryFile("photo.jpeg")).toBe(true);
    expect(isBinaryFile("anim.gif")).toBe(true);
    expect(isBinaryFile("image.webp")).toBe(true);
  });

  it("returns true for audio/video files", () => {
    expect(isBinaryFile("song.mp3")).toBe(true);
    expect(isBinaryFile("video.mp4")).toBe(true);
    expect(isBinaryFile("clip.mov")).toBe(true);
  });

  it("returns true for archive files", () => {
    expect(isBinaryFile("archive.zip")).toBe(true);
    expect(isBinaryFile("archive.tar")).toBe(true);
    expect(isBinaryFile("archive.gz")).toBe(true);
  });

  it("returns true for font files", () => {
    expect(isBinaryFile("font.woff")).toBe(true);
    expect(isBinaryFile("font.woff2")).toBe(true);
    expect(isBinaryFile("font.ttf")).toBe(true);
  });

  it("returns true for compiled files", () => {
    expect(isBinaryFile("app.exe")).toBe(true);
    expect(isBinaryFile("lib.dll")).toBe(true);
    expect(isBinaryFile("lib.so")).toBe(true);
    expect(isBinaryFile("code.wasm")).toBe(true);
  });

  it("returns true for database files", () => {
    expect(isBinaryFile("data.sqlite")).toBe(true);
    expect(isBinaryFile("data.db")).toBe(true);
    expect(isBinaryFile("data.duckdb")).toBe(true);
  });

  it("returns false for SVG (text-based XML)", () => {
    expect(isBinaryFile("icon.svg")).toBe(false);
  });

  it("returns false for text files", () => {
    expect(isBinaryFile("file.ts")).toBe(false);
    expect(isBinaryFile("file.js")).toBe(false);
    expect(isBinaryFile("file.json")).toBe(false);
    expect(isBinaryFile("file.md")).toBe(false);
    expect(isBinaryFile("file.txt")).toBe(false);
  });

  it("returns false for unknown extensions", () => {
    expect(isBinaryFile("file.xyz")).toBe(false);
  });

  it("is case insensitive on extension", () => {
    expect(isBinaryFile("IMAGE.PNG")).toBe(true);
    expect(isBinaryFile("photo.JPG")).toBe(true);
  });
});
