"use client";

import {
  AlertTriangle,
  Archive,
  BookOpen,
  ExternalLink,
  Eye,
  GitFork,
  Github,
  Globe,
  KanbanSquare,
  Loader2,
  Lock,
  MessageSquare,
  Settings,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Switch } from "@devkit/ui/components/switch";
import type { GitHubRepoSettings } from "@/lib/services/github-client";
import { timeAgo } from "@/lib/utils";

interface GitHubTabContentProps {
  repoId: string;
  gitRemote: string | null;
  hasGitHubPat: boolean;
}

export function GitHubTabContent({ repoId, gitRemote, hasGitHubPat }: GitHubTabContentProps) {
  const [settings, setSettings] = useState<GitHubRepoSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { getGitHubRepoSettings } = await import("@/lib/actions/repos");
      const result = await getGitHubRepoSettings(repoId);
      setSettings(result);
    } catch {
      toast.error("Failed to load GitHub settings");
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (gitRemote && hasGitHubPat) {
      fetchSettings();
    }
  }, [gitRemote, hasGitHubPat, fetchSettings]);

  const updateField = (key: string, value: unknown) => {
    setDirtyFields((prev) => ({ ...prev, [key]: value }));
  };

  const getField = <T,>(key: keyof GitHubRepoSettings): T => {
    if (key in dirtyFields) return dirtyFields[key] as T;
    if (!settings) return undefined as T;
    return settings[key] as T;
  };

  const handleSave = async () => {
    if (Object.keys(dirtyFields).length === 0) return;
    setSaving(true);
    try {
      const { updateGitHubRepoSettings } = await import("@/lib/actions/repos");
      const result = await updateGitHubRepoSettings(repoId, dirtyFields);
      if (result.success) {
        toast.success("Settings updated");
        setDirtyFields({});
        await fetchSettings();
      } else {
        toast.error(result.error || "Failed to update settings");
      }
    } catch {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (!gitRemote) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Github className="w-12 h-12 text-muted-foreground/40" />
          <div className="text-center space-y-1">
            <p className="font-medium">No GitHub remote configured</p>
            <p className="text-sm text-muted-foreground">
              Set up a GitHub remote from the Overview tab to get started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasGitHubPat) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Settings className="w-12 h-12 text-muted-foreground/40" />
          <div className="text-center space-y-1">
            <p className="font-medium">GitHub token required</p>
            <p className="text-sm text-muted-foreground">
              Configure a GitHub personal access token to manage settings.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/settings">
              <Settings className="w-4 h-4 mr-1.5" />
              Configure Token
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading GitHub settings...
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <AlertTriangle className="w-12 h-12 text-muted-foreground/40" />
          <div className="text-center space-y-1">
            <p className="font-medium">Could not load repository settings</p>
            <p className="text-sm text-muted-foreground">
              The repository may not exist or your token may lack permissions.
            </p>
          </div>
          <Button variant="outline" onClick={fetchSettings}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isDirty = Object.keys(dirtyFields).length > 0;

  return (
    <div className="space-y-6">
      {/* Repository Info (read-only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Repository Info</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <a href={settings.html_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1.5" />
                View on GitHub
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats row */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="font-medium">{settings.stargazers_count.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">stars</span>
            </div>
            <div className="flex items-center gap-2">
              <GitFork className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{settings.forks_count.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">forks</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{settings.watchers_count.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">watchers</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{settings.open_issues_count.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">open issues</span>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {settings.language && (
              <div>
                <p className="text-sm text-muted-foreground">Language</p>
                <p className="font-medium">{settings.language}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Size</p>
              <p className="font-medium">{(settings.size / 1024).toFixed(1)} MB</p>
            </div>
            {settings.license && (
              <div>
                <p className="text-sm text-muted-foreground">License</p>
                <p className="font-medium">{settings.license.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{timeAgo(settings.created_at)}</p>
            </div>
            {settings.pushed_at && (
              <div>
                <p className="text-sm text-muted-foreground">Last pushed</p>
                <p className="font-medium">{timeAgo(settings.pushed_at)}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Visibility</p>
              <p className="font-medium flex items-center gap-1.5">
                {settings.private ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                {settings.visibility}
              </p>
            </div>
          </div>

          {/* Topics */}
          {settings.topics.length > 0 && (
            <div className="pt-2">
              <p className="text-sm text-muted-foreground mb-2">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.topics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="text-xs">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings (editable) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Manage repository settings directly from Gadget</CardDescription>
            </div>
            <Button onClick={handleSave} disabled={!isDirty || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* General */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">General</h3>
            <div className="space-y-2">
              <Label htmlFor="gh-description">Description</Label>
              <Input
                id="gh-description"
                value={getField<string>("description") ?? ""}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Repository description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-homepage">Homepage</Label>
              <Input
                id="gh-homepage"
                value={getField<string>("homepage") ?? ""}
                onChange={(e) => updateField("homepage", e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Private</Label>
                <p className="text-sm text-muted-foreground">Only visible to you and collaborators</p>
              </div>
              <Switch
                checked={getField<boolean>("private")}
                onCheckedChange={(checked) => updateField("private", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5">
                  <Archive className="w-4 h-4" />
                  Archived
                </Label>
                <p className="text-sm text-muted-foreground text-warning">
                  Archived repos are read-only. This action can be reversed.
                </p>
              </div>
              <Switch
                checked={getField<boolean>("archived")}
                onCheckedChange={(checked) => updateField("archived", checked)}
              />
            </div>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Features</h3>
            {(
              [
                { key: "has_issues", label: "Issues", icon: AlertTriangle, desc: "Track bugs and feature requests" },
                {
                  key: "has_projects",
                  label: "Projects",
                  icon: KanbanSquare,
                  desc: "Organize work with project boards",
                },
                { key: "has_wiki", label: "Wiki", icon: BookOpen, desc: "Host documentation" },
                { key: "has_discussions", label: "Discussions", icon: MessageSquare, desc: "Community conversations" },
                {
                  key: "is_template",
                  label: "Template",
                  icon: Github,
                  desc: "Allow this repo to be used as a template",
                },
              ] as const
            ).map(({ key, label, icon: Icon, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5">
                    <Icon className="w-4 h-4" />
                    {label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={getField<boolean>(key)} onCheckedChange={(checked) => updateField(key, checked)} />
              </div>
            ))}
          </div>

          {/* Merge Strategies */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Merge Strategies</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow squash merging</Label>
                <p className="text-sm text-muted-foreground">Combine commits into a single commit</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_squash_merge")}
                onCheckedChange={(checked) => updateField("allow_squash_merge", checked)}
              />
            </div>
            {getField<boolean>("allow_squash_merge") && (
              <div className="grid sm:grid-cols-2 gap-4 pl-6 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Squash commit title</Label>
                  <Select
                    value={getField<string>("squash_merge_commit_title") ?? "PR_TITLE"}
                    onValueChange={(v) => updateField("squash_merge_commit_title", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PR_TITLE">PR Title</SelectItem>
                      <SelectItem value="COMMIT_OR_PR_TITLE">Commit or PR Title</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Squash commit message</Label>
                  <Select
                    value={getField<string>("squash_merge_commit_message") ?? "COMMIT_MESSAGES"}
                    onValueChange={(v) => updateField("squash_merge_commit_message", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PR_BODY">PR Body</SelectItem>
                      <SelectItem value="COMMIT_MESSAGES">Commit Messages</SelectItem>
                      <SelectItem value="BLANK">Blank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow merge commits</Label>
                <p className="text-sm text-muted-foreground">Add all commits to the base branch</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_merge_commit")}
                onCheckedChange={(checked) => updateField("allow_merge_commit", checked)}
              />
            </div>
            {getField<boolean>("allow_merge_commit") && (
              <div className="grid sm:grid-cols-2 gap-4 pl-6 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Merge commit title</Label>
                  <Select
                    value={getField<string>("merge_commit_title") ?? "MERGE_MESSAGE"}
                    onValueChange={(v) => updateField("merge_commit_title", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PR_TITLE">PR Title</SelectItem>
                      <SelectItem value="MERGE_MESSAGE">Merge Message</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Merge commit message</Label>
                  <Select
                    value={getField<string>("merge_commit_message") ?? "PR_TITLE"}
                    onValueChange={(v) => updateField("merge_commit_message", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PR_BODY">PR Body</SelectItem>
                      <SelectItem value="PR_TITLE">PR Title</SelectItem>
                      <SelectItem value="BLANK">Blank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow rebase merging</Label>
                <p className="text-sm text-muted-foreground">Rebase commits onto the base branch</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_rebase_merge")}
                onCheckedChange={(checked) => updateField("allow_rebase_merge", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow auto-merge</Label>
                <p className="text-sm text-muted-foreground">Automatically merge when requirements are met</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_auto_merge")}
                onCheckedChange={(checked) => updateField("allow_auto_merge", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow branch updates</Label>
                <p className="text-sm text-muted-foreground">Suggest updating PR branches</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_update_branch")}
                onCheckedChange={(checked) => updateField("allow_update_branch", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Delete branch on merge</Label>
                <p className="text-sm text-muted-foreground">Auto-delete head branches after merge</p>
              </div>
              <Switch
                checked={getField<boolean>("delete_branch_on_merge")}
                onCheckedChange={(checked) => updateField("delete_branch_on_merge", checked)}
              />
            </div>
          </div>

          {/* Security */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Security</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow forking</Label>
                <p className="text-sm text-muted-foreground">Allow forks of this private repository</p>
              </div>
              <Switch
                checked={getField<boolean>("allow_forking")}
                onCheckedChange={(checked) => updateField("allow_forking", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require commit sign-off</Label>
                <p className="text-sm text-muted-foreground">Require contributors to sign off on web commits</p>
              </div>
              <Switch
                checked={getField<boolean>("web_commit_signoff_required")}
                onCheckedChange={(checked) => updateField("web_commit_signoff_required", checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
