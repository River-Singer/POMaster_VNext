// 悬浮按钮：固定在视口一角的圆形按钮（返回顶部、帮助、反馈）。Geist 没有这个组件，用 Geist 的材质（2 层阴影）与按钮 token 做；
// 一页最多一个，必须带可读名称；position="static" 时按普通元素排（演示与测试用）。
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface FloatButtonProps extends Omit<React.ComponentProps<typeof Button>, "shape" | "svgOnly"> {
  readonly label: string;
  readonly placement?: "bottom-right" | "bottom-left";
  readonly position?: "fixed" | "static";
  readonly badge?: number;
}

export function FloatButton({ label, placement = "bottom-right", position = "fixed", badge, className, children, variant = "secondary", ...props }: FloatButtonProps) {
  return (
    <span
      data-slot="float-button"
      className={cn(
        position === "fixed" && "fixed bottom-6 z-40",
        position === "fixed" && (placement === "bottom-right" ? "right-6" : "left-6"),
        "relative inline-flex",
        className,
      )}
    >
      <Button {...props} variant={variant} shape="circle" svgOnly size="large" aria-label={label} title={label} className="shadow-md">
        {children}
      </Button>
      {badge !== undefined && badge > 0 ? (
        <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-ds-red-700 px-1 text-center text-label-12 text-ds-background-100 tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </span>
  );
}
