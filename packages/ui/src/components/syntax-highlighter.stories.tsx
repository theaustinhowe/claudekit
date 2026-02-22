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
    code: '{\n  "name": "@claudekit/ui",\n  "version": "0.1.0",\n  "private": true\n}',
    language: "json",
  },
};

export const Python: Story = {
  args: {
    code: `from dataclasses import dataclass
from typing import Optional

@dataclass
class User:
    name: str
    email: str
    age: Optional[int] = None

    def greet(self) -> str:
        return f"Hello, {self.name}!"

users = [User("Alice", "alice@example.com", 30)]
for user in users:
    print(user.greet())`,
    language: "python",
  },
};

export const Bash: Story = {
  args: {
    code: `#!/bin/bash
set -euo pipefail

# Build and deploy
echo "Building project..."
pnpm install --frozen-lockfile
pnpm build

if [ "$ENV" = "production" ]; then
  echo "Deploying to production..."
  pnpm deploy --prod
else
  echo "Deploying to staging..."
  pnpm deploy --staging
fi

echo "Done!"`,
    language: "bash",
  },
};

export const CSS: Story = {
  args: {
    code: `:root {
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
}

.card {
  border-radius: 0.5rem;
  background: hsl(var(--secondary));
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --primary: 210 40% 98%;
    --secondary: 217.2 32.6% 17.5%;
  }
}`,
    language: "css",
  },
};
