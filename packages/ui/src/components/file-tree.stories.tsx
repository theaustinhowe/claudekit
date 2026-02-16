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

const deepRootEntries: FileTreeEntry[] = [
  { name: "src", path: "src", type: "directory" },
  { name: "tests", path: "tests", type: "directory" },
  { name: "package.json", path: "package.json", type: "file" },
];

const deepChildrenMap: Record<string, FileTreeEntry[]> = {
  src: [
    { name: "components", path: "src/components", type: "directory" },
    { name: "hooks", path: "src/hooks", type: "directory" },
    { name: "index.ts", path: "src/index.ts", type: "file" },
  ],
  "src/components": [
    { name: "ui", path: "src/components/ui", type: "directory" },
    { name: "layout", path: "src/components/layout", type: "directory" },
  ],
  "src/components/ui": [
    { name: "button.tsx", path: "src/components/ui/button.tsx", type: "file" },
    { name: "input.tsx", path: "src/components/ui/input.tsx", type: "file" },
    { name: "dialog.tsx", path: "src/components/ui/dialog.tsx", type: "file" },
  ],
  "src/components/layout": [
    { name: "header.tsx", path: "src/components/layout/header.tsx", type: "file" },
    { name: "sidebar.tsx", path: "src/components/layout/sidebar.tsx", type: "file" },
  ],
  "src/hooks": [
    { name: "use-theme.ts", path: "src/hooks/use-theme.ts", type: "file" },
    { name: "use-media.ts", path: "src/hooks/use-media.ts", type: "file" },
  ],
  tests: [
    { name: "button.test.tsx", path: "tests/button.test.tsx", type: "file" },
    { name: "input.test.tsx", path: "tests/input.test.tsx", type: "file" },
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

export const DeepNesting: Story = {
  render: () => {
    const fetchDeep = async (dirPath: string): Promise<FileTreeEntry[]> => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return deepChildrenMap[dirPath] || [];
    };
    return (
      <div className="w-[300px] h-[500px] border rounded-md">
        <FileTree
          rootEntries={deepRootEntries}
          currentPath=""
          onSelect={(entry) => console.log("Selected:", entry.path)}
          fetchChildren={fetchDeep}
        />
      </div>
    );
  },
};

export const WithCurrentFile: Story = {
  render: () => {
    const fetchDeep = async (dirPath: string): Promise<FileTreeEntry[]> => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return deepChildrenMap[dirPath] || [];
    };
    return (
      <div className="w-[300px] h-[500px] border rounded-md">
        <FileTree
          rootEntries={deepRootEntries}
          currentPath="src/components/ui/button.tsx"
          onSelect={(entry) => console.log("Selected:", entry.path)}
          fetchChildren={fetchDeep}
        />
      </div>
    );
  },
};
