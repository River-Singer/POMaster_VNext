// 数字输入：右对齐、等宽数字，左右是减 / 加按钮（各带可读名称，长按不连发），上下键加减一步、Shift 加减十步；
// 越界时夹到最小 / 最大值；可带单位后缀（规范 CMP.INPUT_NUMBER.*）。Geist 没有这个组件，用 Input 的 token 组合而成。
import * as React from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface InputNumberProps extends Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "step" | "ref"> {
  readonly value?: number | null;
  readonly defaultValue?: number | null;
  readonly onValueChange?: (value: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly precision?: number;
  readonly unit?: string;
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value));
}

export function InputNumber({ value, defaultValue = null, onValueChange, min, max, step = 1, precision = 0, unit, className, disabled, ...props }: InputNumberProps) {
  const [inner, setInner] = React.useState<number | null>(defaultValue);
  const current = value === undefined ? inner : value;
  const [text, setText] = React.useState(current === null ? "" : current.toFixed(precision));
  React.useEffect(() => setText(current === null ? "" : current.toFixed(precision)), [current, precision]);
  function commit(next: number | null): void {
    const fixed = next === null ? null : Number(clamp(next, min, max).toFixed(precision));
    if (value === undefined) setInner(fixed);
    onValueChange?.(fixed);
    setText(fixed === null ? "" : fixed.toFixed(precision));
  }
  const bump = (direction: 1 | -1, factor = 1) => commit((current ?? min ?? 0) + direction * step * factor);
  const BUTTON = "flex w-9 shrink-0 items-center justify-center text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4";
  return (
    <div data-slot="input-number" className={cn("flex h-9 w-40 overflow-hidden rounded-md border border-input focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50", disabled && "opacity-50", className)}>
      <button type="button" tabIndex={-1} aria-label="减少" className={cn(BUTTON, "border-r border-input")} disabled={disabled || (min !== undefined && current !== null && current <= min)} onClick={() => bump(-1)}>
        <MinusIcon />
      </button>
      <input
        {...props}
        disabled={disabled}
        inputMode={precision > 0 ? "decimal" : "numeric"}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current ?? undefined}
        className="min-w-0 flex-1 bg-transparent px-2 text-right text-copy-14 tabular-nums outline-none"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(text.trim() === "" || Number.isNaN(Number(text)) ? null : Number(text))}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            bump(event.key === "ArrowUp" ? 1 : -1, event.shiftKey ? 10 : 1);
          } else if (event.key === "Enter") {
            commit(text.trim() === "" ? null : Number(text));
          }
        }}
      />
      {unit !== undefined ? <span className="flex items-center pr-2 text-copy-13 text-ds-gray-900">{unit}</span> : null}
      <button type="button" tabIndex={-1} aria-label="增加" className={cn(BUTTON, "border-l border-input")} disabled={disabled || (max !== undefined && current !== null && current >= max)} onClick={() => bump(1)}>
        <PlusIcon />
      </button>
    </div>
  );
}
