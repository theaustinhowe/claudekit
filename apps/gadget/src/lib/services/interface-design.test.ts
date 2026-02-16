import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import fs from "node:fs";
import type { GeneratorProject } from "@/lib/types";
import { buildInterfaceDesignSystem, VIBE_TRAITS, writeInterfaceDesignFile } from "./interface-design";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeProject(overrides?: Partial<GeneratorProject>): GeneratorProject {
  return {
    id: "proj-1",
    title: "Test App",
    project_name: "test-app",
    idea_description: "A test application",
    platform: "nextjs",
    constraints: [],
    services: [],
    package_manager: "pnpm",
    design_vibes: [],
    color_scheme: {},
    inspiration_urls: [],
    status: "created",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  } as GeneratorProject;
}

describe("interface-design", () => {
  describe("VIBE_TRAITS", () => {
    it("has 8 vibe presets", () => {
      expect(Object.keys(VIBE_TRAITS)).toHaveLength(8);
    });

    it("each vibe has required fields", () => {
      for (const [, traits] of Object.entries(VIBE_TRAITS)) {
        expect(traits).toHaveProperty("spacing");
        expect(traits).toHaveProperty("typography");
        expect(traits).toHaveProperty("radius");
        expect(traits).toHaveProperty("patterns");
      }
    });
  });

  describe("buildInterfaceDesignSystem", () => {
    it("includes project title", () => {
      const result = buildInterfaceDesignSystem(makeProject());

      expect(result).toContain("Test App");
    });

    it("includes direction section when vibes are set", () => {
      const project = makeProject({ design_vibes: ["precision-density"] });
      const result = buildInterfaceDesignSystem(project);

      expect(result).toContain("## Direction");
      expect(result).toContain("Precision & Density");
    });

    it("includes color primitives when color scheme is set", () => {
      const project = makeProject({
        design_vibes: ["boldness-clarity"],
        color_scheme: { primary: "#3b82f6", accent: "#f59e0b" },
      });
      const result = buildInterfaceDesignSystem(project);

      expect(result).toContain("#3b82f6");
      expect(result).toContain("#f59e0b");
    });

    it("includes inspiration URLs", () => {
      const project = makeProject({
        inspiration_urls: ["https://example.com/design"],
      });
      const result = buildInterfaceDesignSystem(project);

      expect(result).toContain("https://example.com/design");
      expect(result).toContain("Inspiration References");
    });

    it("includes decisions table with vibes", () => {
      const project = makeProject({ design_vibes: ["utility-function"] });
      const result = buildInterfaceDesignSystem(project);

      expect(result).toContain("## Decisions");
      expect(result).toContain("Utility & Function");
    });
  });

  describe("writeInterfaceDesignFile", () => {
    it("creates directory and writes file", () => {
      writeInterfaceDesignFile("/project", "# Design System");

      expect(fs.mkdirSync).toHaveBeenCalledWith("/project/.interface-design", { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith("/project/.interface-design/system.md", "# Design System", "utf-8");
    });
  });
});
