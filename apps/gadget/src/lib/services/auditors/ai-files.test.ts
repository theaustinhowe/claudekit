import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { auditAIFiles, scanAIFiles } from "./ai-files";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("scanAIFiles", () => {
  it("marks all files as not present when none exist", () => {
    mockExistsSync.mockReturnValue(false);

    const results = scanAIFiles("/repo");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.present).toBe(false);
    }
  });

  it("marks README as present and assesses quality", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("README.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(
      `# My Project\n\nA great project for doing things.\n\n## Installation\n\npnpm install\n\n## Usage\n\nRun the app.\n\n## Architecture\n\nSimple design.\n\n## API\n\nREST endpoints.\n\n## Configuration\n\nSet env vars.\n`,
    );

    const results = scanAIFiles("/repo");
    const readme = results.find((r) => r.name === "README");
    expect(readme).toBeDefined();
    expect(readme?.present).toBe(true);
    expect(readme?.quality).toBeGreaterThan(0);
  });

  it("assigns low quality for very short non-README files", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("CLAUDE.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("# Short");

    const results = scanAIFiles("/repo");
    const claude = results.find((r) => r.name === "CLAUDE.md");
    expect(claude).toBeDefined();
    expect(claude?.present).toBe(true);
    expect(claude?.quality).toBe(20);
    expect(claude?.suggestions).toBeDefined();
  });

  it("assigns higher quality for longer non-README files", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("CLAUDE.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("x".repeat(600));

    const results = scanAIFiles("/repo");
    const claude = results.find((r) => r.name === "CLAUDE.md");
    expect(claude?.quality).toBe(90);
  });
});

describe("auditAIFiles", () => {
  it("returns findings for all missing AI files", () => {
    mockExistsSync.mockReturnValue(false);

    const findings = auditAIFiles("/repo");
    expect(findings.length).toBeGreaterThan(0);
    const readmeFinding = findings.find((f) => f.title === "Missing: README");
    expect(readmeFinding).toBeDefined();
    expect(readmeFinding?.severity).toBe("critical");

    const claudeFinding = findings.find((f) => f.title === "Missing: CLAUDE.md");
    expect(claudeFinding).toBeDefined();
    expect(claudeFinding?.severity).toBe("warning");

    const agentsFinding = findings.find((f) => f.title === "Missing: AGENTS.md");
    expect(agentsFinding).toBeDefined();
    expect(agentsFinding?.severity).toBe("info");
  });

  it("flags low quality README", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("README.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("# Title\n");

    const findings = auditAIFiles("/repo");
    const qualityFinding = findings.find((f) => f.title.includes("Low quality README"));
    expect(qualityFinding).toBeDefined();
    expect(qualityFinding?.severity).toBe("warning");
  });

  it("does not flag high quality README", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("README.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(
      `# My Project\n\nA comprehensive project description that is quite long.\n\n## Installation\n\npnpm install\n\n## Usage\n\nUsage examples\n\n## Scripts\n\nnpm run dev\n\n## Architecture\n\nOverview\n\n## API\n\nEndpoints\n\n## Configuration\n\nEnv vars\n`,
    );

    const findings = auditAIFiles("/repo");
    const qualityFinding = findings.find((f) => f.title.includes("Low quality README"));
    expect(qualityFinding).toBeUndefined();
  });

  it("flags minimal content files", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("CLAUDE.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("# Short");

    const findings = auditAIFiles("/repo");
    const minimalFinding = findings.find((f) => f.title === "Minimal content: CLAUDE.md");
    expect(minimalFinding).toBeDefined();
    expect(minimalFinding?.severity).toBe("info");
  });

  it("does not flag files with sufficient content", () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      if (path.endsWith("CONTRIBUTING.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("x".repeat(200));

    const findings = auditAIFiles("/repo");
    const minimalFinding = findings.find((f) => f.title === "Minimal content: CONTRIBUTING");
    expect(minimalFinding).toBeUndefined();
  });
});
