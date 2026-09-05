# Evidence Spec — 业务验收

- 路径:specs/evidence/business-acceptance.md
- 对象面词形:SPEC.BUSINESS_ACCEPTANCE(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对应对象由 init 步骤 4.7 预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的播种底稿,对象演进归项目运行时 applyTransaction)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「业务期望被证实」这一证据的要求:specs/acceptance/ 登记的验收场景逐条有 Observable Expected State 的证据与业务侧确认记录。

## Subjects

- 变更对应的验收场景(以 specs/acceptance/ 的 Acceptance Spec 登记为准)。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「acceptance scenario expected state is evidenced and confirmed」类。

## Required Observations

- 场景执行记录(逐条:场景引用/前置/实测状态)。

- 业务侧确认记录(确认人角色/确认结论/范围);与场景 Evidence Spec References 的对账(每场景引用的本 Kit spec 已各自满足)。

## Allowed Producers

- 场景执行证据出自本 Kit 其余 spec 的合格产出;业务确认记录来自 Owner/Actor 登记面(具名,禁匿名汇总)。

## Tool Bindings

- 无专用工具:本 Spec 的资格锚是 acceptance spec 登记与其引用的证据 spec 判定结果;确认记录形态由项目登记。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:验收场景逐条有确认记录;场景引用的证据 spec 各自判定非 FAIL/UNKNOWN/NOT_RUN(四值闭包逐项核——显式缺席不构成验收通过)。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:场景缺确认;引用证据与场景期望不一致;匿名/转述类确认(不具名)。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- 确认记录;场景执行证据引用(指向本 Kit 其余 spec 的 artifact)。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- 场景暂缓验收逐条登记(理由+复归条件);禁整体免验。

## Activation Guidance

- 激活时点:业务功能交付;发布放行;验收周期收口。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
