"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Database, HardDrive, Table2 } from "lucide-react";
import Link from "next/link";
import type { DatabaseInfo } from "@/lib/types";
import { formatFileSize } from "@/lib/utils";
import { DatabaseStatusBadge } from "./database-status-badge";

export function DatabaseCard({ database }: { database: DatabaseInfo }) {
  return (
    <Link href={`/${database.id}/tables`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              {database.name}
            </CardTitle>
            <DatabaseStatusBadge status={database.status} />
          </div>
          <p className="text-xs text-muted-foreground">{database.app}</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Table2 className="h-3.5 w-3.5" />
              {database.tableCount} tables
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              {formatFileSize(database.fileSize)}
            </span>
          </div>
          {database.error && <p className="text-xs text-destructive mt-2 truncate">{database.error}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}
