import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Upload, type UploadFile } from "../components/ui/upload";
import { Column, describe } from "./frame";

const meta: Meta<typeof Upload> = {
  title: "Geist 组件/数据录入/Upload 上传",
  component: Upload,
  parameters: describe("拖放区 + 「选择文件」按钮（键盘可用）+ 文件列表：每个文件显示大小、进度、失败原因与移除按钮；类型与大小在选择时就校验并说明原因。上传请求由调用处发起（组件不发请求）。源码 src/components/ui/upload.tsx。", "upload"),
};
export default meta;
type Story = StoryObj<typeof Upload>;

function Demo() {
  const [files, setFiles] = React.useState<UploadFile[]>([
    { id: "1", name: "行驶证-沪A·D2391.jpg", size: 482_113, status: "done" },
    { id: "2", name: "保险单-2026.pdf", size: 1_204_551, status: "uploading", progress: 62 },
    { id: "3", name: "车辆照片-左侧.heic", size: 3_820_118, status: "error", error: "只支持 JPG、PNG、PDF" },
  ]);
  return (
    <Column className="w-full max-w-lg">
      <Upload
        files={files}
        accept=".jpg,.png,.pdf"
        maxSizeMb={10}
        multiple
        hint="JPG、PNG 或 PDF，单个不超过 10 MB"
        onSelect={(picked) => setFiles((list) => [...list, ...picked.map((file, i) => ({ id: `${Date.now()}-${i}`, name: file.name, size: file.size, status: "done" as const }))])}
        onRemove={(id) => setFiles((list) => list.filter((file) => file.id !== id))}
      />
    </Column>
  );
}

export const Default: Story = { name: "拖放与文件列表", render: () => <Demo /> };
