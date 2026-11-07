// 统计数值：标签 + 数值（等宽数字，千分位，单位小一号）+ 可选趋势；趋势用箭头和文字「较上周 +12%」表达，颜色只是辅助。
// 数字跳动动画见 NumberTicker（减少动效时直接显示终值）。
import * as React from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface StatisticProps extends Omit<React.ComponentProps<"div">, "prefix"> {
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly precision?: number;
  readonly prefix?: React.ReactNode;
  readonly trend?: { readonly delta: number; readonly period: string; readonly goodWhen?: "up" | "down" };
}

export function Statistic({ label, value, unit, precision, prefix, trend, className, ...props }: StatisticProps) {
  const text = typeof value === "number" ? new Intl.NumberFormat("zh-CN", { minimumFractionDigits: precision, maximumFractionDigits: precision ?? 2 }).format(value) : value;
  const up = trend !== undefined && trend.delta >= 0;
  const good = trend === undefined ? true : (trend.goodWhen ?? "up") === "up" ? up : !up;
  return (
    <div data-slot="statistic" className={cn("flex flex-col gap-1", className)} {...props}>
      <span className="text-label-13 text-ds-gray-900">{label}</span>
      <span className="flex items-baseline gap-1 text-heading-32 tabular-nums">
        {prefix}
        {text}
        {unit !== undefined ? <span className="text-label-14 text-ds-gray-900">{unit}</span> : null}
      </span>
      {trend !== undefined ? (
        <span className={cn("inline-flex items-center gap-1 text-label-13", good ? "text-ds-green-900" : "text-ds-red-900")}>
          {up ? <ArrowUpRightIcon aria-hidden="true" className="size-4" /> : <ArrowDownRightIcon aria-hidden="true" className="size-4" />}
          {trend.period} {up ? "+" : "−"}
          {Math.abs(trend.delta)}%
        </span>
      ) : null}
    </div>
  );
}
