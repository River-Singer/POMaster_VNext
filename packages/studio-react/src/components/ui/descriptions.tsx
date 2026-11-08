// 描述列表：只读的「字段: 值」，用 dl / dt / dd；两到三列栅格，长值可跨列；空值显示「—」而不是空白（Geist Description 的语义 + antd Descriptions 的布局）。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface DescriptionItem {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly span?: 1 | 2 | 3;
}

export interface DescriptionsProps extends Omit<React.ComponentProps<"dl">, "children"> {
  readonly items: readonly DescriptionItem[];
  readonly columns?: 1 | 2 | 3;
  readonly title?: string;
  readonly bordered?: boolean;
}

export function Descriptions({ items, columns = 3, title, bordered = false, className, ...props }: DescriptionsProps) {
  const cols = columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3";
  const span = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3" } as const;
  return (
    <section data-slot="descriptions" className="flex flex-col gap-3">
      {title !== undefined ? <h3 className="text-heading-16">{title}</h3> : null}
      <dl className={cn("grid", cols, bordered ? "overflow-hidden rounded-lg border border-ds-gray-400" : "gap-x-6 gap-y-4", className)} {...props}>
        {items.map((item) => (
          <div key={item.label} className={cn("flex flex-col gap-1", span[Math.min(item.span ?? 1, columns) as 1 | 2 | 3], bordered && "border-r border-b border-ds-gray-400 p-3")}>
            <dt className="text-label-13 text-ds-gray-900">{item.label}</dt>
            <dd className="text-copy-14 text-ds-gray-1000">{item.value === null || item.value === undefined || item.value === "" ? "—" : item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
