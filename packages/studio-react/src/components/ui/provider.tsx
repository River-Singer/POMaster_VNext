// 全局配置（Geist 没有 ConfigProvider；按 antd ConfigProvider 的职责用 React Context 做）：
// 语言与地区（日期、数字格式化取这里）、主题偏好（写到根元素的 data-theme 与 color-scheme，深色色值由主题样式表提供）、
// 文字提示的统一延迟、组件默认尺寸。只在应用根部放一次，组件用 useGeistConfig() 读取。
import * as React from "react";
import { TooltipProvider } from "./tooltip";
import type { ThemePreference } from "./theme-switcher";

export interface GeistConfig {
  readonly locale: string;
  readonly theme: ThemePreference;
  readonly size: "small" | "medium" | "large";
}

const DEFAULTS: GeistConfig = { locale: "zh-CN", theme: "system", size: "medium" };
const ConfigContext = React.createContext<GeistConfig>(DEFAULTS);

export function useGeistConfig(): GeistConfig {
  return React.useContext(ConfigContext);
}

function useResolvedTheme(theme: ThemePreference): "light" | "dark" {
  const [systemDark, setSystemDark] = React.useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  React.useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (query === undefined) return;
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export interface GeistProviderProps extends Partial<GeistConfig> {
  readonly tooltipDelay?: number;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function GeistProvider({ locale = DEFAULTS.locale, theme = DEFAULTS.theme, size = DEFAULTS.size, tooltipDelay = 100, className, children }: GeistProviderProps) {
  const resolved = useResolvedTheme(theme);
  const value = React.useMemo(() => ({ locale, theme, size }), [locale, theme, size]);
  return (
    <ConfigContext.Provider value={value}>
      <TooltipProvider delayDuration={tooltipDelay}>
        <div data-slot="geist-provider" data-theme={resolved} lang={locale} className={className} style={{ colorScheme: resolved }}>
          {children}
        </div>
      </TooltipProvider>
    </ConfigContext.Provider>
  );
}
