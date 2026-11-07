// 折叠面板：Radix Accordion——标题是按钮（aria-expanded / aria-controls 由 Radix 维护），上下键在标题间移动；
// type="single" 时一次只开一个（手风琴），"multiple" 时可同时展开（Geist Collapse）。
import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export const Collapse = AccordionPrimitive.Root;

export function CollapseItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="collapse-item" className={cn("border-b border-ds-gray-400 last:border-b-0", className)} {...props} />;
}

export function CollapseTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="collapse-trigger"
        className={cn("flex flex-1 items-center justify-between gap-4 py-4 text-left text-label-14 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 [&[data-state=open]>svg]:rotate-180", className)}
        {...props}
      >
        {children}
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-ds-gray-900 transition-transform duration-200 motion-reduce:transition-none" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function CollapseContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content data-slot="collapse-content" className="overflow-hidden text-copy-14 text-ds-gray-900" {...props}>
      <div className={cn("pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
