// 评论：头像 + 作者 + 相对时间 + 正文 + 操作（回复、点赞带计数与 aria-pressed）；回复缩进嵌套，用 article 包每条评论。
import * as React from "react";
import { ThumbsUpIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { RelativeTime } from "./relative-time";

export interface CommentProps extends Omit<React.ComponentProps<"article">, "content"> {
  readonly author: string;
  readonly avatar?: string;
  readonly date: Date | string;
  readonly content: React.ReactNode;
  readonly likes?: number;
  readonly liked?: boolean;
  readonly onLike?: () => void;
  readonly onReply?: () => void;
}

export function Comment({ author, avatar, date, content, likes = 0, liked = false, onLike, onReply, className, children, ...props }: CommentProps) {
  return (
    <article data-slot="comment" aria-label={`${author} 的评论`} className={cn("flex gap-3", className)} {...props}>
      <Avatar name={author} src={avatar} size={32} decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex items-baseline gap-2">
          <span className="text-label-14">{author}</span>
          <RelativeTime date={date} />
        </header>
        <div className="text-copy-14 text-ds-gray-1000">{content}</div>
        <div className="-ml-2 flex items-center gap-1">
          <Button size="tiny" variant="tertiary" aria-pressed={liked} onClick={onLike} prefix={<ThumbsUpIcon aria-hidden="true" className={cn(liked && "fill-current")} />}>
            <span className="tabular-nums">{likes}</span>
            <span className="sr-only">赞</span>
          </Button>
          <Button size="tiny" variant="tertiary" onClick={onReply}>
            回复
          </Button>
        </div>
        {children !== undefined ? <div className="mt-2 flex flex-col gap-4">{children}</div> : null}
      </div>
    </article>
  );
}
