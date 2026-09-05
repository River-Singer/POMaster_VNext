# -*- coding: utf-8 -*-
"""B6e Evidence Spec Kit 20 文件新著工具(播种资产 + 自指指纹 pin + gates 绑定登记级注记)。

输入(只读):
  - packages/cli/seeds/manifest.json                          B6b/B6c/B6d 清单(132 条原样保留并入)
  - doc/POMaster-vNext-Project-Store-Spec-Baseline-Evidence-Tooling-Studio-PRD.md
    §13(19 spec 清单真源,不读取——清单与十七段结构以常量表逐字承载)

输出:
  - packages/cli/seeds/specs/evidence/index.md                Kit 索引(分母 19/十七段结构/
    四值词形/文件↔SPEC 词形映射/对象面衔接注记)
  - packages/cli/seeds/specs/evidence/{build,typecheck-lint,unit-component-integration,
    contract,coverage,complexity-crap,mutation,architecture,dead-code-duplicate,
    browser-e2e,visual-regression,accessibility,performance,security,
    dependency-supply-chain,data-migration,business-acceptance,runtime-observability,
    release}.md                                                  19 份证据要求面
  - packages/cli/seeds/manifest.json                          播种清单单源(132 条原样保留
    + B6E 20 条追加;152 条全量分母)

新著形态定案(ADR-lite,B6e;任务红线「新著内容非移植/零新治理语义」):
  - **源在 PRD 不在旧包**:旧包无 19 件成套 evidence specs(实盘见任务 research
    old-assets-inventory §4)——清单与十七段结构 = Project-Store PRD §13/§13.1 逐字;
    语义祖先(旧 evidence-model 五类原始证据/20_verified 模板/quality-architecture-gate
    references)仅作交叉参照,不作字节源;
  - **要求面非证据面**(PRD §9.2/§2.5):Evidence Spec 持要求不持判定——判定值只在
    Verification Result(claim 四态)/Gate Result(七态);判卷四值词形闭包
    PASS/FAIL/UNKNOWN/NOT_RUN(§13.1),禁发明第五值/评分轴/新状态轴;每份 spec 含
    「显式缺席诚实位」(证据不可得 = NOT_RUN,禁静默缺证当 PASS——NOT_AVAILABLE
    语义在 NOT_RUN 位承载,不新立词形);
  - **阈值项目化**(§13.2 逐字「阈值必须项目化」):本 Kit 不写任何通用阈值数字——
    阈值只住 baseline/quality 登记,Spec 只要求「阈值已登记且被引用」;与 B6d baseline
    UNKNOWN 起步分形:Spec 是规范性要求(起步纪律=要求模板,可含具体判定条款),不是
    Owner 填写模板,如实按 §13 写要求内容;
  - **工具词形池**(零发明):工具名只从 PRD §2.8 词形池(Vitest/JaCoCo/Stryker/PIT/
    Playwright/axe/Lighthouse/dependency-cruiser/ArchUnit)与 §13.2/§13.3 逐字
    (Complexity Adapter/Istanbul/V8/c8/PITest)取;其余 spec 的 Tool Bindings 写
    「项目登记」资格要求——栈选型词(baseline 禁词表同款)照禁(vitest/playwright 因
    §2.8 词形池豁免);
  - **gates 绑定 = 登记级注记**(无消费者不加机制):文件↔对象绑定零新机制——对象面
    (B2 SPEC.* 一等对象,kind=business_rule + payload.spec_kind=evidence_spec 判别,
    21-evidence-spec kind profile)已以 requirements[].claim_refs/gate_refs 承载资格
    判定,closeout 消费分母恒为 store 对象;最小接线 = 每份 spec 头行「对象面词形:
    SPEC.*」+ index 映射表(登记/注记级),catalog gate recipe 零改动(gate_def_draft
    已含 verdict_vocabulary,无 evidence spec 引用字段位);对象登记 = init 步骤 4.7
    预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2——init 写 store),此后对象演进
    归项目运行时 applyTransaction;
  - **批 G 陈旧声明清洗**(2026-09-05,D5=(a) 同类授权延伸;D2 预植落地后的内容演进):
    头行与 index 登记通路行的旧词形「对象登记时机由项目运行时 applyTransaction 决定,
    init 播种不写 store 对象」按 D2 预植现状改写——头行改为「对应对象由 init 步骤 4.7
    预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的
    播种底稿,对象演进归项目运行时 applyTransaction」,index 登记通路行同步改写;
    旧词形播种面零残留(生成器模板+重演逐字节承载,manifest 自指指纹 pin 同批重算);
  - **播种件无 frontmatter**(authoring:new 通路复用,B6d 先例):纯正文 + 清单
    自指指纹 pin(资产自身字节 sha256/字节数);lane 词形 = 播种分区词形 evidence;
  - **播种面零变更**:SEEDABLE_STORE_DIRS 已含 specs/evidence(B6a),kernel/layout
    零改动;seed-once-missing-only 语义不变。

用法:
  python seed_b6e_evidence.py            # 物化(write_if_changed 幂等)
  python seed_b6e_evidence.py --verify   # 只读重演(字节逐等比对)
"""

import hashlib
import io
import json
import os
import re
import sys

if __name__ == "__main__":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))            # .../POMaster_VNext/catalog/tools
VNEXT = os.path.dirname(os.path.dirname(HERE))               # .../POMaster_VNext
SEEDS_DIR = os.path.join(VNEXT, "packages", "cli", "seeds")
EVIDENCE_ASSET_DIR = os.path.join(SEEDS_DIR, "specs", "evidence")
MANIFEST_PATH = os.path.join(SEEDS_DIR, "manifest.json")

BATCH = "B6E"
MANIFEST_SCHEMA = "pomaster.seed-manifest/1"
PLANTED_TOTAL = 152
BATCH_SCOPE = ("B6e:Evidence Spec Kit 20 文件新著播种(index 1 + 19 份证据要求面;"
               "PRD §13 清单+§13.1 十七段结构;要求面非证据面——持要求不持判定,"
               "判卷四值词形闭包;gates 绑定=登记级注记;B6b/B6c/B6d 132 条在册——"
               "清单合并承载全量分母 152)")

# 设计源锚(新著件的 source_path 词形——非 vendor 字节源,provenance 语义见头注 ADR)。
DESIGN_SOURCE = ("doc/POMaster-vNext-Project-Store-Spec-Baseline-Evidence-Tooling-Studio-PRD.md"
                 "#s13-evidence-spec-kit(PRD §13 清单逐字+§13.1 十七段结构;新著无 vendor "
                 "字节源——语义祖先=旧 evidence-model/20_verified 模板/quality-architecture-"
                 "gate references,仅参照)")

NEW_AUTHORING_NOTES = [
    "B6e 新著件(非移植):旧包无 19 件成套 evidence specs——源=Project-Store PRD §13 清单"
    "(PRD 文本非 vendor 字节);语义祖先=旧 evidence-model 五类原始证据/20_verified 模板/"
    "quality-architecture-gate references(仅参照);内容=规范性要求新著(要求面——持要求不持"
    "判定,判定值只在 Verification Result/Gate Result),十七段结构照 PRD §13.1,判卷四值词形"
    "闭包(PASS/FAIL/UNKNOWN/NOT_RUN)禁发明第五值;阈值/工具具体选型项目化(baseline 面决策),"
    "零通用阈值零新治理语义",
    "B6e 形态注记:本件无 frontmatter(纯正文——authoring:new 通路复用);清单 pin=资产自身"
    "字节 sha256(自指指纹,装载器按 authoring 分流校验);gates 绑定=登记级注记(对象面词形 "
    "SPEC.* 头行+index 映射表),无第二套机器绑定机制(无消费者不加机制——对象面 21 schema "
    "requirements 已承载资格判定)",
    "裁定批 G 陈旧声明清洗(2026-09-05,D5=(a) 同类授权延伸——D2 预植落地后的内容演进,"
    "最小改写只动登记面):对象面词形头行旧词形「对象登记时机由项目运行时 applyTransaction "
    "决定,init 播种不写 store 对象」→「对应对象由 init 步骤 4.7 预植 SPEC.* store 对象"
    "(PROPOSED 起步,裁定批 D D2);本文件为该对象 requirements 的播种底稿,对象演进归项目"
    "运行时 applyTransaction」(index 登记通路行同步改写);生成器模板+manifest 自指指纹 pin "
    "同批重算,旧词形播种面零残留(测试钉)",
]

# ======================================================================
# 十七段结构(PRD §13.1 逐字)与判卷四值词形闭包
# ======================================================================
# §13.1 顶层 13 段;四值词形是 Assertions 段的判定词位(§13.1 词面平列;research
# old-assets-inventory §4 词形 Assertions(PASS/FAIL/UNKNOWN/NOT_RUN)——落 ### 子段)。
SECTION_ORDER = [
    "Purpose", "Subjects", "Claims", "Required Observations", "Allowed Producers",
    "Tool Bindings", "Assertions", "Required Artifacts", "Retention", "Exceptions",
    "Activation Guidance", "Ownership", "Change Policy",
]
VERDICTS = ["PASS", "FAIL", "UNKNOWN", "NOT_RUN"]

# 21-evidence-spec.schema.json definitions.governed_id 文法镜像(词形冻结面——单源禁二次
# 发明文法;此处只作构建期对账,运行期权威解析归 kernel parseGovernedId)。
GOVERNED_ID_SPEC = re.compile(
    r"^SPEC\.[A-Z][A-Z0-9_]{0,31}(\.[A-Z][A-Z0-9_]{0,31})*(\.[0-9]+)?$")

# ======================================================================
# 判定词位共用帧(资格语义从 PRD §9.2/§3.1/21 schema requirements 资格词形推导——
# 零新治理语义:不发明第五值/评分;每份 spec 叠加自己的具体条款)
# ======================================================================
ASSERTIONS_PREAMBLE = [
    "- 判定资格总则:四值词形闭包(PASS/FAIL/UNKNOWN/NOT_RUN——PRD §13.1;禁发明第五值);"
    "判卷执行归 Verification Result(claim 四态)/Gate Result(七态),本文件不自填判定值。",
    "- 资格判定:可满足本 Spec 条款的 claim/run 必须出自对象面 requirements 资格清单"
    "(claim_refs/gate_refs 在册;资格外一律不满足,跨对象借证=资格不成立——21-evidence-spec "
    "kind profile 词形)。",
]
PASS_FRAME = ("- 资格:全部 Required Observations 在座且出自 Allowed Producers/Tool Bindings "
              "资格面;Required Artifacts 齐备且可取回;要求条款逐条满足。")
FAIL_FRAME = ("- 资格:任一必需要求不满足(观察缺席/出自资格外生产者/工件缺席或不可解析/"
              "claim_refs·gate_refs 清单外或跨对象借证)。")
UNKNOWN_FRAME = ("- 证据在座但不足以判定(receipt 维度不全/工件损坏/口径未登记)——诚实位,"
                 "禁当 PASS 呈现;补证后重判。")
NOT_RUN_FRAME = ("- 本证据类型未被产出(工具未执行/环境缺席)或范围显式不适用且例外已登记"
                 "——显式缺席诚实位,禁把未跑写成 PASS/UNKNOWN。")

DEFAULT_CHANGE_POLICY = [
    "- 本文件是项目可编辑要求面:条款修订走项目变更流程(CHANGE.* 登记);要求条款(必要性)"
    "修订需 Owner 确认,措辞/呈现类修订不受限。",
    "- 阈值联动:数值阈值只住 baseline/quality 登记(§13.2「阈值必须项目化」);本文件修订"
    "只改要求条款,不改阈值数字。",
]
DEFAULT_OWNERSHIP = [
    "- 要求属主:项目 Owner(条款与例外裁决)。",
    "- 证据生产:变更执行 lane 角色(Activation Guidance 所列时点);判定:Verification/Gate "
    "通路——角色分离,生产者不得自判 PASS。",
]

# ======================================================================
# 19 份证据要求面(文件名 = PRD §13 清单逐字;内容 = 规范性要求新著)
# ======================================================================
SPECS = [
    {
        "slug": "build",
        "spec_id": "SPEC.BUILD",
        "title": "构建成功",
        "one_liner": "构建成功证据:登记命令在登记环境退出码 0,产物清单与交付登记一致且可取回",
        "purpose": "本 Spec 定义「构建成功」这一证据的要求:登记的构建命令在登记环境完成,"
                   "退出码可机读,构建产物清单与 baseline/platform/delivery.md 的交付登记"
                   "一致且可取回。构建成功是其余全部证据类型的前提位。",
        "subjects": [
            "- 变更涉及的全部构建单元(前端/后端/包/镜像等——以 baseline/platform/delivery.md "
            "登记的构建单元清单为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「changed code builds successfully in the registered "
            "environment」类。",
        ],
        "observations": [
            "- 构建命令与参数(与登记逐字一致);退出码。",
            "- 执行锚:execution_id/AGX 与 store seq(时间锚恒 seq,零墙钟)。",
            "- 产物清单(名称+内容寻址引用)。",
        ],
        "producers": [
            "- 项目登记的构建工具链执行(本地或 CI);Agent 自述「我构建过了」不是合法生产者。",
        ],
        "tool_bindings": [
            "- 构建命令以 baseline/platform/delivery.md 登记为准;CI 产出的完整构建日志是合法"
            "观察来源。",
        ],
        "pass_specific": "- 本 Spec 具体条款:登记构建命令退出码 0;产物清单与交付登记一致"
                         "(缺产物/多产物均不满足)。",
        "fail_specific": "- 本 Spec 具体情形:退出码非 0;产物缺席;实际命令与登记漂移。",
        "artifacts": [
            "- 完整构建日志;产物清单及其内容寻址引用(evidence/blobs/,优先内容寻址)。",
        ],
        "exceptions": [
            "- 环境不可得(如需密钥/专用机)→ NOT_RUN + 例外显式登记;禁口头豁免。",
        ],
        "activation": [
            "- 激活时点:变更涉及构建面;发布前;CI 门禁放行前。",
        ],
    },
    {
        "slug": "typecheck-lint",
        "spec_id": "SPEC.TYPECHECK_LINT",
        "title": "类型检查与静态检查",
        "one_liner": "静态检查证据:类型检查与 lint 零未处置 error 级发现,规则集配置锚在座",
        "purpose": "本 Spec 定义「静态检查通过」这一证据的要求:项目登记的类型检查器与 "
                   "linter 在变更面执行完成,零未处置的 error 级发现,规则集配置锚在座可溯。",
        "subjects": [
            "- 变更触碰的代码文件及其类型依赖闭包(闭包口径以项目登记的检查范围为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「changed code passes typecheck and lint with zero "
            "unresolved error-level findings」类。",
        ],
        "observations": [
            "- 类型检查命令退出码与发现清单(逐条:文件/位置/规则)。",
            "- lint 命令退出码与发现清单(同上)。",
            "- 规则集配置锚(配置文件路径+内容寻址引用),证明发现清单出自登记规则集。",
        ],
        "producers": [
            "- 项目登记的类型检查器与 linter;发现清单必须出自工具原始输出,禁人工转述替代。",
        ],
        "tool_bindings": [
            "- 类型检查器/linter 的具体工具与规则集由项目登记(配置锚在座);未登记工具的"
            "发现清单不具备资格。",
        ],
        "pass_specific": "- 本 Spec 具体条款:两类命令退出码 0;发现清单为空,或每条发现都有"
                         "例外登记(Exceptions 通道)。",
        "fail_specific": "- 本 Spec 具体情形:任一 error 级发现无例外登记;配置锚缺席"
                         "(发现不可溯源)。",
        "artifacts": [
            "- 工具原始输出(逐字);例外登记引用。",
        ],
        "exceptions": [
            "- 逐发现登记豁免(理由+批准者+复核触发);批量豁免禁用。",
        ],
        "activation": [
            "- 激活时点:每次代码变更提交前;CI 门禁放行前。",
        ],
    },
    {
        "slug": "unit-component-integration",
        "spec_id": "SPEC.UNIT_COMPONENT_INTEGRATION",
        "title": "单元/组件/集成测试",
        "one_liner": "三层测试证据:unit/component/integration 全部在册命令执行,计数与失败清单可溯,范围覆盖变更面",
        "purpose": "本 Spec 定义「测试通过且范围充分」这一证据的要求:单元/组件/集成三层"
                   "测试按登记命令执行,结果计数与失败清单可溯,执行范围覆盖变更面。",
        "subjects": [
            "- 变更触碰的代码及其直接协作面(范围口径以 baseline/quality 登记为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「changed code is sufficiently test protected」类"
            "(PRD §3.2 例文同族)。",
        ],
        "observations": [
            "- 测试命令(与登记一致)与退出码;用例计数(total/passed/failed/skipped)。",
            "- 失败与跳过清单(逐条:用例+理由);随机种子(如适用,保复现)。",
            "- 执行范围声明(三层各自覆盖的变更面)。",
        ],
        "producers": [
            "- 项目登记的测试 runner 执行;计数必须出自 runner 原始报告,禁手写计数。",
        ],
        "tool_bindings": [
            "- 测试 runner 由项目登记(PRD §2.8 词形池:Vitest 等);未登记 runner 的结果"
            "不具备资格。",
        ],
        "pass_specific": "- 本 Spec 具体条款:全部在册命令退出码 0;failed=0;执行范围覆盖"
                         "变更面(范围缺口逐条有例外登记)。",
        "fail_specific": "- 本 Spec 具体情形:任一命令失败;范围缺口无例外;计数与原始报告"
                         "不一致。",
        "artifacts": [
            "- runner 原始报告(junit/json 形态);失败用例的诊断输出。",
        ],
        "exceptions": [
            "- skipped/范围缺口逐条登记(理由+补测触发);禁整层静默跳过。",
        ],
        "activation": [
            "- 激活时点:每次代码变更提交前;CI 门禁放行前;重构前后对照。",
        ],
    },
    {
        "slug": "contract",
        "spec_id": "SPEC.CONTRACT",
        "title": "API 契约兼容",
        "one_liner": "契约证据:契约 diff 在座,兼容判定对照登记的版本承诺,破坏性变更零未处置",
        "purpose": "本 Spec 定义「API 契约兼容」这一证据的要求:契约源在座,机器 diff 与"
                   "兼容性判定完成,破坏性变更对照 baseline/backend/api-contract.md 的版本"
                   "承诺逐条处置。",
        "subjects": [
            "- 变更触碰的 API(以 API_REQ.* governed 面与契约源登记为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「api contract diff is compatible within the registered "
            "versioning promise」类。",
        ],
        "observations": [
            "- 契约源(OpenAPI 或等价)与其版本锚;diff 清单(逐条:路径/方法/变更类别)。",
            "- 兼容性判定结果(逐条:兼容/破坏);破坏性变更的处置(版本升级/例外登记)。",
        ],
        "producers": [
            "- 项目登记的契约 diff 工具与属性用例生成器(vNext 既有 CONTRACT 门禁双腿语义:"
            "oasdiff/schemathesis 词形族);判定必须出自工具输出。",
        ],
        "tool_bindings": [
            "- diff 工具与契约源位置由项目登记;双独立腿(diff+用例)结果都需在座,禁合并为"
            "单一绿灯。",
        ],
        "pass_specific": "- 本 Spec 具体条款:diff 非破坏,或破坏性变更已按登记的版本承诺"
                         "处置(版本升级/废弃流程在座)。",
        "fail_specific": "- 本 Spec 具体情形:破坏性变更无版本处置;契约源缺席或不可解析。",
        "artifacts": [
            "- 契约源快照(内容寻址);diff 报告;兼容判定原始输出。",
        ],
        "exceptions": [
            "- 兼容承诺的例外(如内部端点)逐条登记于契约面,禁以口头约定豁免。",
        ],
        "activation": [
            "- 激活时点:变更触碰 API 面;契约文件修订;对外发布前。",
        ],
    },
    {
        "slug": "coverage",
        "spec_id": "SPEC.COVERAGE",
        "title": "测试覆盖率",
        "one_liner": "覆盖率证据:分层口径(全局/关键模块/变化代码)逐层在座,对照项目登记阈值,分母不被生成物扭曲",
        "purpose": "本 Spec 定义「测试保护充分」这一证据的要求:覆盖率按分层口径逐层在座"
                   "(全局/关键模块/变化代码——只看全局平均会掩盖关键模块缺口),逐层对照"
                   "项目登记阈值判定。",
        "subjects": [
            "- 变更触碰代码所在的全部分组(分组与阈值以 baseline/quality 登记为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「coverage meets the registered layered budget」类。",
        ],
        "observations": [
            "- 各分组×各指标(lines/statements/functions/branches)数值。",
            "- 口径定义(Total/Executable 类执行口径)与排除项清单生效证明。",
            "- 变化代码覆盖率(变更面单独口径)。",
        ],
        "producers": [
            "- 项目登记的 coverage runner;数值必须出自原始报告,禁手写。",
        ],
        "tool_bindings": [
            "- PRD §13.2 词形:Istanbul/V8/c8 coverage(前端)、JaCoCo(Java);由项目按技术栈"
            "登记。",
        ],
        "pass_specific": "- 本 Spec 具体条款:各分组指标不低于 baseline/quality 登记的项目"
                         "阈值;分母排除项与登记一致(无 generated/mock 扭曲)。",
        "fail_specific": "- 本 Spec 具体情形:任一分组低于阈值无例外;分母被生成物/ mock "
                         "扭曲;口径与登记漂移。",
        "artifacts": [
            "- 原始 coverage 报告(blob,内容寻址);分组×指标明细表。",
        ],
        "exceptions": [
            "- 分组/文件级豁免逐条登记(理由+复核触发);禁全局豁免。",
        ],
        "activation": [
            "- 激活时点:代码变更提交前;CI 门禁放行前。",
        ],
    },
    {
        "slug": "complexity-crap",
        "spec_id": "SPEC.COMPLEXITY_CRAP",
        "title": "复杂度风险(CRAP)",
        "one_liner": "CRAP 证据:按 v1 公式逐符号计算在座,超阈值符号逐个处置;目的=高复杂度+低测试保护,阈值项目化",
        "purpose": "本 Spec 定义「复杂度风险被度量与处置」这一证据的要求。CRAP v1:",
        "formula_block": [
            "CRAP = Complexity² × (1 - Coverage)³ + Complexity",
        ],
        "purpose_tail": [
            "其中 Coverage 使用 0~1。CRAP 目的:识别 High Complexity + Low Test Protection"
            "(高复杂度且缺测试保护);不是评价代码优不优雅。",
            "阈值必须项目化,不能把某个数字写成全世界永久真理(§13.2 逐字)——项目阈值只住 "
            "baseline/quality 的 CRAP 登记,本 Spec 不设通用数字。",
        ],
        "subjects": [
            "- 变更触碰的符号(函数/方法级;语言以项目登记的分析器覆盖面为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「changed code complexity risk is measured and mitigated」类。",
        ],
        "observations": [
            "- 逐符号 Complexity 与 Coverage 及其 CRAP 值(计算原始输出)。",
            "- 超阈值符号清单与逐个处置记录(补测试/重构/例外登记)。",
        ],
        "producers": [
            "- 复杂度分析与覆盖率数据的合法组合产出;数值必须出自工具输出。",
        ],
        "tool_bindings": [
            "- PRD §13.2 逐字词形:允许前端 Complexity Adapter + Istanbul/V8/c8 coverage;"
            "允许 Java Complexity source + JaCoCo。",
        ],
        "pass_specific": "- 本 Spec 具体条款:变更面逐符号 CRAP 计算在座;超阈值符号逐个有"
                         "处置(测试保护提升/重构/例外登记)。",
        "fail_specific": "- 本 Spec 具体情形:计算缺席;超阈值符号无处置;Coverage 输入缺席"
                         "(公式不可计算)。",
        "artifacts": [
            "- 逐符号 CRAP 表(原始输出);处置记录。",
        ],
        "exceptions": [
            "- 符号级豁免逐条登记(理由+复核触发);豁免不改变计算,只改变处置要求。",
        ],
        "activation": [
            "- 激活时点:代码变更提交前(与 coverage 同窗);CI 门禁放行前。",
        ],
    },
    {
        "slug": "mutation",
        "spec_id": "SPEC.MUTATION",
        "title": "变异测试",
        "one_liner": "变异测试证据:六维在册(score/survivors/killed/timeout/not-covered/affected scope),score 对照项目阈值,survivors 逐个处置",
        "purpose": "本 Spec 定义「测试有效性」这一证据的要求:变异测试在变更面执行,六维"
                   "证据在座,mutation score 对照项目登记阈值,survivors 逐个处置。",
        "subjects": [
            "- 变更触碰的执行类代码(范围=affected scope;生成物/声明类不入围)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「tests kill the registered share of mutants on changed "
            "scope」类。",
        ],
        "observations": [
            "- PRD §13.3 六维逐字:mutation score;survivors;killed;timeout;not-covered;"
            "affected scope。",
            "- survivors 逐个处置记录(补断言/等价变异论证/豁免登记)。",
        ],
        "producers": [
            "- 项目登记的变异测试框架执行;六维必须出自原始报告。",
        ],
        "tool_bindings": [
            "- PRD §13.3 逐字:支持 Stryker、PIT / PITest;由项目按技术栈登记其一。",
        ],
        "pass_specific": "- 本 Spec 具体条款:score 不低于 baseline/quality 登记的项目阈值;"
                         "survivors 逐个有处置;not-covered 面与 coverage 证据一致。",
        "fail_specific": "- 本 Spec 具体情形:score 低于阈值无例外;survivors 未处置;"
                         "六维缺任一。",
        "artifacts": [
            "- 完整 mutation 报告(blob,内容寻址);survivors 明细。",
        ],
        "exceptions": [
            "- 等价变异/性能受限豁免逐条登记(理由+复核触发)。",
        ],
        "activation": [
            "- 激活时点:关键执行类变更(与 baseline/quality 登记的适用范围一致);CI 门禁"
            "放行前。",
        ],
    },
    {
        "slug": "architecture",
        "spec_id": "SPEC.ARCHITECTURE",
        "title": "架构核查",
        "one_liner": "架构证据:依赖方向与分层约定的机判结果在座,违规零未处置,规则集对照 baseline 登记",
        "purpose": "本 Spec 定义「架构约定被遵守」这一证据的要求:依赖方向与分层约定"
                   "(baseline/architecture.md 与 directory-structure.md 登记的规则集)经"
                   "机器核查,违规清单在座且逐条处置。",
        "subjects": [
            "- 变更触碰模块及其依赖闭包(以 baseline/backend/architecture.md 的层/模块登记"
            "为准;前端同构对应 frontend 分区)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「changed code respects the registered dependency and "
            "layering rules」类。",
        ],
        "observations": [
            "- 规则集锚(登记引用);违规清单(逐条:源/目标/规则)。",
            "- 违规处置记录(修复/例外登记)。",
        ],
        "producers": [
            "- 项目登记的架构核查工具机判;人工评审可补充,不可替代机判。",
        ],
        "tool_bindings": [
            "- PRD §2.8 词形池:dependency-cruiser、ArchUnit(vNext 既有 ARCHITECTURE 门禁"
            "腿 import-linter 同族);由项目按技术栈登记。",
        ],
        "pass_specific": "- 本 Spec 具体条款:违规清单为空,或每条违规都有例外登记。",
        "fail_specific": "- 本 Spec 具体情形:任一违规无处置;规则集与 baseline 登记漂移。",
        "artifacts": [
            "- 机判原始输出;例外登记引用。",
        ],
        "exceptions": [
            "- 边界例外逐条登记(理由+期限+复核触发);期限到期未复核即转 FAIL。",
        ],
        "activation": [
            "- 激活时点:新增模块/跨层引用变更;CI 门禁放行前。",
        ],
    },
    {
        "slug": "dead-code-duplicate",
        "spec_id": "SPEC.DEAD_CODE_DUPLICATE",
        "title": "死代码与重复代码",
        "one_liner": "死代码/重复证据:可达性口径与重复块清单在座,新引入项零未处置",
        "purpose": "本 Spec 定义「无新增死代码与重复」这一证据的要求:死代码(入口可达性"
                   "口径)与重复块清单在座,新引入项逐条处置。",
        "subjects": [
            "- 变更触碰的模块与其入口面(可达性口径以项目登记的入口清单为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「no unhandled dead or duplicated code introduced by "
            "the change」类。",
        ],
        "observations": [
            "- 死代码清单(逐条:符号+不可达判定口径);重复块清单(逐条:位置+重复度)。",
            "- 逐条处置记录(删除/保留+理由)。",
        ],
        "producers": [
            "- 项目登记的静态分析工具机判;人工发现可补充登记,不可替代清单机判。",
        ],
        "tool_bindings": [
            "- 具体工具由项目登记(静态分析类;登记配置锚在座);未登记工具的清单不具备资格。",
        ],
        "pass_specific": "- 本 Spec 具体条款:新引入死代码/重复为零,或逐条有处置记录。",
        "fail_specific": "- 本 Spec 具体情形:新引入项无处置;清单与登记口径漂移。",
        "artifacts": [
            "- 分析原始输出;处置记录。",
        ],
        "exceptions": [
            "- 保留类豁免(如对外契约要求的导出)逐条登记(理由+复核触发)。",
        ],
        "activation": [
            "- 激活时点:代码变更提交前;重构收口前。",
        ],
    },
    {
        "slug": "browser-e2e",
        "spec_id": "SPEC.BROWSER_E2E",
        "title": "浏览器端到端",
        "one_liner": "E2E 证据:在册 journey 在真实浏览器逐项通过,evidence 必含 console error/network 维度,trace 在座",
        "purpose": "本 Spec 定义「关键用户路径可用」这一证据的要求:在册 journey 清单在"
                   "真实浏览器执行,逐步结果可溯,证据必含 console error 与 network 维度"
                   "(vNext BROWSER 门禁确定性腿既有语义)。",
        "subjects": [
            "- 变更触碰页面(PAGE.* 面)上的关键 journey;journey 清单由项目登记。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「registered journeys pass in a real browser with zero "
            "unhandled console errors」类。",
        ],
        "observations": [
            "- journey 逐步执行结果(逐条:步骤/期望/实测)。",
            "- console error 清单(逐条未处置项);network 维度(失败请求/异常时延)。",
            "- 执行环境锚(浏览器与视口;base_url 与环境登记一致)。",
        ],
        "producers": [
            "- 浏览器自动化执行(确定性腿);交互腿 MCP 通道(chrome-devtools/playwright MCP"
            "——既有 Browser Eyes 双通道语义)按各自动作资格补位,通道名随 receipt 登记。",
        ],
        "tool_bindings": [
            "- PRD §2.8 词形池:Playwright(确定性腿);MCP 交互腿通道登记于项目 .mcp.json。",
        ],
        "pass_specific": "- 本 Spec 具体条款:在册 journey 全通过;console error 零未处置;"
                         "network 维度零未解释失败。",
        "fail_specific": "- 本 Spec 具体情形:journey 失败;未处置 console error;环境与"
                         "登记漂移。",
        "artifacts": [
            "- 执行 trace 与截图(blob,内容寻址);console/network 明细。",
        ],
        "exceptions": [
            "- journey 级豁免(功能暂缓)逐条登记(理由+复归触发)。",
        ],
        "activation": [
            "- 激活时点:页面/交互面变更;发布前冒烟。",
        ],
    },
    {
        "slug": "visual-regression",
        "spec_id": "SPEC.VISUAL_REGRESSION",
        "title": "视觉回归",
        "one_liner": "视觉回归证据:渲染快照与基准逐 viewport 对比,diff 全部属已登记的有意变更或零漂移",
        "purpose": "本 Spec 定义「视觉呈现未发生意外漂移」这一证据的要求:渲染快照与基准"
                   "逐 viewport 对比,diff 清单逐条判定(有意变更登记/意外漂移)。",
        "subjects": [
            "- 变更触碰页面与其关键状态(状态集合由项目登记)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「visual diffs are limited to the registered intended "
            "changes」类。",
        ],
        "observations": [
            "- 快照集(逐 viewport)与基准版本锚;diff 清单(逐条:页面/状态/viewport/差异度)。",
            "- diff 判定(有意变更登记引用/意外漂移)。",
        ],
        "producers": [
            "- 项目登记的快照对比执行;基准更新必须走登记通路,禁就地改基准消 diff。",
        ],
        "tool_bindings": [
            "- 快照/对比工具由项目登记(可与 SPEC.BROWSER_E2E 同链路);基准存储位置与版本"
            "锚登记在座。",
        ],
        "pass_specific": "- 本 Spec 具体条款:diff 全部属于已登记的有意变更,或 diff 为零。",
        "fail_specific": "- 本 Spec 具体情形:意外漂移未处置;基准版本锚缺席。",
        "artifacts": [
            "- 前后快照与 diff 图(blob,内容寻址);有意变更登记引用。",
        ],
        "exceptions": [
            "- 动态区域掩码逐条登记(理由+范围);禁全页掩码。",
        ],
        "activation": [
            "- 激活时点:样式/布局/组件视觉面变更;发布前。",
        ],
    },
    {
        "slug": "accessibility",
        "spec_id": "SPEC.ACCESSIBILITY",
        "title": "可访问性",
        "one_liner": "可访问性证据:自动核查发现清单在座,对标标准登记于 baseline,严重级发现零未处置",
        "purpose": "本 Spec 定义「可访问性基线被核查」这一证据的要求:自动核查发现在座,"
                   "对标标准与其版本登记于 baseline/quality 的 a11y 面,严重级发现零未处置。",
        "subjects": [
            "- 变更触碰页面与其交互组件(键盘可达/焦点/对比度/语义标注面)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「zero unhandled serious accessibility findings against "
            "the registered a11y baseline」类。",
        ],
        "observations": [
            "- 自动核查发现清单(逐条:规则/严重度/命中元素)。",
            "- 对标标准与其版本(baseline/quality a11y 登记引用);人工核查记录(如适用)。",
        ],
        "producers": [
            "- 项目登记的自动核查工具执行;人工核查可补充,不可替代自动清单。",
        ],
        "tool_bindings": [
            "- PRD §2.8 词形池:axe;由项目登记规则集与扫描范围。",
        ],
        "pass_specific": "- 本 Spec 具体条款:零未处置的严重级发现;对标标准登记在座且与"
                         "核查规则集一致。",
        "fail_specific": "- 本 Spec 具体情形:严重级发现未处置;核查范围未覆盖变更面。",
        "artifacts": [
            "- 核查原始报告;发现明细与处置记录。",
        ],
        "exceptions": [
            "- 逐发现豁免(理由+整改期限+复核触发);期限到期未整改即转 FAIL。",
        ],
        "activation": [
            "- 激活时点:页面/组件交互面变更;发布前。",
        ],
    },
    {
        "slug": "performance",
        "spec_id": "SPEC.PERFORMANCE",
        "title": "性能",
        "one_liner": "性能证据:预算字段对照 baseline,实验室判卷面与字段判卷面双 observation 独立在座不聚合",
        "purpose": "本 Spec 定义「性能预算被满足」这一证据的要求:实验室判卷面与字段判卷"
                   "面两类 observation 独立在座(vNext 既有 PERFORMANCE 双 runner 语义:"
                   "lighthouse=实验室判卷/web vitals=字段判卷——禁聚合为单一绿灯),逐项"
                   "对照性能预算字段判定。",
        "subjects": [
            "- 变更触碰页面(预算字段以项目登记的 §29 性能预算面为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「pages meet the registered performance budget」类。",
        ],
        "observations": [
            "- 预算字段(逐项:指标/预算/实测/口径)。",
            "- 实验室判卷报告;字段判卷数据(样本量与采集口径在座)。",
        ],
        "producers": [
            "- 双 runner 各自独立执行;两类报告各自在座,禁以一类替代另一类。",
        ],
        "tool_bindings": [
            "- PRD §2.8 词形池:Lighthouse(实验室面);字段面按项目登记的采集通道。",
        ],
        "pass_specific": "- 本 Spec 具体条款:预算字段逐项实测不劣于 baseline 登记(超限"
                         "逐项有例外——预算方向随指标语义:延迟类上限/吞吐类下限);双面"
                         " observation 都在座。",
        "fail_specific": "- 本 Spec 具体情形:任一预算项超限无例外;单面缺席;样本口径"
                         "不可溯。",
        "artifacts": [
            "- 双 runner 原始报告(blob);预算对照表。",
        ],
        "exceptions": [
            "- 预算项豁免逐条登记(理由+整改计划+复核触发)。",
        ],
        "activation": [
            "- 激活时点:页面性能敏感面变更;发布前。",
        ],
    },
    {
        "slug": "security",
        "spec_id": "SPEC.SECURITY",
        "title": "安全核查",
        "one_liner": "安全证据:三独立腿(secret 泄露/依赖漏洞/静态分析)各自在座各自判定,禁合并为单一绿灯",
        "purpose": "本 Spec 定义「安全核查通过」这一证据的要求:三条独立腿(secret 泄露"
                   "扫描/依赖漏洞审计/静态分析)各自产出发现清单并各自判定(vNext 既有 "
                   "SECURITY 门禁三腿语义:三个独立 adapter,禁止合并为单一 security ok "
                   "绿灯),未处置发现逐腿呈现。",
        "subjects": [
            "- 变更触碰代码与仓库面(密钥/凭据/依赖声明)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「three security legs each pass with zero unhandled "
            "findings」类。",
        ],
        "observations": [
            "- 三腿各自:工具/范围/发现清单(逐条:类别/严重度/位置)/误报与豁免登记。",
            "- 未处置发现汇总(逐腿)。",
        ],
        "producers": [
            "- 三腿各自独立工具执行(vNext 既有词形族:gitleaks/pip_audit/semgrep 类);"
            "任一腿缺席=本证据 NOT_RUN,禁以其余腿补位。",
        ],
        "tool_bindings": [
            "- 三腿工具由项目登记(登记配置锚在座);腿间禁合并判定(聚合绿灯=资格不成立)。",
        ],
        "pass_specific": "- 本 Spec 具体条款:三腿各自零未处置发现(发现=已处置或已登记"
                        "豁免)。",
        "fail_specific": "- 本 Spec 具体情形:任一腿存在未处置发现;腿缺席冒充通过。",
        "artifacts": [
            "- 三腿各自原始输出;豁免登记引用。",
        ],
        "exceptions": [
            "- 逐发现豁免(理由+期限+复核触发),按腿登记;期限到期未复核即转 FAIL。",
        ],
        "activation": [
            "- 激活时点:代码/依赖变更提交前;CI 门禁放行前;发布前。",
        ],
    },
    {
        "slug": "dependency-supply-chain",
        "spec_id": "SPEC.DEPENDENCY_SUPPLY_CHAIN",
        "title": "依赖与供应链",
        "one_liner": "供应链证据:锁文件与声明一致,新依赖有登记审批,已知漏洞与来源可信逐项在座",
        "purpose": "本 Spec 定义「依赖面可控」这一证据的要求:锁文件与声明一致,新增依赖"
                   "有登记与审批,已知漏洞扫描结果与来源可信面逐项在座。",
        "subjects": [
            "- 变更涉及的依赖闭包(新增/升级/移除的包与其传递面)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「dependency changes are registered, audited and "
            "vulnerability-screened」类。",
        ],
        "observations": [
            "- 锁文件 diff 与依赖树变更清单(逐包:版本/来源/许可证)。",
            "- 已知漏洞扫描结果(逐条:包/严重度/修复建议);新依赖审批记录。",
        ],
        "producers": [
            "- 锁文件工具与漏洞扫描工具执行;审批记录来自项目登记面(许可/例外台账)。",
        ],
        "tool_bindings": [
            "- 锁文件与扫描工具由项目登记(与 SPEC.SECURITY 依赖审计腿衔接——本 Spec 管"
            "登记与溯源面,该腿管门禁判定面);来源可信口径以 baseline 登记为准。",
        ],
        "pass_specific": "- 本 Spec 具体条款:锁文件与声明一致;新增依赖逐包有登记与审批;"
                         "已知漏洞零未处置高危。",
        "fail_specific": "- 本 Spec 具体情形:锁漂移;未审批新增依赖;高危漏洞未处置。",
        "artifacts": [
            "- 锁文件 diff;依赖树快照;扫描原始输出。",
        ],
        "exceptions": [
            "- 逐包豁免(理由+期限+复核触发);升级受阻等运营性例外登记处置计划。",
        ],
        "activation": [
            "- 激活时点:依赖变更;lockfile 修订;发布前。",
        ],
    },
    {
        "slug": "data-migration",
        "spec_id": "SPEC.DATA_MIGRATION",
        "title": "数据迁移",
        "one_liner": "迁移证据:expand/migrate/contract 各阶段执行记录与前后 schema 快照在座,校验通过,回滚面可执行",
        "purpose": "本 Spec 定义「数据迁移安全」这一证据的要求:迁移按登记策略(baseline/"
                   "data/migration.md 的 expand/migrate/contract/rollback)逐阶段执行,"
                   "前后 schema 快照与数据校验在座,回滚面可执行。",
        "subjects": [
            "- 变更触碰的 schema 对象与数据面(与 baseline/data/model.md 登记对账)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「migration executed per plan with verifiable rollback」类。",
        ],
        "observations": [
            "- 迁移脚本与其版本锚;逐阶段执行记录(阶段/范围/影响行数口径)。",
            "- 前后 schema 快照(内容寻址);数据校验结果(校验和/抽样对账口径)。",
            "- 回滚面:方案在座且经演练或论证(演练记录/不可演练的理由论证)。",
        ],
        "producers": [
            "- 迁移执行通路与校验工具;schema 快照出自数据库实际内省,禁以迁移脚本自述替代。",
        ],
        "tool_bindings": [
            "- 迁移工具与快照/校验手段由项目登记(baseline/data/migration.md 登记引用);"
            "evidence-model 五类中 migration-schema 证据类的落位。",
        ],
        "pass_specific": "- 本 Spec 具体条款:执行记录与登记策略一致;校验通过;回滚面在座"
                         "(可执行)。",
        "fail_specific": "- 本 Spec 具体情形:阶段执行与策略漂移;校验失败;回滚面缺席。",
        "artifacts": [
            "- 执行记录;前后 schema 快照;校验报告;回滚演练/论证材料。",
        ],
        "exceptions": [
            "- 不可回滚阶段必须事前登记(理由+补偿方案);禁事后补登。",
        ],
        "activation": [
            "- 激活时点:schema 变更;数据订正;发布含迁移时。",
        ],
    },
    {
        "slug": "business-acceptance",
        "spec_id": "SPEC.BUSINESS_ACCEPTANCE",
        "title": "业务验收",
        "one_liner": "验收证据:acceptance spec 的 Expected State 逐场景被证据覆盖,业务侧确认记录在座",
        "purpose": "本 Spec 定义「业务期望被证实」这一证据的要求:specs/acceptance/ 登记"
                   "的验收场景逐条有 Observable Expected State 的证据与业务侧确认记录。",
        "subjects": [
            "- 变更对应的验收场景(以 specs/acceptance/ 的 Acceptance Spec 登记为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「acceptance scenario expected state is evidenced and "
            "confirmed」类。",
        ],
        "observations": [
            "- 场景执行记录(逐条:场景引用/前置/实测状态)。",
            "- 业务侧确认记录(确认人角色/确认结论/范围);与场景 Evidence Spec References "
            "的对账(每场景引用的本 Kit spec 已各自满足)。",
        ],
        "producers": [
            "- 场景执行证据出自本 Kit 其余 spec 的合格产出;业务确认记录来自 Owner/Actor "
            "登记面(具名,禁匿名汇总)。",
        ],
        "tool_bindings": [
            "- 无专用工具:本 Spec 的资格锚是 acceptance spec 登记与其引用的证据 spec "
            "判定结果;确认记录形态由项目登记。",
        ],
        "pass_specific": "- 本 Spec 具体条款:验收场景逐条有确认记录;场景引用的证据 spec "
                         "各自判定非 FAIL/UNKNOWN/NOT_RUN(四值闭包逐项核——显式缺席"
                         "不构成验收通过)。",
        "fail_specific": "- 本 Spec 具体情形:场景缺确认;引用证据与场景期望不一致;匿名/"
                         "转述类确认(不具名)。",
        "artifacts": [
            "- 确认记录;场景执行证据引用(指向本 Kit 其余 spec 的 artifact)。",
        ],
        "exceptions": [
            "- 场景暂缓验收逐条登记(理由+复归条件);禁整体免验。",
        ],
        "activation": [
            "- 激活时点:业务功能交付;发布放行;验收周期收口。",
        ],
    },
    {
        "slug": "runtime-observability",
        "spec_id": "SPEC.RUNTIME_OBSERVABILITY",
        "title": "运行时可观测",
        "one_liner": "运行时证据:部署锚+log/metric/trace 登记面在目标环境可取回,关联 ID 贯通",
        "purpose": "本 Spec 定义「运行时行为可观测」这一证据的要求:部署锚与 log/metric/"
                   "trace 登记面(baseline/platform/observability.md 口径)在目标环境可取回,"
                   "关联 ID 贯通请求链路。",
        "subjects": [
            "- 变更部署到的运行环境与环境登记(ENV.* 面;环境差异以 baseline/platform/"
            "environment.md 登记为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「registered observability surfaces are retrievable in "
            "the target environment」类。",
        ],
        "observations": [
            "- 部署锚(部署清单/版本/实例)与目标环境登记一致。",
            "- log/metric/trace 各面取样(按 baseline 登记口径);关联 ID 贯通证明(同一请求"
            "跨面可串联)。",
            "- audit 面(登记的审计事件可取回,如适用)。",
        ],
        "producers": [
            "- 目标环境的观测通道取样(读侧);取样必须带环境锚,禁跨环境混样。",
        ],
        "tool_bindings": [
            "- 观测通道由项目登记(baseline/platform/observability.md 引用);证据形态对应 "
            "evidence-model 五类中 runtime-deployment 类。",
        ],
        "pass_specific": "- 本 Spec 具体条款:登记 observation 面逐项可取回;关联 ID 贯通;"
                        "部署锚与环境登记一致。",
        "fail_specific": "- 本 Spec 具体情形:登记面在目标环境不可取回;关联 ID 断链;环境"
                        "漂移未登记。",
        "artifacts": [
            "- 取样原始数据(blob);部署锚快照。",
        ],
        "exceptions": [
            "- 环境级豁免(如本地环境无 trace 后端)逐环境登记(理由+目标环境复归条件)。",
        ],
        "activation": [
            "- 激活时点:部署后验证;运行时缺陷排查收口;发布前演练。",
        ],
    },
    {
        "slug": "release",
        "spec_id": "SPEC.RELEASE",
        "title": "发布",
        "one_liner": "发布证据:制品 hash 可追溯,审批链完整,版本与回滚面对照交付登记",
        "purpose": "本 Spec 定义「发布可信」这一证据的要求:发布制品 hash 可追溯,审批链"
                   "完整,版本词形与回滚面对照 baseline/platform/delivery.md 登记逐项在座。",
        "subjects": [
            "- 发布单元(以 baseline/platform/delivery.md 登记的发布单元为准)。",
        ],
        "claims": [
            "- 可立 claim 语句类型:「release artifact is traceable, approved and "
            "rollback-capable」类。",
        ],
        "observations": [
            "- 制品清单及内容寻址 hash(与构建产物对账——SPEC.BUILD 产物引用)。",
            "- 版本词形与来源(登记引用);审批链记录(逐节点:角色/结论)。",
            "- 回滚面:方案在座且具备可执行性(演练记录或论证)。",
        ],
        "producers": [
            "- 构建通路(制品 hash);审批登记面(审批链);禁以聊天记录替代登记审批。",
        ],
        "tool_bindings": [
            "- 制品库与审批登记面由项目登记(baseline/platform/delivery.md 引用);hash 词形"
            "内容寻址(PRD §3.4 同源纪律)。",
        ],
        "pass_specific": "- 本 Spec 具体条款:制品 hash 与构建产物一致;审批链完整;版本与"
                        "回滚面登记在座。",
        "fail_specific": "- 本 Spec 具体情形:hash 对不上;审批缺节点;回滚面缺席。",
        "artifacts": [
            "- 制品(内容寻址引用);审批记录;回滚演练/论证材料。",
        ],
        "exceptions": [
            "- 紧急发布快速通道逐次登记(理由+事后补审时限);补审逾期即登记违规。",
        ],
        "activation": [
            "- 激活时点:每次发布;回滚后重新发布。",
        ],
    },
]

assert len(SPECS) == 19, f"evidence spec 分母漂移: {len(SPECS)}"
assert len({s["spec_id"] for s in SPECS}) == 19, "SPEC id 重复"
assert len({s["slug"] for s in SPECS}) == 19, "slug 重复"

INDEX_FILES = [f"{s['slug']}.md" for s in SPECS]

# ======================================================================
# 词形纪律自校验(禁词/占位词形/阈值数字/零墙钟/A1 档位词形/marker)
# ======================================================================
# 禁词表 = B6d baseline 禁词表同款(栈选型词)——vitest/playwright 豁免(PRD §2.8 词形池
# 逐字授权),java 豁免(PRD §13.2 逐字「允许 Java:Complexity source + JaCoCo」——语言
# 语境词形,非选型默认),其余工具词不在表中(jest/mocha/cypress 等非 §2.8 池词保持禁用)。
FORBIDDEN_TECH_PATTERN = re.compile(
    r"\b(vue|react|angular|svelte|emberjs|nuxt|pinia|redux|mobx|rxjs"
    r"|spring|mybatis|jpa|hibernate|struts"
    r"|mysql|postgresql|postgres|mariadb|sqlite|mongodb|redis|memcached|etcd"
    r"|nginx|tomcat|jetty|undertow|iis"
    r"|kubernetes|docker|helm|terraform|ansible"
    r"|kotlin|scala|groovy|python|django|flask|rails|laravel|php|ruby|perl"
    r"|typescript|javascript|coffeescript"
    r"|jest|mocha|karma|cypress|selenium|puppeteer"
    r"|webpack|rollup|esbuild|parcel|gulp|grunt|eslint|prettier|biome"
    r"|tailwind|bootstrap|antd|mui|chakra|primereact|devextreme|handsontable"
    r"|tanstack|ag-grid|wcag"
    r"|graphql|grpc|protobuf|thrift"
    r"|kafka|rabbitmq|rocketmq|pulsar|activemq"
    r"|elasticsearch|solr|clickhouse|doris|starrocks|minio)\b",
    re.IGNORECASE,
)
FORBIDDEN_PLACEHOLDER_PATTERN = re.compile(r"(待填写|待补|TBD|TODO|FIXME)", re.IGNORECASE)
# 阈值数字默认值面——§13.2「阈值必须项目化」:Spec 面零百分比数字(阈值只住 baseline)。
FORBIDDEN_THRESHOLD_PATTERN = re.compile(r"\d+\s*%")
# 零墙钟(A4)与新状态轴/评分禁令。
WALLCLOCK_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T")
FORBIDDEN_SEMANTIC_PATTERN = re.compile(r"(评分|打分|\bscore\s*[:=]\s*\d)", re.IGNORECASE)
MARKER_PATTERN = re.compile(r"GENERATED")


def assert_word_discipline(rel, text):
    """单件词形纪律 fail-closed(命中即爆——零新治理语义红线)。"""
    hit = FORBIDDEN_TECH_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(栈选型词) {rel}: {hit.group(0) if hit else ''}"
    hit = FORBIDDEN_PLACEHOLDER_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(占位词形) {rel}: {hit.group(0)}"
    hit = FORBIDDEN_THRESHOLD_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(阈值数字——阈值项目化) {rel}: {hit.group(0)}"
    assert not WALLCLOCK_PATTERN.search(text), f"零墙钟违例(A4) {rel}"
    hit = FORBIDDEN_SEMANTIC_PATTERN.search(text)
    assert hit is None, f"治理语义违例(评分轴禁入——零新治理语义) {rel}: {hit.group(0)}"
    assert not MARKER_PATTERN.search(text), f"marker-free 违例 {rel}"
    hit = re.search(r"\b(MINIMAL|LIGHT|STANDARD)\b", text, re.IGNORECASE)
    assert hit is None, f"A1 档位词形违例 {rel}: {hit.group(0)}"


# ======================================================================
# 件构造
# ======================================================================

def spec_document(spec):
    """单份 Evidence Spec 十七段结构文档(PRD §13.1 逐字段名;纯正文无 frontmatter)。"""
    out = [
        f"# Evidence Spec — {spec['title']}\n",
        "\n",
        f"- 路径:specs/evidence/{spec['slug']}.md\n",
        f"- 对象面词形:{spec['spec_id']}(B2 Evidence Spec 一等对象——kind=business_rule + "
        "payload.spec_kind=evidence_spec 判别;本文件是项目可编辑要求面,对应对象由 init "
        "步骤 4.7 预植 SPEC.* store 对象(PROPOSED 起步,裁定批 D D2);本文件为该对象 "
        "requirements 的播种底稿,对象演进归项目运行时 applyTransaction)\n",
        "- 语义锚:Project-Store PRD §13(Evidence Spec Kit)——要求面非证据面:持要求不持"
        "判定,判定值只在 Verification Result(claim 四态)/Gate Result(七态)。\n",
        "\n",
        f"## Purpose\n",
        "\n",
        spec["purpose"] + "\n",
    ]
    if "formula_block" in spec:
        for line in spec["formula_block"]:
            out.append(f"\n{text_block(line)}\n")
        for line in spec.get("purpose_tail", []):
            out.append(f"\n{line}\n")

    out.append("\n## Subjects\n")
    for line in spec["subjects"]:
        out.append(f"\n{line}\n")
    out.append("\n## Claims\n")
    out.append("\n- claim 词形:CLM-*(07 schema 词面);claim 由运行时 record 通路登记"
               "(UNVERIFIED 起步,声称方禁自填 VERIFIED)——本 Spec 只定义可立 claim 的"
               "语句类型,不产生判定值。\n")
    for line in spec["claims"]:
        out.append(f"\n{line}\n")
    out.append("\n## Required Observations\n")
    for line in spec["observations"]:
        out.append(f"\n{line}\n")
    out.append("\n## Allowed Producers\n")
    for line in spec["producers"]:
        out.append(f"\n{line}\n")
    out.append("\n## Tool Bindings\n")
    for line in spec["tool_bindings"]:
        out.append(f"\n{line}\n")

    out.append("\n## Assertions\n")
    for line in ASSERTIONS_PREAMBLE:
        out.append(f"\n{line}\n")
    out.append(f"\n### PASS\n\n{PASS_FRAME}\n\n{spec['pass_specific']}\n")
    out.append("\n- 判定值由 Verification Result / Gate Result 写——本文件不自填 PASS。\n")
    out.append(f"\n### FAIL\n\n{FAIL_FRAME}\n\n{spec['fail_specific']}\n")
    out.append(f"\n### UNKNOWN\n\n{UNKNOWN_FRAME}\n")
    out.append(f"\n### NOT_RUN\n\n{NOT_RUN_FRAME}\n")

    out.append("\n## Required Artifacts\n")
    for line in spec["artifacts"]:
        out.append(f"\n{line}\n")
    out.append("\n## Retention\n")
    out.append("\n- 证据与 raw artifact 至少保留至对应 claim 关账;发布面证据按 baseline/"
               "platform/delivery.md 登记的保留策略;blob 面优先内容寻址(PRD §3.4)。\n")
    out.append("\n## Exceptions\n")
    for line in spec["exceptions"]:
        out.append(f"\n{line}\n")
    out.append("\n## Activation Guidance\n")
    for line in spec["activation"]:
        out.append(f"\n{line}\n")
    out.append("\n## Ownership\n")
    for line in DEFAULT_OWNERSHIP:
        out.append(f"\n{line}\n")
    out.append("\n## Change Policy\n")
    for line in DEFAULT_CHANGE_POLICY:
        out.append(f"\n{line}\n")
    return "".join(out)


def text_block(line):
    """PRD 逐字节词形的 text 代码块(公式等)。"""
    return f"```text\n{line}\n```"


def build_index_md():
    """Kit 索引:分母/十七段结构/四值词形/映射表/对象面衔接(gates 绑定 ADR 注记)。"""
    out = [
        "# Evidence Spec Kit —— 证据要求面索引\n",
        "\n",
        "- 路径:specs/evidence/index.md\n",
        "- 职责(PRD §13):Evidence Spec Kit 索引——19 份证据要求面 + §13.1 十七段固定结构"
        " + 判卷四值词形闭包 + 文件↔对象面词形映射。\n",
        "- 纪律:Evidence Spec 持要求不持判定(PRD §9.2/§2.5)——判定值只在 Verification "
        "Result(claim 四态)/Gate Result(七态);本目录全部文件是项目可编辑要求面(播种 "
        "marker-free,seed-once-missing-only)。\n",
        "\n",
        "## Kit 分母(19 spec + index = 20)\n",
        "\n",
        "| 文件 | 对象面词形 | 要求面一句话 |\n",
        "|---|---|---|\n",
    ]
    for spec in SPECS:
        out.append(f"| {spec['slug']}.md | {spec['spec_id']} | {spec['one_liner']} |\n")
    out.append("\n")
    out.append("## 固定结构(§13.1 十七段)\n\n")
    out.append("顶层 13 段:Purpose / Subjects / Claims / Required Observations / "
               "Allowed Producers / Tool Bindings / Assertions / Required Artifacts / "
               "Retention / Exceptions / Activation Guidance / Ownership / Change Policy;\n")
    out.append("Assertions 段带四个判定词位:PASS / FAIL / UNKNOWN / NOT_RUN。\n")
    out.append("\n## 判卷四值词形(§13.1 闭包——禁发明第五值)\n\n")
    out.append("- PASS:要求条款逐条满足且证据资格成立——由 Verification Result / Gate "
               "Result 判定,Spec 文件不自填。\n")
    out.append("- FAIL:任一必需要求不满足或证据资格不成立(资格清单外/跨对象借证)。\n")
    out.append("- UNKNOWN:证据在座但不足以判定——诚实位,禁当 PASS。\n")
    out.append("- NOT_RUN:证据类型未被产出或范围显式不适用且例外已登记——显式缺席诚实位"
               "(证据不可得一律落本位),禁静默缺证当 PASS。\n")
    out.append("\n## 对象面衔接(B2 Evidence Spec 一等对象——gates 绑定登记级)\n\n")
    out.append("- 登记词形:SPEC.* governed id(21-evidence-spec kind profile:kind="
               "business_rule + payload.spec_kind=evidence_spec 判别;词形随 PR-0008 在 "
               "vocab-lock prefixes_v0 闭包)。\n")
    out.append("- 登记通路:对应 store 对象由 init 步骤 4.7 预植(裁定批 D D2——kernel "
               "applyTransaction upsert_object 单事务,PROPOSED 起步,seed-once);此后对象"
               "演进归项目运行时 applyTransaction。requirements[].claim_refs/gate_refs 是"
               "资格清单——closeout 按资格判卷,资格外 claim/run 不满足条款。\n")
    out.append("- 文件↔对象绑定 = 登记级(本索引映射表 + 各 spec 头行词形),无第二套机器"
               "绑定机制(无消费者不加机制——对象面 requirements 已承载资格判定)。\n")
    out.append("- catalog gate recipe 零引用字段位:gate recipe 判卷走 03-gate-result 七态"
               "词表,与本 Kit 的衔接经由对象面 requirements.gate_refs,不新增词形不动 "
               "catalog。\n")
    out.append("\n## 生产/消费平面(PRD §3)\n\n")
    out.append("- claims:.pomaster/evidence/claims/(claim 禁自填 PASSED——经 Verification)。\n")
    out.append("- runs:.pomaster/evidence/runs/(一个 Run 文件即该次 observation 的 "
              "normalized receipt,不另设 receipt/result 同义件)。\n")
    out.append("- blobs:.pomaster/evidence/blobs/(raw artifact,优先内容寻址)。\n")
    out.append("- binding:claim → run_ids → blob_refs → task → governed_object → git_sha"
               "(稳定引用完成,不建独立目录)。\n")
    return "".join(out)


# ======================================================================
# 构建期自校验 + manifest 合并
# ======================================================================

def build_seed_assets():
    """20 件字节 + manifest 文档(132 条原样保留 + B6E 20 条追加)。"""
    assets = {}
    assets["specs/evidence/index.md"] = build_index_md().encode("utf-8")
    for spec in SPECS:
        assets[f"specs/evidence/{spec['slug']}.md"] = spec_document(spec).encode("utf-8")

    # ---- 构建期自校验(fail-closed)----
    # 1) 分母 20 = index + 19;文件名集合 == PRD §13 清单逐字。
    assert len(assets) == 20, f"evidence 分母漂移: {len(assets)}"
    expected = {"index.md"} | {f"{s}.md" for s in [
        "build", "typecheck-lint", "unit-component-integration", "contract", "coverage",
        "complexity-crap", "mutation", "architecture", "dead-code-duplicate", "browser-e2e",
        "visual-regression", "accessibility", "performance", "security",
        "dependency-supply-chain", "data-migration", "business-acceptance",
        "runtime-observability", "release"]}
    assert {p.split("/")[-1] for p in assets} == expected, "文件名集合 != PRD §13 清单"

    # 2) 十七段结构 + 判定词位 + 头行词形(19 spec 逐份;index 另测)。
    for spec in SPECS:
        rel = f"specs/evidence/{spec['slug']}.md"
        text = assets[rel].decode("utf-8")
        headings = [ln[3:].strip() for ln in text.splitlines() if ln.startswith("## ")]
        assert headings == SECTION_ORDER, f"{rel} 顶层段漂移: {headings}"
        sub = [ln[4:].strip() for ln in text.splitlines() if ln.startswith("### ")]
        assert sub == VERDICTS, f"{rel} 判定词位漂移: {sub}"
        # 判定词位必须位于 Assertions 段之后(### 子段落位)。
        idx_assertions = text.index("## Assertions")
        idx_artifacts = text.index("## Required Artifacts")
        for v in VERDICTS:
            pos = text.index(f"### {v}")
            assert idx_assertions < pos < idx_artifacts, f"{rel} 判定词位落位漂移: {v}"
        # 头行:路径/对象面词形/语义锚;SPEC 词形逐字且全文件恰一次。
        assert f"- 路径:specs/evidence/{spec['slug']}.md" in text, rel
        assert f"- 对象面词形:{spec['spec_id']}(" in text, rel
        assert text.count(spec["spec_id"]) == 1, f"{rel} SPEC 词形出现次数漂移"
        assert "- 语义锚:Project-Store PRD §13" in text, rel
        # 批 G 陈旧声明清洗:D2 预植现状新词形在座 + 旧词形零残留(计数断言——批 C 同款)。
        assert "init 步骤 4.7 预植" in text, f"{rel} 批 G 清洗新词形缺席"
        assert "本文件为该对象 requirements 的播种底稿" in text, f"{rel} 播种底稿词形缺席"
        assert "init 播种不写 store 对象" not in text, f"{rel} 批 G 清洗旧词形残留"
        assert "持要求不持判定" in text, f"{rel} 要求面声明缺席"
        assert "Verification Result" in text and "Gate Result" in text, rel
        # SPEC 词形过 governed 文法(21 schema definitions.governed_id SPEC 面镜像)。
        assert GOVERNED_ID_SPEC.match(spec["spec_id"]), spec["spec_id"]

    # 3) index:映射表与 19 spec 双射;衔接注记在座。
    idx_text = assets["specs/evidence/index.md"].decode("utf-8")
    for spec in SPECS:
        assert f"| {spec['slug']}.md | {spec['spec_id']} |" in idx_text, \
            f"index 缺映射行: {spec['slug']}"
    assert "无第二套机器绑定机制" in idx_text and "applyTransaction" in idx_text, \
        "gates 绑定登记级 ADR 注记缺席"
    assert "持要求不持判定" in idx_text
    # 批 G 陈旧声明清洗:index 登记通路行同批改写(新词形在座+旧词形零残留)。
    assert "init 步骤 4.7 预植" in idx_text, "index 批 G 清洗新词形缺席"
    assert "init 播种不写 store 对象" not in idx_text, "index 批 G 清洗旧词形残留"

    # 4) 逐件词形纪律。
    for rel, data in sorted(assets.items()):
        assert_word_discipline(rel, data.decode("utf-8"))

    # 5) PRD §13.2/§13.3 逐字词形锚(内容新著但条款词形忠实)。
    crap = assets["specs/evidence/complexity-crap.md"].decode("utf-8")
    assert "CRAP = Complexity² × (1 - Coverage)³ + Complexity" in crap, "CRAP v1 公式逐字缺席"
    assert "阈值必须项目化" in crap and "Istanbul/V8/c8" in crap and "JaCoCo" in crap
    mut = assets["specs/evidence/mutation.md"].decode("utf-8")
    for word in ["Stryker", "PIT / PITest", "mutation score", "survivors", "killed",
                 "timeout", "not-covered", "affected scope"]:
        assert word in mut, f"mutation §13.3 词形缺席: {word}"

    # ---- manifest 条目(自指指纹 pin)----
    b6e_entries = []
    b6e_targets = []
    for rel in sorted(assets):
        data = assets[rel]
        target = f".pomaster/{rel}"
        b6e_targets.append(target)
        b6e_entries.append({
            "target": target,
            "asset": rel,
            "seed_version": BATCH,
            "lane": "evidence",
            "authoring": "new",
            "source_path": DESIGN_SOURCE,
            "source_sha256": hashlib.sha256(data).hexdigest(),
            "source_bytes": len(data),
            "porting_notes": list(NEW_AUTHORING_NOTES),
        })

    # manifest.json(132 条原样保留 + B6E 追加——单源合并分母 152)。
    old_doc = json.loads(open(MANIFEST_PATH, encoding="utf-8").read())
    assert old_doc["schema"] == MANIFEST_SCHEMA
    old_entries = old_doc["entries"]
    old_batches = old_doc.get("batches") or {}
    kept_names = ("B6B-1", "B6B-2", "B6C", "B6D")
    kept_batches = {k: list(v) for k, v in old_batches.items() if k in kept_names}
    assert set(kept_batches) == set(kept_names), "磁盘清单缺 B6b/B6c/B6d 批名单"
    kept_targets = set()
    for k in kept_names:
        kept_targets |= set(kept_batches[k])
    kept_entries = [e for e in old_entries if e["target"] in kept_targets]
    assert len(kept_entries) == 132, f"B6b/B6c/B6d 条目数漂移: {len(kept_entries)}"
    assert not (kept_targets & set(b6e_targets)), "B6E 目标与既有条目撞名"
    batch_targets = dict(kept_batches)
    batch_targets[BATCH] = b6e_targets
    manifest_doc = {
        "schema": MANIFEST_SCHEMA,
        "batch": BATCH,
        "batches": batch_targets,
        "generated_by": "catalog/tools/seed_b6e_evidence.py",
        "denominator": {
            "batch_scope": BATCH_SCOPE,
            "planted": len(kept_entries) + len(b6e_entries),
            "planted_total": PLANTED_TOTAL,
            "batch_new": len(b6e_entries),
        },
        "seed_semantics": "seed-once-missing-only(缺席才写 / 在座零触碰 / marker-free;"
                          "seeds.ts 单一实现;frontmatter 为 PRD §8.2 字段位减 id——"
                          "no-governed-id 默认,播种 spec 是项目可编辑自由文件;B6c 起 "
                          "BE 件含 vendor frontmatter 保留字段、stacks 件落 <slug> 子"
                          "目录——SEEDABLE_STORE_DIRS 显式 slug 登记;B6d 起 baseline "
                          "件为新著纯正文(无 frontmatter——yaml 直接可解析/Owner 填写"
                          "面零噪音;entry authoring=new,pin=资产自身字节指纹,装载器"
                          "自指校验;UNKNOWN 起步,「待填写」词形零移植);B6e 起 specs/"
                          "evidence 件同 authoring=new 纯正文通路——十七段结构照 PRD "
                          "§13.1,要求面非证据面(持要求不持判定,判卷四值词形闭包),"
                          "gates 绑定=登记级注记)",
        "authority_scope": "specs 面 mixed_required_and_advisory;baseline 面 "
                           "project_baseline_template(UNKNOWN 起步模板,非规则面);"
                           "specs/evidence 面 evidence_spec_requirements(要求面规范——"
                           "持要求不持判定,判定值只在 Verification Result/Gate Result)",
        "entries": kept_entries + b6e_entries,
    }
    return assets, manifest_doc


def write_if_changed(path, data):
    if os.path.isfile(path):
        if open(path, "rb").read() == data:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)
    return True


def main():
    built_assets, manifest_doc = build_seed_assets()
    outputs = {}
    for rel, data in built_assets.items():
        outputs[os.path.join(EVIDENCE_ASSET_DIR, *rel.split("/")[2:])] = data
    outputs[MANIFEST_PATH] = (json.dumps(manifest_doc, ensure_ascii=False, indent=2)
                              + "\n").encode("utf-8")

    if "--verify" in sys.argv:
        drifts = []
        for path, data in outputs.items():
            if not os.path.isfile(path):
                drifts.append({"path": path, "error": "missing"})
            elif open(path, "rb").read() != data:
                drifts.append({"path": path, "error": "bytes_differ"})
        if drifts:
            for d in drifts:
                print("DRIFT:", d)
            sys.exit(1)
        print(f"[seed_b6e_evidence] verify ok: {len(built_assets)} seeds + manifest.json"
              f"(共 {len(manifest_doc['entries'])} 条,字节逐等)")
        return

    changed = 0
    for path, data in sorted(outputs.items()):
        if write_if_changed(path, data):
            changed += 1
            print("WROTE:", os.path.relpath(path, VNEXT))
    print(f"[seed_b6e_evidence] ok: {len(outputs)} outputs({changed} changed / "
          f"{len(outputs) - changed} unchanged);evidence={len(built_assets)} "
          f"manifest_entries={len(manifest_doc['entries'])}"
          f"(B6E +{manifest_doc['denominator']['batch_new']},"
          f"总 {manifest_doc['denominator']['planted']})")
    print("下一步:corepack pnpm test(分母 152 面断言)+ 全量门禁")


if __name__ == "__main__":
    main()
