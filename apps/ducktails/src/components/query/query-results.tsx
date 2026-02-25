"use client";

import { Card, CardContent } from "@claudekit/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@claudekit/ui/components/table";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { QueryResult } from "@/lib/types";
import { formatCellValue } from "@/lib/utils";

export function QueryResults({ result }: { result: QueryResult }) {
  if (result.error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">Query Error</p>
              <p className="text-sm text-muted-foreground mt-1 font-mono whitespace-pre-wrap">{result.error}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{result.executionTimeMs}ms</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} in {result.executionTimeMs}ms
        </span>
      </div>

      {result.columns.length > 0 && (
        <div className="border rounded-lg overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                {result.columns.map((col) => (
                  <TableHead key={col} className="whitespace-nowrap font-mono text-xs">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: query result rows
                <TableRow key={idx}>
                  {result.columns.map((col) => (
                    <TableCell key={col} className="max-w-[300px] truncate font-mono text-xs">
                      {formatCellValue(row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
