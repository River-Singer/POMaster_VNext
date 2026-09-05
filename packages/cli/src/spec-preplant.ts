/**
 * spec-preplant.ts —— SPEC.* Evidence Spec 对象 init 预植（裁定批 D D2；Owner
 * 2026-09-05 裁定 (a)：init 预植——**新治理语义**，init 从此写 store）。
 *
 * 裁定台账：.trellis/tasks/09-04-pomaster-vnext-consolidated-prd/research/
 * owner-decisions-pending.md D2 行。B6e 遗留收口：evidence specs 20 件的头行
 * `- 对象面词形:SPEC.*` 此前只是登记级映射（无真实 store 对象）；本模块把登记级
 * 映射升级为 init 时点的真实对象预植。
 *
 * ADR（Owner 授权语义的忠实落地；自由度内决策逐项留痕）：
 *
 * - ADR-1 对象集与 id 单源：预植对象集 = 19 份 evidence spec（index.md 是索引非
 *   spec，不预植）；id = 播种件头行 `- 对象面词形:SPEC.<SLUG>(` 解析值（词形与对象
 *   id 单源——头行即登记，无第二套映射表）；解析自与播种同源的清单装载
 *   （InitOptions.seedManifest ?? loadSeedManifestEntries()），派生零第二事实源。
 *   id 文法判卷归 kernel parseGovernedId（A5 权威；词形不符 = 结构性包缺陷 throw）。
 *
 * - ADR-2 生命周期起步 = PROPOSED：六值主轴缺省起步（LIFECYCLE_VALUES 首值）；
 *   kernel 跨轴断言强制 PROPOSED ⇒ evidence=PLANNED。PROPOSED 不绑定 closeout
 *   判卷（B2 既有裁定 SPEC_NOT_BINDING）——预植 ≠ 项目已采纳，这是安全缺省：项目
 *   显式 PROPOSED→CURRENT（authority_approval）后才绑定判卷分母。confidence 起步
 *   = UNRESOLVED（项目未表态）；change = STABLE。
 *
 * - ADR-3 authority.owner = BOOTSTRAP_OWNER（init 骨架先例，init.ts 项目级默认
 *   owner）。由调用方（runInit）显式传入（本模块不反向依赖 init.ts——零环）。
 *   kernel GHOST_AUTHORITY_OWNER fail-closed：项目 authority.json 合法存在但无
 *   BOOTSTRAP_OWNER（人类已演进 owner 结构）→ SPEC_PREPLANT_SKIPPED warning +
 *   零触碰（init 文件面照常完成——预植失败不拖垮 init 自有面，缺席显式呈现）。
 *
 * - ADR-4 requirements 条款机械派生（零凭空发明）：对象 requirements[] = 播种件
 *   判定条款段（PRD §13.1 判定条款位：Assertions / Required Artifacts 两段）逐段
 *   一条款、文档序：
 *   · clause_id = 段名机械大写蛇形（ASSERTIONS / REQUIRED_ARTIFACTS——段名即锚，
 *     零发明编号）；
 *   · proof_type = 常量 "spec_section_anchor"（21 schema 开放词面——锚形条款的
 *     证明类型即「按播种件段落锚补证据」；词形收编随实盘物料走词汇表 PR）；
 *   · description = 播种件段落锚 `<包内资产路径> §<段名>`（文件引用+段名）；
 *   · claim_refs/gate_refs = []（资格清单留空——项目运行时按需填充；closeout 对
 *     空资格清单显式 UNSATISFIABLE + PROPOSED 不绑定，双保险禁「任意 claim 洗白」）；
 *   · subject_ref = 键缺席（21 schema 回退语义——Spec 级绑定；预植对象无绑定，
 *     语义中性）。
 *   派生逻辑测试钉（spec-preplant.spec.ts）：对象 requirements 与播种件判定段
 *   一一对应（文档序逐字对账）。
 *
 * - ADR-5 绑定前置形态：预植 payload = {spec_kind, title, requirements}——
 *   bound_task_ref/bound_change_ref 双键缺席。21-evidence-spec.schema.json anyOf
 *   （绑定至少其一非 null）在 init 时点无合法取值（项目尚无 task/change 可绑）；
 *   预植形态 = 21 profile 的绑定前置态，绑定填充归项目采纳动作（maintain upsert）。
 *   closeout 对无绑定 SPEC 对象诚实缺席（bind-mismatch continue，不入分母、零
 *   告警——closeout.ts 绑定匹配通路已核实，零改动）。
 *
 * - ADR-6 写通路：kernel applyTransaction 单事务 upsert 全部缺席对象（Owner 授权
 *   原话）——seq 正常前进、journal TX_APPLIED 一行留痕、零墙钟（无时间戳键）。
 *   seed-once 语义同播种件：对象已在座（**任意字节**，含项目改写/转移后的形态）
 *   零触碰——upsert op 不生成（预植不是再生成器，对象演进归项目治理通路；A3 不
 *   适用——对象 upsert 非 claim）；对象缺席才预植；全部在座 → 空 ops → 不发起
 *   事务（零变化零 journal 零 seq 空转）。
 *
 * - ADR-7 off-switch：InitOptions.specPreplant（init.ts 注入面，缺省开）——测试
 *   与特殊项目需要。仅注入面，不加 CLI 旗标（命令面零扩张——--help 钉版不动）。
 *
 * - ADR-8 失败语义：createStore/loadTruthIndex/applyTransaction 抛 GovernanceError
 *   （索引损坏 / owner 幽灵 / SCHEMA_INVALID 等）→ SPEC_PREPLANT_SKIPPED warning
 *   （附 kernel code 原文）+ skipped=true + 零触碰。理由：applyTransaction staged
 *   原子性保障零部分落盘；init 的自有文件面（62 机制文件 + 152 seeds）不因 store
 *   预植失败而失败；缺席经 warning 显式呈现不静默。
 *
 * - ADR-9 呈现：init 结果面 InitResult.specPreplant {planted, preserved, skipped}
 *   | null（null = off-switch 关）；doctor/status 增 spec_preplant {in_place, kit}
 *   呈现（沿 seeded_assets 纯读先例——truth-index 不可读 / 清单缺席 → 字段缺席
 *   显式；kit 口径 = 包内清单 evidence spec 分母轻量读取，不装载资产字节）。
 *
 * - ADR-10 provenance 源锚：每对象 sources[] 一条 {type: "design_seed",
 *   ref: <项目内播种路径>, capturedBy: "tool:pomaster-init", pin: {digest:
 *   "sha256:<种子字节>"}}——对象 ↔ 播种件字段的机械锚（digest = 装载内容 sha256，
 *   确定性零墙钟；种子后漂移由 pin 语义如实呈现为基线差异，非缺陷）。
 */

import { readFileSync } from "node:fs";
import type { GovernedId, ObjectEnvelopeInput, Store, TruthIndex } from "@pomaster/kernel";
import { applyTransaction, createStore, loadTruthIndex, parseGovernedId } from "@pomaster/kernel";
import type { CliWarning } from "./envelope.js";
import { seedsRootCandidates, sha256Hex } from "./seed-manifest.js";
import type { SeedEntry } from "./seeds.js";
import { TRUTH_INDEX_RELATIVE } from "./store-layout.js";

/** 预植判定条款的 proof_type 常量（ADR-4：开放词面——锚形条款单一词形）。 */
export const SPEC_PREPLANT_PROOF_TYPE = "spec_section_anchor";

/** 预植事务 journal note（TX_APPLIED note 键；审计留痕词形）。 */
export const SPEC_PREPLANT_TX_NOTE =
  "init SPEC.* preplant（裁定批 D D2 2026-09-05）：seed-once 预植，PROPOSED 起步";

/** 预植跳过 warning 码（ADR-3/ADR-8：缺席显式呈现不静默）。 */
export const SPEC_PREPLANT_SKIPPED_WARNING = "SPEC_PREPLANT_SKIPPED";

/** 判定条款段集（PRD §13.1 判定条款位；文档序派生——段名逐字锚 17 段固定结构）。 */
const JUDGMENT_SECTIONS: readonly string[] = ["Assertions", "Required Artifacts"];

/** evidence 播种目标前缀（InitFileReport/SeedEntry 路径词形，POSIX）。 */
const EVIDENCE_TARGET_PREFIX = ".pomaster/specs/evidence/";

/** 索引件词形（index.md 是 Kit 索引非 spec——不预植，ADR-1）。 */
const INDEX_BASENAME = "index.md";

/** 单条预植要求条款（21 schema requirement_clause 的预植子集形态；snake_case 落盘）。 */
export interface SpecPreplantClause {
  readonly clause_id: string;
  readonly proof_type: string;
  readonly description: string;
  readonly claim_refs: readonly string[];
  readonly gate_refs: readonly string[];
}

/** 单份 evidence spec 的预植计划条目（派生面——纯函数输出，确定性）。 */
export interface SpecPreplantPlanEntry {
  /** 播种件 slug（文件名去 .md）。 */
  readonly slug: string;
  /** 对象 id（头行 对象面词形——kernel 文法已判卷）。 */
  readonly specId: string;
  /** H1 标题（信封 title_zh 与 payload.title 同源）。 */
  readonly title: string;
  /** 包内资产路径（specs/evidence/<slug>.md——头行 路径 行同词形；provenance 描述锚）。 */
  readonly assetRef: string;
  /** 项目内播种路径（.pomaster/specs/evidence/<slug>.md——sources[].ref）。 */
  readonly seededRef: string;
  /** 种子内容 sha256（hex——sources[].pin.digest；确定性零墙钟）。 */
  readonly contentDigest: string;
  /** 判定条款（文档序——判定段逐段一条款，ADR-4）。 */
  readonly requirements: readonly SpecPreplantClause[];
}

/** 预植执行结果（init 结果面与测试断言面）。 */
export interface SpecPreplantOutcome {
  /** 本次预植对象数（缺席写入）。 */
  readonly planted: number;
  /** 已在座零触碰数（seed-once preserved——任意字节在座即计）。 */
  readonly preserved: number;
  /** true = 跳过（store 不可用 / owner 幽灵——warning 已呈现；planted=0）。 */
  readonly skipped: boolean;
}

/** doctor/status 呈现值（纯读；kit = 包内清单 evidence spec 分母）。 */
export interface SpecPreplantPresentation {
  /** truth-index 中 SPEC.* 对象行数（0 = 显式缺席）。 */
  readonly in_place: number;
  /** 包内清单 evidence spec 分母（19）。 */
  readonly kit: number;
}

/** 包内资产路径词形（provenance description 锚——头行 路径 行同词形）。 */
function assetRefOf(slug: string): string {
  return `specs/evidence/${slug}.md`;
}

/**
 * 单份 evidence spec 播种件解析（ADR-1/ADR-4）：头行 对象面词形 → 对象 id（kernel
 * 文法判卷）、H1 → 标题、判定段 → 条款（文档序）。结构性缺陷（头行缺席/词形非法/
 * 标题缺席/判定段缺席）一律 throw fail-closed——禁静默跳过（禁部分预植态）。
 */
export function parseEvidenceSpecSeed(slug: string, content: string): SpecPreplantPlanEntry {
  const lines = content.split("\n");
  const headerPrefix = "- 对象面词形:";
  const headerLine = lines.find((line) => line.startsWith(`${headerPrefix}SPEC.`));
  if (headerLine === undefined) {
    throw new Error(`evidence seed missing 对象面词形 header line: ${assetRefOf(slug)}`);
  }
  const rawId = headerLine.slice(headerPrefix.length);
  const paren = rawId.indexOf("(");
  const specId = (paren >= 0 ? rawId.slice(0, paren) : rawId).trim();
  try {
    parseGovernedId(specId);
  } catch (err) {
    throw new Error(
      `evidence seed 对象面词形 is not a governed id: ${specId} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!specId.startsWith("SPEC.")) {
    throw new Error(`evidence seed 对象面词形 must be SPEC.* prefixed: ${specId}`);
  }
  const titleLine = lines.find((line) => line.startsWith("# "));
  if (titleLine === undefined || titleLine.slice(2).trim().length === 0) {
    throw new Error(`evidence seed missing H1 title: ${assetRefOf(slug)}`);
  }
  const title = titleLine.slice(2).trim();
  const requirements: SpecPreplantClause[] = [];
  for (const line of lines) {
    if (!line.startsWith("## ")) continue;
    const section = line.slice(3).trim();
    if (!JUDGMENT_SECTIONS.includes(section)) continue;
    requirements.push({
      clause_id: section.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_"),
      proof_type: SPEC_PREPLANT_PROOF_TYPE,
      description: `${assetRefOf(slug)} §${section}`,
      claim_refs: [],
      gate_refs: [],
    });
  }
  const missing = JUDGMENT_SECTIONS.filter(
    (section) => !requirements.some((clause) => clause.description.endsWith(`§${section}`)),
  );
  if (missing.length > 0) {
    throw new Error(
      `evidence seed missing judgment sections (${missing.join(", ")}): ${assetRefOf(slug)}`,
    );
  }
  return {
    slug,
    specId,
    title,
    assetRef: assetRefOf(slug),
    seededRef: `${EVIDENCE_TARGET_PREFIX}${slug}.md`,
    contentDigest: sha256Hex(content),
    requirements,
  };
}

/**
 * 预植计划派生（ADR-1）：清单 → evidence spec 子集（index.md 除外）→ 逐件解析。
 * 路径序排序（确定性——清单序即 deterministic，但显式排序不依赖清单书写序）。
 */
export function buildSpecPreplantPlan(
  entries: readonly SeedEntry[],
): readonly SpecPreplantPlanEntry[] {
  const evidenceEntries = entries
    .filter((entry) => entry.path.startsWith(EVIDENCE_TARGET_PREFIX))
    .filter((entry) => entry.path.endsWith(".md"))
    .filter((entry) => !entry.path.endsWith(`/${INDEX_BASENAME}`))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return evidenceEntries.map((entry) => {
    const slug = entry.path.slice(EVIDENCE_TARGET_PREFIX.length, -".md".length);
    return parseEvidenceSpecSeed(slug, entry.content);
  });
}

/** 预植信封组装（ADR-2/3/4/5/10；kind 收窄 profile = business_rule 惯例 rule_default）。 */
function specPreplantEnvelope(entry: SpecPreplantPlanEntry, owner: string): ObjectEnvelopeInput {
  return {
    id: entry.specId as GovernedId,
    kind: "business_rule",
    axisProfile: "rule_default",
    axes: {
      lifecycle: "PROPOSED",
      confidence: "UNRESOLVED",
      evidence: "PLANNED",
      change: "STABLE",
    },
    titleZh: entry.title,
    authority: { owner, delegates: [] },
    origin: "ingested",
    payload: {
      spec_kind: "evidence_spec",
      title: entry.title,
      requirements: entry.requirements.map((clause) => ({
        clause_id: clause.clause_id,
        proof_type: clause.proof_type,
        description: clause.description,
        claim_refs: [...clause.claim_refs],
        gate_refs: [...clause.gate_refs],
      })),
    },
    sources: [
      {
        type: "design_seed",
        ref: entry.seededRef,
        capturedBy: "tool:pomaster-init",
        pin: { digest: `sha256:${entry.contentDigest}` },
      },
    ],
  };
}

function warnSkipped(warnings: CliWarning[], err: unknown): void {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  warnings.push({
    code: SPEC_PREPLANT_SKIPPED_WARNING,
    message: `SPEC.* preplant skipped: ${code !== undefined ? `${code}: ` : ""}${message}`,
    hint: "init 文件面不受影响；修复 store（或 authority owner 登记）后重跑 pomaster init 补预植（seed-once：缺席对象才落）。",
  });
}

/**
 * 预植执行（ADR-3/6/8）：计划 → 在座判重（truth-index 对象 id 集）→ 缺席对象单事务
 * upsert。已在座（任意字节）零触碰；全在座 → 不发起事务；kernel 拒绝（含幽灵
 * owner）→ warning + skipped（staged 原子性保障零部分落盘）。
 */
export async function runSpecPreplant(
  rootDir: string,
  seedEntries: readonly SeedEntry[],
  owner: string,
  warnings: CliWarning[],
): Promise<SpecPreplantOutcome> {
  const plan = buildSpecPreplantPlan(seedEntries);
  if (plan.length === 0) {
    return { planted: 0, preserved: 0, skipped: false };
  }
  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    warnSkipped(warnings, err);
    return { planted: 0, preserved: 0, skipped: true };
  }
  let index: TruthIndex;
  try {
    index = await loadTruthIndex(store);
  } catch (err) {
    warnSkipped(warnings, err);
    return { planted: 0, preserved: 0, skipped: true };
  }
  const present = new Set(index.objects.map((row) => row.id as string));
  const pending = plan.filter((entry) => !present.has(entry.specId));
  const preserved = plan.length - pending.length;
  if (pending.length === 0) {
    return { planted: 0, preserved, skipped: false };
  }
  try {
    await applyTransaction(store, {
      ops: pending.map((entry) => ({
        op: "upsert_object" as const,
        envelope: specPreplantEnvelope(entry, owner),
      })),
      note: SPEC_PREPLANT_TX_NOTE,
    });
  } catch (err) {
    warnSkipped(warnings, err);
    return { planted: 0, preserved, skipped: true };
  }
  return { planted: pending.length, preserved, skipped: false };
}

// ============================================================
// doctor/status 呈现（ADR-9；沿 seeded_assets 纯读先例）
// ============================================================

/**
 * 包内清单 evidence spec 分母（轻量）：只读 manifest.json 计数，不装载资产字节
 * （loadSeedManifestEntries 全量校验太重，status/doctor 读路径禁背 152 份资产 IO）。
 * 清单缺席/不可解析 → null（呈现字段缺席——显式缺席纪律）。
 */
export function specPreplantKitSize(): number | null {
  for (const seedsRoot of seedsRootCandidates(import.meta.url)) {
    try {
      const doc = JSON.parse(readFileSync(`${seedsRoot}/manifest.json`, "utf8")) as {
        entries?: readonly { asset?: string }[];
      };
      if (!Array.isArray(doc.entries)) return null;
      return doc.entries.filter(
        (entry) =>
          typeof entry.asset === "string" &&
          entry.asset.startsWith("specs/evidence/") &&
          entry.asset.endsWith(".md") &&
          !entry.asset.endsWith(`/${INDEX_BASENAME}`),
      ).length;
    } catch {
      // 换下一候选（src/dist 双形态）；全失 → null。
    }
  }
  return null;
}

/**
 * doctor/status 预植呈现读取（纯读；truth-index 不可读/清单缺席 → null → 字段缺席）。
 * lenient JSON 读取（不跑 01 校验——呈现位不判卷，损坏索引由 status/doctor 各自的
 * 既有读路径显式报错；本helper只数 SPEC.* 行）。
 */
export async function readSpecPreplantPresentation(
  rootDir: string,
): Promise<SpecPreplantPresentation | null> {
  const { readFile } = await import("node:fs/promises");
  let raw: string | null = null;
  try {
    raw = await readFile(`${rootDir}/${TRUTH_INDEX_RELATIVE}`, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const objects = (parsed as { objects?: unknown })?.objects;
  const inPlace = Array.isArray(objects)
    ? objects.filter(
        (row) =>
          typeof (row as { id?: unknown })?.id === "string" &&
          String((row as { id?: unknown }).id).startsWith("SPEC."),
      ).length
    : 0;
  const kit = specPreplantKitSize();
  if (kit === null) return null;
  return { in_place: inPlace, kit };
}

/** 预植呈现 human 行词形（doctor/status 共用——单一实现禁两套口径漂移）。 */
export function specPreplantHumanLine(presentation: SpecPreplantPresentation): string {
  return (
    `  spec preplant: ${presentation.in_place}/${presentation.kit} in place` +
    "（PROPOSED 起步——D2 init 预植；closeout 绑定判卷资格 = lifecycle CURRENT）"
  );
}
