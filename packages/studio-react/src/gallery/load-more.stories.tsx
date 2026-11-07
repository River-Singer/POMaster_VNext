import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { LoadMore, ShowMore } from "../components/ui/load-more";
import { Column, describe } from "./frame";

const meta: Meta<typeof LoadMore> = {
  title: "Geist 组件/导航/LoadMore 加载更多",
  component: LoadMore,
  parameters: describe("动态流、评论等追加式列表的「加载更多」按钮（不做无限滚动：页脚要能到达、位置要能保持）；加载中按钮报告忙碌，读屏播报已加载条数；没有更多时说明到底了。ShowMore 是长文本的「展开全文」（Geist Show More）。源码 src/components/ui/load-more.tsx。", "load_more"),
};
export default meta;
type Story = StoryObj<typeof LoadMore>;

function Demo() {
  const [count, setCount] = React.useState(10);
  const [loading, setLoading] = React.useState(false);
  return (
    <Column>
      <ul className="text-copy-14">
        {Array.from({ length: Math.min(count, 3) }, (_, i) => <li key={i}>第 {i + 1} 条动态</li>)}
        <li className="text-ds-gray-900">……共已加载 {count} 条</li>
      </ul>
      <LoadMore
        loading={loading}
        hasMore={count < 30}
        loadedCount={count}
        onLoadMore={() => {
          setLoading(true);
          window.setTimeout(() => {
            setCount((c) => c + 10);
            setLoading(false);
          }, 600);
        }}
      />
      <ShowMore collapsedHeight={48} className="max-w-md">
        <p className="text-copy-14">
          本次保养更换了机油、机油滤芯与空气滤芯，检查了刹车片厚度（前 8mm、后 7mm，均在安全范围内），轮胎气压已调整到标准值。
          下次保养里程为 45,000 公里或 2027 年 5 月，以先到者为准。保养期间车辆停用一天，相关订单已改派给沪A·D2392。
        </p>
      </ShowMore>
    </Column>
  );
}

export const Default: Story = { name: "加载更多与展开全文", render: () => <Demo /> };
