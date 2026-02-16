"use client";

import { Button } from "@devkit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { AlertCircle, Circle, Loader2, Monitor, MonitorDot, Play, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@devkit/ui";

interface AppPreviewProps {
  port: number | null;
  status: "starting" | "ready" | "error" | "stopped";
  onStartServer?: () => void;
}

type Viewport = "desktop" | "tablet" | "mobile";

const viewportConfig: Record<Viewport, { maxWidth: string; icon: typeof Monitor; label: string }> = {
  desktop: { maxWidth: "100%", icon: MonitorDot, label: "Desktop" },
  tablet: { maxWidth: "768px", icon: Tablet, label: "Tablet" },
  mobile: { maxWidth: "375px", icon: Smartphone, label: "Mobile" },
};

export function AppPreview({ port, status, onStartServer }: AppPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = `${iframeRef.current.src}`;
    }
  }, []);

  const url = port ? `http://localhost:${port}` : null;

  if (status === "starting") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm">Starting dev server...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p className="text-sm">Dev server encountered an error</p>
        <Button size="sm" onClick={onStartServer}>
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Restart
        </Button>
      </div>
    );
  }

  if (status === "stopped") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Monitor className="w-6 h-6" />
        <p className="text-sm">Dev server not running</p>
        <Button size="sm" onClick={onStartServer}>
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Start
        </Button>
      </div>
    );
  }

  // status === "ready"
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background border rounded-md text-xs text-muted-foreground flex-1 min-w-0">
          <Circle className="w-2 h-2 fill-green-500 text-green-500 shrink-0" />
          <span className="truncate">{url}</span>
        </div>

        <TooltipProvider>
          <div className="flex items-center border rounded-md overflow-hidden shrink-0">
            {(Object.entries(viewportConfig) as [Viewport, typeof viewportConfig.desktop][]).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setViewport(key)}
                      className={cn(
                        "p-1.5 transition-colors",
                        viewport === key
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{config.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleRefresh}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh page</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* iframe container */}
      <div className="flex-1 flex justify-center bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
        <div
          className="h-full bg-white dark:bg-background transition-all duration-200"
          style={{ maxWidth: viewportConfig[viewport].maxWidth, width: "100%" }}
        >
          {url && (
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
        </div>
      </div>
    </div>
  );
}
