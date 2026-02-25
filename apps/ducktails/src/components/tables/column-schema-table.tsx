"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@claudekit/ui/components/table";
import { KeyRound } from "lucide-react";
import type { ColumnInfo } from "@/lib/types";

export function ColumnSchemaTable({ columns, primaryKey }: { columns: ColumnInfo[]; primaryKey: string[] }) {
  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Nullable</TableHead>
            <TableHead>Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col) => (
            <TableRow key={col.column_name}>
              <TableCell className="font-mono font-medium">
                <span className="flex items-center gap-2">
                  {col.column_name}
                  {primaryKey.includes(col.column_name) && <KeyRound className="h-3.5 w-3.5 text-primary" />}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-xs">
                  {col.data_type}
                </Badge>
              </TableCell>
              <TableCell>{col.is_nullable === "YES" ? "Yes" : "No"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{col.column_default ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
