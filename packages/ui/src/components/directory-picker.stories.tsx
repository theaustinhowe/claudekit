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
  return {
    currentPath: path === "~" ? "/Users/demo" : path,
    parentPath: path === "/" ? "/" : path.split("/").slice(0, -1).join("/") || "/",
    entries: [
      { name: "Documents", path: `${path === "~" ? "/Users/demo" : path}/Documents`, hasChildren: true },
      { name: "Projects", path: `${path === "~" ? "/Users/demo" : path}/Projects`, hasChildren: true },
      { name: "Desktop", path: `${path === "~" ? "/Users/demo" : path}/Desktop`, hasChildren: false },
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
