import type { Meta, StoryObj } from "@storybook/react";
import { SyntaxHighlighter } from "./syntax-highlighter";

// SyntaxHighlighter depends on next-themes for resolvedTheme. Provide a mock.
function ThemeDecorator(Story: React.ComponentType) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Story />
    </div>
  );
}

const meta: Meta<typeof SyntaxHighlighter> = {
  title: "Components/SyntaxHighlighter",
  component: SyntaxHighlighter,
  tags: ["autodocs"],
  decorators: [ThemeDecorator],
};
export default meta;

type Story = StoryObj<typeof SyntaxHighlighter>;

const tsCode = `import { useState } from "react";

interface Props {
  name: string;
  count?: number;
}

export function Counter({ name, count = 0 }: Props) {
  const [value, setValue] = useState(count);
  return (
    <button onClick={() => setValue(v => v + 1)}>
      {name}: {value}
    </button>
  );
}`;

export const TypeScript: Story = {
  args: {
    code: tsCode,
    language: "tsx",
  },
};

export const WithoutLineNumbers: Story = {
  args: {
    code: tsCode,
    language: "tsx",
    showLineNumbers: false,
  },
};

export const JsonExample: Story = {
  args: {
    code: '{\n  "name": "@devkit/ui",\n  "version": "0.1.0",\n  "private": true\n}',
    language: "json",
  },
};
