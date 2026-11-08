// 结果与错误页：操作结束（提交成功、处理失败）或整页不可用（403 无权限、404 不存在、500 出错）时用；
// 图标 + 标题说清发生了什么 + 说明下一步 + 动作按钮（返回、重试、联系管理员）；错误页不暴露堆栈与内部编号以外的细节，
// 给出可报告的请求编号。标题是页面的 h1 时设 headingLevel={1}。
import * as React from "react";
import { CircleCheckIcon, FileXIcon, InfoIcon, LockIcon, OctagonAlertIcon, ServerCrashIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const STATUS = {
  success: { icon: CircleCheckIcon, tone: "bg-ds-green-100 text-ds-green-900" },
  error: { icon: OctagonAlertIcon, tone: "bg-ds-red-100 text-ds-red-900" },
  warning: { icon: TriangleAlertIcon, tone: "bg-ds-amber-100 text-ds-amber-900" },
  info: { icon: InfoIcon, tone: "bg-ds-blue-100 text-ds-blue-900" },
  "403": { icon: LockIcon, tone: "bg-ds-gray-100 text-ds-gray-1000" },
  "404": { icon: FileXIcon, tone: "bg-ds-gray-100 text-ds-gray-1000" },
  "500": { icon: ServerCrashIcon, tone: "bg-ds-red-100 text-ds-red-900" },
} as const;

export type ResultStatus = keyof typeof STATUS;

export interface ResultProps extends Omit<React.ComponentProps<"section">, "title"> {
  readonly status: ResultStatus;
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly requestId?: string;
  readonly headingLevel?: 1 | 2;
}

export function Result({ status, title, description, actions, requestId, headingLevel = 2, className, children, ...props }: ResultProps) {
  const meta = STATUS[status];
  const Icon = meta.icon;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section data-slot="result" aria-label={title} className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)} {...props}>
      <span aria-hidden="true" className={cn("flex size-12 items-center justify-center rounded-full [&_svg]:size-6", meta.tone)}>
        <Icon />
      </span>
      {/^\d+$/.test(status) ? <span className="text-label-13-mono text-ds-gray-900">{status}</span> : null}
      <Heading className="text-heading-24">{title}</Heading>
      {description !== undefined ? <p className="max-w-md text-copy-14 text-ds-gray-900">{description}</p> : null}
      {actions !== undefined ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      {requestId !== undefined ? <p className="text-copy-12 text-ds-gray-900">请求编号 <span className="font-mono select-all">{requestId}</span>（联系管理员时提供）</p> : null}
      {children}
    </section>
  );
}
