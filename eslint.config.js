// POMaster vNext - ESLint flat config（最小集）。
// 允许依赖纪律：eslint + typescript-eslint（少量插件），不引入 PRD 未授权的重量级依赖。
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      // 画廊 studio 生成器产物与静态导出（裁定 G-A：生成器入库，产物不入库不 lint）。
      "packages/studio/generated/**",
      "packages/studio/dist-storybook/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // scaffold 阶段降为 warn；模块建造者落实现时应消除 any（strict TS 基线优先）。
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
