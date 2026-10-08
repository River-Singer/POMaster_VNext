/**
 * init-mode-fork.spec.ts —— `pomaster init` 模式分叉（F-M3 init v2；
 * .trellis/tasks/09-11-init-v2-mode-fork/prd.md R1-R4）。
 *
 * 判据锚：
 * - **模式检测矩阵三态（R1）**：干净目录 = Greenfield 静默直入（零新增人读行）；
 *   worktree 非空且无 .pomaster = Brownfield 候选（检测摘要逐值对账：源文件计数 /
 *   migration 词形面 / SBOM 工具在位性——检测是呈现不是裁决）；.pomaster 在座 =
 *   initialized（重入口行为不变，宿主文件在场也不分支）。
 * - **task-first（R1）**：候选态非交互与 TTY 都自动运行 recon、创建唯一的
 *   `TASK.INIT_PROJECT_IDENTIFICATION`，不先询问 Brownfield/Greenfield 或技术栈；
 *   init 保持架构未知，治理编译等待识别报告与 Owner 确认。`brownfield.confirmed=false`
 *   仅保留为显式兼容入口；raw 模式问句 helper 继续钉住旧 API 的按键与版式契约。
 * - **Brownfield 编排真跑（R2/R4）**：fixture 仓端到端——自动 recon 三腿 sidecar
 *   落盘（import-graph OBSERVED 计数逐值对账 / migrations ENVREC /
 *   sbom NOT_INSTALLED 显式跳过带补采路标）→ 回执过 17 schema（ajv 组合装载）→
 *   execution 档案 begin/end 封口（role=script 诚实申报；已封口执行事后补录兼容
 *   recon 契约）→ 权威 task 写入；架构 profile 与 baseline 确认在识别任务完成前均不生成。
 * - **fail-closed（R2）**：腿失败（spawn 层故障 → RECON_SBOM_NOT_RUN）折算 warning
 *   显式呈现，init ok 恒不受 recon 影响——recon 失败不阻塞 init 主链。
 * - **字节快照零权威直写（R4 沿 recon 批形态）**：同构 fixture 双跑对账——Brownfield
 *   编排相对 Greenfield 骨架，权威面（stack.yaml×2 / manifest / design-tokens /
 *   layout.json）逐字节不变；truth-index/journal 因权威 task 写入而合法变化，recon
 *   额外产物只进入 evidence/{blobs,observations}/ + executions/。
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, perceptionReceiptsSchema } from "@pomaster/schemas";
import { sha256OfBytes } from "@pomaster/kernel";
import {
  confirmBrownfieldPath,
  detectInitMode,
  INIT_BROWNFIELD_RECON_FAILED,
  RECON_SBOM_INSTALL_HINT,
  RECON_SBOM_TOOL,
  renderBrownfieldFrame,
  runBaselineConfirm,
  runInit,
  runInitInteractive,
  type InitInteractiveIo,
  type QuestionnaireIo,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// fixture（Brownfield 宿主仓：手工算例分母——2 源文件 / prisma 1 词形面 / vue 栈候选）
// ============================================================

function writeHostFile(root: string, relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/**
 * Brownfield 宿主 fixture（手工算例）：源文件 2（src/main.ts + src/legacy.js——
 * .css/.sql/toml 不入枚举闭包）；裸包名 import 2（vue/lodash）；相对引用 1 条
 * （./style.css → unmapped）；prisma migration 词形面 1/5；package.json 产 FE
 * 可观察候选 6 键（framework/language/build/router/state/testing）。
 */
function seedBrownfieldHost(root: string): void {
  writeHostFile(
    root,
    "package.json",
    `${JSON.stringify({
      name: "legacy-app",
      dependencies: { vue: "^3.4.0", "vue-router": "^4.2.0", pinia: "^2.1.0" },
      devDependencies: { typescript: "^5.0.0", vite: "^5.0.0", vitest: "^1.0.0" },
    })}\n`,
  );
  writeHostFile(
    root,
    "src/main.ts",
    ['import { createApp } from "vue";', 'import "./style.css";', "createApp({});"].join("\n") + "\n",
  );
  writeHostFile(
    root,
    "src/legacy.js",
    ['import lodash from "lodash";', "export const boot = () => lodash;"].join("\n") + "\n",
  );
  writeHostFile(root, "src/style.css", "body { margin: 0; }\n");
  writeHostFile(root, "prisma/migrations/20240101120000_init/migration.sql", "-- init\n");
  writeHostFile(root, "prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
}

function observationsDir(root: string): string {
  return join(root, ".pomaster", "evidence", "observations");
}

/** 回执产物（.json；预铺 README.md 非产物）。 */
function observationReceipts(root: string): string[] {
  const base = observationsDir(root);
  return existsSync(base)
    ? readdirSync(base).filter((name) => name.endsWith(".json")).sort()
    : [];
}

function executionArchives(root: string): string[] {
  const base = join(root, ".pomaster", "executions");
  return existsSync(base) ? readdirSync(base).filter((name) => name.endsWith(".json")).sort() : [];
}

/** hermetic：PATH 指向不存在目录——默认探测面（findExecutableOnPath 真链）确定性缺席。 */
async function withPoisonedPath<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.PATH;
  process.env.PATH = join(tmpdir(), "pomaster-cli-init-fork-no-such-path");
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
  }
}

/** 17 schema 组合装载（ajv 全量注册解跨文件绝对 $ref——recon.spec 同款纪律）。 */
const ajvFork = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajvFork.addSchema(schema as Record<string, unknown>);
}
const validateReceipt = ajvFork.compile(perceptionReceiptsSchema as object);

/** runInitInteractive 编号形态 fake io：script 逐次应答读行（耗尽 = EOF/null）。 */
function numberedIo(script: readonly (string | null)[]): {
  written: string[];
  io: InitInteractiveIo;
} {
  const written: string[] = [];
  let calls = 0;
  return {
    written,
    io: {
      write: (line: string) => written.push(line),
      readLine: () => Promise.resolve(script[calls++] ?? null),
    },
  };
}

// ============================================================
// R1：模式检测矩阵三态
// ============================================================

describe("init 模式检测矩阵（F-M3 R1 三态）", () => {
  it("干净目录 → greenfield：静默直入现状（零模式人读行；零观察回执零 execution 档案）", async () => {
    expect(detectInitMode(dir)).toEqual({ kind: "greenfield" });
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode).toEqual({
      detection: "greenfield",
      summary: null,
      brownfield: null,
      recon: null,
    });
    // Greenfield 静默直入：人读零模式行（R1 原文——呈现面现状不变）。
    expect(outcome.human.join("\n")).not.toContain("  mode:");
    // 零编排零落盘：预铺 evidence/observations 与 executions 目录内无产物。
    expect(observationReceipts(dir)).toEqual([]);
    expect(executionArchives(dir)).toEqual([]);
  });

  it("worktree 非空且无 .pomaster → brownfield_candidate：检测摘要逐值对账（源文件 2 / prisma 1 词形面 / SBOM 缺席）；.git-only 目录也判候选（git 在座信号）", () => {
    seedBrownfieldHost(dir);
    const detection = detectInitMode(dir, { sbomProbe: () => null });
    expect(detection.kind).toBe("brownfield_candidate");
    expect(detection.kind !== "greenfield" && detection.kind !== "initialized" ? detection.summary : null).toEqual({
      source_files: 2,
      migration_stacks: ["prisma"],
      sbom_tool: "absent",
    });
    // git 在座信号：只有 .git 目录（零源文件）——worktree 非空即候选（R1 检测口径）。
    const gitOnly = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-git-"));
    try {
      mkdirSync(join(gitOnly, ".git"));
      const gitDetection = detectInitMode(gitOnly, { sbomProbe: () => null });
      expect(gitDetection.kind).toBe("brownfield_candidate");
      expect(
        gitDetection.kind === "brownfield_candidate" ? gitDetection.summary.source_files : null,
      ).toBe(0);
    } finally {
      rmSync(gitOnly, { recursive: true, force: true });
    }
  });

  it("已初始化 → initialized：init 后重检测 initialized（宿主文件在场也不分支）；二次 runInit NO_CHANGE + 重入口行为不变", async () => {
    seedBrownfieldHost(dir);
    const first = await runInit(dir);
    expect(first.ok).toBe(true);
    expect(first.result.mode?.detection).toBe("brownfield_candidate");
    expect(detectInitMode(dir)).toEqual({ kind: "initialized" });
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.mode).toEqual({
      detection: "initialized",
      summary: null,
      brownfield: null,
      recon: null,
    });
    expect(second.human.join("\n")).not.toContain("  mode:");
  });
});

// ============================================================
// R1：候选态禁静默分叉（显式确认制）
// ============================================================

describe("init 候选态 task-first 自动识别", () => {
  it("非交互候选态自动 recon 并创建唯一识别 TASK，无需先选架构", async () => {
    seedBrownfieldHost(dir);
    const outcome = await withPoisonedPath(() => runInit(dir));
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode?.detection).toBe("brownfield_candidate");
    expect(outcome.result.mode?.brownfield).toBe("ran");
    expect(outcome.result.project_identification).toMatchObject({
      state: "created",
      task_id: "TASK.INIT_PROJECT_IDENTIFICATION",
    });
    expect(observationReceipts(dir)).toEqual(["ENVREC-0001.json", "OBS-0001.json"]);
    expect(executionArchives(dir)).toHaveLength(1);
    expect(outcome.result.architecture_profile).toBeNull();
  });

  it("Owner 显式拒绝（brownfield.confirmed=false）→ declined：零编排零落盘 + 人读单行（Greenfield 现状路径）", async () => {
    seedBrownfieldHost(dir);
    const outcome = await runInit(dir, { brownfield: { confirmed: false } });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode?.brownfield).toBe("declined");
    expect(outcome.result.mode?.recon).toBeNull();
    expect(observationReceipts(dir)).toEqual([]);
    expect(executionArchives(dir)).toEqual([]);
    expect(outcome.human.join("\n")).toContain("Owner 已选 Greenfield 路径（跳过 recon 直接初始化）");
  });

  it("runInitInteractive 候选态跳过模式与栈问卷，直接建立识别任务", async () => {
    seedBrownfieldHost(dir);
    const { written, io } = numberedIo(["claude"]);
    const outcome = await withPoisonedPath(() => runInitInteractive(dir, io));
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode?.brownfield).toBe("ran");
    expect(outcome.result.baseline).toEqual({ asked: 0, answered: 0, skipped: "non_interactive" });
    expect(outcome.result.project_identification?.task_id).toBe("TASK.INIT_PROJECT_IDENTIFICATION");
    const text = written.join("\n");
    expect(text).not.toContain("检测到已有项目（Brownfield 候选）——走哪条路径？");
    expect(text).not.toContain("技术栈问卷");
  });

  it("候选态不消费旧模式问句输入，平台选择后即可初始化", async () => {
    seedBrownfieldHost(dir);
    const { io } = numberedIo(["claude", null]);
    const outcome = await withPoisonedPath(() => runInitInteractive(dir, io));
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, ".pomaster"))).toBe(true);
  });

  it("raw 帧：版式钉（问句头行 + 检测行 + 两选项 + 帧快照零 ANSI）与 raw 确认流（回车=Brownfield / ↓+回车=Greenfield / Ctrl+C 或 EOF=中止）；greenfield 静默零提问", async () => {
    seedBrownfieldHost(dir);
    const detection = detectInitMode(dir, { sbomProbe: () => null });
    expect(detection.kind).toBe("brownfield_candidate");
    const summary = detection.kind === "brownfield_candidate" ? detection.summary : null;
    expect(summary).not.toBeNull();
    // 帧快照零 ANSI（§45：光标控制序列只允许经 redrawFrame 出口）。
    const frame = renderBrownfieldFrame(summary as NonNullable<typeof summary>, 0);
    expect(frame).toContain("? 检测到已有项目（Brownfield 候选）——走哪条路径？（↑↓选择 / 回车确认 / Ctrl+C 中止）");
    expect(frame).toContain("◉ Brownfield：自动 recon 三腿采集宿主事实");
    expect(frame).toContain(" ◯ Greenfield：跳过 recon 直接初始化（现状路径）");
    expect(frame).not.toContain("\x1b[");

    const rawIo = (keys: readonly string[]): { written: string[]; io: QuestionnaireIo } => {
      const written: string[] = [];
      return {
        written,
        io: {
          write: (chunk: string) => written.push(chunk),
          pumpKeys: (handler) => {
            for (const key of keys) {
              if (!handler(key)) break;
            }
            return Promise.resolve();
          },
        },
      };
    };
    // 回车（光标缺省位 0）= Brownfield 确认。
    const enter = rawIo(["\r"]);
    expect(await confirmBrownfieldPath(dir, enter.io)).toEqual({
      detection,
      confirmed: true,
    });
    // ↓ + 回车 = Greenfield（显式拒绝）。
    const down = rawIo(["\x1b[B", "\r"]);
    expect(await confirmBrownfieldPath(dir, down.io)).toEqual({
      detection,
      confirmed: false,
    });
    // Ctrl+C / 按键流耗尽（EOF）= 中止（null——调用方零写入退出）。
    expect(await confirmBrownfieldPath(dir, rawIo(["\x03"]).io)).toBeNull();
    expect(await confirmBrownfieldPath(dir, rawIo([]).io)).toBeNull();
    // greenfield 静默返回零提问（R1：干净目录直入现状）。
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-bare-"));
    try {
      const green = await confirmBrownfieldPath(bare, rawIo(["\r"]).io);
      expect(green).toEqual({ detection: { kind: "greenfield" }, confirmed: false });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

// ============================================================
// R2/R4：Brownfield 编排真跑（fixture 仓端到端）
// ============================================================

describe("Brownfield 编排真跑（R2 fixture 仓端到端）", () => {
  it("端到端：自动 recon → sidecar + execution + 识别 TASK；架构与 baseline 等待报告确认", async () => {
    seedBrownfieldHost(dir);
    const { io } = numberedIo(["claude"]);
    const outcome = await withPoisonedPath(() => runInitInteractive(dir, io));
    expect(outcome.ok).toBe(true);
    const mode = outcome.result.mode;
    expect(mode?.detection).toBe("brownfield_candidate");
    expect(mode?.brownfield).toBe("ran");
    const recon = mode?.recon;
    expect(recon?.status).toBe("completed");
    expect(recon?.execution_id ?? "").toMatch(/^AGX-[0-9]{4}-[0-9]{5}$/);
    expect(recon?.execution_closed).toBe(true);
    // —— 三腿逐值对账（fixture 手工算例：2 源文件 / 2 external / 1 unmapped / prisma 1 栈 / sbom 工具缺席） ——
    const importGraph = recon?.legs?.import_graph;
    expect(importGraph?.status).toBe("OBSERVED");
    expect(importGraph?.observation_id).toBe("OBS-0001");
    expect(importGraph?.source_files).toBe(2);
    expect(importGraph?.external_imports).toBe(2);
    expect(importGraph?.unmapped_count).toBe(1);
    expect(existsSync(join(dir, ...(importGraph?.receipt_path ?? "").split("/")))).toBe(true);
    const migrations = recon?.legs?.migrations;
    expect(migrations?.status).toBe("OBSERVED");
    expect(migrations?.receipt_id).toBe("ENVREC-0001");
    expect(migrations?.detected_stacks).toBe(1);
    const sbom = recon?.legs?.sbom;
    expect(sbom?.status).toBe("NOT_INSTALLED");
    expect(sbom?.error_code).toBe("RECON_SBOM_NOT_INSTALLED");
    expect(sbom?.components).toBeNull();
    // —— 腿回执 17 schema 形态合法（ajv 组合装载） ——
    for (const receiptId of ["OBS-0001", "ENVREC-0001"]) {
      const receipt = JSON.parse(
        readFileSync(join(observationsDir(dir), `${receiptId}.json`), "utf8"),
      ) as Record<string, unknown>;
      expect(validateReceipt(receipt), `${receiptId} 须过 17 schema`).toBe(true);
      expect(receipt.execution_id).toBe(recon?.execution_id);
    }
    // —— execution 档案：begin/end 封口（role=script 诚实申报；事后补录兼容 recon 契约） ——
    expect(executionArchives(dir)).toEqual([`${recon?.execution_id}.json`]);
    const archive = JSON.parse(
      readFileSync(join(dir, ".pomaster", "executions", `${recon?.execution_id}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(archive.role).toBe("script");
    expect(archive.runtime).toBe("script");
    expect(archive.identity_kind).toBe("script");
    expect(archive.ended_at).not.toBeNull();
    // —— NOT_INSTALLED 显式跳过 warning：补采路标在座（已封口执行允许事后补录） ——
    const sbomWarning = outcome.warnings.find((w) => w.code === "RECON_SBOM_NOT_INSTALLED");
    expect(sbomWarning?.message).toContain("工具缺席显式跳过，不阻塞 init");
    expect(sbomWarning?.message).toContain(`pomaster recon sbom --execution-id ${recon?.execution_id}`);
    expect(sbomWarning?.hint).toBe(RECON_SBOM_INSTALL_HINT);
    // —— task-first：不在 init 阶段让用户猜架构或技术栈 ——
    expect(outcome.result.baseline).toEqual({ asked: 0, answered: 0, skipped: "non_interactive" });
    const stackText = readFileSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"), "utf8");
    expect(stackText).toContain("framework: UNKNOWN");
    const ledgerRows = readFileSync(join(dir, ".pomaster", "baseline", "manifest.yaml"), "utf8")
      .split("\n")
      .filter((line) => /^\s*-\s*baseline\//.test(line)).length;
    expect(ledgerRows).toBeGreaterThan(0);
    // —— 差距报告合并呈现（R3）：recon sidecar 摘要 + 问卷观察候选注记同输出 ——
    const human = outcome.human.join("\n");
    expect(human).toContain("brownfield recon: execution AGX-");
    expect(human).toContain("import-graph: OBSERVED — OBS-0001（2 源文件 / 2 externalImports / 1 unmapped）");
    expect(human).toContain("migrations: OBSERVED — ENVREC-0001（1/5 栈词形面在场）");
    expect(human).toContain("sbom: NOT_INSTALLED — cdxgen 不在 PATH");
    expect(human).toContain("观察候选登记 6 键");
    expect(outcome.result.project_identification?.task_id).toBe("TASK.INIT_PROJECT_IDENTIFICATION");
    // baseline 未销账，不能绕过识别 TASK 直接确认。
    const confirm = await runBaselineConfirm(dir, {});
    expect(confirm.ok).toBe(false);
  });

  it("sbom OBSERVED：注入 fake cdxgen 两段式（真实 spawnSync）→ 腿 OBSERVED 计数对账 + blob 原样字节落盘（消费方重算 sha256）", async () => {
    seedBrownfieldHost(dir);
    const fakeDir = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-fake-"));
    const fakePath = join(fakeDir, "fake-cdxgen.cjs");
    writeFileSync(
      fakePath,
      [
        "const fs = require(\"node:fs\");",
        "const outIndex = process.argv.indexOf(\"-o\");",
        "fs.writeFileSync(",
        "  process.argv[outIndex + 1],",
        "  JSON.stringify({",
        '    bomFormat: "CycloneDX",',
        '    specVersion: "1.5",',
        "    components: [{ type: \"library\", name: \"lodash\", version: \"4.17.21\" }, { type: \"framework\", name: \"vue\", version: \"3.4.0\" }],",
        "    dependencies: [{ ref: \"pkg:npm/lodash@4.17.21\", dependsOn: [\"pkg:npm/vue@3.4.0\"] }],",
        "  }),",
        ");",
        "process.exit(0);",
      ].join("\n"),
      "utf8",
    );
    try {
      const outcome = await runInit(dir, {
        brownfield: {
          confirmed: true,
          sbomInject: {
            executableProbe: (executable) => (executable === RECON_SBOM_TOOL ? "<fake-on-path>" : null),
            spawnFn: (command, options) => {
              const rewritten = command.replace(/^cdxgen\b/, `node "${fakePath}"`);
              if (rewritten === command) throw new Error(`fake spawn 收到非 cdxgen 词形命令：${command}`);
              const res = spawnSync(rewritten, {
                shell: true,
                cwd: options.cwd,
                timeout: options.timeoutMs,
                encoding: "utf8",
                windowsHide: true,
              });
              return {
                status: res.status,
                stdout: res.stdout ?? "",
                stderr: res.stderr ?? "",
                error: res.error?.message ?? null,
                externalMs: 5,
              };
            },
          },
        },
      });
      expect(outcome.ok).toBe(true);
      const sbom = outcome.result.mode?.recon?.legs?.sbom;
      expect(sbom?.status).toBe("OBSERVED");
      // OBS 序号三腿同分区共享：import-graph 腿先取 OBS-0001，sbom 腿顺延 OBS-0002。
      expect(outcome.result.mode?.recon?.legs?.import_graph?.observation_id).toBe("OBS-0001");
      expect(sbom?.observation_id).toBe("OBS-0002");
      expect(sbom?.components).toBe(2);
      expect(sbom?.dependencies).toBe(1);
      // blob 落盘：消费方重算 sha256 对账（D24 写侧镜像——recon.spec 同款纪律）。
      const receipt = JSON.parse(
        readFileSync(join(observationsDir(dir), "OBS-0002.json"), "utf8"),
      ) as {
        artifact_refs: Array<{
          ref_type: string;
          blob: { sha256: string; byte_size: number; media: string; storage_path: string };
        }>;
      };
      expect(receipt.artifact_refs).toHaveLength(1);
      const ref = receipt.artifact_refs[0]?.blob;
      expect(ref?.media).toBe("json");
      // 同一次 brownfield recon 会落多个内容寻址 blob；必须按回执签发的
      // storage_path 精确回读，不能依赖目录枚举顺序猜测目标 blob。
      const blobPath = join(dir, ".pomaster", "evidence", ref?.storage_path ?? "");
      const bytes = readFileSync(blobPath);
      expect(sha256OfBytes(bytes)).toBe(ref?.sha256);
      expect(bytes.length).toBe(ref?.byte_size);
      expect((JSON.parse(bytes.toString("utf8")) as { bomFormat: string }).bomFormat).toBe("CycloneDX");
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });

  it("腿失败 fail-closed：spawn 层故障 → RECON_SBOM_NOT_RUN warning 显式呈现，init ok=true 主链不受影响（其余腿照常 OBSERVED）", async () => {
    seedBrownfieldHost(dir);
    const outcome = await runInit(dir, {
      brownfield: {
        confirmed: true,
        sbomInject: {
          executableProbe: (executable) => (executable === RECON_SBOM_TOOL ? "<fake-on-path>" : null),
          spawnFn: () => ({ status: null, stdout: "", stderr: "", error: "simulated spawn failure", externalMs: 1 }),
        },
      },
    });
    // recon 失败不阻塞 init 主链（R2 fail-closed）。
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const sbom = outcome.result.mode?.recon?.legs?.sbom;
    expect(sbom?.status).toBe("NOT_RUN");
    expect(sbom?.error_code).toBe("RECON_SBOM_NOT_RUN");
    expect(sbom?.observation_id).toBeNull();
    const warning = outcome.warnings.find((w) => w.code === "RECON_SBOM_NOT_RUN");
    expect(warning?.message).toContain("Brownfield recon（init 编排）腿 sbom 未产出观察（NOT_RUN）");
    // 其余两腿照常 OBSERVED（编排腿间独立——一腿失败不拖垮兄弟腿）。
    expect(outcome.result.mode?.recon?.legs?.import_graph?.status).toBe("OBSERVED");
    expect(outcome.result.mode?.recon?.legs?.migrations?.status).toBe("OBSERVED");
    // 编排整体仍 completed（腿失败 ≠ 编排失败——execution 照常封口）。
    expect(outcome.result.mode?.recon?.status).toBe("completed");
    expect(outcome.result.mode?.recon?.execution_closed).toBe(true);
  });
});

// ============================================================
// R4：字节快照零权威直写（沿 recon 批形态）
// ============================================================

describe("字节快照零权威直写（R4 沿 recon 批形态）", () => {
  it("同构 fixture 双跑对账：Brownfield 编排相对 Greenfield 骨架——权威面逐字节不变；新增 ⊆ evidence/{blobs,observations}/ + executions/；journal 仅 append-only 追加", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-snap-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "pomaster-cli-init-fork-snap-b-"));
    try {
      seedBrownfieldHost(dirA);
      seedBrownfieldHost(dirB);
      // A = 显式兼容入口跳过 recon；B = 自动 Brownfield recon
      // （import-graph + migrations OBSERVED、sbom NOT_INSTALLED）。两边都必须写入识别 TASK。
      const a = await runInit(dirA, { brownfield: { confirmed: false } });
      const b = await runInit(dirB, { brownfield: { confirmed: true, sbomInject: { executableProbe: () => null } } });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(b.result.mode?.brownfield).toBe("ran");
      // 权威面逐字节不变（零直写权威——recon 批红线在 init 编排下继承）。
      const authorityTargets = [
        ".pomaster/baseline/frontend/stack.yaml",
        ".pomaster/baseline/backend/stack.yaml",
        ".pomaster/baseline/manifest.yaml",
        ".pomaster/baseline/frontend/design-tokens.yaml",
        ".pomaster/layout.json",
      ];
      for (const relative of authorityTargets) {
        const aBytes = readFileSync(join(dirA, ...relative.split("/")));
        const bBytes = readFileSync(join(dirB, ...relative.split("/")));
        expect(bBytes.equals(aBytes), `${relative} 逐字节不变`).toBe(true);
      }
      // 两条路径都只创建同一个 canonical 项目识别 TASK；recon 的差异只体现在
      // evidence/execution 与对应 journal seq，不能再沿用旧的 truth-index 字节相等前提。
      const taskIds = (root: string): string[] => {
        const index = JSON.parse(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")) as {
          objects: readonly { id: string }[];
        };
        return index.objects.map((row) => row.id).filter((id) => id === "TASK.INIT_PROJECT_IDENTIFICATION");
      };
      expect(taskIds(dirA)).toEqual(["TASK.INIT_PROJECT_IDENTIFICATION"]);
      expect(taskIds(dirB)).toEqual(["TASK.INIT_PROJECT_IDENTIFICATION"]);
      expect(observationReceipts(dirA)).toEqual([]);
      expect(executionArchives(dirA)).toEqual([]);
      expect(observationReceipts(dirB)).toEqual(["ENVREC-0001.json", "OBS-0001.json"]);
      expect(executionArchives(dirB)).toHaveLength(1);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

// 防御性钉：编排失败 warning 码词形 export 在座（信封消费面单源）。
describe("init-mode 导出面", () => {
  it("INIT_BROWNFIELD_RECON_FAILED 词形稳定（warning 码消费面单源）", () => {
    expect(INIT_BROWNFIELD_RECON_FAILED).toBe("INIT_BROWNFIELD_RECON_FAILED");
  });
});
