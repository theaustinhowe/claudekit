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
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Switch } from "@claudekit/ui/components/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Download, Edit, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createCustomRule, deleteCustomRule, toggleCustomRule, updateCustomRule } from "@/lib/actions/custom-rules";
import type { CustomRule, Policy } from "@/lib/types";
import { RuleFormatDocs } from "./format-docs";
import { RuleForm, type RuleFormData } from "./rule-form";

interface RulesTabProps {
  rules: CustomRule[];
  policies: Policy[];
  createTrigger?: number;
}

export function RulesTab({ rules, policies, createTrigger = 0 }: RulesTabProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<CustomRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastCreateTrigger = useRef(createTrigger);

  useEffect(() => {
    if (createTrigger !== lastCreateTrigger.current) {
      lastCreateTrigger.current = createTrigger;
      setEditingRule(undefined);
      setFormOpen(true);
    }
  }, [createTrigger]);

  const openCreateForm = () => {
    setEditingRule(undefined);
    setFormOpen(true);
  };

  const openEditForm = (rule: CustomRule) => {
    setEditingRule(rule);
    setFormOpen(true);
  };

  const handleSubmit = async (data: RuleFormData) => {
    setIsSubmitting(true);
    try {
      if (editingRule) {
        await updateCustomRule(editingRule.id, data);
        toast.success("Rule updated");
      } else {
        await createCustomRule(data);
        toast.success("Rule created");
      }
      setFormOpen(false);
      setEditingRule(undefined);
      router.refresh();
    } catch {
      toast.error(editingRule ? "Failed to update rule" : "Failed to create rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (rule: CustomRule, enabled: boolean) => {
    try {
      await toggleCustomRule(rule.id, enabled);
      router.refresh();
    } catch {
      toast.error("Failed to toggle rule");
    }
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteCustomRule(ruleToDelete.id);
      toast.success("Rule deleted");
      setDeleteOpen(false);
      setRuleToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = (rule: CustomRule) => {
    const exportData = {
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      rule_type: rule.rule_type,
      config: rule.config,
      suggested_actions: rule.suggested_actions,
      policy_id: rule.policy_id,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rule.name.toLowerCase().replace(/\s+/g, "-")}.rule.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rule downloaded");
  };

  const ruleTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      file_exists: "File Exists",
      file_missing: "File Missing",
      file_contains: "File Contains",
      json_field: "JSON Field",
    };
    return labels[type] || type;
  };

  return (
    <>
      <div className="space-y-3">
        {rules.map((rule) => (
          <Card key={rule.id} className={rule.is_enabled ? "" : "opacity-60"}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Switch
                  checked={rule.is_enabled}
                  onCheckedChange={(v) => handleToggle(rule, v)}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium">{rule.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {ruleTypeBadge(rule.rule_type)}
                    </Badge>
                    <Badge
                      variant={rule.severity === "critical" ? "destructive" : "secondary"}
                      className="capitalize text-xs"
                    >
                      {rule.severity}
                    </Badge>
                    {rule.is_builtin && (
                      <Badge variant="secondary" className="text-xs">
                        Built-in
                      </Badge>
                    )}
                  </div>
                  {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                  {rule.policy_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Bound to: {policies.find((p) => p.id === rule.policy_id)?.name || "Unknown policy"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditForm(rule)}
                          disabled={rule.is_builtin}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Download rule"
                          onClick={() => handleDownload(rule)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setRuleToDelete(rule);
                            setDeleteOpen(true);
                          }}
                          disabled={rule.is_builtin}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-2">No custom rules yet</p>
            <Button variant="outline" size="sm" onClick={openCreateForm}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first rule
            </Button>
          </div>
        )}

        <RuleFormatDocs />
      </div>

      <RuleForm
        key={editingRule?.id || "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editingRule}
        policies={policies}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{ruleToDelete?.name}&rdquo;?
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
