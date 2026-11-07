// 键盘按键：快捷键提示（Geist Keyboard Input）。组合键写成多个 Kbd，读屏念出键名。
import * as React from "react";
import { cn } from "../../lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-ds-gray-400 bg-ds-background-100 px-1 text-label-12-mono text-ds-gray-900 shadow-[0_1px_0_var(--ds-gray-alpha-400)]",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}
