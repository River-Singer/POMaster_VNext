// 危险操作确认（Geist Modal 的危险用法）：Radix AlertDialog——必须明确选择，点遮罩不关闭；默认焦点在「取消」上；
// 写清后果（删什么、能否恢复、影响谁）；确认按钮用 error 变体、文案是动作本身（「删除项目」，不是「确定」）；
// 不可逆且影响大的操作再加一道输入名称确认（DestructiveInput）；确认进行中按钮显示加载、不能重复提交。
import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { DestructiveInput } from "./destructive-input";

export interface DestructiveModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly consequences: React.ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => Promise<void> | void;
  /** 需要输入这段文字才能确认（例如项目名）。 */
  readonly confirmText?: string;
}

export function DestructiveModal({ open, onOpenChange, title, consequences, confirmLabel, onConfirm, confirmText }: DestructiveModalProps) {
  const [typed, setTyped] = React.useState(confirmText === undefined);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) setTyped(confirmText === undefined);
  }, [open, confirmText]);
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialogPrimitive.Content data-slot="alert-dialog-content" className={cn("fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-ds-gray-400 bg-ds-background-100 p-6 text-ds-gray-1000 shadow-lg sm:max-w-md")}>
          <AlertDialogPrimitive.Title className="text-heading-20">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description asChild>
            <div className="text-copy-14 text-ds-gray-900">{consequences}</div>
          </AlertDialogPrimitive.Description>
          {confirmText !== undefined ? <DestructiveInput expected={confirmText} onMatchChange={setTyped} /> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                取消
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant="error"
              disabled={!typed}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
