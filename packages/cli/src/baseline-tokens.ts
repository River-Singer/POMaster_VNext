/**
 * baseline-tokens.ts —— design-tokens.yaml 装载与校验（F-M1 最小合同；R3 批）。
 *
 * 落盘载体 `.pomaster/baseline/frontend/design-tokens.yaml`（B6D 批增量播种件；
 * BASELINE_CONFIRM_TARGETS 第 25 确认目标——ADR-20）。机器 schema 资产 =
 * packages/schemas/assets/22-design-tokens.schema.json（顺延编号）；本装载面 =
 * ajv schema 校验（meta.origin 三值本地闭包 + 九组键形封闭——sources.ts 同款消费
 * 模式：ajv compile + validate，strict:false 容 x- 注记键）。
 *
 * ADR-lite（最小形态）：
 * - fail-closed（坏合同 ≠ 无合同，禁静默当空表消费）：文件在但 YAML 不可解析 /
 *   根非映射 / schema 校验不过 → invalid（诚实明细，不猜测）；**文件缺席 →
 *   absent**（旧工作区升级窗口的合法状态——seed-once 缺席才写；confirm digest 面
 *   对缺席另有 NOT_CONFIGURED/缺席注记语义，两判卷面正交）。
 * - 纯读零写入：本模块是形状校验面（「schema 先行、消费后置」先例同 17 号
 *   perception-receipts）；P-D1 customize/diff/confirm 全流程落地时接确认链消费
 *   （digest 面只看字节，与本形状判卷正交——22 号 schema x-pomaster-contract 注记）。
 * - origin 词形闭包 preset|customized|owner 是 schema 22 本地闭包（零中央词表
 *   PR）；跨包消费时走词汇表 PR 平移。
 */
import { readFile } from "node:fs/promises";
import * as ajvModule from "ajv";
import type { ValidateFunction } from "ajv";
import { load as loadYaml } from "js-yaml";
import { designTokensSchema } from "@pomaster/schemas";
import { POMASTER_DIR } from "./store-layout.js";
import { BASELINE_DESIGN_TOKENS_TARGET } from "./baseline.js";

/** meta 机器位（schema 22 meta 的 TS 镜像；origin = 本地三值闭包）。 */
export interface DesignTokensMeta {
  readonly origin: "preset" | "customized" | "owner";
  readonly customized: boolean;
}

/** 装载产物（校验后形态；token 组键形由 schema 22 封闭，这里不做二次镜像）。 */
export interface DesignTokensDoc {
  readonly meta: DesignTokensMeta;
  /** token 分组（color/typography/spacing/radius/elevation/density/layout/motion/breakpoints）——形状契约在 schema 22，消费面按需取组。 */
  readonly groups: Readonly<Record<string, unknown>>;
}

/** 装载结果三态（缺席显式 / 损坏 fail-closed / ok）。 */
export type DesignTokensRead =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid"; readonly detail: string }
  | { readonly kind: "ok"; readonly doc: DesignTokensDoc };

// ajv 8 在 NodeNext 下的类型把模块解析为 CJS export= 形态（kernel sources.ts
// 同款解包——运行时 default 即构造器）。
function getAjvConstructor(): new (options?: Record<string, unknown>) => AjvInstance {
  const candidate = ajvModule as unknown as { default?: new (options?: Record<string, unknown>) => AjvInstance };
  if (typeof candidate === "function") return ajvModule as unknown as new (options?: Record<string, unknown>) => AjvInstance;
  if (candidate && typeof candidate.default === "function") return candidate.default;
  return ajvModule as unknown as new (options?: Record<string, unknown>) => AjvInstance;
}

interface AjvInstance {
  compile(schema: Record<string, unknown>): ValidateFunction;
}

let tokensValidator: ValidateFunction | null = null;

function getTokensValidator(): ValidateFunction {
  if (tokensValidator === null) {
    const AjvCtor = getAjvConstructor();
    // strict:false 关闭 strictSchema（schema 携带 x- 注记键，schemas 包装载提示同款）。
    const ajv = new AjvCtor({ strict: false, allErrors: true });
    tokensValidator = ajv.compile(designTokensSchema as Record<string, unknown>);
  }
  return tokensValidator as ValidateFunction;
}

/** 确认目标词形 → 盘面绝对路径（baselineConfirmTargetPath 同构换算；单一来源词形）。 */
function designTokensPath(rootDir: string): string {
  return `${rootDir}/${POMASTER_DIR}/${BASELINE_DESIGN_TOKENS_TARGET}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 装载 design-tokens.yaml（纯读零写入）。缺席 → absent；YAML 不可解析 / 根非映射 /
 * schema 校验不过 → invalid（fail-closed 明细）；ok → meta 机器位 + token 组。
 */
export async function readDesignTokens(rootDir: string): Promise<DesignTokensRead> {
  let text: string;
  try {
    text = await readFile(designTokensPath(rootDir), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "absent" };
    return {
      kind: "invalid",
      detail: `文件不可读: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(text);
  } catch (error) {
    return {
      kind: "invalid",
      detail: `无法解析为 YAML（损坏或手改）: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!isRecord(parsed)) {
    return { kind: "invalid", detail: "根须为映射（meta + token 分组）" };
  }

  const validate = getTokensValidator();
  const ok = validate(parsed) as boolean;
  if (!ok) {
    const errors = Array.isArray(validate.errors) ? validate.errors : [];
    const detail = errors
      .slice(0, 5)
      .map((e) => `${e.instancePath ?? ""} ${e.message ?? ""}`.trim())
      .join("；");
    return {
      kind: "invalid",
      detail: `未过 22-design-tokens schema: ${detail || "未知违规"}`,
    };
  }

  const meta = parsed["meta"] as Record<string, unknown>;
  const groups: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "meta") continue;
    groups[key] = value;
  }
  return {
    kind: "ok",
    doc: {
      meta: { origin: meta["origin"] as DesignTokensMeta["origin"], customized: meta["customized"] as boolean },
      groups,
    },
  };
}
