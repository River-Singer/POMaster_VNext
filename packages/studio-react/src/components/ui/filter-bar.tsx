// 筛选条（Geist Filter Params）：已生效的筛选以「字段: 值」标签排开，每个可单独移除，末尾「清空」；「添加筛选」打开字段菜单。
// 筛选状态归调用处（通常在地址栏的搜索参数里，规范 STATE.URL），组件只负责展示与发事件。
import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

export interface ActiveFilter {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface FilterBarProps {
  readonly filters: readonly ActiveFilter[];
  readonly available: readonly { readonly key: string; readonly label: string }[];
  readonly onRemove: (key: string) => void;
  readonly onClear: () => void;
  readonly onAdd: (key: string) => void;
  readonly className?: string;
}

export function FilterBar({ filters, available, onRemove, onClear, onAdd, className }: FilterBarProps) {
  const unused = available.filter((field) => !filters.some((filter) => filter.key === field.key));
  return (
    <div data-slot="filter-bar" role="group" aria-label="当前筛选" className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <span key={filter.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-ds-gray-400 bg-ds-background-100 pr-1 pl-3 text-label-13">
          <span className="text-ds-gray-900">{filter.label}:</span>
          <span>{filter.value}</span>
          <button type="button" aria-label={`移除筛选 ${filter.label}`} onClick={() => onRemove(filter.key)} className="flex size-5 items-center justify-center rounded-full outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      {unused.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="small" variant="tertiary" prefix={<PlusIcon />}>
              添加筛选
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {unused.map((field) => (
              <DropdownMenuItem key={field.key} onSelect={() => onAdd(field.key)}>
                {field.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {filters.length > 0 ? (
        <Button size="small" variant="tertiary" onClick={onClear}>
          清空
        </Button>
      ) : null}
    </div>
  );
}
