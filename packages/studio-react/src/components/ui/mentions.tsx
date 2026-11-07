// 提及：多行输入里打 @ 弹出候选人（Popover 锚在输入框上、焦点留在输入框），上下键选、回车或 Tab 插入「@姓名 」，Esc 收起。
// Geist 没有这个组件，用 Textarea 的 token 与 Combobox 的列表样式做。
import * as React from "react";
import { cn } from "../../lib/utils";
import { OPTION_CLASS, filterOptions, useListNavigation, type ComboboxOption } from "./combobox";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

export interface MentionsProps extends Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "ref"> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly people: readonly ComboboxOption[];
  readonly trigger?: string;
}

export function Mentions({ value, onValueChange, people, trigger = "@", className, ...props }: MentionsProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = React.useState<string | null>(null);
  const listId = React.useId();
  const visible = query === null ? [] : filterOptions(people, query).slice(0, 6);
  const open = query !== null && visible.length > 0;
  const insert = (option: ComboboxOption) => {
    const node = ref.current;
    if (node === null) return;
    const caret = node.selectionStart;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf(trigger);
    const next = `${value.slice(0, at)}${trigger}${option.label} ${value.slice(caret)}`;
    onValueChange(next);
    setQuery(null);
    const position = at + option.label.length + 2;
    requestAnimationFrame(() => node.setSelectionRange(position, position));
  };
  const nav = useListNavigation(visible, insert);
  function sync(text: string, caret: number): void {
    const before = text.slice(0, caret);
    const match = new RegExp(`(?:^|\\s)${trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\s${trigger}]*)$`).exec(before);
    setQuery(match === null ? null : match[1]!);
    nav.reset();
  }
  return (
    <Popover open={open} onOpenChange={(next) => !next && setQuery(null)}>
      <PopoverAnchor asChild>
        <textarea
          {...props}
          ref={ref}
          data-slot="mentions"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && nav.activeOption !== undefined ? `${listId}-${nav.activeOption.value}` : undefined}
          className={cn("min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-copy-14 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            sync(event.target.value, event.target.selectionStart);
          }}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === "Escape") {
              event.preventDefault();
              setQuery(null);
            } else if (event.key === "Tab" && nav.activeOption !== undefined) {
              event.preventDefault();
              insert(nav.activeOption);
            } else nav.onKeyDown(event);
          }}
          onBlur={() => setQuery(null)}
        />
      </PopoverAnchor>
      <PopoverContent className="w-56 p-1" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div id={listId} role="listbox" aria-label="提及的人">
          {visible.map((option) => (
            <div key={option.value} id={`${listId}-${option.value}`} role="option" aria-selected={option === nav.activeOption} data-active={option === nav.activeOption} className={OPTION_CLASS} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(option)}>
              {option.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
