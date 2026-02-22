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
} from "@claudekit/ui/components/alert-dialog";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Textarea } from "@claudekit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Book, Globe, Layers, Plus, Server, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createPolicyTemplate, deletePolicyTemplate } from "@/lib/actions/policy-templates";
import type { Policy, PolicyTemplate } from "@/lib/types";

const iconMap: Record<string, React.ReactNode> = {
  globe: <Globe className="w-5 h-5" />,
  server: <Server className="w-5 h-5" />,
  book: <Book className="w-5 h-5" />,
  layers: <Layers className="w-5 h-5" />,
};

interface TemplatesTabProps {
  templates: PolicyTemplate[];
  onUseTemplate: (defaults: Partial<Policy>) => void;
  createTrigger?: number;
}

export function TemplatesTab({ templates, onUseTemplate, createTrigger = 0 }: TemplatesTabProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<PolicyTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const lastCreateTrigger = useRef(createTrigger);

  useEffect(() => {
    if (createTrigger !== lastCreateTrigger.current) {
      lastCreateTrigger.current = createTrigger;
      setCreateOpen(true);
    }
  }, [createTrigger]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await createPolicyTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        defaults: {},
      });
      toast.success("Template created");
      setCreateOpen(false);
      setName("");
      setDescription("");
      router.refresh();
    } catch {
      toast.error("Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setIsSubmitting(true);
    try {
      await deletePolicyTemplate(templateToDelete.id);
      toast.success("Template deleted");
      setDeleteOpen(false);
      setTemplateToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className="group relative cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onUseTemplate(template.defaults)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-3">
                  {iconMap[template.icon || ""] || <Globe className="w-5 h-5" />}
                </div>
                {!template.is_builtin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTemplateToDelete(template);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <h3 className="font-medium">{template.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
            </CardContent>
          </Card>
        ))}

        {/* Create Template Card */}
        <Card
          className="cursor-pointer border-dashed hover:border-primary/50 transition-colors"
          onClick={() => setCreateOpen(true)}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[120px] text-muted-foreground">
            <Plus className="w-6 h-6 mb-2" />
            <span className="text-sm font-medium">Create Template</span>
          </CardContent>
        </Card>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. React SPA"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this template is for"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isSubmitting || !name.trim()}>
                  {isSubmitting ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{templateToDelete?.name}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
