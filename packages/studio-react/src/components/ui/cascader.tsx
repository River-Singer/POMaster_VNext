// 级联选择：按层级逐列选择（省 / 市 / 区，车队 / 分组 / 车辆），按钮里显示完整路径「上海 / 浦东新区 / 张江」。
// Geist 没有这个组件，用 Popover（Radix）+ Geist token 做：每列是一个 listbox，右箭头进下一列、左箭头回上一列、回车选中叶子。
import * as React from "react";
import { CheckIcon, ChevronRightIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { OPTION_CLASS, TRIGGER_CLASS } from "./combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface CascaderOption {
  readonly value: string;
  readonly label: string;
  readonly children?: readonly CascaderOption[];
  readonly disabled?: boolean;
}

export interface CascaderProps {
  readonly options: readonly CascaderOption[];
  readonly value: readonly string[];
  readonly onValueChange: (path: string[]) => void;
  readonly placeholder?: string;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}

function labelsOf(options: readonly CascaderOption[], path: readonly string[]): string[] {
  const out: string[] = [];
  let level: readonly CascaderOption[] | undefined = options;
  for (const value of path) {
    const hit: CascaderOption | undefined = level?.find((option) => option.value === value);
    if (hit === undefined) break;
    out.push(hit.label);
    level = hit.children;
  }
  return out;
}

export function Cascader({ options, value, onValueChange, placeholder = "请选择", id, className, ...rest }: CascaderProps) {
  const [open, setOpen] = React.useState(false);
  const [path, setPath] = React.useState<string[]>([...value]);
  const columns: (readonly CascaderOption[])[] = [options];
  for (const step of path) {
    const next = columns[columns.length - 1]?.find((option) => option.value === step)?.children;
    if (next === undefined || next.length === 0) break;
    columns.push(next);
  }
  const labels = labelsOf(options, value);
  function choose(depth: number, option: CascaderOption): void {
    if (option.disabled) return;
    const next = [...path.slice(0, depth), option.value];
    setPath(next);
    if (option.children === undefined || option.children.length === 0) {
      onValueChange(next);
      setOpen(false);
    }
  }
  function onKeyDown(event: React.KeyboardEvent, depth: number, list: readonly CascaderOption[]): void {
    const index = Math.max(0, list.findIndex((option) => option.value === path[depth]));
    const focusColumn = (column: number, row: number) => (event.currentTarget.parentElement?.children[column]?.querySelectorAll<HTMLElement>('[role="option"]')[row])?.focus();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const row = (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      setPath([...path.slice(0, depth), list[row]!.value]);
      focusColumn(depth, row);
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      const option = list[index];
      if (option === undefined) return;
      if (option.children?.length) focusColumn(depth + 1, 0);
      else choose(depth, option);
    } else if (event.key === "ArrowLeft" && depth > 0) {
      event.preventDefault();
      focusColumn(depth - 1, Math.max(0, columns[depth - 1]!.findIndex((option) => option.value === path[depth - 1])));
    }
  }
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setPath([...value]); }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} aria-label={rest["aria-label"]} className={cn(TRIGGER_CLASS, className)} data-slot="cascader">
          <span className={cn("truncate", labels.length === 0 && "text-muted-foreground")}>{labels.length === 0 ? placeholder : labels.join(" / ")}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto p-0" align="start">
        {columns.map((list, depth) => (
          <div key={depth} role="listbox" aria-label={`第 ${depth + 1} 级`} className="max-h-64 w-44 overflow-y-auto border-r border-ds-gray-400 p-1 last:border-r-0" onKeyDown={(event) => onKeyDown(event, depth, list)}>
            {list.map((option) => {
              const onPath = path[depth] === option.value;
              return (
                <div
                  key={option.value}
                  role="option"
                  tabIndex={onPath || (path[depth] === undefined && option === list[0]) ? 0 : -1}
                  aria-selected={onPath}
                  aria-disabled={option.disabled || undefined}
                  data-active={onPath}
                  className={cn(OPTION_CLASS, "justify-between outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50")}
                  onClick={() => choose(depth, option)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.children?.length ? <ChevronRightIcon aria-hidden="true" className="size-4 text-ds-gray-900" /> : value[depth] === option.value ? <CheckIcon aria-hidden="true" className="size-4" /> : null}
                </div>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
