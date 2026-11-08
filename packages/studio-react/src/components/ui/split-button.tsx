// 分裂按钮：左边是最常用的动作，右边的箭头打开同组的其余动作（Geist Split Button）。
// 两半是两个独立的按钮，各有可读名称；菜单用项目的 DropdownMenu（Radix）。
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

export interface SplitButtonAction {
  readonly key: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
}

export interface SplitButtonProps {
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
  readonly actions: readonly SplitButtonAction[];
  /** 箭头按钮的可读名称，如「更多保存方式」。 */
  readonly menuLabel: string;
  readonly variant?: "default" | "secondary";
  readonly size?: "small" | "medium" | "large";
  readonly disabled?: boolean;
  readonly className?: string;
}

export function SplitButton({ children, onClick, actions, menuLabel, variant = "default", size = "medium", disabled, className }: SplitButtonProps) {
  return (
    <div data-slot="split-button" role="group" className={cn("inline-flex", className)}>
      <Button variant={variant} size={size} disabled={disabled} onClick={onClick} className="rounded-r-none">
        {children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} disabled={disabled} svgOnly aria-label={menuLabel} className="rounded-l-none border-l border-l-ds-gray-alpha-400">
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {actions.map((action) => (
            <DropdownMenuItem key={action.key} disabled={action.disabled} onSelect={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
