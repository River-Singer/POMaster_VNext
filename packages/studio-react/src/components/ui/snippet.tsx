// 命令片段：单行或几行终端命令，前缀 $ 不进复制内容（Geist Snippet）。dark 用深色底。
import * as React from "react";
import { cn } from "../../lib/utils";
import { CopyButton } from "./copy-button";

export interface SnippetProps extends React.ComponentProps<"div"> {
  readonly text: string | readonly string[];
  readonly prompt?: boolean;
  readonly dark?: boolean;
}

export function Snippet({ text, prompt = true, dark = false, className, ...props }: SnippetProps) {
  const lines = typeof text === "string" ? [text] : [...text];
  return (
    <div
      data-slot="snippet"
      className={cn(
        "flex items-start justify-between gap-2 rounded-md border py-2 pr-1 pl-3",
        dark ? "border-ds-gray-1000 bg-ds-gray-1000 text-ds-background-100" : "border-ds-gray-400 bg-ds-background-100",
        className,
      )}
      {...props}
    >
      <pre className="min-w-0 overflow-x-auto py-1 text-copy-13-mono">
        {lines.map((line, index) => (
          <span key={index} className="block whitespace-pre">
            {prompt ? (
              <span aria-hidden="true" className="mr-2 select-none opacity-60">
                $
              </span>
            ) : null}
            {line}
          </span>
        ))}
      </pre>
      <CopyButton value={lines.join("\n")} label="复制命令" className={dark ? "text-ds-background-100" : undefined} />
    </div>
  );
}
