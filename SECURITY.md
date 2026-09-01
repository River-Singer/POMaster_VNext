# 安全政策（SECURITY）

## 报告渠道

发现安全漏洞请**勿**直接在公开 Issue / PR 中披露。

请通过以下渠道私密报告：TODO(Owner): 填安全报告邮箱/渠道

报告时请尽量附上：受影响组件与版本、复现步骤或 PoC、影响评估、（如有）修复建议。

## 处理流程（简版）

1. 收到报告后确认接收并评估；
2. 修复开发与验证（必要时走本项目自身的八拍 Change Loop 与 gate 判卷）；
3. 发布修复版本，并在公告中致谢报告者（除非要求匿名）。

## 支持范围

- 仓库内 `packages/`（kernel / cli / schemas / gauntlet-lite）及其发布物；
- `scripts/` 与 `catalog/` 策展物料中的可执行内容。

范围内的第三方依赖安全问题（如已知 CVE 影响）同样欢迎报告；依赖许可与 notice 义务见 [`legal/THIRD_PARTY_NOTICES.md`](./legal/THIRD_PARTY_NOTICES.md)。
