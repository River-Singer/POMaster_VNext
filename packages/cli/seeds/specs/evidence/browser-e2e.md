# Evidence Spec — 浏览器端到端

- 路径:specs/evidence/browser-e2e.md
- 对象面词形:SPEC.BROWSER_E2E(B2 Evidence Spec 一等对象——kind=business_rule + payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对应对象由 init 步骤 4.7 预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的播种底稿,对象演进归项目运行时 applyTransaction)
- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。

## Purpose

本 Spec 定义「关键用户路径可用」这一证据的要求:在册 journey 清单在真实浏览器执行,逐步结果可溯,证据必含 console error 与 network 维度(vNext BROWSER 门禁确定性腿既有语义)。

## Subjects

- 变更触碰页面(PAGE.* 面)上的关键 journey;journey 清单由项目登记。

## Claims

- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的语句类型,不产生判定值。

- 可立 claim 语句类型:「registered journeys pass in a real browser with zero unhandled console errors」类。

## Required Observations

- journey 逐步执行结果(逐条:步骤/期望/实测)。

- console error 清单(逐条未处置项);network 维度(失败请求/异常时延)。

- 执行环境锚(浏览器与视口;base_url 与环境登记一致)。

## Allowed Producers

- 浏览器自动化执行(确定性腿);交互腿 MCP 通道(chrome-devtools/playwright MCP——既有 Browser Eyes 双通道语义)按各自动作资格补位,通道名随 receipt 登记。

## Tool Bindings

- PRD §2.8 词形池:Playwright(确定性腿);MCP 交互腿通道登记于项目 .mcp.json。

## Assertions

- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。

- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec kind profile 词形)。

### PASS

- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings 资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。

- 本 Spec 具体条款:在册 journey 全通过;console error 零未处置;network 维度零未解释失败。

- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。

### FAIL

- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/claim_refs·gate_refs 清单外或跨对象借证)。

- 本 Spec 具体情形:journey 失败;未处置 console error;环境与登记漂移。

### UNKNOWN

- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,禁当 PASS 呈现;补证后重判。

### NOT_RUN

- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。

## Required Artifacts

- 执行 trace 与截图(blob,内容寻址);console/network 明细。

## Retention

- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。

## Exceptions

- journey 级豁免(功能暂缓)逐条登记(理由+复归触发)。

## Activation Guidance

- 激活时点:页面/交互面变更;发布前冒烟。

## Ownership

- 要求属主:项目 Owner(条款与例外裁决)。

- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate 通路——角色分离,生产者不得自判 PASS。

## Change Policy

- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)修订需 Owner 确认,措辞/呈现类修订不受限。

- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订只改要求条款,不改阈值数字。
