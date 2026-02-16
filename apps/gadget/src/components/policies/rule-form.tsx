"use client";

import { Button } from "@devkit/ui/components/button";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Textarea } from "@devkit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CustomRule, CustomRuleType, FindingCategory, Policy, Severity } from "@/lib/types";

interface RuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: CustomRule;
  policies: Policy[];
  onSubmit: (data: RuleFormData) => void;
  isSubmitting: boolean;
}

export interface RuleFormData {
  name: string;
  description: string;
  category: FindingCategory;
  severity: Severity;
  rule_type: CustomRuleType;
  config: Record<string, unknown>;
  suggested_actions: string[];
  policy_id: string | null;
}

const RULE_TYPES: { value: CustomRuleType; label: string; description: string }[] = [
  { value: "file_exists", label: "File Exists", description: "Check that at least one of the specified files exists" },
  { value: "file_missing", label: "File Missing", description: "Check that a specific file does NOT exist" },
  { value: "file_contains", label: "File Contains", description: "Check file content against a regex pattern" },
  { value: "json_field", label: "JSON Field", description: "Check a field value in a JSON file" },
];

const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const CATEGORIES: FindingCategory[] = ["custom", "structure", "config", "dependencies", "ai-files"];

export function RuleForm({ open, onOpenChange, initialData, policies, onSubmit, isSubmitting }: RuleFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState<FindingCategory>(initialData?.category ?? "custom");
  const [severity, setSeverity] = useState<Severity>(initialData?.severity ?? "warning");
  const [ruleType, setRuleType] = useState<CustomRuleType>(initialData?.rule_type ?? "file_exists");
  const [policyId, setPolicyId] = useState<string>(initialData?.policy_id ?? "");
  const [suggestedActions, setSuggestedActions] = useState<string[]>(initialData?.suggested_actions ?? [""]);

  // Config state per rule type
  const [filePaths, setFilePaths] = useState<string[]>(() => {
    if (initialData?.rule_type === "file_exists") return (initialData.config.paths as string[]) || [""];
    return [""];
  });
  const [singlePath, setSinglePath] = useState(() => {
    if (initialData?.rule_type === "file_missing") return (initialData.config.path as string) || "";
    return "";
  });
  const [containsFile, setContainsFile] = useState(() => {
    if (initialData?.rule_type === "file_contains") return (initialData.config.file as string) || "";
    return "";
  });
  const [containsPattern, setContainsPattern] = useState(() => {
    if (initialData?.rule_type === "file_contains") return (initialData.config.pattern as string) || "";
    return "";
  });
  const [containsNegate, setContainsNegate] = useState(() => {
    if (initialData?.rule_type === "file_contains") return (initialData.config.negate as boolean) || false;
    return false;
  });
  const [jsonFile, setJsonFile] = useState(() => {
    if (initialData?.rule_type === "json_field") return (initialData.config.file as string) || "";
    return "";
  });
  const [jsonField, setJsonField] = useState(() => {
    if (initialData?.rule_type === "json_field") return (initialData.config.field as string) || "";
    return "";
  });
  const [jsonExpected, setJsonExpected] = useState(() => {
    if (initialData?.rule_type === "json_field") return String(initialData.config.expected ?? "");
    return "";
  });

  const buildConfig = (): Record<string, unknown> => {
    switch (ruleType) {
      case "file_exists":
        return { paths: filePaths.filter((p) => p.trim()) };
      case "file_missing":
        return { path: singlePath.trim() };
      case "file_contains":
        return { file: containsFile.trim(), pattern: containsPattern.trim(), negate: containsNegate };
      case "json_field": {
        let expected: unknown = jsonExpected.trim();
        if (expected === "true") expected = true;
        else if (expected === "false") expected = false;
        else if (!Number.isNaN(Number(expected)) && expected !== "") expected = Number(expected);
        return { file: jsonFile.trim(), field: jsonField.trim(), expected };
      }
      default:
        return {};
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      category,
      severity,
      rule_type: ruleType,
      config: buildConfig(),
      suggested_actions: suggestedActions.filter((a) => a.trim()),
      policy_id: policyId || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Rule" : "New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Basic info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Require LICENSE file"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this rule check?"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as FindingCategory)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rule Type */}
          <div>
            <Label>Rule Type *</Label>
            <Select value={ruleType} onValueChange={(v) => setRuleType(v as CustomRuleType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {RULE_TYPES.find((rt) => rt.value === ruleType)?.description}
            </p>
          </div>

          {/* Config — changes per rule_type */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <Label className="mb-3 block text-sm font-medium">Configuration</Label>

            {ruleType === "file_exists" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Add paths to check. Finding is created if NONE of them exist.
                </p>
                {filePaths.map((p, i) => (
                  <div key={`filepath-${p || i}`} className="flex gap-2">
                    <Input
                      value={p}
                      onChange={(e) => {
                        const next = [...filePaths];
                        next[i] = e.target.value;
                        setFilePaths(next);
                      }}
                      placeholder="e.g. LICENSE or LICENSE.md"
                      className="flex-1"
                    />
                    {filePaths.length > 1 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setFilePaths(filePaths.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setFilePaths([...filePaths, ""])}>
                  <Plus className="w-4 h-4 mr-1" /> Add Path
                </Button>
              </div>
            )}

            {ruleType === "file_missing" && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Finding is created if the file IS present.</p>
                <Input
                  value={singlePath}
                  onChange={(e) => setSinglePath(e.target.value)}
                  placeholder="e.g. .env.local"
                />
              </div>
            )}

            {ruleType === "file_contains" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">File Path</Label>
                  <Input
                    value={containsFile}
                    onChange={(e) => setContainsFile(e.target.value)}
                    placeholder="e.g. package.json"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Regex Pattern</Label>
                  <Input
                    value={containsPattern}
                    onChange={(e) => setContainsPattern(e.target.value)}
                    placeholder='e.g. "type":\\s*"module"'
                    className="mt-1 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={containsNegate} onCheckedChange={(v) => setContainsNegate(v === true)} />
                  <Label className="text-sm">Negate — flag if pattern IS found (instead of missing)</Label>
                </div>
              </div>
            )}

            {ruleType === "json_field" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">JSON File</Label>
                  <Input
                    value={jsonFile}
                    onChange={(e) => setJsonFile(e.target.value)}
                    placeholder="e.g. tsconfig.json"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Field Path (dot notation)</Label>
                  <Input
                    value={jsonField}
                    onChange={(e) => setJsonField(e.target.value)}
                    placeholder="e.g. compilerOptions.strict"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expected Value</Label>
                  <Input
                    value={jsonExpected}
                    onChange={(e) => setJsonExpected(e.target.value)}
                    placeholder="e.g. true"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Supports: true, false, numbers, or strings</p>
                </div>
              </div>
            )}
          </div>

          {/* Policy Binding */}
          <div>
            <Label>Policy Binding (optional)</Label>
            <Select value={policyId || "__none__"} onValueChange={(v) => setPolicyId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Global (all policies)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Global (all policies)</SelectItem>
                {policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Leave as "Global" to apply this rule to all scans, or bind it to a specific policy.
            </p>
          </div>

          {/* Suggested Actions */}
          <div>
            <Label className="mb-2 block">Suggested Actions</Label>
            {suggestedActions.map((action, i) => (
              <div key={`action-${action || i}`} className="flex gap-2 mb-2">
                <Input
                  value={action}
                  onChange={(e) => {
                    const next = [...suggestedActions];
                    next[i] = e.target.value;
                    setSuggestedActions(next);
                  }}
                  placeholder="e.g. Add a LICENSE file"
                  className="flex-1"
                />
                {suggestedActions.length > 1 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSuggestedActions(suggestedActions.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSuggestedActions([...suggestedActions, ""])}>
              <Plus className="w-4 h-4 mr-1" /> Add Action
            </Button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
