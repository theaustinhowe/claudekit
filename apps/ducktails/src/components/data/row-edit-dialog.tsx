"use client";

import { Button } from "@claudekit/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Switch } from "@claudekit/ui/components/switch";
import { useState } from "react";
import type { ColumnInfo } from "@/lib/types";

function isBooleanType(dataType: string): boolean {
  return dataType.toUpperCase() === "BOOLEAN";
}

function isNumericType(dataType: string): boolean {
  const upper = dataType.toUpperCase();
  return [
    "INTEGER",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "FLOAT",
    "DOUBLE",
    "DECIMAL",
    "HUGEINT",
    "UBIGINT",
    "UINTEGER",
    "USMALLINT",
    "UTINYINT",
  ].some((t) => upper.includes(t));
}

export function RowEditDialog({
  open,
  onOpenChange,
  columns,
  initialValues,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnInfo[];
  initialValues?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  title: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues ?? {});
  const [saving, setSaving] = useState(false);

  // Reset values when dialog opens with new initialValues
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setValues(initialValues ?? {});
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {columns.map((col) => (
            <div key={col.column_name} className="space-y-2">
              <Label htmlFor={col.column_name} className="font-mono text-xs">
                {col.column_name}
                <span className="ml-2 text-muted-foreground font-normal">{col.data_type}</span>
              </Label>
              {isBooleanType(col.data_type) ? (
                <Switch
                  id={col.column_name}
                  checked={!!values[col.column_name]}
                  onCheckedChange={(checked) => setValues((prev) => ({ ...prev, [col.column_name]: checked }))}
                />
              ) : (
                <Input
                  id={col.column_name}
                  type={isNumericType(col.data_type) ? "number" : "text"}
                  value={values[col.column_name] != null ? String(values[col.column_name]) : ""}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [col.column_name]:
                        e.target.value === ""
                          ? null
                          : isNumericType(col.data_type)
                            ? Number(e.target.value)
                            : e.target.value,
                    }))
                  }
                  placeholder={col.is_nullable === "YES" ? "NULL" : ""}
                  className="font-mono text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
