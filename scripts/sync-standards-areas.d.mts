// scripts/sync-standards-areas.mjs 的类型声明（测试里直接调用它核对生成区与数据源一致）。
export declare const SPACES_PATH: string;
export declare const STANDARDS_AREA_FILES: Readonly<Record<"skeleton" | "antd" | "geist", string>>;
export declare const STANDARDS_AREAS_MARKER: string;
export interface StandardsAreaRule {
  readonly id: string;
  readonly title_zh: string;
  readonly statement_zh: string;
  readonly rationale_zh: string;
  readonly scope_zh: string;
  readonly check_zh: string;
}
export interface StandardsArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: "standards" | "testing";
  readonly prefix: string;
  readonly summary_zh: string;
  readonly rules: readonly StandardsAreaRule[];
}
export declare function standardsAreas(data?: unknown): StandardsArea[];
export declare function renderStandardsAreasBlock(kind: "skeleton" | "standard", data: unknown): string;
export declare function spliceStandardsAreas(text: string, block: string): string;
