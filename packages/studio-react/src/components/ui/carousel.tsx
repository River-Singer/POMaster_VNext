// 走马灯：横向滚动吸附（scroll-snap）的幻灯片，左右按钮翻页、底部圆点指示当前页（每个圆点是带名称的按钮）；
// 不自动轮播（自动轮播要能暂停，规范不推荐）；键盘左右键翻页；用 region + aria-roledescription 告诉读屏这是轮播。
import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface CarouselProps extends Omit<React.ComponentProps<"section">, "children"> {
  readonly slides: readonly React.ReactNode[];
  readonly label: string;
}

export function Carousel({ slides, label, className, ...props }: CarouselProps) {
  const track = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    const node = track.current;
    if (node !== null) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      node.scrollTo?.({ left: clamped * node.clientWidth, behavior: reduce ? "auto" : "smooth" });
    }
    setIndex(clamped);
  };
  return (
    <section data-slot="carousel" aria-roledescription="轮播" aria-label={label} className={cn("relative flex flex-col gap-3", className)} onKeyDown={(event) => { if (event.key === "ArrowLeft") go(index - 1); if (event.key === "ArrowRight") go(index + 1); }} {...props}>
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.clientWidth > 0) setIndex(Math.round(node.scrollLeft / node.clientWidth));
        }}
      >
        {slides.map((slide, i) => (
          <div key={i} role="group" aria-roledescription="幻灯片" aria-label={`第 ${i + 1} 张，共 ${slides.length} 张`} className="w-full shrink-0 snap-start">
            {slide}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button size="small" variant="secondary" svgOnly aria-label="上一张" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeftIcon />
        </Button>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`第 ${i + 1} 张`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} className={cn("h-2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", i === index ? "w-6 bg-ds-gray-1000" : "w-2 bg-ds-gray-400")} />
          ))}
        </div>
        <Button size="small" variant="secondary" svgOnly aria-label="下一张" disabled={index === slides.length - 1} onClick={() => go(index + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
    </section>
  );
}
