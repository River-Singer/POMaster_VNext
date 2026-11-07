// 组件页共用的演示数据（车队调度场景）。
import type { CascaderOption } from "../components/ui/cascader";
import type { ComboboxOption } from "../components/ui/combobox";
import type { TreeNode } from "../components/ui/tree";

export const DRIVERS: readonly ComboboxOption[] = [
  { value: "zhang-wei", label: "张伟", keywords: ["zhangwei", "zw"] },
  { value: "li-na", label: "李娜", keywords: ["lina", "ln"] },
  { value: "wang-fang", label: "王芳", keywords: ["wangfang", "wf"] },
  { value: "liu-yang", label: "刘洋", keywords: ["liuyang", "ly"] },
  { value: "chen-jie", label: "陈杰", keywords: ["chenjie", "cj"], disabled: true },
];

export const REGIONS: readonly CascaderOption[] = [
  {
    value: "sh",
    label: "上海市",
    children: [
      { value: "pd", label: "浦东新区", children: [{ value: "zj", label: "张江镇" }, { value: "jq", label: "金桥镇" }] },
      { value: "xh", label: "徐汇区", children: [{ value: "tq", label: "田林街道" }] },
    ],
  },
  {
    value: "zj",
    label: "浙江省",
    children: [{ value: "hz", label: "杭州市", children: [{ value: "xh2", label: "西湖区" }, { value: "bj", label: "滨江区" }] }],
  },
];

export const DEPOTS: readonly TreeNode[] = [
  {
    key: "east",
    label: "华东区",
    children: [
      { key: "sh-pd", label: "浦东车队", children: [{ key: "sh-pd-1", label: "一组" }, { key: "sh-pd-2", label: "二组" }] },
      { key: "sh-xh", label: "徐汇车队" },
    ],
  },
  { key: "south", label: "华南区", children: [{ key: "gz-th", label: "天河车队" }, { key: "sz-ns", label: "南山车队", disabled: true }] },
];
