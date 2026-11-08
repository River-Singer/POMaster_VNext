// 加载中（Geist Spinner / Loading Dots）：转圈用于按钮内与小区域，三点用于行内文字；都带 role="status" 与可读文字。
// LoadingOverlay 包住一块已有内容：加载时盖一层半透明遮罩、内容 aria-busy、不可交互（对应 antd Spin 的包裹用法）；
// 不足 300ms 的加载不显示（避免闪一下），减少动效时转圈换成静态图标 + 文字。
import * as React from "react";
import { cn } from "../../lib/utils";

const SIZES = { 16: "size-4 border-2", 24: "size-6 border-2", 32: "size-8 border-[3px]" } as const;

export function Spinner({ size = 16, label = "加载中", className }: { readonly size?: keyof typeof SIZES; readonly label?: string; readonly className?: string }) {
  return (
    <span data-slot="spinner" role="status" className={cn("inline-flex items-center", className)}>
      <span aria-hidden="true" className={cn("rounded-full border-current border-r-transparent text-ds-gray-900 motion-safe:animate-spin", SIZES[size])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingDots({ label = "加载中", className }: { readonly label?: string; readonly className?: string }) {
  return (
    <span data-slot="loading-dots" role="status" className={cn("inline-flex items-center gap-1", className)}>
      {[0, 150, 300].map((delay) => (
        <span key={delay} aria-hidden="true" className="size-1 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function useDelayedFlag(flag: boolean, delay = 300): boolean {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!flag) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [flag, delay]);
  return shown;
}

export function LoadingOverlay({ loading, label = "加载中", delay = 300, className, children }: { readonly loading: boolean; readonly label?: string; readonly delay?: number; readonly className?: string; readonly children: React.ReactNode }) {
  const shown = useDelayedFlag(loading, delay);
  const content = React.useRef<HTMLDivElement>(null);
  // inert：遮罩期间内容既点不到也聚焦不到（React 18 的类型里还没有 inert 属性，直接设到节点上）。
  React.useEffect(() => {
    const node = content.current;
    if (node === null) return;
    if (shown) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [shown]);
  return (
    <div data-slot="loading-overlay" aria-busy={loading || undefined} className={cn("relative", className)}>
      <div ref={content} className={cn(shown && "opacity-50")}>{children}</div>
      {shown ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={24} label={label} />
        </div>
      ) : null}
    </div>
  );
}
