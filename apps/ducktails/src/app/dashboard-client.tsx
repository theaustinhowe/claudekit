"use client";

import { Button } from "@claudekit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DatabaseCard } from "@/components/database/database-card";
import { RefreshedAt } from "@/components/refreshed-at";
import { refreshSnapshots } from "@/lib/actions/databases";
import type { DatabaseInfo } from "@/lib/types";

export function DashboardClient({ databases, refreshedAt }: { databases: DatabaseInfo[]; refreshedAt: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      await refreshSnapshots();
      router.refresh();
    });
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Databases</h1>
          <p className="text-muted-foreground">Browse and manage all ClaudeKit databases</p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshedAt timestamp={refreshedAt} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
                  <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {databases.map((db) => (
          <DatabaseCard key={db.id} database={db} />
        ))}
      </div>
    </div>
  );
}
