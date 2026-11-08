// 日历：月视图网格（role=grid，周一起始，今天加圈，选中日实底），方向键按天 / 周移动、PageUp/PageDown 换月、Home/End 到周首尾、
// 回车选中；可限制最早 / 最晚日期、按函数禁用某些天，可在格子里放当天的内容（日程、数量）。不另装日期库，日期用 YYYY-MM-DD 字符串。
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type IsoDate = string;

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function toIso(date: Date): IsoDate {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fromIso(value: IsoDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function addDays(value: IsoDate, days: number): IsoDate {
  const date = fromIso(value);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

function addMonths(value: IsoDate, months: number): IsoDate {
  const date = fromIso(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return toIso(date);
}

export interface CalendarProps extends Omit<React.ComponentProps<"div">, "onSelect"> {
  readonly selected: IsoDate | null;
  readonly onSelect: (value: IsoDate) => void;
  /** 打开时显示哪个月（缺省 = 选中日或今天）。 */
  readonly defaultMonth?: IsoDate;
  readonly today?: IsoDate;
  readonly min?: IsoDate;
  readonly max?: IsoDate;
  readonly isDisabled?: (value: IsoDate) => boolean;
  readonly renderCell?: (value: IsoDate) => React.ReactNode;
  readonly cellClassName?: string;
}

export function Calendar({ selected, onSelect, defaultMonth, today = toIso(new Date()), min, max, isDisabled, renderCell, cellClassName, className, ...props }: CalendarProps) {
  const [focused, setFocused] = React.useState<IsoDate>(selected ?? defaultMonth ?? today);
  const gridRef = React.useRef<HTMLTableElement>(null);
  const shouldFocus = React.useRef(false);
  const month = fromIso(focused);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - offset);
  const weeks: IsoDate[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: IsoDate[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      row.push(toIso(date));
    }
    weeks.push(row);
  }
  const disabled = (value: IsoDate) => (min !== undefined && value < min) || (max !== undefined && value > max) || isDisabled?.(value) === true;
  React.useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused]);
  function move(next: IsoDate): void {
    shouldFocus.current = true;
    setFocused(next);
  }
  function onKeyDown(event: React.KeyboardEvent): void {
    const dow = (fromIso(focused).getDay() + 6) % 7;
    const keys: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -dow),
      End: () => addDays(focused, 6 - dow),
    };
    const step = keys[event.key];
    if (step !== undefined) {
      event.preventDefault();
      move(step());
    }
  }
  const title = `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
  return (
    <div data-slot="calendar" className={cn("inline-flex flex-col gap-2", className)} {...props}>
      <div className="flex items-center justify-between">
        <Button size="small" variant="tertiary" svgOnly aria-label="上个月" onClick={() => setFocused(addMonths(focused, -1))}>
          <ChevronLeftIcon />
        </Button>
        <span className="text-label-14" aria-live="polite">
          {title}
        </span>
        <Button size="small" variant="tertiary" svgOnly aria-label="下个月" onClick={() => setFocused(addMonths(focused, 1))}>
          <ChevronRightIcon />
        </Button>
      </div>
      <table ref={gridRef} role="grid" aria-label={title} className="border-separate border-spacing-1" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" abbr={`星期${day}`} className="h-8 text-label-12 font-normal text-ds-gray-900">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const outside = fromIso(day).getMonth() !== month.getMonth();
                const isSelected = day === selected;
                const off = disabled(day);
                return (
                  <td key={day} role="gridcell" aria-selected={isSelected || undefined} className="p-0">
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === focused ? 0 : -1}
                      disabled={off}
                      aria-current={day === today ? "date" : undefined}
                      aria-label={`${fromIso(day).getMonth() + 1} 月 ${fromIso(day).getDate()} 日`}
                      onClick={() => {
                        setFocused(day);
                        onSelect(day);
                      }}
                      className={cn(
                        "flex size-9 flex-col items-center justify-center rounded-md text-copy-14 tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
                        outside ? "text-ds-gray-700" : "text-ds-gray-1000",
                        isSelected ? "bg-ds-gray-1000 text-ds-background-100" : "hover:bg-ds-gray-alpha-200",
                        day === today && !isSelected && "ring-1 ring-ds-gray-400",
                        cellClassName,
                      )}
                    >
                      {fromIso(day).getDate()}
                      {renderCell?.(day)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
