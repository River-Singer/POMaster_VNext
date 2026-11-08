// 主题切换（Geist Theme Switcher 的类型，antd 没有成品）：跟随系统 / 浅色 / 深色三段（antdv Segmented）；
// 选择交给 antdv ConfigProvider 的 theme.algorithm（defaultAlgorithm / darkAlgorithm），偏好的持久化由调用处负责。
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type PropType } from "vue";
import { Segmented, theme } from "ant-design-vue";

export type PmThemePreference = "system" | "light" | "dark";

/** 把偏好解析成 antd 的算法（跟随系统时监听 prefers-color-scheme）。 */
export function usePmThemeAlgorithm(preference: () => PmThemePreference) {
  const systemDark = ref(false);
  let query: MediaQueryList | undefined;
  const listener = (event: MediaQueryListEvent) => (systemDark.value = event.matches);
  onMounted(() => {
    query = window.matchMedia?.("(prefers-color-scheme: dark)");
    systemDark.value = query?.matches === true;
    query?.addEventListener?.("change", listener);
  });
  onBeforeUnmount(() => query?.removeEventListener?.("change", listener));
  const dark = computed(() => (preference() === "system" ? systemDark.value : preference() === "dark"));
  return computed(() => ({ dark: dark.value, algorithm: dark.value ? theme.darkAlgorithm : theme.defaultAlgorithm }));
}

export const PmThemeSwitcher = defineComponent({
  name: "PmThemeSwitcher",
  components: { ASegmented: Segmented },
  props: { value: { type: String as PropType<PmThemePreference>, required: true } },
  emits: ["update:value"],
  setup(_, { emit }) {
    const options = [
      { value: "system", label: "跟随系统" },
      { value: "light", label: "浅色" },
      { value: "dark", label: "深色" },
    ];
    return { options, emit };
  },
  template: `<a-segmented data-slot="theme-switcher" aria-label="界面主题" :value="value" :options="options" @change="(v) => emit('update:value', v)" />`,
});
