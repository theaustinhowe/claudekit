"use client";

import type { BrowseResult } from "@devkit/ui";
import { DirectoryPicker } from "@devkit/ui/components/directory-picker";

async function browse(path: string, showHidden: boolean): Promise<BrowseResult> {
  const params = new URLSearchParams({ path, showHidden: String(showHidden) });
  const res = await fetch(`/api/fs/browse?${params}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to read directory");
  }
  return res.json();
}

interface B4UDirectoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function B4UDirectoryPicker({ value, onChange, className }: B4UDirectoryPickerProps) {
  return (
    <DirectoryPicker
      value={value}
      onChange={onChange}
      browse={browse}
      placeholder="~/path/to/project"
      className={className}
    />
  );
}
