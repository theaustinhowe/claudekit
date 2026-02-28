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
import { Select, SelectContent, SelectItem, SelectTrigger } from "@claudekit/ui/components/select";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Code, Download, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteSkillGroup, exportSkillGroupAsFiles, getSkillGroupPreview } from "@/lib/actions/skill-groups";
import { GROUP_COLORS } from "@/lib/constants";
import type { SkillGroup } from "@/lib/types";
import { SkillGroupFormDialog } from "./skill-group-form-dialog";

function formatSkillName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SkillGroupsTabProps {
  initialGroups: SkillGroup[];
}

export function SkillGroupsTab({ initialGroups }: SkillGroupsTabProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [isPending, startTransition] = useTransition();
  const [previewGroup, setPreviewGroup] = useState<SkillGroup | null>(null);
  const [previewContent, setPreviewContent] = useState<{ name: string; content: string }[]>([]);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SkillGroup | undefined>();

  const handlePreview = (group: SkillGroup) => {
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
  };

  const handleExport = (group: SkillGroup) => {
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
  };

  const handleDelete = (group: SkillGroup) => {
    const prev = groups;
    setGroups((g) => g.filter((x) => x.id !== group.id));

    startTransition(async () => {
      try {
        const result = await deleteSkillGroup(group.id);
        toast.success(`"${group.name}" deleted`, {
          description:
            result.orphanedSkills > 0
              ? `${result.orphanedSkills} skill${result.orphanedSkills !== 1 ? "s" : ""} ungrouped`
              : undefined,
        });
      } catch (err) {
        setGroups(prev);
        toast.error("Failed to delete skill group", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const handleSaved = (saved: SkillGroup) => {
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...saved };
        return next;
      }
      return [...prev, saved];
    });
  };

  const openCreate = () => {
    setEditingGroup(undefined);
    setFormOpen(true);
  };

  const openEdit = (group: SkillGroup) => {
    setEditingGroup(group);
    setFormOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {groups.length} group{groups.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" />
            Add Group
          </Button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No skill groups yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a group to organize skills, or run a skill analysis to generate them automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group, i) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 border-l-[3px] hover:bg-muted/30 transition-colors"
                style={{ borderLeftColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.skillCount.toLocaleString()} skill{group.skillCount !== 1 ? "s" : ""} &middot;{" "}
                    {group.category}
                  </p>
                </div>
                <TooltipProvider>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={isPending}
                          onClick={() => handlePreview(group)}
                        >
                          <Code className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview SKILL.md files</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={isPending}
                          onClick={() => handleExport(group)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export to ~/.claude/skills/</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={isPending}
                          onClick={() => openEdit(group)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit group</TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Delete group</TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &ldquo;{group.name}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete the skill group.{" "}
                            {group.skillCount > 0 && (
                              <>
                                {group.skillCount} skill{group.skillCount !== 1 ? "s" : ""} will be ungrouped but not
                                deleted.
                              </>
                            )}{" "}
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(group)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TooltipProvider>
              </div>
            ))}
          </div>
        )}
      </div>

      <SkillGroupFormDialog open={formOpen} onOpenChange={setFormOpen} group={editingGroup} onSaved={handleSaved} />

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
