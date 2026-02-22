import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/types.ts",
        "src/**/layout.tsx",
        "src/**/page.tsx",
        "src/**/loading.tsx",
        "src/**/error.tsx",
        "src/**/not-found.tsx",
        "src/lib/db/migrations/**",
        "src/lib/db/seed.ts",
      ],
    },
  },
});
