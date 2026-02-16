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

export const WithCodeBlocks: Story = {
  args: {
    content: `## Code Examples

Here is a TypeScript function:

\`\`\`typescript
async function fetchData(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`HTTP error: \${response.status}\`);
  }
  return response;
}
\`\`\`

And a shell command:

\`\`\`bash
npm install @devkit/ui --save
\`\`\`
`,
  },
};

export const WithTable: Story = {
  args: {
    content: `## Comparison Table

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Users | 5 | 50 | Unlimited |
| Storage | 1 GB | 100 GB | 1 TB |
| Support | Email | Priority | Dedicated |
| API Access | No | Yes | Yes |
`,
  },
};

export const WithLinks: Story = {
  args: {
    content: `## Useful Links

Visit the [documentation](https://example.com/docs) for more details.

- [Getting Started](https://example.com/getting-started)
- [API Reference](https://example.com/api)
- [Changelog](https://example.com/changelog)

For questions, email [support@example.com](mailto:support@example.com).
`,
  },
};
