"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { ColorSchemePicker } from "@devkit/ui/components/color-scheme-picker";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Switch } from "@devkit/ui/components/switch";
import { Textarea } from "@devkit/ui/components/textarea";
import { ChevronDown, ChevronRight, Folder, Layers, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/directory-picker";
import { FeaturesInput } from "@/components/generator/features-input";
import { InspirationInput } from "@/components/generator/inspiration-input";
import { VibesSelector } from "@/components/generator/vibes-selector";
import { createGeneratorProject } from "@/lib/actions/generator-projects";
import {
  ANALYTICS_OPTIONS,
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  EMAIL_OPTIONS,
  FRAMEWORK_OPTIONS,
  PAYMENT_OPTIONS,
} from "@/lib/constants";
import type { ScanRoot, ToolCheckResult } from "@/lib/types";

const examplePrompts = [
  "SaaS dashboard with auth and billing",
  "Blog platform with markdown editor",
  "Project management tool with kanban board",
  "E-commerce store with cart and checkout",
];

interface DescribeStepProps {
  scanRoots: ScanRoot[];
  installedPMs: ToolCheckResult[];
}

export function DescribeStep({ scanRoots, installedPMs }: DescribeStepProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

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

  // Project
  const [projectName, setProjectName] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [projectPath, setProjectPath] = useState(scanRoots[0]?.path ?? "~/Projects");
  const [packageManager, setPackageManager] = useState(installedPMs.find((r) => r.installed)?.toolId ?? "pnpm");
  const [initGit, setInitGit] = useState(true);
  const [projectOpen, setProjectOpen] = useState(false);

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "my-app";

  // Derive project folder from title unless user has manually edited it
  const effectiveProjectName = projectNameTouched ? projectName : title ? slugify(title) : "my-app";
  const fullPath = `${projectPath}/${effectiveProjectName}`;

  const toggleService = (id: string) => {
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleConstraint = (id: string) => {
    setConstraints((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
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
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                onClick={() => {
                  setIdea(prompt);
                  if (!title) setTitle(prompt.split(" with ")[0]);
                }}
                className="text-xs"
              >
                {prompt}
              </Button>
            ))}
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
              {FRAMEWORK_OPTIONS.map((p) => (
                <Card
                  key={p.id}
                  className={`cursor-pointer transition-all p-3 ${
                    platform === p.id ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"
                  }`}
                  onClick={() => setPlatform(p.id)}
                >
                  <p className="font-medium text-sm">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Backend */}
          <div>
            <Label className="mb-2 block">Backend</Label>
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
          </div>

          {/* Auth */}
          <div>
            <Label className="mb-2 block">Auth</Label>
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
          </div>

          {/* Features */}
          <div>
            <Label className="mb-2 block">Features</Label>
            <FeaturesInput
              selectedFeatures={selectedFeatures}
              customFeatures={customFeatures}
              onFeaturesChange={setSelectedFeatures}
              onCustomChange={setCustomFeatures}
            />
          </div>

          {/* Email */}
          <div>
            <Label className="mb-2 block">Email</Label>
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
          </div>

          {/* Analytics */}
          <div>
            <Label className="mb-2 block">Analytics</Label>
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
          </div>

          {/* Payments */}
          <div>
            <Label className="mb-2 block">Payments</Label>
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
                    <DirectoryPicker value={projectPath} onChange={setProjectPath} placeholder="~/Projects" />
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
