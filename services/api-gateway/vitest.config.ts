import { defineConfig } from "vitest/config";

// This package's logic is pure type/interface definitions with no branching logic
// to unit test directly — it is exercised end-to-end by the CLI/API smoke tests
// (see docs/031_TESTING.md). passWithNoTests avoids a false-negative CI failure
// while still running vitest so a future test file here is picked up automatically.
export default defineConfig({
  test: { passWithNoTests: true },
});
