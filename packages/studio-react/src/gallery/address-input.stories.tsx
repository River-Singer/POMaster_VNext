import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { AddressInput, type AddressValue } from "../components/ui/address-input";
import { REGIONS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof AddressInput> = {
  title: "Geist 组件/数据录入/AddressInput 地址输入",
  component: AddressInput,
  parameters: describe("一组地址字段（fieldset）：省市区级联 + 详细地址 + 可选邮编，各自有标签与自动填充提示（autocomplete）。Geist 的 Address Input 是国外地址格式；这里按国内地址结构做，取 Geist 的输入框与级联。源码 src/components/ui/address-input.tsx。", "address_input"),
};
export default meta;
type Story = StoryObj<typeof AddressInput>;

function Demo() {
  const [value, setValue] = React.useState<AddressValue>({ region: ["sh", "pd", "zj"], detail: "碧波路 690 号 3 号门" });
  return (
    <Column className="w-full max-w-lg">
      <AddressInput legend="提货地址" regions={REGIONS} value={value} onValueChange={setValue} withPostcode />
    </Column>
  );
}

export const Default: Story = { name: "省市区 + 详细地址", render: () => <Demo /> };
