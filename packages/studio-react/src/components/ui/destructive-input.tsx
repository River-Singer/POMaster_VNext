// 破坏性确认输入（Geist Destructive Confirmation Input）：要求逐字输入对象名称（如车队名）才放开危险按钮；
// 比对去掉首尾空格、区分大小写；提示里把要输入的文字原样给出并允许复制。常配合危险操作对话框使用。
import * as React from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";
import { Label } from "./label";

export interface DestructiveInputProps {
  readonly expected: string;
  readonly onMatchChange: (matched: boolean) => void;
  readonly className?: string;
}

export function DestructiveInput({ expected, onMatchChange, className }: DestructiveInputProps) {
  const id = React.useId();
  const [text, setText] = React.useState("");
  const matched = text.trim() === expected;
  // 只在「是否一致」变化时通知；回调存进 ref，调用处传内联函数也不会每次渲染都触发。
  const notify = React.useRef(onMatchChange);
  notify.current = onMatchChange;
  React.useEffect(() => notify.current(matched), [matched]);
  return (
    <div data-slot="destructive-input" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="block text-copy-14 font-normal">
        输入 <span className="rounded-sm bg-ds-gray-alpha-200 px-1 font-mono text-label-13-mono select-all">{expected}</span> 确认
      </Label>
      <Input id={id} autoComplete="off" spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} aria-describedby={`${id}-state`} />
      <span id={`${id}-state`} className="sr-only" aria-live="polite">
        {matched ? "已匹配，可以继续" : ""}
      </span>
    </div>
  );
}
