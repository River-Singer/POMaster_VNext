// Vue · Ant Design 抽屉的自建组件共用：样式只从 antd 的设计 token 取值（theme.useToken()），不写死颜色、圆角、字号。
// 组件类型取两套设计系统的并集：Geist 有、ant-design-vue 没有的类型（代码块、命令片段、命令面板、选择卡片……）在这里按
// antd 的 token 自己做；交互件尽量用 antdv 的组件拼（输入框、按钮、弹层、级联、标签），焦点与键盘行为随之继承。
import { computed, type ComputedRef } from "vue";
import { theme } from "ant-design-vue";

export type AntdToken = ReturnType<typeof theme.useToken>["token"]["value"];

export function useAntdToken(): ComputedRef<AntdToken> {
  const { token } = theme.useToken();
  return computed(() => token.value);
}

/** 复制文本：剪贴板不可用时抛错，由调用处提示（不静默失败）。 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) throw new Error("剪贴板不可用");
  await navigator.clipboard.writeText(text);
}
