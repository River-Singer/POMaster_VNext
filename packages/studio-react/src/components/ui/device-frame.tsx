// 设备外框（Geist Browser / Phone）：截图或演示外面套一层浏览器窗口或手机外框，说明「这是在哪个环境里看到的」。
// 纯装饰：外框 aria-hidden，内容本身照常可读；地址栏只是文字，不是可点的链接。
import * as React from "react";
import { LockIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export function BrowserFrame({ address, children, className }: { readonly address?: string; readonly children: React.ReactNode; readonly className?: string }) {
  return (
    <div data-slot="browser-frame" className={cn("overflow-hidden rounded-lg border border-ds-gray-400 bg-ds-background-100 shadow-md", className)}>
      <div aria-hidden="true" className="flex items-center gap-3 border-b border-ds-gray-400 bg-ds-background-200 px-3 py-2">
        <span className="flex gap-2">
          <span className="size-3 rounded-full bg-ds-red-700" />
          <span className="size-3 rounded-full bg-ds-amber-700" />
          <span className="size-3 rounded-full bg-ds-green-700" />
        </span>
        {address !== undefined ? (
          <span className="flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-ds-background-100 px-2 text-copy-12 text-ds-gray-900">
            <LockIcon className="size-3 shrink-0" />
            <span className="truncate">{address}</span>
          </span>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function PhoneFrame({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return (
    <div data-slot="phone-frame" className={cn("relative w-[280px] rounded-[2.5rem] border-8 border-ds-gray-1000 bg-ds-gray-1000 shadow-lg", className)}>
      <span aria-hidden="true" className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-ds-gray-1000" />
      <div className="aspect-[9/19.5] overflow-hidden rounded-[2rem] bg-ds-background-100">{children}</div>
    </div>
  );
}
