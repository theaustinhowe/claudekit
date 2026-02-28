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
];

export const FEATURE_OPTIONS = FEATURE_CATEGORIES.flatMap((c) => c.features);

interface FrameworkVersion {
  label: string;
  value: string;
  isLatest?: boolean;
}

export const FRAMEWORK_VERSIONS: Record<string, FrameworkVersion[]> = {
  nextjs: [
    { label: "Next.js 16 (latest)", value: "16", isLatest: true },
    { label: "Next.js 15", value: "15" },
    { label: "Next.js 14", value: "14" },
  ],
  "react-spa": [
    { label: "React 19 + Vite (latest)", value: "react19-vite", isLatest: true },
    { label: "React 18 + Vite", value: "react18-vite" },
  ],
  "node-api": [
    { label: "Node 22 LTS (latest)", value: "node22", isLatest: true },
    { label: "Node 20 LTS", value: "node20" },
  ],
  "tanstack-start": [{ label: "TanStack Start 1.x (latest)", value: "1.x", isLatest: true }],
};

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
