"use client";

import { Button } from "@claudekit/ui/components/button";
import { Label } from "@claudekit/ui/components/label";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { useEffect, useMemo, useState } from "react";
import type { ColumnInfo } from "@/lib/types";
import { FieldEditor } from "./field-editors";

export function RowEditSheet({
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
  const formKey = useMemo(() => JSON.stringify(initialValues), [initialValues]);

  useEffect(() => {
    if (open) {
      setValues(initialValues ?? {});
    }
  }, [open, initialValues]);

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div key={formKey} className="space-y-4 py-4">
            {columns.map((col) => (
              <div key={col.column_name} className="space-y-2">
                <Label htmlFor={col.column_name} className="font-mono text-xs">
                  {col.column_name}
                  <span className="ml-2 text-muted-foreground font-normal">{col.data_type}</span>
                </Label>
                <FieldEditor
                  column={col}
                  value={values[col.column_name]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [col.column_name]: v }))}
                />
              </div>
            ))}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
