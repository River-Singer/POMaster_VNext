// 二维码：编码在 src/lib/qrcode.ts（项目自带，不引依赖），这里画成 SVG——四周留 4 格静区，深色取前景色、浅色取背景色，
// 对比度够扫码；图下方附上原文或「复制链接」，扫不了的人（读屏用户、桌面用户）也拿得到内容。内容过长时显示错误态而不是坏码。
import * as React from "react";
import { encodeQr, type QrErrorLevel } from "../../lib/qrcode";
import { cn } from "../../lib/utils";

export interface QrCodeProps extends Omit<React.ComponentProps<"figure">, "children"> {
  readonly value: string;
  readonly size?: number;
  readonly level?: QrErrorLevel;
  readonly caption?: React.ReactNode;
  readonly label?: string;
}

export function QrCode({ value, size = 160, level = "M", caption, label, className, ...props }: QrCodeProps) {
  const matrix = React.useMemo(() => {
    try {
      return encodeQr(value, level);
    } catch {
      return null;
    }
  }, [value, level]);
  if (matrix === null) {
    return (
      <figure data-slot="qrcode" className={cn("flex flex-col items-center gap-2", className)} {...props}>
        <div role="img" aria-label="内容过长，无法生成二维码" style={{ width: size, height: size }} className="flex items-center justify-center rounded-lg border border-dashed border-ds-red-700 p-4 text-center text-copy-13 text-ds-red-900">
          内容过长，换成短链后再生成
        </div>
      </figure>
    );
  }
  const quiet = 4;
  const dim = matrix.size + quiet * 2;
  let path = "";
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    });
  });
  return (
    <figure data-slot="qrcode" className={cn("flex flex-col items-center gap-2", className)} {...props}>
      <svg role="img" aria-label={label ?? `二维码：${value}`} width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" className="rounded-lg border border-ds-gray-400 bg-ds-background-100 text-ds-gray-1000">
        <path d={path} fill="currentColor" />
      </svg>
      {caption !== undefined ? <figcaption className="max-w-full break-all text-center text-copy-13 text-ds-gray-900">{caption}</figcaption> : null}
    </figure>
  );
}
