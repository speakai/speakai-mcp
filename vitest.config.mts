import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 15_000,
    server: {
      deps: {
        inline: ["@speakai/shared"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.d.ts", "src/cli/**"],
      thresholds: {
        lines: 65,
        functions: 70,
        branches: 50,
        statements: 65,
      },
    },
  },
});
