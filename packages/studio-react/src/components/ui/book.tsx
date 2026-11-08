// 书封（Geist Book）：文档、指南、手册的封面卡片——书脊阴影 + 标题 + 可选图标，整体是一个链接（指向那份文档）；
// 悬停时轻微翻开（减少动效时不动）。颜色只取 Geist 色阶。
import * as React from "react";
import { cn } from "../../lib/utils";

const TONES = { gray: "bg-ds-gray-1000 text-ds-background-100", blue: "bg-ds-blue-700 text-ds-background-100", green: "bg-ds-green-700 text-ds-background-100", amber: "bg-ds-amber-700 text-ds-gray-1000" } as const;

export interface BookProps extends Omit<React.ComponentProps<"a">, "title"> {
  readonly title: string;
  readonly href: string;
  readonly icon?: React.ReactNode;
  readonly tone?: keyof typeof TONES;
  readonly width?: number;
}

export function Book({ title, href, icon, tone = "gray", width = 160, className, ...props }: BookProps) {
  return (
    <a data-slot="book" href={href} className={cn("group inline-block rounded-md outline-none [perspective:900px] focus-visible:ring-[3px] focus-visible:ring-ring/50", className)} style={{ width }} {...props}>
      <span className={cn("relative flex aspect-[49/60] flex-col justify-between overflow-hidden rounded-r-md rounded-l-sm p-4 pl-6 shadow-md transition-transform duration-300 [transform-origin:left] group-hover:[transform:rotateY(-18deg)] motion-reduce:transition-none motion-reduce:group-hover:[transform:none]", TONES[tone])}>
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-ds-gray-alpha-400" />
        <span className="text-heading-16 [text-wrap:balance]">{title}</span>
        {icon !== undefined ? <span aria-hidden="true" className="[&_svg]:size-6">{icon}</span> : null}
      </span>
    </a>
  );
}
