import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  },
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));
vi.mock("@/lib/constants", () => ({
  DEFAULT_EXCLUDE_PATTERNS: ["node_modules", "dist", ".next"],
  LOCKFILE_TO_PM: {
    "pnpm-lock.yaml": "pnpm",
    "package-lock.json": "npm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
  },
  MONOREPO_INDICATORS: ["pnpm-workspace.yaml", "turbo.json", "lerna.json"],
  REPO_TYPE_INDICATORS: {
    nextjs: ["next.config.js", "next.config.mjs", "next.config.ts"],
    react: ["vite.config.ts"],
  },
}));

import fs from "node:fs";
import { discoverRepos } from "./scanner";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

function makeDirent(name: string, isDir: boolean, isFile = false): fs.Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => isFile,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "",
    path: "",
  } as fs.Dirent;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("discoverRepos", () => {
  it("discovers a git repo in a root directory", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      if (path.includes("pnpm-lock.yaml")) return true;
      if (path.endsWith("package.json")) return true;
      if (path.endsWith(".git/config")) return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent("my-app", true)] as unknown as fs.Dirent[];
      }
      if (path.endsWith("my-app")) {
        return [makeDirent(".git", true), makeDirent("package.json", false, true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
      // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    }) as any);

    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return JSON.stringify({ name: "my-app" });
      if (path.endsWith("config")) return '[remote "origin"]\n\turl = https://github.com/user/my-app.git';
      if (path.endsWith("HEAD")) return "ref: refs/heads/main";
      return "";
    });

    mockStatSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith(".git")) return { isDirectory: () => true } as fs.Stats;
      return { mtime: new Date("2024-01-01") } as fs.Stats;
    });

    const repos = discoverRepos({ roots: ["/projects"], maxDepth: 2 });
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("my-app");
    expect(repos[0].packageManager).toBe("pnpm");
    expect(repos[0].gitRemote).toContain("github.com");
    expect(repos[0].defaultBranch).toBe("main");
  });

  it("skips non-existent root directories", () => {
    mockExistsSync.mockReturnValue(false);
    const progress: string[] = [];
    const repos = discoverRepos({
      roots: ["/nonexistent"],
      onProgress: (msg) => progress.push(msg),
    });
    expect(repos).toHaveLength(0);
    expect(progress.some((m) => m.includes("not found"))).toBe(true);
  });

  it("skips excluded directories", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent("node_modules", true), makeDirent("dist", true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
      // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    }) as any);

    const repos = discoverRepos({ roots: ["/projects"] });
    expect(repos).toHaveLength(0);
  });

  it("skips hidden directories", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent(".hidden", true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
      // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    }) as any);

    const repos = discoverRepos({ roots: ["/projects"] });
    expect(repos).toHaveLength(0);
  });

  it("detects monorepo via pnpm-workspace.yaml", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent("mono", true)] as unknown as fs.Dirent[];
      }
      if (path.endsWith("mono")) {
        return [makeDirent(".git", true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
      // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdirSync overloads
    }) as any);

    mockStatSync.mockImplementation(() => {
      return { isDirectory: () => true, mtime: new Date() } as fs.Stats;
    });

    mockReadFileSync.mockReturnValue("{}");

    const repos = discoverRepos({ roots: ["/projects"] });
    expect(repos).toHaveLength(1);
    expect(repos[0].isMonorepo).toBe(true);
  });

  it("respects maxDepth", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent("level1", true)] as unknown as fs.Dirent[];
      }
      if (path.endsWith("level1")) {
        return [makeDirent("level2", true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as any);

    const repos = discoverRepos({ roots: ["/projects"], maxDepth: 1 });
    expect(repos).toHaveLength(0);
  });

  it("expands tilde in root paths", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      return path === "/home/user/projects";
    });

    mockReaddirSync.mockReturnValue([] as any);

    const repos = discoverRepos({ roots: ["~/projects"] });
    expect(repos).toHaveLength(0);
  });

  it("falls back to directory name when package.json has no name", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path === "/projects") return true;
      if (path.endsWith("package.json")) return true;
      return false;
    });

    mockReaddirSync.mockImplementation(((p: unknown) => {
      const path = p as string;
      if (path === "/projects") {
        return [makeDirent("unnamed", true)] as unknown as fs.Dirent[];
      }
      if (path.endsWith("unnamed")) {
        return [makeDirent(".git", true)] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as any);

    mockReadFileSync.mockReturnValue(JSON.stringify({}));
    mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: new Date() } as fs.Stats);

    const repos = discoverRepos({ roots: ["/projects"] });
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("unnamed");
  });
});
