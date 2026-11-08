// 日期选择：按钮显示「2026-11-07」，点开是日历（Popover + Calendar），选中即关闭、焦点回到按钮；可清空。
// 日期以 YYYY-MM-DD 字符串进出，显示格式由调用处的格式化函数决定（规范 FORMAT）。
import * as React from "react";
import { CalendarIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Calendar, type IsoDate } from "./calendar";
import { TRIGGER_CLASS } from "./combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface DatePickerProps {
  readonly value: IsoDate | null;
  readonly onValueChange: (value: IsoDate | null) => void;
  readonly placeholder?: string;
  readonly min?: IsoDate;
  readonly max?: IsoDate;
  readonly format?: (value: IsoDate) => string;
  readonly clearable?: boolean;
  readonly today?: IsoDate;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function DatePicker({ value, onValueChange, placeholder = "选择日期", min, max, format = (v) => v, clearable = true, today, id, className, ...rest }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div data-slot="date-picker" className={cn("relative w-56", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" id={id} aria-label={rest["aria-label"]} className={cn(TRIGGER_CLASS, "justify-start", clearable && value !== null && "pr-9")}>
            <CalendarIcon aria-hidden="true" className="size-4 text-ds-gray-900" />
            <span className={cn("tabular-nums", value === null && "text-muted-foreground")}>{value === null ? placeholder : format(value)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <Calendar
            selected={value}
            min={min}
            max={max}
            today={today}
            onSelect={(next) => {
              onValueChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && value !== null ? (
        <button type="button" aria-label="清除日期" onClick={() => onValueChange(null)} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
