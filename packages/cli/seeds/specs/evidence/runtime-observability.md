# Evidence Spec — 运行时可观测

- 路径:specs/evidence/runtime-observability.md
- 对象面词形:SPEC.RUNTIME_OBSERVABILITY(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对应对象由 init 步骤 4.7 预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的播种底稿,对象演进归项目运行时 applyTransaction)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「运行时行为可观测」这一证据的要求:部署锚与 log/metric/trace 登记面(baseline/platform/observability.md 口径)在目标环境可取回,关联 ID 贯通请求链路。

## Subjects

- 变更部署到的运行环境与环境登记(ENV.* 面;环境差异以 baseline/platform/environment.md 登记为准)。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「registered observability surfaces are retrievable in the target environment」类。

## Required Observations

- 部署锚(部署清单/版本/实例)与目标环境登记一致。

- log/metric/trace 各面取样(按 baseline 登记口径);关联 ID 贯通证明(同一请求跨面可串联)。

- audit 面(登记的审计事件可取回,如适用)。

## Allowed Producers

- 目标环境的观测通道取样(读侧);取样必须带环境锚,禁跨环境混样。

## Tool Bindings

- 观测通道由项目登记(baseline/platform/observability.md 引用);证据形态对应 evidence-model 五类中 runtime-deployment 类。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:登记 observation 面逐项可取回;关联 ID 贯通;部署锚与环境登记一致。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:登记面在目标环境不可取回;关联 ID 断链;环境漂移未登记。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- 取样原始数据(blob);部署锚快照。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- 环境级豁免(如本地环境无 trace 后端)逐环境登记(理由+目标环境复归条件)。

## Activation Guidance

- 激活时点:部署后验证;运行时缺陷排查收口;发布前演练。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
