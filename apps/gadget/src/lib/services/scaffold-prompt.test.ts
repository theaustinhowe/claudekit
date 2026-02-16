import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants", () => ({
  CONSTRAINT_OPTIONS: [
    { id: "typescript-strict", label: "TypeScript Strict", defaultOn: true },
    { id: "biome", label: "Biome (Lint + Format)", defaultOn: true },
    { id: "tailwind", label: "Tailwind CSS", defaultOn: true },
  ],
  PLATFORMS: [
    { id: "nextjs", label: "Next.js App Router", description: "Full-stack React with server components" },
    { id: "react-spa", label: "React SPA", description: "Client-side React with Vite" },
    { id: "node-api", label: "Node.js API", description: "Backend REST/GraphQL server" },
    { id: "monorepo", label: "Monorepo", description: "Multi-package workspace" },
    { id: "cli", label: "CLI Tool", description: "Command-line application" },
  ],
}));
vi.mock("@/lib/services/interface-design", () => ({
  VIBE_TRAITS: {
    "precision-density": {
      spacing: "Compact",
      typography: "Mono",
      radius: "Sharp",
      patterns: "Data tables, status indicators, compact cards.",
    },
  },
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));

import type { GeneratorProject } from "@/lib/types";
import {
  buildEnvSetupPrompt,
  buildImplementationPrompt,
  buildPrototypePrompt,
  buildUpgradePlanPrompt,
  buildUpgradeTaskPrompt,
} from "./scaffold-prompt";

function makeProject(overrides: Partial<GeneratorProject> = {}): GeneratorProject {
  return {
    id: "proj1",
    title: "My App",
    idea_description: "A cool web app",
    platform: "nextjs",
    package_manager: "pnpm",
    project_name: "my-app",
    project_path: "~/projects",
    services: [],
    constraints: [],
    status: "draft",
    created_at: "2024-01-01",
    ...overrides,
  } as GeneratorProject;
}

describe("buildPrototypePrompt", () => {
  it("includes project title and description", () => {
    const prompt = buildPrototypePrompt(makeProject());
    expect(prompt).toContain('"My App"');
    expect(prompt).toContain("A cool web app");
  });

  it("includes platform-specific setup instructions for Next.js", () => {
    const prompt = buildPrototypePrompt(makeProject({ platform: "nextjs" }));
    expect(prompt).toContain("Next.js App Router");
    expect(prompt).toContain("create next-app");
  });

  it("includes platform-specific setup for react-spa", () => {
    const prompt = buildPrototypePrompt(makeProject({ platform: "react-spa" }));
    expect(prompt).toContain("React SPA");
    expect(prompt).toContain("create vite");
  });

  it("includes platform-specific setup for node-api", () => {
    const prompt = buildPrototypePrompt(makeProject({ platform: "node-api" }));
    expect(prompt).toContain("Node.js API");
    expect(prompt).toContain("Express or Hono");
  });

  it("includes platform-specific setup for monorepo", () => {
    const prompt = buildPrototypePrompt(makeProject({ platform: "monorepo" }));
    expect(prompt).toContain("Monorepo");
    expect(prompt).toContain("workspaces");
  });

  it("includes platform-specific setup for cli", () => {
    const prompt = buildPrototypePrompt(makeProject({ platform: "cli" }));
    expect(prompt).toContain("CLI Tool");
    expect(prompt).toContain("Commander.js");
  });

  it("includes constraints when specified", () => {
    const prompt = buildPrototypePrompt(makeProject({ constraints: ["typescript-strict", "biome"] }));
    expect(prompt).toContain("## Constraints");
    expect(prompt).toContain("TypeScript Strict");
    expect(prompt).toContain("Biome (Lint + Format)");
  });

  it("includes services section with mock note", () => {
    const prompt = buildPrototypePrompt(makeProject({ services: ["supabase-auth", "stripe"] }));
    expect(prompt).toContain("## Services (Mock Only)");
    expect(prompt).toContain("Supabase Auth");
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("hardcoded mock/sample data");
  });

  it("includes design direction when vibes are specified", () => {
    const prompt = buildPrototypePrompt(
      makeProject({ design_vibes: ["precision-density"] } as Partial<GeneratorProject>),
    );
    expect(prompt).toContain("## Design Direction");
    expect(prompt).toContain("precision-density");
  });

  it("includes color scheme", () => {
    const prompt = buildPrototypePrompt(
      makeProject({ color_scheme: { primary: "#3b82f6", accent: "#10b981" } } as Partial<GeneratorProject>),
    );
    expect(prompt).toContain("#3b82f6");
    expect(prompt).toContain("#10b981");
  });

  it("includes prototype requirements with correct project path", () => {
    const prompt = buildPrototypePrompt(makeProject());
    expect(prompt).toContain("/home/user/projects/my-app");
    expect(prompt).toContain("Use pnpm as the package manager");
  });

  it("omits constraints section when empty", () => {
    const prompt = buildPrototypePrompt(makeProject({ constraints: [] }));
    expect(prompt).not.toContain("## Constraints");
  });

  it("omits services section when empty", () => {
    const prompt = buildPrototypePrompt(makeProject({ services: [] }));
    expect(prompt).not.toContain("## Services");
  });
});

describe("buildImplementationPrompt", () => {
  it("includes service integration details", () => {
    const prompt = buildImplementationPrompt(makeProject({ services: ["supabase-auth"] }));
    expect(prompt).toContain("## Service Integrations");
    expect(prompt).toContain("Supabase Auth");
    expect(prompt).toContain("@supabase/supabase-js");
  });

  it("includes instructions for various services", () => {
    const services = ["clerk", "prisma", "stripe", "resend", "posthog"];
    const prompt = buildImplementationPrompt(makeProject({ services }));
    expect(prompt).toContain("Clerk");
    expect(prompt).toContain("Prisma");
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("Resend");
    expect(prompt).toContain("PostHog");
  });

  it("includes implementation guidelines", () => {
    const prompt = buildImplementationPrompt(makeProject());
    expect(prompt).toContain("## Implementation Guidelines");
    expect(prompt).toContain("Replace ALL hardcoded mock/sample data");
  });
});

describe("buildUpgradePlanPrompt", () => {
  it("includes implementation prompt and project directory", () => {
    const result = buildUpgradePlanPrompt("impl prompt content", "/project/dir");
    expect(result).toContain("impl prompt content");
    expect(result).toContain("/project/dir");
    expect(result).toContain("JSON array of tasks");
  });
});

describe("buildEnvSetupPrompt", () => {
  it("includes project directory and services", () => {
    const result = buildEnvSetupPrompt("/project/dir", ["supabase-auth", "stripe"]);
    expect(result).toContain("/project/dir");
    expect(result).toContain("supabase-auth, stripe");
    expect(result).toContain("environment variables");
  });
});

describe("buildUpgradeTaskPrompt", () => {
  it("includes task details and implementation context", () => {
    const result = buildUpgradeTaskPrompt("Set up auth", "Install and configure Clerk", "impl details", "/dir");
    expect(result).toContain("Set up auth");
    expect(result).toContain("Install and configure Clerk");
    expect(result).toContain("impl details");
    expect(result).toContain("/dir");
  });

  it("handles null description", () => {
    const result = buildUpgradeTaskPrompt("Task", null, "impl", "/dir");
    expect(result).toContain("Task");
  });
});
