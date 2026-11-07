// 空状态（Geist Empty State）：图标 + 一句话说清为什么是空的 + 下一步动作；区分「还没有数据」和「筛选后没有结果」两种文案。
import * as React from "react";
import { InboxIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  readonly title: string;
  readonly description?: string;
  readonly icon?: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly size?: "small" | "medium";
}

export function EmptyState({ title, description, icon, action, size = "medium", className, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center text-center", size === "small" ? "gap-2 py-6" : "gap-3 py-12", className)} {...props}>
      <span aria-hidden="true" className={cn("flex items-center justify-center rounded-full border border-ds-gray-400 bg-ds-background-200 text-ds-gray-900", size === "small" ? "size-10 [&_svg]:size-5" : "size-12 [&_svg]:size-6")}>
        {icon ?? <InboxIcon />}
      </span>
      <p className={size === "small" ? "text-label-14" : "text-heading-16"}>{title}</p>
      {description !== undefined ? <p className="max-w-sm text-copy-14 text-ds-gray-900">{description}</p> : null}
      {action !== undefined ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
