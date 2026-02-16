"use client";

import type { BrowseResult } from "@devkit/ui";
import { DirectoryPicker as BaseDirectoryPicker } from "@devkit/ui/components/directory-picker";
import { useCallback } from "react";

interface GadgetDirectoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

async function fetchBrowse(path: string, showHidden: boolean): Promise<BrowseResult> {
  const params = new URLSearchParams({ path });
  if (showHidden) params.set("showHidden", "true");
  const res = await fetch(`/api/fs/browse?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to browse");
  }
  return res.json();
}

export function DirectoryPicker({ value, onChange, placeholder, className }: GadgetDirectoryPickerProps) {
  const browse = useCallback((path: string, showHidden: boolean) => fetchBrowse(path, showHidden), []);

  return (
    <BaseDirectoryPicker
      value={value}
      onChange={onChange}
      browse={browse}
      placeholder={placeholder}
      className={className}
    />
  );
}
