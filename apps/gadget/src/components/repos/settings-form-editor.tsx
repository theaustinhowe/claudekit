"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@claudekit/ui/components/select";
import { Switch } from "@claudekit/ui/components/switch";
import { Textarea } from "@claudekit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import type { LucideIcon } from "lucide-react";
import {
  Box,
  Brain,
  ChevronRight,
  ChevronsUpDown,
  Database,
  EyeOff,
  Gauge,
  GitCommit,
  Info,
  Monitor,
  Plug,
  Puzzle,
  RotateCcw,
  Save,
  Search,
  Shield,
  Terminal,
  Upload,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  saveClaudeSettingsJson,
  saveDefaultClaudeSettings,
  saveSharedClaudeSettingsJson,
} from "@/lib/actions/claude-config";
import {
  type FieldDef,
  getFieldValue,
  parseJsonToFormState,
  SETTINGS_CATEGORIES,
  type SettingsCategory,
  serializeFormToJson,
  setFieldValue,
} from "@/lib/services/claude-settings-schema";
import { formatNumber } from "@/lib/utils";
import { HooksEditor } from "./settings-form/hooks-editor";
import { KeyValueEditor } from "./settings-form/key-value-editor";
import { PermissionRulesEditor } from "./settings-form/permission-rules-editor";
import { StringArrayEditor } from "./settings-form/string-array-editor";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  brain: Brain,
  terminal: Terminal,
  plug: Plug,
  users: Users,
  gauge: Gauge,
  box: Box,
  "git-commit": GitCommit,
  monitor: Monitor,
  "eye-off": EyeOff,
  database: Database,
  puzzle: Puzzle,
};

function isFieldConfigured(settings: Record<string, unknown>, field: FieldDef): boolean {
  const value = getFieldValue(settings, field.path);
  if (value === undefined || value === null || value === "") return false;
  if (value === false) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0)
    return false;
  return true;
}

function getConfiguredCount(category: SettingsCategory, settings: Record<string, unknown>): number {
  return category.fields.filter((f) => isFieldConfigured(settings, f)).length;
}

interface SettingsFormEditorProps {
  repoId: string;
  initialJson: string;
  scope?: "local" | "shared";
  onSaved?: () => void;
}

export function SettingsFormEditor({ repoId, initialJson, scope = "local", onSaved }: SettingsFormEditorProps) {
  const initial = useMemo(() => parseJsonToFormState(initialJson), [initialJson]);
  const [settings, setSettings] = useState<Record<string, unknown>>(initial.settings);
  const [unknownFields] = useState<Record<string, unknown>>(initial.unknownFields);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    for (const category of SETTINGS_CATEGORIES) {
      if (getConfiguredCount(category, initial.settings) > 0) {
        expanded.add(category.id);
      }
    }
    return expanded;
  });

  const isDirty = useMemo(() => {
    return (
      serializeFormToJson(settings, unknownFields) !== serializeFormToJson(initial.settings, initial.unknownFields)
    );
  }, [settings, unknownFields, initial]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return SETTINGS_CATEGORIES;
    const query = searchQuery.toLowerCase();
    return SETTINGS_CATEGORIES.map((category) => {
      const matchingFields = category.fields.filter(
        (f) =>
          f.label.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query) ||
          f.path.toLowerCase().includes(query),
      );
      if (matchingFields.length === 0) return null;
      return { ...category, fields: matchingFields };
    }).filter((c): c is SettingsCategory => c !== null);
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const allExpanded = useMemo(() => {
    const categories = isSearching ? filteredCategories : SETTINGS_CATEGORIES;
    return categories.length > 0 && categories.every((c) => expandedSections.has(c.id));
  }, [expandedSections, isSearching, filteredCategories]);

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedSections(new Set());
    } else {
      const allIds = new Set(SETTINGS_CATEGORIES.map((c) => c.id));
      setExpandedSections(allIds);
    }
  }, [allExpanded]);

  const updateField = useCallback((path: string, value: unknown) => {
    setSettings((prev) => setFieldValue(prev, path, value));
  }, []);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const json = serializeFormToJson(settings, unknownFields);
      if (scope === "shared") {
        await saveSharedClaudeSettingsJson(repoId, json);
      } else {
        await saveClaudeSettingsJson(repoId, json);
      }
      toast.success("Settings saved!");
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(initial.settings);
  };

  const handleSaveAsDefault = async () => {
    try {
      const json = serializeFormToJson(settings, unknownFields);
      await saveDefaultClaudeSettings(json);
      toast.success("Saved as default settings!");
    } catch (e) {
      toast.error(`Failed to save default: ${(e as Error).message}`);
    }
  };

  const renderField = (field: FieldDef) => {
    const value = getFieldValue(settings, field.path);

    switch (field.type) {
      case "boolean": {
        return (
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{field.label}</Label>
              <p className="text-xs text-muted-foreground">{field.description}</p>
            </div>
            <Switch checked={!!value} onCheckedChange={(checked) => updateField(field.path, checked)} />
          </div>
        );
      }

      case "string": {
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <Input
              value={(value as string) ?? ""}
              onChange={(e) => updateField(field.path, e.target.value)}
              placeholder={field.placeholder}
              className="h-8 text-sm"
            />
          </div>
        );
      }

      case "select": {
        const current = (value as string) ?? "";
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <Select value={current} onValueChange={(v) => updateField(field.path, v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt || "__none__"} value={opt || "__none__"}>
                    {opt || "(not set)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }

      case "textarea": {
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <Textarea
              value={(value as string) ?? ""}
              onChange={(e) => updateField(field.path, e.target.value)}
              placeholder={field.placeholder}
              className="text-sm min-h-[60px] resize-y"
            />
          </div>
        );
      }

      case "permission-rules": {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium">{field.label}</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      Format: <code className="bg-muted px-1 rounded text-xs">Tool</code> or{" "}
                      <code className="bg-muted px-1 rounded text-xs">Tool(pattern)</code>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <PermissionRulesEditor
              value={arr}
              onChange={(v) => updateField(field.path, v)}
              placeholder={field.placeholder}
              fieldPath={field.path}
            />
          </div>
        );
      }

      case "string-array": {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <StringArrayEditor
              value={arr}
              onChange={(v) => updateField(field.path, v)}
              placeholder={field.placeholder}
            />
          </div>
        );
      }

      case "key-value": {
        const obj = typeof value === "object" && value !== null ? (value as Record<string, string>) : {};
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <KeyValueEditor value={obj} onChange={(v) => updateField(field.path, v)} />
          </div>
        );
      }

      case "hooks": {
        const hooksObj =
          typeof value === "object" && value !== null
            ? (value as Record<string, { matcher?: string; hooks: { type: "command"; command: string }[] }[]>)
            : {};
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{field.label}</Label>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <HooksEditor value={hooksObj} onChange={(v) => updateField(field.path, v)} />
          </div>
        );
      }
    }
  };

  const renderSection = (category: SettingsCategory) => {
    const Icon = CATEGORY_ICONS[category.icon] ?? Shield;
    const isExpanded = isSearching || expandedSections.has(category.id);
    const sortedFields = [...category.fields].sort((a, b) => a.label.localeCompare(b.label));
    const booleanFields = sortedFields.filter((f) => f.type === "boolean");
    const otherFields = sortedFields.filter((f) => f.type !== "boolean");

    // Use the original category to compute configured count (not filtered fields)
    const originalCategory = SETTINGS_CATEGORIES.find((c) => c.id === category.id);
    const totalFields = originalCategory ? originalCategory.fields.length : category.fields.length;
    const configuredCount = originalCategory
      ? getConfiguredCount(originalCategory, settings)
      : getConfiguredCount(category, settings);

    return (
      <div key={category.id} className="rounded-lg border bg-card overflow-hidden">
        {/* Clickable header */}
        <button
          type="button"
          onClick={() => toggleSection(category.id)}
          className="flex items-center gap-2.5 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        >
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold flex-1">{category.label}</span>
          <span className={cn("text-xs mr-1", configuredCount > 0 ? "text-primary" : "text-muted-foreground")}>
            {configuredCount} of {totalFields} configured
          </span>
          <ChevronRight
            className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-90")}
          />
        </button>

        {/* Collapsible content */}
        {isExpanded && (
          <div className="border-t p-4 space-y-1">
            {booleanFields.map((field) => (
              <div key={field.path}>{renderField(field)}</div>
            ))}
            {otherFields.map((field) => (
              <div key={field.path} className="pt-2">
                {renderField(field)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const unknownCount = Object.keys(unknownFields).length;

  return (
    <div className="space-y-2">
      {/* Search and expand/collapse controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={toggleExpandAll} className="shrink-0 text-xs">
          <ChevronsUpDown className="w-3.5 h-3.5 mr-1.5" />
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>

      {/* Sections */}
      <div className="space-y-2">{filteredCategories.map((category) => renderSection(category))}</div>

      {unknownCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatNumber(unknownCount)} additional field{unknownCount > 1 ? "s" : ""} (e.g.{" "}
          <code className="bg-muted px-1 rounded">{Object.keys(unknownFields)[0]}</code>) will be preserved on save.
        </p>
      )}

      <div className="sticky bottom-0 bg-background border-t py-3 -mx-1 px-1 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !isDirty} size="sm">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button variant="ghost" onClick={handleReset} disabled={!isDirty} size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
        <Button variant="outline" onClick={handleSaveAsDefault} size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Save as Default
        </Button>
        {isDirty && (
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
            Unsaved changes
          </Badge>
        )}
      </div>
    </div>
  );
}
