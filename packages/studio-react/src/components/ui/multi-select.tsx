// 多选选择器：按钮里以标签显示已选项（超过 maxTags 个折成「+N」），点开是「搜索框 + 带勾选的选项列表」（Geist Multi Select）。
// 选中项可在按钮里逐个移除（移除按钮带可读名称）；listbox 设 aria-multiselectable。
import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { OPTION_CLASS, TRIGGER_CLASS, filterOptions, useListNavigation, type ComboboxOption } from "./combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface MultiSelectProps {
  readonly options: readonly ComboboxOption[];
  readonly value: readonly string[];
  readonly onValueChange: (value: string[]) => void;
  readonly placeholder?: string;
  readonly maxTags?: number;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function MultiSelect({ options, value, onValueChange, placeholder = "请选择", maxTags = 3, id, className, ...rest }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();
  const visible = filterOptions(options, query);
  const toggle = (option: ComboboxOption) => onValueChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value]);
  const nav = useListNavigation(visible, toggle);
  const chosen = value.map((item) => options.find((option) => option.value === item)).filter((option): option is ComboboxOption => option !== undefined);
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <div data-slot="multi-select" className={cn(TRIGGER_CLASS, "h-auto min-h-9 flex-wrap py-1", className)}>
        {chosen.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : null}
        {chosen.slice(0, maxTags).map((option) => (
          <span key={option.value} className="inline-flex h-6 items-center gap-1 rounded-sm bg-ds-gray-alpha-200 pl-2 text-label-13">
            {option.label}
            <button type="button" aria-label={`移除 ${option.label}`} onClick={() => toggle(option)} className="flex size-6 items-center justify-center rounded-sm outline-none hover:bg-ds-gray-alpha-300 focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {chosen.length > maxTags ? <span className="text-label-13 text-ds-gray-900">+{chosen.length - maxTags}</span> : null}
        <PopoverTrigger asChild>
          <button type="button" id={id} aria-label={rest["aria-label"] ?? placeholder} className="ml-auto flex size-7 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <ChevronsUpDownIcon aria-hidden="true" className="size-4 opacity-50" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-72 p-0" align="start">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={nav.activeOption === undefined ? undefined : `${listId}-${nav.activeOption.value}`}
          aria-label="搜索选项"
          placeholder="搜索"
          className="h-10 w-full border-b border-ds-gray-400 bg-transparent px-3 text-copy-14 outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => { setQuery(event.target.value); nav.reset(); }}
          onKeyDown={nav.onKeyDown}
        />
        <div id={listId} role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
          {visible.map((option) => {
            const checked = value.includes(option.value);
            return (
              <div key={option.value} id={`${listId}-${option.value}`} role="option" aria-selected={checked} data-active={option === nav.activeOption} className={OPTION_CLASS} onMouseMove={() => nav.setActive(option)} onClick={() => toggle(option)}>
                <span className={cn("flex size-4 items-center justify-center rounded-sm border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {checked ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
                </span>
                {option.label}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
