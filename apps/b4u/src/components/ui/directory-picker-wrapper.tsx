"use client";

import type { BrowseResult } from "@devkit/ui";
import { DirectoryPicker } from "@devkit/ui/components/directory-picker";

async function browse(path: string, showHidden: boolean): Promise<BrowseResult> {
  const params = new URLSearchParams({ path });
  if (showHidden) params.set("showHidden", "true");
  const res = await fetch(`/api/fs/browse?${params}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to read directory");
  }
  const data = await res.json();
  const parentPath = data.path === "/" ? null : data.path.replace(/\/[^/]+\/?$/, "") || "/";
  return {
    currentPath: data.path,
    parentPath,
    entries: (data.entries as Array<{ name: string; type: string; path: string }>)
      .filter((e) => e.type === "directory")
      .filter((e) => showHidden || !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: e.path, hasChildren: true })),
  };
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
