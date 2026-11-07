// 自动完成：在输入框里打字时给出补全建议（Popover 锚在输入框上，焦点留在输入框）。和 Combobox 的区别：值是自由文本，
// 建议只是帮着填。键盘：上下键移动、回车采用、Esc 收起；读屏：input[role=combobox] + listbox。
import * as React from "react";
import { cn } from "../../lib/utils";
import { OPTION_CLASS, filterOptions, useListNavigation, type ComboboxOption } from "./combobox";
import { INPUT_CLASS } from "./input";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

export interface AutoCompleteProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "ref"> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly suggestions: readonly ComboboxOption[];
}

export function AutoComplete({ value, onValueChange, suggestions, className, onKeyDown, ...props }: AutoCompleteProps) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const visible = value.trim() === "" ? [] : filterOptions(suggestions, value).slice(0, 8);
  const nav = useListNavigation(visible, (option) => {
    onValueChange(option.label);
    setOpen(false);
  });
  const expanded = open && visible.length > 0;
  return (
    <Popover open={expanded} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          {...props}
          data-slot="auto-complete"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && nav.activeOption !== undefined ? `${listId}-${nav.activeOption.value}` : undefined}
          className={cn(INPUT_CLASS, className)}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
            nav.reset();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            else if (expanded) nav.onKeyDown(event);
            onKeyDown?.(event);
          }}
          onBlur={() => setOpen(false)}
        />
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-1" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div id={listId} role="listbox">
          {visible.map((option) => (
            <div
              key={option.value}
              id={`${listId}-${option.value}`}
              role="option"
              aria-selected={option === nav.activeOption}
              data-active={option === nav.activeOption}
              className={OPTION_CLASS}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => nav.setActive(option)}
              onClick={() => {
                onValueChange(option.label);
                setOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
