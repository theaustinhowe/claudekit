import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

import fs from "node:fs";
import type { Policy } from "@/lib/types";
import { auditStructure, resolveWorkspacePackages } from "./structure";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

const stubPolicy = {
  id: "p1",
  name: "Test",
} as Policy;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auditStructure", () => {
  it("flags missing scripts", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ scripts: {} }));

    const findings = auditStructure("/repo", stubPolicy);
    const missingScripts = findings.filter((f) => f.title.startsWith("Missing script:"));
    expect(missingScripts.length).toBeGreaterThanOrEqual(4);
    expect(missingScripts.map((f) => f.title)).toContain("Missing script: dev");
    expect(missingScripts.map((f) => f.title)).toContain("Missing script: build");
    expect(missingScripts.map((f) => f.title)).toContain("Missing script: test");
    expect(missingScripts.map((f) => f.title)).toContain("Missing script: lint");
  });

  it("does not flag present scripts", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      if (path.endsWith("tsconfig.json")) return true;
      if (path.endsWith("biome.json")) return true;
      if (path.endsWith(".gitignore")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) {
        return JSON.stringify({
          scripts: {
            dev: "next dev",
            build: "next build",
            test: "vitest",
            lint: "biome check .",
            format: "biome format --write .",
          },
        });
      }
      if (path.endsWith("tsconfig.json")) {
        return JSON.stringify({ compilerOptions: { strict: true, paths: { "@/*": ["./src/*"] } } });
      }
      return "";
    });

    const findings = auditStructure("/repo", stubPolicy);
    const scriptFindings = findings.filter((f) => f.title.startsWith("Missing script:"));
    expect(scriptFindings).toHaveLength(0);
  });

  it("flags missing format script", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: "x", build: "x", test: "x", lint: "x" },
      }),
    );

    const findings = auditStructure("/repo", stubPolicy);
    const formatFinding = findings.find((f) => f.title === "Missing format script");
    expect(formatFinding).toBeDefined();
    expect(formatFinding?.severity).toBe("info");
  });

  it("accepts biome check in any script as a format script", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      if (path.endsWith("tsconfig.json")) return true;
      if (path.endsWith("biome.json")) return true;
      if (path.endsWith(".gitignore")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) {
        return JSON.stringify({
          scripts: { dev: "x", build: "x", test: "x", lint: "biome check ." },
        });
      }
      if (path.endsWith("tsconfig.json")) {
        return JSON.stringify({ compilerOptions: { strict: true, paths: {} } });
      }
      return "";
    });

    const findings = auditStructure("/repo", stubPolicy);
    const formatFinding = findings.find((f) => f.title === "Missing format script");
    expect(formatFinding).toBeUndefined();
  });

  it("flags missing config files", () => {
    mockExistsSync.mockReturnValue(false);

    const findings = auditStructure("/repo", stubPolicy);
    const configFindings = findings.filter((f) => f.title.startsWith("Missing config:"));
    expect(configFindings.length).toBeGreaterThanOrEqual(3);
    expect(configFindings.map((f) => f.title)).toContain("Missing config: tsconfig.json");
    expect(configFindings.map((f) => f.title)).toContain("Missing config: biome.json");
    expect(configFindings.map((f) => f.title)).toContain("Missing config: .gitignore");
  });

  it("accepts alternative config files (e.g. eslint.config.js for biome.json)", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("eslint.config.js")) return true;
      if (path.endsWith("tsconfig.json")) return true;
      if (path.endsWith(".gitignore")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("tsconfig.json")) {
        return JSON.stringify({ compilerOptions: { strict: true, paths: {} } });
      }
      return "";
    });

    const findings = auditStructure("/repo", stubPolicy);
    const biomeFinding = findings.find((f) => f.title === "Missing config: biome.json");
    expect(biomeFinding).toBeUndefined();
  });

  it("flags tsconfig without strict mode", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("tsconfig.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ compilerOptions: {} }));

    const findings = auditStructure("/repo", stubPolicy);
    const strictFinding = findings.find((f) => f.title === "TypeScript strict mode disabled");
    expect(strictFinding).toBeDefined();
  });

  it("flags tsconfig without path aliases", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("tsconfig.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ compilerOptions: { strict: true } }));

    const findings = auditStructure("/repo", stubPolicy);
    const pathsFinding = findings.find((f) => f.title === "No path aliases configured");
    expect(pathsFinding).toBeDefined();
    expect(pathsFinding?.severity).toBe("info");
  });

  it("flags missing turbo.json in monorepo", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      return false;
    });

    const findings = auditStructure("/repo", stubPolicy);
    const turboFinding = findings.find((f) => f.title === "Missing turbo.json");
    expect(turboFinding).toBeDefined();
    expect(turboFinding?.severity).toBe("info");
  });

  it("flags invalid package.json", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("not valid json {{{");

    const findings = auditStructure("/repo", stubPolicy);
    const invalidFinding = findings.find((f) => f.title === "Invalid package.json");
    expect(invalidFinding).toBeDefined();
  });

  it("flags workspace packages missing package.json", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("/packages")) return path.endsWith("/packages");
      return false;
    });
    mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    mockReaddirSync.mockReturnValue([
      { name: "utils", isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
    ] as any);

    const findings = auditStructure("/repo", stubPolicy);
    const wsPkgFinding = findings.find((f) => f.title === "Missing package.json in workspace: utils");
    expect(wsPkgFinding).toBeDefined();
  });
});

describe("resolveWorkspacePackages", () => {
  it("resolves packages from pnpm-workspace.yaml", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("/packages")) return true;
      if (path.endsWith("/packages/ui/package.json")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("pnpm-workspace.yaml")) return "packages:\n  - packages/*\n";
      if (path.endsWith("/packages/ui/package.json")) return JSON.stringify({ name: "@myorg/ui" });
      return "";
    });
    mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    mockReaddirSync.mockReturnValue([
      { name: "ui", isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
    ] as any);

    const packages = resolveWorkspacePackages("/repo");
    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("@myorg/ui");
  });

  it("falls back to package.json workspaces", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("pnpm-workspace.yaml")) return false;
      if (path.endsWith("package.json") && !path.includes("apps")) return true;
      if (path.endsWith("/apps")) return true;
      if (path.endsWith("/apps/web/package.json")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("/repo/package.json")) return JSON.stringify({ workspaces: ["apps/*"] });
      if (path.endsWith("/apps/web/package.json")) return JSON.stringify({ name: "web" });
      return "";
    });
    mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    mockReaddirSync.mockReturnValue([
      { name: "web", isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
    ] as any);

    const packages = resolveWorkspacePackages("/repo");
    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("web");
  });

  it("returns empty when no workspace config found", () => {
    mockExistsSync.mockReturnValue(false);
    const packages = resolveWorkspacePackages("/repo");
    expect(packages).toHaveLength(0);
  });
});
