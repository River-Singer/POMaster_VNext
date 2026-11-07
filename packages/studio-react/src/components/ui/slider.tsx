// 滑块：Radix Slider——方向键 / PageUp / Home / End 调值、读屏念出取值；单值或范围（两个滑块各带可读名称）。
// 需要精确数值时旁边配数字输入（Geist Slider）。
import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** 每个滑块的可读名称；范围滑块传两个，如 ["最低价", "最高价"]。 */
  readonly thumbLabels?: readonly string[];
}

export function Slider({ className, defaultValue, value, min = 0, max = 100, thumbLabels = [], ...props }: SliderProps) {
  const values = value ?? defaultValue ?? [min];
  return (
    <SliderPrimitive.Root data-slot="slider" defaultValue={defaultValue} value={value} min={min} max={max} className={cn("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50", className)} {...props}>
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-ds-gray-200">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-ds-gray-1000" />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb key={index} data-slot="slider-thumb" aria-label={thumbLabels[index]} className="block size-4 rounded-full border border-ds-gray-1000 bg-ds-background-100 shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
      ))}
    </SliderPrimitive.Root>
  );
}
