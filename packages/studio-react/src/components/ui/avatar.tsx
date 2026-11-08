// 头像：Radix Avatar——图片加载失败或没有图时显示姓名缩写（中文取最后一个字、英文取首字母），缩写底色按姓名稳定取 Geist 色阶；
// AvatarGroup 叠放并以「+N」收尾（Geist Avatar / Avatar Group）。装饰性头像旁边有姓名时 alt 留空。
import * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

const TONES = ["bg-ds-blue-100 text-ds-blue-900", "bg-ds-green-100 text-ds-green-900", "bg-ds-amber-100 text-ds-amber-900", "bg-ds-red-100 text-ds-red-900", "bg-ds-gray-200 text-ds-gray-1000"];
const SIZES = { 24: "size-6 text-label-12", 32: "size-8 text-label-13", 40: "size-10 text-label-14", 64: "size-16 text-heading-20" } as const;

export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (/[一-龥]/.test(trimmed)) return trimmed.slice(-1);
  return trimmed.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function toneOf(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  readonly name: string;
  readonly src?: string;
  readonly size?: keyof typeof SIZES;
  readonly shape?: "circle" | "square";
  readonly decorative?: boolean;
}

export function Avatar({ name, src, size = 32, shape = "circle", decorative = false, className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root data-slot="avatar" className={cn("relative inline-flex shrink-0 overflow-hidden ring-2 ring-ds-background-100", SIZES[size], shape === "circle" ? "rounded-full" : "rounded-md", className)} {...props}>
      {src !== undefined ? <AvatarPrimitive.Image src={src} alt={decorative ? "" : name} className="aspect-square size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback role={decorative ? undefined : "img"} aria-label={decorative ? undefined : name} className={cn("flex size-full items-center justify-center font-medium", toneOf(name))}>
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarGroup({ names, max = 4, size = 32, className }: { readonly names: readonly string[]; readonly max?: number; readonly size?: keyof typeof SIZES; readonly className?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <div data-slot="avatar-group" role="group" aria-label={`${names.length} 人：${names.join("、")}`} className={cn("flex -space-x-2", className)}>
      {shown.map((name) => (
        <Avatar key={name} name={name} size={size} decorative />
      ))}
      {rest > 0 ? <span aria-hidden="true" className={cn("relative inline-flex items-center justify-center rounded-full bg-ds-gray-200 font-medium ring-2 ring-ds-background-100", SIZES[size])}>+{rest}</span> : null}
    </div>
  );
}
