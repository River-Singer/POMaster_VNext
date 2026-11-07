// 穿梭框：左右两个可勾选、可搜索的列表，中间两个按钮把勾选项移到另一边（按钮带可读名称、没勾选时禁用），
// 列表头写「已选 2 / 共 12 项」。Geist 没有这个组件，用 Geist token 与 Checkbox、SearchInput 组合。
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { SearchInput } from "./search-input";

export interface TransferItem {
  readonly key: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface TransferProps {
  readonly items: readonly TransferItem[];
  /** 右侧（已选）的 key。 */
  readonly targetKeys: readonly string[];
  readonly onChange: (targetKeys: string[]) => void;
  readonly titles?: readonly [string, string];
  readonly className?: string;
}

function Pane({ title, items, checked, onChecked, query, onQuery }: { title: string; items: readonly TransferItem[]; checked: readonly string[]; onChecked: (keys: string[]) => void; query: string; onQuery: (q: string) => void }) {
  const visible = items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const enabled = visible.filter((item) => !item.disabled);
  const allState = enabled.length > 0 && enabled.every((item) => checked.includes(item.key)) ? true : enabled.some((item) => checked.includes(item.key)) ? "indeterminate" : false;
  const id = React.useId();
  return (
    <section aria-labelledby={`${id}-title`} className="flex w-64 flex-col overflow-hidden rounded-lg border border-ds-gray-400">
      <header className="flex h-10 items-center gap-2 border-b border-ds-gray-400 px-3">
        <Checkbox aria-label={`全选${title}`} checked={allState} onCheckedChange={(value) => onChecked(value === true ? enabled.map((item) => item.key) : [])} />
        <span id={`${id}-title`} className="flex-1 text-label-13">{title}</span>
        <span className="text-label-12 text-ds-gray-900 tabular-nums">{checked.length > 0 ? `已选 ${checked.length} / ` : ""}共 {items.length} 项</span>
      </header>
      <div className="p-2">
        <SearchInput value={query} onValueChange={onQuery} debounce={0} aria-label={`搜索${title}`} className="h-8" />
      </div>
      <ul className="h-48 overflow-y-auto px-1 pb-1">
        {visible.length === 0 ? <li className="py-6 text-center text-copy-13 text-ds-gray-900">没有数据</li> : null}
        {visible.map((item) => (
          <li key={item.key}>
            <label className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-copy-14 hover:bg-ds-gray-alpha-100", item.disabled && "opacity-50")}>
              <Checkbox disabled={item.disabled} checked={checked.includes(item.key)} onCheckedChange={(value) => onChecked(value === true ? [...checked, item.key] : checked.filter((key) => key !== item.key))} />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Transfer({ items, targetKeys, onChange, titles = ["待选", "已选"], className }: TransferProps) {
  const [leftChecked, setLeftChecked] = React.useState<string[]>([]);
  const [rightChecked, setRightChecked] = React.useState<string[]>([]);
  const [leftQuery, setLeftQuery] = React.useState("");
  const [rightQuery, setRightQuery] = React.useState("");
  const source = items.filter((item) => !targetKeys.includes(item.key));
  const target = items.filter((item) => targetKeys.includes(item.key));
  return (
    <div data-slot="transfer" className={cn("flex items-center gap-3", className)}>
      <Pane title={titles[0]} items={source} checked={leftChecked} onChecked={setLeftChecked} query={leftQuery} onQuery={setLeftQuery} />
      <div className="flex flex-col gap-2">
        <Button size="small" variant="secondary" svgOnly aria-label={`移到${titles[1]}`} disabled={leftChecked.length === 0} onClick={() => { onChange([...targetKeys, ...leftChecked]); setLeftChecked([]); }}>
          <ChevronRightIcon />
        </Button>
        <Button size="small" variant="secondary" svgOnly aria-label={`移回${titles[0]}`} disabled={rightChecked.length === 0} onClick={() => { onChange(targetKeys.filter((key) => !rightChecked.includes(key))); setRightChecked([]); }}>
          <ChevronLeftIcon />
        </Button>
      </div>
      <Pane title={titles[1]} items={target} checked={rightChecked} onChecked={setRightChecked} query={rightQuery} onQuery={setRightQuery} />
    </div>
  );
}
