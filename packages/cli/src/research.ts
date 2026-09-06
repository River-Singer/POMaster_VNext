/**
 * research.ts —— §44.3 六命令之 research 三命令（P18）。
 *
 * - `research <topic> [--mode internal|external|mixed|comparative|impact|forensic]`：
 *   启动一次 Research 会话——mode 词形校验（§44.3 argv 小写词形 ↔ §81.2 六模式大写
 *   词形映射）+ **--host 三道闸（词形 → 登记面 → 磁盘存在性；P18 红队发现2：业务源码
 *   树不是合法宿主）** + **Read-only Contract 写面判卷（§81.3，命令层强制）**：申报写入面
 *   （缺省 = 四文件骨架）逐路径过 kernel checkResearchWriteContract，越写（research/
 *   约定目录之外、受治理面、盘符/逃逸路径）= FATAL exit 1 且零落盘（fail-closed：
 *   判卷失败不写任何文件）；全过才产出 research/ 四文件骨架（§81.6）。
 * - `research list <task-or-discovery>`：宿主 research 产物清单呈现。
 * - `research inspect <research-id>`：单 artifact 判读（宿主位词形/存在性校验——
 *   发现4 复用 list 同款，../../ 穿透封死 + 四文件完整性 + index.yaml
 *   机读形态 + 五级 Evidence 判卷语义 adjudicateResearchFindings（含 §81.4 六字段
 *   sources/caveats 存在性——发现1 幻觉洗白 fail-closed）+ handoff 三件）。
 * - `research request <discovery-id> …`（PR-4 命令链 09-06 R5：Discovery 的
 *   missing_facts / Research Gap 公开消解入口）——kernel createResearchRequest 单一
 *   判卷源（§9.1 九键 + §9.3 mode 路由 + §9.4 Request Gate 前两条件）；request 落档
 *   `<host>/research/index.yaml`（§16：正式 requests 住 research/index.yaml，图侧只留
 *   同步标记）+ kernel syncDecisionRequestRefs 把 id 同步进 graph.request_refs
 *   （机械同步零新治理语义，fingerprint 由 kernel 重算——D24 人类禁算哈希）。
 * - `research handoff <discovery-id> --file <handoff.json>`（同批 R5：回填入账）——
 *   kernel applyResearchHandoff 单一判卷源（§10.1/§10.2：research_finding_refs 增量、
 *   RESOLVES_FACT 消解 missing_facts、CONTRADICTS_PREMISE 入披露面、§12.4 INFERENCE
 *   不升 Fact）+ index.yaml 同拍入账（requests 状态 answered/unresolved + handoff
 *   三件 + key_findings 原样存档）。消解方是谁由 Owner 指定（托管编排/自动派发
 *   research sub-agent 明确不做——卡片只写通路，不写派发）。
 *   两命令都只写 Discovery 授权维护面（scratchpad 内 research/ 与 decision-graph.json
 *   sidecar——§80.2 权限清单；state gate = DISCOVERY，与 decide 同款），治理 store 零直写。
 *
 * 纪律：
 * - 判卷权威在 kernel（checkResearchWriteContract/adjudicateResearchFindings），
 *   本文件只编排与呈现；Research 有发现权没有裁决权（§81.1）——CONFLICTS 条目呈现
 *   escalation 路标，绝不改 Authority。
 * - index.yaml 以 JSON 兼容形态落盘（JSON 是 YAML 1.2 子集）：inspect 零新依赖机读；
 *   自由手写 yaml 显式 NOT_MACHINE_PARSEABLE（不静默猜结构）。
 * - --host 缺省解析：唯一活跃 scratchpad 自动选中；多个/零个显式拒绝（不发明「最新」
 *   之类的静默选择政策）。
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResearchEvidenceLevelValue, ResearchModeValue } from "@pomaster/schemas";
import { RESEARCH_MODE_VALUES } from "@pomaster/schemas";
import {
  RESEARCH_ARTIFACT_FILES,
  RESEARCH_MODE_ROUTE_HINTS,
  adjudicateResearchFindings,
  applyResearchHandoff,
  checkResearchWriteContract,
  createResearchRequest,
  syncDecisionRequestRefs,
  type ResearchFindingAdjudication,
  type ResearchFindingInput,
  type ResearchHandoffInput,
  type ResearchModeRouteHint,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { decisionGraphPath, decisionInputsPath, loadDecisionGraph } from "./brainstorm.js";
import {
  DISCOVERY_ID_PATTERN,
  discoveryScratchpadDirPath,
  discoveryScratchpadsDirPath,
  toPosix,
} from "./store-layout.js";

// ============================================================
// 词形（§44.3 argv 小写 ↔ §81.2 六模式大写；两套词形都是 PRD 原文）
// ============================================================

/** argv 词形（§44.3 原文小写）→ 六模式大写词形（§81.2 原文，schemas 镜像）。 */
export const RESEARCH_MODE_ARGV_ALIASES: Readonly<
  Record<string, ResearchModeValue>
> = {
  internal: "INTERNAL",
  external: "EXTERNAL",
  mixed: "MIXED",
  comparative: "COMPARATIVE",
  impact: "IMPACT",
  forensic: "FORENSIC",
};

export interface ResearchStartResult {
  readonly topic: string;
  readonly host_ref: string;
  readonly artifact_root: string;
  readonly mode: ResearchModeValue | null;
  readonly write_plan: readonly { readonly path: string; readonly kind: string }[];
  readonly scaffold: { readonly created: readonly string[]; readonly skipped: readonly string[] };
}

export interface ResearchListEntry {
  readonly artifact_root: string;
  readonly findings_count: number | null;
  readonly skeleton: boolean;
}

export interface ResearchListResult {
  readonly host_ref: string;
  readonly artifacts: readonly ResearchListEntry[];
}

export interface ResearchInspectResult {
  readonly research_id: string;
  readonly artifact_root: string;
  readonly files: readonly { readonly file: string; readonly present: boolean }[];
  readonly findings_total: number;
  readonly skeleton: boolean;
  readonly handoff: Readonly<Record<string, unknown>> | null;
  readonly adjudication: {
    readonly all_ok: boolean;
    readonly violations: number;
    readonly escalations: number;
    readonly warnings: number;
    readonly per_finding: readonly ResearchFindingAdjudication[];
  } | null;
}

// ============================================================
// 内部工具
// ============================================================

export function normalizeDir(p: string): string {
  const posix = p.split("\\").join("/");
  return posix.endsWith("/") ? posix : `${posix}/`;
}

export function hostShapeViolation(host: string): string | null {
  if (host.length === 0) return "host_ref 缺失";
  const posix = host.split("\\").join("/");
  if (/^[A-Za-z]:/.test(posix) || posix.startsWith("/")) return "host_ref 禁绝对盘符/根斜杠";
  if (posix.split("/").includes("..")) return "host_ref 禁 .. 逃逸段";
  return null;
}

/**
 * --host 登记面校验（P18 红队发现2）：词形合法只是第一道闸——宿主还必须是登记面
 * （discovery scratchpad：`.pomaster/discovery/scratchpads/<id>/`，brainstorm start
 * 产出、id 词形镜像 08 schema；或 task 目录：`tasks/<task>/`）。否则 `--host src`
 * 之类的业务源码目录会把 research 四文件骨架写进业务源码树（Read-only Contract 的
 * 写面判卷只锁 <host>/research/** 之下，锁不住宿主位本身落在哪）。
 * 返回 null = 登记面合法；存在性（已登记）由调用方对磁盘复核。
 */
function hostRegistrationFaceViolation(host: string): string | null {
  const trimmed = host.endsWith("/") ? host.slice(0, -1) : host;
  if (trimmed.startsWith(".pomaster/discovery/scratchpads/")) {
    const id = trimmed.slice(".pomaster/discovery/scratchpads/".length);
    if (!DISCOVERY_ID_PATTERN.test(id)) {
      return `scratchpad 目录段 "${id}" 不匹配 id 词形（[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`;
    }
    return null;
  }
  if (trimmed.startsWith("tasks/")) return null;
  return "宿主不是登记面（仅允许 discovery scratchpad 或 task 目录）";
}

/**
 * --host 解析：显式 --host 走三道闸（词形 → 登记面 → 磁盘存在性）；缺省扫
 * scratchpads 找活跃 discovery（state ∈ {DISCOVERY, READY_TO_PROMOTE}）。唯一 →
 * 选中；多个/零个 → 显式错误（不发明静默选择政策）。
 */
async function resolveResearchHost(
  rootDir: string,
  hostOption: string | undefined,
): Promise<{ host: string } | { error: CliError }> {
  if (hostOption !== undefined) {
    const violation = hostShapeViolation(hostOption);
    if (violation !== null) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `--host ${violation}（"${hostOption}"）`,
          hint: "host 是 task-or-discovery 仓内相对目录（如 .pomaster/discovery/scratchpads/idea-001/ 或 tasks/TASK.T0087/）。",
        },
      };
    }
    const host = normalizeDir(hostOption);
    // —— 登记面闸（发现2）：宿主必须是 scratchpad 或 task 目录，业务源码树拒绝 ——
    const faceViolation = hostRegistrationFaceViolation(host);
    if (faceViolation !== null) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `--host ${faceViolation}（"${hostOption}"）`,
          hint: "宿主登记面只有两形：.pomaster/discovery/scratchpads/<id>/（brainstorm start 产出）或 tasks/<task>/（task 目录）；业务源码树（src/ 等）不是合法宿主——research 骨架不得写入业务源码树。",
        },
      };
    }
    // —— 已登记闸：目录必须真实存在（scratchpad 由 brainstorm start 登记；task 目录
    //    以磁盘存在为准——判卷不解引用符号链接，已知边界见 research-contract.ts 头注） ——
    if (!existsSync(join(rootDir, ...host.split("/")))) {
      return {
        error: {
          code: "RESEARCH_HOST_NOT_FOUND",
          message: `--host 宿主目录不存在或未登记：${host}`,
          hint: "discovery 宿主先 brainstorm start --id <id> 登记；task 宿主确认 tasks/<task>/ 目录存在。",
        },
      };
    }
    return { host };
  }
  const padsDir = discoveryScratchpadsDirPath(rootDir);
  if (!existsSync(padsDir)) {
    return {
      error: {
        code: "RESEARCH_HOST_NOT_FOUND",
        message: "无 --host 且无活跃 scratchpad（.pomaster/discovery/scratchpads 不存在）",
        hint: "先 pomaster brainstorm start [--ephemeral] 开一个 discovery，或显式 --host <task-or-discovery>。",
      },
    };
  }
  const entries = (await readdir(padsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const active: string[] = [];
  for (const id of entries) {
    try {
      const raw = JSON.parse(
        await readFile(join(padsDir, id, "state.json"), "utf8"),
      ) as { state?: unknown };
      if (
        typeof raw.state === "string" &&
        (raw.state === "DISCOVERY" || raw.state === "READY_TO_PROMOTE")
      ) {
        active.push(id);
      }
    } catch {
      // 残缺 scratchpad 不冒充活跃（status 会显式呈现 malformed）。
    }
  }
  if (active.length === 0) {
    return {
      error: {
        code: "RESEARCH_HOST_NOT_FOUND",
        message: "无 --host 且 scratchpads 中无活跃 discovery（DISCOVERY/READY_TO_PROMOTE 态）",
        hint: "pomaster brainstorm start 开一个，或显式 --host <task-or-discovery>。",
      },
    };
  }
  if (active.length > 1) {
    return {
      error: {
        code: "AMBIGUOUS_HOST",
        message: `多个活跃 discovery（${active.join(", ")}）——不发明静默选择政策`,
        hint: "显式 --host <task-or-discovery> 指定宿主。",
      },
    };
  }
  return { host: `.pomaster/discovery/scratchpads/${active[0]}/` };
}

export interface IndexYamlShape {
  host_ref?: unknown;
  artifact_root?: unknown;
  files?: unknown;
  findings?: unknown;
  handoff?: unknown;
}

export async function readIndexYaml(indexPath: string): Promise<IndexYamlShape | null> {
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(await readFile(indexPath, "utf8")) as IndexYamlShape;
  } catch {
    return null;
  }
}

function skeletonOf(handoff: unknown): boolean {
  if (handoff === null || typeof handoff !== "object") return false;
  const summary = (handoff as { one_line_summary?: unknown }).one_line_summary;
  return typeof summary === "string" && summary.startsWith("SKELETON");
}

// ============================================================
// research <topic>（§44.3；写面契约命令层强制）
// ============================================================

export interface ResearchStartInput {
  readonly topic: string;
  readonly mode?: string;
  readonly host?: string;
  /** 额外申报写入面（可重复；缺省申报 = 四文件骨架）。 */
  readonly write?: readonly string[];
}

/**
 * 启动 Research 会话。fail-closed 顺序：mode 词表 → host 解析 → 写面契约判卷
 * （任何 fatal = FATAL exit 1 且零落盘）→ 骨架产出（已存在文件跳过=幂等）。
 */
export async function runResearchStart(
  rootDir: string,
  input: ResearchStartInput,
): Promise<CommandOutcome<ResearchStartResult>> {
  // —— mode 词表（§44.3 小写 argv 词形；词表外显式拒绝） ——
  let mode: ResearchModeValue | null = null;
  if (input.mode !== undefined) {
    const mapped = RESEARCH_MODE_ARGV_ALIASES[input.mode];
    if (mapped === undefined) {
      return failOutcome<ResearchStartResult>(
        "research",
        {
          topic: input.topic,
          host_ref: "",
          artifact_root: "",
          mode: null,
          write_plan: [],
          scaffold: { created: [], skipped: [] },
        },
        [
          {
            code: "SCHEMA_INVALID",
            message: `--mode "${input.mode}" 不在六模式词表`,
            hint: `§44.3：--mode internal|external|mixed|comparative|impact|forensic（§81.2 六模式）`,
          },
        ],
        [`research: FAILED — SCHEMA_INVALID (--mode ${input.mode})`],
      );
    }
    mode = mapped;
  }

  // —— host 解析（显式 > 唯一活跃 scratchpad；多/零显式拒绝） ——
  const resolved = await resolveResearchHost(rootDir, input.host);
  if ("error" in resolved) {
    return failOutcome<ResearchStartResult>(
      "research",
      {
        topic: input.topic,
        host_ref: "",
        artifact_root: "",
        mode,
        write_plan: [],
        scaffold: { created: [], skipped: [] },
      },
      [resolved.error],
      [`research: FAILED — ${resolved.error.code}`],
    );
  }
  const hostRef = resolved.host;
  const artifactRoot = `${hostRef}research/`;

  // —— 写面契约判卷（kernel 权威；缺省申报 = 四文件骨架；先全判后落盘） ——
  const declared = [
    ...RESEARCH_ARTIFACT_FILES.map((f) => `${artifactRoot}${f}`),
    ...(input.write ?? []),
  ];
  const writePlan: { path: string; kind: string }[] = [];
  const fatalErrors: CliError[] = [];
  const fatalHuman: string[] = [];
  for (const target of declared) {
    const outcome = checkResearchWriteContract(hostRef, target);
    if (outcome.allowed) {
      writePlan.push({ path: outcome.relPath, kind: outcome.kind });
      continue;
    }
    fatalErrors.push({
      code: "RESEARCH_CONTRACT_FATAL",
      message: `${outcome.reason}: ${target}`,
      hint: outcome.hint,
    });
    fatalHuman.push(`  FATAL ${outcome.reason}: ${target}\n    hint: ${outcome.hint}`);
  }
  if (fatalErrors.length > 0) {
    // 越写即 FATAL：判卷失败零落盘（一个字节都不写）。
    return failOutcome<ResearchStartResult>(
      "research",
      {
        topic: input.topic,
        host_ref: hostRef,
        artifact_root: artifactRoot,
        mode,
        write_plan: [],
        scaffold: { created: [], skipped: [] },
      },
      fatalErrors,
      [
        `research "${input.topic}" → FATAL — Read-only Contract（§81.3）写面判卷失败（${fatalErrors.length} 处越写；本轮零落盘）`,
        ...fatalHuman,
        "  允许写：<host>/research/**（四文件产物 + 工作文件）；禁止：业务代码/Current Truth/policies/证据平面直写（证据走 record 通路）。",
      ],
    );
  }

  // —— 骨架产出（§81.6 四文件；index.yaml JSON 兼容形态；已存在跳过=幂等） ——
  const created: string[] = [];
  const skipped: string[] = [];
  try {
    const researchDir = join(rootDir, ...artifactRoot.split("/"));
    await mkdir(researchDir, { recursive: true });
    for (const fileName of RESEARCH_ARTIFACT_FILES) {
      const filePath = join(researchDir, fileName);
      if (existsSync(filePath)) {
        skipped.push(`${artifactRoot}${fileName}`);
        continue;
      }
      const content =
        fileName === "index.yaml"
          ? `${JSON.stringify(
              {
                host_ref: hostRef,
                artifact_root: artifactRoot,
                files: {
                  index: "index.yaml",
                  current_implementation: "current-implementation.md",
                  external_options: "external-options.md",
                  risks_and_caveats: "risks-and-caveats.md",
                },
                findings: [],
                handoff: {
                  artifact_path: artifactRoot,
                  one_line_summary:
                    "SKELETON —— Research 未完成：本文件是骨架占位，由 Research Agent 填写 findings 与 handoff 三件",
                  critical_caveat:
                    "SKELETON —— 骨架占位：无关键告警判断待 Research 填写（§81.6 handoff 三件契约）",
                },
              },
              null,
              2,
            )}\n`
          : `# ${fileName}（P18 骨架占位——由 Research Agent 填写；§81.6 四文件结构）\n`;
      await writeFile(filePath, content, "utf8");
      created.push(`${artifactRoot}${fileName}`);
    }
  } catch (err) {
    return failOutcome<ResearchStartResult>(
      "research",
      {
        topic: input.topic,
        host_ref: hostRef,
        artifact_root: artifactRoot,
        mode,
        write_plan: writePlan,
        scaffold: { created, skipped },
      },
      [
        {
          code: "IO_ERROR",
          message: err instanceof Error ? err.message : String(err),
          hint: "research/ 骨架落盘失败——检查目录权限；判卷已通过，修复后重跑即可（幂等）。",
        },
      ],
      [`research: FAILED — IO_ERROR`],
    );
  }

  const human = [
    `research "${input.topic}" → SCAFFOLDED${mode !== null ? ` (mode=${mode})` : ""}`,
    `  host: ${hostRef}`,
    `  artifact_root: ${artifactRoot}`,
    `  写面契约（§81.3）：${writePlan.length} 条申报全过（越写=FATAL 由 kernel 判卷器强制）`,
    ...created.map((p) => `  created: ${p}`),
    ...skipped.map((p) => `  skipped(已存在): ${p}`),
    "  handoff 纪律（§81.6）：完成后主 Agent 只传 artifact path + one-line summary + critical caveat",
  ];
  return okOutcome<ResearchStartResult>(
    "research",
    {
      topic: input.topic,
      host_ref: hostRef,
      artifact_root: artifactRoot,
      mode,
      write_plan: writePlan,
      scaffold: { created, skipped },
    },
    human,
  );
}

// ============================================================
// research list（§44.3）
// ============================================================

export async function runResearchList(
  rootDir: string,
  hostArg: string,
): Promise<CommandOutcome<ResearchListResult>> {
  const violation = hostShapeViolation(hostArg);
  if (violation !== null) {
    return failOutcome<ResearchListResult>(
      "research list",
      { host_ref: hostArg, artifacts: [] },
      [
        {
          code: "SCHEMA_INVALID",
          message: `<task-or-discovery> ${violation}（"${hostArg}"）`,
          hint: "宿主是仓内相对目录（尾斜杠可省）。",
        },
      ],
      [`research list: FAILED — SCHEMA_INVALID`],
    );
  }
  const hostRef = normalizeDir(hostArg);
  const hostDir = join(rootDir, ...hostRef.split("/"));
  if (!existsSync(hostDir)) {
    return failOutcome<ResearchListResult>(
      "research list",
      { host_ref: hostRef, artifacts: [] },
      [
        {
          code: "RESEARCH_HOST_NOT_FOUND",
          message: `宿主目录不存在：${hostRef}`,
          hint: "pomaster brainstorm status 查看现有 discovery；宿主存在而无产物是空清单（合法），宿主本身不存在是显式错误。",
        },
      ],
      [`research list: FAILED — RESEARCH_HOST_NOT_FOUND (${hostRef})`],
    );
  }
  const indexPath = join(hostDir, "research", "index.yaml");
  const index = await readIndexYaml(indexPath);
  const artifacts: ResearchListEntry[] = [];
  if (index !== null) {
    const findings = Array.isArray(index.findings) ? index.findings : null;
    artifacts.push({
      artifact_root:
        typeof index.artifact_root === "string" ? index.artifact_root : `${hostRef}research/`,
      findings_count: findings === null ? null : findings.length,
      skeleton: skeletonOf(index.handoff),
    });
  }
  const human = [
    `research list ${hostRef}：${artifacts.length} 个 artifact`,
    ...artifacts.map(
      (a) =>
        `  ${a.artifact_root}  findings=${a.findings_count ?? "(非机读)"}${a.skeleton ? "  [SKELETON 未填写]" : ""}`,
    ),
    ...(artifacts.length === 0
      ? ["  （宿主存在但无 research 产物——显式空清单；research <topic> 启动一次）"]
      : []),
  ];
  return okOutcome<ResearchListResult>("research list", { host_ref: hostRef, artifacts }, human);
}

// ============================================================
// research inspect（§44.3）
// ============================================================

/**
 * 单 artifact 判读（纯读）。research-id 接受 <host>/research/、<host>/research、
 * <host>/research/index.yaml 三种书写（归一同一 artifact）。
 * 宿主位判卷（P18 红队发现4）：复用 list 同款词形/存在性校验——hostShapeViolation
 * （禁绝对盘符/根斜杠/.. 逃逸）+ 宿主目录磁盘存在性；仅查 /research/ 结尾词形会被
 * `../../…/research/` 穿透读仓外（防幻觉链任何机器点不得 fail-open）。
 * 判卷面：四文件完整性（缺 → RESEARCH_ARTIFACT_INCOMPLETE）+ index.yaml 机读形态
 * （自由 yaml → INDEX_NOT_MACHINE_PARSEABLE）+ 五级 Evidence 判卷语义
 * （adjudicateResearchFindings；violation 计入 errors）+ handoff 三件呈现。
 */
export async function runResearchInspect(
  rootDir: string,
  researchId: string,
): Promise<CommandOutcome<ResearchInspectResult>> {
  const posix = researchId.split("\\").join("/");
  const artifactRoot = posix.endsWith("index.yaml")
    ? posix.slice(0, -"index.yaml".length)
    : normalizeDir(posix);
  if (!artifactRoot.endsWith("/research/")) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "SCHEMA_INVALID",
          message: `research-id "${researchId}" 不是 artifact 面词形（<host>/research/）`,
          hint: "research-id = artifact 根目录（10-research-artifact artifact_root：以 /research/ 结尾的相对路径）。",
        },
      ],
      [`research inspect: FAILED — SCHEMA_INVALID`],
    );
  }
  // —— 宿主位判卷（发现4：词形 + 存在性；与 list 同款） ——
  const hostRef = artifactRoot.slice(0, -"research/".length);
  const hostViolation = hostShapeViolation(hostRef);
  if (hostViolation !== null) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "SCHEMA_INVALID",
          message: `research-id 宿主位${hostViolation}（"${researchId}"）`,
          hint: "宿主是仓内相对目录（<task-or-discovery>/research/ 前缀位）；.. 逃逸/绝对路径不是合法 research-id。",
        },
      ],
      [`research inspect: FAILED — SCHEMA_INVALID`],
    );
  }
  const hostDir = join(rootDir, ...hostRef.split("/"));
  if (!existsSync(hostDir)) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "RESEARCH_HOST_NOT_FOUND",
          message: `宿主目录不存在：${hostRef}`,
          hint: "pomaster brainstorm status 查看现有 discovery；宿主存在而无产物是 artifact 缺 index.yaml（RESEARCH_ARTIFACT_NOT_FOUND），宿主本身不存在是显式错误。",
        },
      ],
      [`research inspect: FAILED — RESEARCH_HOST_NOT_FOUND (${hostRef})`],
    );
  }
  const researchDir = join(hostDir, "research");
  const indexPath = join(researchDir, "index.yaml");
  if (!existsSync(indexPath)) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "RESEARCH_ARTIFACT_NOT_FOUND",
          message: `${artifactRoot}index.yaml 不存在`,
          hint: "research <topic> 先产出骨架；或核对 research-id 词形。",
        },
      ],
      [`research inspect: FAILED — RESEARCH_ARTIFACT_NOT_FOUND`],
    );
  }
  const index = await readIndexYaml(indexPath);
  if (index === null) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "INDEX_NOT_MACHINE_PARSEABLE",
          message: `${artifactRoot}index.yaml 不是 JSON 兼容形态（inspect 机读要求 JSON——JSON 是 YAML 1.2 子集）`,
          hint: "骨架生成的 index.yaml 即机读形态；自由手写 yaml 请人读或改写为 JSON 兼容形态。",
        },
      ],
      [`research inspect: FAILED — INDEX_NOT_MACHINE_PARSEABLE`],
    );
  }

  // —— B3（P1）fail-closed：findings 字段整体损坏（键存在但非数组）≠ 合法空分母 ——
  // 此前 `Array.isArray(index.findings) ? index.findings : []` 把「键存在但非数组」
  // 静默折叠为空数组 → 分母 0 → all_ok 假绿 exit 0（与合法空 findings 输出不可区分；
  // 条目级损坏有 FINDING_MALFORMED 防线，字段级整体损坏恰好绕过）。JSON.parse 只在
  // 键真缺席时产出 undefined——缺席走空分母骨架警示通路（合法），其余一律显式报错。
  if (index.findings !== undefined && !Array.isArray(index.findings)) {
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files: [],
        findings_total: 0,
        skeleton: false,
        handoff: null,
        adjudication: null,
      },
      [
        {
          code: "INDEX_NOT_MACHINE_PARSEABLE",
          message: `${artifactRoot}index.yaml 的 findings 字段损坏（键存在但非数组——损坏非缺席，禁静默折叠为空分母报绿）`,
          hint: "「findings 键真缺席」才是合法空分母（骨架未填写）；键存在但非数组是整体字段损坏——修正为 findings: []（骨架形态）或合法 findings 数组后重跑。",
        },
      ],
      [`research inspect: FAILED — INDEX_NOT_MACHINE_PARSEABLE（findings 字段损坏）`],
    );
  }

  // —— 四文件完整性（§81.6；缺文件 = artifact 不完整，fail-closed） ——
  const files = RESEARCH_ARTIFACT_FILES.map((f) => ({
    file: f,
    present: existsSync(join(researchDir, f)),
  }));
  const missing = files.filter((f) => !f.present).map((f) => f.file);

  // —— findings 五级 Evidence 判卷（kernel adjudicateResearchFindings） ——
  // 形态不完整条目（缺 statement/evidence_type 字符串字段）不静默跳过——跳过即
  // fail-open（垃圾条目借「不进判卷分母」放行），显式 FINDING_MALFORMED 计入 errors。
  // 字段级整体损坏（键存在但非数组）已在上方 B3 闸显式拒绝——此处只剩键真缺席
  // （合法空分母，骨架未填写）与合法数组两形。
  const rawFindings = Array.isArray(index.findings) ? index.findings : [];
  const findings: ResearchFindingInput[] = [];
  const malformedFindingIndexes: number[] = [];
  rawFindings.forEach((f, i) => {
    if (
      f !== null &&
      typeof f === "object" &&
      typeof (f as ResearchFindingInput).evidence_type === "string" &&
      typeof (f as ResearchFindingInput).statement === "string"
    ) {
      findings.push(f as ResearchFindingInput);
    } else {
      malformedFindingIndexes.push(i);
    }
  });
  const report = adjudicateResearchFindings(findings);
  const warnings: CliWarning[] = [];
  const errors: CliError[] = [];
  for (const i of malformedFindingIndexes) {
    errors.push({
      code: "RESEARCH_FINDING_INVALID",
      message: `findings[${String(i)}] FINDING_MALFORMED: 缺 statement/evidence_type 字符串字段（§81.4 六字段契约）`,
      hint: "finding 条目必须满足六字段契约（statement/evidence_type/sources/confidence/authority_effect/caveats）；形态不完整不冒充已判（fail-closed）。",
    });
  }
  for (const f of report.perFinding) {
    for (const v of f.violations) {
      errors.push({
        code: "RESEARCH_FINDING_INVALID",
        message: `findings[${String(f.index)}] ${v.code}: ${v.detail}`,
        hint: v.hint,
      });
    }
    for (const e of f.escalations) {
      warnings.push({
        code: "RESEARCH_CONFLICTS_ESCALATION",
        message: `findings[${String(f.index)}] ${e.code}（authority_effect=CONFLICTS）`,
        hint: e.hint,
      });
    }
    for (const w of f.warnings) {
      warnings.push({
        code: "RESEARCH_FINDING_WARNING",
        message: `findings[${String(f.index)}] ${w.code}`,
        hint: w.hint,
      });
    }
  }

  const skeleton = skeletonOf(index.handoff);
  if (skeleton) {
    warnings.push({
      code: "RESEARCH_SKELETON",
      message: "handoff.one_line_summary 为骨架占位——Research 尚未填写",
      hint: "findings 与 handoff 三件（path + one-line summary + critical caveat）由 Research Agent 填写后本提示消失。",
    });
  }
  const handoff =
    index.handoff !== null && typeof index.handoff === "object"
      ? (index.handoff as Readonly<Record<string, unknown>>)
      : null;

  if (missing.length > 0 || errors.length > 0) {
    // H1（二轮审查 §45 机读契约破缺修复）：四文件缺失路径此前 failOutcome 携带
    // errors=[]——ok=false 但机读方取不到因，文档/测试钉的 RESEARCH_ARTIFACT_INCOMPLETE
    // 码位从未产生。缺失 → errors[0] = RESEARCH_ARTIFACT_INCOMPLETE（hint 列缺失清单），
    // 先于 findings 判卷错误（分母完整性在判卷语义之前）。
    if (missing.length > 0) {
      errors.unshift({
        code: "RESEARCH_ARTIFACT_INCOMPLETE",
        message: `${artifactRoot}四文件不完整（§81.6 产物契约）：缺 ${missing.join(", ")}`,
        hint: `缺失文件：${missing.map((m) => `${artifactRoot}${m}`).join(", ")}——补齐后重跑（骨架可由 research <topic> 幂等重建）。`,
      });
    }
    return failOutcome<ResearchInspectResult>(
      "research inspect",
      {
        research_id: researchId,
        artifact_root: artifactRoot,
        files,
        findings_total: findings.length,
        skeleton,
        handoff,
        adjudication: {
          all_ok: report.allOk,
          violations: report.perFinding.reduce((s, f) => s + f.violations.length, 0),
          escalations: report.perFinding.reduce((s, f) => s + f.escalations.length, 0),
          warnings: report.perFinding.reduce((s, f) => s + f.warnings.length, 0),
          per_finding: report.perFinding,
        },
      },
      errors,
      [
        `research inspect ${artifactRoot} → ${missing.length > 0 ? "ARTIFACT_INCOMPLETE" : "FINDINGS_INVALID"}`,
        ...missing.map((m) => `  缺文件: ${m}（§81.6 四文件契约）`),
        ...errors.map((e) => `  ${e.code}: ${e.message}\n    hint: ${e.hint}`),
      ],
      warnings,
    );
  }

  const human = [
    `research inspect ${artifactRoot}`,
    `  四文件（§81.6）：${files.map((f) => `${f.file}${f.present ? "" : "(缺)"}`).join(" / ")}`,
    `  findings: ${findings.length} 条（五级 Evidence 判卷 ${report.allOk ? "全过" : "存在违例"}）`,
    ...report.perFinding.map(
      (f) =>
        `    [${String(f.index)}] ${((findings[f.index] as ResearchFindingInput).statement ?? "").slice(0, 60)} — escalations=${String(f.escalations.length)} warnings=${String(f.warnings.length)}`,
    ),
    `  handoff: ${skeleton ? "[SKELETON 未填写]" : "one-line summary + critical caveat 齐备（§81.6 主 Agent 只传三件）"}`,
    ...warnings.map((w) => `  ⚠ ${w.code}: ${w.hint ?? w.message}`),
  ];
  return okOutcome<ResearchInspectResult>(
    "research inspect",
    {
      research_id: researchId,
      artifact_root: artifactRoot,
      files,
      findings_total: findings.length,
      skeleton,
      handoff,
      adjudication: {
        all_ok: report.allOk,
        violations: report.perFinding.reduce((s, f) => s + f.violations.length, 0),
        escalations: report.perFinding.reduce((s, f) => s + f.escalations.length, 0),
        warnings: report.perFinding.reduce((s, f) => s + f.warnings.length, 0),
        per_finding: report.perFinding,
      },
    },
    human,
    warnings,
  );
}

// ============================================================
// research request / research handoff（PR-4 命令链 09-06 R5：缺口公开消解）
// ============================================================

/** scratchpad 状态闸（与 brainstorm decide 同款：两命令都只作用于 DISCOVERY 态）。 */
async function scratchpadDiscoveryState(
  rootDir: string,
  id: string,
): Promise<{ readonly state: string } | { readonly error: CliError }> {
  const statePath = join(discoveryScratchpadDirPath(rootDir, id), "state.json");
  if (!existsSync(statePath)) {
    return {
      error: {
        code: "SCRATCHPAD_NOT_FOUND",
        message: `discovery "${id}" 不存在（state.json 缺席）`,
        hint: "pomaster brainstorm start 先创建；pomaster brainstorm status 查看现有 discovery。",
      },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;
  } catch {
    return {
      error: {
        code: "SCRATCHPAD_STATE_INVALID",
        message: `discovery "${id}" 的 state.json 不可解析（08 信封形态要求）`,
        hint: "修复或删除残缺 scratchpad 后重试；state.json 词形以 @pomaster/schemas 08 schema 为准。",
      },
    };
  }
  const state =
    parsed !== null && typeof parsed === "object" && typeof (parsed as { state?: unknown }).state === "string"
      ? (parsed as { state: string }).state
      : null;
  if (state === null) {
    return {
      error: {
        code: "SCRATCHPAD_STATE_INVALID",
        message: `discovery "${id}" 的 state.json 缺 state 字段（08 信封形态要求）`,
        hint: "修复 state.json 后重试。",
      },
    };
  }
  if (state !== "DISCOVERY") {
    return {
      error: {
        code: "RESEARCH_REQUIRES_DISCOVERY",
        message: `research request/handoff 只作用于 DISCOVERY 态：当前 state=${state}`,
        hint:
          state === "READY_TO_PROMOTE"
            ? "讨论已收敛（--ready 通过）——回填会改 grounding 判定面，须先回到公开讨论态（显式重开）或开新 discovery。"
            : `${state} 是链终态——后续归 CHANGE/TASK 自身治理面管（08 x-pomaster-transition-matrix）。`,
      },
    };
  }
  return { state };
}

/** index.yaml 请求条目（kernel ResearchRequest 九键 + 入账状态注记）。 */
export interface ResearchRequestRecord {
  readonly id: string;
  readonly origin_decision_refs: readonly string[];
  readonly proposition: string;
  readonly why_needed: string;
  readonly known_context_refs: readonly string[];
  readonly mode: ResearchModeValue;
  readonly required_evidence: string;
  readonly disconfirming_evidence_required: boolean;
  readonly stop_when: readonly string[];
  readonly forbidden_conclusion: string;
  /** 入账状态注记（CLI 局部词：open=已登记待回填 / answered / unresolved）。 */
  readonly status: "open" | "answered" | "unresolved";
}

/** index.yaml 最小读取（容错缺席；坏 JSON 由调用方显式拒——与 readIndexYaml 同口径）。 */
function requestsOfIndex(index: IndexYamlShape): ResearchRequestRecord[] {
  return Array.isArray((index as { requests?: unknown }).requests)
    ? ((index as { requests: unknown[] }).requests as ResearchRequestRecord[])
    : [];
}

/** 读写 index.yaml 的请求段（presence = 是否新建文件；返回是否发生写入变化）。 */
async function mutateIndexRequests(
  indexPath: string,
  artifactRoot: string,
  hostRef: string,
  mutate: (index: Record<string, unknown>) => boolean,
): Promise<{ readonly created: boolean; readonly changed: boolean }> {
  let index: Record<string, unknown>;
  let created = false;
  if (existsSync(indexPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(indexPath, "utf8")) as unknown;
    } catch {
      throw Object.assign(new Error("index.yaml 不是 JSON 兼容形态"), { code: "INDEX_NOT_MACHINE_PARSEABLE" });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw Object.assign(new Error("index.yaml 顶层不是 JSON 对象"), { code: "INDEX_NOT_MACHINE_PARSEABLE" });
    }
    index = { ...(parsed as Record<string, unknown>) };
  } else {
    created = true;
    index = {
      host_ref: hostRef,
      artifact_root: artifactRoot,
      findings: [],
      handoff: {
        artifact_path: artifactRoot,
        one_line_summary: "SKELETON —— Research 未完成：仅有 request 登记，四文件骨架可由 research <topic> 幂等产出",
        critical_caveat: "SKELETON —— 骨架占位：无关键告警判断待 Research 填写（§81.6 handoff 三件契约）",
      },
    };
  }
  const changed = mutate(index);
  if (!changed && !created) return { created, changed: false };
  await mkdir(join(indexPath, ".."), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { created, changed: true };
}

export interface ResearchRequestInput {
  readonly discoveryId: string;
  /** --decision <DECISION.*>：来源 Decision（可重复；≥1——请求必须锚定到 Decision，§9.1）。 */
  readonly decisions: readonly string[];
  readonly proposition: string;
  /** --why <text>：哪个 Decision 的 Recommendation 依赖本事实（why_needed）。 */
  readonly why: string;
  /** --evidence <level>：期望证据级（五级 Evidence 词形，复用既有轴）。 */
  readonly evidence: string;
  /** --mode <mode>：六模式（argv 小写词形或 §81.2 大写词形均可）。 */
  readonly mode?: string;
  /** --gap <kind>：§9.3 自动路由键（mode 缺省时必给——零缺省政策）。 */
  readonly gap?: string;
  /** --stop-when <text>：停机判据（可重复；≥1）。 */
  readonly stopWhen: readonly string[];
  /** --forbid <text>：越权禁令（§81.1 Research 有发现权无裁决权）。 */
  readonly forbid: string;
  /** --disconfirming：§9.2 证伪纪律申报（缺省 false；kernel notes 显式提示）。 */
  readonly disconfirming?: boolean;
  /** --context <ref>：已知上下文引用（可重复）。 */
  readonly context?: readonly string[];
  /** --req-id <RESEARCH.REQ.<n>>：显式 id；缺省按 index.yaml 既有请求取最小未占用序号。 */
  readonly reqId?: string;
}

export interface ResearchRequestResult {
  readonly discovery_id: string;
  readonly request_id: string;
  readonly request_ref: string;
  readonly mode: ResearchModeValue;
  readonly required_evidence: string;
  readonly requests_total: number;
  /** 图侧 request_refs 同步结果（kernel syncDecisionRequestRefs）。 */
  readonly graph_sync: "SYNCED" | "NO_CHANGE";
  readonly index_created: boolean;
}

/**
 * `research request <discovery-id>`：发起一次研究请求（PR-4 命令链第一拍）。
 * 判卷链：id 词形 → scratchpad DISCOVERY 态闸 → 图装载（request 必须锚在已建图上）→
 * 来源 Decision 图内存在性（kernel 只判词形，图内存在性是 CLI 闸——decide --answer
 * 同款）→ kernel createResearchRequest（§9.1 九键 + §9.4 前两条件 + §9.3 mode 路由）。
 * 落盘：index.yaml requests 段（缺席则建最小机读 index——四文件骨架归 research <topic>，
 * 不越俎）+ kernel syncDecisionRequestRefs 同步图侧标记（幂等重放 NO_CHANGE 零写入）。
 */
export async function runResearchRequest(
  rootDir: string,
  input: ResearchRequestInput,
): Promise<CommandOutcome<ResearchRequestResult>> {
  const padRef = `.pomaster/discovery/scratchpads/${input.discoveryId}/`;
  const emptyResult: ResearchRequestResult = {
    discovery_id: input.discoveryId,
    request_id: "",
    request_ref: "",
    mode: "INTERNAL",
    required_evidence: "",
    requests_total: 0,
    graph_sync: "NO_CHANGE",
    index_created: false,
  };
  const fail = (error: CliError, human: string[]): CommandOutcome<ResearchRequestResult> =>
    failOutcome<ResearchRequestResult>("research request", emptyResult, [error], human);

  // —— 闸 1：discovery id 词形 ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `discovery id "${input.discoveryId}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
        hint: "pomaster brainstorm status 查看现有 discovery。",
      },
      [`research request: FAILED — SCHEMA_INVALID (discovery id 词形非法: ${input.discoveryId})`],
    );
  }
  // —— 闸 2：DISCOVERY 态闸 ——
  const stateGate = await scratchpadDiscoveryState(rootDir, input.discoveryId);
  if ("error" in stateGate) {
    return fail(stateGate.error, [
      `research request: FAILED — ${stateGate.error.code} (${input.discoveryId})`,
    ]);
  }
  // —— 闸 3：图装载（request 锚在已建图上——--set 先行） ——
  const loaded = await loadDecisionGraph(rootDir, input.discoveryId);
  if (!loaded.ok) {
    return fail(loaded.error, [
      `research request: FAILED — ${loaded.error.code} (${input.discoveryId})`,
    ]);
  }
  const { graph } = loaded;
  // —— 闸 4：来源 Decision 图内存在性（decide --answer 的 DECISION_NOT_FOUND 同款） ——
  const graphIds = new Set(graph.decisions.map((n) => n.decision_id));
  const unknownDecisions = input.decisions.filter((id) => !graphIds.has(id));
  if (unknownDecisions.length > 0) {
    return fail(
      {
        code: "DECISION_NOT_FOUND",
        message: `--decision 引用不在图内：${unknownDecisions.join("、")}（图共 ${String(graph.decisions.length)} 节点）`,
        hint: "research request 只能锚定图内 Decision（§9.1：不接受无主研究）；pomaster brainstorm decide <id> --set 后呈现的 DECISION.* 清单内选取。",
      },
      [`research request: FAILED — DECISION_NOT_FOUND (${unknownDecisions.join(", ")})`],
    );
  }
  // —— mode 词形（argv 小写别名 ↔ §81.2 大写；直给大写亦收——kernel 判卷为准） ——
  let mode: ResearchModeValue | undefined;
  if (input.mode !== undefined) {
    const mapped = RESEARCH_MODE_ARGV_ALIASES[input.mode];
    if (mapped !== undefined) {
      mode = mapped;
    } else if ((RESEARCH_MODE_VALUES as readonly string[]).includes(input.mode)) {
      mode = input.mode as ResearchModeValue;
    } else {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `--mode "${input.mode}" 不在六模式词表`,
          hint: `--mode internal|external|mixed|comparative|impact|forensic（§81.2 六模式）；或省略 mode 用 --gap <kind> 走 §9.3 路由。`,
        },
        [`research request: FAILED — SCHEMA_INVALID (--mode)`],
      );
    }
  }
  // —— gap 词形预检（kernel RESEARCH_MODE_ROUTE_HINTS 路由表键；缺 mode 缺 gap 由 kernel 显式拒） ——
  if (input.gap !== undefined && !(Object.keys(RESEARCH_MODE_ROUTE_HINTS) as string[]).includes(input.gap)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `--gap "${input.gap}" 不在 §9.3 路由表`,
        hint: `路由键词形：${Object.keys(RESEARCH_MODE_ROUTE_HINTS).join(" | ")}。`,
      },
      [`research request: FAILED — SCHEMA_INVALID (--gap)`],
    );
  }
  // —— 序号派生（零墙钟 A4：index.yaml 既有 RESEARCH.REQ.<n> 的最小未占用——brainstorm start 先例） ——
  const indexPath = join(discoveryScratchpadDirPath(rootDir, input.discoveryId), "research", "index.yaml");
  let existingIndex: IndexYamlShape | null = null;
  if (existsSync(indexPath)) {
    try {
      existingIndex = JSON.parse(await readFile(indexPath, "utf8")) as IndexYamlShape;
    } catch {
      return fail(
        {
          code: "INDEX_NOT_MACHINE_PARSEABLE",
          message: `${toPosix(`${padRef}research/index.yaml`)} 不是 JSON 兼容形态（request 登记要求机读 index）`,
          hint: "自由手写 yaml 请改写为 JSON 兼容形态（JSON 是 YAML 1.2 子集）后重试。",
        },
        [`research request: FAILED — INDEX_NOT_MACHINE_PARSEABLE`],
      );
    }
    if (existingIndex === null || typeof existingIndex !== "object" || Array.isArray(existingIndex)) {
      return fail(
        {
          code: "INDEX_NOT_MACHINE_PARSEABLE",
          message: `${toPosix(`${padRef}research/index.yaml`)} 顶层不是 JSON 对象`,
          hint: "修正为 JSON 对象形态后重试。",
        },
        [`research request: FAILED — INDEX_NOT_MACHINE_PARSEABLE`],
      );
    }
  }
  const usedSeqs = new Set<number>();
  for (const record of requestsOfIndex(existingIndex ?? {})) {
    const match = /^RESEARCH\.REQ\.([0-9]+)$/.exec(String(record?.id ?? ""));
    if (match !== null) usedSeqs.add(Number(match[1]));
  }
  let nextSeq = 1;
  while (usedSeqs.has(nextSeq)) nextSeq += 1;

  // —— kernel 判卷（§9.1/§9.3/§9.4 单一判卷源；本面零判卷逻辑） ——
  const outcome = createResearchRequest({
    request: {
      ...(input.reqId !== undefined ? { id: input.reqId } : {}),
      origin_decision_refs: input.decisions,
      proposition: input.proposition,
      why_needed: input.why,
      ...(input.context !== undefined && input.context.length > 0
        ? { known_context_refs: input.context }
        : {}),
      ...(mode !== undefined ? { mode } : {}),
      required_evidence: input.evidence as ResearchEvidenceLevelValue,
      disconfirming_evidence_required: input.disconfirming === true,
      stop_when: input.stopWhen,
      forbidden_conclusion: input.forbid,
    },
    nextSeq,
    ...(input.gap !== undefined ? { gapKind: input.gap as ResearchModeRouteHint } : {}),
  });
  if (!outcome.ok) {
    return fail(
      {
        code: `RESEARCH_REQUEST_${outcome.reason.toUpperCase()}`,
        message: `请求被 kernel createResearchRequest 拒绝（${outcome.reason}）：${outcome.details.join("；")}`,
        hint: outcome.hint,
      },
      [
        `research request: FAILED — RESEARCH_REQUEST_${outcome.reason.toUpperCase()}`,
        ...outcome.details.map((d) => `  ${d}`),
        `  hint: ${outcome.hint}`,
      ],
    );
  }
  const request = outcome.request;

  // —— index.yaml 落档（§16：正式 requests 住 research/index.yaml） ——
  let indexCreated = false;
  try {
    const mutation = await mutateIndexRequests(indexPath, `${padRef}research/`, padRef, (index) => {
      const requests = Array.isArray(index.requests) ? [...(index.requests as unknown[])] : [];
      requests.push({ ...request, status: "open" });
      index.requests = requests;
      return true;
    });
    indexCreated = mutation.created;
  } catch (err) {
    const code = (err as { code?: string }).code;
    return fail(
      {
        code: typeof code === "string" ? code : "IO_ERROR",
        message: err instanceof Error ? err.message : String(err),
        hint:
          code === "INDEX_NOT_MACHINE_PARSEABLE"
            ? "request 登记要求机读 index.yaml；修正为 JSON 兼容形态后重试。"
            : "research/index.yaml 写入失败——检查目录权限后重试；判卷已通过，修复后重跑即可。",
      },
      [`research request: FAILED — ${typeof code === "string" ? code : "IO_ERROR"}`],
    );
  }

  // —— 图侧同步标记（kernel syncDecisionRequestRefs：机械同步 + fingerprint 重算） ——
  const sync = syncDecisionRequestRefs(graph, [request.id]);
  if (!sync.ok) {
    return fail(
      {
        code: "RESEARCH_REQUEST_REF_INVALID",
        message: `图侧 request_refs 同步被 kernel 拒绝：${sync.details.join("；")}`,
        hint: sync.hint,
      },
      [`research request: FAILED — RESEARCH_REQUEST_REF_INVALID`],
    );
  }
  let graphSync: "SYNCED" | "NO_CHANGE" = "NO_CHANGE";
  if (sync.changed) {
    try {
      await writeFile(decisionGraphPath(rootDir, input.discoveryId), `${JSON.stringify(sync.graph, null, 2)}\n`, "utf8");
      graphSync = "SYNCED";
    } catch (err) {
      return fail(
        {
          code: "IO_ERROR",
          message: `decision-graph.json 回写失败：${err instanceof Error ? err.message : String(err)}`,
          hint: "index.yaml 已落档（权威登记面）；重跑本命令按新序号登记或人工核对后重试。",
        },
        [`research request: FAILED — IO_ERROR (graph 回写)`],
      );
    }
  }

  const requestsTotal = requestsOfIndex(existingIndex ?? {}).length + 1;
  const human = [
    `research request → REGISTERED (${request.id}, discovery=${input.discoveryId})`,
    `  proposition: ${request.proposition}`,
    `  origin: ${request.origin_decision_refs.join("、")}；mode=${request.mode}；required_evidence=${request.required_evidence}`,
    `  index: ${toPosix(`${padRef}research/index.yaml`)}${indexCreated ? "（新建最小机读 index——四文件骨架归 research <topic>）" : ""}，requests 共 ${String(requestsTotal)} 条`,
    `  graph: request_refs ${graphSync === "SYNCED" ? "已同步（fingerprint 重算，决议不动）" : "NO_CHANGE（幂等重放）"}`,
    ...outcome.notes.map((note) => `  note: ${note}`),
    "  消解方由 Owner 指定（人工或 research sub-agent；托管派发不做）——回填入账：",
    `    pomaster research handoff ${input.discoveryId} --file <handoff.json>`,
    "  回填后重判：pomaster brainstorm decide <id> --ready --msd-goal <bool> --msd-scope <bool> --msd-acceptance <bool>",
  ];
  return okOutcome<ResearchRequestResult>(
    "research request",
    {
      discovery_id: input.discoveryId,
      request_id: request.id,
      request_ref: `${padRef}research/`,
      mode: request.mode,
      required_evidence: request.required_evidence,
      requests_total: requestsTotal,
      graph_sync: graphSync,
      index_created: indexCreated,
    },
    human,
  );
}

export interface ResearchHandoffApplyInput {
  readonly discoveryId: string;
  /** --file <path>：§10.2 decision-aware handoff JSON（路径按进程 CWD 解析，同 decide --set）。 */
  readonly file: string;
}

export interface ResearchHandoffResult {
  readonly discovery_id: string;
  readonly artifact_ref: string;
  readonly answered_requests: readonly string[];
  readonly unresolved_requests: readonly string[];
  readonly findings_total: number;
  readonly graph_changed: boolean;
  readonly graph_fingerprint: string | null;
  readonly request_statuses: readonly { readonly id: string; readonly status: string }[];
}

/**
 * `research handoff <discovery-id> --file <handoff.json>`：回填入账（PR-4 命令链第二拍）。
 * 判卷链：id 词形 → DISCOVERY 态闸 → 图装载 → handoff 文件形态闸（kernel 深判卷前的
 * 数组/字符串形状预检——零 throw 纪律）→ kernel applyResearchHandoff（§10.1/§10.2：
 * finding 挂回节点 / RESOLVES_FACT 消解 missing_facts / CONTRADICTS_PREMISE 入披露面 /
 * §12.4 INFERENCE 不升 Fact——单一判卷源零旁移）。落盘：decision-graph.json（changed
 * 才写——幂等重放零写入）+ index.yaml（requests 状态 answered/unresolved + handoff
 * 三件与 key_findings 原样入账——§81.4 六字段 findings 仍归 research artifact 面）。
 */
export async function runResearchHandoff(
  rootDir: string,
  input: ResearchHandoffApplyInput,
): Promise<CommandOutcome<ResearchHandoffResult>> {
  const padRef = `.pomaster/discovery/scratchpads/${input.discoveryId}/`;
  const emptyResult: ResearchHandoffResult = {
    discovery_id: input.discoveryId,
    artifact_ref: "",
    answered_requests: [],
    unresolved_requests: [],
    findings_total: 0,
    graph_changed: false,
    graph_fingerprint: null,
    request_statuses: [],
  };
  const fail = (error: CliError, human: string[]): CommandOutcome<ResearchHandoffResult> =>
    failOutcome<ResearchHandoffResult>("research handoff", emptyResult, [error], human);

  // —— 闸 1：discovery id 词形 ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `discovery id "${input.discoveryId}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
        hint: "pomaster brainstorm status 查看现有 discovery。",
      },
      [`research handoff: FAILED — SCHEMA_INVALID (discovery id 词形非法: ${input.discoveryId})`],
    );
  }
  // —— 闸 2：DISCOVERY 态闸 ——
  const stateGate = await scratchpadDiscoveryState(rootDir, input.discoveryId);
  if ("error" in stateGate) {
    return fail(stateGate.error, [
      `research handoff: FAILED — ${stateGate.error.code} (${input.discoveryId})`,
    ]);
  }
  // —— 闸 3：handoff 文件装载 + 形状预检（kernel applyResearchHandoff 的深判卷之前——
  //    数组位/字符串位缺席会让 kernel 的 for..of 解引用 throw；形状闸在此显式拒；
  //    先于图装载——输入件形态是独立闸，顺序先廉价后语义） ——
  let raw: string;
  try {
    raw = await readFile(input.file, "utf8");
  } catch (err) {
    return fail(
      {
        code: "IO_ERROR",
        message: `handoff 文件不可读：${err instanceof Error ? err.message : String(err)}`,
        hint: "--file <handoff.json>；形态 = §10.2 ResearchHandoffInput（artifact_ref/answered_requests/affected_decisions/key_findings/unresolved_requests/one_line_summary/critical_caveat）。",
      },
      [`research handoff: FAILED — handoff 文件不可读（${input.file}）`],
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `handoff 文件 ${input.file} 不是合法 JSON`,
        hint: "形态 = §10.2 ResearchHandoffInput；键位见 --file 帮助。",
      },
      [`research handoff: FAILED — SCHEMA_INVALID (handoff 非法 JSON)`],
    );
  }
  const shape = (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Partial<Record<keyof ResearchHandoffInput, unknown>>)
    : null);
  const arrayKeys = ["answered_requests", "unresolved_requests", "affected_decisions", "key_findings"] as const;
  const stringKeys = ["artifact_ref", "one_line_summary", "critical_caveat"] as const;
  const shapeGaps: string[] = [];
  if (shape === null) shapeGaps.push("顶层须为 JSON 对象（§10.2 ResearchHandoffInput）");
  for (const key of arrayKeys) {
    if (!Array.isArray(shape?.[key])) shapeGaps.push(`${key} 须为数组`);
  }
  for (const key of stringKeys) {
    const value = shape?.[key];
    if (typeof value !== "string" || value.trim().length === 0) shapeGaps.push(`${key} 须为非空字符串`);
  }
  if (shapeGaps.length > 0) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `handoff 形态预检失败：${shapeGaps.join("；")}`,
        hint: "§10.2 ResearchHandoffInput 形态；finding 条目 = finding_id/statement/evidence_type/sources/caveats/request_refs/decision_refs/relation（+RESOLVES_FACT 的 resolves_missing_facts）。",
      },
      [`research handoff: FAILED — SCHEMA_INVALID (handoff 形态)`],
    );
  }
  const handoff = parsed as ResearchHandoffInput;

  // —— 闸 4：图装载 ——
  const loaded = await loadDecisionGraph(rootDir, input.discoveryId);
  if (!loaded.ok) {
    return fail(loaded.error, [
      `research handoff: FAILED — ${loaded.error.code} (${input.discoveryId})`,
    ]);
  }
  const { graph } = loaded;

  // —— kernel 判卷（§10.1/§10.2 单一判卷源；零旁移） ——
  const outcome = applyResearchHandoff(graph, handoff);
  if (!outcome.ok) {
    return fail(
      {
        code: `RESEARCH_HANDOFF_${outcome.reason.toUpperCase()}`,
        message: `回填被 kernel applyResearchHandoff 拒绝（${outcome.reason}）：${outcome.details.join("；")}`,
        hint: outcome.hint,
      },
      [
        `research handoff: FAILED — RESEARCH_HANDOFF_${outcome.reason.toUpperCase()}`,
        ...outcome.details.map((d) => `  ${d}`),
        `  hint: ${outcome.hint}`,
      ],
    );
  }

  // —— 图回写（changed 才写——幂等重放零写入） ——
  if (outcome.changed) {
    try {
      await writeFile(
        decisionGraphPath(rootDir, input.discoveryId),
        `${JSON.stringify(outcome.graph, null, 2)}\n`,
        "utf8",
      );
    } catch (err) {
      return fail(
        {
          code: "IO_ERROR",
          message: `decision-graph.json 回写失败：${err instanceof Error ? err.message : String(err)}`,
          hint: "判卷已通过；修复目录权限后重跑本命令（幂等重放 NO_CHANGE）。",
        },
        [`research handoff: FAILED — IO_ERROR (graph 回写)`],
      );
    }
    // —— 判卷输入申报同拍同步（R6 重算制）：G6 路由申报以 missing_facts 现状为准——
    // RESOLVES_FACT 消解后事实不再是缺失事实，仍留在 missing_fact_routing 会被重算判
    // 「路由越界」（申报与重算脱节）。机械同步零新治理语义：只删「新图全图都不再缺失」
    // 的事实键；仍缺失（部分消解/CONFLICTS 场景）的路由原样保留。 ——
    const stillMissing = new Set<string>();
    for (const node of outcome.graph.decisions) {
      for (const fact of node.grounding.missing_facts) stillMissing.add(fact);
    }
    const inputsPath = decisionInputsPath(rootDir, input.discoveryId);
    const routing = { ...loaded.inputs.missing_fact_routing };
    let routingChanged = false;
    for (const fact of Object.keys(routing)) {
      if (!stillMissing.has(fact)) {
        delete routing[fact];
        routingChanged = true;
      }
    }
    if (routingChanged) {
      try {
        await writeFile(
          inputsPath,
          `${JSON.stringify({ ...loaded.inputs, missing_fact_routing: routing }, null, 2)}\n`,
          "utf8",
        );
      } catch (err) {
        return fail(
          {
            code: "IO_ERROR",
            message: `decision-inputs.json 路由申报同步失败：${err instanceof Error ? err.message : String(err)}`,
            hint: "图已回填；重跑本命令（幂等重放）即可补齐申报同步。",
          },
          [`research handoff: FAILED — IO_ERROR (inputs 同步)`],
        );
      }
    }
  }

  // —— index.yaml 入账：requests 状态 + handoff 三件 + key_findings 原样存档 ——
  const indexPath = join(discoveryScratchpadDirPath(rootDir, input.discoveryId), "research", "index.yaml");
  const statusMap = new Map<string, string>();
  for (const id of handoff.answered_requests) statusMap.set(id, "answered");
  for (const id of handoff.unresolved_requests) statusMap.set(id, "unresolved");
  let indexChanged = false;
  try {
    const mutation = await mutateIndexRequests(indexPath, `${padRef}research/`, padRef, (index) => {
      let touched = false;
      if (Array.isArray(index.requests)) {
        const requests = (index.requests as Record<string, unknown>[]).map((record) => {
          const next = typeof record?.id === "string" ? statusMap.get(record.id) : undefined;
          if (next !== undefined && record.status !== next) {
            touched = true;
            return { ...record, status: next };
          }
          return record;
        });
        if (touched) index.requests = requests;
      }
      const nextHandoff = {
        artifact_path: handoff.artifact_ref,
        one_line_summary: handoff.one_line_summary,
        critical_caveat: handoff.critical_caveat,
        key_findings: handoff.key_findings,
      };
      if (JSON.stringify(index.handoff) !== JSON.stringify(nextHandoff)) {
        index.handoff = nextHandoff;
        touched = true;
      }
      return touched;
    });
    indexChanged = mutation.changed || mutation.created;
  } catch (err) {
    const code = (err as { code?: string }).code;
    return fail(
      {
        code: typeof code === "string" ? code : "IO_ERROR",
        message: `research/index.yaml 入账失败：${err instanceof Error ? err.message : String(err)}`,
        hint:
          code === "INDEX_NOT_MACHINE_PARSEABLE"
            ? "入账要求机读 index.yaml；先运行 research <topic> 产出骨架（幂等）后重试。"
            : "图已回填（节点侧事实已挂回）；index 入账修复后重跑本命令幂等补账。",
      },
      [`research handoff: FAILED — ${typeof code === "string" ? code : "IO_ERROR"} (index 入账)`],
    );
  }

  const requestStatuses = [...statusMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, status]) => ({ id, status }));
  const human = [
    `research handoff → ${outcome.changed ? "APPLIED" : "NO_CHANGE"} (discovery=${input.discoveryId})`,
    `  artifact: ${handoff.artifact_ref}`,
    `  answered: ${handoff.answered_requests.length > 0 ? handoff.answered_requests.join("、") : "（无）"}；unresolved: ${handoff.unresolved_requests.length > 0 ? handoff.unresolved_requests.join("、") : "（无）"}`,
    ...outcome.notes.map((note) => `  note: ${note}`),
    `  graph: ${outcome.changed ? `已回填（fingerprint=${outcome.graph.graph_fingerprint.slice(0, 18)}…）` : "NO_CHANGE（幂等重放）"}；index: ${indexChanged ? "已入账（requests 状态 + handoff 三件）" : "NO_CHANGE"}`,
    ...(outcome.changed
      ? [
          "  下一步重判：pomaster brainstorm decide <id> --ready --msd-goal <bool> --msd-scope <bool> --msd-acceptance <bool>",
        ]
      : []),
  ];
  return okOutcome<ResearchHandoffResult>(
    "research handoff",
    {
      discovery_id: input.discoveryId,
      artifact_ref: handoff.artifact_ref,
      answered_requests: [...handoff.answered_requests],
      unresolved_requests: [...handoff.unresolved_requests],
      findings_total: handoff.key_findings.length,
      graph_changed: outcome.changed,
      graph_fingerprint: outcome.changed ? outcome.graph.graph_fingerprint : graph.graph_fingerprint,
      request_statuses: requestStatuses,
    },
    human,
  );
}
