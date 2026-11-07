// 导航菜单：管理端侧栏的竖向菜单——分组标题、图标 + 文字、当前页 aria-current="page"、可展开的二级菜单（按钮带 aria-expanded）。
// 收起态只显示图标并把名称放进 Tooltip。Geist 没有这个组件，用 Geist 色阶、排版类与 shadcn Sidebar 的尺寸做。
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface NavMenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly href?: string;
  readonly children?: readonly NavMenuItem[];
  readonly badge?: string;
}

export interface NavMenuGroup {
  readonly label?: string;
  readonly items: readonly NavMenuItem[];
}

export interface NavMenuProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly groups: readonly NavMenuGroup[];
  readonly current: string;
  readonly collapsed?: boolean;
  readonly defaultOpen?: readonly string[];
}

const ROW = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-copy-14 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

export function NavMenu({ groups, current, collapsed = false, defaultOpen = [], className, ...props }: NavMenuProps) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set(defaultOpen));
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  function link(item: NavMenuItem, depth: number): React.ReactNode {
    const isCurrent = item.key === current;
    const body = (
      <a
        href={item.href ?? "#"}
        aria-current={isCurrent ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(ROW, depth > 0 && !collapsed && "pl-8", isCurrent ? "bg-ds-gray-alpha-200 font-medium text-ds-gray-1000" : "text-ds-gray-900 hover:bg-ds-gray-alpha-100 hover:text-ds-gray-1000")}
      >
        {item.icon}
        {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
        {collapsed || item.badge === undefined ? null : <span className="text-label-12 tabular-nums text-ds-gray-900">{item.badge}</span>}
      </a>
    );
    if (!collapsed) return body;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div data-slot="nav-menu" className={cn("flex flex-col gap-4", className)} {...props}>
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex} role="group" aria-label={group.label}>
          {group.label !== undefined && !collapsed ? <div className="px-2 pb-1 text-label-12 text-ds-gray-900">{group.label}</div> : null}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              if (item.children === undefined || collapsed) return <li key={item.key}>{link(item, 0)}</li>;
              const expanded = open.has(item.key) || item.children.some((child) => child.key === current);
              return (
                <li key={item.key}>
                  <button type="button" aria-expanded={expanded} onClick={() => toggle(item.key)} className={cn(ROW, "text-ds-gray-900 hover:bg-ds-gray-alpha-100 hover:text-ds-gray-1000")}>
                    {item.icon}
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronDownIcon aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
                  </button>
                  {expanded ? <ul className="mt-1 flex flex-col gap-1">{item.children.map((child) => <li key={child.key}>{link(child, 1)}</li>)}</ul> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
