// 视频：原生 <video controls>（键盘、读屏、全屏都由浏览器提供）+ 固定宽高比；预载元数据不预载整片，
// 有对白的视频带字幕轨；自动播放只允许静音循环的装饰视频，且尊重「减少动效」（此时不自动播放）。
import * as React from "react";
import { cn } from "../../lib/utils";

export interface VideoProps extends Omit<React.ComponentProps<"video">, "children"> {
  readonly src: string;
  readonly poster?: string;
  readonly captions?: { readonly src: string; readonly label: string; readonly lang: string };
  readonly decorative?: boolean;
  readonly label: string;
}

export function Video({ src, poster, captions, decorative = false, label, className, ...props }: VideoProps) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!decorative || node === null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reduce) return;
    // 自动播放可能被浏览器策略拒绝（返回被拒的 Promise 或直接抛错）：装饰视频不播也不影响内容，静默放弃。
    try {
      void node.play?.()?.catch?.(() => undefined);
    } catch {
      /* 不支持媒体播放的环境 */
    }
  }, [decorative]);
  return (
    <div data-slot="video" className={cn("overflow-hidden rounded-lg border border-ds-gray-400 bg-ds-gray-1000", className)}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={label}
        controls={!decorative}
        muted={decorative}
        loop={decorative}
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        {...props}
      >
        {captions !== undefined ? <track kind="captions" src={captions.src} label={captions.label} srcLang={captions.lang} default /> : null}
      </video>
    </div>
  );
}
