import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Field, FieldControl, Fieldset } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Column, describe } from "./frame";

const meta: Meta<typeof Field> = {
  title: "Geist 组件/数据录入/Field 表单",
  component: Field,
  parameters: describe("表单的字段与分组：Field 把标签、说明、错误接到控件上（id、aria-describedby、aria-invalid 由 FieldControl 接好），必填用星号加读屏文字；Fieldset 是一组字段 + 底部操作栏（Geist 的表单卡片）。校验与提交见 react-hook-form + zod（脚手架生成的编辑对话框）。源码 src/components/ui/field.tsx。", "form"),
};
export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  name: "字段、说明与错误",
  render: () => (
    <Column className="w-full max-w-xl">
      <Fieldset
        legend="车辆信息"
        description="保存后会同步到调度系统。"
        footer={
          <>
            <span className="text-copy-13 text-ds-gray-900">带 * 的为必填项</span>
            <Button size="small">保存</Button>
          </>
        }
      >
        <Field label="车牌号" required description="例如 沪A·D2391">
          <FieldControl>
            <Input defaultValue="沪A·D2391" />
          </FieldControl>
        </Field>
        <Field label="载重（吨）" required error="载重要在 0.5 到 49 之间">
          <FieldControl>
            <Input defaultValue="60" inputMode="decimal" />
          </FieldControl>
        </Field>
        <Field label="备注" orientation="horizontal">
          <FieldControl>
            <Input placeholder="选填" />
          </FieldControl>
        </Field>
      </Fieldset>
    </Column>
  ),
};
