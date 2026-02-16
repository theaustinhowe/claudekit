import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));

import fs from "node:fs";
import type { GeneratorProject, MockEntity, UiSpec } from "@/lib/types";
import { generateExportFiles, writeExportToDisk } from "./spec-exporter";

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
    constraints: ["tailwind", "biome"],
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

function makeSpec(overrides?: Partial<UiSpec>): UiSpec {
  return {
    pages: [{ id: "p1", route: "/", title: "Home", description: "Home page", component_ids: [] }],
    components: [],
    ...overrides,
  } as UiSpec;
}

describe("spec-exporter", () => {
  describe("generateExportFiles", () => {
    it("generates package.json with Next.js deps", () => {
      const files = generateExportFiles(makeProject(), makeSpec(), []);
      const pkgFile = files.find((f) => f.path === "package.json");

      expect(pkgFile).toBeDefined();
      const pkg = JSON.parse(pkgFile?.content ?? "{}");
      expect(pkg.dependencies.next).toBeDefined();
      expect(pkg.dependencies.react).toBeDefined();
      expect(pkg.devDependencies.tailwindcss).toBeDefined();
      expect(pkg.devDependencies["@biomejs/biome"]).toBeDefined();
    });

    it("generates tsconfig.json", () => {
      const files = generateExportFiles(makeProject(), makeSpec(), []);
      const tsconfig = files.find((f) => f.path === "tsconfig.json");

      expect(tsconfig).toBeDefined();
      const config = JSON.parse(tsconfig?.content ?? "{}");
      expect(config.compilerOptions.jsx).toBe("preserve");
    });

    it("generates biome.json when biome constraint is set", () => {
      const files = generateExportFiles(makeProject(), makeSpec(), []);
      const biome = files.find((f) => f.path === "biome.json");

      expect(biome).toBeDefined();
    });

    it("generates page files for each route", () => {
      const spec = makeSpec({
        pages: [
          {
            id: "p1",
            route: "/",
            title: "Home",
            description: "Home page",
            component_ids: [],
            layout: null,
            is_dynamic: false,
            metadata: {},
          },
          {
            id: "p2",
            route: "/about",
            title: "About",
            description: "About page",
            component_ids: [],
            layout: null,
            is_dynamic: false,
            metadata: {},
          },
        ],
      });

      const files = generateExportFiles(makeProject(), spec, []);
      const pageFiles = files.filter((f) => f.path.endsWith("page.tsx"));

      expect(pageFiles.length).toBeGreaterThanOrEqual(2);
    });

    it("generates types and mock data for entities", () => {
      const mockData: MockEntity[] = [
        {
          id: "e1",
          name: "User",
          description: "A user entity",
          fields: [
            { name: "id", type: "string", nullable: false, default_value: null },
            { name: "email", type: "string", nullable: false, default_value: null },
          ],
          sample_rows: [{ id: "1", email: "test@test.com" }],
        },
      ];

      const files = generateExportFiles(makeProject(), makeSpec(), mockData);
      const typesFile = files.find((f) => f.path === "src/lib/types.ts");
      const mockFile = files.find((f) => f.path === "src/lib/mock-data.ts");

      expect(typesFile).toBeDefined();
      expect(typesFile?.content).toContain("interface User");
      expect(mockFile).toBeDefined();
      expect(mockFile?.content).toContain("userData");
    });

    it("generates CLAUDE.md and README.md", () => {
      const files = generateExportFiles(makeProject(), makeSpec(), []);
      const claude = files.find((f) => f.path === "CLAUDE.md");
      const readme = files.find((f) => f.path === "README.md");

      expect(claude).toBeDefined();
      expect(claude?.content).toContain("test-app");
      expect(readme).toBeDefined();
      expect(readme?.content).toContain("test-app");
    });

    it("includes service deps", () => {
      const project = makeProject({ services: ["stripe", "resend"] });
      const files = generateExportFiles(project, makeSpec(), []);
      const pkgFile = files.find((f) => f.path === "package.json");
      const pkg = JSON.parse(pkgFile?.content ?? "{}");

      expect(pkg.dependencies.stripe).toBeDefined();
      expect(pkg.dependencies.resend).toBeDefined();
    });
  });

  describe("writeExportToDisk", () => {
    it("writes files to project directory", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const files = [
        { path: "package.json", content: '{"name":"test"}' },
        { path: "src/index.ts", content: "console.log('hello');" },
      ];

      const result = await writeExportToDisk("~/projects", "test-app", files, false);

      expect(result.filesWritten).toBe(2);
      expect(result.fullPath).toBe("/home/user/projects/test-app");
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
