// 图片：固定宽高比占位（加载前后不跳布局）、懒加载、失败时显示占位而不是破图标；alt 必填，装饰图写 alt=""。
// preview 打开大图对话框（Radix Dialog：焦点进出、Esc 关闭）。
import * as React from "react";
import { ImageOffIcon, Maximize2Icon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";

export interface ImageProps extends Omit<React.ComponentProps<"img">, "alt" | "src"> {
  readonly src: string;
  readonly alt: string;
  readonly ratio?: "1/1" | "4/3" | "16/9";
  readonly preview?: boolean;
  readonly fit?: "cover" | "contain";
}

const RATIO = { "1/1": "aspect-square", "4/3": "aspect-[4/3]", "16/9": "aspect-video" } as const;

export function Image({ src, alt, ratio = "4/3", preview = false, fit = "cover", className, ...props }: ImageProps) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  const frame = cn("relative overflow-hidden rounded-lg border border-ds-gray-400 bg-ds-background-200", RATIO[ratio], className);
  if (failed) {
    return (
      <div data-slot="image" role={alt === "" ? undefined : "img"} aria-label={alt === "" ? undefined : `${alt}（加载失败）`} className={cn(frame, "flex flex-col items-center justify-center gap-2 text-copy-13 text-ds-gray-900")}>
        <ImageOffIcon aria-hidden="true" className="size-6" />
        图片加载失败
      </div>
    );
  }
  const img = <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} {...props} />;
  if (!preview) return <div data-slot="image" className={frame}>{img}</div>;
  return (
    <Dialog>
      <div data-slot="image" className={cn(frame, "group")}>
        {img}
        <DialogTrigger className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-md bg-ds-background-100/90 text-ds-gray-1000 shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`查看大图：${alt}`}>
          <Maximize2Icon aria-hidden="true" className="size-4" />
        </DialogTrigger>
      </div>
      <DialogContent className="max-w-[min(90vw,64rem)] p-2 sm:max-w-[min(90vw,64rem)]">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
