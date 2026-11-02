// shadcn/ui 的 cn()：合并条件类名并消解 Tailwind 冲突。
//
// Geist 的排版类（text-heading-24、text-button-14、text-label-13-mono……，见 src/styles/geist.css）
// 要登记成字号类：tailwind-merge 默认把不认识的 text-* 当成文字颜色，会和 text-primary-foreground
// 之类的颜色类互相覆盖，把字号吞掉。
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Geist 排版类的值部分：heading / button / label / copy + 字号，可带 -mono。 */
export const GEIST_TYPE_CLASS = /^(heading|button|label|copy)-\d+(-mono)?$/;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [(value: string) => GEIST_TYPE_CLASS.test(value)] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
