// 弹性布局与间距组合：只收 Geist 间距阶梯（4px 的整数倍）里的间距，避免调用处随手写 gap-[7px]。
// Flex 用于一维排布（方向、对齐、换行）；Space 是行内元素之间的固定间距（按钮组、标签组）。
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const GAPS = { 0: "gap-0", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4", 6: "gap-6", 8: "gap-8" } as const;

const flexVariants = cva("flex", {
  variants: {
    direction: { row: "flex-row", column: "flex-col" },
    align: { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" },
    justify: { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" },
    wrap: { true: "flex-wrap", false: "flex-nowrap" },
    gap: GAPS,
  },
  defaultVariants: { direction: "row", align: "stretch", justify: "start", wrap: false, gap: 2 },
});

export interface FlexProps extends React.ComponentProps<"div">, VariantProps<typeof flexVariants> {}

export function Flex({ className, direction, align, justify, wrap, gap, ...props }: FlexProps) {
  return <div data-slot="flex" className={cn(flexVariants({ direction, align, justify, wrap, gap }), className)} {...props} />;
}

export interface SpaceProps extends React.ComponentProps<"div"> {
  readonly size?: keyof typeof GAPS;
  readonly direction?: "horizontal" | "vertical";
  /** 两项之间的分隔（如竖线）；为 null 时只留空白。 */
  readonly split?: React.ReactNode;
}

export function Space({ size = 2, direction = "horizontal", split = null, className, children, ...props }: SpaceProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div
      data-slot="space"
      className={cn("inline-flex", direction === "vertical" ? "flex-col" : "flex-row flex-wrap items-center", GAPS[size], className)}
      {...props}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && split !== null ? <span aria-hidden="true" className="flex items-center self-stretch">{split}</span> : null}
          {item}
        </React.Fragment>
      ))}
    </div>
  );
}

export { flexVariants };
