// 「Geist 组件」分区的演示外框。内容包在 .geist-root 里：Tailwind 的 preflight 只在这里生效（见 src/styles/geist.css），
// 与「规范」分区的实时示例同一个作用域。
import type * as React from "react";
import { cn } from "../lib/utils";

export function Frame({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return <div className={cn("geist-root flex flex-wrap items-center gap-3 bg-ds-background-100 p-6 text-copy-14 text-ds-gray-1000", className)}>{children}</div>;
}

export function Column({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return <Frame className={cn("flex-col items-start", className)}>{children}</Frame>;
}

/** 一行演示前的小标题（变体名、尺寸名）。 */
export function Caption({ children }: { readonly children: React.ReactNode }) {
  return <span className="w-24 shrink-0 text-label-13 text-ds-gray-900">{children}</span>;
}

/** 组件页的说明（写在 Storybook 文档页的组件描述里）。 */
export function describe(text: string) {
  return { docs: { description: { component: text } } };
}
