// 时间选择：时、分（可选秒）各一个可滚动的 listbox 列，按钮显示「09:30」；列内上下键移动、回车确定。
// 分钟可按步长出选项（如 15 分钟一档）。Geist 没有这个组件，用 Popover + Geist token 做；值是 HH:mm(:ss) 字符串。
import * as React from "react";
import { ClockIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { OPTION_CLASS, TRIGGER_CLASS } from "./combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface TimePickerProps {
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly minuteStep?: 1 | 5 | 10 | 15 | 30;
  readonly withSeconds?: boolean;
  readonly placeholder?: string;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function TimePicker({ value, onValueChange, minuteStep = 5, withSeconds = false, placeholder = "选择时间", id, className, ...rest }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const parts = (value ?? "").split(":").map(Number);
  const [h, m, s] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const columns = [
    { label: "时", values: Array.from({ length: 24 }, (_, i) => i), current: h },
    { label: "分", values: Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep), current: m },
    ...(withSeconds ? [{ label: "秒", values: Array.from({ length: 60 }, (_, i) => i), current: s }] : []),
  ];
  function set(index: number, next: number): void {
    const out = [h, m, s].slice(0, withSeconds ? 3 : 2);
    out[index] = next;
    onValueChange(out.map(pad).join(":"));
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id} aria-label={rest["aria-label"]} className={cn(TRIGGER_CLASS, "w-40 justify-start", className)} data-slot="time-picker">
          <ClockIcon aria-hidden="true" className="size-4 text-ds-gray-900" />
          <span className={cn("tabular-nums", value === null && "text-muted-foreground")}>{value ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto gap-1 p-1" align="start">
        {columns.map((column, index) => (
          <div
            key={column.label}
            role="listbox"
            aria-label={column.label}
            tabIndex={0}
            className="h-56 w-14 overflow-y-auto rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onKeyDown={(event) => {
              const at = column.values.indexOf(column.current);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = column.values[(Math.max(0, at) + (event.key === "ArrowDown" ? 1 : -1) + column.values.length) % column.values.length]!;
                set(index, next);
              } else if (event.key === "Enter") setOpen(false);
            }}
          >
            {column.values.map((option) => (
              <div key={option} role="option" aria-selected={option === column.current} data-active={option === column.current} className={cn(OPTION_CLASS, "justify-center tabular-nums")} onClick={() => set(index, option)}>
                {pad(option)}
              </div>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
