# Evidence Spec — 依赖与供应链

- 路径:specs/evidence/dependency-supply-chain.md
- 对象面词形:SPEC.DEPENDENCY_SUPPLY_CHAIN(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对应对象由 init 步骤 4.7 预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的播种底稿,对象演进归项目运行时 applyTransaction)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「依赖面可控」这一证据的要求:锁文件与声明一致,新增依赖有登记与审批,已知漏洞扫描结果与来源可信面逐项在座。

## Subjects

- 变更涉及的依赖闭包(新增/升级/移除的包与其传递面)。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「dependency changes are registered, audited and vulnerability-screened」类。

## Required Observations

- 锁文件 diff 与依赖树变更清单(逐包:版本/来源/许可证)。

- 已知漏洞扫描结果(逐条:包/严重度/修复建议);新依赖审批记录。

## Allowed Producers

- 锁文件工具与漏洞扫描工具执行;审批记录来自项目登记面(许可/例外台账)。

## Tool Bindings

- 锁文件与扫描工具由项目登记(与 SPEC.SECURITY 依赖审计腿衔接——本 Spec 管登记与溯源面,该腿管门禁判定面);来源可信口径以 baseline 登记为准。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:锁文件与声明一致;新增依赖逐包有登记与审批;已知漏洞零未处置高危。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:锁漂移;未审批新增依赖;高危漏洞未处置。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- 锁文件 diff;依赖树快照;扫描原始输出。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- 逐包豁免(理由+期限+复核触发);升级受阻等运营性例外登记处置计划。

## Activation Guidance

- 激活时点:依赖变更;lockfile 修订;发布前。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
