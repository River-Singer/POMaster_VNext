// 排版文本：Geist 的四组排版类（heading / label / copy / button）按语义包成组件，字号即类名里的数字；
// 次要、成功、警告、危险四种语气只取 Geist 色阶；ellipsis 单行省略并把全文放进 title。
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../../lib/utils";

const textVariants = cva("", {
  variants: {
    variant: {
      "heading-32": "text-heading-32",
      "heading-24": "text-heading-24",
      "heading-20": "text-heading-20",
      "heading-16": "text-heading-16",
      "label-14": "text-label-14",
      "label-13": "text-label-13",
      "label-12": "text-label-12",
      "copy-16": "text-copy-16",
      "copy-14": "text-copy-14",
      "copy-13": "text-copy-13",
      "copy-13-mono": "text-copy-13-mono",
    },
    tone: {
      default: "text-ds-gray-1000",
      secondary: "text-ds-gray-900",
      success: "text-ds-green-900",
      warning: "text-ds-amber-900",
      error: "text-ds-red-900",
    },
    weight: { regular: "font-normal", medium: "font-medium", semibold: "font-semibold" },
  },
  defaultVariants: { variant: "copy-14", tone: "default" },
});

export interface TextProps extends React.ComponentProps<"span">, VariantProps<typeof textVariants> {
  readonly asChild?: boolean;
  readonly ellipsis?: boolean;
}

export function Text({ className, variant, tone, weight, asChild = false, ellipsis = false, title, children, ...props }: TextProps) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ variant, tone, weight }), ellipsis && "block truncate", className)}
      title={ellipsis && title === undefined && typeof children === "string" ? children : title}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { textVariants };
