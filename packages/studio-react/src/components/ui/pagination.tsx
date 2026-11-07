// 分页：nav[aria-label] 包页码按钮，当前页 aria-current="page"；页数多时首尾 + 当前页前后各一页，其余折成省略号；
// 每页条数用 Select，可选显示总数（规范 CMP.PAGINATION.*）。Geist Pagination 只有上一页 / 下一页两个链接，这里按并集补齐页码。
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export interface PaginationProps extends Omit<React.ComponentProps<"nav">, "onChange"> {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onChange: (page: number, pageSize: number) => void;
  readonly pageSizes?: readonly number[];
  readonly showTotal?: boolean;
}

export function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const out: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("gap");
  for (let value = start; value <= end; value += 1) out.push(value);
  if (end < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

export function Pagination({ page, pageSize, total, onChange, pageSizes = [10, 20, 50, 100], showTotal = true, className, ...props }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav data-slot="pagination" aria-label="分页" className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {showTotal ? <span className="mr-2 text-copy-14 text-ds-gray-900 tabular-nums">共 {total.toLocaleString("zh-CN")} 条</span> : null}
      <Button size="small" variant="tertiary" svgOnly aria-label="上一页" disabled={page <= 1} onClick={() => onChange(page - 1, pageSize)}>
        <ChevronLeftIcon />
      </Button>
      <ul className="flex items-center gap-1">
        {pageWindow(page, pages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="w-8 text-center text-ds-gray-700">
              …
            </li>
          ) : (
            <li key={item}>
              <Button
                size="small"
                variant={item === page ? "secondary" : "tertiary"}
                aria-current={item === page ? "page" : undefined}
                aria-label={`第 ${item} 页`}
                className={cn("min-w-8 tabular-nums", item === page && "font-semibold")}
                onClick={() => onChange(item, pageSize)}
              >
                {item}
              </Button>
            </li>
          ),
        )}
      </ul>
      <Button size="small" variant="tertiary" svgOnly aria-label="下一页" disabled={page >= pages} onClick={() => onChange(page + 1, pageSize)}>
        <ChevronRightIcon />
      </Button>
      <Select value={String(pageSize)} onValueChange={(value) => onChange(1, Number(value))}>
        <SelectTrigger className="h-8 w-28" aria-label="每页条数">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizes.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size} 条/页
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </nav>
  );
}
