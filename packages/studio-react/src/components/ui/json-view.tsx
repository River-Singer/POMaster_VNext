// JSON 查看器：可折叠的树（对象 / 数组的展开按钮带 aria-expanded），键名与各类型的值按 Geist 色阶区分且保留引号等字面形式
// （不单靠颜色）；默认展开前两层；等宽字体；整段可复制。只读展示，不 eval 任何内容。
import * as React from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { CopyButton } from "./copy-button";

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

function Value({ value }: { readonly value: Json }) {
  if (value === null) return <span className="text-ds-gray-900">null</span>;
  if (typeof value === "boolean") return <span className="text-ds-amber-900">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-ds-blue-900">{value}</span>;
  return <span className="text-ds-green-900">{JSON.stringify(value)}</span>;
}

function Node({ name, value, depth, expandDepth }: { readonly name?: string; readonly value: Json; readonly depth: number; readonly expandDepth: number }) {
  const [open, setOpen] = React.useState(depth < expandDepth);
  const key = name !== undefined ? <span className="text-ds-gray-1000">{JSON.stringify(name)}: </span> : null;
  if (value === null || typeof value !== "object") {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {key}
        <Value value={value} />
      </div>
    );
  }
  const isArray = Array.isArray(value);
  const entries: [string | undefined, Json][] = isArray ? (value as readonly Json[]).map((item) => [undefined, item]) : Object.entries(value as Record<string, Json>);
  const [openMark, closeMark] = isArray ? ["[", "]"] : ["{", "}"];
  return (
    <div>
      <div style={{ paddingLeft: depth * 16 }} className="flex items-center">
        <button type="button" aria-expanded={open} aria-label={`${open ? "折叠" : "展开"} ${name ?? (isArray ? "数组" : "对象")}`} onClick={() => setOpen(!open)} className="-ml-4 flex size-4 items-center justify-center rounded-sm text-ds-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <ChevronRightIcon aria-hidden="true" className={cn("size-3 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        </button>
        {key}
        <span className="text-ds-gray-900">{openMark}</span>
        {open ? null : <span className="text-ds-gray-900"> … {entries.length} 项 {closeMark}</span>}
      </div>
      {open ? (
        <>
          {entries.map(([childName, child], i) => (
            <Node key={childName ?? i} name={childName} value={child} depth={depth + 1} expandDepth={expandDepth} />
          ))}
          <div style={{ paddingLeft: depth * 16 }} className="text-ds-gray-900">
            {closeMark}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function JsonView({ value, expandDepth = 2, label = "JSON", className }: { readonly value: Json; readonly expandDepth?: number; readonly label?: string; readonly className?: string }) {
  return (
    <div data-slot="json-view" className={cn("relative rounded-lg border border-ds-gray-400 bg-ds-background-200", className)}>
      <div className="flex items-center justify-between border-b border-ds-gray-400 px-3 py-2">
        <span className="text-label-13 text-ds-gray-900">{label}</span>
        <CopyButton value={JSON.stringify(value, null, 2)} label="复制 JSON" />
      </div>
      <div className="overflow-x-auto py-3 pr-3 pl-7 font-mono text-copy-13-mono">
        <Node value={value} depth={0} expandDepth={expandDepth} />
      </div>
    </div>
  );
}

export type { Json };
