import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    reporters: "default"
  },
  resolve: {
    alias: {
      "@shared": "/home/claude/dss/shared"
    }
  }
});
