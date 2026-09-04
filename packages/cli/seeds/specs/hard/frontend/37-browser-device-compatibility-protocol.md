---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/37-browser-device-compatibility-protocol.md
seed_source_sha256: 81c0d4bf8996f6cf6b38d1c8514385065785728011222b524d73d8135703a3b3
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 37 浏览器与设备兼容协议

## Scope

P2。定义支持浏览器、设备、分辨率、缩放、输入方式和不支持环境提示。

## Non-Scope

不要求所有项目支持移动端或旧浏览器，不替代响应式布局协议。

## Terms

- Support Matrix：正式支持并测试的环境组合。
- Graceful Degradation：能力不足时的安全降级。
- Unsupported Environment：明确不提供质量承诺的环境。

## MUST

- 明确浏览器及最低版本、操作系统、设备和输入方式。
- 明确关键分辨率和 100%/125%/150% 等缩放矩阵。
- 关键流程在所有支持组合验证。
- 不支持环境提供可操作说明或安全降级。
- 使用能力检测而非脆弱 user-agent 业务判断。
- 支持矩阵必须覆盖关键 Web API 能力与约束，包括存储、权限、Worker、文件/媒体能力和长连接；能力缺失或被策略禁用时提供可测试降级。
- 页面必须兼容 `pagehide` / `pageshow`、可见性变化和 bfcache 恢复；恢复后重新校验连接、缓存、权限与数据新鲜度。

## MUST NOT

- MUST NOT 只在开发者默认环境验收。
- MUST NOT 未测试就宣称支持。
- MUST NOT 用缩小字体解决小屏。
- MUST NOT 为旧环境引入无人维护的大型 polyfill。
- MUST NOT 使用 `unload` 作为保存或清理的可靠信号；`beforeunload` 仅在存在未保存用户输入时按需注册并及时移除。

## SHOULD

- SHOULD 优先支持组织真实使用环境。
- SHOULD 自动运行代表性兼容测试。

## Contract

```text
Browser, MinVersion, OS, Device, Viewport,
Zoom, Input, SupportLevel, TestEvidence
```

## Checklist

- [ ] 支持矩阵明确。
- [ ] 关键视口与缩放通过。
- [ ] 不支持提示可用。
- [ ] polyfill 风险已评估。
- [ ] 生命周期/bfcache 恢复通过，关键能力降级可验证。

## Examples

### 内容示例，可删除

企业桌面项目明确支持受管 Chrome/Edge 版本和关键办公分辨率，不含手机 Safari。

## Anti-patterns

只在 1920×1080@100% 测试，1366 笔记本上按钮和表格互相遮挡。

## Ownership

产品 Owner 定义范围，前端/QA 维护矩阵，平台 Owner 维护构建目标。

## Change Policy

增加或停止支持环境必须公告、更新构建与测试，并提供升级路径。
