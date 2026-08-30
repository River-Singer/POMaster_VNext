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
 * catalog-lock（read-side 指纹，D24 / x-digest-ethics）对账口径：
 * - content_sha256 = sha256(文件 utf-8 字节)——materialize_catalog_pilot.py /
 *   materialize_batch4_uplift.py 的写入口径，本模块按同一算法对账：漂移当且仅当
 *   物料变更而未重锁（producer 与对账端共用同一计算，枚举多头拷贝同款免疫）；
 * - controlled_children 只管辖 gates/knowledge/policies 三目录（tools/、candidates/、
 *   projection-presets/ 与 lock 自身不在管辖面——unexpected_file 只在管辖目录内判）。
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
  CATALOG_CLASSIFICATION_VALUES,
  CATALOG_ENFORCEMENT_VALUES,
  CATALOG_LANE_VALUES,
  type CatalogClassificationValue,
  type CatalogEnforcementValue,
  type CatalogLaneValue,
} from "@pomaster/schemas";
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";

type UnknownRecord = Record<string, unknown>;

/** catalog/ 在仓库内的目录名（与 controlled_children 相对路径的基准）。 */
const CATALOG_SECTIONS = ["gates", "knowledge", "policies"] as const;

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

const LOCK_FILE_NAME = "catalog-lock.draft.json";

// ============================================================
// 定位与读取
// ============================================================

/**
 * 定位 catalog/ 根目录。显式参数优先（测试/嵌入方注入）；缺省从本模块位置上溯仓库根
 * （src 与 dist 同构：packages/kernel/{src,dist}/catalog.js → ../../../catalog）。
 * 目录缺席 → NOT_CONFIGURED 显式报错（缺席显式，禁静默返回空路径）。
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
  const defaultRoot = fileURLToPath(new URL("../../../catalog", import.meta.url));
  if (!existsSync(defaultRoot)) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      `catalog/ 目录未找到（缺省定位 ${defaultRoot}）`,
      "catalog/ 是 POMaster_VNext 仓库资产：在仓库内运行，或显式注入 catalog 根目录。",
      { catalogRoot: defaultRoot },
    );
  }
  return defaultRoot;
}

/** 读 catalog-lock（缺失/坏形显式报错——lock 是 catalog 消费的完整性前提）。 */
export function readCatalogLock(catalogRoot: string): CatalogLockDocument {
  const lockPath = join(catalogRoot, LOCK_FILE_NAME);
  const raw = readText(lockPath);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      `catalog-lock 缺失: ${LOCK_FILE_NAME}`,
      "catalog-lock 是 catalog 物料的 read-side 指纹（D24）；先跑 catalog/tools/materialize_*.py 物化并重锁。",
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
      "catalog-lock 被手改坏：重跑 catalog/tools/materialize_*.py 幂等重生成。",
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
 * required ⊆ 目录实存 / 目录实存 ⊆ allowed（unexpected_file 只查管辖三目录）。
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
        detail: `物料被改而 lock 未重锁：期望 ${entry.content_sha256}，实算 ${actual}（id=${entry.id}；重跑 catalog/tools/materialize_*.py 幂等重锁）`,
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

  // 3) 目录实存 ⊆ allowed（管辖三目录内的新文件必须先登记 allowed+required）。
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
// 物料读取：policies / tools / projection-presets
// ============================================================

/** policy/authority 物料的运行时消费形态（正文策展字段 + 消费所需身份）。 */
export interface CatalogPolicyMaterial {
  /** catalog 根相对路径（出处呈现用，如 policies/policy.web.api.single_http_client.json）。 */
  readonly file: string;
  readonly id: string;
  readonly kind: string;
  readonly classification: CatalogClassificationValue;
  readonly titleZh: string;
  readonly statementZh: string;
  readonly lane: CatalogLaneValue;
  readonly appliesWhenCondition: string;
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
    materials.push({
      file,
      id,
      kind: String(body["kind"] ?? ""),
      classification: classification as CatalogClassificationValue,
      titleZh,
      statementZh,
      lane: lane as CatalogLaneValue,
      appliesWhenCondition: appliesWhen["condition"] as string,
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
