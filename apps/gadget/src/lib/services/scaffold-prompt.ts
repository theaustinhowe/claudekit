import path from "node:path";
import { CONSTRAINT_OPTIONS, PLATFORMS } from "@/lib/constants";
import { VIBE_TRAITS } from "@/lib/services/interface-design";
import type { GeneratorProject } from "@/lib/types";
import { expandTilde } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SERVICE_LABEL_MAP: Record<string, string> = {
  "supabase-auth": "Supabase Auth",
  clerk: "Clerk",
  "next-auth": "NextAuth.js",
  lucia: "Lucia",
  "supabase-db": "Supabase (Database)",
  prisma: "Prisma",
  drizzle: "Drizzle",
  nhost: "Nhost",
  postgres: "PostgreSQL",
  localstorage: "localStorage",
  duckdb: "DuckDB",
  stripe: "Stripe",
  "lemon-squeezy": "Lemon Squeezy",
  resend: "Resend",
  sendgrid: "SendGrid",
  postmark: "Postmark",
  posthog: "PostHog",
  "google-analytics": "Google Analytics",
  "vercel-analytics": "Vercel Analytics",
  "real-time": "Real-time",
  "file-upload": "File Upload",
  "dark-mode": "Dark Mode",
  i18n: "Internationalization",
  search: "Search",
  notifications: "Notifications",
};

function resolveServiceLabels(services: string[]): string[] {
  return services.map((sid) => SERVICE_LABEL_MAP[sid] || sid);
}

function resolveConstraintLabels(constraints: string[]): string[] {
  return constraints.map((cid) => {
    const c = CONSTRAINT_OPTIONS.find((o) => o.id === cid);
    return c?.label ?? cid;
  });
}

function getPlatformInfo(project: GeneratorProject) {
  const platform = PLATFORMS.find((p) => p.id === project.platform);
  return {
    label: platform?.label ?? project.platform,
    description: platform?.description ?? "",
  };
}

function getPlatformInstructions(project: GeneratorProject, projectDir: string): string {
  const pm = project.package_manager;

  switch (project.platform) {
    case "nextjs":
      return `
- Initialize a Next.js project using \`${pm} create next-app@latest ${project.project_name} --ts --app --tailwind --eslint --src-dir --import-alias "@/*"\` inside "${expandTilde(project.project_path)}"
- Use the App Router with server components by default
- Use TypeScript throughout
- Structure: src/app/ for routes, src/components/ for UI, src/lib/ for utilities`;
    case "react-spa":
      return `
- Initialize a React + Vite project using \`${pm} create vite ${project.project_name} --template react-ts\` inside "${expandTilde(project.project_path)}"
- Use React with TypeScript throughout
- Structure: src/pages/ for routes, src/components/ for UI, src/lib/ for utilities`;
    case "node-api":
      return `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Set up a Node.js API server with TypeScript
- Use Express or Hono as the HTTP framework
- Structure: src/routes/ for API routes, src/services/ for business logic, src/lib/ for utilities`;
    case "monorepo":
      return `
- Create the project directory "${projectDir}" and set up a monorepo workspace
- Use ${pm} workspaces
- Structure: packages/ for shared libraries, apps/ for applications
- Include a root package.json with workspace configuration`;
    case "cli":
      return `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Set up a CLI tool with TypeScript
- Use a CLI framework like Commander.js or yargs
- Structure: src/commands/ for CLI commands, src/lib/ for utilities
- Include a bin entry in package.json`;
    case "tanstack-start":
      return `
- Create the project directory "${projectDir}" and set up TanStack Start
- Use TanStack Router for file-based routing
- Use React with TypeScript throughout
- Structure: app/routes/ for routes, app/components/ for UI, app/lib/ for utilities`;
    default:
      return `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Use TypeScript throughout`;
  }
}

// ---------------------------------------------------------------------------
// Prototype Prompt (mock data, fast iteration)
// ---------------------------------------------------------------------------

export function buildPrototypePrompt(project: GeneratorProject): string {
  const pm = project.package_manager;
  const projectDir = path.join(expandTilde(project.project_path), project.project_name);
  const { label: platformLabel, description: platformDescription } = getPlatformInfo(project);
  const constraintLabels = resolveConstraintLabels(project.constraints);
  const serviceLabels = resolveServiceLabels(project.services);
  const platformInstructions = getPlatformInstructions(project, projectDir);

  const sections: string[] = [];

  sections.push(`# Project Scaffold (Prototype)

Create a complete, working "${project.title}" project as a **prototype** with mock/sample data.

## Description
${project.idea_description}

## Platform: ${platformLabel}
${platformDescription}

### Setup Instructions
${platformInstructions}`);

  if (constraintLabels.length > 0) {
    sections.push(`## Constraints
${constraintLabels.map((c) => `- ${c}`).join("\n")}`);
  }

  if (serviceLabels.length > 0) {
    sections.push(`## Services (Mock Only)
The final app will integrate these services, but for this prototype use hardcoded mock/sample data instead:
${serviceLabels.map((s) => `- ${s}`).join("\n")}

Do NOT set up real database connections, auth providers, or external API integrations.
Use hardcoded sample data that mirrors what the real services would return.`);
  }

  // Design direction section (vibes, colors, inspiration)
  const vibes = project.design_vibes || [];
  const scheme = project.color_scheme || {};
  const urls = project.inspiration_urls || [];

  if (vibes.length > 0 || scheme.primary || scheme.accent || urls.length > 0) {
    const designParts: string[] = ["## Design Direction"];

    if (vibes.length > 0) {
      const vibeDescriptions = vibes.map((v) => {
        const traits = VIBE_TRAITS[v];
        return traits ? `- **${v}**: ${traits.patterns}` : `- ${v}`;
      });
      designParts.push(`### Design Personality\n${vibeDescriptions.join("\n")}`);
    }

    if (scheme.primary || scheme.accent) {
      designParts.push(`### Color Scheme
${scheme.primary ? `- Primary color: ${scheme.primary}` : ""}
${scheme.accent ? `- Accent color: ${scheme.accent}` : ""}
Apply these as the main theme colors in your Tailwind/CSS configuration.`);
    }

    if (urls.length > 0) {
      designParts.push(`### Inspiration References
${urls.map((u) => `- ${u}`).join("\n")}
Reference these sites for design inspiration (layout, typography, color usage).`);
    }

    designParts.push(
      `\nRead \`.interface-design/system.md\` in the project directory for detailed design system guidance.`,
    );

    sections.push(designParts.join("\n\n"));

    sections.push(`## Design Craft

Read \`.claude/skills/interface-design/SKILL.md\` for comprehensive design principles.

Key requirements:
- Before writing UI, state your Intent (who, what they do, how it feels)
- Every design choice must be explainable — no defaults
- Run the swap test, squint test, signature test before finishing
- Apply subtle layering: surfaces barely different but still distinguishable
- Build token architecture: foreground, background, border, brand, semantic
- Use the \`.interface-design/system.md\` tokens consistently

Read \`.interface-design/system.md\` in the project directory for the project-specific design system.`);
  }

  sections.push(`## Prototype Requirements

1. The project MUST be created at: ${projectDir}
2. Use ${pm} as the package manager
3. Ensure \`${pm}${pm === "npm" ? " run" : ""} dev\` starts without errors
4. Use hardcoded mock/sample data throughout — do NOT set up real database connections, auth providers, or external API integrations
5. Focus on building a polished UI with realistic-looking sample data that is easy to swap out later
6. Keep the architecture simple — no ORM, no auth middleware, no real API routes with DB queries
7. Do NOT leave TODO or placeholder components — build real UI with sample data
8. Include a README.md with setup instructions
9. All dependencies must be installed (run \`${pm} install\` after setup)
10. The project should be immediately runnable after scaffolding

## Output
Create the full project with all files, directories, dependencies, and configuration. The project should compile and run without any manual intervention.`);

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Implementation Prompt (real services, stored at creation time)
// ---------------------------------------------------------------------------

export function buildImplementationPrompt(project: GeneratorProject): string {
  const serviceLabels = resolveServiceLabels(project.services);
  const { label: platformLabel } = getPlatformInfo(project);

  const sections: string[] = [];

  sections.push(`# Implementation Requirements for "${project.title}"

Platform: ${platformLabel}
Package Manager: ${project.package_manager}

## Description
${project.idea_description}`);

  if (serviceLabels.length > 0) {
    const serviceDetails: string[] = [];

    for (const sid of project.services) {
      const label = SERVICE_LABEL_MAP[sid] || sid;

      switch (sid) {
        case "supabase-auth":
          serviceDetails.push(
            `### ${label} (Auth)\n- Set up Supabase Auth with @supabase/supabase-js\n- Implement sign-up, sign-in, sign-out, and session management\n- Add auth middleware for protected routes\n- Configure environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY`,
          );
          break;
        case "clerk":
          serviceDetails.push(
            `### ${label} (Auth)\n- Set up Clerk with @clerk/nextjs\n- Add ClerkProvider to root layout\n- Implement sign-in/sign-up pages\n- Add auth middleware for protected routes\n- Configure environment variables: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY`,
          );
          break;
        case "next-auth":
          serviceDetails.push(
            `### ${label} (Auth)\n- Set up NextAuth.js with next-auth\n- Configure providers (e.g. Google, GitHub)\n- Add session provider and auth API route\n- Configure environment variables: NEXTAUTH_SECRET, NEXTAUTH_URL`,
          );
          break;
        case "lucia":
          serviceDetails.push(
            `### Lucia (Auth)\n- Set up Lucia with lucia and @lucia-auth/adapter-* packages\n- Implement session-based authentication\n- Add login/register pages and session middleware\n- Configure environment variables as needed`,
          );
          break;
        case "supabase-db":
          serviceDetails.push(
            `### ${label} (Database)\n- Set up Supabase client for database operations\n- Create database schema based on the mock data patterns in the prototype\n- Replace mock data with real Supabase queries\n- Configure environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY`,
          );
          break;
        case "prisma":
          serviceDetails.push(
            `### ${label} (Database)\n- Set up Prisma ORM with prisma and @prisma/client\n- Generate schema.prisma based on mock data entities\n- Create database migrations\n- Replace mock data with Prisma queries`,
          );
          break;
        case "drizzle":
          serviceDetails.push(
            `### ${label} (Database)\n- Set up Drizzle ORM with drizzle-orm and drizzle-kit\n- Define schema based on mock data entities\n- Create migrations\n- Replace mock data with Drizzle queries`,
          );
          break;
        case "nhost":
          serviceDetails.push(
            `### Nhost (Database)\n- Set up Nhost with @nhost/react and @nhost/nhost-js\n- Configure GraphQL client for database operations\n- Replace mock data with Nhost queries\n- Configure environment variables: NEXT_PUBLIC_NHOST_SUBDOMAIN, NEXT_PUBLIC_NHOST_REGION`,
          );
          break;
        case "postgres":
          serviceDetails.push(
            `### PostgreSQL (Database)\n- Set up PostgreSQL with pg or postgres packages\n- Create database schema based on mock data entities\n- Add connection pooling configuration\n- Replace mock data with SQL queries\n- Configure environment variables: DATABASE_URL`,
          );
          break;
        case "localstorage":
          serviceDetails.push(
            `### localStorage (Storage)\n- Implement localStorage-based persistence layer\n- Create typed read/write utilities with JSON serialization\n- Replace mock data with localStorage operations\n- Add data migration/versioning support`,
          );
          break;
        case "duckdb":
          serviceDetails.push(
            `### DuckDB (Database)\n- Set up DuckDB with @duckdb/node-api for embedded analytics\n- Create schema based on mock data entities\n- Replace mock data with DuckDB queries\n- Configure file-based storage path`,
          );
          break;
        case "stripe":
          serviceDetails.push(
            `### ${label} (Payments)\n- Set up Stripe with stripe and @stripe/stripe-js\n- Implement checkout sessions, webhook handling\n- Add pricing page with real Stripe products\n- Configure environment variables: STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET`,
          );
          break;
        case "lemon-squeezy":
          serviceDetails.push(
            `### ${label} (Payments)\n- Set up Lemon Squeezy with @lemonsqueezy/lemonsqueezy.js\n- Implement checkout and webhook handling\n- Configure environment variables: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET`,
          );
          break;
        case "resend":
          serviceDetails.push(
            `### ${label} (Email)\n- Set up Resend with resend package\n- Create email templates using React Email\n- Add API routes for sending emails\n- Configure environment variables: RESEND_API_KEY`,
          );
          break;
        case "sendgrid":
          serviceDetails.push(
            `### ${label} (Email)\n- Set up SendGrid with @sendgrid/mail\n- Create email sending utilities\n- Configure environment variables: SENDGRID_API_KEY`,
          );
          break;
        case "postmark":
          serviceDetails.push(
            `### Postmark (Email)\n- Set up Postmark with postmark package\n- Create email sending utilities with templates\n- Configure environment variables: POSTMARK_API_TOKEN`,
          );
          break;
        case "posthog":
          serviceDetails.push(
            `### ${label} (Analytics)\n- Set up PostHog with posthog-js and posthog-node\n- Add PostHogProvider to root layout\n- Implement event tracking\n- Configure environment variables: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST`,
          );
          break;
        case "vercel-analytics":
          serviceDetails.push(
            `### ${label} (Analytics)\n- Set up Vercel Analytics with @vercel/analytics\n- Add Analytics component to root layout`,
          );
          break;
        case "google-analytics":
          serviceDetails.push(
            `### Google Analytics (Analytics)\n- Set up Google Analytics with @next/third-parties or gtag.js\n- Add GA script to root layout\n- Implement page view and event tracking\n- Configure environment variables: NEXT_PUBLIC_GA_MEASUREMENT_ID`,
          );
          break;
        default:
          serviceDetails.push(`### ${label}\n- Integrate ${label} with proper SDK and configuration`);
      }
    }

    sections.push(`## Service Integrations\n\n${serviceDetails.join("\n\n")}`);
  }

  sections.push(`## Implementation Guidelines

- Replace ALL hardcoded mock/sample data with real service integrations
- Set up proper database schema based on mock data entity patterns
- Implement real authentication flows (sign-up, sign-in, sign-out, session management)
- Add proper error handling and loading states for async operations
- Create a .env.example with all required environment variables
- Add input validation on all forms and API routes
- Ensure all API routes have proper auth checks where needed`);

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Upgrade prompts
// ---------------------------------------------------------------------------

export function buildUpgradePlanPrompt(implementationPrompt: string, projectDir: string): string {
  return `You are analyzing a prototype application to plan its upgrade to a full implementation.

## Project Directory
${projectDir}

## Implementation Requirements
${implementationPrompt}

## Your Task
Analyze the prototype codebase in the project directory and the implementation requirements above.
Generate a JSON array of tasks to transform this prototype into a production app.

Guidelines:
- The FIRST task must ALWAYS be a validation step with step_type "validate" — analyze the codebase, verify the approach, and confirm the upgrade plan
- The LAST task must ALWAYS be an environment setup step with step_type "env_setup" — gather all required environment variables and create .env.example
- All other tasks should have step_type "implement"
- Order tasks by dependency: auth/config first, then database, then API routes, then update UI components
- Each task should be focused and completable in one session
- Tasks should describe WHAT to do, not HOW (Claude will figure out the how)
- Keep the total to 4-10 tasks

Respond with ONLY a JSON array, no other text:
[
  {"title": "Validate upgrade approach", "description": "Analyze the prototype codebase and verify the implementation plan", "step_type": "validate"},
  {"title": "Set up authentication with NextAuth.js", "description": "Install next-auth, configure providers, add auth middleware", "step_type": "implement"},
  ...
  {"title": "Configure environment variables", "description": "Gather all required env vars and create .env.example", "step_type": "env_setup"}
]`;
}

export function buildEnvSetupPrompt(projectDir: string, services: string[]): string {
  return `You are analyzing a project to identify all required environment variables.

## Project Directory
${projectDir}

## Services Used
${services.join(", ")}

## Your Task
Analyze the project codebase and identify ALL environment variables that need to be configured.

For each variable, provide:
- name: The variable name (e.g. NEXT_PUBLIC_SUPABASE_URL)
- description: What it's for
- required: Whether it's required for the app to function
- service: Which service it belongs to
- instructions: Brief instructions for obtaining the value

Respond with ONLY a JSON array, no other text:
[
  {"name": "DATABASE_URL", "description": "PostgreSQL connection string", "required": true, "service": "postgres", "instructions": "Get from your database provider dashboard"},
  ...
]`;
}

export function buildUpgradeTaskPrompt(
  taskTitle: string,
  taskDescription: string | null,
  implementationPrompt: string,
  projectDir: string,
): string {
  return `You are upgrading a prototype application to a full production implementation.

## Project Directory
${projectDir}

## Full Implementation Context
${implementationPrompt}

## Current Task
**${taskTitle}**
${taskDescription || ""}

## Instructions
- Work within the existing codebase in the project directory
- Replace mock/hardcoded data with real implementations as described in the task
- Do NOT break existing UI — preserve the look and feel
- Ensure the app still compiles and runs after your changes
- If you need to install new packages, use the project's package manager
- Add proper error handling for any new async operations
- Update .env.example if you add new environment variables`;
}
