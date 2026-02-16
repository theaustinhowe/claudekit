import type { Meta, StoryObj } from "@storybook/react";
import { DiffViewer } from "./diff-viewer";

const meta: Meta<typeof DiffViewer> = {
  title: "Components/DiffViewer",
  component: DiffViewer,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DiffViewer>;

const samplePatch = `diff --git a/src/utils.ts b/src/utils.ts
index abc1234..def5678 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,7 +1,8 @@
-import { clsx } from "clsx";
+import { clsx, type ClassValue } from "clsx";
 import { twMerge } from "tailwind-merge";

-export function cn(...inputs: string[]) {
+export function cn(...inputs: ClassValue[]) {
   return twMerge(clsx(inputs));
 }
+
+export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);`;

export const Default: Story = {
  args: {
    patch: samplePatch,
  },
  render: (args) => (
    <div className="w-full max-w-2xl rounded-md border overflow-hidden">
      <DiffViewer {...args} />
    </div>
  ),
};

export const Truncated: Story = {
  args: {
    patch: samplePatch,
    maxLines: 5,
  },
  render: (args) => (
    <div className="w-full max-w-2xl rounded-md border overflow-hidden">
      <DiffViewer {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    patch: "",
  },
  render: (args) => (
    <div className="w-full max-w-2xl rounded-md border overflow-hidden">
      <DiffViewer {...args} />
    </div>
  ),
};
