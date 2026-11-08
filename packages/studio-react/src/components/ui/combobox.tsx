// 可搜索选择（Combobox）：按钮显示当前值，点开是「搜索框 + 选项列表」（Geist Combobox）。选项超过 7 个时用它代替 Select。
// 键盘：上下键移动、回车选中、Esc 关闭并把焦点还给按钮；读屏：input[role=combobox] + listbox / option + aria-activedescendant。
import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export function filterOptions<T extends ComboboxOption>(options: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...options];
  return options.filter((option) => [option.label, option.value, ...(option.keywords ?? [])].some((text) => text.toLowerCase().includes(q)));
}

/** 选项列表的键盘与读屏逻辑（Combobox、MultiSelect、AutoComplete 共用）。 */
export function useListNavigation<T extends ComboboxOption>(options: readonly T[], onPick: (option: T) => void) {
  const [active, setActive] = React.useState(0);
  const enabled = options.filter((option) => !option.disabled);
  const activeOption = enabled[Math.min(active, Math.max(0, enabled.length - 1))];
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (enabled.length === 0) return;
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length);
    } else if (event.key === "Enter" && activeOption !== undefined) {
      event.preventDefault();
      onPick(activeOption);
    }
  };
  return { activeOption, setActive: (option: T) => setActive(Math.max(0, enabled.indexOf(option))), reset: () => setActive(0), onKeyDown };
}

export const TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-copy-14 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";
export const OPTION_CLASS = "flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-copy-14 data-[active=true]:bg-ds-gray-alpha-200 aria-disabled:opacity-50";

export interface ComboboxProps {
  readonly options: readonly ComboboxOption[];
  readonly value: string | null;
  readonly onValueChange: (value: string | null) => void;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly id?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
}

export function Combobox({ options, value, onValueChange, placeholder = "请选择", searchPlaceholder = "搜索", emptyText = "没有匹配的选项", id, className, disabled, ...rest }: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();
  const visible = filterOptions(options, query);
  const nav = useListNavigation(visible, (option) => pick(option));
  const selected = options.find((option) => option.value === value) ?? null;
  function pick(option: ComboboxOption): void {
    onValueChange(option.value === value ? null : option.value);
    setOpen(false);
    setQuery("");
  }
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setQuery(""); nav.reset(); } }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} disabled={disabled} aria-label={rest["aria-label"]} className={cn(TRIGGER_CLASS, className)} data-slot="combobox">
          <span className={cn("truncate", selected === null && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={nav.activeOption === undefined ? undefined : `${listId}-${nav.activeOption.value}`}
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          className="h-10 w-full border-b border-ds-gray-400 bg-transparent px-3 text-copy-14 outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => { setQuery(event.target.value); nav.reset(); }}
          onKeyDown={nav.onKeyDown}
        />
        <div id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {visible.length === 0 ? <p className="px-2 py-4 text-center text-copy-13 text-ds-gray-900">{emptyText}</p> : null}
          {visible.map((option) => (
            <div
              key={option.value}
              id={`${listId}-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={option === nav.activeOption}
              className={OPTION_CLASS}
              onMouseMove={() => !option.disabled && nav.setActive(option)}
              onClick={() => !option.disabled && pick(option)}
            >
              <CheckIcon aria-hidden="true" className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")} />
              {option.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
