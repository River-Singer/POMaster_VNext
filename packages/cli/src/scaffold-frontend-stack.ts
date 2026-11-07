/**
 * scaffold-frontend-stack.ts —— 按项目技术基线（.pomaster/baseline/frontend/stack.yaml）选管理侧前端模板集。
 *
 * - framework 是 Vue（vue3 …）→ `vue-antd-admin@1`（ui 已选且不是 Ant Design 时不生成）；
 * - framework 是 React → `react-geist-admin@1`（ui 已选且不是 Geist / shadcn 时不生成）；
 * - 没有基线文件、framework 未定或是别的框架 → 不生成前端文件，给出原因。框架不替项目选技术栈。
 */
import { isStackValueResolved, loadLaneStackValues } from "./baseline.js";

export type FrontendTemplateChoice =
  | { readonly kind: "vue-antd" }
  | { readonly kind: "react-geist" }
  | { readonly kind: "none"; readonly reason_zh: string; readonly hint: string };

const has = (value: string, words: readonly string[]): boolean =>
  words.some((word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(value.toLowerCase()));

export function chooseFrontendTemplateFromStack(framework: string | null, ui: string | null): FrontendTemplateChoice {
  const SET_HINT = "pomaster baseline set frontend framework <vue3|react>（以及 ui）后再生成";
  if (framework === null || !isStackValueResolved(framework)) {
    return { kind: "none", reason_zh: "前端技术栈还没定（baseline/frontend/stack.yaml 的 framework 未填）", hint: SET_HINT };
  }
  const uiValue = ui !== null && isStackValueResolved(ui) ? ui : null;
  if (has(framework, ["vue"])) {
    if (uiValue !== null && !has(uiValue, ["antdesign", "ant-design", "antd", "ant-design-vue"])) {
      return { kind: "none", reason_zh: `Vue 搭配 ${uiValue} 还没有前端模板（现有 Vue 3 + Ant Design）`, hint: "前端页面手写，或把 ui 改为 antdesign" };
    }
    return { kind: "vue-antd" };
  }
  if (has(framework, ["react"])) {
    if (uiValue !== null && !has(uiValue, ["geist", "shadcn"])) {
      return { kind: "none", reason_zh: `React 搭配 ${uiValue} 还没有前端模板（现有 React + Geist / shadcn/ui）`, hint: "前端页面手写，或把 ui 改为 geist" };
    }
    return { kind: "react-geist" };
  }
  return { kind: "none", reason_zh: `前端框架 ${framework} 还没有前端模板（现有 Vue 3 + Ant Design、React + Geist）`, hint: "前端页面手写" };
}

export async function chooseFrontendTemplate(rootDir: string): Promise<FrontendTemplateChoice> {
  const stack = await loadLaneStackValues(rootDir, "frontend");
  if (!stack.ok) return chooseFrontendTemplateFromStack(null, null);
  return chooseFrontendTemplateFromStack(stack.values.get("framework") ?? null, stack.values.get("ui") ?? null);
}
