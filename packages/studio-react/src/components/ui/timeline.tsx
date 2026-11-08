// 时间轴：有序列表 ol，按时间先后；每项「状态圆点 + 时间 + 标题 + 说明」，状态有文字（圆点只是辅助），时间用 <time>。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface TimelineItem {
  readonly key: string;
  readonly title: React.ReactNode;
  readonly time?: { readonly iso: string; readonly text: string };
  readonly description?: React.ReactNode;
  readonly tone?: "neutral" | "success" | "error" | "warning" | "info";
}

const DOT = { neutral: "bg-ds-gray-600", success: "bg-ds-green-700", error: "bg-ds-red-700", warning: "bg-ds-amber-700", info: "bg-ds-blue-700" } as const;

export function Timeline({ items, pending, className, ...props }: { readonly items: readonly TimelineItem[]; readonly pending?: React.ReactNode } & Omit<React.ComponentProps<"ol">, "children">) {
  return (
    <ol data-slot="timeline" className={cn("flex flex-col", className)} {...props}>
      {items.map((item, index) => (
        <li key={item.key} className="relative flex gap-3 pb-6 last:pb-0">
          {index < items.length - 1 || pending !== undefined ? <span aria-hidden="true" className="absolute top-4 bottom-0 left-1 w-px bg-ds-gray-400" /> : null}
          <span aria-hidden="true" className={cn("relative mt-1 size-2 shrink-0 rounded-full ring-4 ring-ds-background-100", DOT[item.tone ?? "neutral"])} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label-14">{item.title}</span>
            {item.time !== undefined ? <time dateTime={item.time.iso} className="text-copy-13 text-ds-gray-900 tabular-nums">{item.time.text}</time> : null}
            {item.description !== undefined ? <div className="text-copy-14 text-ds-gray-900">{item.description}</div> : null}
          </div>
        </li>
      ))}
      {pending !== undefined ? (
        <li className="relative flex gap-3">
          <span aria-hidden="true" className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-ds-gray-400 motion-reduce:animate-none" />
          <span className="text-copy-14 text-ds-gray-900">{pending}</span>
        </li>
      ) : null}
    </ol>
  );
}
