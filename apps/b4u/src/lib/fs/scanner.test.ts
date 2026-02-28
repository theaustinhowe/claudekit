import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFileTree,
  detectAuth,
  detectDatabase,
  detectFramework,
  detectKeyDirectories,
  readDirectory,
} from "@/lib/fs/scanner";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, stat } from "node:fs/promises";
import { cast } from "@claudekit/test-utils";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "",
    parentPath: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readDirectory", () => {
  it("returns sorted file entries with directories first", async () => {
    mockReaddir.mockResolvedValue(
      cast([makeDirent("file.ts", false), makeDirent("src", true), makeDirent("README.md", false)]),
    );
    mockStat.mockResolvedValue(cast({ size: 1024, isDirectory: () => false, isFile: () => true }));

    const result = await readDirectory("/project");
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("directory");
    expect(result[0].name).toBe("src");
    expect(result[1].name).toBe("file.ts");
    expect(result[2].name).toBe("README.md");
  });

  it("skips node_modules and .git directories", async () => {
    mockReaddir.mockResolvedValue(
      cast([makeDirent("node_modules", true), makeDirent(".git", true), makeDirent("src", true)]),
    );

    const result = await readDirectory("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("skips .DS_Store and .env files", async () => {
    mockReaddir.mockResolvedValue(
      cast([makeDirent(".DS_Store", false), makeDirent(".env", false), makeDirent("index.ts", false)]),
    );
    mockStat.mockResolvedValue(cast({ size: 100, isDirectory: () => false, isFile: () => true }));

    const result = await readDirectory("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("index.ts");
  });

  it("returns empty array on error", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await readDirectory("/nonexistent");
    expect(result).toEqual([]);
  });

  it("handles stat errors gracefully, defaulting size to 0", async () => {
    mockReaddir.mockResolvedValue(cast([makeDirent("broken.ts", false)]));
    mockStat.mockRejectedValue(new Error("EACCES"));

    const result = await readDirectory("/project");
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(0);
  });
});

describe("buildFileTree", () => {
  it("builds a tree structure with nested directories", async () => {
    mockReaddir
      .mockResolvedValueOnce(cast([makeDirent("src", true), makeDirent("package.json", false)]))
      .mockResolvedValueOnce(cast([makeDirent("index.ts", false)]));

    const tree = await buildFileTree("/project");
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("src");
    expect(tree[0].type).toBe("directory");
    expect(tree[0].children).toEqual([{ name: "index.ts", type: "file" }]);
    expect(tree[1].name).toBe("package.json");
    expect(tree[1].type).toBe("file");
  });

  it("respects maxDepth", async () => {
    mockReaddir
      .mockResolvedValueOnce(cast([makeDirent("level1", true)]))
      .mockResolvedValueOnce(cast([makeDirent("level2", true)]));

    const tree = await buildFileTree("/project", 1);
    expect(tree[0].name).toBe("level1");
    expect(tree[0].children).toEqual([{ name: "level2", type: "directory" }]);
  });

  it("skips ignored directories", async () => {
    mockReaddir.mockResolvedValue(
      cast([makeDirent("node_modules", true), makeDirent(".next", true), makeDirent("app", true)]),
    );
    mockReaddir.mockResolvedValueOnce(
      cast([makeDirent("node_modules", true), makeDirent(".next", true), makeDirent("app", true)]),
    );
    mockReaddir.mockResolvedValueOnce(cast([]));

    const tree = await buildFileTree("/project");
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("app");
  });

  it("returns empty array on error", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const tree = await buildFileTree("/nonexistent");
    expect(tree).toEqual([]);
  });
});

describe("detectFramework", () => {
  it("detects Next.js with App Router", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { next: "^14.2.0", react: "^18.0.0" } })));
    mockStat.mockImplementation(async (path) => {
      if (String(path).endsWith("/app")) return cast({ isDirectory: () => true });
      throw new Error("ENOENT");
    });

    const result = await detectFramework("/project");
    expect(result).toBe("Next.js 14.2.0 (App Router)");
  });

  it("detects Next.js with Pages Router", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { next: "~13.4.0" } })));
    mockStat.mockRejectedValue(new Error("ENOENT"));

    const result = await detectFramework("/project");
    expect(result).toBe("Next.js 13.4.0 (Pages Router)");
  });

  it("detects Nuxt", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { nuxt: "^3.8.0" } })));

    const result = await detectFramework("/project");
    expect(result).toBe("Nuxt 3.8.0");
  });

  it("detects SvelteKit", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.0.0" } })));

    const result = await detectFramework("/project");
    expect(result).toBe("SvelteKit 2.0.0");
  });

  it("detects Vite with React", async () => {
    mockReadFile.mockResolvedValue(
      cast(JSON.stringify({ devDependencies: { vite: "^5.0.0" }, dependencies: { react: "^18.0.0" } })),
    );

    const result = await detectFramework("/project");
    expect(result).toBe("Vite 5.0.0 (React)");
  });

  it("detects Vite with Vue", async () => {
    mockReadFile.mockResolvedValue(
      cast(JSON.stringify({ devDependencies: { vite: "^5.0.0" }, dependencies: { vue: "^3.0.0" } })),
    );

    const result = await detectFramework("/project");
    expect(result).toBe("Vite 5.0.0 (Vue)");
  });

  it("detects plain Vite without framework qualifier", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ devDependencies: { vite: "^5.0.0" } })));

    const result = await detectFramework("/project");
    expect(result).toBe("Vite 5.0.0");
  });

  it("detects Express", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { express: "^4.18.0" } })));

    const result = await detectFramework("/project");
    expect(result).toBe("Express 4.18.0");
  });

  it("detects Fastify", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { fastify: "^4.0.0" } })));

    const result = await detectFramework("/project");
    expect(result).toBe("Fastify 4.0.0");
  });

  it("falls back to Python when requirements.txt exists", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockStat.mockImplementation(async (path) => {
      if (String(path).endsWith("requirements.txt")) return cast({ isFile: () => true });
      throw new Error("ENOENT");
    });

    const result = await detectFramework("/project");
    expect(result).toBe("Python");
  });

  it("falls back to Rust when Cargo.toml exists", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockStat.mockImplementation(async (path) => {
      if (String(path).endsWith("Cargo.toml")) return cast({ isFile: () => true });
      throw new Error("ENOENT");
    });

    const result = await detectFramework("/project");
    expect(result).toBe("Rust");
  });

  it("returns Unknown when nothing matches", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockStat.mockRejectedValue(new Error("ENOENT"));

    const result = await detectFramework("/project");
    expect(result).toBe("Unknown");
  });

  it("cleans version prefixes", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { next: ">=14.0.0" } })));
    mockStat.mockRejectedValue(new Error("ENOENT"));

    const result = await detectFramework("/project");
    expect(result).toContain("14.0.0");
    expect(result).not.toContain(">=");
  });
});

describe("detectAuth", () => {
  it("detects NextAuth", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { "next-auth": "^4.0.0" } })));
    const result = await detectAuth("/project");
    expect(result).toBe("NextAuth");
  });

  it("detects Clerk", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { "@clerk/nextjs": "^5.0.0" } })));
    const result = await detectAuth("/project");
    expect(result).toBe("Clerk");
  });

  it("detects Passport.js", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { passport: "^0.7.0" } })));
    const result = await detectAuth("/project");
    expect(result).toBe("Passport.js");
  });

  it("detects custom auth from directory structure", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: {} })));
    mockStat.mockImplementation(async (path) => {
      if (String(path).endsWith("src/auth")) return cast({ isDirectory: () => true });
      throw new Error("ENOENT");
    });
    const result = await detectAuth("/project");
    expect(result).toBe("Custom auth detected");
  });

  it("returns None detected when no auth found", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: {} })));
    mockStat.mockRejectedValue(new Error("ENOENT"));
    const result = await detectAuth("/project");
    expect(result).toBe("None detected");
  });
});

describe("detectDatabase", () => {
  it("detects Prisma with PostgreSQL", async () => {
    mockReadFile.mockImplementation(async (path) => {
      if (String(path).endsWith("package.json")) {
        return cast(JSON.stringify({ dependencies: { "@prisma/client": "^5.0.0" } }));
      }
      if (String(path).endsWith("schema.prisma")) {
        return cast('provider = "postgresql"');
      }
      throw new Error("ENOENT");
    });

    const result = await detectDatabase("/project");
    expect(result).toBe("Prisma (PostgreSQL)");
  });

  it("detects Prisma without provider", async () => {
    mockReadFile.mockImplementation(async (path) => {
      if (String(path).endsWith("package.json")) {
        return cast(JSON.stringify({ devDependencies: { prisma: "^5.0.0" } }));
      }
      throw new Error("ENOENT");
    });

    const result = await detectDatabase("/project");
    expect(result).toBe("Prisma");
  });

  it("detects Drizzle ORM", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { "drizzle-orm": "^0.29.0" } })));
    const result = await detectDatabase("/project");
    expect(result).toBe("Drizzle ORM");
  });

  it("detects MongoDB via Mongoose", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { mongoose: "^8.0.0" } })));
    const result = await detectDatabase("/project");
    expect(result).toBe("MongoDB (Mongoose)");
  });

  it("detects DuckDB", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: { "@duckdb/node-api": "^1.0.0" } })));
    const result = await detectDatabase("/project");
    expect(result).toBe("DuckDB");
  });

  it("detects PostgreSQL from docker-compose", async () => {
    mockReadFile.mockImplementation(async (path) => {
      if (String(path).endsWith("package.json")) {
        return cast(JSON.stringify({ dependencies: {} }));
      }
      if (String(path).endsWith("docker-compose.yml")) {
        return cast("services:\n  db:\n    image: postgres:16");
      }
      throw new Error("ENOENT");
    });

    const result = await detectDatabase("/project");
    expect(result).toBe("PostgreSQL (Docker)");
  });

  it("returns None detected when no database found", async () => {
    mockReadFile.mockResolvedValue(cast(JSON.stringify({ dependencies: {} })));
    const result = await detectDatabase("/project");
    expect(result).toBe("None detected");
  });
});

describe("detectKeyDirectories", () => {
  it("returns directories that exist", async () => {
    mockStat.mockImplementation(async (path) => {
      const p = String(path);
      if (p.endsWith("/src") || p.endsWith("/app") || p.endsWith("/components")) {
        return cast({ isDirectory: () => true });
      }
      throw new Error("ENOENT");
    });

    const result = await detectKeyDirectories("/project");
    expect(result).toContain("src");
    expect(result).toContain("app");
    expect(result).toContain("components");
    expect(result).not.toContain("pages");
  });

  it("returns empty array when no candidate directories exist", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));
    const result = await detectKeyDirectories("/project");
    expect(result).toEqual([]);
  });
});
