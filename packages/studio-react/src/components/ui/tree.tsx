// 树形控件：role=tree / treeitem / group，可展开的节点带 aria-expanded；键盘按 WAI-ARIA 树的约定——上下移动、右展开或进子节点、
// 左收起或回父节点、回车 / 空格选中；checkable 时每个节点有多选框，父节点按子节点算半选（Geist File Tree 的形态 + antd Tree 的能力）。
import * as React from "react";
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TreeNode {
  readonly key: string;
  readonly label: string;
  readonly children?: readonly TreeNode[];
  readonly disabled?: boolean;
}

export interface TreeProps extends Omit<React.ComponentProps<"ul">, "onSelect"> {
  readonly nodes: readonly TreeNode[];
  readonly selected?: string | null;
  readonly onSelect?: (key: string) => void;
  readonly checkable?: boolean;
  readonly checked?: readonly string[];
  readonly onCheckedChange?: (keys: string[]) => void;
  readonly defaultExpanded?: readonly string[];
  readonly icons?: "file" | "none";
}

function leaves(node: TreeNode): string[] {
  return node.children?.length ? node.children.flatMap(leaves) : [node.key];
}

export function Tree({ nodes, selected = null, onSelect, checkable = false, checked = [], onCheckedChange, defaultExpanded = [], icons = "none", className, ...props }: TreeProps) {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set(defaultExpanded));
  const [focused, setFocused] = React.useState<string | null>(null);
  const refs = React.useRef(new Map<string, HTMLLIElement>());
  const visible: { node: TreeNode; parent: string | null }[] = [];
  const walk = (list: readonly TreeNode[], parent: string | null) => {
    for (const node of list) {
      visible.push({ node, parent });
      if (node.children?.length && expanded.has(node.key)) walk(node.children, node.key);
    }
  };
  walk(nodes, null);
  const tabStop = focused ?? selected ?? visible[0]?.node.key ?? null;
  const toggle = (key: string, open?: boolean) => setExpanded((prev) => {
    const next = new Set(prev);
    if (open ?? !next.has(key)) next.add(key);
    else next.delete(key);
    return next;
  });
  const focus = (key: string) => {
    setFocused(key);
    refs.current.get(key)?.focus();
  };
  const checkState = (node: TreeNode): boolean | "mixed" => {
    const all = leaves(node);
    const count = all.filter((key) => checked.includes(key)).length;
    return count === 0 ? false : count === all.length ? true : "mixed";
  };
  const toggleCheck = (node: TreeNode) => {
    const all = leaves(node);
    const state = checkState(node);
    onCheckedChange?.(state === true ? checked.filter((key) => !all.includes(key)) : [...new Set([...checked, ...all])]);
  };
  function onKeyDown(event: React.KeyboardEvent, node: TreeNode, parent: string | null): void {
    const index = visible.findIndex((item) => item.node.key === node.key);
    const hasChildren = Boolean(node.children?.length);
    if (event.key === "ArrowDown" && index < visible.length - 1) focus(visible[index + 1]!.node.key);
    else if (event.key === "ArrowUp" && index > 0) focus(visible[index - 1]!.node.key);
    else if (event.key === "ArrowRight" && hasChildren) {
      if (expanded.has(node.key)) focus(node.children![0]!.key);
      else toggle(node.key, true);
    } else if (event.key === "ArrowLeft") {
      if (hasChildren && expanded.has(node.key)) toggle(node.key, false);
      else if (parent !== null) focus(parent);
    } else if (event.key === "Enter" || event.key === " ") {
      if (node.disabled) return;
      if (checkable) toggleCheck(node);
      else onSelect?.(node.key);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }
  function render(list: readonly TreeNode[], parent: string | null, depth: number): React.ReactNode {
    return list.map((node) => {
      const hasChildren = Boolean(node.children?.length);
      const isOpen = expanded.has(node.key);
      const state = checkable ? checkState(node) : undefined;
      return (
        <li
          key={node.key}
          ref={(element) => {
            if (element === null) refs.current.delete(node.key);
            else refs.current.set(node.key, element);
          }}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-selected={checkable ? undefined : node.key === selected}
          aria-checked={state}
          aria-disabled={node.disabled || undefined}
          tabIndex={node.key === tabStop ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, node, parent)}
          onFocus={(event) => { if (event.target === event.currentTarget) setFocused(node.key); }}
          className="outline-none [&:focus-visible>div]:ring-[3px] [&:focus-visible>div]:ring-ring/50"
        >
          <div
            className={cn("flex h-8 cursor-default items-center gap-1 rounded-md pr-2 text-copy-14", node.key === selected && !checkable ? "bg-ds-gray-alpha-200" : "hover:bg-ds-gray-alpha-100", node.disabled && "opacity-50")}
            style={{ paddingLeft: depth * 16 + 4 }}
            onClick={() => {
              if (node.disabled) return;
              if (hasChildren) toggle(node.key);
              if (checkable) toggleCheck(node);
              else onSelect?.(node.key);
            }}
          >
            <span className="flex size-4 items-center justify-center">{hasChildren ? <ChevronRightIcon aria-hidden="true" className={cn("size-4 text-ds-gray-900 transition-transform motion-reduce:transition-none", isOpen && "rotate-90")} /> : null}</span>
            {checkable ? (
              <span aria-hidden="true" className={cn("flex size-4 items-center justify-center rounded-sm border text-label-12", state === false ? "border-input" : "border-primary bg-primary text-primary-foreground")}>
                {state === true ? "✓" : state === "mixed" ? "−" : null}
              </span>
            ) : null}
            {icons === "file" ? (hasChildren ? (isOpen ? <FolderOpenIcon aria-hidden="true" className="size-4 text-ds-gray-900" /> : <FolderIcon aria-hidden="true" className="size-4 text-ds-gray-900" />) : <FileIcon aria-hidden="true" className="size-4 text-ds-gray-900" />) : null}
            <span className="truncate">{node.label}</span>
          </div>
          {hasChildren && isOpen ? <ul role="group">{render(node.children!, node.key, depth + 1)}</ul> : null}
        </li>
      );
    });
  }
  return (
    <ul data-slot="tree" role="tree" aria-multiselectable={checkable || undefined} className={cn("flex flex-col", className)} {...props}>
      {render(nodes, null, 0)}
    </ul>
  );
}

export function findTreeLabel(nodes: readonly TreeNode[], key: string): string | null {
  for (const node of nodes) {
    if (node.key === key) return node.label;
    const hit = node.children === undefined ? null : findTreeLabel(node.children, key);
    if (hit !== null) return hit;
  }
  return null;
}
