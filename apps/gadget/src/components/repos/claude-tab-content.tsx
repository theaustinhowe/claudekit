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
} from "@devkit/ui/components/alert-dialog";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@devkit/ui/components/tabs";
import { Code, Download, FileCode, FileText, FormInput, Info, Plus, RotateCcw, Save } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { saveClaudeMd, saveClaudeSettingsJson } from "@/lib/actions/claude-config";
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

interface ClaudeTabContentProps {
  repoId: string;
  claudeConfig?: { settingsJson: string | null; claudeMd: string | null; repoPath: string };
  defaultClaudeSettings?: string | null;
  onSaved?: () => void;
}

export function ClaudeTabContent({ repoId, claudeConfig, defaultClaudeSettings, onSaved }: ClaudeTabContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subTab = searchParams?.get("subtab") || "settings";

  const setSubTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (tab === "settings") {
        params.delete("subtab");
      } else {
        params.set("subtab", tab);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Settings state
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonContent, setJsonContent] = useState(claudeConfig?.settingsJson ?? "");
  const [mdContent, setMdContent] = useState(claudeConfig?.claudeMd ?? "");
  const [saving, setSaving] = useState(false);
  const [applyingDefault, setApplyingDefault] = useState(false);

  const jsonExists = claudeConfig?.settingsJson !== null && claudeConfig?.settingsJson !== undefined;
  const mdExists = claudeConfig?.claudeMd !== null && claudeConfig?.claudeMd !== undefined;
  const hasSettingsContent = jsonExists || jsonContent;

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
    setJsonContent(SETTINGS_TEMPLATE);
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
    if (jsonContent.trim()) {
      try {
        JSON.parse(jsonContent);
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
      await saveClaudeSettingsJson(repoId, defaultClaudeSettings);
      setJsonContent(defaultClaudeSettings);
      toast.success("Default settings applied!");
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to apply: ${(e as Error).message}`);
    } finally {
      setApplyingDefault(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI Config</CardTitle>
          {subTab === "settings" && hasSettingsContent && (
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
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="settings" className="gap-2">
              <FileCode className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="claude-md" className="gap-2">
              <FileText className="w-4 h-4" />
              CLAUDE.md
            </TabsTrigger>
          </TabsList>

          {/* Settings Sub-tab */}
          <TabsContent value="settings" className="space-y-4">
            {!claudeConfig ? (
              <p className="text-muted-foreground text-center py-8">Claude config data unavailable</p>
            ) : (
              <>
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
                    <h3 className="text-lg font-semibold mb-2">No settings.local.json found</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md">
                      Create a Claude Code settings file to configure permissions, allowed tools, and environment
                      variables.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={createSettingsFile}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create settings.local.json
                      </Button>
                      {defaultClaudeSettings && (
                        <Button variant="outline" onClick={applyDefault} disabled={applyingDefault}>
                          <Download className="w-4 h-4 mr-2" />
                          From Default
                        </Button>
                      )}
                    </div>
                  </div>
                ) : viewMode === "form" ? (
                  <SettingsFormEditor repoId={repoId} initialJson={jsonContent} onSaved={onSaved} />
                ) : (
                  <SettingsRawEditor
                    repoId={repoId}
                    initialJson={claudeConfig.settingsJson ?? ""}
                    jsonContent={jsonContent}
                    onJsonChange={setJsonContent}
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
