// 分段控制器：Radix ToggleGroup（type="single"）——一组互斥的分段按钮，方向键在段之间移动（Geist 的 Switch 就是这种分段形态）。
// 选中段实底；只有图标的段要带 aria-label。
import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export interface SegmentedOption {
  readonly value: string;
  readonly label: React.ReactNode;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}

export interface SegmentedProps {
  readonly options: readonly SegmentedOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly size?: "small" | "medium";
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function Segmented({ options, value, onValueChange, size = "medium", className, ...rest }: SegmentedProps) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented"
      type="single"
      value={value}
      onValueChange={(next) => next !== "" && onValueChange(next)}
      aria-label={rest["aria-label"]}
      className={cn("inline-flex rounded-md border border-ds-gray-400 bg-ds-background-200 p-1", className)}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={option.ariaLabel}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-sm px-3 text-label-13 text-ds-gray-900 outline-none hover:text-ds-gray-1000 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[state=on]:bg-ds-background-100 data-[state=on]:text-ds-gray-1000 data-[state=on]:shadow-sm [&_svg]:size-4",
            size === "small" ? "h-6" : "h-8",
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
