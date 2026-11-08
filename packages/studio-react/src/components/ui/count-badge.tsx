// 徽标数：叠在图标或头像右上角的计数（超过上限显示「99+」）或小红点；数量要能被读屏读到——包住的元素的可读名称里带上数量，
// 徽标本身 aria-hidden。Geist 的 Badge 是标签（见 Badge），计数徽标按 antd Badge 的能力用 Geist 色阶做。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface CountBadgeProps extends React.ComponentProps<"span"> {
  readonly count?: number;
  readonly max?: number;
  readonly dot?: boolean;
  readonly showZero?: boolean;
  readonly tone?: "error" | "info" | "neutral";
}

const TONE = { error: "bg-ds-red-700 text-ds-background-100", info: "bg-ds-blue-700 text-ds-background-100", neutral: "bg-ds-gray-1000 text-ds-background-100" } as const;

export function CountBadge({ count = 0, max = 99, dot = false, showZero = false, tone = "error", className, children, ...props }: CountBadgeProps) {
  const visible = dot || count > 0 || showZero;
  return (
    <span data-slot="count-badge" className={cn("relative inline-flex", className)} {...props}>
      {children}
      {visible ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0 right-0 flex translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-ds-background-100 tabular-nums",
            dot ? "size-2" : "h-5 min-w-5 px-1 text-label-12",
            TONE[tone],
          )}
        >
          {dot ? null : count > max ? `${max}+` : count}
        </span>
      ) : null}
    </span>
  );
}
