"use client";

import { THEMES, useAppTheme } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { FolderOpen, Info, Monitor, Moon, Plus, RotateCcw, Sparkles, Sun, X } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/directory-picker";
import { PageTabs } from "@/components/layout/page-tabs";
import { ApiKeysTab, type ServerKeyGroup } from "@/components/settings/api-keys-tab";
import { useTabNavigation } from "@/hooks/use-tab-navigation";
import { createScanRoot, deleteScanRoot } from "@/lib/actions/scans";
import { setCleanupFiles } from "@/lib/actions/settings";
import { DEFAULT_CLEANUP_FILES } from "@/lib/constants";
import type { ScanRoot } from "@/lib/types";

interface SettingsClientProps {
  scanRoots: ScanRoot[];
  envKeys: Record<string, string>;
  serverKeys: ServerKeyGroup[];
  cleanupFiles: string[];
  initialTab?: string;
}

export function SettingsClient({
  scanRoots: initialScanRoots,
  envKeys,
  serverKeys,
  cleanupFiles: initialCleanupFiles,
  initialTab,
}: SettingsClientProps) {
  const { activeTab, setActiveTab } = useTabNavigation(
    initialTab || "general",
    "/settings",
    { general: "General", "api-keys": "API Keys" },
    "Settings",
  );

  const { theme, setTheme } = useTheme();
  const { theme: appTheme, setTheme: setAppTheme, mounted: themeMounted } = useAppTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [roots, setRoots] = useState<ScanRoot[]>(initialScanRoots.length > 0 ? initialScanRoots : []);

  // Cleanup files state
  const [cleanupFilesList, setCleanupFilesList] = useState<string[]>(initialCleanupFiles);
  const [newCleanupFile, setNewCleanupFile] = useState("");

  const addCleanupFile = useCallback(async () => {
    const trimmed = newCleanupFile.trim();
    if (!trimmed || cleanupFilesList.includes(trimmed)) return;
    const updated = [...cleanupFilesList, trimmed];
    setCleanupFilesList(updated);
    setNewCleanupFile("");
    try {
      await setCleanupFiles(updated);
    } catch {
      toast.error("Failed to save cleanup files");
    }
  }, [newCleanupFile, cleanupFilesList]);

  const removeCleanupFile = useCallback(
    async (file: string) => {
      const updated = cleanupFilesList.filter((f) => f !== file);
      setCleanupFilesList(updated);
      try {
        await setCleanupFiles(updated);
      } catch {
        toast.error("Failed to save cleanup files");
      }
    },
    [cleanupFilesList],
  );

  const resetCleanupFiles = useCallback(async () => {
    setCleanupFilesList(DEFAULT_CLEANUP_FILES);
    try {
      await setCleanupFiles(DEFAULT_CLEANUP_FILES);
      toast.success("Reset to defaults");
    } catch {
      toast.error("Failed to reset cleanup files");
    }
  }, []);

  const addRoot = useCallback(async () => {
    try {
      const created = await createScanRoot("~");
      setRoots((prev) => [...prev, created]);
    } catch {
      toast.error("Failed to add scan root");
    }
  }, []);

  const removeRoot = useCallback(async (id: string) => {
    setRoots((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteScanRoot(id);
      toast.success("Scan root removed");
    } catch {
      toast.error("Failed to remove scan root");
    }
  }, []);

  const updateRoot = useCallback(async (id: string, newPath: string) => {
    if (!newPath) return;
    setRoots((prev) => prev.map((r) => (r.id === id ? { ...r, path: newPath } : r)));
    try {
      await deleteScanRoot(id);
      const created = await createScanRoot(newPath);
      setRoots((prev) => prev.map((r) => (r.id === id ? created : r)));
      toast.success("Scan root saved");
    } catch {
      toast.error("Failed to update scan root");
    }
  }, []);

  return (
    <div className="flex flex-col">
      <PageTabs
        tabs={[
          { id: "general", label: "General" },
          { id: "api-keys", label: "API Keys" },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
      />
      <div className="flex-1">
        <div className="p-4 sm:p-6 max-w-3xl mx-auto">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Appearance */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sun className="w-5 h-5" />
                      Appearance
                    </CardTitle>
                    <CardDescription>Customize the look and feel</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <Label>Theme</Label>
                        <p className="text-sm text-muted-foreground">Choose light or dark mode</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant={mounted && theme === "light" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTheme("light")}
                        >
                          <Sun className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Light</span>
                        </Button>
                        <Button
                          variant={mounted && theme === "dark" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTheme("dark")}
                        >
                          <Moon className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Dark</span>
                        </Button>
                        <Button
                          variant={mounted && theme === "system" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTheme("system")}
                        >
                          <Monitor className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">System</span>
                        </Button>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <Label>Accent Color</Label>
                          <p className="text-sm text-muted-foreground">Set the accent color</p>
                        </div>
                        <div className="flex gap-2">
                          <TooltipProvider>
                            {THEMES.map((t) => (
                              <Tooltip key={t.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setAppTheme(t.id)}
                                    className={cn(
                                      "w-8 h-8 rounded-full transition-all",
                                      themeMounted && appTheme === t.id
                                        ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                                        : "hover:scale-110",
                                    )}
                                    style={{ backgroundColor: `hsl(${t.hue}, 70%, 50%)` }}
                                    aria-label={t.label}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{t.label}</p>
                                  <p className="text-xs opacity-80">{t.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Default Scan Roots */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FolderOpen className="w-5 h-5" />
                      Default Scan Roots
                    </CardTitle>
                    <CardDescription>Directories to scan by default</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {roots.map((root) => (
                      <div key={root.id} className="flex items-center gap-2">
                        <DirectoryPicker
                          value={root.path}
                          onChange={(val) => updateRoot(root.id, val)}
                          placeholder="~/path/to/projects"
                          className="flex-1"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRoot(root.id)}
                                disabled={roots.length === 1}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addRoot}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Directory
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Cleanup Files */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Cleanup Files ({cleanupFilesList.length})
                    </CardTitle>
                    <CardDescription>Files to remove when running repo cleanup</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                      {[...cleanupFilesList]
                        .sort((a, b) => a.localeCompare(b))
                        .map((file) => (
                          <div
                            key={file}
                            className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 group"
                          >
                            <span className="font-mono text-sm text-muted-foreground">{file}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeCleanupFile(file)}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newCleanupFile}
                        onChange={(e) => setNewCleanupFile(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCleanupFile();
                          }
                        }}
                        placeholder=".examplerc"
                        className="flex-1 font-mono text-sm"
                      />
                      <Button variant="outline" size="sm" onClick={addCleanupFile} disabled={!newCleanupFile.trim()}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={resetCleanupFiles} className="text-muted-foreground">
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Reset to Defaults
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* About */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Info className="w-5 h-5" />
                      About
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono">Gadget 1.0.0-beta</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Build</span>
                      <span className="font-mono text-sm">2025.02.10</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}

          {activeTab === "api-keys" && <ApiKeysTab envKeys={envKeys} serverKeys={serverKeys} />}
        </div>
      </div>
    </div>
  );
}
