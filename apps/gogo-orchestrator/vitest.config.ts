import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/**/types.ts", "src/db/migrations/**", "src/db/seed.ts"],
      thresholds: {
        statements: 35,
        branches: 30,
        functions: 40,
        lines: 35,
      },
    },
  },
});
