/**
 * ci-workflow-contract.spec.ts —— CI workflow 多 OS 腿形态契约（P32b · gaps B3
 * 闭合的机器可判半边：Windows 腿存在 + 八步同形 + Windows 安全调用形态；
 * macOS 腿 Owner 2026-09-01 批准启用，与 ci.yml matrix 同步钉死）。
 *
 * 钉住的契约（.github/workflows/ci.yml）：
 * - matrix 三腿 ubuntu-latest + windows-latest + macos-latest（B3：此前 CI 只在
 *   ubuntu 验证，PATH 双引号吞段等 Windows 特有坑只在本机踩过、CI 不设防；
 *   macOS 腿按呈报件 docs/l6-release-gate-p35-report.md §3 即插即用件启用）；
 * - fail-fast: false（单腿红不取消另一腿——Windows 特有失败不得掩盖 ubuntu 主信号）；
 * - 八步 run 命令恒为
 *   `corepack pnpm <install|build|mutation:verify|notices:verify|test|ratchet|lint>` 七步 + pyyaml
 *   安装步（`python -m pip install pyyaml`——M5 human views 编译器的 Python 依赖，
 *   runner 预置 Python 不带；词形三腿同形，human-views spec 探测面同源）：pnpm 系
 *   统一经 corepack 前缀（不依赖 runner PATH 上的裸 pnpm/npx——Windows pwsh 与
 *   ubuntu bash 双 shell 同形；build-all.mjs/ratchet.mjs 内部再以 process.execPath
 *   直连子进程，shell:false + 参数数组，CI 与本机行为一致）；
 * - COREPACK_ENABLE_DOWNLOAD_PROMPT=0（job 级 env：免交互下载确认，Windows 同需）；
 * - node-version 22（engines >=22 同源）+ actions 版本锚（checkout@v4/setup-node@v4）；
 * - 触发面 push(main) + pull_request + workflow_call（T4 R1：publish.yml 以 uses:
 *   复用本 workflow 作发布前置闸）。
 *
 * 同文件钉 publish.yml 门控契约（T4 R1 · 方案 A「workflow_call 复用 + needs 串行」）：
 * - jobs.ci uses ci.yml（权限钉 contents: read）+ jobs.publish needs: ci——发布必须
 *   发生在 CI 全绿之后（同 run DAG 强排序，结构闸）+ 防御性 needs.ci.result 断言步；
 * - 权限最小化：无 workflow 级放权，id-token: write 只在 publish job（OIDC 唯一出口）；
 * - 零凭据纪律：零 secrets 引用、零 TOKEN 词形 env 键；
 * - 发布机闸：npm 硬下限 11.5.1（npm 官方文档 2026-09-04 口径）+ setup-node 24 +
 *   OIDC publish 命令逐字。
 *
 * 判读面：js-yaml 解析（devDependency，tests 面专用——CLI 运行时零 yaml 依赖，
 * eval-carrier.spec 同款纪律）。本 spec 是仓库契约测试：改 ci.yml / publish.yml
 * 步骤形态须同步改这里（契约漂移即红）。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = join(repoRoot, ".github", "workflows", "ci.yml");

type UnknownRecord = Record<string, unknown>;

/** 八步 run 步闭包（顺序敏感：install→build→mutation:verify→notices:verify→pyyaml→test→ratchet→lint；
 *  P35 RT2/RT4 封条接线 + pyyaml 步为 M5 human views 编译器 Python 依赖，2026-09-01 接线）。 */
const EXPECTED_STEP_COMMANDS = [
  "corepack pnpm install",
  "corepack pnpm build",
  "corepack pnpm mutation:verify",
  "corepack pnpm notices:verify",
  "python -m pip install pyyaml",
  "corepack pnpm test",
  "corepack pnpm ratchet",
  "corepack pnpm lint",
];

const EXPECTED_RUNNERS = ["ubuntu-latest", "windows-latest", "macos-latest"];

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

describe("CI workflow 多 OS 腿形态契约（P32b · B3 闭合 + macOS 腿启用）", () => {
  it("matrix 含 ubuntu-latest + windows-latest + macos-latest 三腿；fail-fast=false（单腿红不取消另一腿）", () => {
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

  it("八步命令同形且顺序恒定：install→build→mutation:verify→notices:verify→pyyaml→test→ratchet→lint，pnpm 系全部 corepack 前缀", () => {
    const doc = loadWorkflow();
    const ci = (doc.jobs as UnknownRecord).ci as UnknownRecord;
    const runs = runCommandsOf(ci);
    expect(runs).toEqual(EXPECTED_STEP_COMMANDS);
    for (const run of runs) {
      // 词形闭集：corepack pnpm 前缀（七步）或 pyyaml 安装步精确词形（三腿同形，
      // 裸 pip 在部分 runner 形缺席；禁任何第三词形混入）。
      const allowed =
        run.startsWith("corepack pnpm ") || run === "python -m pip install pyyaml";
      expect(
        allowed,
        `run 步词形越界（corepack pnpm 前缀或 pyyaml 安装步二选一）: ${run}`,
      ).toBe(true);
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

  it("触发面保持：push(main) + pull_request + workflow_call（R1 复用入口——publish.yml 以 uses 复用本 workflow），js-yaml 4 解析为字符串键", () => {
    const doc = loadWorkflow();
    const on = doc.on as UnknownRecord;
    expect(on, "on 段应存在（js-yaml 4 将裸 on 键解析为字符串）").toBeTypeOf("object");
    const push = on.push as UnknownRecord;
    expect(push).toBeTypeOf("object");
    expect(push.branches).toEqual(["main"]);
    expect(on.pull_request).not.toBeUndefined();
    // T4 R1：workflow_call 触发在座（publish.yml 的 `uses:` 复用依赖此触发面；
    // 缺失即发布链断——publish job 启动不了前置 CI）。
    expect("workflow_call" in on, "workflow_call 触发应在座（R1 发布门控复用入口）").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Publish workflow CI 门控契约（T4 R1 · 09-08-sc-t4）
// ─────────────────────────────────────────────────────────────────────────────

const publishWorkflowPath = join(repoRoot, ".github", "workflows", "publish.yml");

function loadPublishWorkflow(): UnknownRecord {
  const raw = readFileSync(publishWorkflowPath, "utf8");
  const doc: unknown = yaml.load(raw);
  expect(doc, "publish.yml 应解析为顶层映射").toBeTypeOf("object");
  expect(doc).not.toBeNull();
  return doc as UnknownRecord;
}

describe("Publish workflow CI 门控契约（T4 R1 · 方案 A：workflow_call 复用 + needs 串行）", () => {
  it("触发面：push tags v* + workflow_dispatch（tag 正式发布路径保持；不在 main push 上跑）", () => {
    const doc = loadPublishWorkflow();
    const on = doc.on as UnknownRecord;
    const push = on.push as UnknownRecord;
    expect(push.tags).toEqual(["v*"]);
    expect(push.branches, "publish 不应由分支 push 触发（发布走 tag 门控链）").toBeUndefined();
    expect("workflow_dispatch" in on, "workflow_dispatch 手动兜底应保持").toBe(true);
  });

  it("CI 门控结构：jobs.ci uses ci.yml（权限钉 contents: read）+ jobs.publish needs: ci——发布必须在 CI 全绿之后", () => {
    const doc = loadPublishWorkflow();
    const jobs = doc.jobs as UnknownRecord;
    const ci = jobs.ci as UnknownRecord;
    expect(ci.uses, "ci job 应以 workflow_call 复用 ci.yml（方案 A）").toBe(
      "./.github/workflows/ci.yml",
    );
    const ciPerms = ci.permissions as UnknownRecord | undefined;
    expect(
      ciPerms,
      "复用调用 job 应显式钉权限（被复用 workflow 的 GITHUB_TOKEN 只能降不能升）",
    ).toBeTypeOf("object");
    expect(ciPerms).toEqual({ contents: "read" });
    const publish = jobs.publish as UnknownRecord;
    expect(publish.needs, "publish job 必须 needs: ci（CI 全绿是发布硬前置）").toBe("ci");
  });

  it("权限最小化：无 workflow 级放权；id-token: write 只在 publish job（OIDC 唯一出口）；零 secrets/零 TOKEN 词形 env", () => {
    const doc = loadPublishWorkflow();
    // 无 workflow 级 permissions：放权只发生在 job 级（ci=只读、publish=id-token）。
    expect(doc.permissions, "不应有 workflow 级 permissions（job 级最小化声明）").toBeUndefined();
    const publish = (doc.jobs as UnknownRecord).publish as UnknownRecord;
    const perms = publish.permissions as UnknownRecord;
    expect(perms["id-token"]).toBe("write");
    expect(perms.contents).toBe("read");
    // 零凭据纪律：全文零 secrets 引用；全部 env 键无 TOKEN 词形（头注词形提及
    // NODE_AUTH_TOKEN 属说明性文字，凭据面判据 = env 键与 secrets 引用双零）。
    const raw = readFileSync(publishWorkflowPath, "utf8");
    expect(raw.includes("secrets."), "全文禁 secrets 引用（零凭据纪律）").toBe(false);
    for (const jobName of ["ci", "publish"] as const) {
      const job = (doc.jobs as UnknownRecord)[jobName] as UnknownRecord;
      const env = job.env as UnknownRecord | undefined;
      for (const key of Object.keys(env ?? {})) {
        expect(key.includes("TOKEN"), `env 键禁 TOKEN 词形（${jobName}.${key}）`).toBe(false);
      }
    }
  });

  it("发布机闸与命令形态：防御性 needs.ci.result 断言步 + npm 硬下限 11.5.1 + setup-node 24 + OIDC publish 命令逐字", () => {
    const doc = loadPublishWorkflow();
    const publish = (doc.jobs as UnknownRecord).publish as UnknownRecord;
    const steps = publish.steps as UnknownRecord[];
    const runs = steps
      .filter((step) => typeof step.run === "string")
      .map((step) => (step.run as string).trim());
    // 防御性 CI 门控断言（fail-closed 双层：结构 needs + 显式自证）。
    expect(
      runs.some((run) => run.includes("needs.ci.result")),
      "防御性 needs.ci.result 断言步应在座（结构闸之外的显式自证）",
    ).toBe(true);
    // npm 硬下限口径（npm 官方 2026-09-04：≥ 11.5.1；11.5.0 不放行）。
    const gateRun = runs.find((run) => run.includes("npm --version"));
    expect(gateRun, "pre-publish gate 步应在座").toBeTypeOf("string");
    expect(gateRun).toContain("11.5.1");
    // setup-node 24（Trusted Publishing CLI 下限的镜像保障）。
    const setupNode = steps.find(
      (step) => typeof step.uses === "string" && step.uses.startsWith("actions/setup-node"),
    );
    const withBlock = setupNode?.["with"] as UnknownRecord | undefined;
    expect(Number(withBlock?.["node-version"])).toBe(24);
    // OIDC 发布命令逐字（TP workflow filename 契约的命令面锚）。
    const publishRun = runs.find((run) => run.includes("npm publish"));
    expect(publishRun).toContain("npm publish --provenance --access public");
  });
});
