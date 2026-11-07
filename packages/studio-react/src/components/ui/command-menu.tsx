// 命令面板：⌘K / Ctrl+K 打开的搜索框 + 分组命令列表（Geist Command Menu）。不另装 cmdk：Dialog（Radix）+ 输入框 +
// combobox / listbox 语义；上下键移动、回车执行、Esc 关闭；无结果时说明并给出下一步。
import * as React from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Kbd } from "./kbd";

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
  readonly onRun?: () => void;
}

export interface CommandMenuProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly items: readonly CommandItem[];
  readonly placeholder?: string;
  readonly emptyText?: string;
}

function matches(item: CommandItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [item.label, ...(item.keywords ?? [])].some((text) => text.toLowerCase().includes(q));
}

export function CommandMenu({ open, onOpenChange, items, placeholder = "输入命令或搜索", emptyText = "没有匹配的命令，换个关键词试试" }: CommandMenuProps) {
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);
  const listId = React.useId();
  const visible = items.filter((item) => matches(item, query));
  const groups = [...new Set(visible.map((item) => item.group))];
  const ordered = groups.flatMap((group) => visible.filter((item) => item.group === group));
  const activeItem = ordered[Math.min(index, ordered.length - 1)];

  function run(item: CommandItem | undefined): void {
    if (item === undefined) return;
    item.onRun?.();
    onOpenChange(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => (ordered.length === 0 ? 0 : (current + 1) % ordered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => (ordered.length === 0 ? 0 : (current - 1 + ordered.length) % ordered.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(activeItem);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setIndex(0);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">输入关键词筛选命令，上下键选择，回车执行</DialogDescription>
        <div className="flex items-center gap-2 border-b border-ds-gray-400 px-4">
          <SearchIcon aria-hidden="true" className="size-4 text-ds-gray-900" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeItem === undefined ? undefined : `${listId}-${activeItem.id}`}
            aria-label={placeholder}
            className="h-12 flex-1 bg-transparent text-copy-16 outline-none placeholder:text-ds-gray-700"
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="命令" className="max-h-80 overflow-y-auto p-2">
          {ordered.length === 0 ? <p className="px-2 py-6 text-center text-copy-14 text-ds-gray-900">{emptyText}</p> : null}
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group}>
              <div className="px-2 pt-2 pb-1 text-label-12 text-ds-gray-900">{group}</div>
              {ordered
                .filter((item) => item.group === group)
                .map((item) => (
                  <div
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={item === activeItem}
                    className={cn("flex cursor-default items-center justify-between rounded-md px-2 py-2 text-copy-14", item === activeItem && "bg-ds-gray-alpha-200")}
                    onMouseMove={() => setIndex(ordered.indexOf(item))}
                    onClick={() => run(item)}
                  >
                    {item.label}
                    {item.shortcut !== undefined ? <span className="text-label-12-mono text-ds-gray-900">{item.shortcut}</span> : null}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
