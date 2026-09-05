# Evidence Spec Kit —— 证据要求面索引

- 路径:specs/evidence/index.md
- 职责(PRD §13):Evidence Spec Kit 索引——19 份证据要求面 + §13.1 十七段固定结构 + 判卷四值词形闭包 + 文件↔对象面词形映射。
- 纪律:Evidence Spec 持要求不持判定(PRD §9.2/§2.5)——判定值只在 Verification Result(claim 四态)/Gate Result(七态);本目录全部文件是项目可编辑要求面(播种 marker-free,seed-once-missing-only)。

## Kit 分母(19 spec + index = 20)

| 文件 | 对象面词形 | 要求面一句话 |
|---|---|---|
| build.md | SPEC.BUILD | 构建成功证据:登记命令在登记环境退出码 0,产物清单与交付登记一致且可取回 |
| typecheck-lint.md | SPEC.TYPECHECK_LINT | 静态检查证据:类型检查与 lint 零未处置 error 级发现,规则集配置锚在座 |
| unit-component-integration.md | SPEC.UNIT_COMPONENT_INTEGRATION | 三层测试证据:unit/component/integration 全部在册命令执行,计数与失败清单可溯,范围覆盖变更面 |
| contract.md | SPEC.CONTRACT | 契约证据:契约 diff 在座,兼容判定对照登记的版本承诺,破坏性变更零未处置 |
| coverage.md | SPEC.COVERAGE | 覆盖率证据:分层口径(全局/关键模块/变化代码)逐层在座,对照项目登记阈值,分母不被生成物扭曲 |
| complexity-crap.md | SPEC.COMPLEXITY_CRAP | CRAP 证据:按 v1 公式逐符号计算在座,超阈值符号逐个处置;目的=高复杂度+低测试保护,阈值项目化 |
| mutation.md | SPEC.MUTATION | 变异测试证据:六维在册(score/survivors/killed/timeout/not-covered/affected scope),score 对照项目阈值,survivors 逐个处置 |
| architecture.md | SPEC.ARCHITECTURE | 架构证据:依赖方向与分层约定的机判结果在座,违规零未处置,规则集对照 baseline 登记 |
| dead-code-duplicate.md | SPEC.DEAD_CODE_DUPLICATE | 死代码/重复证据:可达性口径与重复块清单在座,新引入项零未处置 |
| browser-e2e.md | SPEC.BROWSER_E2E | E2E 证据:在册 journey 在真实浏览器逐项通过,evidence 必含 console error/network 维度,trace 在座 |
| visual-regression.md | SPEC.VISUAL_REGRESSION | 视觉回归证据:渲染快照与基准逐 viewport 对比,diff 全部属已登记的有意变更或零漂移 |
| accessibility.md | SPEC.ACCESSIBILITY | 可访问性证据:自动核查发现清单在座,对标标准登记于 baseline,严重级发现零未处置 |
| performance.md | SPEC.PERFORMANCE | 性能证据:预算字段对照 baseline,实验室判卷面与字段判卷面双 observation 独立在座不聚合 |
| security.md | SPEC.SECURITY | 安全证据:三独立腿(secret 泄露/依赖漏洞/静态分析)各自在座各自判定,禁合并为单一绿灯 |
| dependency-supply-chain.md | SPEC.DEPENDENCY_SUPPLY_CHAIN | 供应链证据:锁文件与声明一致,新依赖有登记审批,已知漏洞与来源可信逐项在座 |
| data-migration.md | SPEC.DATA_MIGRATION | 迁移证据:expand/migrate/contract 各阶段执行记录与前后 schema 快照在座,校验通过,回滚面可执行 |
| business-acceptance.md | SPEC.BUSINESS_ACCEPTANCE | 验收证据:acceptance spec 的 Expected State 逐场景被证据覆盖,业务侧确认记录在座 |
| runtime-observability.md | SPEC.RUNTIME_OBSERVABILITY | 运行时证据:部署锚+log/metric/trace 登记面在目标环境可取回,关联 ID 贯通 |
| release.md | SPEC.RELEASE | 发布证据:制品 hash 可追溯,审批链完整,版本与回滚面对照交付登记 |

## 固定结构(§13.1 十七段)

顶层 13 段:Purpose / Subjects / Claims / Required Observations / Allowed Producers / Tool Bindings / Assertions / Required Artifacts / Retention / Exceptions / Activation Guidance / Ownership / Change Policy;
Assertions 段带四个判定词位:PASS / FAIL / UNKNOWN / NOT_RUN。

## 判卷四值词形(§13.1 闭包——禁发明第五值)

- PASS:要求条款逐条满足且证据资格成立——由 Verification Result / Gate Result 判定,Spec 文件不自填。
- FAIL:任一必需要求不满足或证据资格不成立(资格清单外/跨对象借证)。
- UNKNOWN:证据在座但不足以判定——诚实位,禁当 PASS。
- NOT_RUN:证据类型未被产出或范围显式不适用且例外已登记——显式缺席诚实位(证据不可得一律落本位),禁静默缺证当 PASS。

## 对象面衔接(B2 Evidence Spec 一等对象——gates 绑定登记级)

- 登记词形:SPEC.* governed id(21-evidence-spec kind profile:kind=business_rule + payload.spec_kind=evidence_spec 判别;词形随 PR-0008 在 vocab-lock prefixes_v0 闭包)。
- 登记通路:对应 store 对象由 init 步骤 4.7 预植(裁定批 D D2——kernel applyTransaction upsert_object 单事务,PROPOSED 起步,seed-once);此后对象演进归项目运行时 applyTransaction。requirements[].claim_refs/gate_refs 是资格清单——closeout 按资格判卷,资格外 claim/run 不满足条款。
- 文件↔对象绑定 = 登记级(本索引映射表 + 各 spec 头行词形),无第二套机器绑定机制(无消费者不加机制——对象面 requirements 已承载资格判定)。
- catalog gate recipe 零引用字段位:gate recipe 判卷走 03-gate-result 七态词表,与本 Kit 的衔接经由对象面 requirements.gate_refs,不新增词形不动 catalog。

## 生产/消费平面(PRD §3)

- claims:.pomaster/evidence/claims/(claim 禁自填 PASSED——经 Verification)。
- runs:.pomaster/evidence/runs/(一个 Run 文件即该次 observation 的 normalized receipt,不另设 receipt/result 同义件)。
- blobs:.pomaster/evidence/blobs/(raw artifact,优先内容寻址)。
- binding:claim → run_ids → blob_refs → task → governed_object → git_sha(稳定引用完成,不建独立目录)。
