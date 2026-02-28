"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@claudekit/ui/components/alert-dialog";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@claudekit/ui/components/dropdown-menu";
import { Input } from "@claudekit/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  BookOpen,
  Box,
  Code,
  Download,
  FileCode,
  FileText,
  FormInput,
  Info,
  Minimize2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import {
  removeRuleFile,
  saveClaudeMd,
  saveClaudeSettingsJson,
  saveRuleFile,
  saveSharedClaudeSettingsJson,
} from "@/lib/actions/claude-config";
import { getPresetJson, SETTINGS_PRESETS, type SettingsPreset } from "@/lib/constants/settings-presets";
import { getDefaultSettings, serializeFormToJson } from "@/lib/services/claude-settings-schema";
import { SettingsFormEditor } from "./settings-form-editor";
import { SettingsRawEditor } from "./settings-raw-editor";

const SETTINGS_TEMPLATE = serializeFormToJson(getDefaultSettings(), {});

const CLAUDE_MD_TEMPLATE = `# CLAUDE.md

## Commands

\`\`\`bash
# Add your common dev commands here
\`\`\`

## Architecture

Describe your project architecture here.

## Key Patterns

Document important coding patterns and conventions.
`;

const PRESET_ICONS: Record<string, typeof Zap> = {
  zap: Zap,
  "shield-check": ShieldCheck,
  box: Box,
  "minimize-2": Minimize2,
};

function PresetCard({ preset, onClick }: { preset: SettingsPreset; onClick: () => void }) {
  const Icon = PRESET_ICONS[preset.icon] ?? Zap;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 p-3 rounded-lg border text-left hover:bg-muted/50 transition-colors"
    >
      <Icon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">{preset.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
      </div>
    </button>
  );
}

function RulesEditor({
  repoId,
  initialRules,
  onSaved,
}: {
  repoId: string;
  initialRules: { name: string; content: string }[];
  onSaved?: () => void;
}) {
  const [rules, setRules] = useState(initialRules);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleContent, setNewRuleContent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = (rule: { name: string; content: string }) => {
    setEditingRule(rule.name);
    setEditContent(rule.content);
  };

  const cancelEdit = () => {
    setEditingRule(null);
    setEditContent("");
  };

  const handleSaveRule = async (name: string, content: string) => {
    setSaving(true);
    try {
      await saveRuleFile(repoId, name, content);
      setRules((prev) => prev.map((r) => (r.name === name ? { ...r, content } : r)));
      setEditingRule(null);
      toast.success(`Rule ${name} saved!`);
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (name: string) => {
    setSaving(true);
    try {
      await removeRuleFile(repoId, name);
      setRules((prev) => prev.filter((r) => r.name !== name));
      toast.success(`Rule ${name} deleted!`);
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to delete: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRuleName.trim()) return;
    setSaving(true);
    try {
      const safeName = newRuleName.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
      await saveRuleFile(repoId, fileName, newRuleContent);
      setRules((prev) => [...prev, { name: fileName, content: newRuleContent }]);
      setNewRuleName("");
      setNewRuleContent("");
      setShowNewForm(false);
      toast.success(`Rule ${fileName} created!`);
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to create: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Rules Files</h3>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm" align="start">
              <p className="font-medium mb-2">Modular Rules</p>
              <p className="text-muted-foreground">
                Rules files in <code className="bg-muted px-1 rounded text-xs">.claude/rules/</code> provide modular
                instructions to Claude. Each <code className="bg-muted px-1 rounded text-xs">.md</code> file is loaded
                as additional context alongside CLAUDE.md.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {!showNewForm && (
          <Button variant="outline" size="sm" onClick={() => setShowNewForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Rule
          </Button>
        )}
      </div>

      {showNewForm && (
        <div className="rounded-lg border p-4 space-y-3">
          <Input
            value={newRuleName}
            onChange={(e) => setNewRuleName(e.target.value)}
            placeholder="rule-name (without .md)"
            className="h-8 text-sm"
          />
          <textarea
            value={newRuleContent}
            onChange={(e) => setNewRuleContent(e.target.value)}
            className="w-full h-32 font-mono text-sm p-3 rounded-lg border bg-muted/30 resize-y focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            placeholder="# Rule content..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddRule} disabled={saving || !newRuleName.trim()}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNewForm(false);
                setNewRuleName("");
                setNewRuleContent("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showNewForm ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No rules files found</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Create rule files in .claude/rules/ to provide modular instructions to Claude Code.
          </p>
          <Button onClick={() => setShowNewForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Rule File
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.name} className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                <span className="text-sm font-mono font-medium">{rule.name}</span>
                <div className="flex gap-1">
                  {editingRule !== rule.name && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => startEdit(rule)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive"
                        onClick={() => handleDeleteRule(rule.name)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editingRule === rule.name ? (
                <div className="p-4 space-y-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-48 font-mono text-sm p-3 rounded-lg border bg-muted/30 resize-y focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveRule(rule.name, editContent)} disabled={saving}>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{rule.content}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClaudeTabContentProps {
  repoId: string;
  claudeConfig?: {
    settingsJson: string | null;
    sharedSettingsJson: string | null;
    claudeMd: string | null;
    rules: { name: string; content: string }[];
    repoPath: string;
  };
  defaultClaudeSettings?: string | null;
  onSaved?: () => void;
}

export function ClaudeTabContent({ repoId, claudeConfig, defaultClaudeSettings, onSaved }: ClaudeTabContentProps) {
  const subTabIds = ["settings", "claude-md", "rules"] as const;
  const [subTab, setSubTab] = useQueryState("subtab", parseAsStringLiteral(subTabIds).withDefault("settings"));

  // Settings state
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [settingsScope, setSettingsScope] = useState<"local" | "shared">("local");
  const [localJsonContent, setLocalJsonContent] = useState(claudeConfig?.settingsJson ?? "");
  const [sharedJsonContent, setSharedJsonContent] = useState(claudeConfig?.sharedSettingsJson ?? "");
  const [mdContent, setMdContent] = useState(claudeConfig?.claudeMd ?? "");
  const [saving, setSaving] = useState(false);
  const [applyingDefault, setApplyingDefault] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<SettingsPreset | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);

  const activeJsonContent = settingsScope === "local" ? localJsonContent : sharedJsonContent;
  const setActiveJsonContent = settingsScope === "local" ? setLocalJsonContent : setSharedJsonContent;

  const jsonExists =
    settingsScope === "local"
      ? claudeConfig?.settingsJson !== null && claudeConfig?.settingsJson !== undefined
      : claudeConfig?.sharedSettingsJson !== null && claudeConfig?.sharedSettingsJson !== undefined;
  const mdExists = claudeConfig?.claudeMd !== null && claudeConfig?.claudeMd !== undefined;
  const hasSettingsContent = jsonExists || activeJsonContent;

  // Settings handlers
  const saveMarkdown = async () => {
    setSaving(true);
    try {
      await saveClaudeMd(repoId, mdContent);
      toast.success("CLAUDE.md saved!");
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const createSettingsFile = () => {
    setActiveJsonContent(SETTINGS_TEMPLATE);
  };

  const createClaudeMdFile = () => {
    setMdContent(CLAUDE_MD_TEMPLATE);
  };

  const resetMarkdown = () => {
    setMdContent(claudeConfig?.claudeMd ?? "");
  };

  const switchToJson = () => {
    setViewMode("json");
  };

  const switchToForm = () => {
    if (activeJsonContent.trim()) {
      try {
        JSON.parse(activeJsonContent);
      } catch {
        toast.error("Cannot switch to Form view: JSON is invalid. Fix the JSON first.");
        return;
      }
    }
    setViewMode("form");
  };

  const applyDefault = async () => {
    if (!defaultClaudeSettings) return;
    setApplyingDefault(true);
    try {
      const saveAction = settingsScope === "shared" ? saveSharedClaudeSettingsJson : saveClaudeSettingsJson;
      await saveAction(repoId, defaultClaudeSettings);
      setActiveJsonContent(defaultClaudeSettings);
      toast.success("Default settings applied!");
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to apply: ${(e as Error).message}`);
    } finally {
      setApplyingDefault(false);
    }
  };

  const applyPreset = async (preset: SettingsPreset) => {
    const json = getPresetJson(preset);
    try {
      const saveAction = settingsScope === "shared" ? saveSharedClaudeSettingsJson : saveClaudeSettingsJson;
      await saveAction(repoId, json);
      setActiveJsonContent(json);
      toast.success(`${preset.label} preset applied!`);
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to apply preset: ${(e as Error).message}`);
    }
  };

  const confirmPreset = (preset: SettingsPreset) => {
    setPendingPreset(preset);
    setPresetDialogOpen(true);
  };

  const handlePresetConfirm = async () => {
    if (!pendingPreset) return;
    setPresetDialogOpen(false);
    await applyPreset(pendingPreset);
    setPendingPreset(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI Config</CardTitle>
          {subTab === "settings" && hasSettingsContent && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Presets
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SETTINGS_PRESETS.map((preset) => {
                    const Icon = PRESET_ICONS[preset.icon] ?? Zap;
                    return (
                      <DropdownMenuItem key={preset.id} onClick={() => confirmPreset(preset)}>
                        <Icon className="w-4 h-4 mr-2" />
                        {preset.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <Button
                  variant={viewMode === "form" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={switchToForm}
                >
                  <FormInput className="w-3.5 h-3.5 mr-1.5" />
                  Form
                </Button>
                <Button
                  variant={viewMode === "json" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={switchToJson}
                >
                  <Code className="w-3.5 h-3.5 mr-1.5" />
                  JSON
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={subTab} onValueChange={(value) => setSubTab(value as (typeof subTabIds)[number])}>
          <TabsList className="mb-4">
            <TabsTrigger value="settings" className="gap-2">
              <FileCode className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="claude-md" className="gap-2">
              <FileText className="w-4 h-4" />
              CLAUDE.md
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Rules
            </TabsTrigger>
          </TabsList>

          {/* Settings Sub-tab */}
          <TabsContent value="settings" className="space-y-4">
            {!claudeConfig ? (
              <p className="text-muted-foreground text-center py-8">Claude config data unavailable</p>
            ) : (
              <>
                {/* Scope Selector */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1 rounded-lg border p-0.5">
                    <Button
                      variant={settingsScope === "local" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSettingsScope("local")}
                    >
                      Local
                    </Button>
                    <Button
                      variant={settingsScope === "shared" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSettingsScope("shared")}
                    >
                      Shared
                    </Button>
                  </div>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">
                          <strong>Local</strong> settings (.claude/settings.local.json) are gitignored and personal.{" "}
                          <strong>Shared</strong> settings (.claude/settings.json) are committed and shared with your
                          team.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Apply Default Banner */}
                {defaultClaudeSettings && hasSettingsContent && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Default Settings Available</p>
                      <p className="text-xs text-muted-foreground">
                        Apply your saved default configuration to this repo.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={applyingDefault}>
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Apply Default
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Apply Default Settings?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will overwrite the current settings with your saved defaults. This action saves
                            immediately to disk.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={applyDefault}>Apply</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {!hasSettingsContent ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileCode className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No {settingsScope === "local" ? "settings.local.json" : "settings.json"} found
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md">
                      Create a Claude Code settings file to configure permissions, allowed tools, and environment
                      variables.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={createSettingsFile}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create {settingsScope === "local" ? "settings.local.json" : "settings.json"}
                      </Button>
                      {defaultClaudeSettings && (
                        <Button variant="outline" onClick={applyDefault} disabled={applyingDefault}>
                          <Download className="w-4 h-4 mr-2" />
                          From Default
                        </Button>
                      )}
                    </div>
                    <div className="mt-6 w-full max-w-2xl">
                      <p className="text-sm font-medium mb-3">Or start from a preset:</p>
                      <div className="grid grid-cols-2 gap-3">
                        {SETTINGS_PRESETS.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onClick={() => applyPreset(preset)} />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : viewMode === "form" ? (
                  <SettingsFormEditor
                    repoId={repoId}
                    initialJson={activeJsonContent}
                    scope={settingsScope}
                    onSaved={onSaved}
                  />
                ) : (
                  <SettingsRawEditor
                    repoId={repoId}
                    initialJson={
                      settingsScope === "local"
                        ? (claudeConfig.settingsJson ?? "")
                        : (claudeConfig.sharedSettingsJson ?? "")
                    }
                    jsonContent={activeJsonContent}
                    onJsonChange={setActiveJsonContent}
                    scope={settingsScope}
                    onSaved={onSaved}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* CLAUDE.md Sub-tab */}
          <TabsContent value="claude-md" className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">CLAUDE.md</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" align="start">
                  <p className="font-medium mb-2">CLAUDE.md Best Practices</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li>Start with project summary and tech stack</li>
                    <li>List common dev commands (build, test, lint)</li>
                    <li>Document architecture and directory structure</li>
                    <li>Describe key patterns and conventions</li>
                    <li>Include environment setup instructions</li>
                    <li>Note non-obvious gotchas or workarounds</li>
                    <li>Keep it focused — Claude reads this every session</li>
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
            {!claudeConfig ? (
              <p className="text-muted-foreground text-center py-8">Claude config data unavailable</p>
            ) : !mdExists && !mdContent ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No CLAUDE.md found</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  Create a CLAUDE.md file to provide project instructions and context to Claude Code.
                </p>
                <Button onClick={createClaudeMdFile}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create CLAUDE.md
                </Button>
              </div>
            ) : (
              <>
                <textarea
                  value={mdContent}
                  onChange={(e) => setMdContent(e.target.value)}
                  className="w-full h-80 font-mono text-sm p-4 rounded-lg border bg-muted/30 resize-y focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  spellCheck={false}
                  placeholder="# CLAUDE.md"
                />
                <div className="sticky bottom-0 bg-background border-t py-3 flex items-center gap-2">
                  <Button onClick={saveMarkdown} disabled={saving} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="ghost" onClick={resetMarkdown} size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Rules Sub-tab */}
          <TabsContent value="rules" className="space-y-4">
            <RulesEditor repoId={repoId} initialRules={claudeConfig?.rules ?? []} onSaved={onSaved} />
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Preset confirmation dialog */}
      <AlertDialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {pendingPreset?.label} Preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the current settings with the {pendingPreset?.label} preset configuration. This action
              saves immediately to disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPreset(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePresetConfirm}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
