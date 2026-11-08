// 加载更多 / 展开更多：列表底部的「加载更多」按钮（加载中保持可聚焦并报告忙碌，没有更多时换成说明），
// 以及长内容的「展开 / 收起」（Geist Load More Button、Show More）。新加载的条目不抢焦点。
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface LoadMoreProps {
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
  readonly loadedCount?: number;
  readonly className?: string;
}

export function LoadMore({ loading, hasMore, onLoadMore, loadedCount, className }: LoadMoreProps) {
  return (
    <div data-slot="load-more" className={cn("flex flex-col items-center gap-2 py-2", className)}>
      {hasMore ? (
        <Button variant="secondary" loading={loading} onClick={onLoadMore}>
          {loading ? "加载中" : "加载更多"}
        </Button>
      ) : (
        <span className="text-copy-13 text-ds-gray-900">没有更多了</span>
      )}
      <span className="sr-only" aria-live="polite">
        {loadedCount === undefined ? "" : `已显示 ${loadedCount} 条`}
      </span>
    </div>
  );
}

export interface ShowMoreProps extends React.ComponentProps<"div"> {
  /** 收起时的最大高度（px）。 */
  readonly collapsedHeight?: number;
  readonly defaultExpanded?: boolean;
}

export function ShowMore({ collapsedHeight = 96, defaultExpanded = false, className, children, ...props }: ShowMoreProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const id = React.useId();
  return (
    <div data-slot="show-more" className={cn("flex flex-col gap-2", className)} {...props}>
      <div id={id} className={cn("relative overflow-hidden", !expanded && "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]")} style={expanded ? undefined : { maxHeight: collapsedHeight }}>
        {children}
      </div>
      <Button variant="tertiary" size="small" aria-expanded={expanded} aria-controls={id} suffix={<ChevronDownIcon className={cn("transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />} onClick={() => setExpanded(!expanded)} className="self-start">
        {expanded ? "收起" : "展开更多"}
      </Button>
    </div>
  );
}
