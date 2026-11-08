// 复制按钮：复制成功后图标变勾 2 秒并经 aria-live 报告「已复制」。Geist 的 Copy Button 形态（纯图标、tertiary），
// 由 Geist token 与项目 Button 组合而成。
import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "./button";

export interface CopyButtonProps extends Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> {
  readonly value: string;
  /** 读屏与悬停提示用的名称，如「复制车牌号」。 */
  readonly label: string;
  readonly onCopied?: () => void;
}

export function CopyButton({ value, label, onCopied, variant = "tertiary", size = "small", ...props }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(value);
    } finally {
      setCopied(true);
      onCopied?.();
    }
  }
  return (
    <>
      <Button {...props} variant={variant} size={size} svgOnly aria-label={label} title={label} onClick={() => void copy()} data-slot="copy-button">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "已复制" : ""}
      </span>
    </>
  );
}
