"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { FileCode, Film, Monitor, Terminal, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { AppPreview } from "@/components/generator/app-preview";
import { DevServerLogs } from "@/components/generator/dev-server-logs";
import { ScreenshotTimelapse } from "@/components/generator/screenshot-timelapse";
import { SpecFilesTab } from "@/components/generator/spec-files-tab";
import type { PlatformRunInstruction, PreviewStrategy } from "@/lib/constants";

interface PreviewPanelProps {
  projectId: string;
  projectPath: string;
  projectName: string;
  port: number | null;
  devServerStatus: "starting" | "ready" | "error" | "stopped";
  onStartServer?: () => void;
  autoFixEnabled?: boolean;
  onToggleAutoFix?: (enabled: boolean) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  showTasksTab?: boolean;
  tasksContent?: ReactNode;
  disableAppTab?: boolean;
  previewStrategy?: PreviewStrategy;
  runInstruction?: PlatformRunInstruction;
  onViewTerminal?: () => void;
}

export function PreviewPanel({
  projectId,
  projectPath,
  projectName,
  port,
  devServerStatus,
  onStartServer,
  autoFixEnabled,
  onToggleAutoFix,
  activeTab,
  onTabChange,
  showTasksTab,
  tasksContent,
  disableAppTab,
  previewStrategy,
  runInstruction,
  onViewTerminal,
}: PreviewPanelProps) {
  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} defaultValue="app" onValueChange={onTabChange} className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-3 shrink-0">
          {showTasksTab && (
            <TabsTrigger value="tasks" className="text-xs">
              <Zap className="w-3.5 h-3.5 mr-1" />
              Tasks
            </TabsTrigger>
          )}
          <TabsTrigger value="app" className="text-xs" disabled={disableAppTab}>
            <Monitor className="w-3.5 h-3.5 mr-1" />
            App
          </TabsTrigger>
          <TabsTrigger value="files" className="text-xs">
            <FileCode className="w-3.5 h-3.5 mr-1" />
            Files
          </TabsTrigger>
          <TabsTrigger value="terminal" className="text-xs" disabled={disableAppTab}>
            <Terminal className="w-3.5 h-3.5 mr-1" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            <Film className="w-3.5 h-3.5 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 relative">
          {showTasksTab && (
            <TabsContent value="tasks" className="mt-0 absolute inset-0 flex flex-col data-[hidden]:hidden" keepMounted>
              {tasksContent}
            </TabsContent>
          )}
          <TabsContent value="app" className="mt-0 h-full">
            <AppPreview
              port={port}
              status={devServerStatus}
              onStartServer={onStartServer}
              strategy={previewStrategy}
              runInstruction={runInstruction}
              projectPath={projectPath}
              onViewTerminal={onViewTerminal}
            />
          </TabsContent>
          <TabsContent value="files" className="mt-0 p-3 h-full">
            <SpecFilesTab projectId={projectId} projectPath={projectPath} projectName={projectName} />
          </TabsContent>
          <TabsContent value="terminal" className="mt-0 p-3 h-full">
            <DevServerLogs
              projectId={projectId}
              projectPath={projectPath}
              autoFixEnabled={autoFixEnabled}
              onToggleAutoFix={onToggleAutoFix}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-0 h-full">
            <ScreenshotTimelapse projectId={projectId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
