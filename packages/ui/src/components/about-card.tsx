"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

interface AboutCardProps {
  appName: string;
  version: string;
  port: number;
  children?: ReactNode;
  className?: string;
}

function AboutCard({ appName, version, port, children, className }: AboutCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="w-5 h-5" />
          About
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono">
            {appName} {version}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Port</span>
          <span className="font-mono text-sm">{port}</span>
        </div>
        {children && <div className="border-t pt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}

export { AboutCard, type AboutCardProps };
