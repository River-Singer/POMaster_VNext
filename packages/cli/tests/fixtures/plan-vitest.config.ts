import { defineConfig } from "vitest/config";
import base from "../../../../vitest.config.js";

// Plan integration must not run shared Studio generators while other slices write.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: ["packages/cli/tests/plan-runner.spec.ts", "packages/cli/tests/plan-commands.spec.ts"],
    minWorkers: 1,
    maxWorkers: 2,
  },
});
