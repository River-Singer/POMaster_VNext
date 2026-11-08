// 评分：一组单选（radiogroup），每颗星是 radio，带「3 星，共 5 星」这样的读屏名称；方向键改分、可清零（allowClear 时再点当前分）。
// 只读展示时用 readOnly：整体一个 img 角色并给出分数文字。Geist 没有这个组件，星色取 Geist amber 色阶。
import * as React from "react";
import { StarIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface RateProps {
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  readonly count?: number;
  readonly readOnly?: boolean;
  readonly allowClear?: boolean;
  readonly labels?: readonly string[];
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function Rate({ value, onValueChange, count = 5, readOnly = false, allowClear = true, labels, className, ...rest }: RateProps) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;
  const star = (index: number) => <StarIcon aria-hidden="true" className={cn("size-5", index <= shown ? "fill-ds-amber-700 text-ds-amber-700" : "text-ds-gray-400")} />;
  if (readOnly) {
    return (
      <span data-slot="rate" role="img" aria-label={`${value} 星，共 ${count} 星`} className={cn("inline-flex gap-1", className)}>
        {Array.from({ length: count }, (_, i) => <React.Fragment key={i}>{star(i + 1)}</React.Fragment>)}
      </span>
    );
  }
  return (
    <div data-slot="rate" role="radiogroup" aria-label={rest["aria-label"] ?? "评分"} className={cn("inline-flex items-center gap-1", className)} onMouseLeave={() => setHover(null)}>
      {Array.from({ length: count }, (_, i) => {
        const score = i + 1;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={labels?.[i] ?? `${score} 星，共 ${count} 星`}
            tabIndex={score === (value || 1) ? 0 : -1}
            className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onMouseEnter={() => setHover(score)}
            onClick={() => onValueChange?.(allowClear && score === value ? 0 : score)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" || event.key === "ArrowUp" ? Math.min(count, value + 1) : event.key === "ArrowLeft" || event.key === "ArrowDown" ? Math.max(allowClear ? 0 : 1, value - 1) : null;
              if (next === null) return;
              event.preventDefault();
              onValueChange?.(next);
              (event.currentTarget.parentElement?.children[Math.max(0, next - 1)] as HTMLElement | undefined)?.focus();
            }}
          >
            {star(score)}
          </button>
        );
      })}
      {labels !== undefined && shown > 0 ? <span className="ml-2 text-copy-13 text-ds-gray-900">{labels[shown - 1]}</span> : null}
    </div>
  );
}
