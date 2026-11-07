// 搜索框：左侧搜索图标、右侧清除按钮（有内容时出现，带可读名称），回车或停顿 300ms 触发搜索（规范 PERF.INPUT）；
// type="search" 与 role 由原生输入框提供（Geist Search Input）。
import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { INPUT_CLASS } from "./input";

export interface SearchInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "defaultValue" | "type" | "ref"> {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** 停顿多少毫秒后触发 onSearch；0 = 只在回车时触发。 */
  readonly debounce?: number;
  readonly onSearch?: (value: string) => void;
}

export function SearchInput({ value, defaultValue = "", onValueChange, debounce = 300, onSearch, className, placeholder = "搜索", ...props }: SearchInputProps) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  function change(next: string): void {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
    window.clearTimeout(timer.current);
    if (debounce > 0) timer.current = window.setTimeout(() => onSearch?.(next), debounce);
  }
  return (
    <div data-slot="search-input" className={cn("relative w-full", className)}>
      <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ds-gray-900" />
      <input
        type="search"
        className={cn(INPUT_CLASS, "pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden")}
        placeholder={placeholder}
        aria-label={props["aria-label"] ?? placeholder}
        value={current}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            window.clearTimeout(timer.current);
            onSearch?.(current);
          }
        }}
        {...props}
      />
      {current !== "" ? (
        <button type="button" aria-label="清空搜索" onClick={() => { change(""); onSearch?.(""); }} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
