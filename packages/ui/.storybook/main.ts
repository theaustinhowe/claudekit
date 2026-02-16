import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  addons: [],
  viteFinal(config) {
    config.plugins ??= [];
    config.plugins.push(tailwindcss());
    config.define = {
      ...config.define,
      "process.env": "{}",
    };
    return config;
  },
};

export default config;
