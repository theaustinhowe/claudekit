import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  addons: [],
  viteFinal(config) {
    config.plugins ??= [];
    config.plugins.push(tailwindcss());
    config.resolve ??= {};
    config.resolve.alias = {
      ...((config.resolve.alias as Record<string, string>) ?? {}),
      "next/link": path.resolve(__dirname, "mocks/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "mocks/next-navigation.ts"),
      "next/image": path.resolve(__dirname, "mocks/next-image.tsx"),
    };
    config.define = {
      ...config.define,
      "process.env": "{}",
    };
    return config;
  },
};

export default config;
