# 后端事务与并发基线

- 路径:baseline/backend/transaction-concurrency.md
- 职责(PRD §3):TX boundary / lock / optimistic / idempotency
- 状态:播种模板(Expected 面)——项目 Owner 就地填写;起步值一律 UNKNOWN,不确定保持 UNKNOWN,不猜测、不留空白或任何占位描述词形(旧模板占位词形零移植)。
- 填写纪律:技术选型词与阈值数字仅由 Owner 决策后写入本文件;示例与默认值不住播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD 与 catalog 注记)。
## TX boundary

- 起步值:UNKNOWN
- 填写指引:事务边界:在哪一层开启、如何传播、如何收口(逐场景登记)。

## lock

- 起步值:UNKNOWN
- 填写指引:锁策略:锁粒度、持有时长、死锁预防规则。

## optimistic

- 起步值:UNKNOWN
- 填写指引:乐观并发:版本载体与冲突处理路径。

## idempotency

- 起步值:UNKNOWN
- 填写指引:幂等键的载体与覆盖范围(逐类操作登记)。

