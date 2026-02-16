"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Switch } from "@devkit/ui/components/switch";
import { Textarea } from "@devkit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import type { LucideIcon } from "lucide-react";
import {
  Box,
  Brain,
  ChevronRight,
  Database,
  EyeOff,
  Gauge,
  GitCommit,
  Info,
  Monitor,
  Plug,
  RotateCcw,
  Save,
  Shield,
  Terminal,
  Upload,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { saveClaudeSettingsJson, saveDefaultClaudeSettings } from "@/lib/actions/claude-config";
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
};

interface SettingsFormEditorProps {
  repoId: string;
  initialJson: string;
  onSaved?: () => void;
}

export function SettingsFormEditor({ repoId, initialJson, onSaved }: SettingsFormEditorProps) {
  const initial = useMemo(() => parseJsonToFormState(initialJson), [initialJson]);
  const [settings, setSettings] = useState<Record<string, unknown>>(initial.settings);
  const [unknownFields] = useState<Record<string, unknown>>(initial.unknownFields);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const isDirty = useMemo(() => {
    return (
      serializeFormToJson(settings, unknownFields) !== serializeFormToJson(initial.settings, initial.unknownFields)
    );
  }, [settings, unknownFields, initial]);

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
      await saveClaudeSettingsJson(repoId, json);
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
    }
  };

  const renderSection = (category: SettingsCategory) => {
    const Icon = CATEGORY_ICONS[category.icon] ?? Shield;
    const isExpanded = expandedSections.has(category.id);
    const sortedFields = [...category.fields].sort((a, b) => a.label.localeCompare(b.label));
    const booleanFields = sortedFields.filter((f) => f.type === "boolean");
    const otherFields = sortedFields.filter((f) => f.type !== "boolean");

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
          <span className="text-xs text-muted-foreground mr-1">
            {category.fields.length} {category.fields.length === 1 ? "setting" : "settings"}
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
      {/* Sections */}
      <div className="space-y-2">{SETTINGS_CATEGORIES.map((category) => renderSection(category))}</div>

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
