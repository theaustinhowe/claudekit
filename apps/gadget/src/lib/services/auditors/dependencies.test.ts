import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import type { Policy } from "@/lib/types";
import { auditDependencies } from "./dependencies";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Test Policy",
    description: "",
    expected_versions: {} as Record<string, string>,
    banned_dependencies: [] as Array<{ name: string; replacement?: string; reason: string }>,
    allowed_package_managers: [] as string[],
    preferred_package_manager: "pnpm",
    ignore_patterns: [] as string[],
    repo_types: [] as string[],
    is_builtin: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Policy;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auditDependencies", () => {
  it("returns a finding when package.json is missing", () => {
    mockExistsSync.mockReturnValue(false);
    const findings = auditDependencies("/repo", makePolicy());
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Missing package.json");
    expect(findings[0].severity).toBe("warning");
  });

  it("returns empty findings when package.json exists with no issues", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { react: "^18.2.0" } }));
    const findings = auditDependencies("/repo", makePolicy());
    expect(findings).toHaveLength(0);
  });

  it("detects outdated dependencies via caret range", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { react: "^17.0.0" } }));
    const policy = makePolicy({ expected_versions: { react: "^18.0.0" } });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Outdated: react");
    expect(findings[0].severity).toBe("warning");
  });

  it("does not flag when version satisfies caret range", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { react: "^18.3.0" } }));
    const policy = makePolicy({ expected_versions: { react: "^18.2.0" } });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(0);
  });

  it("detects outdated dependencies via >= range", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { node: "16.0.0" } }));
    const policy = makePolicy({ expected_versions: { node: ">=18.0" } });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Outdated: node");
  });

  it("does not flag when version satisfies >= range", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { node: "20.0.0" } }));
    const policy = makePolicy({ expected_versions: { node: ">=18.0" } });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(0);
  });

  it("skips expected version check when dependency is not present", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
    const policy = makePolicy({ expected_versions: { react: "^18.0.0" } });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(0);
  });

  it("detects banned dependencies", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { moment: "^2.29.0" } }));
    const policy = makePolicy({
      banned_dependencies: [{ name: "moment", replacement: "date-fns", reason: "Use date-fns instead" }],
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].title).toBe("Banned dependency: moment");
    expect(findings[0].suggestedActions).toContain("Replace with date-fns");
  });

  it("does not flag when banned dependency is not present", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { "date-fns": "^3.0.0" } }));
    const policy = makePolicy({
      banned_dependencies: [{ name: "moment", reason: "Deprecated" }],
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(0);
  });

  it("detects non-preferred package manager via lockfile", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      if (path.endsWith("yarn.lock")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
    const policy = makePolicy({
      allowed_package_managers: ["pnpm"],
      preferred_package_manager: "pnpm",
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Non-preferred package manager: yarn");
  });

  it("does not flag when using an allowed package manager", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("package.json")) return true;
      if (path.endsWith("pnpm-lock.yaml")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
    const policy = makePolicy({
      allowed_package_managers: ["pnpm"],
      preferred_package_manager: "pnpm",
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(0);
  });

  it("checks devDependencies for banned deps", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ devDependencies: { tslint: "^5.0.0" } }));
    const policy = makePolicy({
      banned_dependencies: [{ name: "tslint", reason: "Use eslint or biome" }],
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Banned dependency: tslint");
  });

  it("handles invalid package.json gracefully", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not json");
    const findings = auditDependencies("/repo", makePolicy());
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Missing package.json");
  });

  it("banned dependency without replacement does not include replacement action", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { lodash: "^4.0.0" } }));
    const policy = makePolicy({
      banned_dependencies: [{ name: "lodash", reason: "Use native methods" }],
    });
    const findings = auditDependencies("/repo", policy);
    expect(findings[0].suggestedActions).toEqual(["Remove lodash"]);
  });
});
