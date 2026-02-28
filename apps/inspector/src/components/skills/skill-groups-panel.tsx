"use client";

import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Code, Download, FolderOpen } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { exportSkillGroupAsFiles, getSkillGroupPreview } from "@/lib/actions/skill-groups";
import type { SkillGroup } from "@/lib/types";

interface SkillGroupsPanelProps {
  groups: SkillGroup[];
}

export function SkillGroupsPanel({ groups }: SkillGroupsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [previewGroup, setPreviewGroup] = useState<SkillGroup | null>(null);
  const [previewContent, setPreviewContent] = useState<string[]>([]);

  if (groups.length === 0) return null;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Skill Groups
            </h3>
          </div>
          <div className="space-y-2">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.skillCount.toLocaleString()} skill{group.skillCount !== 1 ? "s" : ""} &middot;{" "}
                    {group.category}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const previews = await getSkillGroupPreview(group.id);
                        if (previews.length === 0) {
                          toast.info("No skills with rule content in this group");
                          return;
                        }
                        setPreviewContent(previews);
                        setPreviewGroup(group);
                      });
                    }}
                  >
                    <Code className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const result = await exportSkillGroupAsFiles(group.id, "global");
                          toast.success(`Exported ${result.filesWritten.toLocaleString()} SKILL.md files`, {
                            description: result.directory,
                            duration: 5000,
                          });
                        } catch (err) {
                          toast.error("Export failed", {
                            description: err instanceof Error ? err.message : "Unknown error",
                          });
                        }
                      });
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!previewGroup} onOpenChange={(open) => !open && setPreviewGroup(null)}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{previewGroup?.name} — Preview</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {previewContent.length.toLocaleString()} SKILL.md file{previewContent.length !== 1 ? "s" : ""} in{" "}
                <span className="font-medium text-foreground">{previewGroup?.category}</span>
              </p>
              {previewContent.map((content) => (
                <div key={content} className="rounded-lg border border-border/50 overflow-hidden">
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap bg-muted/30 overflow-x-auto">{content}</pre>
                </div>
              ))}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
