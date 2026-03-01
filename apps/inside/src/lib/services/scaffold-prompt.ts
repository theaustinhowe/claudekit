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
  responsive: "Responsive Design",
  accessibility: "Accessibility",
  animations: "Animations",
  pwa: "Progressive Web App",
  caching: "Caching",
  markdown: "Markdown Editor",
  "rich-text": "Rich Text Editor",
  "image-optimization": "Image Optimization",
  seo: "SEO",
  "rate-limiting": "Rate Limiting",
  logging: "Logging",
  "error-tracking": "Error Tracking",
  // HTTP frameworks
  hono: "Hono",
  express: "Express",
  fastify: "Fastify",
  // CLI languages
  typescript: "TypeScript",
  go: "Go",
  rust: "Rust",
  python: "Python",
  // Monorepo tools
  turborepo: "Turborepo",
  pnpm: "pnpm workspaces",
  // TanStack libraries
  "tanstack-query": "TanStack Query",
  "tanstack-table": "TanStack Table",
  "tanstack-form": "TanStack Form",
  "tanstack-virtual": "TanStack Virtual",
  // Desktop backends
  sqlite: "SQLite",
  "embedded-store": "Embedded Store (tauri-plugin-store)",
  // Desktop native features
  "system-tray": "System Tray",
  "auto-updates": "Auto-Updates",
  "native-menus": "Native Menus",
  "native-file-dialogs": "File Dialogs",
  ipc: "IPC Commands",
  "custom-titlebar": "Custom Titlebar",
  // Desktop frameworks & UI layers
  tauri2: "Tauri 2",
  electron: "Electron",
  "react-vite": "React + Vite",
  svelte: "Svelte",
  solid: "Solid",
  // Mobile native features
  "push-notifications": "Push Notifications",
  "camera-access": "Camera",
  geolocation: "Geolocation",
  "biometric-auth": "Biometric Auth",
  "offline-first": "Offline First",
  "deep-linking": "Deep Linking",
  // Game features
  "physics-engine": "Physics Engine",
  "particle-system": "Particle System",
  tilemap: "Tilemap",
  "save-system": "Save System",
  "audio-manager": "Audio Manager",
  "input-manager": "Input Manager",
  // Mobile navigation & state management
  "react-navigation": "React Navigation",
  "expo-router": "Expo Router",
  riverpod: "Riverpod",
  bloc: "Bloc",
  provider: "Provider",
  // Languages & engines
  gdscript: "GDScript",
  csharp: "C#",
  godot: "Godot",
  flutter: "Flutter",
  dart: "Dart",
  expo: "Expo",
  pygame: "Pygame",
  bevy: "Bevy",
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

function getMonorepoInstructions(versions: Record<string, string>, pm: string): string {
  if (versions.monorepo !== "true") return "";
  const tool = versions["monorepo-tool"] ?? "pnpm";
  if (tool === "turborepo") {
    return `
- Wrap the project in a Turborepo monorepo structure
- Add a root \`turbo.json\` with build/dev/lint pipeline configuration
- Place the app in \`apps/\` and shared code in \`packages/\`
- Use ${pm} workspaces for package linking`;
  }
  return `
- Wrap the project in a pnpm workspaces monorepo structure
- Place the app in \`apps/\` and shared code in \`packages/\`
- Add a root \`pnpm-workspace.yaml\` with workspace configuration`;
}

function getPlatformInstructions(project: GeneratorProject, projectDir: string): string {
  const pm = project.package_manager;
  const versions = project.tool_versions ?? {};
  const constraints = project.constraints ?? [];
  const hasBiome = constraints.includes("biome");
  const hasTailwind = constraints.includes("tailwind");

  let instructions: string;

  switch (project.platform) {
    case "nextjs": {
      const version = versions["nextjs-version"] ?? "latest";
      const versionSuffix = version === "latest" ? "@latest" : `@${version}`;
      const eslintFlag = hasBiome ? " --no-eslint" : " --eslint";
      const tailwindFlag = hasTailwind ? " --tailwind" : "";
      const router = versions["nextjs-router"] ?? "app";
      const appFlag = router === "pages" ? " --no-app" : " --app";
      const routerNote =
        router === "pages"
          ? "- Use the Pages Router with src/pages/ directory structure"
          : "- Use the App Router with server components by default";
      instructions = `
- Initialize a Next.js project using \`${pm} create next-app${versionSuffix} ${project.project_name} --ts${appFlag}${tailwindFlag}${eslintFlag} --src-dir --import-alias "@/*"\` inside "${expandTilde(project.project_path)}"
${routerNote}
- Use TypeScript throughout
- Structure: ${router === "pages" ? "src/pages/ for routes" : "src/app/ for routes"}, src/components/ for UI, src/lib/ for utilities`;
      break;
    }
    case "react-spa":
      instructions = `
- Initialize a React + Vite project using \`${pm} create vite ${project.project_name} --template react-ts\` inside "${expandTilde(project.project_path)}"
- Use React with TypeScript throughout
- Structure: src/pages/ for routes, src/components/ for UI, src/lib/ for utilities`;
      break;
    case "node-api": {
      const framework = versions["node-framework"] ?? "hono";
      const frameworkLabel = SERVICE_LABEL_MAP[framework] ?? framework;
      instructions = `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Set up a Node.js API server with TypeScript
- Use ${frameworkLabel} as the HTTP framework
- Structure: src/routes/ for API routes, src/services/ for business logic, src/lib/ for utilities`;
      break;
    }
    case "cli": {
      const lang = versions["cli-language"] ?? "typescript";
      switch (lang) {
        case "go":
          instructions = `
- Create the project directory "${projectDir}" and run \`go mod init\`
- Set up a CLI tool using Go with the Cobra framework
- Structure: cmd/ for CLI commands, internal/ for business logic
- Include a main.go entry point`;
          break;
        case "rust":
          instructions = `
- Create the project directory "${projectDir}" using \`cargo init\`
- Set up a CLI tool using Rust with the Clap framework
- Structure: src/commands/ for CLI commands, src/lib.rs for library code
- Include proper error handling with anyhow or thiserror`;
          break;
        case "python":
          instructions = `
- Create the project directory "${projectDir}" and initialize with \`uv init\` or \`poetry init\`
- Set up a CLI tool using Python with Click or Typer
- Structure: src/ for source code, commands/ for CLI commands
- Include a pyproject.toml with proper entry points`;
          break;
        default:
          instructions = `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Set up a CLI tool with TypeScript
- Use a CLI framework like Commander.js or yargs
- Structure: src/commands/ for CLI commands, src/lib/ for utilities
- Include a bin entry in package.json`;
      }
      break;
    }
    case "tanstack-start": {
      const libs = versions["tanstack-libraries"]?.split(",").filter(Boolean) ?? [];
      const libInstructions =
        libs.length > 0
          ? `\n- Install additional TanStack libraries: ${libs.map((l) => `\`${l.replace("tanstack-", "@tanstack/react-")}\``).join(", ")}`
          : "";
      instructions = `
- Create the project directory "${projectDir}" and set up TanStack Start
- Use TanStack Router for file-based routing
- Use React with TypeScript throughout
- Structure: app/routes/ for routes, app/components/ for UI, app/lib/ for utilities${libInstructions}`;
      break;
    }
    case "desktop-app": {
      const framework = versions["desktop-framework"] ?? "tauri2";
      const uiLayer = versions["desktop-ui"] ?? "react-vite";
      const targets = versions["desktop-targets"]?.split(",").filter(Boolean) ?? ["linux", "macos"];
      const rustEdition = versions["rust-edition"] ?? "2024";
      const targetList = targets.map((t) => SERVICE_LABEL_MAP[t] ?? t).join(", ");

      if (framework === "tauri2") {
        const templateMap: Record<string, string> = {
          "react-vite": "react-ts",
          svelte: "svelte-ts",
          solid: "solid-ts",
        };
        const template = templateMap[uiLayer] ?? "react-ts";
        instructions = `
- Initialize a Tauri 2 project using \`${pm} create tauri-app ${project.project_name} --template ${template}\` inside "${expandTilde(project.project_path)}"
- Project structure: \`src/\` for the web frontend (${SERVICE_LABEL_MAP[uiLayer] ?? uiLayer}), \`src-tauri/\` for the Rust backend
- Configure \`src-tauri/tauri.conf.json\`: set app identifier, default window size (1024x768), and bundle targets for ${targetList}
- Set Rust edition to ${rustEdition} in \`src-tauri/Cargo.toml\`
- The Vite dev server serves the frontend; Tauri wraps it in a native webview
- Use TypeScript for the frontend layer`;
      } else {
        instructions = `
- Create the project directory "${projectDir}" and set up an Electron app with ${SERVICE_LABEL_MAP[uiLayer] ?? uiLayer}
- Use electron-forge for project scaffolding and build tooling
- Structure: \`src/main/\` for Electron main process, \`src/renderer/\` for UI, \`src/preload/\` for preload scripts
- Configure build targets for ${targetList}
- Use TypeScript throughout`;
      }
      break;
    }
    case "react-native": {
      const navigation = versions["rn-navigation"] ?? "react-navigation";
      const targets = versions["rn-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
      const navLabel = SERVICE_LABEL_MAP[navigation] ?? navigation;
      instructions = `
- Initialize a React Native project using \`npx @react-native-community/cli init ${project.project_name} --template react-native-template-typescript\` inside "${expandTilde(project.project_path)}"
- Set up ${navLabel} for screen navigation
- Target platforms: ${targets.join(", ")}
- Use TypeScript throughout
- Structure: src/screens/ for screens, src/components/ for UI, src/navigation/ for routing, src/lib/ for utilities`;
      break;
    }
    case "expo": {
      const useRouter = versions["expo-router"] !== "false";
      const targets = versions["expo-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
      instructions = `
- Initialize an Expo project using \`npx create-expo-app ${project.project_name} --template tabs\` inside "${expandTilde(project.project_path)}"
- ${useRouter ? "Use Expo Router for file-based routing (app/ directory)" : "Use React Navigation for screen routing"}
- Target platforms: ${targets.join(", ")}
- Use TypeScript throughout
- Structure: ${useRouter ? "app/ for routes, components/ for UI, lib/ for utilities" : "src/screens/ for screens, src/components/ for UI, src/navigation/ for routing, src/lib/ for utilities"}`;
      break;
    }
    case "flutter": {
      const stateMgmt = versions["flutter-state"] ?? "riverpod";
      const targets = versions["flutter-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
      const stateLabel = SERVICE_LABEL_MAP[stateMgmt] ?? stateMgmt;
      instructions = `
- Initialize a Flutter project using \`flutter create ${project.project_name}\` inside "${expandTilde(project.project_path)}"
- Use ${stateLabel} for state management
- Target platforms: ${targets.join(", ")}
- Use Dart throughout
- Structure: lib/screens/ for screens, lib/widgets/ for reusable widgets, lib/models/ for data models, lib/services/ for business logic`;
      break;
    }
    case "godot": {
      const version = versions["godot-version"] ?? "4.x";
      const language = versions["godot-language"] ?? "gdscript";
      const gameType = versions["godot-game-type"] ?? "2d";
      const langLabel = SERVICE_LABEL_MAP[language] ?? language;
      instructions = `
- Create the project directory "${projectDir}" with a \`project.godot\` configuration file for Godot ${version}
- Use ${langLabel} as the scripting language
- Set up a ${gameType.toUpperCase()} game project
- Structure: scenes/ for scene files (.tscn), scripts/ for ${langLabel} scripts, assets/ for sprites/textures/audio, addons/ for plugins
- Include a main scene as the entry point`;
      break;
    }
    case "bevy": {
      const version = versions["bevy-version"] ?? "0.15";
      instructions = `
- Create the project directory "${projectDir}" using \`cargo init\`
- Add bevy ${version} as a dependency in Cargo.toml
- Use Rust throughout
- Structure: src/systems/ for ECS systems, src/components/ for ECS components, src/resources/ for game resources, assets/ for game assets
- Include a main.rs with basic Bevy app setup and default plugins`;
      break;
    }
    case "pygame": {
      const gameType = versions["pygame-game-type"] ?? "arcade";
      instructions = `
- Create the project directory "${projectDir}" and initialize with \`uv init\` or create a pyproject.toml
- Install pygame as a dependency
- Set up a ${gameType} game project
- Use Python throughout
- Structure: src/ for source code, src/entities/ for game objects, src/scenes/ for game scenes, assets/ for sprites/audio
- Include a main.py with the game loop (init, event handling, update, draw)`;
      break;
    }
    default:
      instructions = `
- Create the project directory "${projectDir}" and run \`${pm} init\`
- Use TypeScript throughout`;
  }

  instructions += getMonorepoInstructions(versions, pm);
  return instructions;
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

  let devCommandNote: string;
  switch (project.platform) {
    case "desktop-app":
      if ((project.tool_versions?.["desktop-framework"] ?? "tauri2") === "tauri2") {
        devCommandNote = `3. Ensure \`${pm}${pm === "npm" ? " run" : ""} dev\` starts the Vite frontend without errors (use \`${pm}${pm === "npm" ? " run" : ""} tauri dev\` to launch the full native window)`;
      } else {
        devCommandNote = `3. Ensure \`${pm}${pm === "npm" ? " run" : ""} dev\` starts without errors`;
      }
      break;
    case "flutter":
      devCommandNote = "3. Ensure `flutter run` starts the app without errors";
      break;
    case "godot":
      devCommandNote = "3. Ensure the project can be opened in Godot and the main scene runs without errors";
      break;
    case "bevy":
      devCommandNote = "3. Ensure `cargo run` compiles and runs without errors";
      break;
    case "pygame":
      devCommandNote = "3. Ensure `python main.py` starts the game without errors";
      break;
    case "expo":
      devCommandNote = "3. Ensure `npx expo start` starts the development server without errors";
      break;
    case "react-native":
      devCommandNote = "3. Ensure `npx react-native start` starts the Metro bundler without errors";
      break;
    default:
      devCommandNote = `3. Ensure \`${pm}${pm === "npm" ? " run" : ""} dev\` starts without errors`;
  }

  sections.push(`## Prototype Requirements

1. The project MUST be created at: ${projectDir}
2. Use ${pm} as the package manager
${devCommandNote}
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
  const versions = project.tool_versions ?? {};

  const sections: string[] = [];

  const platformDetails: string[] = [`Platform: ${platformLabel}`];
  // Include relevant advanced options in implementation context
  if (project.platform === "nextjs" && versions["nextjs-router"] === "pages") {
    platformDetails.push("Router: Pages Router");
  }
  if (project.platform === "node-api" && versions["node-framework"]) {
    platformDetails.push(
      `HTTP Framework: ${SERVICE_LABEL_MAP[versions["node-framework"]] ?? versions["node-framework"]}`,
    );
  }
  if (project.platform === "cli" && versions["cli-language"] && versions["cli-language"] !== "typescript") {
    platformDetails.push(`Language: ${SERVICE_LABEL_MAP[versions["cli-language"]] ?? versions["cli-language"]}`);
  }
  if (project.platform === "desktop-app") {
    const framework = versions["desktop-framework"] ?? "tauri2";
    const uiLayer = versions["desktop-ui"] ?? "react-vite";
    const targets = versions["desktop-targets"]?.split(",").filter(Boolean) ?? ["linux", "macos"];
    platformDetails.push(`Desktop Framework: ${SERVICE_LABEL_MAP[framework] ?? framework}`);
    platformDetails.push(`UI Layer: ${SERVICE_LABEL_MAP[uiLayer] ?? uiLayer}`);
    platformDetails.push(`Targets: ${targets.join(", ")}`);
  }
  if (project.platform === "react-native") {
    const navigation = versions["rn-navigation"] ?? "react-navigation";
    const targets = versions["rn-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
    platformDetails.push(`Navigation: ${SERVICE_LABEL_MAP[navigation] ?? navigation}`);
    platformDetails.push(`Targets: ${targets.join(", ")}`);
  }
  if (project.platform === "expo") {
    const useRouter = versions["expo-router"] !== "false";
    const targets = versions["expo-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
    platformDetails.push(`Routing: ${useRouter ? "Expo Router" : "React Navigation"}`);
    platformDetails.push(`Targets: ${targets.join(", ")}`);
  }
  if (project.platform === "flutter") {
    const stateMgmt = versions["flutter-state"] ?? "riverpod";
    const targets = versions["flutter-targets"]?.split(",").filter(Boolean) ?? ["ios", "android"];
    platformDetails.push(`State Management: ${SERVICE_LABEL_MAP[stateMgmt] ?? stateMgmt}`);
    platformDetails.push(`Targets: ${targets.join(", ")}`);
  }
  if (project.platform === "godot") {
    const language = versions["godot-language"] ?? "gdscript";
    const gameType = versions["godot-game-type"] ?? "2d";
    platformDetails.push(`Language: ${SERVICE_LABEL_MAP[language] ?? language}`);
    platformDetails.push(`Game Type: ${gameType.toUpperCase()}`);
  }
  if (project.platform === "bevy") {
    const version = versions["bevy-version"] ?? "0.15";
    platformDetails.push(`Bevy Version: ${version}`);
  }
  if (project.platform === "pygame") {
    const gameType = versions["pygame-game-type"] ?? "arcade";
    platformDetails.push(`Game Type: ${gameType}`);
  }
  if (versions.monorepo === "true") {
    platformDetails.push(`Monorepo: ${SERVICE_LABEL_MAP[versions["monorepo-tool"] ?? "pnpm"] ?? "pnpm workspaces"}`);
  }
  platformDetails.push(`Package Manager: ${project.package_manager}`);

  sections.push(`# Implementation Requirements for "${project.title}"

${platformDetails.join("\n")}

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
            `### ${label} (Auth)\n- Set up Auth.js with next-auth@5\n- Configure providers (e.g. Google, GitHub)\n- Add session provider and auth API route\n- Configure environment variables: AUTH_SECRET, AUTH_URL`,
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
        case "sqlite":
          serviceDetails.push(
            `### SQLite (Database)\n- Set up SQLite via better-sqlite3 (Node) or sqlx (Rust/Tauri)\n- Create database schema based on mock data entities\n- Replace mock data with SQLite queries\n- Store the database file in the app's data directory`,
          );
          break;
        case "embedded-store":
          serviceDetails.push(
            `### Embedded Store (tauri-plugin-store)\n- Set up tauri-plugin-store for key-value persistence\n- Create typed store accessors for each data entity\n- Replace mock data with store read/write operations\n- Data persists automatically in the app's config directory`,
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
