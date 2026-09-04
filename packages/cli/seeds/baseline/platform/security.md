# 平台安全基线

- 路径:baseline/platform/security.md
- 职责(PRD §3):auth / secret / sensitive data / trust zone
- 状态:播种模板(Expected 面)——项目 Owner 就地填写;起步值一律 UNKNOWN,不确定保持 UNKNOWN,不猜测、不留空白或任何占位描述词形(旧模板占位词形零移植)。
- 填写纪律:技术选型词与阈值数字仅由 Owner 决策后写入本文件;示例与默认值不住播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD 与 catalog 注记)。
## auth

- 起步值:UNKNOWN
- 填写指引:认证与授权机制决策(机制、会话策略、权限模型由 Owner 定)。

## secret

- 起步值:UNKNOWN
- 填写指引:密钥与凭据的管理规则(存放、注入方式、轮换周期由 Owner 定)。

## sensitive data

- 起步值:UNKNOWN
- 填写指引:敏感数据清单与处理规则(分类、最小化、脱敏要求)。

## trust zone

- 起步值:UNKNOWN
- 填写指引:信任边界划分:哪些组件在边界内、哪些在边界外、跨界规则。

