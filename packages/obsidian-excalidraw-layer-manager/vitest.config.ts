import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      exclude: [
        "build/**",
        "scripts/**",
        "src/index.ts",
        "src/adapter/excalidraw-types.ts",
        "src/commands/context.ts",
        "src/commands/index.ts",
        "src/model/entities.ts",
        "src/model/snapshot.ts",
        "src/runtime/intentExecution.ts",
      ],
      thresholds: {
        statements: 86,
        branches: 80,
        functions: 90,
        lines: 86,
      },
    },
  },
})
