---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/13-monetary-precision-protocol.md
seed_source_sha256: 4930246c7dfed2751d3a71d617a21e24b46b376131723451b39152582c7a3d4f
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 13 金额精度协议

## Scope

P1。定义金额、单价、成本、汇率、比例和汇总的传输、计算、比较、展示与导出精度。

## Non-Scope

不定义业务公式、税务政策、币种范围或最终结算口径。

## Terms

- Amount：十进制定点值。
- Currency：正式币种标识。
- Scale：小数位数量。
- Rounding Mode/Stage：舍入方式与时点。

## MUST

- 金额声明 amount、currency、scale 和舍入规则。
- 传输使用十进制字符串或无歧义最小单位整数。
- 权威计算使用 Decimal/BigDecimal 等十进制能力。
- 区分原始、计算、展示和导出值。
- 汇总按正式顺序计算和舍入。
- 百分比声明传输倍率。

## MUST NOT

- MUST NOT 使用二进制浮点执行正式金额累计、乘除和相等比较。
- MUST NOT 用 `toFixed` 代替十进制计算。
- MUST NOT 混合币种直接求和。
- MUST NOT 页面、报表、导出各自决定精度。

## SHOULD

- SHOULD 使用统一 Money/Decimal 类型、parser 和 formatter。
- SHOULD 测试负数、极值、尾数 5、汇总和跨币种边界。

## Contract

```text
Money { amount: decimal-string, currency: string, scale: integer }
Rule { calculationScale, displayScale, roundingMode, roundingStage }
```

## Checklist

- [ ] amount/currency/scale/rounding 完整。
- [ ] 未使用浮点做正式计算。
- [ ] 展示、汇总和导出一致。
- [ ] 比例和跨币种语义明确。

## Examples

### 内容示例，可删除

保留接口金额字符串，通过统一 formatter 展示，不先转为浮点数。

## Anti-patterns

用 `parseFloat` 累加成本，再 `toFixed(2)` 生成正式报表。

## Ownership

业务/财务定义口径，后端负责权威计算，前端负责无损传输，QA 验证边界。

## Change Policy

精度、币种、舍入或比例语义变化属于破坏性契约变更，必须同步全链路。
