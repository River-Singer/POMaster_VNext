// 漫游引导：一步一个气泡，锚定到页面上的目标元素（Radix Popover 的 Anchor 用 virtualRef 指向目标），目标加焦点环高亮；
// 「上一步 / 下一步 / 跳过」三个按钮，显示「2 / 4」；Esc 或「跳过」随时退出，引导只用于新功能，不挡住正常操作。
import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface TourStep {
  readonly target: () => HTMLElement | null;
  readonly title: string;
  readonly description: React.ReactNode;
}

export interface TourProps {
  readonly steps: readonly TourStep[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onFinish?: () => void;
}

export function Tour({ steps, open, onOpenChange, onFinish }: TourProps) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);
  const step = steps[index];
  const target = open && step !== undefined ? step.target() : null;
  React.useEffect(() => {
    if (target === null) return;
    target.setAttribute("data-tour-active", "true");
    target.scrollIntoView?.({ block: "nearest" });
    return () => target.removeAttribute("data-tour-active");
  }, [target]);
  const anchor = React.useMemo(() => ({ current: { getBoundingClientRect: () => target?.getBoundingClientRect() ?? new DOMRect() } }), [target]);
  if (step === undefined) return null;
  const last = index === steps.length - 1;
  return (
    <PopoverPrimitive.Root open={open && target !== null} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={anchor} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          side="bottom"
          align="start"
          sideOffset={8}
          aria-label={`引导 ${index + 1} / ${steps.length}：${step.title}`}
          onInteractOutside={(event) => event.preventDefault()}
          className={cn("z-50 flex w-72 flex-col gap-3 rounded-lg border border-ds-gray-400 bg-ds-background-100 p-4 text-ds-gray-1000 shadow-lg outline-none")}
        >
          <div className="flex flex-col gap-1">
            <p className="text-label-14">{step.title}</p>
            <div className="text-copy-13 text-ds-gray-900">{step.description}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label-12 text-ds-gray-900 tabular-nums">
              {index + 1} / {steps.length}
            </span>
            <div className="flex gap-2">
              <Button size="tiny" variant="tertiary" onClick={() => onOpenChange(false)}>
                跳过
              </Button>
              {index > 0 ? (
                <Button size="tiny" variant="secondary" onClick={() => setIndex(index - 1)}>
                  上一步
                </Button>
              ) : null}
              <Button
                size="tiny"
                onClick={() => {
                  if (last) {
                    onOpenChange(false);
                    onFinish?.();
                  } else setIndex(index + 1);
                }}
              >
                {last ? "完成" : "下一步"}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** 被引导的目标加上这个类：当前步骤的目标显示焦点环。 */
export const TOUR_TARGET_CLASS = "rounded-md data-[tour-active=true]:ring-2 data-[tour-active=true]:ring-ds-blue-700 data-[tour-active=true]:ring-offset-2";
