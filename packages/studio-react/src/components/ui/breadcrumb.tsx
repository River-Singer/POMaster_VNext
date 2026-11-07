// 面包屑：nav[aria-label] + 有序列表，最后一项是当前页（aria-current="page"，不是链接）；层级超过 4 级时中间折叠成省略号菜单（Geist Breadcrumbs）。
import * as React from "react";
import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export interface BreadcrumbProps extends Omit<React.ComponentProps<"nav">, "children"> {
  readonly items: readonly BreadcrumbItem[];
  readonly maxItems?: number;
}

export function Breadcrumb({ items, maxItems = 4, className, ...props }: BreadcrumbProps) {
  const collapse = items.length > maxItems;
  const head = collapse ? items.slice(0, 1) : items.slice(0, -1);
  const hidden = collapse ? items.slice(1, items.length - 2) : [];
  const tail = collapse ? items.slice(items.length - 2, -1) : [];
  const current = items[items.length - 1];
  const link = (item: BreadcrumbItem) => (
    <a href={item.href ?? "#"} className="rounded-sm text-ds-gray-900 outline-none hover:text-ds-gray-1000 focus-visible:ring-[3px] focus-visible:ring-ring/50">
      {item.label}
    </a>
  );
  const sep = <ChevronRightIcon aria-hidden="true" className="size-3.5 text-ds-gray-700" />;
  return (
    <nav data-slot="breadcrumb" aria-label="面包屑" className={className} {...props}>
      <ol className="flex flex-wrap items-center gap-1 text-copy-14">
        {head.map((item) => (
          <li key={item.label} className="flex items-center gap-1">
            {link(item)}
            {sep}
          </li>
        ))}
        {hidden.length > 0 ? (
          <li className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex size-6 items-center justify-center rounded-sm text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-100 focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`显示其余 ${hidden.length} 级`}>
                <EllipsisIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((item) => (
                  <DropdownMenuItem key={item.label} asChild>
                    <a href={item.href ?? "#"}>{item.label}</a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {sep}
          </li>
        ) : null}
        {tail.map((item) => (
          <li key={item.label} className="flex items-center gap-1">
            {link(item)}
            {sep}
          </li>
        ))}
        {current !== undefined ? (
          <li>
            <span aria-current="page" className="text-ds-gray-1000">
              {current.label}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
