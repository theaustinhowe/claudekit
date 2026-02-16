import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { BrowseResult } from "../types";
import { DirectoryPicker } from "./directory-picker";

const meta: Meta<typeof DirectoryPicker> = {
  title: "Components/DirectoryPicker",
  component: DirectoryPicker,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DirectoryPicker>;

const mockBrowse = async (path: string): Promise<BrowseResult> => {
  // Simulate a directory listing
  await new Promise((resolve) => setTimeout(resolve, 300));
  const resolved = path === "~" ? "/Users/demo" : path;
  return {
    currentPath: resolved,
    parentPath: resolved === "/" ? null : resolved.split("/").slice(0, -1).join("/") || "/",
    entries: [
      { name: "Documents", path: `${resolved}/Documents`, hasChildren: true },
      { name: "Projects", path: `${resolved}/Projects`, hasChildren: true },
      { name: "Desktop", path: `${resolved}/Desktop`, hasChildren: false },
    ],
  };
};

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("~/Projects");
    return (
      <div className="w-[400px]">
        <DirectoryPicker value={value} onChange={setValue} browse={mockBrowse} />
      </div>
    );
  },
};

export const WithInitialPath: Story = {
  render: () => {
    const [value, setValue] = useState("/Users/demo/Documents/work");
    return (
      <div className="w-[400px]">
        <DirectoryPicker value={value} onChange={setValue} browse={mockBrowse} />
      </div>
    );
  },
};

export const WithPlaceholder: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <div className="w-[400px]">
        <DirectoryPicker value={value} onChange={setValue} browse={mockBrowse} placeholder="Choose a directory..." />
      </div>
    );
  },
};
