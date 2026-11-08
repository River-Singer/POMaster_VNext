// 视频（Geist Video 的类型，antd 没有）：原生 <video controls>（键盘、全屏、倍速由浏览器提供）+ 16:9 外框（圆角、边框取 token）；
// 只预载元数据；有对白的视频带字幕轨；自动播放只用于静音循环的装饰视频，且「减少动效」时不自动播放。
import { computed, defineComponent, onMounted, ref, type PropType } from "vue";
import { useAntdToken } from "./tokens";

export const PmVideo = defineComponent({
  name: "PmVideo",
  props: {
    src: { type: String, required: true },
    poster: { type: String, default: undefined },
    label: { type: String, required: true },
    decorative: { type: Boolean, default: false },
    captions: { type: Object as PropType<{ src: string; label: string; lang: string }>, default: undefined },
  },
  setup(props) {
    const token = useAntdToken();
    const el = ref<HTMLVideoElement | null>(null);
    onMounted(() => {
      const node = el.value;
      if (!props.decorative || node === null) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
      try {
        void node.play?.()?.catch?.(() => undefined);
      } catch {
        /* 不支持媒体播放的环境 */
      }
    });
    const frame = computed(() => ({ overflow: "hidden", borderRadius: `${token.value.borderRadiusLG}px`, border: `1px solid ${token.value.colorBorderSecondary}`, background: token.value.colorText }));
    return { el, frame };
  },
  template: `
    <div data-slot="video" :style="frame">
      <video ref="el" :src="src" :poster="poster" :aria-label="label" :controls="!decorative" :muted="decorative" :loop="decorative" playsinline preload="metadata" style="display:block;width:100%;aspect-ratio:16/9">
        <track v-if="captions" kind="captions" :src="captions.src" :label="captions.label" :srclang="captions.lang" default />
      </video>
    </div>`,
});
