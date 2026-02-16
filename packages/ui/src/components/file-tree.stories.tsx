import type { Meta, StoryObj } from "@storybook/react";
import type { FileTreeEntry } from "../types";
import { FileTree } from "./file-tree";

const meta: Meta<typeof FileTree> = {
  title: "Components/FileTree",
  component: FileTree,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof FileTree>;

const rootEntries: FileTreeEntry[] = [
  { name: "src", path: "src", type: "directory" },
  { name: "package.json", path: "package.json", type: "file" },
  { name: "tsconfig.json", path: "tsconfig.json", type: "file" },
  { name: "README.md", path: "README.md", type: "file" },
];

const childrenMap: Record<string, FileTreeEntry[]> = {
  src: [
    { name: "components", path: "src/components", type: "directory" },
    { name: "utils.ts", path: "src/utils.ts", type: "file" },
    { name: "index.ts", path: "src/index.ts", type: "file" },
  ],
  "src/components": [
    { name: "button.tsx", path: "src/components/button.tsx", type: "file" },
    { name: "card.tsx", path: "src/components/card.tsx", type: "file" },
  ],
};

const mockFetchChildren = async (dirPath: string): Promise<FileTreeEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return childrenMap[dirPath] || [];
};

export const Default: Story = {
  render: () => (
    <div className="w-[300px] h-[400px] border rounded-md">
      <FileTree
        rootEntries={rootEntries}
        currentPath="src/utils.ts"
        onSelect={(entry) => console.log("Selected:", entry.path)}
        fetchChildren={mockFetchChildren}
      />
    </div>
  ),
};
