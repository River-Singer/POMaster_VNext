// 横幅（Geist Banner / Note 的整宽形态）：页面顶部、贴着导航的一条系统级消息（维护公告、试用到期、降级）；
// 一次只显示一条；可关闭的横幅关闭按钮带名称；重要且需要处理的用 warning / error 并给出动作链接。
import * as React from "react";
import { TriangleAlertIcon, InfoIcon, OctagonAlertIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const TONES = {
  info: { box: "bg-ds-blue-100 text-ds-blue-1000 border-ds-blue-400", icon: InfoIcon },
  warning: { box: "bg-ds-amber-100 text-ds-amber-1000 border-ds-amber-400", icon: TriangleAlertIcon },
  error: { box: "bg-ds-red-100 text-ds-red-1000 border-ds-red-400", icon: OctagonAlertIcon },
} as const;

export interface BannerProps extends React.ComponentProps<"div"> {
  readonly tone?: keyof typeof TONES;
  readonly action?: React.ReactNode;
  readonly onDismiss?: () => void;
}

export function Banner({ tone = "info", action, onDismiss, className, children, ...props }: BannerProps) {
  const Icon = TONES[tone].icon;
  return (
    <div data-slot="banner" role={tone === "error" ? "alert" : "status"} className={cn("flex w-full items-center gap-3 border-b px-4 py-2 text-copy-14", TONES[tone].box, className)} {...props}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action !== undefined ? <div className="shrink-0 text-label-14 [&_a]:underline [&_a]:underline-offset-4">{action}</div> : null}
      {onDismiss !== undefined ? (
        <button type="button" aria-label="关闭横幅" onClick={onDismiss} className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
