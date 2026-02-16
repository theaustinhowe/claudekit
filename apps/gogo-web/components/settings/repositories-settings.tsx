"use client";

import { GitBranch, Plus } from "lucide-react";
import Link from "next/link";
import { RepoSettings } from "@/components/repo/repo-settings";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { useRepositories } from "@/hooks/use-repositories";

export function RepositoriesSettings() {
  const { data: repositories = [], isLoading } = useRepositories();

  // Sort repositories alphabetically by display name
  const sortedRepos = [...repositories].sort((a, b) => {
    const nameA = a.displayName || `${a.owner}/${a.name}`;
    const nameB = b.displayName || `${b.owner}/${b.name}`;
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Repository Settings</h2>
        </div>
        <Button size="sm" asChild>
          <Link href="/setup">
            <Plus className="mr-2 h-4 w-4" />
            Add Repository
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure trigger labels, branch patterns, polling, and agent settings for each repository
      </p>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : sortedRepos.length > 0 ? (
        <div className="space-y-3">
          {sortedRepos.map((repo) => (
            <RepoSettings key={repo.id} repository={repo} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No repositories connected yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Use the Setup Wizard to add a repository.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
