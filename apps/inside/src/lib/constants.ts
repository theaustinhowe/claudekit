export const APP_NAME = "Inside";

// --- Generator Project Constants ---

export const PLATFORMS = [
  { id: "nextjs", label: "Next.js App Router", description: "Full-stack React with server components" },
  { id: "react-spa", label: "React SPA", description: "Client-side React with Vite" },
  { id: "node-api", label: "Node.js API", description: "Backend REST/GraphQL server" },
  { id: "monorepo", label: "Monorepo", description: "Multi-package workspace" },
  { id: "cli", label: "CLI Tool", description: "Command-line application" },
] as const;

export const CONSTRAINT_OPTIONS = [
  { id: "typescript-strict", label: "TypeScript Strict", defaultOn: true },
  { id: "biome", label: "Biome (Lint + Format)", defaultOn: true },
  { id: "tailwind", label: "Tailwind CSS", defaultOn: true },
  { id: "shadcn", label: "shadcn/ui", defaultOn: false },
  { id: "vitest", label: "Vitest", defaultOn: false },
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

export const FRAMEWORK_OPTIONS: { id: string; label: string; description: string }[] = [
  ...PLATFORMS,
  { id: "tanstack-start", label: "TanStack Start", description: "Full-stack React with TanStack Router" },
];

export const BACKEND_OPTIONS = [
  { id: "localstorage", label: "localStorage" },
  { id: "duckdb", label: "DuckDB" },
  { id: "supabase-db", label: "Supabase" },
  { id: "nhost", label: "Nhost" },
  { id: "postgres", label: "PostgreSQL" },
];

export const AUTH_OPTIONS = [
  { id: "supabase-auth", label: "Supabase Auth" },
  { id: "clerk", label: "Clerk" },
  { id: "next-auth", label: "NextAuth.js" },
  { id: "lucia", label: "Lucia" },
];

export const FEATURE_OPTIONS = [
  { id: "real-time", label: "Real-time" },
  { id: "file-upload", label: "File Upload" },
  { id: "dark-mode", label: "Dark Mode" },
  { id: "i18n", label: "i18n" },
  { id: "search", label: "Search" },
  { id: "notifications", label: "Notifications" },
];

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

// --- Session Constants ---

export const SESSION_EVENT_BUFFER_SIZE = 500;
export const SESSION_LOG_FLUSH_INTERVAL_MS = 2_000;
export const SESSION_HEARTBEAT_INTERVAL_MS = 15_000;

export const SESSION_TYPE_LABELS: Record<string, string> = {
  scaffold: "Scaffold",
  upgrade: "Upgrade",
  auto_fix: "Auto Fix",
  upgrade_init: "Upgrade Init",
  chat: "Chat",
};
