/**
 * sources.ts —— Sources Authority Registry 装载与校验（09-04 vNext Batch 1 R3；
 * Owner 裁定 D2——PRD vNext §3/§3A Source Artifact Authority 正交权威轴）。
 *
 * ADR-lite（最小形态选择）：
 * - 落盘载体 `.pomaster/sources/index.yaml`（PRD §3 目录树逐字；路径登记于
 *   paths.ts sourcesDir/sourcesIndexPath 单一来源）。机器 schema 资产 =
 *   packages/schemas/assets/20-sources-authority.schema.json（顺延编号）；
 *   本装载面 = ajv schema 校验（轴结构闭包）+ 结构校验补齐 schema 表达不了的两条：
 *   **两轴不相交**（authoritative_for ∩ non_authoritative_for = ∅）与 **id 唯一**。
 * - fail-closed（catalog 坏物料同款纪律）：文件在但 YAML 不可解析 / schema 校验
 *   不过 / 两轴相交 / id 重复 → SCHEMA_INVALID 原样抛出（坏 registry ≠ 无 registry，
 *   禁静默当空表消费）；**文件缺席 → null**（sources 平面 opt-in——项目未登记来源
 *   是合法状态，调用方显式跳过，不冒充「已查无来源」）。
 * - 维度词形开放词表（项目特定——schema dimension_word 只锁词形卫生，不预置枚举）；
 *   type 字段开放词形，与 02 信封 source_types 十值闭包（对象出处轴 + FORBIDDEN
 *   负封条）零关联——负封条零改动（D2 明文），MasterGrid 双层语义 = 负封条 FATAL
 *  （对象注册面）+ 正轴维度判卷（本 registry authority 两轴）。
 * - **sources 不入 store 事务**（非 governed object 起步——D2 边界登记）：无
 *   lifecycle、无 authority.owner 信封、不进 truth-index/content_digest；本模块
 *   纯读零写入（B3 红线同源：零写路径消费）。
 * - 词形轴 absent_in_vocab_lock__pending_vocab_pr——TODO(vocab-pr)（question-gate/
 *   triage 局部词先例），收编归独立词汇表批。
 */
import * as ajvModule from "ajv";
import type { ValidateFunction } from "ajv";
import { load as loadYaml } from "js-yaml";
import { sourcesAuthoritySchema } from "@pomaster/schemas";
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";
import type { StorePaths } from "./paths.js";

/** 单条来源的权威边界申报（schema source_entry 的 TS 镜像；装载产物形态）。 */
export interface SourceAuthorityEntry {
  /** 项目内稳定锚（^[a-z0-9][a-z0-9_-]{0,63}$；投影呈现 ref 词形）。 */
  readonly id: string;
  /** 来源工件类型（开放词形；与 02 信封 source_types 闭包零关联）。 */
  readonly type: string;
  /** 仓库相对路径或 URL（禁空白）。 */
  readonly location: string;
  /** 版本注记（缺席 = 未申报，显式 null）。 */
  readonly version: string | null;
  /** 有资格决定什么（开放词表维度；装载期与 non_authoritative_for 相交即拒）。 */
  readonly authoritative_for: readonly string[];
  /** 完全无发言权什么（开放词表维度）。 */
  readonly non_authoritative_for: readonly string[];
}

/** 装载产物（sources/index.yaml 的校验后形态）。 */
export interface SourcesRegistry {
  readonly sources: readonly SourceAuthorityEntry[];
}

// ajv 8 在 NodeNext 下的类型把模块解析为 CJS export= 形态；运行时 default 即构造器
// （store.ts getAjvConstructor 同款解包——ajv 允许依赖清单内）。
function getAjvConstructor(): new (options?: Record<string, unknown>) => AjvInstance {
  const candidate = ajvModule as unknown as { default?: new (options?: Record<string, unknown>) => AjvInstance };
  if (typeof candidate === "function") return ajvModule as unknown as new (options?: Record<string, unknown>) => AjvInstance;
  if (candidate && typeof candidate.default === "function") return candidate.default;
  return ajvModule as unknown as new (options?: Record<string, unknown>) => AjvInstance;
}

interface AjvInstance {
  compile(schema: Record<string, unknown>): ValidateFunction;
}

let sourcesValidator: ValidateFunction | null = null;

function getSourcesValidator(): ValidateFunction {
  if (sourcesValidator === null) {
    const AjvCtor = getAjvConstructor();
    // strict:false 关闭 strictSchema（schema 携带 x- 注记键，schemas 包装载提示同款）。
    const ajv = new AjvCtor({ strict: false, allErrors: true });
    sourcesValidator = ajv.compile(sourcesAuthoritySchema as Record<string, unknown>);
  }
  return sourcesValidator as ValidateFunction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * 装载 sources/index.yaml（纯读零写入；paths.sourcesIndexPath 单一来源）。
 * 缺席 → null；损坏/词形/结构违规 → SCHEMA_INVALID（fail-closed 明细见模块头）。
 */
export function loadSourcesRegistry(paths: StorePaths): SourcesRegistry | null {
  const text = readText(paths.sourcesIndexPath);
  if (text === null) return null;

  let parsed: unknown;
  try {
    parsed = loadYaml(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `sources/index.yaml 无法解析为 YAML（损坏或手改）：${error instanceof Error ? error.message : String(error)}`,
      "修正 sources/index.yaml（20-sources-authority.schema.json 形态）或恢复 git 版本；坏 registry ≠ 无 registry，禁静默当空表",
      { path: paths.sourcesIndexPath },
    );
  }
  if (!isRecord(parsed)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "sources/index.yaml 根须为映射（{ sources: [...] }）",
      "按 20-sources-authority.schema.json 修正结构",
      { path: paths.sourcesIndexPath },
    );
  }

  const validate = getSourcesValidator();
  const ok = validate(parsed) as boolean;
  if (!ok) {
    const errors = Array.isArray(validate.errors) ? validate.errors : [];
    const detail = errors
      .slice(0, 5)
      .map((e) => `${e.instancePath ?? ""} ${e.message ?? ""}`.trim())
      .join("；");
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `sources/index.yaml 未过 20-sources-authority schema：${detail}`,
      "轴结构闭包（authority 块必填 + 双轴任意一轴非空 + 维度词形卫生）见 20-sources-authority.schema.json",
      { path: paths.sourcesIndexPath, errorCount: errors.length },
    );
  }

  const rawSources = parsed.sources;
  const sources: SourceAuthorityEntry[] = [];
  const seenIds = new Set<string>();
  for (const raw of Array.isArray(rawSources) ? rawSources : []) {
    if (!isRecord(raw)) continue; // schema 已保证对象形态（防御位）。
    const id = asNonEmptyString(raw.id);
    if (id === null) continue; // schema 已保证（防御位）。
    if (seenIds.has(id)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `sources/index.yaml id 重复：${id}`,
        "来源 id 是投影呈现与引用对账的稳定锚——重复 id 无法判卷，删除或改名重复条目",
        { id },
      );
    }
    seenIds.add(id);
    const authorityBlock = isRecord(raw.authority) ? raw.authority : {};
    const authoritative = Array.isArray(authorityBlock.authoritative_for)
      ? (authorityBlock.authoritative_for as readonly string[])
      : [];
    const nonAuthoritative = Array.isArray(authorityBlock.non_authoritative_for)
      ? (authorityBlock.non_authoritative_for as readonly string[])
      : [];
    // 两轴不相交（schema 表达不了的结构判卷——draft-07 无跨键约束；D2 fail-closed）。
    const overlap = authoritative.filter((dim) => nonAuthoritative.includes(dim));
    if (overlap.length > 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `sources/index.yaml 来源 ${id} 权威两轴相交：${overlap.join(", ")}（同一维度不得同时 authoritative 与 non_authoritative）`,
        "§3A 正交权威轴：双轴申报自相矛盾 = 装载 fail-closed；把维度归入其一或删除",
        { id, overlap },
      );
    }
    sources.push({
      id,
      type: String(raw.type),
      location: String(raw.location),
      version: asNonEmptyString(raw.version),
      authoritative_for: [...authoritative],
      non_authoritative_for: [...nonAuthoritative],
    });
  }
  return { sources };
}
