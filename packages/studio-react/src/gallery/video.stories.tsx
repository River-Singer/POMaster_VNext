import type { Meta, StoryObj } from "@storybook/react";
import { Video } from "../components/ui/video";
import poster from "./assets/sample-clip-poster.jpg";
import clip from "./assets/sample-clip.webm";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Video> = {
  title: "Geist 组件/数据展示/Video 视频",
  component: Video,
  parameters: describe("视频：原生 <video controls>（键盘、全屏、倍速由浏览器提供）+ 16:9 外框；只预载元数据；有对白的视频必须带字幕轨（captions）；自动播放只用于静音循环的装饰视频，且「减少动效」时不自动播放。演示片段是无对白的渐变动画。Geist 有 Video；antd 没有对应组件。源码 src/components/ui/video.tsx。", "video"),
};
export default meta;
type Story = StoryObj<typeof Video>;

export const Default: Story = {
  name: "带控件与装饰视频",
  render: () => (
    <Frame className="items-start">
      <Video src={clip} poster={poster} label="线路演示视频（无对白）" className="w-80" />
      <Video src={clip} poster={poster} label="装饰背景视频" decorative className="w-56" />
    </Frame>
  ),
};
