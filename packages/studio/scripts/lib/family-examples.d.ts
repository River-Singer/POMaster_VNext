// family-examples.mjs 的类型契约（配置表条目形态；studio 不入 tsc 面——本声明
// 供编辑器/测试侧类型化，与 .mjs 同目录同源维护）。
/** 单个交互态 story 声明（S1 态矩阵；生成器循环产出多导出）。 */
export interface FamilyStateExample {
  /** 交互态名（CSF3 具名导出词形：^[A-Z][A-Za-z0-9]*$，"Default" 保留名禁用）。 */
  name: string;
  /** 挂载测试断言的关键 DOM 选择器（缺省回落族级 keyDom）。 */
  keyDom?: string;
  /** 关键 DOM 最小命中数（缺省 1）。 */
  minCount?: number;
  /** true = portal/teleport 态（如 Drawer placement 组合）：断言作用域为 document.body。 */
  portal?: boolean;
  /** 态模板（studio-demo 根内；必备）。 */
  template: string;
  /** setup 返回的数据绑定（对象字面量源码；确定性生成）。 */
  setupData?: string;
  /** 跨族组合额外导入（文件级 import 并集）。 */
  extraImports?: string[];
}
export interface FamilyExampleEntry {
  /** curated=官方形态最小合法组合；default=无必需 props 叶子族基础渲染；service=服务式 API 触发演示；utility=非组件工具导出（组合演示语义）。 */
  kind: "curated" | "default" | "service" | "utility";
  /** 挂载测试断言的关键 DOM 选择器（querySelectorAll 语义，支持逗号并集）。 */
  keyDom: string;
  /** 关键 DOM 最小命中数（缺省 1）。 */
  minCount?: number;
  /** true = portal/teleport 族（Modal/Drawer/Tour）：断言作用域为 document.body。 */
  portal?: boolean;
  /** 组合模板（studio-demo 根内；curated/utility 必备）。 */
  template?: string;
  /** setup 返回的数据绑定（对象字面量源码；确定性生成）。 */
  setupData?: string;
  /** 跨族组合额外导入（如 Dropdown→Button、Grid→Row/Col）。 */
  extraImports?: string[];
  /** S1 交互态矩阵：每项产出一个具名 story 导出（service 族不产 states）。 */
  states?: FamilyStateExample[];
}
export declare const FAMILY_EXAMPLES: Map<string, FamilyExampleEntry>;
