import type { AppType } from "@/lib/types";

export const APP_NAME = "Inside";

// --- Generator Project Constants ---

export const PLATFORMS = [
  { id: "nextjs", label: "Next.js", description: "Full-stack React with server components" },
  { id: "tanstack-start", label: "TanStack Start", description: "Full-stack React with TanStack Router" },
  { id: "react-spa", label: "React SPA", description: "Client-side React with Vite" },
  { id: "node-api", label: "Node.js API", description: "Backend REST/GraphQL server" },
  { id: "cli", label: "CLI Tool", description: "Command-line application" },
  { id: "desktop-app", label: "Desktop App", description: "Native desktop application with Tauri" },
  { id: "react-native", label: "React Native", description: "Cross-platform mobile with React" },
  { id: "expo", label: "Expo", description: "React Native with managed workflow" },
  { id: "flutter", label: "Flutter", description: "Cross-platform mobile with Dart" },
  { id: "godot", label: "Godot", description: "Open-source 2D/3D game engine" },
  { id: "bevy", label: "Bevy", description: "Data-driven game engine in Rust" },
  { id: "pygame", label: "Pygame", description: "2D game development in Python" },
] as const;

export const CONSTRAINT_OPTIONS = [
  { id: "typescript-strict", label: "TypeScript Strict", defaultOn: true },
  { id: "biome", label: "Biome (Lint + Format)", defaultOn: true },
  { id: "tailwind", label: "Tailwind CSS", defaultOn: true },
  { id: "shadcn", label: "shadcn/ui", defaultOn: true },
  { id: "vitest", label: "Vitest", defaultOn: true },
  { id: "ai-files", label: "AI Files (CLAUDE.md etc.)", defaultOn: true },
] as const;

export const DESIGN_VIBES = [
  { id: "precision-density", label: "Technical", description: "Tight, data-rich, developer tools" },
  { id: "warmth-approachability", label: "Cozy", description: "Friendly, rounded, generous spacing" },
  { id: "sophistication-trust", label: "Sophisticated", description: "Refined, premium, enterprise" },
  { id: "boldness-clarity", label: "Bold", description: "High contrast, strong hierarchy" },
  { id: "utility-function", label: "Minimal", description: "Clean, tool-like, efficient" },
  { id: "data-analysis", label: "Analytical", description: "Charts, dashboards, metrics-first" },
  { id: "retro", label: "Retro", description: "Nostalgic, pixel-inspired, vintage" },
  { id: "playful", label: "Playful", description: "Animated, colorful, fun" },
];

export const BACKEND_OPTIONS = [
  { id: "localstorage", label: "localStorage" },
  { id: "duckdb", label: "DuckDB" },
  { id: "supabase-db", label: "Supabase" },
  { id: "nhost", label: "Nhost" },
  { id: "postgres", label: "PostgreSQL" },
  { id: "sqlite", label: "SQLite" },
  { id: "embedded-store", label: "Embedded Store (tauri-plugin-store)" },
];

export const AUTH_OPTIONS = [
  { id: "supabase-auth", label: "Supabase Auth" },
  { id: "clerk", label: "Clerk" },
  { id: "next-auth", label: "NextAuth.js" },
  { id: "lucia", label: "Lucia" },
];

export const FEATURE_CATEGORIES = [
  {
    label: "UI & UX",
    features: [
      { id: "dark-mode", label: "Dark Mode" },
      { id: "responsive", label: "Responsive Design" },
      { id: "accessibility", label: "Accessibility" },
      { id: "animations", label: "Animations" },
      { id: "pwa", label: "PWA" },
    ],
  },
  {
    label: "Data & Communication",
    features: [
      { id: "real-time", label: "Real-time" },
      { id: "file-upload", label: "File Upload" },
      { id: "search", label: "Search" },
      { id: "notifications", label: "Notifications" },
      { id: "caching", label: "Caching" },
    ],
  },
  {
    label: "Content & Media",
    features: [
      { id: "markdown", label: "Markdown Editor" },
      { id: "rich-text", label: "Rich Text Editor" },
      { id: "image-optimization", label: "Image Optimization" },
    ],
  },
  {
    label: "Platform & Infra",
    features: [
      { id: "i18n", label: "i18n" },
      { id: "seo", label: "SEO" },
      { id: "rate-limiting", label: "Rate Limiting" },
      { id: "logging", label: "Logging" },
      { id: "error-tracking", label: "Error Tracking" },
    ],
  },
  {
    label: "Desktop Native",
    features: [
      { id: "system-tray", label: "System Tray" },
      { id: "auto-updates", label: "Auto-Updates" },
      { id: "native-menus", label: "Native Menus" },
      { id: "native-file-dialogs", label: "File Dialogs" },
      { id: "ipc", label: "IPC Commands" },
      { id: "custom-titlebar", label: "Custom Titlebar" },
    ],
  },
  {
    label: "Mobile Native",
    features: [
      { id: "push-notifications", label: "Push Notifications" },
      { id: "camera-access", label: "Camera" },
      { id: "geolocation", label: "Geolocation" },
      { id: "biometric-auth", label: "Biometric Auth" },
      { id: "offline-first", label: "Offline First" },
      { id: "deep-linking", label: "Deep Linking" },
    ],
  },
  {
    label: "Game Core",
    features: [
      { id: "physics-engine", label: "Physics Engine" },
      { id: "particle-system", label: "Particle System" },
      { id: "tilemap", label: "Tilemap" },
      { id: "save-system", label: "Save System" },
      { id: "audio-manager", label: "Audio Manager" },
      { id: "input-manager", label: "Input Manager" },
    ],
  },
];

export const FEATURE_OPTIONS = FEATURE_CATEGORIES.flatMap((c) => c.features);

// --- Platform Advanced Options ---

interface SelectChoice {
  label: string;
  value: string;
  isDefault?: boolean;
  detail?: string;
}

export type AdvancedOption =
  | { key: string; label: string; description?: string; type: "select"; options: SelectChoice[] }
  | {
      key: string;
      label: string;
      description?: string;
      type: "multi-select";
      options: SelectChoice[];
      defaultValues?: string[];
    }
  | { key: string; label: string; description?: string; type: "boolean"; defaultValue: boolean };

export interface ConditionalOption {
  option: AdvancedOption;
  visibleWhen?: (toolVersions: Record<string, string>) => boolean;
}

const MONOREPO_WRAPPER_OPTIONS: ConditionalOption[] = [
  {
    option: {
      key: "monorepo",
      label: "Wrap in monorepo",
      description: "Scaffold inside a workspace structure",
      type: "boolean",
      defaultValue: false,
    },
  },
  {
    option: {
      key: "monorepo-tool",
      label: "Build orchestrator",
      type: "select",
      options: [
        { label: "Turborepo", value: "turborepo", isDefault: true },
        { label: "pnpm workspaces", value: "pnpm" },
      ],
    },
    visibleWhen: (tv) => tv.monorepo === "true",
  },
];

export const PLATFORM_ADVANCED_OPTIONS: Record<string, ConditionalOption[]> = {
  nextjs: [
    {
      option: {
        key: "nextjs-version",
        label: "Version",
        type: "select",
        options: [
          { label: "Next.js 16 (latest)", value: "16", isDefault: true },
          { label: "Next.js 15", value: "15" },
          { label: "Next.js 14", value: "14" },
        ],
      },
    },
    {
      option: {
        key: "nextjs-router",
        label: "Router",
        type: "select",
        options: [
          { label: "App Router", value: "app", isDefault: true },
          { label: "Pages Router", value: "pages" },
        ],
      },
      visibleWhen: (tv) => tv["nextjs-version"] === "14",
    },
    ...MONOREPO_WRAPPER_OPTIONS,
  ],
  "react-spa": [
    {
      option: {
        key: "react-spa-version",
        label: "Version",
        type: "select",
        options: [
          { label: "React 19 + Vite (latest)", value: "react19-vite", isDefault: true },
          { label: "React 18 + Vite", value: "react18-vite" },
        ],
      },
    },
    ...MONOREPO_WRAPPER_OPTIONS,
  ],
  "node-api": [
    {
      option: {
        key: "node-version",
        label: "Node version",
        type: "select",
        options: [
          { label: "Node 22 LTS (latest)", value: "node22", isDefault: true },
          { label: "Node 20 LTS", value: "node20" },
        ],
      },
    },
    {
      option: {
        key: "node-framework",
        label: "HTTP Framework",
        type: "select",
        options: [
          { label: "Hono", value: "hono", isDefault: true },
          { label: "Express", value: "express" },
          { label: "Fastify", value: "fastify" },
        ],
      },
    },
    ...MONOREPO_WRAPPER_OPTIONS,
  ],
  cli: [
    {
      option: {
        key: "cli-language",
        label: "Language",
        type: "select",
        options: [
          { label: "TypeScript", value: "typescript", isDefault: true },
          { label: "Go", value: "go" },
          { label: "Rust", value: "rust" },
          { label: "Python", value: "python" },
        ],
      },
    },
  ],
  "tanstack-start": [
    {
      option: {
        key: "tanstack-version",
        label: "Version",
        type: "select",
        options: [{ label: "TanStack Start 1.x (latest)", value: "1.x", isDefault: true }],
      },
    },
    {
      option: {
        key: "tanstack-libraries",
        label: "Libraries",
        description: "Additional TanStack libraries to include",
        type: "multi-select",
        options: [
          { label: "Query", value: "tanstack-query" },
          { label: "Table", value: "tanstack-table" },
          { label: "Form", value: "tanstack-form" },
          { label: "Virtual", value: "tanstack-virtual" },
        ],
      },
    },
    ...MONOREPO_WRAPPER_OPTIONS,
  ],
  "desktop-app": [
    {
      option: {
        key: "desktop-framework",
        label: "Desktop framework",
        type: "select",
        options: [
          { label: "Tauri 2", value: "tauri2", isDefault: true },
          { label: "Electron", value: "electron" },
        ],
      },
    },
    {
      option: {
        key: "desktop-ui",
        label: "UI layer",
        type: "select",
        options: [
          { label: "React + Vite", value: "react-vite", isDefault: true },
          { label: "Svelte", value: "svelte" },
          { label: "Solid", value: "solid" },
        ],
      },
    },
    {
      option: {
        key: "desktop-targets",
        label: "Target platforms",
        type: "multi-select",
        options: [
          { label: "Linux", value: "linux" },
          { label: "macOS", value: "macos" },
          { label: "Windows", value: "windows" },
        ],
        defaultValues: ["linux", "macos"],
      },
    },
    {
      option: {
        key: "rust-edition",
        label: "Rust edition",
        type: "select",
        options: [
          { label: "2024", value: "2024", isDefault: true },
          { label: "2021", value: "2021" },
        ],
      },
      visibleWhen: (tv) => tv["desktop-framework"] === "tauri2",
    },
  ],
  "react-native": [
    {
      option: {
        key: "rn-navigation",
        label: "Navigation",
        type: "select",
        options: [
          { label: "React Navigation 7", value: "react-navigation", isDefault: true },
          { label: "Expo Router", value: "expo-router" },
        ],
      },
    },
    {
      option: {
        key: "rn-targets",
        label: "Targets",
        type: "multi-select",
        options: [
          { label: "iOS", value: "ios" },
          { label: "Android", value: "android" },
        ],
        defaultValues: ["ios", "android"],
      },
    },
  ],
  expo: [
    {
      option: {
        key: "expo-router",
        label: "Expo Router",
        type: "boolean",
        defaultValue: true,
      },
    },
    {
      option: {
        key: "expo-targets",
        label: "Targets",
        type: "multi-select",
        options: [
          { label: "iOS", value: "ios" },
          { label: "Android", value: "android" },
          { label: "Web", value: "web" },
        ],
        defaultValues: ["ios", "android"],
      },
    },
  ],
  flutter: [
    {
      option: {
        key: "flutter-targets",
        label: "Targets",
        type: "multi-select",
        options: [
          { label: "iOS", value: "ios" },
          { label: "Android", value: "android" },
          { label: "Web", value: "web" },
        ],
        defaultValues: ["ios", "android"],
      },
    },
    {
      option: {
        key: "flutter-state",
        label: "State management",
        type: "select",
        options: [
          { label: "Riverpod", value: "riverpod", isDefault: true },
          { label: "Bloc", value: "bloc" },
          { label: "Provider", value: "provider" },
        ],
      },
    },
  ],
  godot: [
    {
      option: {
        key: "godot-version",
        label: "Version",
        type: "select",
        options: [
          { label: "Godot 4.x", value: "4.x", isDefault: true },
          { label: "Godot 3.x", value: "3.x" },
        ],
      },
    },
    {
      option: {
        key: "godot-language",
        label: "Language",
        type: "select",
        options: [
          { label: "GDScript", value: "gdscript", isDefault: true },
          { label: "C#", value: "csharp" },
        ],
      },
    },
    {
      option: {
        key: "godot-game-type",
        label: "Game type",
        type: "select",
        options: [
          { label: "2D", value: "2d", isDefault: true },
          { label: "3D", value: "3d" },
        ],
      },
    },
  ],
  bevy: [
    {
      option: {
        key: "bevy-version",
        label: "Version",
        type: "select",
        options: [{ label: "Bevy 0.15", value: "0.15", isDefault: true }],
      },
    },
  ],
  pygame: [
    {
      option: {
        key: "pygame-game-type",
        label: "Game type",
        type: "select",
        options: [
          { label: "Arcade", value: "arcade", isDefault: true },
          { label: "RPG", value: "rpg" },
          { label: "Puzzle", value: "puzzle" },
        ],
      },
    },
  ],
};

/** Constraints that only apply to TypeScript/JS projects */
export const TS_ONLY_CONSTRAINTS = new Set(["typescript-strict", "biome", "tailwind", "shadcn", "vitest"]);

export const EMAIL_OPTIONS = [
  { id: "sendgrid", label: "SendGrid" },
  { id: "resend", label: "Resend" },
  { id: "postmark", label: "Postmark" },
];

export const ANALYTICS_OPTIONS = [
  { id: "posthog", label: "PostHog" },
  { id: "google-analytics", label: "Google Analytics" },
  { id: "vercel-analytics", label: "Vercel Analytics" },
];

export const PAYMENT_OPTIONS = [
  { id: "stripe", label: "Stripe" },
  { id: "lemon-squeezy", label: "Lemon Squeezy" },
];

// --- Next Steps for Upgrade Completion ---

interface NextStep {
  label: string;
  description: string;
  url: string;
}

export const SERVICE_NEXT_STEPS: Record<string, NextStep> = {
  "supabase-db": {
    label: "Supabase Database",
    description: "Add your Supabase project URL and anon key to `.env.local`",
    url: "https://supabase.com/dashboard/projects",
  },
  "supabase-auth": {
    label: "Supabase Auth",
    description: "Configure auth providers and add Supabase keys to `.env.local`",
    url: "https://supabase.com/dashboard/projects",
  },
  clerk: {
    label: "Clerk",
    description: "Create a Clerk application and add your API keys to `.env.local`",
    url: "https://dashboard.clerk.com",
  },
  "next-auth": {
    label: "Auth.js",
    description: "Configure authentication providers in your Auth.js config",
    url: "https://authjs.dev/getting-started",
  },
  lucia: {
    label: "Lucia",
    description: "Set up your database adapter and session configuration",
    url: "https://lucia-auth.com/getting-started",
  },
  stripe: {
    label: "Stripe",
    description: "Add your Stripe publishable and secret keys to `.env.local`",
    url: "https://dashboard.stripe.com",
  },
  "lemon-squeezy": {
    label: "Lemon Squeezy",
    description: "Add your Lemon Squeezy API key and store ID to `.env.local`",
    url: "https://app.lemonsqueezy.com",
  },
  resend: {
    label: "Resend",
    description: "Add your Resend API key to `.env.local`",
    url: "https://resend.com",
  },
  sendgrid: {
    label: "SendGrid",
    description: "Add your SendGrid API key to `.env.local`",
    url: "https://app.sendgrid.com",
  },
  postmark: {
    label: "Postmark",
    description: "Add your Postmark server token to `.env.local`",
    url: "https://account.postmarkapp.com",
  },
  posthog: {
    label: "PostHog",
    description: "Add your PostHog project API key to `.env.local`",
    url: "https://app.posthog.com",
  },
  "google-analytics": {
    label: "Google Analytics",
    description: "Add your GA measurement ID to `.env.local`",
    url: "https://analytics.google.com",
  },
  "vercel-analytics": {
    label: "Vercel Analytics",
    description: "Enable analytics in your Vercel project settings",
    url: "https://vercel.com/analytics",
  },
  nhost: {
    label: "Nhost",
    description: "Add your Nhost subdomain and region to `.env.local`",
    url: "https://app.nhost.io",
  },
  postgres: {
    label: "PostgreSQL",
    description: "Set your database connection string in `.env.local`",
    url: "https://neon.tech",
  },
  sqlite: {
    label: "SQLite",
    description: "No setup needed — SQLite stores data in a local file",
    url: "https://www.sqlite.org",
  },
  "embedded-store": {
    label: "Embedded Store",
    description: "tauri-plugin-store provides key-value persistence with no setup",
    url: "https://v2.tauri.app/plugin/store/",
  },
};

export const PLATFORM_NEXT_STEPS: Record<string, NextStep> = {
  nextjs: {
    label: "Deploy to Vercel",
    description: "Deploy your Next.js app to Vercel for production hosting",
    url: "https://vercel.com/new",
  },
  "react-spa": {
    label: "Deploy to Netlify",
    description: "Deploy your React SPA to Netlify for static hosting",
    url: "https://app.netlify.com/start",
  },
  "node-api": {
    label: "Deploy to Railway",
    description: "Deploy your Node.js API to Railway for backend hosting",
    url: "https://railway.app/new",
  },
  "desktop-app": {
    label: "Distribute via GitHub Releases",
    description: "Set up GitHub Releases with Tauri's bundler for cross-platform distribution",
    url: "https://v2.tauri.app/distribute/",
  },
  "react-native": {
    label: "Publish to App Store",
    description: "Build and submit your React Native app to the App Store and Google Play",
    url: "https://reactnative.dev/docs/publishing-to-app-store",
  },
  expo: {
    label: "Build with EAS",
    description: "Build and submit your Expo app using Expo Application Services",
    url: "https://docs.expo.dev/build/introduction/",
  },
  flutter: {
    label: "Build for Release",
    description: "Build your Flutter app for iOS and Android release",
    url: "https://docs.flutter.dev/deployment",
  },
  godot: {
    label: "Export Project",
    description: "Export your Godot project for desktop, mobile, or web",
    url: "https://docs.godotengine.org/en/stable/tutorials/export/",
  },
  bevy: {
    label: "Build for Release",
    description: "Build an optimized release binary of your Bevy game",
    url: "https://bevyengine.org/learn/quick-start/getting-started/",
  },
  pygame: {
    label: "Package with PyInstaller",
    description: "Package your Pygame game as a standalone executable",
    url: "https://pyinstaller.org/en/stable/",
  },
};

export const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".svg": "image/svg+xml",
};

export const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));

// --- App Type Definitions ---

export interface AppTypeDefinition {
  id: AppType;
  label: string;
  description: string;
  icon: string;
  platforms: string[];
  backends: string[];
  authOptions: string[];
  featureCategories: string[];
  constraints: string[];
  serviceCategories: { email: boolean; analytics: boolean; payments: boolean };
  examples: { prompt: string; title: string }[];
}

export const APP_TYPES: AppTypeDefinition[] = [
  {
    id: "web",
    label: "Web",
    description: "Websites, dashboards, and web applications",
    icon: "Globe",
    platforms: ["nextjs", "tanstack-start", "react-spa", "node-api"],
    backends: ["localstorage", "duckdb", "supabase-db", "nhost", "postgres", "sqlite"],
    authOptions: ["supabase-auth", "clerk", "next-auth", "lucia"],
    featureCategories: ["UI & UX", "Data & Communication", "Content & Media", "Platform & Infra"],
    constraints: ["typescript-strict", "biome", "tailwind", "shadcn", "vitest", "ai-files"],
    serviceCategories: { email: true, analytics: true, payments: true },
    examples: [
      { prompt: "SaaS dashboard with auth and billing", title: "SaaS Dashboard" },
      { prompt: "Blog platform with markdown editor", title: "Blog Platform" },
      { prompt: "Project management tool with kanban board", title: "Project Management" },
      { prompt: "E-commerce store with cart and checkout", title: "E-commerce Store" },
    ],
  },
  {
    id: "mobile",
    label: "Mobile",
    description: "iOS and Android apps",
    icon: "Smartphone",
    platforms: ["react-native", "expo", "flutter"],
    backends: ["sqlite", "supabase-db", "localstorage", "embedded-store"],
    authOptions: ["supabase-auth", "clerk"],
    featureCategories: ["UI & UX", "Data & Communication", "Content & Media", "Mobile Native"],
    constraints: ["typescript-strict", "biome", "vitest", "ai-files"],
    serviceCategories: { email: false, analytics: false, payments: false },
    examples: [
      { prompt: "Fitness tracker with workout logging and progress charts", title: "Fitness Tracker" },
      { prompt: "Recipe app with ingredient search and meal planning", title: "Recipe App" },
      { prompt: "Habit tracker with streaks and daily reminders", title: "Habit Tracker" },
      { prompt: "Photo journal with albums and location tagging", title: "Photo Journal" },
    ],
  },
  {
    id: "desktop",
    label: "Desktop",
    description: "Native desktop applications",
    icon: "Monitor",
    platforms: ["desktop-app"],
    backends: ["sqlite", "duckdb", "embedded-store", "localstorage"],
    authOptions: [],
    featureCategories: ["UI & UX", "Data & Communication", "Desktop Native"],
    constraints: ["typescript-strict", "biome", "tailwind", "shadcn", "vitest", "ai-files"],
    serviceCategories: { email: false, analytics: false, payments: false },
    examples: [
      { prompt: "Markdown note-taking app with folder organization", title: "Markdown Notes" },
      { prompt: "System monitor with CPU, memory, and disk usage", title: "System Monitor" },
      { prompt: "Password manager with encrypted vault", title: "Password Manager" },
      { prompt: "Image batch processor with resize and convert", title: "Image Processor" },
    ],
  },
  {
    id: "game",
    label: "Game",
    description: "2D and 3D games",
    icon: "Gamepad2",
    platforms: ["godot", "bevy", "pygame"],
    backends: ["sqlite", "localstorage"],
    authOptions: [],
    featureCategories: ["Game Core"],
    constraints: ["ai-files"],
    serviceCategories: { email: false, analytics: false, payments: false },
    examples: [
      { prompt: "2D platformer with level editor and collectibles", title: "2D Platformer" },
      { prompt: "Turn-based RPG with inventory and combat system", title: "Turn-based RPG" },
      { prompt: "Puzzle game with procedurally generated levels", title: "Puzzle Game" },
      { prompt: "Tower defense with upgradeable towers and waves", title: "Tower Defense" },
    ],
  },
  {
    id: "tool",
    label: "Tool",
    description: "CLI tools and automation",
    icon: "Wrench",
    platforms: ["cli"],
    backends: ["sqlite", "localstorage"],
    authOptions: [],
    featureCategories: ["Data & Communication", "Platform & Infra"],
    constraints: ["typescript-strict", "biome", "vitest", "ai-files"],
    serviceCategories: { email: false, analytics: false, payments: false },
    examples: [
      { prompt: "Git workflow automator with branch management", title: "Git Automator" },
      { prompt: "File organizer CLI that sorts files by type and date", title: "File Organizer" },
      { prompt: "Code scaffolding tool with customizable templates", title: "Code Scaffolder" },
      { prompt: "Dev environment manager with project presets", title: "Dev Env Manager" },
    ],
  },
];

// --- App Type Helper Functions ---

export function getAppTypeDefinition(appTypeId: AppType): AppTypeDefinition {
  return APP_TYPES.find((t) => t.id === appTypeId) ?? APP_TYPES[0];
}

export function getAppTypeForPlatform(platformId: string): AppType {
  for (const appType of APP_TYPES) {
    if (appType.platforms.includes(platformId)) return appType.id;
  }
  return "web";
}

export function getPlatformsForAppType(appTypeId: AppType) {
  const appType = getAppTypeDefinition(appTypeId);
  return PLATFORMS.filter((p) => appType.platforms.includes(p.id));
}

export function getExamplesForAppType(appTypeId: AppType) {
  return getAppTypeDefinition(appTypeId).examples;
}

export function getBackendsForAppType(appTypeId: AppType) {
  const appType = getAppTypeDefinition(appTypeId);
  return BACKEND_OPTIONS.filter((b) => appType.backends.includes(b.id));
}

export function getAuthForAppType(appTypeId: AppType) {
  const appType = getAppTypeDefinition(appTypeId);
  return AUTH_OPTIONS.filter((a) => appType.authOptions.includes(a.id));
}

export function getFeatureCategoriesForAppType(appTypeId: AppType) {
  const appType = getAppTypeDefinition(appTypeId);
  return FEATURE_CATEGORIES.filter((c) => appType.featureCategories.includes(c.label));
}

export function getConstraintsForAppType(appTypeId: AppType) {
  const appType = getAppTypeDefinition(appTypeId);
  return CONSTRAINT_OPTIONS.filter((c) => appType.constraints.includes(c.id));
}

/** Platform IDs that produce an HTTP dev server */
export const PLATFORMS_WITH_DEV_SERVER = new Set([
  "nextjs",
  "tanstack-start",
  "react-spa",
  "node-api",
  "desktop-app",
  "expo",
  "react-native",
  "flutter",
]);

// --- Preview Strategy ---

export type PreviewStrategy = "iframe" | "iframe-web-mode" | "run-instructions";

export const PLATFORM_PREVIEW_STRATEGY: Record<string, PreviewStrategy> = {
  nextjs: "iframe",
  "tanstack-start": "iframe",
  "react-spa": "iframe",
  "node-api": "iframe",
  "desktop-app": "iframe",
  expo: "iframe-web-mode",
  flutter: "iframe-web-mode",
  "react-native": "run-instructions",
  godot: "run-instructions",
  bevy: "run-instructions",
  pygame: "run-instructions",
  cli: "run-instructions",
};

export interface PlatformRunInstruction {
  title: string;
  runCommand: string;
  description: string;
  steps: string[];
}

export const PLATFORM_RUN_INSTRUCTIONS: Record<string, PlatformRunInstruction> = {
  "react-native": {
    title: "React Native",
    runCommand: "npx react-native start",
    description: "Start the Metro bundler and run on a connected device or emulator",
    steps: [
      "Open a terminal in the project directory",
      "Run `npx react-native start` to start Metro",
      "In another terminal, run `npx react-native run-ios` or `npx react-native run-android`",
      "The app will open in the iOS Simulator or Android Emulator",
    ],
  },
  godot: {
    title: "Godot",
    runCommand: "godot --editor",
    description: "Open the project in the Godot editor",
    steps: [
      "Open Godot Engine",
      "Import the project by selecting the project.godot file",
      "Press F5 or click the Play button to run the main scene",
    ],
  },
  bevy: {
    title: "Bevy",
    runCommand: "cargo run",
    description: "Compile and run the Bevy game",
    steps: [
      "Open a terminal in the project directory",
      "Run `cargo run` to compile and launch the game",
      "First build may take several minutes as Bevy compiles",
    ],
  },
  pygame: {
    title: "Pygame",
    runCommand: "python main.py",
    description: "Run the Pygame game with Python",
    steps: [
      "Open a terminal in the project directory",
      "Ensure pygame is installed: `pip install pygame`",
      "Run `python main.py` to start the game",
    ],
  },
  cli: {
    title: "CLI Tool",
    runCommand: "See project README",
    description: "Run the CLI tool from a terminal",
    steps: [
      "Open a terminal in the project directory",
      "Follow the README.md for build and run instructions",
      "For TypeScript CLIs: `pnpm run build && node dist/index.js`",
    ],
  },
};

export function getEffectivePreviewStrategy(platform: string, toolVersions?: Record<string, string>): PreviewStrategy {
  const base = PLATFORM_PREVIEW_STRATEGY[platform] ?? "run-instructions";
  if (base === "iframe-web-mode" && toolVersions) {
    if (platform === "expo") {
      const targets = toolVersions["expo-targets"]?.split(",") ?? [];
      if (!targets.includes("web")) return "run-instructions";
    }
    if (platform === "flutter") {
      const targets = toolVersions["flutter-targets"]?.split(",") ?? [];
      if (!targets.includes("web")) return "run-instructions";
    }
  }
  return base;
}

// --- Session Constants (re-exported from shared package) ---

export {
  SESSION_EVENT_BUFFER_SIZE,
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_LOG_FLUSH_INTERVAL_MS,
} from "@claudekit/session";

export const SESSION_TYPE_LABELS: Record<string, string> = {
  scaffold: "Scaffold",
  upgrade: "Upgrade",
  auto_fix: "Auto Fix",
  upgrade_init: "Upgrade Init",
  chat: "Chat",
};
