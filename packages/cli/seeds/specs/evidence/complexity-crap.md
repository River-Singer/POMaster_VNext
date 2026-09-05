# Evidence Spec — 复杂度风险(CRAP)

- 路径:specs/evidence/complexity-crap.md
- 对象面词形:SPEC.COMPLEXITY_CRAP(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对象登记时机由项目运行时 applyTransaction 决定,init 播种不写 store 对象)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「复杂度风险被度量与处置」这一证据的要求。CRAP v1:

```text
CRAP = Complexity² × (1 - Coverage)³ + Complexity
```

其中 Coverage 使用 0~1。CRAP 目的:识别 High Complexity + Low Test Protection(高复杂度且缺测试保护);不是评价代码优不优雅。

阈值必须项目化,不能把某个数字写成全世界永久真理(§13.2 逐字)——项目阈值只住 baseline/quality 的 CRAP 登记,本 Spec 不设通用数字。

## Subjects

- 变更触碰的符号(函数/方法级;语言以项目登记的分析器覆盖面为准)。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「changed code complexity risk is measured and mitigated」类。

## Required Observations

- 逐符号 Complexity 与 Coverage 及其 CRAP 值(计算原始输出)。

- 超阈值符号清单与逐个处置记录(补测试/重构/例外登记)。

## Allowed Producers

- 复杂度分析与覆盖率数据的合法组合产出;数值必须出自工具输出。

## Tool Bindings

- PRD §13.2 逐字词形:允许前端 Complexity Adapter + Istanbul/V8/c8 coverage;允许 Java Complexity source + JaCoCo。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:变更面逐符号 CRAP 计算在座;超阈值符号逐个有处置(测试保护提升/重构/例外登记)。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:计算缺席;超阈值符号无处置;Coverage 输入缺席(公式不可计算)。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- 逐符号 CRAP 表(原始输出);处置记录。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- 符号级豁免逐条登记(理由+复核触发);豁免不改变计算,只改变处置要求。

## Activation Guidance

- 激活时点:代码变更提交前(与 coverage 同窗);CI 门禁放行前。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
