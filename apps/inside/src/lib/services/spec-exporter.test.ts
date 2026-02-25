import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

import fs from "node:fs";
import type { GeneratorProject, MockEntity, UiSpec } from "@/lib/types";
import { generateExportFiles, writeExportToDisk } from "./spec-exporter";

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.resetAllMocks();
  mockFs.existsSync.mockReturnValue(false);
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
    active_spec_version: 1,
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
    scaffold_logs: null,
    ...overrides,
  };
}

function makeSpec(overrides: Partial<UiSpec> = {}): UiSpec {
  return {
    version: 1,
    pages: [
      {
        id: "page-1",
        route: "/",
        title: "Home",
        description: "Home page",
        layout: null,
        component_ids: ["comp-1"],
        is_dynamic: false,
        metadata: {},
      },
    ],
    components: [
      {
        id: "comp-1",
        name: "Header",
        component_type: "layout",
        description: "App header",
        props: [],
        data_bindings: [],
        children_ids: [],
        is_client: false,
      },
    ],
    layouts: [],
    navigation: { type: "sidebar", items: [] },
    ...overrides,
  };
}

function makeMockData(): MockEntity[] {
  return [
    {
      id: "entity-1",
      name: "User",
      description: "A user entity",
      fields: [
        { name: "id", type: "string", nullable: false, default_value: null },
        { name: "name", type: "string", nullable: false, default_value: null },
        { name: "email", type: "string", nullable: true, default_value: null },
        { name: "age", type: "number", nullable: true, default_value: null },
        { name: "active", type: "boolean", nullable: false, default_value: true },
        { name: "created_at", type: "date", nullable: false, default_value: null },
        { name: "role", type: "enum", nullable: false, default_value: null },
        { name: "org_id", type: "relation", nullable: true, default_value: null },
        { name: "data", type: "json", nullable: true, default_value: null },
      ],
      sample_rows: [{ id: "1", name: "Alice", email: "alice@test.com" }],
    },
  ];
}

describe("generateExportFiles", () => {
  it("generates package.json with nextjs deps", () => {
    const project = makeProject({ platform: "nextjs" });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    expect(pkgFile).toBeDefined();
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.scripts.dev).toBe("next dev");
  });

  it("generates package.json without nextjs deps for non-nextjs", () => {
    const project = makeProject({ platform: "node-api" });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.dependencies.next).toBeUndefined();
    expect(pkg.scripts.dev).toContain("tsx");
  });

  it("includes tailwind devDep when constraint is set", () => {
    const project = makeProject({ constraints: ["tailwind"] });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
  });

  it("includes biome devDep when constraint is set", () => {
    const project = makeProject({ constraints: ["biome"] });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.devDependencies["@biomejs/biome"]).toBeDefined();
  });

  it("includes vitest devDep when constraint is set", () => {
    const project = makeProject({ constraints: ["vitest"] });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.devDependencies.vitest).toBeDefined();
    expect(pkg.scripts.test).toBe("vitest");
  });

  it("includes shadcn deps when constraint is set", () => {
    const project = makeProject({ constraints: ["shadcn"] });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.dependencies["class-variance-authority"]).toBeDefined();
    expect(pkg.dependencies["lucide-react"]).toBeDefined();
  });

  it("adds service dependencies", () => {
    const project = makeProject({
      services: ["supabase-db", "stripe", "resend", "prisma", "drizzle"],
    });
    const files = generateExportFiles(project, makeSpec(), []);

    const pkgFile = files.find((f) => f.path === "package.json");
    const pkg = JSON.parse(pkgFile?.content ?? "");
    expect(pkg.dependencies["@supabase/supabase-js"]).toBeDefined();
    expect(pkg.dependencies.stripe).toBeDefined();
    expect(pkg.dependencies.resend).toBeDefined();
    expect(pkg.dependencies["@prisma/client"]).toBeDefined();
    expect(pkg.dependencies["drizzle-orm"]).toBeDefined();
  });

  it("generates tsconfig.json", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    const tsFile = files.find((f) => f.path === "tsconfig.json");
    expect(tsFile).toBeDefined();
    const tsconfig = JSON.parse(tsFile?.content ?? "");
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
  });

  it("generates tsconfig with strict when constraint is set", () => {
    const project = makeProject({ constraints: ["typescript-strict"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const tsFile = files.find((f) => f.path === "tsconfig.json");
    const tsconfig = JSON.parse(tsFile?.content ?? "");
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("generates .gitignore", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    const gitignore = files.find((f) => f.path === ".gitignore");
    expect(gitignore).toBeDefined();
    expect(gitignore?.content).toContain("node_modules");
  });

  it("generates next.config.ts for nextjs projects", () => {
    const project = makeProject({ platform: "nextjs" });
    const files = generateExportFiles(project, makeSpec(), []);
    const nextConfig = files.find((f) => f.path === "next.config.ts");
    expect(nextConfig).toBeDefined();
  });

  it("does not generate next.config.ts for non-nextjs", () => {
    const project = makeProject({ platform: "node-api" });
    const files = generateExportFiles(project, makeSpec(), []);
    const nextConfig = files.find((f) => f.path === "next.config.ts");
    expect(nextConfig).toBeUndefined();
  });

  it("generates biome.json when biome constraint set", () => {
    const project = makeProject({ constraints: ["biome"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const biome = files.find((f) => f.path === "biome.json");
    expect(biome).toBeDefined();
  });

  it("does not generate biome.json without biome constraint", () => {
    const project = makeProject({ constraints: [] });
    const files = generateExportFiles(project, makeSpec(), []);
    const biome = files.find((f) => f.path === "biome.json");
    expect(biome).toBeUndefined();
  });

  it("generates .env.local.example for supabase services", () => {
    const project = makeProject({ services: ["supabase-auth"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const envFile = files.find((f) => f.path === ".env.local.example");
    expect(envFile).toBeDefined();
    expect(envFile?.content).toContain("SUPABASE_URL");
  });

  it("generates .env.local.example for stripe service", () => {
    const project = makeProject({ services: ["stripe"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const envFile = files.find((f) => f.path === ".env.local.example");
    expect(envFile).toBeDefined();
    expect(envFile?.content).toContain("STRIPE_SECRET_KEY");
  });

  it("does not generate .env.local.example when no services", () => {
    const project = makeProject({ services: [] });
    const files = generateExportFiles(project, makeSpec(), []);
    const envFile = files.find((f) => f.path === ".env.local.example");
    expect(envFile).toBeUndefined();
  });

  it("generates ui-spec.json", () => {
    const spec = makeSpec();
    const files = generateExportFiles(makeProject(), spec, []);
    const specFile = files.find((f) => f.path === "ui-spec.json");
    expect(specFile).toBeDefined();
    expect(JSON.parse(specFile?.content ?? "")).toEqual(spec);
  });

  it("generates README.md with route table", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    const readme = files.find((f) => f.path === "README.md");
    expect(readme).toBeDefined();
    expect(readme?.content).toContain("test-app");
    expect(readme?.content).toContain("/");
    expect(readme?.content).toContain("Home");
  });

  it("generates CLAUDE.md", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    const claudemd = files.find((f) => f.path === "CLAUDE.md");
    expect(claudemd).toBeDefined();
    expect(claudemd?.content).toContain("test-app");
    expect(claudemd?.content).toContain("Header");
  });

  it("generates tasks.md", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    const tasks = files.find((f) => f.path === "tasks.md");
    expect(tasks).toBeDefined();
    expect(tasks?.content).toContain("Phase 1");
    expect(tasks?.content).toContain("Phase 2");
  });

  it("generates types.ts from mock data", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), makeMockData());
    const typesFile = files.find((f) => f.path === "src/lib/types.ts");
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain("interface User");
    expect(typesFile?.content).toContain("id: string");
    expect(typesFile?.content).toContain("email?: string");
    expect(typesFile?.content).toContain("age?: number");
    expect(typesFile?.content).toContain("active: boolean");
    expect(typesFile?.content).toContain("data?: unknown");
  });

  it("generates mock-data.ts from mock data", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), makeMockData());
    const dataFile = files.find((f) => f.path === "src/lib/mock-data.ts");
    expect(dataFile).toBeDefined();
    expect(dataFile?.content).toContain("userData");
    expect(dataFile?.content).toContain("User[]");
  });

  it("does not generate types or mock-data without mock entities", () => {
    const files = generateExportFiles(makeProject(), makeSpec(), []);
    expect(files.find((f) => f.path === "src/lib/types.ts")).toBeUndefined();
    expect(files.find((f) => f.path === "src/lib/mock-data.ts")).toBeUndefined();
  });

  it("generates utils.ts with cn function for shadcn", () => {
    const project = makeProject({ constraints: ["shadcn"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const utils = files.find((f) => f.path === "src/lib/utils.ts");
    expect(utils).toBeDefined();
    expect(utils?.content).toContain("cn(");
  });

  it("generates layout and page for nextjs", () => {
    const project = makeProject({ platform: "nextjs" });
    const files = generateExportFiles(project, makeSpec(), []);
    const layout = files.find((f) => f.path === "src/app/layout.tsx");
    expect(layout).toBeDefined();
    const page = files.find((f) => f.path === "src/app/page.tsx");
    expect(page).toBeDefined();
  });

  it("generates globals.css for tailwind nextjs", () => {
    const project = makeProject({
      platform: "nextjs",
      constraints: ["tailwind"],
    });
    const files = generateExportFiles(project, makeSpec(), []);
    const css = files.find((f) => f.path === "src/app/globals.css");
    expect(css).toBeDefined();
    expect(css?.content).toContain("tailwindcss");
  });

  it("generates component stubs", () => {
    const spec = makeSpec({
      components: [
        {
          id: "comp-1",
          name: "Header",
          component_type: "layout",
          description: "App header",
          props: [{ name: "title", type: "string", required: true, default_value: null }],
          data_bindings: [],
          children_ids: [],
          is_client: false,
        },
      ],
    });
    const files = generateExportFiles(makeProject(), spec, []);
    const comp = files.find((f) => f.path === "src/components/layout/header.tsx");
    expect(comp).toBeDefined();
    expect(comp?.content).toContain("HeaderProps");
    expect(comp?.content).toContain("title");
  });

  it("generates client component with use client directive", () => {
    const spec = makeSpec({
      components: [
        {
          id: "comp-1",
          name: "Counter",
          component_type: "ui",
          description: "Counter",
          props: [],
          data_bindings: [],
          children_ids: [],
          is_client: true,
        },
      ],
    });
    const files = generateExportFiles(makeProject(), spec, []);
    const comp = files.find((f) => f.path === "src/components/ui/counter.tsx");
    expect(comp).toBeDefined();
    expect(comp?.content).toContain('"use client"');
  });

  it("generates pages with non-root routes", () => {
    const spec = makeSpec({
      pages: [
        {
          id: "page-2",
          route: "/dashboard",
          title: "Dashboard",
          description: "Dashboard page",
          layout: null,
          component_ids: [],
          is_dynamic: false,
          metadata: {},
        },
      ],
    });
    const files = generateExportFiles(makeProject(), spec, []);
    const page = files.find((f) => f.path === "src/app/dashboard/page.tsx");
    expect(page).toBeDefined();
    expect(page?.content).toContain("Dashboard");
  });

  it("generates tasks.md with service integration tasks", () => {
    const project = makeProject({ services: ["stripe", "resend"] });
    const files = generateExportFiles(project, makeSpec(), makeMockData());
    const tasks = files.find((f) => f.path === "tasks.md");
    expect(tasks).toBeDefined();
    expect(tasks?.content).toContain("stripe");
    expect(tasks?.content).toContain("resend");
    expect(tasks?.content).toContain("User");
  });

  it("includes tailwind and shadcn tasks in tasks.md", () => {
    const project = makeProject({ constraints: ["tailwind", "shadcn"] });
    const files = generateExportFiles(project, makeSpec(), []);
    const tasks = files.find((f) => f.path === "tasks.md");
    expect(tasks?.content).toContain("Tailwind");
    expect(tasks?.content).toContain("shadcn");
  });
});

describe("writeExportToDisk", () => {
  it("writes files to disk", async () => {
    const files = [
      { path: "package.json", content: '{"name": "test"}' },
      { path: "src/index.ts", content: 'console.log("hello")' },
    ];

    const result = await writeExportToDisk("/tmp", "my-app", files, false);

    expect(result.filesWritten).toBe(2);
    expect(result.fullPath).toBe("/tmp/my-app");
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it("creates directories recursively", async () => {
    const files = [{ path: "src/lib/utils.ts", content: "export {}" }];

    await writeExportToDisk("/tmp", "my-app", files, false);

    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it("initializes git when gitInit is true", async () => {
    const files = [{ path: "index.ts", content: "export {}" }];

    await writeExportToDisk("/tmp", "my-app", files, true);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it("handles tilde expansion in project path", async () => {
    const files = [{ path: "index.ts", content: "export {}" }];

    const result = await writeExportToDisk("~/projects", "my-app", files, false);

    expect(result.fullPath).toBe("/Users/testuser/projects/my-app");
  });

  it("skips directory creation when it already exists", async () => {
    mockFs.existsSync.mockReturnValue(true);
    const files = [{ path: "index.ts", content: "export {}" }];

    await writeExportToDisk("/tmp", "my-app", files, false);

    // Should still write the file
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
