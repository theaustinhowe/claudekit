"use client";

import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@claudekit/ui/components/select";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Code, Download, FolderOpen } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { exportSkillGroupAsFiles, getSkillGroupPreview } from "@/lib/actions/skill-groups";
import type { SkillGroup } from "@/lib/types";

function formatSkillName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SkillGroupsPanelProps {
  groups: SkillGroup[];
  colorMap?: Map<string, string>;
}

export function SkillGroupsPanel({ groups, colorMap }: SkillGroupsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [previewGroup, setPreviewGroup] = useState<SkillGroup | null>(null);
  const [previewContent, setPreviewContent] = useState<{ name: string; content: string }[]>([]);
  const [selectedSkill, setSelectedSkill] = useState("");

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
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 border-l-[3px] hover:bg-muted/30 transition-colors"
                style={colorMap?.get(group.id) ? { borderLeftColor: colorMap.get(group.id) } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.skillCount.toLocaleString()} skill{group.skillCount !== 1 ? "s" : ""}
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
                        setSelectedSkill(previews[0].name);
                        setPreviewGroup(group);
                      });
                    }}
                  >
                    <Code className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                      </TooltipTrigger>
                      <TooltipContent>Exports SKILL.md files to ~/.claude/skills/</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!previewGroup} onOpenChange={(open) => !open && setPreviewGroup(null)}>
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Preview {previewGroup?.name}</SheetTitle>
          </SheetHeader>
          <SheetBody className="overflow-y-auto">
            <div className="space-y-4 mt-1">
              {previewContent.length > 1 && (
                <Select value={selectedSkill} onValueChange={setSelectedSkill}>
                  <SelectTrigger className="h-8 text-sm">
                    <span className="truncate">{formatSkillName(selectedSkill)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {previewContent.map((skill) => (
                      <SelectItem key={skill.name} value={skill.name}>
                        {formatSkillName(skill.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(() => {
                const idx = previewContent.findIndex((s) => s.name === selectedSkill);
                const current = idx >= 0 ? previewContent[idx] : previewContent[0];
                const displayIdx = idx >= 0 ? idx : 0;
                return (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {displayIdx + 1} of {previewContent.length.toLocaleString()} SKILL.md file
                      {previewContent.length !== 1 ? "s" : ""} in{" "}
                      <span className="font-medium text-foreground">{previewGroup?.category}</span>
                    </p>
                    {current && (
                      <div className="rounded-lg border border-border/50 overflow-hidden">
                        <pre className="p-4 text-xs font-mono whitespace-pre-wrap bg-muted/30 overflow-x-auto">
                          {current.content}
                        </pre>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
