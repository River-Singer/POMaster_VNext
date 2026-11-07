import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Comment } from "../components/ui/comment";
import { Column, describe } from "./frame";

const meta: Meta<typeof Comment> = {
  title: "Geist 组件/数据展示/Comment 评论",
  component: Comment,
  parameters: describe("评论与回复：头像 + 作者 + 相对时间 + 正文 + 操作（点赞带计数与 aria-pressed、回复），回复缩进嵌套，每条是一个 article。antd v5 已移除 Comment，这里按 Geist 的 Avatar / Relative Time 组合。源码 src/components/ui/comment.tsx。", "comment"),
};
export default meta;
type Story = StoryObj<typeof Comment>;

function Demo() {
  const [liked, setLiked] = React.useState(false);
  return (
    <Column className="w-full max-w-xl">
      <Comment author="李娜" date={new Date(Date.now() - 45 * 60_000)} content="浦东仓 3 号门今天下午封闭，提货改走 5 号门。" likes={liked ? 4 : 3} liked={liked} onLike={() => setLiked(!liked)}>
        <Comment author="张伟" date={new Date(Date.now() - 20 * 60_000)} content="收到，已经通知二组司机。" likes={1} />
      </Comment>
    </Column>
  );
}

export const Default: Story = { name: "评论与回复", render: () => <Demo /> };
