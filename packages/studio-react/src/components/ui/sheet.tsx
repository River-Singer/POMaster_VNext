// 侧边抽屉与底部抽屉（Geist Sheet / Drawer）：Radix Dialog 从边缘滑入——焦点进入并困在抽屉里、Esc 关闭、
// 关闭后焦点回到触发按钮。side="right" 用于详情与编辑（不离开列表），side="bottom" 是移动端的底部抽屉（顶部有拖拽把手，
// 最高 85% 视口）。滑入动效在「减少动效」时关闭。
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const SIDES = {
  right: "inset-y-0 right-0 h-full w-3/4 max-w-md border-l data-[state=open]:slide-in-from-right",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-md border-r data-[state=open]:slide-in-from-left",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t data-[state=open]:slide-in-from-bottom",
} as const;

export function SheetContent({ side = "right", className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { readonly side?: keyof typeof SIDES }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn("fixed z-50 flex flex-col gap-4 overflow-y-auto bg-ds-background-100 p-6 text-ds-gray-1000 shadow-lg data-[state=open]:animate-in data-[state=open]:duration-300 motion-reduce:animate-none", SIDES[side], className)}
        {...props}
      >
        {side === "bottom" ? <span aria-hidden="true" className="mx-auto -mt-2 h-1 w-10 shrink-0 rounded-full bg-ds-gray-400" /> : null}
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <XIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 pr-8", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="sheet-title" className={cn("text-heading-20", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" className={cn("text-copy-14 text-ds-gray-900", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
