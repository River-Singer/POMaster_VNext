// 状态点（Geist Status Dot）：圆点 + 文字说明状态，颜色只是辅助（不单靠颜色区分）；进行中的状态可以呼吸闪烁（减少动效时静止）。
import * as React from "react";
import { cn } from "../../lib/utils";

const STATES = {
  ready: { dot: "bg-ds-green-700", label: "正常" },
  building: { dot: "bg-ds-amber-700", label: "进行中" },
  error: { dot: "bg-ds-red-700", label: "出错" },
  queued: { dot: "bg-ds-gray-600", label: "排队中" },
  canceled: { dot: "bg-ds-gray-400", label: "已取消" },
} as const;

export type StatusDotState = keyof typeof STATES;

export interface StatusDotProps extends React.ComponentProps<"span"> {
  readonly state: StatusDotState;
  readonly label?: string;
  readonly pulse?: boolean;
}

export function StatusDot({ state, label, pulse = state === "building", className, ...props }: StatusDotProps) {
  const meta = STATES[state];
  return (
    <span data-slot="status-dot" className={cn("inline-flex items-center gap-2 text-copy-14", className)} {...props}>
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", meta.dot, pulse && "animate-pulse motion-reduce:animate-none")} />
      {label ?? meta.label}
    </span>
  );
}
