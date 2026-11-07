import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { ChoiceboxGroup, ChoiceboxMulti } from "../components/ui/choicebox";
import { Column, describe } from "./frame";

const meta: Meta<typeof ChoiceboxGroup> = {
  title: "Geist 组件/数据录入/Choicebox 选择卡片",
  component: ChoiceboxGroup,
  parameters: describe("带标题与说明的大号选项卡片：少量（2–4 个）需要解释差别的选项，单选是 radiogroup、多选是一组 checkbox，整张卡片可点。Geist 有 Choicebox；antd 没有对应组件。源码 src/components/ui/choicebox.tsx。", "choicebox"),
};
export default meta;
type Story = StoryObj<typeof ChoiceboxGroup>;

function Demo() {
  const [plan, setPlan] = React.useState("standard");
  const [extras, setExtras] = React.useState<string[]>(["gps"]);
  return (
    <Column className="w-full max-w-xl">
      <ChoiceboxGroup
        aria-label="配送时效"
        value={plan}
        onValueChange={setPlan}
        options={[
          { value: "standard", title: "标准配送", description: "次日送达，费用最低" },
          { value: "express", title: "加急配送", description: "当日 4 小时内送达" },
          { value: "night", title: "夜间配送", description: "22:00 后，暂未开通", disabled: true },
        ]}
      />
      <ChoiceboxMulti
        aria-label="附加服务"
        value={extras}
        onValueChange={setExtras}
        options={[
          { value: "gps", title: "实时定位", description: "收货人可查看车辆位置" },
          { value: "insure", title: "货物保险", description: "按货值 0.3% 计费" },
        ]}
      />
    </Column>
  );
}

export const Default: Story = { name: "单选与多选", render: () => <Demo /> };
