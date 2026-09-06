// family-examples.mjs 的类型契约（配置表条目形态；studio 不入 tsc 面——本声明
// 供编辑器/测试侧类型化，与 .mjs 同目录同源维护）。
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
}
export declare const FAMILY_EXAMPLES: Map<string, FamilyExampleEntry>;
