// 中间省略（Geist Middle Truncate）：长路径、哈希、文件名保留开头和结尾、省略中间（结尾往往最有区分度：扩展名、版本号）；
// 完整文本放在 title 与读屏名称里，悬停能看到、读屏读得到全文；复制时拿到的是全文。
import * as React from "react";
import { cn } from "../../lib/utils";

export function middleTruncate(text: string, max: number, tail = Math.floor((max - 1) / 2)): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = max - 1 - tail;
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

export interface MiddleTruncateProps extends Omit<React.ComponentProps<"span">, "children"> {
  readonly text: string;
  readonly max?: number;
  readonly tail?: number;
}

export function MiddleTruncate({ text, max = 32, tail, className, ...props }: MiddleTruncateProps) {
  const shown = middleTruncate(text, max, tail);
  return (
    <span data-slot="middle-truncate" title={shown === text ? undefined : text} className={cn("relative inline-block max-w-full whitespace-nowrap", className)} onCopy={(event) => { event.clipboardData?.setData("text/plain", text); event.preventDefault(); }} {...props}>
      <span aria-hidden={shown === text ? undefined : true}>{shown}</span>
      {shown === text ? null : <span className="sr-only">{text}</span>}
    </span>
  );
}
