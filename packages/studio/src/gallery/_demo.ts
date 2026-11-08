// 「AntDV 组件/自建」页共用的演示外框与数据（车队调度场景，与 React · Geist 抽屉的组件页同一套数据）。
export const DEMO_STYLE = "padding:24px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start";

export const REGIONS = [
  {
    value: "sh",
    label: "上海市",
    children: [
      { value: "pd", label: "浦东新区", children: [{ value: "zj", label: "张江镇" }, { value: "jq", label: "金桥镇" }] },
      { value: "xh", label: "徐汇区", children: [{ value: "tl", label: "田林街道" }] },
    ],
  },
  { value: "zj", label: "浙江省", children: [{ value: "hz", label: "杭州市", children: [{ value: "xh2", label: "西湖区" }, { value: "bj", label: "滨江区" }] }] },
];

/** 页说明：写明这是 antd 没有、按 antd token 自建的类型，以及它对应的骨架组件领域（tests/component-areas.spec.ts 核对）。 */
export function describe(text: string, area: string) {
  return { docs: { description: { component: text } }, area };
}
