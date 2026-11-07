// 全局提示与通知（Geist Toast）：一个不依赖第三方的小型通知仓库。
// - toast(...) / toast.success / error / warning：轻提示，顶部居中，几秒后自动消失（对应 antd message）。
// - notify({ title, description, action })：带标题、说明、动作的通知，右下角，停留更久（对应 antd notification）。
// 都渲染在 <Toaster /> 里：区域有名称，普通消息 role="status"（礼貌播报），错误 role="alert"；悬停或聚焦时暂停计时；
// 带动作的错误不自动消失（用户来不及点）；每条都有关闭按钮。消息文案写结果（「已保存」），不写「操作成功」。
import * as React from "react";
import { TriangleAlertIcon, CircleCheckIcon, InfoIcon, OctagonAlertIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type ToastTone = "neutral" | "success" | "error" | "warning" | "info";

export interface ToastItem {
  readonly id: number;
  readonly kind: "message" | "notification";
  readonly tone: ToastTone;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly action?: { readonly label: string; readonly onClick: () => void };
  readonly duration: number;
}

type ToastInput = Partial<Omit<ToastItem, "id" | "kind" | "title">>;

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function add(item: Omit<ToastItem, "id">): number {
  const id = nextId++;
  items = [...items, { ...item, id }].slice(-5);
  emit();
  return id;
}

export function dismissToast(id?: number): void {
  items = id === undefined ? [] : items.filter((item) => item.id !== id);
  emit();
}

function message(tone: ToastTone) {
  return (title: React.ReactNode, input: ToastInput = {}) => add({ kind: "message", tone, title, duration: input.action !== undefined && tone === "error" ? 0 : 4000, ...input });
}

export const toast = Object.assign(message("neutral"), {
  success: message("success"),
  error: message("error"),
  warning: message("warning"),
  info: message("info"),
  dismiss: dismissToast,
});

export function notify({ title, ...input }: ToastInput & { readonly title: React.ReactNode }): number {
  const tone = input.tone ?? "info";
  return add({ kind: "notification", tone, title, duration: input.action !== undefined && tone === "error" ? 0 : 8000, ...input });
}

const ICONS = { neutral: null, success: CircleCheckIcon, error: OctagonAlertIcon, warning: TriangleAlertIcon, info: InfoIcon } as const;
const ICON_TONE = { neutral: "", success: "text-ds-green-700", error: "text-ds-red-700", warning: "text-ds-amber-900", info: "text-ds-blue-700" } as const;

function ToastCard({ item }: { readonly item: ToastItem }) {
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (item.duration <= 0 || paused) return;
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, paused]);
  const Icon = ICONS[item.tone];
  return (
    <li
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border border-ds-gray-400 bg-ds-background-100 text-ds-gray-1000 shadow-lg data-[state=open]:animate-in motion-reduce:animate-none",
        item.kind === "message" ? "px-4 py-2" : "w-80 p-4",
      )}
      data-state="open"
    >
      {Icon !== null ? <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", ICON_TONE[item.tone])} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-label-14">{item.title}</span>
        {item.description !== undefined ? <span className="text-copy-13 text-ds-gray-900">{item.description}</span> : null}
        {item.action !== undefined ? (
          <div className="mt-2">
            <Button size="tiny" variant="secondary" onClick={() => { item.action?.onClick(); dismissToast(item.id); }}>
              {item.action.label}
            </Button>
          </div>
        ) : null}
      </div>
      <button type="button" aria-label="关闭通知" onClick={() => dismissToast(item.id)} className="flex size-5 shrink-0 items-center justify-center rounded-sm text-ds-gray-900 outline-none hover:bg-ds-gray-alpha-200 focus-visible:ring-2 focus-visible:ring-ring/50">
        <XIcon aria-hidden="true" className="size-3" />
      </button>
    </li>
  );
}

export function useToasts(): readonly ToastItem[] {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => items,
  );
}

/** 挂在应用根部一次。 */
export function Toaster({ className }: { readonly className?: string }) {
  const list = useToasts();
  const messages = list.filter((item) => item.kind === "message");
  const notifications = list.filter((item) => item.kind === "notification");
  return (
    <div data-slot="toaster" className={cn("pointer-events-none fixed inset-0 z-[60]", className)}>
      <ol aria-label="消息" className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {messages.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </ol>
      <ol aria-label="通知" className="absolute right-4 bottom-4 flex flex-col items-end gap-2">
        {notifications.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}
