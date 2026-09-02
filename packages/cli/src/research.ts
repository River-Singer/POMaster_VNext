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
import type { ResearchModeValue } from "@pomaster/schemas";
import {
  RESEARCH_ARTIFACT_FILES,
  adjudicateResearchFindings,
  checkResearchWriteContract,
  type ResearchFindingAdjudication,
  type ResearchFindingInput,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  DISCOVERY_ID_PATTERN,
  discoveryScratchpadsDirPath,
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
