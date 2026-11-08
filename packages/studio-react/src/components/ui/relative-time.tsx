// 相对时间（Geist Relative Time Card）：显示「3 分钟前」，<time dateTime> 带机器可读时间，悬停 / 聚焦显示绝对时间与时区；
// 每分钟刷新一次；超过 7 天直接显示日期（相对时间对远期没有意义）。
import * as React from "react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function formatRelative(date: Date, now: Date = new Date(), locale = "zh-CN"): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff <= 0 ? "刚刚" : "马上";
  if (abs >= 7 * 86_400_000) return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) if (abs >= ms) return format.format(Math.round(diff / ms), unit);
  return format.format(Math.round(diff / 60_000), "minute");
}

export function RelativeTime({ date, className }: { readonly date: Date | string; readonly className?: string }) {
  const value = typeof date === "string" ? new Date(date) : date;
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const absolute = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(value);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <time data-slot="relative-time" dateTime={value.toISOString()} tabIndex={0} className={cn("rounded-sm text-copy-13 text-ds-gray-900 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}>
            {formatRelative(value, now)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{absolute}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
