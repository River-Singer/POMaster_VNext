// 水印：在内容上铺一层倾斜的重复文字（通常是「姓名 + 工号 + 日期」），用于截图追溯——这是威慑，不是安全措施，
// 敏感数据仍要靠权限控制。水印层 aria-hidden、不拦截点击与选择；颜色取 Geist 的半透明灰，不影响正文对比度。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface WatermarkProps extends React.ComponentProps<"div"> {
  readonly content: readonly string[] | string;
  readonly gap?: readonly [number, number];
  readonly rotate?: number;
}

export function Watermark({ content, gap = [200, 120], rotate = -22, className, children, ...props }: WatermarkProps) {
  const id = `wm${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lines = typeof content === "string" ? [content] : content;
  return (
    <div data-slot="watermark" className={cn("relative", className)} {...props}>
      {children}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-ds-gray-alpha-400 select-none">
        <defs>
          <pattern id={id} width={gap[0]} height={gap[1]} patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotate})`}>
            {lines.map((line, i) => (
              <text key={i} x={8} y={24 + i * 18} fill="currentColor" fontSize={13} fontFamily="var(--font-sans)">
                {line}
              </text>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
