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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Edit,
  Loader2,
  Package,
  Plus,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageTabs } from "@/components/layout/page-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useTabNavigation } from "@/hooks/use-tab-navigation";
import { createPolicy, deletePolicy, updatePolicy } from "@/lib/actions/policies";
import type { CustomRule, Policy } from "@/lib/types";
import { PolicyForm, type PolicyFormData } from "./policy-form";
import { RulesTab } from "./rules-tab";

interface PoliciesClientProps {
  policies: Policy[];
  rules: CustomRule[];
}

export function PoliciesClient({ policies: initialPolicies, rules }: PoliciesClientProps) {
  const router = useRouter();
  const { activeTab, setActiveTab } = useTabNavigation(
    "policies",
    "/policies",
    { policies: "Policies", rules: "Rules" },
    "Policies",
  );

  const [policies] = useState<Policy[]>(initialPolicies);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<Policy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<Partial<Policy> | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [ruleCreateTrigger, setRuleCreateTrigger] = useState(0);

  // --- Edit ---
  const openEditDialog = (policy: Policy) => {
    setSelectedPolicy(policy);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (data: PolicyFormData) => {
    if (!selectedPolicy) return;
    setIsSubmitting(true);
    try {
      await updatePolicy(selectedPolicy.id, data);
      toast.success("Policy updated");
      setEditDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to update policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Create ---
  const openCreateDialog = (defaults?: Partial<Policy>) => {
    setCreateDefaults(defaults);
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (data: PolicyFormData) => {
    setIsSubmitting(true);
    try {
      await createPolicy(data);
      toast.success("Policy created");
      setCreateDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to create policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Delete ---
  const openDeleteDialog = (policy: Policy) => {
    if (policy.is_builtin) {
      toast.error("Cannot delete built-in policies");
      return;
    }
    setPolicyToDelete(policy);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;
    setIsSubmitting(true);
    try {
      await deletePolicy(policyToDelete.id);
      toast.success("Policy deleted");
      setDeleteDialogOpen(false);
      setPolicyToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Duplicate ---
  const handleDuplicate = (policy: Policy) => {
    openCreateDialog({
      name: `${policy.name} (Copy)`,
      description: policy.description,
      expected_versions: policy.expected_versions,
      banned_dependencies: policy.banned_dependencies,
      allowed_package_managers: policy.allowed_package_managers,
      preferred_package_manager: policy.preferred_package_manager,
      ignore_patterns: policy.ignore_patterns,
      repo_types: policy.repo_types,
    } as Partial<Policy>);
  };

  // --- Download ---
  const handleDownload = (policy: Policy) => {
    const exportData = {
      name: policy.name,
      description: policy.description,
      expected_versions: policy.expected_versions,
      banned_dependencies: policy.banned_dependencies,
      allowed_package_managers: policy.allowed_package_managers,
      preferred_package_manager: policy.preferred_package_manager,
      ignore_patterns: policy.ignore_patterns,
      repo_types: policy.repo_types,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${policy.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Policy downloaded");
  };

  // --- Import ---
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.name || typeof data.name !== "string") {
        toast.error("Invalid policy file: missing name");
        return;
      }
      await createPolicy({
        name: data.name,
        description: data.description,
        expected_versions: data.expected_versions ?? {},
        banned_dependencies: data.banned_dependencies ?? [],
        allowed_package_managers: data.allowed_package_managers ?? ["pnpm"],
        preferred_package_manager: data.preferred_package_manager ?? "pnpm",
        ignore_patterns: data.ignore_patterns,
        repo_types: data.repo_types,
      });
      toast.success("Policy imported");
      router.refresh();
    } catch {
      toast.error("Failed to import policy — check JSON format");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const tabActions = (() => {
    switch (activeTab) {
      case "policies":
        return (
          <>
            <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button size="sm" onClick={() => openCreateDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              New Policy
            </Button>
          </>
        );
      case "rules":
        return (
          <Button size="sm" onClick={() => setRuleCreateTrigger((t) => t + 1)}>
            <Plus className="w-4 h-4 mr-2" />
            New Rule
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col">
      <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <PageTabs
        tabs={[
          { id: "policies", label: "Policies", count: policies.length },
          { id: "rules", label: "Rules", count: rules.length },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
        actions={tabActions}
      />
      <div className="flex-1">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {/* Policies Tab */}
          {activeTab === "policies" && (
            <div className="space-y-4">
              {policies.length === 0 && (
                <EmptyState
                  icon={Shield}
                  title="No Policies"
                  description="Policies define the rules your repositories are audited against. Create one to get started."
                  actions={[
                    { label: "New Policy", onClick: () => openCreateDialog() },
                    { label: "Browse Rules", onClick: () => setActiveTab("rules"), variant: "outline" },
                  ]}
                />
              )}
              {policies.map((policy) => (
                <motion.div key={policy.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                            <Shield className="w-5 h-5 text-accent-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{policy.name}</CardTitle>
                            <CardDescription>{policy.description}</CardDescription>
                          </div>
                        </div>
                        <TooltipProvider>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit policy"
                                  onClick={() => openEditDialog(policy)}
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
                                  aria-label="Duplicate policy"
                                  onClick={() => handleDuplicate(policy)}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Download policy"
                                  onClick={() => handleDownload(policy)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                            {!policy.is_builtin && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Delete policy"
                                    onClick={() => openDeleteDialog(policy)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-3 gap-6">
                        {/* Expected Versions */}
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Expected Versions
                          </h4>
                          <div className="space-y-1">
                            {Object.entries(policy.expected_versions)
                              .slice(0, 4)
                              .map(([pkg, version]) => (
                                <div key={pkg} className="flex items-center justify-between text-sm">
                                  <span className="font-mono text-muted-foreground">{pkg}</span>
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {version}
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Banned Dependencies */}
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            Banned Dependencies
                          </h4>
                          {policy.banned_dependencies.length > 0 ? (
                            <div className="space-y-1">
                              {policy.banned_dependencies.map((dep) => (
                                <div key={dep.name} className="flex items-center gap-2 text-sm">
                                  <X className="w-3 h-3 text-destructive" />
                                  <span className="font-mono">{dep.name}</span>
                                  {dep.replacement && (
                                    <>
                                      <span className="text-muted-foreground">&rarr;</span>
                                      <span className="font-mono text-success">{dep.replacement}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">None</p>
                          )}
                        </div>

                        {/* Package Managers */}
                        <div>
                          <h4 className="text-sm font-medium mb-2">Package Managers</h4>
                          <div className="flex flex-wrap gap-2">
                            {policy.allowed_package_managers.map((pm) => (
                              <Badge
                                key={pm}
                                variant={pm === policy.preferred_package_manager ? "default" : "secondary"}
                                className="capitalize"
                              >
                                {pm === policy.preferred_package_manager && <Check className="w-3 h-3 mr-1" />}
                                {pm}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === "rules" && <RulesTab rules={rules} policies={policies} createTrigger={ruleCreateTrigger} />}
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Policy</DialogTitle>
            <DialogDescription>Configure audit rules and generator defaults</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {selectedPolicy && (
              <PolicyForm
                initialData={selectedPolicy}
                onSubmit={handleEditSubmit}
                onCancel={() => setEditDialogOpen(false)}
                isSubmitting={isSubmitting}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>Define a new set of audit rules</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <PolicyForm
              key={createDefaults?.name ?? "empty"}
              initialData={createDefaults as Policy | undefined}
              onSubmit={handleCreateSubmit}
              onCancel={() => setCreateDialogOpen(false)}
              isSubmitting={isSubmitting}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{policyToDelete?.name}
              &rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
