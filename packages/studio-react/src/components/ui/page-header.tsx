// 页头：面包屑（可选）+ 返回 + 标题（页面唯一的 h1）+ 描述 + 右侧主操作；主操作最多一个主按钮，其余用次按钮或收进更多菜单。
import * as React from "react";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { ButtonLink } from "./button";

export interface PageHeaderProps extends Omit<React.ComponentProps<"header">, "title"> {
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly breadcrumb?: React.ReactNode;
  readonly backHref?: string;
  readonly actions?: React.ReactNode;
  readonly meta?: React.ReactNode;
}

export function PageHeader({ title, description, breadcrumb, backHref, actions, meta, className, children, ...props }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-3 border-b border-ds-gray-400 pb-6", className)} {...props}>
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {backHref !== undefined ? (
            <ButtonLink href={backHref} size="small" variant="tertiary" svgOnly aria-label="返回上一级">
              <ArrowLeftIcon />
            </ButtonLink>
          ) : null}
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-heading-32 [text-wrap:balance]">{title}</h1>
            {description !== undefined ? <p className="max-w-prose text-copy-16 text-ds-gray-900">{description}</p> : null}
            {meta !== undefined ? <div className="flex flex-wrap items-center gap-3 text-copy-13 text-ds-gray-900">{meta}</div> : null}
          </div>
        </div>
        {actions !== undefined ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
