import type { Meta, StoryObj } from "@storybook/vue3";
import { PmVideo } from "../components/video";
import poster from "./assets/sample-clip-poster.jpg";
import clip from "./assets/sample-clip.webm";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/Video 视频",
  parameters: describe("原生 <video controls>（键盘、全屏、倍速由浏览器提供）+ 16:9 外框；只预载元数据；有对白的视频带字幕轨；自动播放只用于静音循环的装饰视频，「减少动效」时不自动播放。演示片段是无对白的渐变动画。ant-design-vue 没有视频组件（Geist 有 Video）。源码 src/components/video.ts。", "video"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmVideo },
    setup: () => ({ DEMO_STYLE, clip, poster }),
    template: `<div :style="DEMO_STYLE"><PmVideo :src="clip" :poster="poster" label="线路演示视频（无对白）" style="width:320px" /><PmVideo :src="clip" :poster="poster" label="装饰背景视频" decorative style="width:220px" /></div>`,
  }),
};
