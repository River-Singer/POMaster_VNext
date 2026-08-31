/**
 * ci-workflow-contract.spec.ts —— CI workflow 双 OS 腿形态契约（P32b · gaps B3
 * 闭合的机器可判半边：Windows 腿存在 + 五步同形 + Windows 安全调用形态）。
 *
 * 钉住的契约（.github/workflows/ci.yml）：
 * - matrix 双腿 ubuntu-latest + windows-latest（B3：此前 CI 只在 ubuntu 验证，
 *   PATH 双引号吞段等 Windows 特有坑只在本机踩过、CI 不设防）；
 * - fail-fast: false（单腿红不取消另一腿——Windows 特有失败不得掩盖 ubuntu 主信号）；
 * - 五步 run 命令恒为 `corepack pnpm <install|build|test|ratchet|lint>`：统一经
 *   corepack 前缀（不依赖 runner PATH 上的裸 pnpm/npx——Windows pwsh 与 ubuntu bash
 *   双 shell 同形；build-all.mjs/ratchet.mjs 内部再以 process.execPath 直连子进程，
 *   shell:false + 参数数组，CI 与本机行为一致）；
 * - COREPACK_ENABLE_DOWNLOAD_PROMPT=0（job 级 env：免交互下载确认，Windows 同需）；
 * - node-version 22（engines >=22 同源）+ actions 版本锚（checkout@v4/setup-node@v4）。
 *
 * 判读面：js-yaml 解析（devDependency，tests 面专用——CLI 运行时零 yaml 依赖，
 * eval-carrier.spec 同款纪律）。本 spec 是仓库契约测试：改 ci.yml 步骤形态须
 * 同步改这里（契约漂移即红）。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = join(repoRoot, ".github", "workflows", "ci.yml");

type UnknownRecord = Record<string, unknown>;

/** 五步命令闭包（顺序敏感：install→build→test→ratchet→lint）。 */
const EXPECTED_STEP_COMMANDS = [
  "corepack pnpm install",
  "corepack pnpm build",
  "corepack pnpm test",
  "corepack pnpm ratchet",
  "corepack pnpm lint",
];

const EXPECTED_RUNNERS = ["ubuntu-latest", "windows-latest"];

function loadWorkflow(): UnknownRecord {
  const raw = readFileSync(workflowPath, "utf8");
  const doc: unknown = yaml.load(raw);
  expect(doc, "ci.yml 应解析为顶层映射").toBeTypeOf("object");
  expect(doc).not.toBeNull();
  return doc as UnknownRecord;
}

function runCommandsOf(job: UnknownRecord): string[] {
  const steps = job.steps;
  expect(steps, "job.steps 应存在").toBeTypeOf("object");
  expect(Array.isArray(steps)).toBe(true);
  const runs: string[] = [];
  for (const step of steps as UnknownRecord[]) {
    if (typeof step.run === "string") runs.push(step.run.trim());
  }
  return runs;
}

describe("CI workflow 双 OS 腿形态契约（P32b · B3 闭合）", () => {
  it("matrix 含 ubuntu-latest + windows-latest 双腿；fail-fast=false（单腿红不取消另一腿）", () => {
    const doc = loadWorkflow();
    const jobs = doc.jobs as UnknownRecord;
    const ci = jobs.ci as UnknownRecord;
    expect(ci, "jobs.ci 应存在").toBeTypeOf("object");
    expect(ci["runs-on"]).toBe("${{ matrix.os }}");
    const strategy = ci.strategy as UnknownRecord;
    expect(strategy, "strategy 段应存在").toBeTypeOf("object");
    // fail-fast 缺省为 true（GitHub Actions 语义）——必须显式 false，缺省即红。
    expect(strategy["fail-fast"]).toBe(false);
    const matrix = strategy.matrix as UnknownRecord;
    expect(Array.isArray(matrix.os)).toBe(true);
    expect(matrix.os).toEqual(EXPECTED_RUNNERS);
  });

  it("五步命令同形且顺序恒定：install→build→test→ratchet→lint，全部 corepack pnpm 前缀", () => {
    const doc = loadWorkflow();
    const ci = (doc.jobs as UnknownRecord).ci as UnknownRecord;
    const runs = runCommandsOf(ci);
    expect(runs).toEqual(EXPECTED_STEP_COMMANDS);
    for (const run of runs) {
      expect(run.startsWith("corepack pnpm "), `run 步应走 corepack pnpm 前缀: ${run}`).toBe(
        true,
      );
    }
  });

  it("Windows 安全调用形态：run 步零 shell 专属语法（无 && 链 / 无裸 pnpm/npx / 无行内 env 注入）", () => {
    const doc = loadWorkflow();
    const ci = (doc.jobs as UnknownRecord).ci as UnknownRecord;
    for (const run of runCommandsOf(ci)) {
      expect(run.includes("&&"), `run 步禁 shell && 链（pwsh/bash 双 shell 同形）: ${run}`).toBe(
        false,
      );
      expect(/^pnpm |^npx /.test(run), `run 步禁裸 pnpm/npx（runner PATH 不可依赖）: ${run}`).toBe(
        false,
      );
      expect(/^[A-Z_]+=/.test(run), `run 步禁行内 env 前缀（bash 语法 pwsh 不认）: ${run}`).toBe(
        false,
      );
    }
  });

  it("corepack 免交互 + node 22 + actions 版本锚：COREPACK_ENABLE_DOWNLOAD_PROMPT=0 / checkout@v4 / setup-node@v4", () => {
    const doc = loadWorkflow();
    const ci = (doc.jobs as UnknownRecord).ci as UnknownRecord;
    const env = ci.env as UnknownRecord;
    expect(env["COREPACK_ENABLE_DOWNLOAD_PROMPT"]).toBe("0");
    const steps = ci.steps as UnknownRecord[];
    const checkout = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout"));
    expect(checkout?.uses).toBe("actions/checkout@v4");
    const setupNode = steps.find(
      (step) => typeof step.uses === "string" && step.uses.startsWith("actions/setup-node"),
    );
    expect(setupNode?.uses).toBe("actions/setup-node@v4");
    const withBlock = setupNode?.["with"] as UnknownRecord | undefined;
    expect(withBlock, "setup-node 应带 with.node-version").toBeTypeOf("object");
    expect(Number(withBlock?.["node-version"])).toBe(22);
  });

  it("触发面保持：push(main) + pull_request（workflow 顶层 on 段，js-yaml 4 解析为字符串键）", () => {
    const doc = loadWorkflow();
    const on = doc.on as UnknownRecord;
    expect(on, "on 段应存在（js-yaml 4 将裸 on 键解析为字符串）").toBeTypeOf("object");
    const push = on.push as UnknownRecord;
    expect(push).toBeTypeOf("object");
    expect(push.branches).toEqual(["main"]);
    expect(on.pull_request).not.toBeUndefined();
  });
});
