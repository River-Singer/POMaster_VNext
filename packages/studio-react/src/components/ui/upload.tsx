// 上传：拖放区（也是一个按钮，键盘回车 / 空格打开文件选择）+ 文件列表（名称、大小、进度或失败原因、移除按钮）。
// 接受的类型与大小上限写在拖放区里；超限的文件不进列表而是报错（规范 CMP.UPLOAD.*）。上传本身由调用处做，组件只管选择与展示。
import * as React from "react";
import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Progress } from "./progress";

export interface UploadFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly status: "uploading" | "done" | "error";
  readonly progress?: number;
  readonly error?: string;
}

export interface UploadProps {
  readonly files: readonly UploadFile[];
  readonly onSelect: (files: File[]) => void;
  readonly onRemove: (id: string) => void;
  readonly accept?: string;
  readonly maxSizeMb?: number;
  readonly multiple?: boolean;
  readonly hint?: string;
  readonly onReject?: (message: string) => void;
  readonly className?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Upload({ files, onSelect, onRemove, accept, maxSizeMb = 10, multiple = true, hint, onReject, className }: UploadProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  function take(list: FileList | null): void {
    if (list === null) return;
    const all = [...list];
    const tooBig = all.filter((file) => file.size > maxSizeMb * 1024 * 1024);
    if (tooBig.length > 0) onReject?.(`${tooBig.map((file) => file.name).join("、")} 超过 ${maxSizeMb} MB，没有加入`);
    const ok = all.filter((file) => file.size <= maxSizeMb * 1024 * 1024);
    if (ok.length > 0) onSelect(multiple ? ok : ok.slice(0, 1));
  }
  return (
    <div data-slot="upload" className={cn("flex w-full max-w-lg flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragging ? "border-ds-blue-700 bg-ds-blue-100" : "border-ds-gray-500 bg-ds-background-200 hover:border-ds-gray-1000",
        )}
      >
        <UploadIcon aria-hidden="true" className="size-6 text-ds-gray-900" />
        <span className="text-label-14">拖到这里，或点击选择文件</span>
        <span className="text-copy-13 text-ds-gray-900">{hint ?? `${accept ?? "任意类型"}，单个不超过 ${maxSizeMb} MB`}</span>
      </button>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={accept} multiple={multiple} onChange={(event) => { take(event.target.files); event.target.value = ""; }} />
      {files.length > 0 ? (
        <ul aria-label="已选文件" className="flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 rounded-md border border-ds-gray-400 px-3 py-2">
              <FileIcon aria-hidden="true" className="size-4 shrink-0 text-ds-gray-900" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-copy-14">{file.name}</span>
                  <span className="shrink-0 text-label-12 tabular-nums text-ds-gray-900">{formatBytes(file.size)}</span>
                </div>
                {file.status === "uploading" ? <Progress value={file.progress ?? 0} aria-label={`${file.name} 上传进度`} className="h-1" /> : null}
                {file.status === "error" ? <span className="text-copy-13 text-ds-red-900">{file.error ?? "上传失败"}</span> : null}
                {file.status === "done" ? <span className="text-copy-13 text-ds-green-900">已上传</span> : null}
              </div>
              <Button size="small" variant="tertiary" svgOnly aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
