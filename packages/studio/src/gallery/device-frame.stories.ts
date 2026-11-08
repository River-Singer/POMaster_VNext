import type { Meta, StoryObj } from "@storybook/vue3";
import { Badge } from "ant-design-vue";
import { PmBrowserFrame, PmPhoneFrame } from "../components/device-frame";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/DeviceFrame 设备外框",
  parameters: describe("给截图或演示套上浏览器窗口或手机外框，说明它出现在哪个环境里；外框是装饰，地址栏只是文字；颜色、圆角、投影取 antd token。ant-design-vue 没有这个组件（Geist 有 Browser / Phone）。源码 src/components/device-frame.ts。", "device_frame"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmBrowserFrame, PmPhoneFrame, ABadge: Badge },
    setup: () => ({ DEMO_STYLE }),
    template: `
      <div :style="DEMO_STYLE + ';gap:32px'">
        <PmBrowserFrame address="fleet.example.com/vehicles" style="width:380px">
          <div style="padding:16px;display:flex;flex-direction:column;gap:8px"><strong>车辆列表</strong><a-badge status="processing" text="沪A·D2391 在途" /><a-badge status="success" text="沪A·D2392 空闲" /></div>
        </PmBrowserFrame>
        <PmPhoneFrame :width="200"><div style="padding:40px 16px 16px"><strong>今日任务</strong><p>3 单待提货</p></div></PmPhoneFrame>
      </div>`,
  }),
};
