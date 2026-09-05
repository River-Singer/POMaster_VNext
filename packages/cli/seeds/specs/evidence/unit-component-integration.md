# Evidence Spec — 单元/组件/集成测试

- 路径:specs/evidence/unit-component-integration.md
- 对象面词形:SPEC.UNIT_COMPONENT_INTEGRATION(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对象登记时机由项目运行时 applyTransaction 决定,init 播种不写 store 对象)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「测试通过且范围充分」这一证据的要求:单元/组件/集成三层测试按登记命令执行,结果计数与失败清单可溯,执行范围覆盖变更面。

## Subjects

- 变更触碰的代码及其直接协作面(范围口径以 baseline/quality 登记为准)。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「changed code is sufficiently test protected」类(PRD §3.2 例文同族)。

## Required Observations

- 测试命令(与登记一致)与退出码;用例计数(total/passed/failed/skipped)。

- 失败与跳过清单(逐条:用例+理由);随机种子(如适用,保复现)。

- 执行范围声明(三层各自覆盖的变更面)。

## Allowed Producers

- 项目登记的测试 runner 执行;计数必须出自 runner 原始报告,禁手写计数。

## Tool Bindings

- 测试 runner 由项目登记(PRD §2.8 词形池:Vitest 等);未登记 runner 的结果不具备资格。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:全部在册命令退出码 0;failed=0;执行范围覆盖变更面(范围缺口逐条有例外登记)。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:任一命令失败;范围缺口无例外;计数与原始报告不一致。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- runner 原始报告(junit/json 形态);失败用例的诊断输出。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- skipped/范围缺口逐条登记(理由+补测触发);禁整层静默跳过。

## Activation Guidance

- 激活时点:每次代码变更提交前;CI 门禁放行前;重构前后对照。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
