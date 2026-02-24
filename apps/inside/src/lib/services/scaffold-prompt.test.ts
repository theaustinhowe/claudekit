import { describe, expect, it } from "vitest";
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
    id: "proj-1",
    title: "Test App",
    idea_description: "A test application for testing",
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
    scaffold_logs: null,
    ...overrides,
  };
}

describe("buildPrototypePrompt", () => {
  it("includes project title and description", () => {
    const project = makeProject();
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Test App");
    expect(prompt).toContain("A test application for testing");
  });

  it("includes platform info for nextjs", () => {
    const project = makeProject({ platform: "nextjs" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Next.js App Router");
    expect(prompt).toContain("next-app");
  });

  it("includes platform info for react-spa", () => {
    const project = makeProject({ platform: "react-spa" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("React SPA");
    expect(prompt).toContain("vite");
  });

  it("includes platform info for node-api", () => {
    const project = makeProject({ platform: "node-api" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Node.js API");
  });

  it("includes platform info for monorepo", () => {
    const project = makeProject({ platform: "monorepo" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Monorepo");
    expect(prompt).toContain("workspaces");
  });

  it("includes platform info for cli", () => {
    const project = makeProject({ platform: "cli" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("CLI");
  });

  it("includes platform info for tanstack-start", () => {
    const project = makeProject({ platform: "tanstack-start" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("TanStack");
  });

  it("uses default for unknown platform", () => {
    const project = makeProject({ platform: "unknown-platform" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("TypeScript");
  });

  it("includes constraints section when constraints exist", () => {
    const project = makeProject({ constraints: ["typescript-strict", "biome"] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Constraints");
    expect(prompt).toContain("TypeScript Strict");
    expect(prompt).toContain("Biome");
  });

  it("omits constraints section when no constraints", () => {
    const project = makeProject({ constraints: [] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).not.toContain("## Constraints");
  });

  it("includes services as mock-only", () => {
    const project = makeProject({ services: ["supabase-auth", "stripe"] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Services (Mock Only)");
    expect(prompt).toContain("Supabase Auth");
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("mock/sample data");
  });

  it("omits services section when no services", () => {
    const project = makeProject({ services: [] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).not.toContain("Services (Mock Only)");
  });

  it("includes design vibes section", () => {
    const project = makeProject({
      design_vibes: ["precision-density"],
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Design Direction");
    expect(prompt).toContain("precision-density");
  });

  it("includes color scheme in design direction", () => {
    const project = makeProject({
      design_vibes: ["warmth-approachability"],
      color_scheme: { primary: "#3B82F6", accent: "#F59E0B" },
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Color Scheme");
    expect(prompt).toContain("#3B82F6");
    expect(prompt).toContain("#F59E0B");
  });

  it("includes inspiration URLs", () => {
    const project = makeProject({
      design_vibes: ["boldness-clarity"],
      inspiration_urls: ["https://example.com", "https://other.com"],
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Inspiration References");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("https://other.com");
  });

  it("includes design craft section when vibes exist", () => {
    const project = makeProject({
      design_vibes: ["sophistication-trust"],
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Design Craft");
    expect(prompt).toContain("SKILL.md");
  });

  it("includes prototype requirements", () => {
    const project = makeProject();
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("Prototype Requirements");
    expect(prompt).toContain("pnpm");
    expect(prompt).toContain("mock/sample data");
  });

  it("uses npm run dev for npm package manager", () => {
    const project = makeProject({ package_manager: "npm" });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("npm run");
  });

  it("handles unknown service label gracefully", () => {
    const project = makeProject({ services: ["unknown-service"] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("unknown-service");
  });

  it("handles unknown constraint label gracefully", () => {
    const project = makeProject({ constraints: ["unknown-constraint"] });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("unknown-constraint");
  });

  it("includes design vibes with only primary color", () => {
    const project = makeProject({
      design_vibes: ["playful"],
      color_scheme: { primary: "#FF0000" },
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("#FF0000");
  });

  it("includes design vibes with only accent color", () => {
    const project = makeProject({
      design_vibes: ["retro"],
      color_scheme: { accent: "#00FF00" },
    });
    const prompt = buildPrototypePrompt(project);
    expect(prompt).toContain("#00FF00");
  });
});

describe("buildImplementationPrompt", () => {
  it("includes project info", () => {
    const project = makeProject();
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Test App");
    expect(prompt).toContain("A test application for testing");
    expect(prompt).toContain("Next.js App Router");
    expect(prompt).toContain("pnpm");
  });

  it("includes implementation guidelines", () => {
    const project = makeProject();
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Implementation Guidelines");
    expect(prompt).toContain("Replace ALL hardcoded");
  });

  it("omits service integrations when no services", () => {
    const project = makeProject({ services: [] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).not.toContain("Service Integrations");
  });

  it("includes supabase-auth service details", () => {
    const project = makeProject({ services: ["supabase-auth"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Supabase Auth");
    expect(prompt).toContain("@supabase/supabase-js");
  });

  it("includes clerk service details", () => {
    const project = makeProject({ services: ["clerk"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Clerk");
    expect(prompt).toContain("@clerk/nextjs");
  });

  it("includes next-auth service details", () => {
    const project = makeProject({ services: ["next-auth"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("NextAuth.js");
    expect(prompt).toContain("NEXTAUTH_SECRET");
  });

  it("includes lucia service details", () => {
    const project = makeProject({ services: ["lucia"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Lucia");
  });

  it("includes supabase-db service details", () => {
    const project = makeProject({ services: ["supabase-db"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Supabase");
    expect(prompt).toContain("Database");
  });

  it("includes prisma service details", () => {
    const project = makeProject({ services: ["prisma"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Prisma");
    expect(prompt).toContain("@prisma/client");
  });

  it("includes drizzle service details", () => {
    const project = makeProject({ services: ["drizzle"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Drizzle");
    expect(prompt).toContain("drizzle-orm");
  });

  it("includes nhost service details", () => {
    const project = makeProject({ services: ["nhost"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Nhost");
    expect(prompt).toContain("@nhost/react");
  });

  it("includes postgres service details", () => {
    const project = makeProject({ services: ["postgres"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("PostgreSQL");
    expect(prompt).toContain("DATABASE_URL");
  });

  it("includes localstorage service details", () => {
    const project = makeProject({ services: ["localstorage"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("localStorage");
  });

  it("includes duckdb service details", () => {
    const project = makeProject({ services: ["duckdb"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("DuckDB");
  });

  it("includes stripe service details", () => {
    const project = makeProject({ services: ["stripe"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("STRIPE_SECRET_KEY");
  });

  it("includes lemon-squeezy service details", () => {
    const project = makeProject({ services: ["lemon-squeezy"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Lemon Squeezy");
  });

  it("includes resend service details", () => {
    const project = makeProject({ services: ["resend"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Resend");
    expect(prompt).toContain("RESEND_API_KEY");
  });

  it("includes sendgrid service details", () => {
    const project = makeProject({ services: ["sendgrid"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("SendGrid");
    expect(prompt).toContain("SENDGRID_API_KEY");
  });

  it("includes postmark service details", () => {
    const project = makeProject({ services: ["postmark"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Postmark");
    expect(prompt).toContain("POSTMARK_API_TOKEN");
  });

  it("includes posthog service details", () => {
    const project = makeProject({ services: ["posthog"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("PostHog");
  });

  it("includes vercel-analytics service details", () => {
    const project = makeProject({ services: ["vercel-analytics"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Vercel Analytics");
  });

  it("includes google-analytics service details", () => {
    const project = makeProject({ services: ["google-analytics"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Google Analytics");
    expect(prompt).toContain("GA_MEASUREMENT_ID");
  });

  it("handles unknown service with default details", () => {
    const project = makeProject({ services: ["unknown-service"] });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("unknown-service");
    expect(prompt).toContain("Integrate");
  });

  it("handles multiple services", () => {
    const project = makeProject({
      services: ["supabase-auth", "stripe", "resend"],
    });
    const prompt = buildImplementationPrompt(project);
    expect(prompt).toContain("Supabase Auth");
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("Resend");
  });
});

describe("buildUpgradePlanPrompt", () => {
  it("includes implementation prompt and project dir", () => {
    const prompt = buildUpgradePlanPrompt("impl content here", "/tmp/my-app");
    expect(prompt).toContain("impl content here");
    expect(prompt).toContain("/tmp/my-app");
  });

  it("includes task structure instructions", () => {
    const prompt = buildUpgradePlanPrompt("impl", "/tmp");
    expect(prompt).toContain("validate");
    expect(prompt).toContain("env_setup");
    expect(prompt).toContain("implement");
    expect(prompt).toContain("JSON array");
  });
});

describe("buildEnvSetupPrompt", () => {
  it("includes project dir and services", () => {
    const prompt = buildEnvSetupPrompt("/tmp/my-app", ["stripe", "supabase-auth"]);
    expect(prompt).toContain("/tmp/my-app");
    expect(prompt).toContain("stripe");
    expect(prompt).toContain("supabase-auth");
  });

  it("asks for JSON array output", () => {
    const prompt = buildEnvSetupPrompt("/tmp", []);
    expect(prompt).toContain("JSON array");
  });
});

describe("buildUpgradeTaskPrompt", () => {
  it("includes all parameters in output", () => {
    const prompt = buildUpgradeTaskPrompt(
      "Set up auth",
      "Configure NextAuth providers",
      "Full impl prompt",
      "/tmp/my-app",
    );
    expect(prompt).toContain("Set up auth");
    expect(prompt).toContain("Configure NextAuth providers");
    expect(prompt).toContain("Full impl prompt");
    expect(prompt).toContain("/tmp/my-app");
  });

  it("handles null description", () => {
    const prompt = buildUpgradeTaskPrompt("Set up auth", null, "impl", "/tmp");
    expect(prompt).toContain("Set up auth");
    expect(prompt).toContain("/tmp");
  });
});
