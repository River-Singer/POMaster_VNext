# 数据质量基线

- 路径:baseline/data/quality.md
- 职责(PRD §3):null / uniqueness / precision / stale / reconciliation
- 状态:播种模板(Expected 面)——项目 Owner 就地填写;起步值一律 UNKNOWN,不确定保持 UNKNOWN,不猜测、不留空白或任何占位描述词形(旧模板占位词形零移植)。
- 填写纪律:技术选型词与阈值数字仅由 Owner 决策后写入本文件;示例与默认值不住播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD 与 catalog 注记)。
## null

- 起步值:UNKNOWN
- 填写指引:空值语义:哪些字段可空、空值的含义(逐字段登记)。

## uniqueness

- 起步值:UNKNOWN
- 填写指引:唯一性约束逐条登记(约束、范围、违反时的处置)。

## precision

- 起步值:UNKNOWN
- 填写指引:跨系统边界的精度承诺(承诺什么、由谁保证)。

## stale

- 起步值:UNKNOWN
- 填写指引:时效性:数据的有效期与陈旧判定(逐类数据登记)。

## reconciliation

- 起步值:UNKNOWN
- 填写指引:对账机制:周期、口径、差异处置路径。

