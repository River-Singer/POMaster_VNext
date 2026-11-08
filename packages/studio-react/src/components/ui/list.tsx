// 列表 / 实体行（Geist Entity）：每行「图标或头像 + 标题 + 描述 + 元信息 + 操作」，ul / li 语义；
// 整行可点时只有标题是链接（行内其他按钮仍可单独聚焦），不把整行包成按钮。
import * as React from "react";
import { cn } from "../../lib/utils";

export function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="list" className={cn("divide-y divide-ds-gray-400 overflow-hidden rounded-lg border border-ds-gray-400", className)} {...props} />;
}

export interface ListItemProps extends Omit<React.ComponentProps<"li">, "title"> {
  readonly title: React.ReactNode;
  readonly href?: string;
  readonly description?: React.ReactNode;
  readonly leading?: React.ReactNode;
  readonly meta?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function ListItem({ title, href, description, leading, meta, actions, className, ...props }: ListItemProps) {
  return (
    <li data-slot="list-item" className={cn("relative flex items-center gap-3 bg-ds-background-100 px-4 py-3 has-[a:hover]:bg-ds-gray-100", className)} {...props}>
      {leading !== undefined ? <span className="shrink-0">{leading}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {href !== undefined ? (
          <a href={href} className="truncate text-label-14 text-ds-gray-1000 outline-none after:absolute after:inset-0 focus-visible:underline">
            {title}
          </a>
        ) : (
          <span className="truncate text-label-14 text-ds-gray-1000">{title}</span>
        )}
        {description !== undefined ? <span className="truncate text-copy-13 text-ds-gray-900">{description}</span> : null}
      </div>
      {meta !== undefined ? <span className="shrink-0 text-copy-13 text-ds-gray-900 tabular-nums">{meta}</span> : null}
      {actions !== undefined ? <span className="relative z-10 flex shrink-0 items-center gap-2">{actions}</span> : null}
    </li>
  );
}
