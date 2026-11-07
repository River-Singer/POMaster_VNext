// 主题切换（Geist Theme Switcher）：跟随系统 / 浅色 / 深色三段，图标段带可读名称；选择存在调用处（不在组件里写浏览器存储）。
import * as React from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Segmented } from "./segmented";

export type ThemePreference = "system" | "light" | "dark";

export function ThemeSwitcher({ value, onValueChange, className }: { readonly value: ThemePreference; readonly onValueChange: (value: ThemePreference) => void; readonly className?: string }) {
  return (
    <Segmented
      aria-label="界面主题"
      size="small"
      className={className}
      value={value}
      onValueChange={(next) => onValueChange(next as ThemePreference)}
      options={[
        { value: "system", label: <MonitorIcon aria-hidden="true" />, ariaLabel: "跟随系统" },
        { value: "light", label: <SunIcon aria-hidden="true" />, ariaLabel: "浅色" },
        { value: "dark", label: <MoonIcon aria-hidden="true" />, ariaLabel: "深色" },
      ]}
    />
  );
}
