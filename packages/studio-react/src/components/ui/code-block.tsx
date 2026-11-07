// 代码块：多行代码，带文件名或语言标签与复制按钮；等宽字体、行号可选、长行横向滚动不折行（Geist Code Block）。
import * as React from "react";
import { cn } from "../../lib/utils";
import { CopyButton } from "./copy-button";

export interface CodeBlockProps extends React.ComponentProps<"figure"> {
  readonly code: string;
  readonly filename?: string;
  readonly language?: string;
  readonly lineNumbers?: boolean;
}

export function CodeBlock({ code, filename, language, lineNumbers = false, className, ...props }: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure data-slot="code-block" className={cn("overflow-hidden rounded-lg border border-ds-gray-400 bg-ds-background-200", className)} {...props}>
      <figcaption className="flex h-10 items-center justify-between border-b border-ds-gray-400 pr-1 pl-4">
        <span className="text-label-13-mono text-ds-gray-900">{filename ?? language ?? "code"}</span>
        <CopyButton value={code} label={`复制${filename ?? "代码"}`} />
      </figcaption>
      <pre className="overflow-x-auto p-4 text-copy-13-mono">
        <code>
          {lines.map((line, index) => (
            <span key={index} className="block whitespace-pre">
              {lineNumbers ? (
                <span aria-hidden="true" className="mr-4 inline-block w-6 text-right text-ds-gray-700 select-none">
                  {index + 1}
                </span>
              ) : null}
              {line === "" ? " " : line}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
