// 栅格：12 列 CSS Grid，列宽与断点用 Tailwind 断点（sm / md / lg / xl），间距只用 16 / 24（规范 GRID.GUTTER）。
// Geist 的 Grid 是带辅助线的展示网格；guides 打开时画出列线，便于排版检查。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface GridProps extends React.ComponentProps<"div"> {
  readonly columns?: 1 | 2 | 3 | 4 | 6 | 12;
  readonly gutter?: 16 | 24;
  readonly guides?: boolean;
}

const COLUMNS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 6: "grid-cols-6", 12: "grid-cols-12" } as const;

export function Grid({ columns = 12, gutter = 24, guides = false, className, ...props }: GridProps) {
  return (
    <div
      data-slot="grid"
      className={cn("grid", COLUMNS[columns], gutter === 16 ? "gap-4" : "gap-6", guides && "[&>*]:outline [&>*]:outline-1 [&>*]:outline-dashed [&>*]:outline-ds-gray-400", className)}
      {...props}
    />
  );
}

const SPANS = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 6: "col-span-6", 8: "col-span-8", 9: "col-span-9", 12: "col-span-12" } as const;

export interface GridCellProps extends React.ComponentProps<"div"> {
  readonly span?: keyof typeof SPANS;
}

export function GridCell({ span = 1, className, ...props }: GridCellProps) {
  return <div data-slot="grid-cell" className={cn(SPANS[span], className)} {...props} />;
}
