// 反馈收集（Geist Feedback）：「反馈」按钮打开气泡卡片——四档表情评分（单选组，各带名称）+ 文字说明 + 发送；
// 发送后卡片里换成「已收到」并在 2 秒后关闭。提交本身由调用处完成（onSubmit 返回 Promise）。
import * as React from "react";
import { AngryIcon, FrownIcon, LaughIcon, SmileIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Textarea } from "./textarea";

const MOODS = [
  { value: 4, label: "很好", Icon: LaughIcon },
  { value: 3, label: "还行", Icon: SmileIcon },
  { value: 2, label: "不太好", Icon: FrownIcon },
  { value: 1, label: "很差", Icon: AngryIcon },
] as const;

export interface FeedbackProps {
  readonly onSubmit: (feedback: { mood: number | null; text: string }) => Promise<void>;
  readonly triggerLabel?: string;
}

export function Feedback({ onSubmit, triggerLabel = "反馈" }: FeedbackProps) {
  const [open, setOpen] = React.useState(false);
  const [mood, setMood] = React.useState<number | null>(null);
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");
  React.useEffect(() => {
    if (state !== "sent") return;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setState("idle");
      setMood(null);
      setText("");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [state]);
  async function send(): Promise<void> {
    setState("sending");
    try {
      await onSubmit({ mood, text });
      setState("sent");
    } catch {
      setState("idle");
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="small" variant="secondary">
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        {state === "sent" ? (
          <p role="status" className="py-6 text-center text-copy-14">
            已收到，谢谢你的反馈
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Textarea aria-label="反馈内容" placeholder="哪里好用、哪里不好用？" value={text} onChange={(event) => setText(event.target.value)} maxLength={500} />
            <div className="flex items-center justify-between">
              <div role="radiogroup" aria-label="满意度" className="flex gap-1">
                {MOODS.map(({ value, label, Icon }) => (
                  <button key={value} type="button" role="radio" aria-checked={mood === value} aria-label={label} onClick={() => setMood(mood === value ? null : value)} className={cn("flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", mood === value ? "bg-ds-blue-100 text-ds-blue-900" : "text-ds-gray-900 hover:bg-ds-gray-alpha-200")}>
                    <Icon className="size-5" />
                  </button>
                ))}
              </div>
              <Button size="small" loading={state === "sending"} disabled={text.trim() === "" && mood === null} onClick={() => void send()}>
                发送
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
