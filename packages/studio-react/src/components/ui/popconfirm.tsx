// 气泡确认：轻量、可撤销的操作（移出列表、停用）就地确认，不弹整屏对话框；Radix Popover 负责焦点进出与 Esc，
// 焦点先落在「取消」上；确认按钮文案写动作本身。不可逆或影响大的操作用 DestructiveModal。
import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";

export interface PopconfirmProps {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly children: React.ReactElement;
}

export function Popconfirm({ title, description, confirmLabel, cancelLabel = "取消", destructive = false, onConfirm, children }: PopconfirmProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent role="alertdialog" aria-label={title} className="flex w-64 flex-col gap-3">
        <div className="flex gap-2">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ds-amber-900" />
          <div className="flex flex-col gap-1">
            <p className="text-label-14">{title}</p>
            {description !== undefined ? <p className="text-copy-13 text-ds-gray-900">{description}</p> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <PopoverClose asChild>
            <Button size="tiny" variant="secondary">
              {cancelLabel}
            </Button>
          </PopoverClose>
          <Button
            size="tiny"
            variant={destructive ? "error" : "default"}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
