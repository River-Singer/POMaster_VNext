// 仪表（Geist Gauge）：环形进度表示一个比例（用量、得分），role="meter" 带 aria-valuenow 与可读文字；
// 颜色按阈值从 Geist 色阶取（≥ 危险阈值红、≥ 警告阈值琥珀、其余蓝），中心同时写数字，不只靠颜色。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface GaugeProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly value: number;
  readonly label: string;
  readonly size?: "small" | "medium" | "large";
  readonly thresholds?: { readonly warning: number; readonly danger: number };
  readonly showValue?: boolean;
}

const DIM = { small: 32, medium: 64, large: 128 } as const;

export function Gauge({ value, label, size = "medium", thresholds = { warning: 70, danger: 90 }, showValue = size !== "small", className, ...props }: GaugeProps) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const tone = pct >= thresholds.danger ? "text-ds-red-700" : pct >= thresholds.warning ? "text-ds-amber-700" : "text-ds-blue-700";
  return (
    <div data-slot="gauge" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${Math.round(pct)}%`} className={cn("relative inline-flex items-center justify-center", className)} style={{ width: DIM[size], height: DIM[size] }} {...props}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-ds-gray-200" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="currentColor" strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} className={cn(tone, "transition-[stroke-dasharray] duration-300 motion-reduce:transition-none")} />
      </svg>
      {showValue ? <span aria-hidden="true" className={cn("absolute tabular-nums", size === "large" ? "text-heading-24" : "text-label-13")}>{Math.round(pct)}</span> : null}
    </div>
  );
}
