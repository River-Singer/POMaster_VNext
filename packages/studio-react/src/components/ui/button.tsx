// 按钮（Geist 的 Button / ButtonLink；组件源码进项目，样式只经 Geist 色阶类与排版类取值）。
//
// 变体与 Geist 一致：default（主操作，最深的灰）、secondary、tertiary、error、warning。Geist 文档里变体写在
// `type` 上；这里沿用 shadcn/ui 的 `variant`，原生 `type`（submit / button）照常写。
// 尺寸 tiny / small / medium / large 的高度 24 / 32 / 40 / 48 是 pomaster 的预设取值（Geist 未公开像素高度，
// 见规范 CMP.BUTTON.SIZES）。纯图标按钮设 svgOnly，并且必须带 aria-label（规范 CMP.BUTTON.ICON_ONLY）。
// loading 时按钮保持可聚焦，用 aria-busy / aria-disabled 告诉读屏「忙」，点击不触发（规范 CMP.BUTTON.LOADING）。
import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium select-none no-underline",
    "outline-none transition-[background-color,color,box-shadow] motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-blue-700",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "disabled:cursor-not-allowed disabled:bg-ds-gray-100 disabled:text-ds-gray-700 disabled:shadow-[inset_0_0_0_1px_var(--ds-gray-400)]",
    "aria-disabled:cursor-not-allowed aria-disabled:bg-ds-gray-100 aria-disabled:text-ds-gray-700 aria-disabled:shadow-[inset_0_0_0_1px_var(--ds-gray-400)]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-ds-gray-1000 text-ds-background-100 hover:bg-ds-gray-1000/85",
        secondary: "bg-ds-background-100 text-ds-gray-1000 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] hover:bg-ds-gray-alpha-100",
        tertiary: "bg-transparent text-ds-gray-1000 hover:bg-ds-gray-alpha-200",
        error: "bg-ds-red-700 text-ds-background-100 hover:bg-ds-red-900",
        warning: "bg-ds-amber-700 text-ds-gray-1000 hover:bg-ds-amber-700/85",
      },
      size: {
        tiny: "h-6 gap-1 px-1.5 text-button-12 [&_svg:not([class*='size-'])]:size-3",
        small: "h-8 gap-1.5 px-2.5 text-button-14 [&_svg:not([class*='size-'])]:size-4",
        medium: "h-10 gap-2 px-3 text-button-14 [&_svg:not([class*='size-'])]:size-4",
        large: "h-12 gap-2 px-3.5 text-button-16 [&_svg:not([class*='size-'])]:size-5",
      },
      shape: {
        square: "rounded-md",
        circle: "rounded-full",
        rounded: "rounded-full",
      },
      svgOnly: { true: "aspect-square px-0", false: "" },
      shadow: { true: "shadow-md", false: "" },
    },
    compoundVariants: [{ shape: "rounded", svgOnly: false, class: "px-4" }],
    defaultVariants: { variant: "default", size: "medium", shape: "square", svgOnly: false, shadow: false },
  },
);

type ButtonStyleProps = VariantProps<typeof buttonVariants> & {
  /** 前缀图标（表达动作本身）。 */
  readonly prefix?: React.ReactNode;
  /** 后缀图标（表达去向：箭头、外链）。 */
  readonly suffix?: React.ReactNode;
  /** 进行中：显示转圈，按钮保持可聚焦并报告忙碌，点击不触发。 */
  readonly loading?: boolean;
};

function Spinner() {
  return <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />;
}

function Content({ prefix, suffix, loading, children }: { readonly prefix?: React.ReactNode; readonly suffix?: React.ReactNode; readonly loading?: boolean; readonly children?: React.ReactNode }) {
  return (
    <>
      {loading === true ? <Spinner /> : prefix}
      {children}
      {suffix}
    </>
  );
}

function Button({
  className,
  variant,
  size,
  shape,
  svgOnly,
  shadow,
  prefix,
  suffix,
  loading = false,
  asChild = false,
  type = "button",
  onClick,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "prefix"> & ButtonStyleProps & { readonly asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, shape, svgOnly, shadow }), className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault() : onClick}
      {...props}
    >
      {asChild ? children : <Content prefix={prefix} suffix={suffix} loading={loading}>{children}</Content>}
    </Comp>
  );
}

/** 链接按钮：与按钮同样的样子与属性，渲染成链接（改变地址的导航用它，不用按钮的点击事件跳转）。 */
function ButtonLink({
  className,
  variant,
  size,
  shape,
  svgOnly,
  shadow,
  prefix,
  suffix,
  children,
  ...props
}: Omit<React.ComponentProps<"a">, "prefix"> & Omit<ButtonStyleProps, "loading">) {
  return (
    <a data-slot="button" className={cn(buttonVariants({ variant, size, shape, svgOnly, shadow }), className)} {...props}>
      <Content prefix={prefix} suffix={suffix}>
        {children}
      </Content>
    </a>
  );
}

export { Button, ButtonLink, buttonVariants };
