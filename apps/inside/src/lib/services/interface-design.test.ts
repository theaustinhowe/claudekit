import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue("skill content"),
    existsSync: vi.fn().mockReturnValue(true),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue("skill content"),
  existsSync: vi.fn().mockReturnValue(true),
}));

import fs from "node:fs";
import type { GeneratorProject } from "@/lib/types";
import { buildInterfaceDesignSystem, VIBE_TRAITS, writeInterfaceDesignFile, writeSkillFiles } from "./interface-design";

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.resetAllMocks();
  mockFs.readFileSync.mockReturnValue("skill content");
});

function makeProject(overrides: Partial<GeneratorProject> = {}): GeneratorProject {
  return {
    id: "proj-1",
    title: "Test App",
    idea_description: "A test application",
    platform: "nextjs",
    services: [],
    constraints: [],
    project_name: "test-app",
    project_path: "/tmp",
    package_manager: "pnpm",
    status: "drafting",
    active_spec_version: 0,
    ai_provider: "claude-code",
    ai_model: null,
    template_id: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    exported_at: null,
    implementation_prompt: null,
    design_vibes: [],
    inspiration_urls: [],
    color_scheme: {},
    custom_features: [],
    tool_versions: {},
    scaffold_logs: null,
    ...overrides,
  };
}

describe("VIBE_TRAITS", () => {
  it("has 8 vibes defined", () => {
    expect(Object.keys(VIBE_TRAITS)).toHaveLength(8);
  });

  it("each vibe has spacing, typography, radius, and patterns", () => {
    for (const [, traits] of Object.entries(VIBE_TRAITS)) {
      expect(traits.spacing).toBeDefined();
      expect(traits.typography).toBeDefined();
      expect(traits.radius).toBeDefined();
      expect(traits.patterns).toBeDefined();
    }
  });

  it("includes expected vibe IDs", () => {
    const ids = Object.keys(VIBE_TRAITS);
    expect(ids).toContain("precision-density");
    expect(ids).toContain("warmth-approachability");
    expect(ids).toContain("sophistication-trust");
    expect(ids).toContain("boldness-clarity");
    expect(ids).toContain("utility-function");
    expect(ids).toContain("data-analysis");
    expect(ids).toContain("retro");
    expect(ids).toContain("playful");
  });
});

describe("buildInterfaceDesignSystem", () => {
  it("includes project title", () => {
    const project = makeProject();
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("Test App");
  });

  it("includes direction section when vibes are set", () => {
    const project = makeProject({ design_vibes: ["precision-density"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Direction");
    expect(result).toContain("Precision & Density");
    expect(result).toContain("Cool (slate)");
  });

  it("omits direction section when no vibes", () => {
    const project = makeProject({ design_vibes: [] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).not.toContain("## Direction");
  });

  it("includes tokens section with spacing scale", () => {
    const project = makeProject({ design_vibes: ["precision-density"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Tokens");
    expect(result).toContain("### Spacing");
    expect(result).toContain("4px");
  });

  it("includes color primitives when colors are set", () => {
    const project = makeProject({
      design_vibes: ["warmth-approachability"],
      color_scheme: { primary: "#3B82F6", accent: "#F59E0B" },
    });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("### Color Primitives");
    expect(result).toContain("#3B82F6");
    expect(result).toContain("#F59E0B");
  });

  it("omits color primitives when no colors set", () => {
    const project = makeProject({ design_vibes: ["precision-density"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).not.toContain("### Color Primitives");
  });

  it("includes border radius scale", () => {
    const project = makeProject({ design_vibes: ["warmth-approachability"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("### Border Radius");
    expect(result).toContain("8px / 12px / 16px");
  });

  it("includes typography section", () => {
    const project = makeProject({ design_vibes: ["sophistication-trust"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("### Typography");
    expect(result).toContain("Inter");
  });

  it("includes patterns section for button and card", () => {
    const project = makeProject({ design_vibes: ["boldness-clarity"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Patterns");
    expect(result).toContain("### Button");
    expect(result).toContain("### Card");
    expect(result).toContain("### Sidebar");
  });

  it("includes borders-only depth CSS", () => {
    const project = makeProject({ design_vibes: ["precision-density"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("border:");
  });

  it("includes subtle shadows depth CSS", () => {
    const project = makeProject({ design_vibes: ["warmth-approachability"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("box-shadow:");
  });

  it("includes layered shadows depth CSS", () => {
    const project = makeProject({ design_vibes: ["sophistication-trust"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("box-shadow:");
  });

  it("includes inspiration references", () => {
    const project = makeProject({
      inspiration_urls: ["https://example.com", "https://other.com"],
    });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Inspiration References");
    expect(result).toContain("https://example.com");
  });

  it("omits inspiration section when no URLs", () => {
    const project = makeProject({ inspiration_urls: [] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).not.toContain("## Inspiration References");
  });

  it("includes decisions table", () => {
    const project = makeProject({ design_vibes: ["utility-function"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Decisions");
    expect(result).toContain("Depth");
    expect(result).toContain("Base spacing");
  });

  it("includes implementation notes", () => {
    const project = makeProject();
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("## Implementation Notes");
    expect(result).toContain("token");
  });

  it("uses default base spacing when no vibes", () => {
    const project = makeProject({ design_vibes: [] });
    const result = buildInterfaceDesignSystem(project);
    // Default base is 4
    expect(result).toContain("4px");
  });

  it("handles multiple vibes", () => {
    const project = makeProject({
      design_vibes: ["precision-density", "data-analysis"],
    });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("Precision & Density");
    expect(result).toContain("Data & Analysis");
  });

  it("skips unknown vibes gracefully", () => {
    const project = makeProject({ design_vibes: ["unknown-vibe"] });
    const result = buildInterfaceDesignSystem(project);
    // Should not crash
    expect(result).toContain("Interface Design System");
  });

  it("includes primary-only color", () => {
    const project = makeProject({
      color_scheme: { primary: "#FF0000" },
    });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("#FF0000");
  });

  it("includes spacing description for dense layouts", () => {
    const project = makeProject({ design_vibes: ["precision-density"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("Dense layout");
  });

  it("includes spacing description for generous layouts", () => {
    const project = makeProject({ design_vibes: ["warmth-approachability"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("breathing room");
  });

  it("includes spacing description for balanced layouts", () => {
    const project = makeProject({ design_vibes: ["sophistication-trust"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("professional clarity");
  });

  it("handles retro vibe with sharp radius", () => {
    const project = makeProject({ design_vibes: ["retro"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("0px");
    expect(result).toContain("Sharp");
  });

  it("handles playful vibe with large radius", () => {
    const project = makeProject({ design_vibes: ["playful"] });
    const result = buildInterfaceDesignSystem(project);
    expect(result).toContain("8px / 16px / 20px");
  });
});

describe("writeInterfaceDesignFile", () => {
  it("creates .interface-design directory", () => {
    writeInterfaceDesignFile("/tmp/project", "design content");

    expect(mockFs.mkdirSync).toHaveBeenCalledWith("/tmp/project/.interface-design", { recursive: true });
  });

  it("writes system.md file", () => {
    writeInterfaceDesignFile("/tmp/project", "design content");

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/project/.interface-design/system.md",
      "design content",
      "utf-8",
    );
  });
});

describe("writeSkillFiles", () => {
  it("writes all skill files to the project directory", () => {
    writeSkillFiles("/tmp/project");

    // Should write 5 skill files
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(5);
    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it("reads skill content from source directory", () => {
    writeSkillFiles("/tmp/project");

    expect(mockFs.readFileSync).toHaveBeenCalledTimes(5);
  });
});
