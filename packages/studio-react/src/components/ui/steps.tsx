// 步骤条：有序列表表达流程，当前步 aria-current="step"，完成的步骤打勾、出错的步骤标红并写原因（规范 CMP.STEPS.*）。
// Geist 没有这个组件，用 Geist 色阶与排版类做；横向放不下时改成竖向。
import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface StepItem {
  readonly title: string;
  readonly description?: string;
}

export interface StepsProps extends Omit<React.ComponentProps<"ol">, "children"> {
  readonly items: readonly StepItem[];
  /** 当前步（从 0 起）。 */
  readonly current: number;
  readonly status?: "process" | "error";
  readonly direction?: "horizontal" | "vertical";
}

export function Steps({ items, current, status = "process", direction = "horizontal", className, ...props }: StepsProps) {
  return (
    <ol data-slot="steps" className={cn("flex", direction === "vertical" ? "flex-col gap-4" : "items-start gap-4", className)} {...props}>
      {items.map((item, index) => {
        const state = index < current ? "finish" : index === current ? status : "wait";
        return (
          <li key={item.title} aria-current={index === current ? "step" : undefined} className={cn("flex gap-3", direction === "horizontal" && "flex-1")}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-label-12 tabular-nums",
                state === "finish" && "border-ds-gray-1000 bg-ds-gray-1000 text-ds-background-100",
                state === "process" && "border-ds-blue-700 bg-ds-blue-700 text-ds-background-100",
                state === "error" && "border-ds-red-700 bg-ds-red-700 text-ds-background-100",
                state === "wait" && "border-ds-gray-400 text-ds-gray-900",
              )}
            >
              {state === "finish" ? <CheckIcon aria-hidden="true" className="size-3.5" /> : state === "error" ? <XIcon aria-hidden="true" className="size-3.5" /> : index + 1}
              <span className="sr-only">{state === "finish" ? "已完成" : state === "error" ? "出错" : state === "process" ? "进行中" : "未开始"}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={cn("text-label-14", state === "wait" ? "text-ds-gray-900" : "text-ds-gray-1000", state === "error" && "text-ds-red-900")}>{item.title}</span>
              {item.description !== undefined ? <span className="text-copy-13 text-ds-gray-900">{item.description}</span> : null}
            </span>
            {direction === "horizontal" && index < items.length - 1 ? <span aria-hidden="true" className={cn("mt-3 h-px flex-1", index < current ? "bg-ds-gray-1000" : "bg-ds-gray-400")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
