import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Isolate SK tests from the root config's shared Studio generation hooks.
export default defineConfig({
  resolve: { alias: [
    { find: "@pomaster/kernel", replacement: fileURLToPath(new URL("../../kernel/src/index.ts", import.meta.url)) },
    { find: "@pomaster/schemas", replacement: fileURLToPath(new URL("../../schemas/src/index.ts", import.meta.url)) },
    { find: "@pomaster/gauntlet-lite", replacement: fileURLToPath(new URL("../../gauntlet-lite/src/index.ts", import.meta.url)) },
  ] },
  test: { environment: "node", include: ["packages/cli/tests/skill-recommendations.spec.ts"], minWorkers: 1, maxWorkers: 1, testTimeout: 15000 },
});
