"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Separator } from "@devkit/ui/components/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devkit/ui/components/table";
import { Textarea } from "@devkit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { PackageManager, Policy, RepoType } from "@/lib/types";

const ALL_PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "bun", "yarn"];
const ALL_REPO_TYPES: RepoType[] = ["nextjs", "node", "react", "library", "monorepo", "tanstack"];

const VERSION_PRESETS = [
  { label: "Node >=22", pkg: "node", version: ">=22.0.0" },
  { label: "React ^19.2", pkg: "react", version: "^19.2.0" },
  { label: "Next ^16.1", pkg: "next", version: "^16.1.0" },
  { label: "TypeScript ^5.9", pkg: "typescript", version: "^5.9.0" },
  { label: "Biome ^2.3", pkg: "@biomejs/biome", version: "^2.3.0" },
];

const COMMON_BANS = [
  { name: "moment", replacement: "date-fns", reason: "Large bundle size, use date-fns instead" },
  { name: "lodash", replacement: "lodash-es", reason: "Use ES modules version for tree-shaking" },
  { name: "axios", replacement: "native fetch", reason: "Use native fetch API" },
  { name: "request", replacement: "native fetch", reason: "Deprecated since 2020" },
  { name: "eslint", replacement: "@biomejs/biome", reason: "Use Biome for faster linting and formatting" },
  { name: "prettier", replacement: "@biomejs/biome", reason: "Use Biome for integrated formatting" },
  { name: "uuid", replacement: "crypto.randomUUID()", reason: "Native since Node 19, no dependency needed" },
  { name: "node-fetch", replacement: "native fetch", reason: "Native fetch available since Node 18" },
];

const IGNORE_SUGGESTIONS = ["node_modules", "dist", ".next", ".vercel", "build", ".turbo", "coverage"];

interface PolicyFormProps {
  initialData?: Policy;
  onSubmit: (data: PolicyFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export interface PolicyFormData {
  name: string;
  description: string;
  expected_versions: Record<string, string>;
  banned_dependencies: Array<{ name: string; replacement?: string; reason: string }>;
  allowed_package_managers: string[];
  preferred_package_manager: string;
  ignore_patterns: string[];
  repo_types: string[];
}

export function PolicyForm({ initialData, onSubmit, onCancel, isSubmitting }: PolicyFormProps) {
  const nextKey = useRef(0);
  const genKey = () => `k${++nextKey.current}`;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [versions, setVersions] = useState(() =>
    initialData
      ? Object.entries(initialData.expected_versions).map(([pkg, version]) => ({ _key: genKey(), pkg, version }))
      : [],
  );
  const [bannedDeps, setBannedDeps] = useState(() =>
    initialData
      ? initialData.banned_dependencies.map((d) => ({
          _key: genKey(),
          name: d.name,
          replacement: d.replacement ?? "",
          reason: d.reason,
        }))
      : [],
  );
  const [allowedPMs, setAllowedPMs] = useState<PackageManager[]>(initialData?.allowed_package_managers ?? ["pnpm"]);
  const [preferredPM, setPreferredPM] = useState<PackageManager>(initialData?.preferred_package_manager ?? "pnpm");
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>(initialData?.ignore_patterns ?? []);
  const [repoTypes, setRepoTypes] = useState<RepoType[]>((initialData?.repo_types as RepoType[]) ?? []);

  const togglePM = (pm: PackageManager) => {
    setAllowedPMs((prev) => {
      const next = prev.includes(pm) ? prev.filter((p) => p !== pm) : [...prev, pm];
      if (!next.includes(preferredPM) && next.length > 0) {
        setPreferredPM(next[0]);
      }
      return next;
    });
  };

  const toggleRepoType = (rt: RepoType) => {
    setRepoTypes((prev) => (prev.includes(rt) ? prev.filter((t) => t !== rt) : [...prev, rt]));
  };

  const addVersionPreset = (pkg: string, version: string) => {
    if (versions.some((v) => v.pkg === pkg)) return;
    setVersions([...versions, { _key: genKey(), pkg, version }]);
  };

  const addBannedPreset = (ban: { name: string; replacement: string; reason: string }) => {
    if (bannedDeps.some((d) => d.name === ban.name)) return;
    setBannedDeps([...bannedDeps, { _key: genKey(), ...ban }]);
  };

  const addIgnorePattern = (pattern: string) => {
    if (ignorePatterns.includes(pattern)) return;
    setIgnorePatterns([...ignorePatterns, pattern]);
  };

  const removeIgnorePattern = (pattern: string) => {
    setIgnorePatterns(ignorePatterns.filter((p) => p !== pattern));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (!name.trim() || allowedPMs.length === 0) return;

    const expected_versions: Record<string, string> = {};
    for (const v of versions) {
      if (v.pkg.trim() && v.version.trim()) {
        expected_versions[v.pkg.trim()] = v.version.trim();
      }
    }

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      expected_versions,
      banned_dependencies: bannedDeps
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          replacement: d.replacement.trim() || undefined,
          reason: d.reason.trim() || "Banned by policy",
        })),
      allowed_package_managers: allowedPMs,
      preferred_package_manager: preferredPM,
      ignore_patterns: ignorePatterns,
      repo_types: repoTypes,
    });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Basic Info</h3>
        <div className="grid gap-4">
          <div>
            <Label>Policy Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Next.js App Standard"
              className={`mt-1 ${submitted && !name.trim() ? "border-destructive" : ""}`}
            />
            {submitted && !name.trim() && <p className="text-xs text-destructive mt-1">Policy name is required</p>}
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this policy"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Expected Versions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Version Requirements</h3>
          <div className="flex gap-1 flex-wrap">
            {VERSION_PRESETS.map((preset) => (
              <Button
                key={preset.pkg}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addVersionPreset(preset.pkg, preset.version)}
                disabled={versions.some((v) => v.pkg === preset.pkg)}
              >
                + {preset.label}
              </Button>
            ))}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v, i) => (
              <TableRow key={v._key}>
                <TableCell>
                  <Input
                    value={v.pkg}
                    onChange={(e) => {
                      const next = [...versions];
                      next[i] = { ...next[i], pkg: e.target.value };
                      setVersions(next);
                    }}
                    placeholder="e.g. react"
                    className="h-8 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={v.version}
                    onChange={(e) => {
                      const next = [...versions];
                      next[i] = { ...next[i], version: e.target.value };
                      setVersions(next);
                    }}
                    placeholder="e.g. ^19.0.0"
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Remove version requirement"
                          onClick={() => setVersions(versions.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setVersions([...versions, { _key: genKey(), pkg: "", version: "" }])}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Version
        </Button>
      </div>

      <Separator />

      {/* Banned Dependencies */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Banned Dependencies</h3>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Common Bans
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="space-y-1">
                {COMMON_BANS.map((ban) => (
                  <button
                    key={ban.name}
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => addBannedPreset(ban)}
                    disabled={bannedDeps.some((d) => d.name === ban.name)}
                  >
                    <span className="font-mono text-xs">{ban.name}</span>
                    <span className="text-muted-foreground text-xs ml-2">&rarr; {ban.replacement}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {bannedDeps.map((dep, i) => (
          <div key={dep._key} className="flex items-center gap-2 mb-2">
            <Input
              value={dep.name}
              onChange={(e) => {
                const next = [...bannedDeps];
                next[i] = { ...next[i], name: e.target.value };
                setBannedDeps(next);
              }}
              placeholder="Package name"
              className="flex-1"
            />
            <Input
              value={dep.replacement}
              onChange={(e) => {
                const next = [...bannedDeps];
                next[i] = { ...next[i], replacement: e.target.value };
                setBannedDeps(next);
              }}
              placeholder="Replacement"
              className="flex-1"
            />
            <Input
              value={dep.reason}
              onChange={(e) => {
                const next = [...bannedDeps];
                next[i] = { ...next[i], reason: e.target.value };
                setBannedDeps(next);
              }}
              placeholder="Reason"
              className="flex-1"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove banned dependency"
                    onClick={() => setBannedDeps(bannedDeps.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBannedDeps([...bannedDeps, { _key: genKey(), name: "", replacement: "", reason: "" }])}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Banned Dependency
        </Button>
      </div>

      <Separator />

      {/* Package Managers */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Package Managers</h3>
        <div className="flex gap-4 mb-3">
          {ALL_PACKAGE_MANAGERS.map((pm) => (
            <div key={pm} className="flex items-center gap-2">
              <Checkbox id={`pm-${pm}`} checked={allowedPMs.includes(pm)} onCheckedChange={() => togglePM(pm)} />
              <Label htmlFor={`pm-${pm}`} className="capitalize">
                {pm}
              </Label>
            </div>
          ))}
        </div>
        {submitted && allowedPMs.length === 0 && (
          <p className="text-xs text-destructive mb-3">At least one package manager must be selected</p>
        )}
        {allowedPMs.length > 0 && (
          <div>
            <Label className="mb-1 block text-sm">Preferred Package Manager</Label>
            <Select value={preferredPM} onValueChange={(v) => setPreferredPM(v as PackageManager)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedPMs.map((pm) => (
                  <SelectItem key={pm} value={pm} className="capitalize">
                    {pm}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Separator />

      {/* Repo Types */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Repo Types</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Select which repo types this policy applies to (empty = all)
        </p>
        <div className="flex gap-4 flex-wrap">
          {ALL_REPO_TYPES.map((rt) => (
            <div key={rt} className="flex items-center gap-2">
              <Checkbox id={`rt-${rt}`} checked={repoTypes.includes(rt)} onCheckedChange={() => toggleRepoType(rt)} />
              <Label htmlFor={`rt-${rt}`} className="capitalize">
                {rt}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Ignore Patterns */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Ignore Patterns</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {ignorePatterns.map((p) => (
            <Badge key={p} variant="secondary" className="gap-1 pr-1">
              <span className="font-mono text-xs">{p}</span>
              <button
                type="button"
                className="ml-1 hover:text-destructive transition-colors"
                onClick={() => removeIgnorePattern(p)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {ignorePatterns.length === 0 && <span className="text-sm text-muted-foreground">No ignore patterns</span>}
        </div>
        <div className="flex gap-1 flex-wrap">
          {IGNORE_SUGGESTIONS.filter((s) => !ignorePatterns.includes(s)).map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono"
              onClick={() => addIgnorePattern(s)}
            >
              + {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-background flex justify-end gap-2 pt-4 pb-2 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim() || allowedPMs.length === 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
