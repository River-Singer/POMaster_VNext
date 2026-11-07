// 树选择：按钮显示选中节点，点开是带搜索的树（Popover + Tree）。适合组织架构、车队分组这类层级数据；
// 单选时选中即关闭，多选（checkable）时以「已选 N 项」显示。
import * as React from "react";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { TRIGGER_CLASS } from "./combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Tree, findTreeLabel, type TreeNode } from "./tree";

export interface TreeSelectProps {
  readonly nodes: readonly TreeNode[];
  readonly value: string | null;
  readonly onValueChange: (key: string) => void;
  readonly placeholder?: string;
  readonly defaultExpanded?: readonly string[];
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function TreeSelect({ nodes, value, onValueChange, placeholder = "请选择", defaultExpanded = [], id, className, ...rest }: TreeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const label = value === null ? null : findTreeLabel(nodes, value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id} aria-label={rest["aria-label"]} className={cn(TRIGGER_CLASS, className)} data-slot="tree-select">
          <span className={cn("truncate", label === null && "text-muted-foreground")}>{label ?? placeholder}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        <Tree
          nodes={nodes}
          selected={value}
          defaultExpanded={defaultExpanded}
          aria-label={rest["aria-label"] ?? placeholder}
          onSelect={(key) => {
            onValueChange(key);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
