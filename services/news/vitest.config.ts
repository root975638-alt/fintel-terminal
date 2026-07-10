import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude dist-test (compiled node:test fixtures) so vitest doesn't double-run them.
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-test/**"],
  },
});
