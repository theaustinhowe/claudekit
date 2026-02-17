"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Textarea } from "@devkit/ui/components/textarea";
import { AlertTriangle, ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { useState } from "react";
import { RISK_CLASSES, SIZE_CLASSES } from "@/lib/constants";
import type { SubPR } from "@/lib/types";

interface SubPRCardProps {
  subPR: SubPR;
  color: string;
}

export function SubPRCard({ subPR, color }: SubPRCardProps) {
  const [filesOpen, setFilesOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  return (
    <Card className="border-l-[3px]" style={{ borderLeftColor: color }}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              {subPR.index}/{subPR.total}
            </span>
            <h3 className="font-semibold text-sm">{subPR.title}</h3>
          </div>
          <Badge variant="outline" className={cn("text-[10px] border", SIZE_CLASSES[subPR.size])}>
            {subPR.size} &middot; {subPR.linesChanged}L
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!subPR.dependsOn || subPR.dependsOn.length === 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              Independent
            </Badge>
          ) : (
            subPR.dependsOn.map((d) => (
              <Badge key={d} variant="secondary" className="text-[10px]">
                Depends on: {d}/{subPR.total}
              </Badge>
            ))
          )}
          <span className={cn("text-xs font-medium flex items-center gap-1", RISK_CLASSES[subPR.risk])}>
            {subPR.risk === "High" && <AlertTriangle className="h-3 w-3" />}
            {subPR.risk} risk
          </span>
          <span className="text-[10px] text-muted-foreground">&mdash; {subPR.riskNote}</span>
        </div>

        {subPR.files && subPR.files.length > 0 && (
          <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              {filesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {subPR.files.length} files
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {subPR.files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/50 font-mono"
                  >
                    <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.path}</span>
                    <span className="ml-auto text-status-success shrink-0">+{f.additions}</span>
                    {f.deletions > 0 && <span className="text-status-error shrink-0">-{f.deletions}</span>}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Collapsible open={descOpen} onOpenChange={setDescOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {descOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            PR Description & Checklist
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              <Textarea defaultValue={subPR.description} className="text-xs" rows={3} />
              {subPR.checklist && subPR.checklist.length > 0 && (
                <div className="space-y-1">
                  {subPR.checklist.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" className="rounded" />
                      {item}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
