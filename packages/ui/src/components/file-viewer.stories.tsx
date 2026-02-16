import type { Meta, StoryObj } from "@storybook/react";
import type { FileContent } from "../types";
import { FileViewer } from "./file-viewer";

const meta: Meta<typeof FileViewer> = {
  title: "Components/FileViewer",
  component: FileViewer,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof FileViewer>;

const tsFile: FileContent = {
  path: "src/components/button.tsx",
  content: `import * as React from "react";
import { cn } from "../utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn("px-4 py-2 rounded-md", className)}
      {...props}
    />
  );
}`,
  language: "tsx",
  size: 384,
  isBinary: false,
};

export const TypeScriptFile: Story = {
  args: { file: tsFile },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <FileViewer {...args} />
    </div>
  ),
};

const markdownFile: FileContent = {
  path: "README.md",
  content:
    "# My Project\n\nA sample project with **bold** text.\n\n## Getting Started\n\n```bash\nnpm install\nnpm start\n```",
  language: "markdown",
  size: 120,
  isBinary: false,
};

export const MarkdownFile: Story = {
  args: { file: markdownFile },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <FileViewer {...args} />
    </div>
  ),
};

const binaryFile: FileContent = {
  path: "logo.png",
  content: "",
  language: "binary",
  size: 24576,
  isBinary: true,
};

export const BinaryFile: Story = {
  args: { file: binaryFile },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <FileViewer {...args} />
    </div>
  ),
};
