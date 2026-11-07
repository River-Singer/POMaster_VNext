// 锚点：页内目录，点击平滑滚到对应段落（减少动效时直接跳），当前所在段落高亮（aria-current="location"）。
// Geist 没有这个组件，用 Geist 色阶与排版类做；高亮靠 IntersectionObserver，不监听滚动事件。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface AnchorItem {
  readonly id: string;
  readonly label: string;
  readonly children?: readonly AnchorItem[];
}

export interface AnchorProps extends Omit<React.ComponentProps<"nav">, "children"> {
  readonly items: readonly AnchorItem[];
  readonly label?: string;
  readonly defaultActive?: string;
}

function flatten(items: readonly AnchorItem[]): AnchorItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

export function Anchor({ items, label = "本页目录", defaultActive, className, ...props }: AnchorProps) {
  const [active, setActive] = React.useState(defaultActive ?? items[0]?.id ?? "");
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = flatten(items).map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => node !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible !== undefined) setActive(visible.target.id);
    }, { rootMargin: "0px 0px -70% 0px" });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [items]);
  function go(event: React.MouseEvent<HTMLAnchorElement>, id: string): void {
    const target = document.getElementById(id);
    if (target === null) return;
    event.preventDefault();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(id);
  }
  function list(level: readonly AnchorItem[], depth: number): React.ReactNode {
    return (
      <ul className={cn("flex flex-col", depth > 0 && "pl-3")}>
        {level.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              onClick={(event) => go(event, item.id)}
              className={cn(
                "-ml-px block border-l-2 py-1 pl-3 text-copy-13 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active === item.id ? "border-ds-gray-1000 text-ds-gray-1000" : "border-transparent text-ds-gray-900 hover:text-ds-gray-1000",
              )}
            >
              {item.label}
            </a>
            {item.children !== undefined ? list(item.children, depth + 1) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <nav data-slot="anchor" aria-label={label} className={cn("border-l border-ds-gray-400", className)} {...props}>
      {list(items, 0)}
    </nav>
  );
}
