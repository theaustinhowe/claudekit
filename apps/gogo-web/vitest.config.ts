import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@devkit/gogo-shared": path.resolve(__dirname, "../../packages/gogo-shared/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "hooks/**/*.ts", "components/**/*.tsx", "contexts/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
      thresholds: {
        statements: 57,
        branches: 50,
        functions: 50,
        lines: 58,
      },
    },
  },
});
