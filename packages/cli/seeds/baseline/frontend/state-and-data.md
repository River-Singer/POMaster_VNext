# 前端状态与数据基线

- 路径:baseline/frontend/state-and-data.md
- 职责(PRD §3):state ownership / server-state / cache / derived
- 状态:播种模板(Expected 面)——项目 Owner 就地填写;起步值一律 UNKNOWN,不确定保持 UNKNOWN,不猜测、不留空白或任何占位描述词形(旧模板占位词形零移植)。
- 填写纪律:技术选型词与阈值数字仅由 Owner 决策后写入本文件;示例与默认值不住播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD 与 catalog 注记)。
## state ownership

- 起步值:UNKNOWN
- 填写指引:逐类状态登记属主:谁拥有写权、谁只读;跨组件共享的裁决。

## server-state

- 起步值:UNKNOWN
- 填写指引:服务端状态的获取、同步与失效策略(缓存期/重取时机由 Owner 定)。

## cache

- 起步值:UNKNOWN
- 填写指引:客户端缓存范围与失效规则(缓存什么、何时不缓存)。

## derived

- 起步值:UNKNOWN
- 填写指引:派生状态的计算位置与一致性约束(派生链登记;禁止的重复真源)。

