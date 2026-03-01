"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { ColorSchemePicker } from "@claudekit/ui/components/color-scheme-picker";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@claudekit/ui/components/select";
import { Switch } from "@claudekit/ui/components/switch";
import { Textarea } from "@claudekit/ui/components/textarea";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  Gamepad2,
  Globe,
  Layers,
  Loader2,
  Monitor,
  Paintbrush,
  Rocket,
  Smartphone,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/directory-picker";
import { FeaturesInput } from "@/components/generator/features-input";
import { InspirationInput } from "@/components/generator/inspiration-input";
import { VibesSelector } from "@/components/generator/vibes-selector";
import { checkPathExists, createGeneratorProject } from "@/lib/actions/generator-projects";
import type { ConditionalOption } from "@/lib/constants";
import {
  ANALYTICS_OPTIONS,
  APP_TYPES,
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  EMAIL_OPTIONS,
  getAuthForAppType,
  getBackendsForAppType,
  getConstraintsForAppType,
  getExamplesForAppType,
  getFeatureCategoriesForAppType,
  getPlatformsForAppType,
  PAYMENT_OPTIONS,
  PLATFORM_ADVANCED_OPTIONS,
  PLATFORMS,
  TS_ONLY_CONSTRAINTS,
} from "@/lib/constants";
import type { AppType, ToolCheckResult } from "@/lib/types";

const APP_TYPE_ICONS: Record<string, typeof Globe> = {
  Globe,
  Smartphone,
  Monitor,
  Gamepad2,
  Wrench,
};

const OVERVIEW_STEPS = [
  {
    label: "Describe",
    brief: "Your idea, stack, and constraints",
    icon: Sparkles,
    bullets: [
      "Write a plain-language description of what you want to build",
      "Pick a framework, backend, auth, and any services you need",
      "Toggle constraints like TypeScript strict, Biome, Tailwind",
    ],
    preview: [
      "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
      "\u2502 \u2728 Design                        \u2502",
      "\u2502 Project Title  [My App_____]   \u2502",
      "\u2502 Description    [____________]  \u2502",
      "\u2502                                \u2502",
      "\u2502 \u25a6 Technical Stack               \u2502",
      "\u2502 [Next.js] [React] [Node]       \u2502",
      "\u2502 [\u2713 TypeScript] [\u2713 Biome]       \u2502",
      "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
    ],
  },
  {
    label: "Scaffold",
    brief: "Working prototype with mock data",
    icon: Rocket,
    bullets: [
      "Claude generates a complete, runnable project in seconds",
      "Uses realistic mock data \u2014 no API keys or databases needed",
      "Run it immediately with your package manager",
    ],
    preview: [
      "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
      "\u2502 \u25b6 Scaffolding...           82%  \u2502",
      "\u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e  \u2502",
      "\u2502                                \u2502",
      "\u2502 \u2713 Created project structure    \u2502",
      "\u2502 \u2713 Installed dependencies       \u2502",
      "\u2502 \u2713 Generated components         \u2502",
      "\u2502 \u25cb Writing API routes...        \u2502",
      "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
    ],
  },
  {
    label: "Design",
    brief: "Iterate on UI with Claude",
    icon: Paintbrush,
    bullets: [
      "Chat with Claude to refine pages, components, and layouts",
      "See a live UI spec with pages, routes, and component tree",
      "Iterate until the design feels right",
    ],
    preview: [
      "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
      '\u2502 \ud83d\udcac "Add a settings page"       \u2502',
      "\u2502                                \u2502",
      "\u2502  Pages  Components  Layouts    \u2502",
      "\u2502 \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510   \u2502",
      "\u2502 \u2502 /dash   \u2502\u2502 <Sidebar />  \u2502   \u2502",
      "\u2502 \u2502 /settings\u2502 <UserCard /> \u2502   \u2502",
      "\u2502 \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518   \u2502",
      "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
    ],
  },
  {
    label: "Upgrade",
    brief: "Swap in real services",
    icon: Wrench,
    bullets: [
      "Claude generates a step-by-step plan to integrate real services",
      "Database, auth, payments, email \u2014 one task at a time",
      "Sets up .env.example with all required keys",
    ],
    preview: [
      "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
      "\u2502 Upgrade Plan                   \u2502",
      "\u2502                                \u2502",
      "\u2502 \u2713 Set up Supabase Auth         \u2502",
      "\u2502 \u2713 Connect PostgreSQL            \u2502",
      "\u2502 \u25b6 Integrate Stripe payments     \u2502",
      "\u2502 \u25cb Configure environment vars    \u2502",
      "\u2502                                \u2502",
      "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
    ],
  },
];

function OverviewBanner({ onDismiss }: { onDismiss: () => void }) {
  const [activeStep, setActiveStep] = useState<number>(0);

  return (
    <div className="relative rounded-lg border bg-muted/30 p-4 pr-10">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <h2 className="font-semibold">How it works</h2>
      <div className="grid grid-cols-4 gap-3 mt-3">
        {OVERVIEW_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isSelected = activeStep === i;
          return (
            <button
              type="button"
              key={step.label}
              onClick={() => setActiveStep(i)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-transparent bg-muted/50 hover:border-muted-foreground/30 hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
              <p className="text-xs mt-1.5 pl-8 text-muted-foreground">{step.brief}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg border bg-background p-4 grid grid-cols-[1fr_auto] gap-6 items-start">
        <div>
          <h3 className="text-sm font-semibold">
            {activeStep + 1}. {OVERVIEW_STEPS[activeStep].label}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {OVERVIEW_STEPS[activeStep].bullets.map((b) => (
              <li key={b} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/50 shrink-0">{"\u2022"}</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <pre className="text-[11px] leading-tight text-muted-foreground font-mono bg-muted/50 rounded-md p-3 select-none hidden sm:block">
          {OVERVIEW_STEPS[activeStep].preview.join("\n")}
        </pre>
      </div>
    </div>
  );
}

// --- Advanced option helpers ---

function getVisibleOptions(options: ConditionalOption[], toolVersions: Record<string, string>): ConditionalOption[] {
  return options.filter((co) => !co.visibleWhen || co.visibleWhen(toolVersions));
}

function getDefaultsForPlatform(platformId: string): Record<string, string> {
  const opts = PLATFORM_ADVANCED_OPTIONS[platformId];
  if (!opts) return {};
  const defaults: Record<string, string> = {};
  for (const co of opts) {
    const opt = co.option;
    if (opt.type === "select") {
      const def = opt.options.find((o) => o.isDefault);
      if (def) defaults[opt.key] = def.value;
    } else if (opt.type === "boolean") {
      defaults[opt.key] = String(opt.defaultValue);
    }
    // multi-select defaults to empty (no defaultValues to pre-fill)
  }
  return defaults;
}

function getKeysForPlatform(platformId: string): Set<string> {
  const opts = PLATFORM_ADVANCED_OPTIONS[platformId];
  if (!opts) return new Set();
  return new Set(opts.map((co) => co.option.key));
}

// --- Folder collision helpers ---

function suggestUniqueName(baseName: string): string {
  const match = baseName.match(/^(.+)-(\d+)$/);
  if (match) {
    return `${match[1]}-${Number(match[2]) + 1}`;
  }
  return `${baseName}-2`;
}

// --- Component ---

interface DescribeStepProps {
  defaultPath: string;
  installedPMs: ToolCheckResult[];
}

export function DescribeStep({ defaultPath, installedPMs }: DescribeStepProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [overviewCollapsed, setOverviewCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("inside:new-overview-collapsed") === "1";
  });

  // App Type (first step) — persisted in URL ?type= param via nuqs
  const [appType, setAppType] = useQueryState(
    "type",
    parseAsStringLiteral(["web", "mobile", "desktop", "game", "tool"] as const).withOptions({
      history: "push",
    }),
  );

  // Design
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [inspirationUrls, setInspirationUrls] = useState<string[]>([]);
  const [colorScheme, setColorScheme] = useState<{ primary?: string; accent?: string }>({});

  // Technical Stack
  const [platform, setPlatform] = useState("nextjs");
  const [services, setServices] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [customFeatures, setCustomFeatures] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>(
    CONSTRAINT_OPTIONS.filter((c) => c.defaultOn).map((c) => c.id),
  );

  // Optional section toggles
  const [backendEnabled, setBackendEnabled] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [featuresEnabled, setFeaturesEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);

  // Version selection
  const [toolVersions, setToolVersions] = useState<Record<string, string>>(() => getDefaultsForPlatform("nextjs"));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [designOptionsOpen, setDesignOptionsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);

  // CLI constraint auto-disable
  const [constraintNote, setConstraintNote] = useState<string | null>(null);
  const prevConstraintsRef = useRef<string[] | null>(null);

  // Project
  const [projectName, setProjectName] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [projectPath, setProjectPath] = useState(defaultPath);
  const [packageManager, setPackageManager] = useState(installedPMs.find((r) => r.installed)?.toolId ?? "pnpm");
  const [initGit, setInitGit] = useState(true);
  const [projectOpen, setProjectOpen] = useState(false);

  // Folder collision check
  const [pathExists, setPathExists] = useState(false);
  const [checkingPath, setCheckingPath] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "my-app";

  // Derive project folder from title unless user has manually edited it
  const effectiveProjectName = projectNameTouched ? projectName : title ? slugify(title) : "my-app";
  const fullPath = `${projectPath}/${effectiveProjectName}`;

  // --- Folder collision debounced check ---
  const checkPath = useCallback((pathToCheck: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCheckingPath(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const exists = await checkPathExists(pathToCheck);
        setPathExists(exists);
      } catch {
        setPathExists(false);
      } finally {
        setCheckingPath(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    checkPath(fullPath);
  }, [fullPath, checkPath]);

  // --- Platform change: clear stale keys, set defaults ---
  const handlePlatformChange = useCallback(
    (newPlatform: string) => {
      const oldKeys = getKeysForPlatform(platform);
      const newDefaults = getDefaultsForPlatform(newPlatform);

      setToolVersions((prev) => {
        const next: Record<string, string> = {};
        // Keep keys that don't belong to the old platform
        for (const [k, v] of Object.entries(prev)) {
          if (!oldKeys.has(k)) next[k] = v;
        }
        // Apply new defaults
        return { ...next, ...newDefaults };
      });

      setPlatform(newPlatform);
      setConstraintNote(null);

      // If switching away from CLI with non-TS language, restore constraints
      if (platform === "cli" && prevConstraintsRef.current) {
        setConstraints(prevConstraintsRef.current);
        prevConstraintsRef.current = null;
      }
    },
    [platform],
  );

  // --- App type change: reset everything to filtered defaults ---
  const handleAppTypeChange = useCallback((newAppType: AppType) => {
    setAppType(newAppType);
    const typeDef = APP_TYPES.find((t) => t.id === newAppType);
    if (!typeDef) return;

    // Reset platform to first in the filtered list
    const firstPlatform = typeDef.platforms[0];
    setPlatform(firstPlatform);
    setToolVersions(getDefaultsForPlatform(firstPlatform));

    // Reset constraints to app type defaults
    const validConstraintIds = new Set(typeDef.constraints);
    setConstraints(CONSTRAINT_OPTIONS.filter((c) => c.defaultOn && validConstraintIds.has(c.id)).map((c) => c.id));
    prevConstraintsRef.current = null;
    setConstraintNote(null);

    // Clear services that are no longer available
    const validBackendIds = new Set(typeDef.backends);
    const validAuthIds = new Set(typeDef.authOptions);
    setServices((prev) => prev.filter((s) => validBackendIds.has(s) || validAuthIds.has(s)));
    setSelectedFeatures([]);
    setCustomFeatures([]);

    // Reset service toggles based on availability
    if (!typeDef.serviceCategories.email) setEmailEnabled(false);
    if (!typeDef.serviceCategories.analytics) setAnalyticsEnabled(false);
    if (!typeDef.serviceCategories.payments) setPaymentsEnabled(false);
    if (typeDef.authOptions.length === 0) setAuthEnabled(false);
  }, []);

  // --- Constraint auto-disable for CLI (non-TS) and Desktop App (non-React UI) ---
  // biome-ignore lint/correctness/useExhaustiveDependencies: constraints is read as snapshot on platform/language change
  useEffect(() => {
    const isCli = platform === "cli";
    const isDesktop = platform === "desktop-app";

    if (!isCli && !isDesktop) {
      if (prevConstraintsRef.current) {
        setConstraints(prevConstraintsRef.current);
        prevConstraintsRef.current = null;
        setConstraintNote(null);
      }
      return;
    }

    if (isCli) {
      const lang = toolVersions["cli-language"] ?? "typescript";
      if (lang !== "typescript") {
        if (!prevConstraintsRef.current) {
          prevConstraintsRef.current = constraints;
        }
        setConstraints((prev) => prev.filter((c) => !TS_ONLY_CONSTRAINTS.has(c)));
        const langLabel = lang.charAt(0).toUpperCase() + lang.slice(1);
        setConstraintNote(`Constraints adjusted for ${langLabel}`);
      } else {
        if (prevConstraintsRef.current) {
          setConstraints(prevConstraintsRef.current);
          prevConstraintsRef.current = null;
        }
        setConstraintNote(null);
      }
    }

    if (isDesktop) {
      const uiLayer = toolVersions["desktop-ui"] ?? "react-vite";
      if (uiLayer !== "react-vite") {
        // shadcn/ui is React-only — strip it for Svelte/Solid
        if (!prevConstraintsRef.current) {
          prevConstraintsRef.current = constraints;
        }
        setConstraints((prev) => prev.filter((c) => c !== "shadcn"));
        setConstraintNote(`shadcn/ui disabled — not available for ${uiLayer === "svelte" ? "Svelte" : "Solid"}`);
      } else {
        if (prevConstraintsRef.current) {
          setConstraints(prevConstraintsRef.current);
          prevConstraintsRef.current = null;
        }
        setConstraintNote(null);
      }
    }
  }, [platform, toolVersions["cli-language"], toolVersions["desktop-ui"]]);

  const toggleService = (id: string) => {
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleConstraint = (id: string) => {
    setConstraints((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleMultiSelect = (key: string, value: string) => {
    setToolVersions((prev) => {
      const current = prev[key]?.split(",").filter(Boolean) ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next.join(",") };
    });
  };

  const handleGenerate = async () => {
    if (!idea.trim()) {
      toast.error("Please describe your project idea");
      return;
    }
    if (!effectiveProjectName.trim()) {
      toast.error("Please enter a project folder name");
      return;
    }

    setCreating(true);
    try {
      const project = await createGeneratorProject({
        title: title.trim() || effectiveProjectName,
        idea_description: idea.trim(),
        app_type: appType ?? "web",
        platform,
        services: [...services, ...selectedFeatures],
        constraints,
        project_name: effectiveProjectName.trim(),
        project_path: projectPath,
        package_manager: packageManager,
        design_vibes: vibes,
        inspiration_urls: inspirationUrls,
        color_scheme: colorScheme,
        custom_features: customFeatures,
        tool_versions: Object.keys(toolVersions).length > 0 ? toolVersions : undefined,
      });
      router.push(`/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
      setCreating(false);
    }
  };

  // --- Advanced options for current platform ---
  const platformOptions = PLATFORM_ADVANCED_OPTIONS[platform] ?? [];
  const visibleOptions = getVisibleOptions(platformOptions, toolVersions);

  // --- Filtered constants based on app type ---
  const currentAppType = appType ?? "web";
  const filteredPlatforms = appType ? getPlatformsForAppType(currentAppType) : PLATFORMS;
  const filteredBackends = appType ? getBackendsForAppType(currentAppType) : BACKEND_OPTIONS;
  const filteredAuth = appType ? getAuthForAppType(currentAppType) : AUTH_OPTIONS;
  const filteredConstraints = appType ? getConstraintsForAppType(currentAppType) : CONSTRAINT_OPTIONS;
  const filteredFeatureCategories = appType ? getFeatureCategoriesForAppType(currentAppType) : undefined;
  const examplePrompts = appType
    ? getExamplesForAppType(currentAppType).map((e) => e.prompt)
    : [
        "SaaS dashboard with auth and billing",
        "Blog platform with markdown editor",
        "Project management tool with kanban board",
        "E-commerce store with cart and checkout",
      ];
  const appTypeDef = appType ? APP_TYPES.find((t) => t.id === appType) : null;

  // --- App Type Selector (shown when appType is null) ---
  if (!appType) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">What are you building?</h1>
          <p className="text-muted-foreground">Choose a project type to get started</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {APP_TYPES.map((t) => {
            const Icon = APP_TYPE_ICONS[t.icon] ?? Globe;
            return (
              <Card
                key={t.id}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => handleAppTypeChange(t.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="w-5 h-5 text-primary" />
                    {t.label}
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {t.platforms.map((pid) => {
                      const p = PLATFORMS.find((pl) => pl.id === pid);
                      return (
                        <Badge key={pid} variant="secondary" className="text-xs">
                          {p?.label ?? pid}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* App type indicator + back button */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setAppType(null)} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        {appTypeDef && (
          <Badge variant="outline" className="gap-1.5">
            {(() => {
              const Icon = APP_TYPE_ICONS[appTypeDef.icon] ?? Globe;
              return <Icon className="w-3.5 h-3.5" />;
            })()}
            {appTypeDef.label}
          </Badge>
        )}
      </div>

      {/* Overview */}
      {overviewCollapsed ? (
        <button
          type="button"
          onClick={() => {
            setOverviewCollapsed(false);
            localStorage.setItem("inside:new-overview-collapsed", "0");
          }}
          className="w-full flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
          <span className="font-medium">How it works</span>
        </button>
      ) : (
        <OverviewBanner
          onDismiss={() => {
            setOverviewCollapsed(true);
            localStorage.setItem("inside:new-overview-collapsed", "1");
          }}
        />
      )}

      {/* Design */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Design
          </CardTitle>
          <CardDescription>What do you want to build? Be as detailed or brief as you like.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Project Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome App"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="idea">Description</Label>
            <Textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g., A project management tool where teams can create boards, add tasks with drag-and-drop, assign members, and track progress..."
              className="mt-1 min-h-[120px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setIdea(prompt);
                  setTitle(prompt.split(" with ")[0]);
                }}
                className={`text-xs rounded-full px-3 py-1 transition-colors ${
                  idea === prompt ? "bg-primary/10 text-primary" : "text-muted-foreground bg-muted/50 hover:bg-muted"
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
          <Collapsible open={designOptionsOpen} onOpenChange={setDesignOptionsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {designOptionsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Design Options
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              <div>
                <Label className="mb-3 block">Design Vibes</Label>
                <VibesSelector value={vibes} onChange={setVibes} />
              </div>
              <div>
                <Label className="mb-3 block">Inspiration URLs</Label>
                <InspirationInput urls={inspirationUrls} onChange={setInspirationUrls} />
              </div>
              <div>
                <Label className="mb-3 block">Color Scheme</Label>
                <ColorSchemePicker value={colorScheme} onChange={setColorScheme} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Technical Stack */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Technical Stack
          </CardTitle>
          <CardDescription>Choose your framework, services, and constraints</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Framework */}
          <div>
            <Label className="mb-3 block">Framework</Label>
            <div className="grid sm:grid-cols-3 lg:grid-cols-3 gap-3">
              {filteredPlatforms.map((p) => (
                <Card
                  key={p.id}
                  className={`cursor-pointer transition-all p-3 ${
                    platform === p.id ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"
                  }`}
                  onClick={() => handlePlatformChange(p.id)}
                >
                  <p className="font-medium text-sm">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Advanced Options */}
          {visibleOptions.length > 0 && (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Advanced Options
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-4 p-1">
                {visibleOptions.map((co) => {
                  const opt = co.option;

                  if (opt.type === "select") {
                    const currentValue = toolVersions[opt.key] ?? opt.options.find((o) => o.isDefault)?.value ?? "";
                    const currentLabel = opt.options.find((o) => o.value === currentValue)?.label;
                    return (
                      <div key={opt.key} className="max-w-xs">
                        <Label className="mb-2 block">{opt.label}</Label>
                        {opt.description && <p className="text-xs text-muted-foreground mb-2">{opt.description}</p>}
                        <Select
                          value={currentValue}
                          onValueChange={(value) => setToolVersions((prev) => ({ ...prev, [opt.key]: value }))}
                        >
                          <SelectTrigger>
                            <span>{currentLabel}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {opt.options.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  if (opt.type === "multi-select") {
                    const selected = toolVersions[opt.key]?.split(",").filter(Boolean) ?? [];
                    return (
                      <div key={opt.key}>
                        <Label className="mb-2 block">{opt.label}</Label>
                        {opt.description && <p className="text-xs text-muted-foreground mb-2">{opt.description}</p>}
                        <div className="flex flex-wrap gap-2">
                          {opt.options.map((o) => (
                            <Badge
                              key={o.value}
                              variant={selected.includes(o.value) ? "default" : "outline"}
                              className="cursor-pointer transition-colors"
                              onClick={() => toggleMultiSelect(opt.key, o.value)}
                            >
                              {o.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (opt.type === "boolean") {
                    return (
                      <div key={opt.key} className="flex items-center justify-between max-w-xs">
                        <div>
                          <Label>{opt.label}</Label>
                          {opt.description && <p className="text-xs text-muted-foreground">{opt.description}</p>}
                        </div>
                        <Switch
                          checked={toolVersions[opt.key] === "true"}
                          onCheckedChange={(checked) =>
                            setToolVersions((prev) => ({ ...prev, [opt.key]: String(checked) }))
                          }
                        />
                      </div>
                    );
                  }

                  return null;
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Services */}
          <Collapsible open={servicesOpen} onOpenChange={setServicesOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {servicesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Services
              {!servicesOpen && (
                <span className="text-xs text-muted-foreground/70">
                  {(() => {
                    const enabled = [
                      backendEnabled && "Backend",
                      authEnabled && "Auth",
                      featuresEnabled && "Features",
                      emailEnabled && "Email",
                      analyticsEnabled && "Analytics",
                      paymentsEnabled && "Payments",
                    ].filter(Boolean);
                    return enabled.length > 0 ? `\u2014 ${enabled.join(", ")}` : "\u2014 None selected";
                  })()}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Backend */}
                <div
                  className={`p-3 rounded-lg border transition-colors ${
                    backendEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                  }`}
                >
                  {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium">Backend</span>
                    <Switch
                      checked={backendEnabled}
                      onCheckedChange={(checked) => {
                        setBackendEnabled(checked);
                        if (!checked) {
                          const backendIds = BACKEND_OPTIONS.map((o) => o.id);
                          setServices((prev) => prev.filter((s) => !backendIds.includes(s)));
                        }
                      }}
                    />
                  </label>
                  {backendEnabled && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                      {filteredBackends.map((opt) => (
                        <Badge
                          key={opt.id}
                          variant={services.includes(opt.id) ? "default" : "outline"}
                          className="cursor-pointer transition-colors"
                          onClick={() => toggleService(opt.id)}
                        >
                          {opt.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Auth */}
                {filteredAuth.length > 0 && (
                  <div
                    className={`p-3 rounded-lg border transition-colors ${
                      authEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                    }`}
                  >
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium">Auth</span>
                      <Switch
                        checked={authEnabled}
                        onCheckedChange={(checked) => {
                          setAuthEnabled(checked);
                          if (!checked) {
                            const authIds = filteredAuth.map((o) => o.id);
                            setServices((prev) => prev.filter((s) => !authIds.includes(s)));
                          }
                        }}
                      />
                    </label>
                    {authEnabled && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                        {filteredAuth.map((opt) => (
                          <Badge
                            key={opt.id}
                            variant={services.includes(opt.id) ? "default" : "outline"}
                            className="cursor-pointer transition-colors"
                            onClick={() => toggleService(opt.id)}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Email */}
                {(!appTypeDef || appTypeDef.serviceCategories.email) && (
                  <div
                    className={`p-3 rounded-lg border transition-colors ${
                      emailEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                    }`}
                  >
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium">Email</span>
                      <Switch
                        checked={emailEnabled}
                        onCheckedChange={(checked) => {
                          setEmailEnabled(checked);
                          if (!checked) {
                            const emailIds = EMAIL_OPTIONS.map((o) => o.id);
                            setServices((prev) => prev.filter((s) => !emailIds.includes(s)));
                          }
                        }}
                      />
                    </label>
                    {emailEnabled && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                        {EMAIL_OPTIONS.map((opt) => (
                          <Badge
                            key={opt.id}
                            variant={services.includes(opt.id) ? "default" : "outline"}
                            className="cursor-pointer transition-colors"
                            onClick={() => toggleService(opt.id)}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Analytics */}
                {(!appTypeDef || appTypeDef.serviceCategories.analytics) && (
                  <div
                    className={`p-3 rounded-lg border transition-colors ${
                      analyticsEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                    }`}
                  >
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium">Analytics</span>
                      <Switch
                        checked={analyticsEnabled}
                        onCheckedChange={(checked) => {
                          setAnalyticsEnabled(checked);
                          if (!checked) {
                            const analyticsIds = ANALYTICS_OPTIONS.map((o) => o.id);
                            setServices((prev) => prev.filter((s) => !analyticsIds.includes(s)));
                          }
                        }}
                      />
                    </label>
                    {analyticsEnabled && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                        {ANALYTICS_OPTIONS.map((opt) => (
                          <Badge
                            key={opt.id}
                            variant={services.includes(opt.id) ? "default" : "outline"}
                            className="cursor-pointer transition-colors"
                            onClick={() => toggleService(opt.id)}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Payments */}
                {(!appTypeDef || appTypeDef.serviceCategories.payments) && (
                  <div
                    className={`p-3 rounded-lg border transition-colors ${
                      paymentsEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                    }`}
                  >
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium">Payments</span>
                      <Switch
                        checked={paymentsEnabled}
                        onCheckedChange={(checked) => {
                          setPaymentsEnabled(checked);
                          if (!checked) {
                            const paymentIds = PAYMENT_OPTIONS.map((o) => o.id);
                            setServices((prev) => prev.filter((s) => !paymentIds.includes(s)));
                          }
                        }}
                      />
                    </label>
                    {paymentsEnabled && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                        {PAYMENT_OPTIONS.map((opt) => (
                          <Badge
                            key={opt.id}
                            variant={services.includes(opt.id) ? "default" : "outline"}
                            className="cursor-pointer transition-colors"
                            onClick={() => toggleService(opt.id)}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Features */}
                <div
                  className={`sm:col-span-2 p-3 rounded-lg border transition-colors ${
                    featuresEnabled ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                  }`}
                >
                  {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium">Features</span>
                    <Switch
                      checked={featuresEnabled}
                      onCheckedChange={(checked) => {
                        setFeaturesEnabled(checked);
                        if (!checked) {
                          setSelectedFeatures([]);
                          setCustomFeatures([]);
                        }
                      }}
                    />
                  </label>
                  {featuresEnabled && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <FeaturesInput
                        selectedFeatures={selectedFeatures}
                        customFeatures={customFeatures}
                        onFeaturesChange={setSelectedFeatures}
                        onCustomChange={setCustomFeatures}
                        categories={filteredFeatureCategories}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Constraints */}
          <Collapsible open={constraintsOpen} onOpenChange={setConstraintsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {constraintsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Constraints
              {!constraintsOpen && (
                <span className="text-xs text-muted-foreground/70">
                  {(() => {
                    const active = CONSTRAINT_OPTIONS.filter((c) => constraints.includes(c.id)).map((c) => c.label);
                    if (active.length === 0) return "\u2014 None selected";
                    if (active.length <= 3) return `\u2014 ${active.join(", ")}`;
                    return `\u2014 ${active.slice(0, 3).join(", ")}, +${active.length - 3} more`;
                  })()}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredConstraints.map((c) => (
                  // biome-ignore lint/a11y/noLabelWithoutControl: Switch renders as a button control inside this label
                  <label
                    key={c.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors text-left ${
                      constraints.includes(c.id) ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                    }`}
                  >
                    <span className="text-sm font-medium">{c.label}</span>
                    <Switch checked={constraints.includes(c.id)} onCheckedChange={() => toggleConstraint(c.id)} />
                  </label>
                ))}
              </div>
              {constraintNote && <p className="text-xs text-muted-foreground mt-2 italic">{constraintNote}</p>}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Project Config (Collapsible) */}
      <Card>
        <Collapsible open={projectOpen} onOpenChange={setProjectOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <CardTitle className="flex items-center gap-2">
                <Folder className="w-5 h-5" />
                <span className="flex-1">Project</span>
                {!projectOpen && (
                  <span className="text-sm font-normal text-muted-foreground font-mono truncate max-w-[300px]">
                    {fullPath}
                  </span>
                )}
                {projectOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Local Path</Label>
                  <div className="mt-1">
                    <DirectoryPicker value={projectPath} onChange={setProjectPath} placeholder={defaultPath} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="folder">Project Folder</Label>
                  <Input
                    id="folder"
                    value={projectNameTouched ? projectName : effectiveProjectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      setProjectNameTouched(true);
                    }}
                    placeholder="my-app"
                    className="mt-1"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1.5">{fullPath}</p>
              {pathExists && !checkingPath && (
                <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p>This folder already exists. Scaffolding will add files into it.</p>
                    <p className="mt-1">
                      Suggestion:{" "}
                      <button
                        type="button"
                        className="underline hover:no-underline font-medium"
                        onClick={() => {
                          const suggested = suggestUniqueName(effectiveProjectName);
                          setProjectName(suggested);
                          setProjectNameTouched(true);
                        }}
                      >
                        {suggestUniqueName(effectiveProjectName)}
                      </button>
                    </p>
                  </div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Package Manager</Label>
                  <Select value={packageManager} onValueChange={setPackageManager}>
                    <SelectTrigger className="mt-1">
                      <span>{packageManager}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {installedPMs.map((pm) => (
                        <SelectItem key={pm.toolId} value={pm.toolId} disabled={!pm.installed}>
                          {pm.toolId}
                          {!pm.installed && " (not installed)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <div>
                    <Label>Initialize Git</Label>
                    <p className="text-sm text-muted-foreground">Create git repository</p>
                  </div>
                  <Switch checked={initGit} onCheckedChange={setInitGit} />
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Generate Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleGenerate} disabled={creating || !idea.trim() || !effectiveProjectName.trim()}>
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create Project
              <ChevronRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
