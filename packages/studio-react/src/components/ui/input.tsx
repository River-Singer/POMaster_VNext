// shadcn/ui Input。forwardRef：react-hook-form 的 register 靠 ref 读值、聚焦出错字段，React 18 的函数组件不收 ref。
// 校验失败时标 aria-invalid，边框与焦点环换成危险色。
import * as React from "react";
import { cn } from "../../lib/utils";

export const INPUT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-copy-14 outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20";

const Input = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "ref">>(function Input({ className, type, ...props }, ref) {
  return <input ref={ref} type={type} data-slot="input" className={cn(INPUT_CLASS, className)} {...props} />;
});

export { Input };
