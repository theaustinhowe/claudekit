import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownRenderer } from "./markdown-renderer";

const meta: Meta<typeof MarkdownRenderer> = {
  title: "Components/MarkdownRenderer",
  component: MarkdownRenderer,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof MarkdownRenderer>;

const sampleMarkdown = `# Hello World

This is a **bold** and *italic* text example.

## Features

- Item one
- Item two
- Item three

### Code Example

\`\`\`typescript
function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

Inline \`code\` works too.

| Column 1 | Column 2 |
|-----------|----------|
| Cell 1    | Cell 2   |
| Cell 3    | Cell 4   |

> This is a blockquote.
`;

export const Default: Story = {
  args: {
    content: sampleMarkdown,
  },
};

export const Simple: Story = {
  args: {
    content: "A simple paragraph with **bold** and *italic* text.",
  },
};
