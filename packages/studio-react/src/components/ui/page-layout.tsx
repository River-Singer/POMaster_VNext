// 页面布局：管理端外框 = 顶栏 + 侧栏 + 内容区（规范 LAYOUT.ADMIN_SHELL）。侧栏可收起到图标宽度（3rem，
// shadcn/ui Sidebar 的 SIDEBAR_WIDTH_ICON），内容区限宽 1400px；用语义地标（header / nav / main）。
import * as React from "react";
import { PanelLeftIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface PageLayoutProps extends React.ComponentProps<"div"> {
  readonly brand: React.ReactNode;
  readonly header?: React.ReactNode;
  readonly sidebar: React.ReactNode;
  readonly defaultCollapsed?: boolean;
  /** 演示用：外框高度跟随容器而不是视口。 */
  readonly contained?: boolean;
}

export function PageLayout({ brand, header, sidebar, defaultCollapsed = false, contained = false, className, children, ...props }: PageLayoutProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  return (
    <div data-slot="page-layout" data-collapsed={collapsed || undefined} className={cn("flex flex-col bg-ds-background-200", contained ? "h-full" : "min-h-screen", className)} {...props}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ds-gray-400 bg-ds-background-100 px-4">
        <Button variant="tertiary" size="small" svgOnly aria-label={collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <PanelLeftIcon />
        </Button>
        <span className="text-label-14 font-semibold">{brand}</span>
        <div className="ml-auto flex items-center gap-2">{header}</div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="主导航" className={cn("shrink-0 overflow-y-auto border-r border-ds-gray-400 bg-ds-background-100 p-2 transition-[width] duration-200 motion-reduce:transition-none", collapsed ? "w-12" : "w-60")}>
          {sidebar}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
