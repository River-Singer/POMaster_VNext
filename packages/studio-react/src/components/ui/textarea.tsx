// 多行输入：与 Input 同一套边框、焦点环与出错态；autoResize 时随内容长高（上限 maxRows 行），showCount 时显示字数与上限。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends Omit<React.ComponentProps<"textarea">, "ref"> {
  readonly showCount?: boolean;
  readonly autoResize?: boolean;
  readonly maxRows?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, showCount = false, autoResize = false, maxRows = 8, maxLength, value, defaultValue, onChange, ...props },
  ref,
) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  const [length, setLength] = React.useState(String(value ?? defaultValue ?? "").length);
  const resize = React.useCallback(() => {
    const node = inner.current;
    if (!autoResize || node === null) return;
    node.style.height = "auto";
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
    node.style.height = `${Math.min(node.scrollHeight, line * maxRows + 16)}px`;
  }, [autoResize, maxRows]);
  React.useLayoutEffect(resize, [resize, value]);
  return (
    <div data-slot="textarea" className="flex w-full flex-col gap-1">
      <textarea
        ref={(node) => {
          inner.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref !== null) ref.current = node;
        }}
        className={cn(
          "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-copy-14 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          autoResize && "resize-none",
          className,
        )}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          setLength(event.target.value.length);
          resize();
          onChange?.(event);
        }}
        {...props}
      />
      {showCount ? (
        <span className="self-end text-label-12 text-ds-gray-900 tabular-nums" aria-live="polite">
          {length}
          {maxLength !== undefined ? ` / ${maxLength}` : ""}
        </span>
      ) : null}
    </div>
  );
});
