/**
 * catalog.ts —— Engineering Catalog（catalog/）共享读取器 + catalog-lock 校验（P14）。
 *
 * §69 步骤 12「Catalog→运行时联结」的唯一 catalog 读取面：projection（context compile）
 * 与 CLI（catalog status/explain）共用本模块，禁止各消费点散落 readdir/readFile 旁路
 * ——读取面单点、lock 校验口径单点（「101 文件 0 运行时消费」的结构根源之一就是没有
 * 共享读取器；P12 的 gates 消费先例是编译期投影常量 + 自检测试，本模块补上运行时面）。
 *
 * §92.2 边界（Catalog 不是第二套 Project Truth）：catalog 物料是检索式注入的策展源
 * （curation source），Project State（.pomaster/truth/** + truth-index）仍是唯一真相。
 * 本模块只读 catalog/、零写入、零治理事实；catalog 条目永不进 truth-index，lock 漂移
 * 永不阻断消费（D24 哈希伦理：write_blocking=false，失配 → WARN 呈现 + auto-regen hint）。
 *
 * 完整性三层（P-v06 批次 2.5 成文）——哈希校验的是 pomaster 自身资产与治理状态的
 * 「未被静默篡改」，不是项目过程文档的写作流程：
 * 1) 工具自身资产（catalog/ 受控五节）= hash 强呈现：catalog status 漂移 exit 1
 *    （体检命令异常显性，Owner 裁决 2026-09-03）+ `pomaster catalog relock` 恢复键
 *    （幂等重算 sha256 是 D24 工具侧动作非治理事实——无授权闸、零时戳、字节幂等）；
 * 2) 项目治理产物（.pomaster/**）= D24 只报不拦：reconcile content_drift 呈现，
 *    写作流程不禁（Project Truth 的修正走治理面显式事务，不靠哈希闸拦写作）；
 * 3) 词表/schema = VOCAB_MISMATCH FATAL：closed-world 根不属「项目文档」，词形外
 *    值显式爆（本模块五节 loader 的词表闸同根）。
 *
 * catalog-lock（read-side 指纹，D24 / x-digest-ethics）对账口径：
 * - content_sha256 = sha256(文件 utf-8 字节)——materialize_catalog_pilot.py /
 *   materialize_batch4_uplift.py 的写入口径，本模块按同一算法对账：漂移当且仅当
 *   物料变更而未重锁（producer 与对账端共用同一计算，枚举多头拷贝同款免疫）；
 * - controlled_children 只管辖 gates/knowledge/policies/sensors 四目录（tools/、
 *   candidates/、projection-presets/ 与 lock 自身不在管辖面——unexpected_file 只在
 *   管辖目录内判；sensors/ 为 P1-5 Sensor Capability Catalog Lite 新增管辖目录，
 *   PRD v0.5.2 §6.5/§14 P1-5，裁决 8（2026-09-01）D6/D7）。
 *
 * 词形纪律：lane/enforcement/classification 对账 packages/schemas 已登记的
 * CATALOG_LANE_VALUES / CATALOG_ENFORCEMENT_VALUES / CATALOG_CLASSIFICATION_VALUES
 * （vocab-lock catalog_layer_vocab 段，PR-0001 收编）；词表外值 = SCHEMA_INVALID
 * fail-closed（坏物料 ≠ catalog 缺席，禁静默当空）。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  CATALOG_CHANGE_CLASS_VALUES,
  CATALOG_CLASSIFICATION_VALUES,
  CATALOG_ENFORCEMENT_VALUES,
  CATALOG_GOVERNANCE_PROFILE_VALUES,
  CATALOG_KIND_VALUES,
  CATALOG_LANE_VALUES,
  SUBSTRATE_LAYER_VALUES,
  TRUTH_BODY_KINDS,
  type CatalogChangeClassValue,
  type CatalogClassificationValue,
  type CatalogEnforcementValue,
  type CatalogGovernanceProfileValue,
  type CatalogLaneValue,
  type SubstrateLayerValue,
  type TruthBodyKind,
} from "@pomaster/schemas";
import { GovernanceError, GovernedIdParseError, governanceCodeForParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { readText } from "./io.js";

type UnknownRecord = Record<string, unknown>;

/** catalog/ 在仓库内的目录名（与 controlled_children 相对路径的基准）。 */
// archetypes 是 P-v06 批次 1 新增管辖面（D-2 裁定：Engineering Substrate 标准件物料，
// catalog-lock controlled_children 同款治理——sensors P1-5 扩面先例）。
const CATALOG_SECTIONS = ["archetypes", "gates", "knowledge", "policies", "sensors"] as const;

// ============================================================
// catalog-lock 文档（catalog/catalog-lock.draft.json 的机器形态）
// ============================================================

export interface CatalogLockEntry {
  readonly id: string;
  /** catalog 根相对 posix 路径（如 policies/policy.web.api.single_http_client.json）。 */
  readonly path: string;
  readonly content_sha256: string;
  readonly source_ref: string;
}

export interface CatalogLockDocument {
  readonly file: string;
  readonly catalog_version: string;
  readonly profile: string;
  readonly controlled_children: {
    readonly allowed: readonly string[];
    readonly required: readonly string[];
  };
  readonly entries: readonly CatalogLockEntry[];
}

/** 漂移种类（kind 词为 CLI 呈现与测试对账的局部词，TODO(vocab-pr) 不进词表闭包）。 */
export type CatalogLockDriftKind =
  | "lock_unreadable"
  | "lock_malformed"
  | "missing"
  | "content_drift"
  | "entry_not_allowed"
  | "missing_required"
  | "unexpected_file";

export interface CatalogLockDrift {
  readonly kind: CatalogLockDriftKind;
  /** catalog 根相对路径（lock 自身漂移时为 lock 文件名）。 */
  readonly path: string;
  readonly detail: string;
}

export interface CatalogLockVerification {
  readonly ok: boolean;
  readonly entries_checked: number;
  readonly drifts: readonly CatalogLockDrift[];
}

/** lock 文件名（kernel 读取位与 CLI relock 落盘位共用同一单点常量）。 */
export const LOCK_FILE_NAME = "catalog-lock.draft.json";

// ============================================================
// 定位与读取
// ============================================================

/**
 * catalog 根候选链（缺省定位的候选生成器；导出为纯函数便于测试注入）。
 * 候选顺序即裁决：**仓库形态优先、包内资产兜底**——
 * 1) `../../../catalog`：仓库布局（src 与 dist 同构：packages/kernel/{src,dist}/catalog.js
 *    → 仓库根 catalog/；仓内行为零变化）；
 * 2) `../catalog`：npm 安装形态的包内资产（bundle 位于 <pkg>/dist/ 时命中 <pkg>/catalog/
 *    ——嵌入方未暴露 --catalog-root 时的缺省可解析位）。
 */
export function catalogRootCandidates(moduleUrl: string): readonly string[] {
  return [
    fileURLToPath(new URL("../../../catalog", moduleUrl)),
    fileURLToPath(new URL("../catalog", moduleUrl)),
  ];
}

/**
 * 定位 catalog/ 根目录。显式参数优先（测试/嵌入方注入）；缺省按 catalogRootCandidates
 * 候选链顺序取第一个实存目录（仓库布局优先、包内资产兜底——npm 安装形态不再因缺省定位
 * 只兼容 monorepo 而全灭 NOT_CONFIGURED）。全部候选缺席 → NOT_CONFIGURED 显式报错
 * （缺席显式，禁静默返回空路径；hint 提及两种布局与注入路标）。
 */
export function resolveCatalogRoot(explicitRoot?: string): string {
  if (explicitRoot !== undefined) {
    if (!existsSync(explicitRoot)) {
      throw new GovernanceError(
        "NOT_CONFIGURED",
        `注入的 catalog 根目录不存在: ${explicitRoot}`,
        "确认 --catalog-root 路径或测试注入的 catalogRoot；catalog 物料缺席与路径拼错是两种缺席，路径错要修参数。",
        { catalogRoot: explicitRoot },
      );
    }
    return explicitRoot;
  }
  const candidates = catalogRootCandidates(import.meta.url);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new GovernanceError(
    "NOT_CONFIGURED",
    `catalog/ 目录未找到（候选均缺席: ${candidates.join(" 、 ")}）`,
    "catalog/ 是 POMaster_VNext 仓库资产（仓库布局 packages/kernel/{src,dist} → 仓库根 catalog/）或 npm 安装形态的包内资产（<pkg>/dist/ → <pkg>/catalog/）；嵌入方无法命中时显式注入 catalog 根目录。",
    { catalogRootCandidates: candidates },
  );
}

/** 读 catalog-lock（缺失/坏形显式报错——lock 是 catalog 消费的完整性前提）。 */
export function readCatalogLock(catalogRoot: string): CatalogLockDocument {
  const lockPath = join(catalogRoot, LOCK_FILE_NAME);
  const raw = readText(lockPath);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      `catalog-lock 缺失: ${LOCK_FILE_NAME}`,
      "catalog-lock 是 catalog 物料的 read-side 指纹（D24）；恢复键 = pomaster catalog relock 幂等重锁（lock 缺失形态 relock 拒绝初始化——需先重跑 catalog/tools/materialize_*.py 物化重生成）。",
      { lockPath },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog-lock 不可解析（JSON 坏形）: ${LOCK_FILE_NAME}`,
      "catalog-lock 被手改坏：恢复键 = pomaster catalog relock（幂等重锁要求完整 lock——本坏形形态先恢复原字节或重跑 catalog/tools/materialize_*.py 幂等重生成）。",
      { lockPath, cause: String(error) },
    );
  }
  const body = parsed as UnknownRecord;
  const entries = body["entries"];
  const children = body["controlled_children"] as UnknownRecord | undefined;
  if (
    typeof body["catalog_version"] !== "string" ||
    typeof body["profile"] !== "string" ||
    !Array.isArray(entries) ||
    children === undefined ||
    !Array.isArray(children["allowed"]) ||
    !Array.isArray(children["required"])
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog-lock 形状非法（缺 catalog_version/profile/entries/controlled_children）: ${LOCK_FILE_NAME}`,
      "catalog-lock 结构由 materialize 工具维护；手工编辑破坏形状后请幂等重生成。",
      { lockPath },
    );
  }
  return {
    file: LOCK_FILE_NAME,
    catalog_version: body["catalog_version"] as string,
    profile: body["profile"] as string,
    controlled_children: {
      allowed: (children["allowed"] as readonly unknown[]).map((item) => String(item)),
      required: (children["required"] as readonly unknown[]).map((item) => String(item)),
    },
    entries: (entries as readonly unknown[]).map((item) => {
      const entry = item as UnknownRecord;
      return {
        id: String(entry["id"] ?? ""),
        path: String(entry["path"] ?? ""),
        content_sha256: String(entry["content_sha256"] ?? ""),
        source_ref: String(entry["source_ref"] ?? ""),
      };
    }),
  };
}

/** lock 同口径哈希（producer 写入口径：sha256(文件 utf-8 字节)，"sha256:" 前缀词形）。 */
export function sha256OfUtf8(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// ============================================================
// catalog-lock 校验（漂移检测：物料改而未重锁 → 显式检出）
// ============================================================

/**
 * catalog-lock 漂移检测（P14 出口判据：catalog 物料被改而 lock 未重锁 → 显式检出）。
 * 对账四面：entries[].path 文件存在性 / 内容哈希 / entries ⊆ allowed /
 * required ⊆ 目录实存 / 目录实存 ⊆ allowed（unexpected_file 只查管辖四目录）。
 * 纯读：不写不修（D24 write_blocking=false；修复动作是 producer 工具重锁，不是这里）。
 */
export function verifyCatalogLock(
  catalogRoot: string,
  lock?: CatalogLockDocument,
): CatalogLockVerification {
  const drifts: CatalogLockDrift[] = [];
  let document: CatalogLockDocument;
  try {
    document = lock ?? readCatalogLock(catalogRoot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      entries_checked: 0,
      drifts: [{ kind: "lock_unreadable", path: LOCK_FILE_NAME, detail }],
    };
  }

  // 1) entries：文件存在性 + 内容哈希对账 + 登记 ⊆ allowed。
  const onDiskBySection = new Map<string, Set<string>>();
  for (const section of CATALOG_SECTIONS) {
    const dir = join(catalogRoot, section);
    onDiskBySection.set(
      section,
      existsSync(dir)
        ? new Set(readdirSync(dir).filter((name) => name.endsWith(".json")))
        : new Set<string>(),
    );
  }
  for (const entry of document.entries) {
    const target = join(catalogRoot, entry.path);
    const raw = readText(target);
    if (raw === null) {
      drifts.push({
        kind: "missing",
        path: entry.path,
        detail: `lock 登记 id=${entry.id} 但文件缺失（登记在册必须实存）`,
      });
      continue;
    }
    const actual = sha256OfUtf8(raw);
    if (actual !== entry.content_sha256) {
      drifts.push({
        kind: "content_drift",
        path: entry.path,
        detail: `物料被改而 lock 未重锁：期望 ${entry.content_sha256}，实算 ${actual}（id=${entry.id}；恢复键 = pomaster catalog relock 幂等重锁，或重跑 catalog/tools/materialize_*.py）`,
      });
    }
    if (!document.controlled_children.allowed.includes(entry.path)) {
      drifts.push({
        kind: "entry_not_allowed",
        path: entry.path,
        detail: `lock entries 登记了 controlled_children.allowed 之外的路径（lock 内部失自洽；id=${entry.id}）`,
      });
    }
  }

  // 2) required ⊆ 目录实存。
  for (const path of document.controlled_children.required) {
    const section = path.split("/")[0] ?? "";
    const fileName = path.split("/")[1] ?? "";
    const onDisk = onDiskBySection.get(section);
    if (onDisk === undefined || !onDisk.has(fileName)) {
      drifts.push({
        kind: "missing_required",
        path,
        detail: "controlled_children.required 声明必须存在的文件缺失",
      });
    }
  }

  // 3) 目录实存 ⊆ allowed（管辖四目录内的新文件必须先登记 allowed+required）。
  for (const section of CATALOG_SECTIONS) {
    const onDisk = onDiskBySection.get(section) ?? new Set<string>();
    for (const fileName of onDisk) {
      const relative = `${section}/${fileName}`;
      if (!document.controlled_children.allowed.includes(relative)) {
        drifts.push({
          kind: "unexpected_file",
          path: relative,
          detail:
            "管辖目录出现 controlled_children.allowed 之外的文件（新增 catalog 文件须同步 allowed+required 两处后重锁）",
        });
      }
    }
  }

  drifts.sort((a, b) => (a.path === b.path ? (a.kind < b.kind ? -1 : 1) : a.path < b.path ? -1 : 1));
  return { ok: drifts.length === 0, entries_checked: document.entries.length, drifts };
}

// ============================================================
// catalog-lock 重锁计算（relock：CLI 恢复键的判卷权威；P-v06 批次 2.5）
// ============================================================

/**
 * relock 幂等注记（追加进 generated_by；已含则不重复）。
 * 幂等重锁不含时戳（A4 禁墙钟）——同物料两次 relock 的 next 字节全等。
 */
export const CATALOG_RELOCK_GENERATED_BY_NOTE =
  "pomaster catalog relock（CLI 恢复键；幂等重锁不含时戳——A4）";

/**
 * relock 重建的 lock 文档：CatalogLockDocument 的机器字段（除 file——它是
 * readCatalogLock 的派生标签，落盘形态无此键）+ 原样保留的 lock 扩展键
 * （generated_by / x-digest-ethics / note 等，索引签名承载；键序沿原 lock 文件）。
 * CLI 落盘直接 JSON.stringify 本对象——扩展键保真是 relock 的硬约束（只重建
 * controlled_children/entries/generated_by 三键，其余键原样透传）。
 */
export interface CatalogRelockNextDocument {
  readonly catalog_version: string;
  readonly profile: string;
  readonly controlled_children: {
    readonly allowed: readonly string[];
    readonly required: readonly string[];
  };
  readonly entries: readonly CatalogLockEntry[];
  /** producer 注记位（原值 + CATALOG_RELOCK_GENERATED_BY_NOTE 幂等追加）。 */
  readonly generated_by?: string;
  /** 其余扩展键原样保留（x-digest-ethics / note / 未来扩展——键序沿原文件）。 */
  readonly [key: string]: unknown;
}

export interface CatalogRelockReport {
  readonly previous: CatalogLockDocument;
  readonly next: CatalogRelockNextDocument;
  /** 新增物料路径（扫描有、previous 无；字典序）。 */
  readonly added: readonly string[];
  /** 消失物料路径（previous 有、扫描无；字典序）。 */
  readonly removed: readonly string[];
  /** 哈希刷新路径（两侧都在、content_sha256 变化；字典序）。 */
  readonly refreshed: readonly string[];
}

/**
 * catalog-lock 重锁计算（`pomaster catalog relock` 的判卷权威；纯计算零写盘——
 * 返回 next 内容，落盘归 CLI 层，分层纪律同 status/explain）。
 *
 * 重建口径（与 verifyCatalogLock / materialize producer 同一算法）：
 * - 扫描 CATALOG_SECTIONS 五节全部 *.json：逐文件读 id（缺失/非字符串 → SCHEMA_INVALID
 *   fail-closed——坏物料 ≠ 可重锁，禁静默跳过）+ content_sha256 = sha256OfUtf8(文件字节)；
 * - entries = 全部扫描条目按 id 排序（path = `<section>/<file>`；source_ref 沿用
 *   previous 同路径条目——provenance 是人类可维护的登记位，relock 不重写历史；
 *   全新条目 = `package://catalog/<path>` 确定性缺省）；id 跨节重复 → SCHEMA_INVALID
 *   （身份面禁重复，loadCatalogSensors 同法）；
 * - controlled_children.allowed = required = 全部扫描路径排序（加删文件后三方
 *   entries/allowed/required 自动对齐）；
 * - catalog_version / profile / x-digest-ethics / note 等扩展键原样保留（原键序）；
 * - generated_by 幂等追加 CATALOG_RELOCK_GENERATED_BY_NOTE（已含则不重复；
 *   缺席则置为注记；非字符串 → SCHEMA_INVALID）。
 *
 * 边界 fail-closed：lock 缺失/坏形 → 透传 readCatalogLock 的 NOT_CONFIGURED /
 * SCHEMA_INVALID（relock 不是初始化工具，禁从零造账）。幂等：同物料两次 relock
 * 的 next 字节全等（无时戳——A4；generated_by 注记只追加一次）。
 */
export function relockCatalog(catalogRoot: string): CatalogRelockReport {
  const previous = readCatalogLock(catalogRoot);
  const previousByPath = new Map(previous.entries.map((entry) => [entry.path, entry]));

  const scannedEntries: CatalogLockEntry[] = [];
  const scannedPaths: string[] = [];
  const seenIds = new Set<string>();
  for (const section of CATALOG_SECTIONS) {
    const dir = join(catalogRoot, section);
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
      const path = `${section}/${fileName}`;
      const raw = readFileSync(join(dir, fileName), "utf8");
      let body: UnknownRecord;
      try {
        body = asRecord(JSON.parse(raw));
      } catch (error) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料不可解析（relock 无法重锁坏形物料）: ${path}`,
          "物料 JSON 坏形先恢复原字节（Git）或重跑 catalog/tools/materialize_*.py；relock 只重锁可解析物料。",
          { file: path, cause: String(error) },
        );
      }
      const id = body["id"];
      if (typeof id !== "string" || id.length === 0) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料缺 id 字段（relock 以物料 id 重建 entries）: ${path}`,
          "id 是 catalog 物料身份字段（五节物料统一要求）；对照同目录在册条目修复。",
          { file: path },
        );
      }
      if (seenIds.has(id)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 id 跨节重复（身份面禁重复）: ${id}`,
          "id 是 lock entries 的身份分母；重复说明物料管理失序，删除或合并重复文件。",
          { file: path, id },
        );
      }
      seenIds.add(id);
      scannedPaths.push(path);
      scannedEntries.push({
        id,
        path,
        content_sha256: sha256OfUtf8(raw),
        source_ref: previousByPath.get(path)?.source_ref ?? `package://catalog/${path}`,
      });
    }
  }
  scannedEntries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  scannedPaths.sort();

  const scannedPathSet = new Set(scannedPaths);
  const added = scannedPaths.filter((path) => !previousByPath.has(path));
  const removed = [...new Set(previous.entries.map((entry) => entry.path))]
    .filter((path) => !scannedPathSet.has(path))
    .sort();
  // refreshed 分母 = 两侧都在（added 路径 previous 无 entry——undefined !== hash 恒真，
  // 不设 has 位会把新增物料重复计入 refreshed；与 doc 注记「两侧都在」对齐）。
  const refreshed = scannedEntries
    .filter(
      (entry) =>
        previousByPath.has(entry.path) &&
        previousByPath.get(entry.path)?.content_sha256 !== entry.content_sha256,
    )
    .map((entry) => entry.path);

  // 原样保留扩展键：只重建 controlled_children/entries/generated_by 三键，其余键
  // 原值原键序透传（Object.assign 保序——原键在前、新增键按覆盖序追加在后）。
  const lockPath = join(catalogRoot, LOCK_FILE_NAME);
  const rawLock = JSON.parse(readFileSync(lockPath, "utf8")) as UnknownRecord;
  const rawGeneratedBy = rawLock["generated_by"];
  if (rawGeneratedBy !== undefined && typeof rawGeneratedBy !== "string") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog-lock generated_by 形状非法（须字符串或缺席）: ${LOCK_FILE_NAME}`,
      "generated_by 是 lock 的 producer 注记位；坏形先恢复原字节再重锁。",
      { lockPath },
    );
  }
  const generatedBy =
    typeof rawGeneratedBy === "string"
      ? rawGeneratedBy.includes(CATALOG_RELOCK_GENERATED_BY_NOTE)
        ? rawGeneratedBy
        : `${rawGeneratedBy} + ${CATALOG_RELOCK_GENERATED_BY_NOTE}`
      : CATALOG_RELOCK_GENERATED_BY_NOTE;

  const next = Object.assign({}, rawLock, {
    controlled_children: { allowed: scannedPaths, required: [...scannedPaths] },
    entries: scannedEntries,
    generated_by: generatedBy,
  }) as CatalogRelockNextDocument;

  return { previous, next, added, removed, refreshed };
}

// ============================================================
// 物料读取：policies / tools / projection-presets
// ============================================================

/** policy/authority 物料的运行时消费形态（正文策展字段 + 消费所需身份 + 机器 applicability 字段）。 */
export interface CatalogPolicyMaterial {
  /** catalog 根相对路径（出处呈现用，如 policies/policy.web.api.single_http_client.json）。 */
  readonly file: string;
  readonly id: string;
  readonly kind: string;
  readonly classification: CatalogClassificationValue;
  readonly titleZh: string;
  readonly statementZh: string;
  readonly lane: CatalogLaneValue;
  /**
   * lanes 复数双读（PRD §5.2 / vocab-lock catalog_layer_vocab.applicability_fields，
   * PR-0005；Owner 裁决 8 ② 2026-09-01「双读过渡」）：applies_when.lanes 在场取其数组；
   * 缺席回退 [lane] 单值（未标注条目 lane 回退判定，行为零变化——O7）。
   */
  readonly lanes: readonly CatalogLaneValue[];
  /** applies_when.lanes 是否显式声明（lane 回退 vs 机器全字段判定的分界位；空数组=声明但无角色约束）。 */
  readonly declaresLanes: boolean;
  /**
   * Capability 清单（applies_when.capabilities；CAPABILITY.* governed id 词形，A5 closed-world
   * 校验同 permit capability_refs 先例）。空数组 = 未声明（该轴不参与确定性判定）。
   */
  readonly capabilities: readonly string[];
  /** 变更类目清单（applies_when.change_classes ∈ CATALOG_CHANGE_CLASS_VALUES，PR-0005 词轴）。 */
  readonly changeClasses: readonly CatalogChangeClassValue[];
  /** 治理档位清单（applies_when.governance_profiles ∈ CATALOG_GOVERNANCE_PROFILE_VALUES，O2 对齐）。 */
  readonly governanceProfiles: readonly CatalogGovernanceProfileValue[];
  /** 治理对象 kind 清单（applies_when.object_kinds ∈ TRUTH_BODY_KINDS——复用十类零新轴）。 */
  readonly objectKinds: readonly TruthBodyKind[];
  /** 声明了任一机器 applicability 字段（true=全字段确定性判定；false=lane 回退判定，O7）。 */
  readonly hasMachineApplicability: boolean;
  /**
   * 声明了留位不登记词轴（applies_when.risk_at_least / technologies——Owner 裁决 8 ② O4：
   * 只检存在不解析值、词轴不入 vocab-lock；消费面以 not_configured 显式缺席呈现，禁半成品假绿）。
   */
  readonly declaredUnregisteredAxes: readonly ("risk_at_least" | "technologies")[];
  readonly appliesWhenCondition: string;
  /**
   * 自然语言 applicability 说明（PRD §5.2 applicability_note 降级位：可保留但「不得作为唯一
   * 机器路由条件」）。applies_when.applicability_note 缺席时回退 condition 原文（现库 94 条
   * condition 中文词面即其承载——标注战役 T3 逐步显式化）。
   */
  readonly applicabilityNote: string;
  readonly enforcement: CatalogEnforcementValue;
  readonly lifecycle: string;
  readonly authorityOwner: string;
}

function asRecord(value: unknown): UnknownRecord {
  return (typeof value === "object" && value !== null ? value : {}) as UnknownRecord;
}

/**
 * 读 policies/ 全部条目（authority.* 与 policy.* 同为 kind=policy）。
 * 词表对账 fail-closed：lane/enforcement/classification 词表外或必填字段缺失
 * → SCHEMA_INVALID（坏物料显式爆，禁静默跳过——静默跳过 = 消费面假绿）。
 * P0.5-1（PRD §5.2/vocab-pr-0005）：applies_when 机器 applicability 字段同款
 * fail-closed 解析——lanes 值集对账 V7、capabilities 过 governed id 文法+CAPABILITY
 * 前缀闭包、change_classes/governance_profiles/object_kinds 对账 PR-0005 词轴与
 * truth_bodies；risk_at_least/technologies 只检存在不解析值（O4 留位不登记）。
 */
export function loadCatalogPolicies(catalogRoot: string): readonly CatalogPolicyMaterial[] {
  const dir = join(catalogRoot, "policies");
  if (!existsSync(dir)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog/policies/ 目录缺失: ${dir}`,
      "policies/ 是 catalog-lock required 管辖面；目录缺失说明物料不完整，重跑 materialize 工具。",
      { dir },
    );
  }
  /** 数组字段解析：缺席 → []；非数组/非字符串元素 → SCHEMA_INVALID（坏物料显式爆）。 */
  const stringArrayOf = (raw: unknown, file: string, axis: string): readonly string[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料 applies_when.${axis} 须为数组: ${file}（实为 ${typeof raw}）`,
        `applies_when.${axis} 是机器 applicability 字段（PRD §5.2）；数组词形由 materialize 工具维护。`,
        { file, axis },
      );
    }
    for (const item of raw) {
      if (typeof item !== "string") {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 applies_when.${axis} 元素须为字符串: ${file}（${String(item)}）`,
          `applies_when.${axis} 元素词形见 vocab-lock catalog_layer_vocab；手改破坏词形请幂等重生成。`,
          { file, axis, item: String(item) },
        );
      }
    }
    return raw as string[];
  };
  const materials: CatalogPolicyMaterial[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const file = `policies/${fileName}`;
    const raw = readFileSync(join(dir, fileName), "utf8");
    let body: UnknownRecord;
    try {
      body = asRecord(JSON.parse(raw));
    } catch (error) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料不可解析: ${file}`,
        "物料 JSON 坏形：重跑 catalog/tools/materialize_*.py 幂等重生成。",
        { file, cause: String(error) },
      );
    }
    const id = body["id"];
    const titleZh = body["title_zh"];
    const statementZh = body["statement_zh"];
    const classification = body["classification"];
    const enforcement = body["enforcement"];
    const appliesWhen = asRecord(body["applies_when"]);
    const lane = appliesWhen["lane"];
    const axes = asRecord(body["axes"]);
    const authority = asRecord(body["authority"]);
    if (
      typeof id !== "string" || id.length === 0 ||
      typeof titleZh !== "string" ||
      typeof statementZh !== "string" ||
      typeof appliesWhen["condition"] !== "string"
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料缺必填字段（id/title_zh/statement_zh/applies_when.condition）: ${file}`,
        "物料由 materialize 工具从 candidates 物化；缺字段说明物料形状漂移，幂等重生成。",
        { file },
      );
    }
    if (!CATALOG_CLASSIFICATION_VALUES.includes(classification as never)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料 classification 词表外: ${file}（${String(classification)}）`,
        `classification 须 ∈ CATALOG_CLASSIFICATION_VALUES（vocab-lock catalog_layer_vocab）；扩值走词汇表 PR。`,
        { file, classification: String(classification) },
      );
    }
    if (!CATALOG_LANE_VALUES.includes(lane as never)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料 applies_when.lane 词表外: ${file}（${String(lane)}）`,
        `lane 须 ∈ CATALOG_LANE_VALUES（V7 最小闭包）；扩值走词汇表 PR。`,
        { file, lane: String(lane) },
      );
    }
    if (!CATALOG_ENFORCEMENT_VALUES.includes(enforcement as never)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料 enforcement 词表外: ${file}（${String(enforcement)}）`,
        `enforcement 须 ∈ CATALOG_ENFORCEMENT_VALUES（V5）；扩值走词汇表 PR。`,
        { file, enforcement: String(enforcement) },
      );
    }
    // —— P0.5-1 机器 applicability 字段（缺席=诚实缺省 lane 回退，O7；在场=fail-closed 对账） ——
    const declaresLanes = appliesWhen["lanes"] !== undefined;
    const lanesRaw = stringArrayOf(appliesWhen["lanes"], file, "lanes");
    for (const laneItem of lanesRaw) {
      if (!CATALOG_LANE_VALUES.includes(laneItem as never)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 applies_when.lanes 词表外: ${file}（${laneItem}）`,
          `lanes 值集复用 CATALOG_LANE_VALUES（V7，vocab-pr-0005 applicability_fields 注记）；扩值走词汇表 PR。`,
          { file, lanes: laneItem },
        );
      }
    }
    const capabilities: string[] = [];
    for (const capability of stringArrayOf(appliesWhen["capabilities"], file, "capabilities")) {
      try {
        const parsed = parseGovernedId(capability);
        if (parsed.prefix !== "CAPABILITY") {
          throw new GovernanceError(
            "SCHEMA_INVALID",
            `catalog 物料 applies_when.capabilities 前缀非 CAPABILITY: ${file}（${capability}）`,
            "capabilities 须为 CAPABILITY.* governed id（A5 closed-world；capability_refs 五件套同款词形）。",
            { file, capability },
          );
        }
      } catch (error) {
        if (error instanceof GovernedIdParseError) {
          throw new GovernanceError(
            governanceCodeForParseError(error),
            `catalog 物料 applies_when.capabilities 词形非法: ${file}（${capability}）`,
            "capabilities 须为 CAPABILITY.* governed id（A5 closed-world 文法）；legacy 拼写走 resolveAlias 收编。",
            { file, capability, reason: error.reason },
          );
        }
        throw error;
      }
      capabilities.push(capability);
    }
    const changeClasses: CatalogChangeClassValue[] = [];
    for (const item of stringArrayOf(appliesWhen["change_classes"], file, "change_classes")) {
      if (!CATALOG_CHANGE_CLASS_VALUES.includes(item as never)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 applies_when.change_classes 词表外: ${file}（${item}）`,
          `change_classes 须 ∈ CATALOG_CHANGE_CLASS_VALUES（vocab-pr-0005 词轴）；扩值走词汇表 PR。`,
          { file, changeClass: item },
        );
      }
      changeClasses.push(item as CatalogChangeClassValue);
    }
    const governanceProfiles: CatalogGovernanceProfileValue[] = [];
    for (const item of stringArrayOf(appliesWhen["governance_profiles"], file, "governance_profiles")) {
      if (!CATALOG_GOVERNANCE_PROFILE_VALUES.includes(item as never)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 applies_when.governance_profiles 词表外: ${file}（${item}）`,
          `governance_profiles 须 ∈ CATALOG_GOVERNANCE_PROFILE_VALUES（O2 对齐 TRIAGE_PROFILES+STRICT）；扩值走词汇表 PR。`,
          { file, governanceProfile: item },
        );
      }
      governanceProfiles.push(item as CatalogGovernanceProfileValue);
    }
    const objectKinds: TruthBodyKind[] = [];
    for (const item of stringArrayOf(appliesWhen["object_kinds"], file, "object_kinds")) {
      if (!TRUTH_BODY_KINDS.includes(item as never)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog 物料 applies_when.object_kinds 词表外: ${file}（${item}）`,
          `object_kinds 复用 TRUTH_BODY_KINDS 十类（零新轴，vocab-pr-0005 applicability_fields 注记）。`,
          { file, objectKind: item },
        );
      }
      objectKinds.push(item as TruthBodyKind);
    }
    // 留位不登记词轴（O4）：只检存在、不解析值——消费面 not_configured 显式呈现。
    const declaredUnregisteredAxes: ("risk_at_least" | "technologies")[] = [];
    if (appliesWhen["risk_at_least"] !== undefined) declaredUnregisteredAxes.push("risk_at_least");
    if (appliesWhen["technologies"] !== undefined) declaredUnregisteredAxes.push("technologies");
    const hasMachineApplicability =
      declaresLanes ||
      capabilities.length > 0 ||
      changeClasses.length > 0 ||
      governanceProfiles.length > 0 ||
      objectKinds.length > 0;
    materials.push({
      file,
      id,
      kind: String(body["kind"] ?? ""),
      classification: classification as CatalogClassificationValue,
      titleZh,
      statementZh,
      lane: lane as CatalogLaneValue,
      lanes: declaresLanes
        ? (lanesRaw as CatalogLaneValue[])
        : [lane as CatalogLaneValue],
      declaresLanes,
      capabilities,
      changeClasses,
      governanceProfiles,
      objectKinds,
      hasMachineApplicability,
      declaredUnregisteredAxes,
      appliesWhenCondition: appliesWhen["condition"] as string,
      applicabilityNote:
        typeof appliesWhen["applicability_note"] === "string"
          ? (appliesWhen["applicability_note"] as string)
          : (appliesWhen["condition"] as string),
      enforcement: enforcement as CatalogEnforcementValue,
      lifecycle: String(axes["lifecycle"] ?? ""),
      authorityOwner: String(authority["owner"] ?? ""),
    });
  }
  return materials;
}

/** tools/ 物料消费形态：文件名即身份（懒加载清单按需物化）。 */
export interface CatalogToolMaterial {
  readonly file: string;
  readonly name: string;
}

/** 读 tools/ 全部文件（readdir 确定性排序；空目录 = 显式空清单，由调用方呈现）。 */
export function loadCatalogTools(catalogRoot: string): readonly CatalogToolMaterial[] {
  const dir = join(catalogRoot, "tools");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name !== "." && name !== "..")
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => ({ file: `tools/${name}`, name }));
}

/** projection-presets/ 物料消费形态：身份三元组（name/kind/status）。 */
export interface CatalogProjectionPresetMaterial {
  readonly file: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
}

/**
 * 读 projection-presets/*.yaml 的身份三元组（preset.name/kind/status）。
 * 仓库纪律不引 YAML 运行时依赖（digest.ts 同款注记）：preset 块的头三行键值
 * 是本目录消费所需的全部机器面（渲染逻辑归渲染器砖，D25④，不在 P14 范围）。
 * 身份行缺失 = SCHEMA_INVALID（预设文件坏形显式爆，禁静默）。
 */
export function loadCatalogProjectionPresets(
  catalogRoot: string,
): readonly CatalogProjectionPresetMaterial[] {
  const dir = join(catalogRoot, "projection-presets");
  if (!existsSync(dir)) return [];
  const materials: CatalogProjectionPresetMaterial[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort()) {
    const file = `projection-presets/${fileName}`;
    const lines = readFileSync(join(dir, fileName), "utf8").split("\n");
    const pick = (key: string): string | null => {
      const pattern = new RegExp(`^ {2}${key}:(?:\\s+(\\S+))?\\s*(?:#.*)?$`);
      let inPreset = false;
      for (const line of lines) {
        if (/^preset:\s*(?:#.*)?$/.test(line)) {
          inPreset = true;
          continue;
        }
        if (inPreset) {
          if (/^\S/.test(line)) break; // 离开 preset 块
          const match = pattern.exec(line);
          if (match !== null && match[1] !== undefined) return match[1];
        }
      }
      return null;
    };
    const name = pick("name");
    const kind = pick("kind");
    const status = pick("status");
    if (name === null || kind === null || status === null) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `projection preset 身份三元组（preset.name/kind/status）缺失: ${file}`,
        "预设文件是配置骨架（CONFIG SKELETON）；身份行被删说明形状漂移，对照 docs/registry-tree-projection-preset.md 修复。",
        { file, name, kind, status },
      );
    }
    materials.push({ file, name, kind, status });
  }
  return materials;
}

// ============================================================
// P1-5 Sensor Capability Catalog Lite（PRD v0.5.2 §6.5/§14 P1-5；裁决 8 D6/D7）
// ============================================================

/**
 * SENSOR.<DOMAIN>.<KIND> 点族词形（裁决 8 D6=A，照研究侧推荐实施）。
 * 非 governed 前缀（catalog 物料身份非 governed id）——x-vocab-pr 注记沿
 * catalog/gates/gate.web.api.request_checks.json 的 GATE. 先例，登记歧义不消歧。
 */
export const SENSOR_ID_PATTERN = /^SENSOR\.[A-Z0-9_]+\.[A-Z0-9_]+$/;

/**
 * Observation Surface 词表（PRD §6.4 八面逐字；§6.4 明言「不要求立即成为新的
 * Closed-world Core Vocab」——开放枚举登记于此单点，扩值走词汇表 PR。
 * TODO(vocab-pr-0005)：词表三镜像登记归主控批次，本常量为暂载位。
 */
export const OBSERVATION_SURFACE_VALUES = [
  "USER_SURFACE",
  "INTERACTION_STATE",
  "BOUNDARY_IO",
  "RUNTIME_SIGNAL",
  "DATA_STATE",
  "RESOURCE_BEHAVIOR",
  "STRUCTURAL_REALITY",
  "PRODUCTION_REALITY",
] as const;
export type ObservationSurfaceValue = (typeof OBSERVATION_SURFACE_VALUES)[number];

/**
 * side_effect_class 已登记值（开放枚举单点登记；PRD §6.5 例文两值 + 新登记
 * SANDBOXED_EXECUTION=观察动作在沙箱内执行被测代码、副作用限于可丢弃产物）。
 * TODO(vocab-pr-0005)：同上，扩值走词汇表 PR。
 */
export const SENSOR_SIDE_EFFECT_CLASS_VALUES = [
  "INTERACTIVE_REVERSIBLE",
  "READ_ONLY",
  "SANDBOXED_EXECUTION",
] as const;
export type SensorSideEffectClassValue = (typeof SENSOR_SIDE_EFFECT_CLASS_VALUES)[number];

/**
 * availability_probe.surface 已登记引用面（防第二套探测机制=四克制：availability_probe
 * 只允许声明式引用既有单一事实源面，catalog 是数据不执行——可执行性永远归
 * gauntlet-lite toolDetectors/gateAdapters 或 kernel 既有面）：
 * - toolDetectors —— gauntlet-lite toolDetectors 15 探测器单一探测面（index.ts:260-276）；
 * - gateAdapters  —— gauntlet-lite gateAdapters adapter registry（BUILD 无独立探测器键，
 *   探测在 build-adapter.detect 内联于 adapter 契约）；
 * - kernel        —— kernel 侧数据/判定面（SENSOR_KERNEL_SURFACE_KEYS 键闭包）。
 * TODO(vocab-pr-0005)：同上，扩值走词汇表 PR。
 */
export const SENSOR_AVAILABILITY_SURFACE_VALUES = [
  "toolDetectors",
  "gateAdapters",
  "kernel",
] as const;
export type SensorAvailabilitySurfaceValue = (typeof SENSOR_AVAILABILITY_SURFACE_VALUES)[number];

/** kernel 面可用键闭包（fail-closed 校验锚；新增 kernel 观察面在此单点登记）。 */
export const SENSOR_KERNEL_SURFACE_KEYS = ["production_control_band"] as const;

/** availability_probe 消费形态（声明式引用：surface=引用面 + keys=该面既有键）。 */
export interface SensorAvailabilityProbe {
  readonly surface: SensorAvailabilitySurfaceValue;
  readonly keys: readonly string[];
}

/** sensor_capability 物料的运行时消费形态（§6.5 六字段 + 身份）。 */
export interface CatalogSensorMaterial {
  /** catalog 根相对路径（出处呈现用，如 sensors/sensor.browser.interactive.json）。 */
  readonly file: string;
  readonly id: string;
  readonly kind: string;
  readonly titleZh: string;
  readonly surfaces: readonly string[];
  readonly operations: readonly string[];
  readonly sideEffectClass: SensorSideEffectClassValue;
  readonly evidenceTypes: readonly string[];
  readonly implementations: readonly string[];
  readonly availabilityProbe: SensorAvailabilityProbe;
  /** fallback 传感器 id（可空数组=显式登记无降级；§6.6 明言 Browser 双通道互不替代）。 */
  readonly fallback: readonly string[];
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

/**
 * 读 sensors/ 全部条目（P1-5 六条 Sensor Capability：PRD §14「只收编真实存在」——
 * Playwright / Chrome DevTools MCP / Build·Type·Lint / Contract / Performance /
 * Production Metric·Control Band）。
 *
 * 词表对账 fail-closed（loadCatalogPolicies 同法）：id 词形 / Observation Surface 八面 /
 * side_effect_class / availability_probe.surface / kernel 面键闭包——词表外值或必填字段
 * 缺失 → SCHEMA_INVALID（坏物料显式爆，禁静默跳过——静默跳过 = 消费面假绿）。
 * fallback 允许空数组（显式无降级）；id 全目录唯一（身份面禁重复）。
 * 返回按 id 字典序（确定性）。
 */
export function loadCatalogSensors(catalogRoot: string): readonly CatalogSensorMaterial[] {
  const dir = join(catalogRoot, "sensors");
  if (!existsSync(dir)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog/sensors/ 目录缺失: ${dir}`,
      "sensors/ 是 catalog-lock required 管辖面（P1-5 登记后）；目录缺失说明物料不完整，对照 catalog-lock.draft.json required 段恢复。",
      { dir },
    );
  }
  const materials = new Map<string, CatalogSensorMaterial>();
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const file = `sensors/${fileName}`;
    const raw = readFileSync(join(dir, fileName), "utf8");
    let body: UnknownRecord;
    try {
      body = asRecord(JSON.parse(raw));
    } catch (error) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料不可解析: ${file}`,
        "物料 JSON 坏形：sensor_capability 条目为 W1-E 登记物料，对照同目录在册条目修复。",
        { file, cause: String(error) },
      );
    }
    const id = body["id"];
    const titleZh = body["title_zh"];
    const surfaces = body["surfaces"];
    const operations = body["operations"];
    const sideEffectClass = body["side_effect_class"];
    const evidenceTypes = body["evidence_types"];
    const implementations = body["implementations"];
    const fallback = body["fallback"];
    const probe = asRecord(body["availability_probe"]);
    const probeSurface = probe["surface"];
    const probeKeys = probe["keys"];
    if (
      typeof id !== "string" ||
      !SENSOR_ID_PATTERN.test(id) ||
      typeof titleZh !== "string" ||
      !isNonEmptyStringArray(surfaces) ||
      !isNonEmptyStringArray(operations) ||
      !isNonEmptyStringArray(evidenceTypes) ||
      !isNonEmptyStringArray(implementations) ||
      !Array.isArray(fallback) ||
      !fallback.every((item) => typeof item === "string" && SENSOR_ID_PATTERN.test(item))
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability 缺必填字段或词形非法（id=SENSOR.<DOMAIN>.<KIND>/title_zh/surfaces/operations/evidence_types/implementations/fallback）: ${file}`,
        "sensor_capability 条目形状由 P1-5 契约定义（裁决 8 D6=A 点族词形）；对照在册六条目修复。",
        { file, id: String(id) },
      );
    }
    if (!surfaces.every((s) => OBSERVATION_SURFACE_VALUES.includes(s as never))) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability surfaces 词表外: ${file}（${JSON.stringify(surfaces)}）`,
        `surfaces 须 ⊆ OBSERVATION_SURFACE_VALUES（PRD §6.4 八面）；扩值走词汇表 PR（TODO(vocab-pr-0005)）。`,
        { file, id },
      );
    }
    if (!SENSOR_SIDE_EFFECT_CLASS_VALUES.includes(sideEffectClass as never)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability side_effect_class 词表外: ${file}（${String(sideEffectClass)}）`,
        `side_effect_class 须 ∈ SENSOR_SIDE_EFFECT_CLASS_VALUES；扩值走词汇表 PR（TODO(vocab-pr-0005)）。`,
        { file, id, side_effect_class: String(sideEffectClass) },
      );
    }
    if (
      !SENSOR_AVAILABILITY_SURFACE_VALUES.includes(probeSurface as never) ||
      !isNonEmptyStringArray(probeKeys)
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability availability_probe 形状非法（surface ∈ ${SENSOR_AVAILABILITY_SURFACE_VALUES.join("/")} + keys 非空字符串数组）: ${file}`,
        "availability_probe 是声明式引用不是执行体（四克制：防第二套探测机制）——只许引用既有单一事实源面的既有键。",
        { file, id, surface: String(probeSurface) },
      );
    }
    if (
      probeSurface === "kernel" &&
      !probeKeys.every((k) => SENSOR_KERNEL_SURFACE_KEYS.includes(k as never))
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability availability_probe kernel 面键闭包外: ${file}（${JSON.stringify(probeKeys)}）`,
        `kernel 面可用键 ⊆ SENSOR_KERNEL_SURFACE_KEYS（${SENSOR_KERNEL_SURFACE_KEYS.join("/")}）；新 kernel 观察面先在常量登记再引用。`,
        { file, id },
      );
    }
    if (materials.has(id)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog sensor_capability id 重复（身份面禁重复）: ${id}`,
        "SENSOR.* id 是 catalog 家族身份；重复说明物料管理失序，删除或合并重复文件。",
        { file, id },
      );
    }
    materials.set(id, {
      file,
      id,
      kind: String(body["kind"] ?? ""),
      titleZh,
      surfaces: surfaces as readonly string[],
      operations: operations as readonly string[],
      sideEffectClass: sideEffectClass as SensorSideEffectClassValue,
      evidenceTypes: evidenceTypes as readonly string[],
      implementations: implementations as readonly string[],
      availabilityProbe: {
        surface: probeSurface as SensorAvailabilitySurfaceValue,
        keys: probeKeys as readonly string[],
      },
      fallback: fallback as readonly string[],
    });
  }
  return [...materials.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ============================================================
// 物料读取：archetypes（Engineering Substrate 标准件；P-v06 批次 0/D-2 裁定）
// ============================================================

/** archetype 物料的运行时消费形态（v0.6.1 §4 Catalog Object 通用结构的最小判卷面）。 */
export interface CatalogArchetypeMaterial {
  /** catalog 根相对路径（出处呈现用，如 archetypes/archetype.page.master_data.json）。 */
  readonly file: string;
  readonly id: string;
  /** 恒 "archetype"（vocab-lock catalog_layer_vocab.catalog_kind，PR-0006；词表闸校验）。 */
  readonly kind: string;
  /** Substrate 分层（software_graph_vocab.substrate_layer 七值，PR-0006；词表闸校验）。 */
  readonly layer: SubstrateLayerValue;
  readonly titleZh: string;
  /** What It Is（v0.6.1 §5 Human Reference 页第 1 段的机器承载位）。 */
  readonly summaryZh: string;
  /** 组合面（v0.6.1 §4 composition：requires/optional/incompatible——resolver required_bindings 派生源）。 */
  readonly composition: {
    readonly requires: readonly string[];
    readonly optional: readonly string[];
    readonly incompatible: readonly string[];
  };
  /** 语义面（v0.6.1 §4 semantic：responsibility/when_to_use/when_not_to_use；可选）。 */
  readonly semantic: {
    readonly responsibility: string | null;
    readonly whenToUse: string | null;
    readonly whenNotToUse: string | null;
  };
  /**
   * 研究锚（物料 x-research-anchors：note + sources[].url；P-v06 批次 2 resolver
   * referenceTokens 消费位——参照系词形来源）。字段缺席（或槽位缺席）→ null/[]
   * 诚实缺省：不新增必填校验（批次 1 既有 10 物料与全部既有测试零破坏——锚位是
   * 增量消费位不是准入门槛）；槽位在场但形态非法仍 fail-closed（坏锚 ≠ 无锚，
   * 禁静默丢弃——loadCatalogSensors 词表闸同法）。
   */
  readonly referenceAnchors: {
    readonly note: string | null;
    readonly urls: readonly string[];
  };
}

/**
 * 读 archetypes/ 全部条目（Engineering Substrate 标准件物料；P-v06 批次 1 起物化）。
 *
 * opt-in 语义（与「禁止空壳仪式」PRD v0.6 §10 配套）：目录缺失 → 空数组显式返回
 * （未物化 = 零标准件是合法状态；resolver sources_examined 分母披露 0，禁猜测）。
 * 目录在场则逐文件 fail-closed（loadCatalogSensors 同法）：id 词形（catalog 条目 id
 * 至少两段 SCREAMING_SNAKE，relation sidecar CATALOG_ENDPOINT_ID_PATTERN 同一法式）
 * / kind 词表闸（catalog_kind，PR-0006）/ layer 词表闸（substrate_layer，PR-0006）/
 * title_zh/summary_zh 必填 / composition 三数组词形（catalog id）——坏物料显式爆，
 * 禁静默跳过。id 全目录唯一。返回按 id 字典序（确定性）。
 * P-v06 批次 2 增量：x-research-anchors（note + sources[].url）可选装载——缺席
 * null/[] 诚实缺省不设门槛，在场坏形 fail-closed（validateReferenceAnchors）。
 */
export function loadCatalogArchetypes(catalogRoot: string): readonly CatalogArchetypeMaterial[] {
  const dir = join(catalogRoot, "archetypes");
  if (!existsSync(dir)) {
    return [];
  }
  const materials = new Map<string, CatalogArchetypeMaterial>();
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const file = `archetypes/${fileName}`;
    const raw = readFileSync(join(dir, fileName), "utf8");
    let body: UnknownRecord;
    try {
      body = asRecord(JSON.parse(raw));
    } catch (error) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog 物料不可解析: ${file}`,
        "物料 JSON 坏形：archetype 条目为 P-v06 D-2 裁定登记物料（catalog 面），对照 catalog_layer_vocab.catalog_kind 修复。",
        { file, cause: String(error) },
      );
    }
    const id = body["id"];
    const kind = body["kind"];
    const layer = body["layer"];
    const titleZh = body["title_zh"];
    const summaryZh = body["summary_zh"];
    if (
      typeof id !== "string" ||
      !CATALOG_ARCHETYPE_ID_PATTERN.test(id) ||
      !CATALOG_KIND_VALUES.includes(kind as never) ||
      !SUBSTRATE_LAYER_VALUES.includes(layer as never) ||
      typeof titleZh !== "string" ||
      titleZh.length === 0 ||
      typeof summaryZh !== "string" ||
      summaryZh.length === 0
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog archetype 缺必填字段或词形非法（id 至少两段 SCREAMING_SNAKE / kind ∈ CATALOG_KIND_VALUES / layer ∈ SUBSTRATE_LAYER_VALUES / title_zh / summary_zh）: ${file}`,
        "archetype 条目形状由 P-v06 D-2 裁定 + vocab-lock software_graph_vocab（PR-0006）定义；对照在册条目修复。",
        { file, id: String(id) },
      );
    }
    const composition = validateComposition(body["composition"], file, id);
    const semantic = validateSemantic(body["semantic"], file, id);
    const referenceAnchors = validateReferenceAnchors(body["x-research-anchors"], file, id);
    if (materials.has(id)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog archetype id 重复（身份面禁重复）: ${id}`,
        "archetype id 是 Engineering Substrate 标准件身份；重复说明物料管理失序，删除或合并重复文件。",
        { file, id },
      );
    }
    materials.set(id, {
      file,
      id,
      kind: String(kind),
      layer: layer as SubstrateLayerValue,
      titleZh,
      summaryZh,
      composition,
      semantic,
      referenceAnchors,
    });
  }
  return [...materials.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** archetype id 词形（catalog 条目 id：至少两段 SCREAMING_SNAKE；与 relation 端点同法式）。 */
const CATALOG_ARCHETYPE_ID_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]+)+$/;

/** composition 面校验（v0.6.1 §4；三槽均可空数组——组合约束显式登记，缺席=无约束不是未知）。 */
function validateComposition(
  value: unknown,
  file: string,
  id: string,
): CatalogArchetypeMaterial["composition"] {
  if (value === undefined || value === null) {
    return { requires: [], optional: [], incompatible: [] };
  }
  const record = value as UnknownRecord;
  const slots: [string, unknown][] = [
    ["requires", record["requires"]],
    ["optional", record["optional"]],
    ["incompatible", record["incompatible"]],
  ];
  const out: Record<string, readonly string[]> = {};
  for (const [slot, list] of slots) {
    if (list === undefined || list === null) {
      out[slot] = [];
      continue;
    }
    if (
      !Array.isArray(list) ||
      !list.every((item) => typeof item === "string" && CATALOG_ARCHETYPE_ID_PATTERN.test(item))
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog archetype composition.${slot} 形态非法（须 catalog id 词形数组）: ${file}`,
        "组合约束引用的是标准件 id（v0.6.1 §4 composition）；自由文本不是机器可判卷约束。",
        { file, id, slot },
      );
    }
    out[slot] = list as readonly string[];
  }
  return {
    requires: out["requires"] ?? [],
    optional: out["optional"] ?? [],
    incompatible: out["incompatible"] ?? [],
  };
}

/** semantic 面校验（v0.6.1 §4 semantic 三槽可选；非空字符串或缺席）。 */
function validateSemantic(
  value: unknown,
  file: string,
  id: string,
): CatalogArchetypeMaterial["semantic"] {
  if (value === undefined || value === null) {
    return { responsibility: null, whenToUse: null, whenNotToUse: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog archetype semantic 形态非法（须对象）: ${file}`,
      "semantic 是 v0.6.1 §4 三槽语义面；坏形物料显式爆。",
      { file, id },
    );
  }
  const record = value as UnknownRecord;
  const pick = (key: string): string | null => {
    const slot = record[key];
    if (slot === undefined || slot === null) return null;
    if (typeof slot !== "string" || slot.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog archetype semantic.${key} 形态非法（须非空字符串或缺席）: ${file}`,
        "semantic 三槽是 resolver「why」呈现位；坏形显式爆。",
        { file, id, key },
      );
    }
    return slot;
  };
  return {
    responsibility: pick("responsibility"),
    whenToUse: pick("when_to_use"),
    whenNotToUse: pick("when_not_to_use"),
  };
}

/**
 * x-research-anchors 校验（P-v06 批次 2；研究锚位）：整体缺席 → {note:null, urls:[]}
 * 诚实缺省（锚位是增量消费位不是准入门槛——不新增必填校验）；整体在场则逐槽
 * fail-closed：note 须为非空字符串或 null/缺席、sources 须为数组且每元素为对象、
 * url 须为非空字符串（坏锚显式爆，禁静默丢弃——坏锚 ≠ 无锚）。fetched 等其余
 * 槽位不消费不校验（本面只取 resolver referenceTokens 所需两件）。
 */
function validateReferenceAnchors(
  value: unknown,
  file: string,
  id: string,
): CatalogArchetypeMaterial["referenceAnchors"] {
  if (value === undefined || value === null) {
    return { note: null, urls: [] };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog archetype x-research-anchors 形态非法（须对象）: ${file}`,
      "研究锚位是 P-v06 批次 2 resolver 参照词形来源；坏形物料显式爆。",
      { file, id },
    );
  }
  const record = value as UnknownRecord;
  const noteSlot = record["note"];
  if (noteSlot !== undefined && noteSlot !== null && (typeof noteSlot !== "string" || noteSlot.length === 0)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `catalog archetype x-research-anchors.note 形态非法（须非空字符串或缺席/null）: ${file}`,
      "note 是参照系词形来源之一；坏锚显式爆禁静默丢。",
      { file, id },
    );
  }
  const sources = record["sources"];
  const urls: string[] = [];
  if (sources !== undefined && sources !== null) {
    if (!Array.isArray(sources)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `catalog archetype x-research-anchors.sources 形态非法（须数组）: ${file}`,
        "sources[].url 是参照系词形来源之一；坏锚显式爆禁静默丢。",
        { file, id },
      );
    }
    for (const item of sources) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog archetype x-research-anchors.sources 元素形态非法（须对象）: ${file}`,
          "sources[].url 是参照系词形来源之一；坏锚显式爆禁静默丢。",
          { file, id },
        );
      }
      const url = (item as UnknownRecord)["url"];
      if (typeof url !== "string" || url.length === 0) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `catalog archetype x-research-anchors.sources[].url 缺失或非非空字符串: ${file}`,
          "url 是参照系词形来源；坏锚显式爆禁静默丢。",
          { file, id },
        );
      }
      urls.push(url);
    }
  }
  return {
    note: typeof noteSlot === "string" ? noteSlot : null,
    urls,
  };
}
