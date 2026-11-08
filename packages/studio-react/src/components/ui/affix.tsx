// 固钉：滚动时把工具栏、操作条钉在视口顶部或底部（CSS sticky，不用滚动监听改 top）；钉住后加底边与阴影表示「浮在内容上」，
// 用 IntersectionObserver 观察一个哨兵元素判断是否已钉住。固钉内容不能遮住焦点所在的元素（页面要留出 scroll-padding）。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface AffixProps extends React.ComponentProps<"div"> {
  readonly position?: "top" | "bottom";
  readonly offset?: number;
}

export function Affix({ position = "top", offset = 0, className, style, children, ...props }: AffixProps) {
  const sentinel = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const node = sentinel.current;
    if (node === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(entry !== undefined && !entry.isIntersecting), { rootMargin: position === "top" ? `-${offset + 1}px 0px 0px 0px` : `0px 0px -${offset + 1}px 0px` });
    observer.observe(node);
    return () => observer.disconnect();
  }, [offset, position]);
  const marker = <div ref={sentinel} aria-hidden="true" className="h-px" />;
  return (
    <>
      {position === "top" ? marker : null}
      <div
        data-slot="affix"
        data-stuck={stuck || undefined}
        className={cn("sticky z-10 bg-ds-background-100 transition-shadow motion-reduce:transition-none data-[stuck]:shadow-md", position === "top" ? "data-[stuck]:border-b data-[stuck]:border-ds-gray-400" : "data-[stuck]:border-t data-[stuck]:border-ds-gray-400", className)}
        style={{ ...style, [position]: offset }}
        {...props}
      >
        {children}
      </div>
      {position === "bottom" ? marker : null}
    </>
  );
}
