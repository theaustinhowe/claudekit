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
            <TableHead className="h-8 px-3 text-xs">Column</TableHead>
            <TableHead className="h-8 px-3 text-xs">Type</TableHead>
            <TableHead className="h-8 px-3 text-xs">Nullable</TableHead>
            <TableHead className="h-8 px-3 text-xs">Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col) => (
            <TableRow key={col.column_name}>
              <TableCell className="py-1.5 px-3 text-xs font-mono font-medium">
                <span className="flex items-center gap-2">
                  {col.column_name}
                  {primaryKey.includes(col.column_name) && <KeyRound className="h-3.5 w-3.5 text-primary" />}
                </span>
              </TableCell>
              <TableCell className="py-1.5 px-3 text-xs">
                <Badge variant="secondary" className="font-mono text-xs">
                  {col.data_type}
                </Badge>
              </TableCell>
              <TableCell className="py-1.5 px-3 text-xs">{col.is_nullable === "YES" ? "Yes" : "No"}</TableCell>
              <TableCell className="py-1.5 px-3 text-xs font-mono text-muted-foreground">
                {col.column_default ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
