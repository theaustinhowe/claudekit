"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { ColorSchemePicker } from "@claudekit/ui/components/color-scheme-picker";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@claudekit/ui/components/select";
import { Switch } from "@claudekit/ui/components/switch";
import { Textarea } from "@claudekit/ui/components/textarea";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Folder,
  Layers,
  Loader2,
  Paintbrush,
  Rocket,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  EMAIL_OPTIONS,
  PAYMENT_OPTIONS,
  PLATFORM_ADVANCED_OPTIONS,
  PLATFORMS,
  TS_ONLY_CONSTRAINTS,
} from "@/lib/constants";
import type { ToolCheckResult } from "@/lib/types";

const examplePrompts = [
  "SaaS dashboard with auth and billing",
  "Blog platform with markdown editor",
  "Project management tool with kanban board",
  "E-commerce store with cart and checkout",
];

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
  const [overviewDismissed, setOverviewDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("inside:new-overview-dismissed") === "1";
  });

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

  // --- CLI constraint auto-disable ---
  useEffect(() => {
    if (platform !== "cli") {
      if (prevConstraintsRef.current) {
        setConstraints(prevConstraintsRef.current);
        prevConstraintsRef.current = null;
        setConstraintNote(null);
      }
      return;
    }

    const lang = toolVersions["cli-language"] ?? "typescript";
    if (lang !== "typescript") {
      // Save current constraints before stripping
      if (!prevConstraintsRef.current) {
        prevConstraintsRef.current = constraints;
      }
      setConstraints((prev) => prev.filter((c) => !TS_ONLY_CONSTRAINTS.has(c)));
      const langLabel = lang.charAt(0).toUpperCase() + lang.slice(1);
      setConstraintNote(`Constraints adjusted for ${langLabel}`);
    } else {
      // Restore if switching back to TS
      if (prevConstraintsRef.current) {
        setConstraints(prevConstraintsRef.current);
        prevConstraintsRef.current = null;
      }
      setConstraintNote(null);
    }
  }, [platform, toolVersions["cli-language"]]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Overview */}
      {!overviewDismissed && (
        <OverviewBanner
          onDismiss={() => {
            setOverviewDismissed(true);
            localStorage.setItem("inside:new-overview-dismissed", "1");
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
          <div>
            <p className="text-xs text-muted-foreground mb-2">Examples</p>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setIdea(prompt);
                    if (!title) setTitle(prompt.split(" with ")[0]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 border-l-2 border-muted-foreground/25 pl-2 py-0.5"
                >
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>
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
              {PLATFORMS.map((p) => (
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
              <CollapsibleContent className="mt-3 space-y-4">
                {visibleOptions.map((co) => {
                  const opt = co.option;

                  if (opt.type === "select") {
                    return (
                      <div key={opt.key} className="max-w-xs">
                        <Label className="mb-2 block">{opt.label}</Label>
                        {opt.description && <p className="text-xs text-muted-foreground mb-2">{opt.description}</p>}
                        <Select
                          value={toolVersions[opt.key] ?? opt.options.find((o) => o.isDefault)?.value ?? ""}
                          onValueChange={(value) => setToolVersions((prev) => ({ ...prev, [opt.key]: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
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

          {/* Backend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Backend</Label>
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
            </div>
            {backendEnabled && (
              <div className="flex flex-wrap gap-2">
                {BACKEND_OPTIONS.map((opt) => (
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Auth</Label>
              <Switch
                checked={authEnabled}
                onCheckedChange={(checked) => {
                  setAuthEnabled(checked);
                  if (!checked) {
                    const authIds = AUTH_OPTIONS.map((o) => o.id);
                    setServices((prev) => prev.filter((s) => !authIds.includes(s)));
                  }
                }}
              />
            </div>
            {authEnabled && (
              <div className="flex flex-wrap gap-2">
                {AUTH_OPTIONS.map((opt) => (
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

          {/* Features */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Features</Label>
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
            </div>
            {featuresEnabled && (
              <FeaturesInput
                selectedFeatures={selectedFeatures}
                customFeatures={customFeatures}
                onFeaturesChange={setSelectedFeatures}
                onCustomChange={setCustomFeatures}
              />
            )}
          </div>

          {/* Email */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Email</Label>
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
            </div>
            {emailEnabled && (
              <div className="flex flex-wrap gap-2">
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

          {/* Analytics */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Analytics</Label>
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
            </div>
            {analyticsEnabled && (
              <div className="flex flex-wrap gap-2">
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

          {/* Payments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Payments</Label>
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
            </div>
            {paymentsEnabled && (
              <div className="flex flex-wrap gap-2">
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

          {/* Constraints */}
          <div>
            <Label className="mb-3 block">Constraints</Label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CONSTRAINT_OPTIONS.map((c) => (
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
          </div>
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
                      <SelectValue />
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
