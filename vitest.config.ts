import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts", "tests/rls/**/*.test.ts", "tests/pg/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
