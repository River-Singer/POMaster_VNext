# Kernel 公共 API 契约（docs/kernel-api.md）

> 状态：**契约级**。与 `packages/kernel/src/index.ts` 1:1 对应（签名/类型/语义三同）。
> 变更流程：改签名必须先改本文档并同 commit 同步源码；scaffold 阶段全部实现为 `not-implemented`，
> 各模块建造者在契约内实现，禁止先斩后奏。

## 0. 全局纪律（每个签名的设计前提）

| 纪律 | 含义 | 落点 |
|---|---|---|
| D24 哈希伦理 | digest/sha 仅读侧服务（identity / 短路重跑 / 防篡改抽验）；`write_blocking=false`；`human_touch=forbidden`（人永不计算/核对/传递哈希，store 事务自动维护）；违规处置 = WARN + auto-regen hint | `applyTransaction` / `loadTruthIndex` / 一切 `*Sha256`/`*Digest` 字段 |
| 门禁七态 + notApplicable | passed/failed/warning/blocked/not_run/not_configured/skipped_blindspot；`counts.notApplicable` 必填——缺席必须显式表达，禁止静默跳过当通过（C1） | `normalizeGateResult` / `GateCounts` |
| 幂等（A4） | 受 digest 管辖字段禁墙钟时间；新鲜度用单调 `seq`/`rev`；同输入重放 = 零写入（字节稳定），由 `inputsFingerprint` 相等短路 | `applyTransaction` / `compileProjection` |
| CLAIMED（C5） | 会话/工具陈述一律 `Claimed<T>`；落库必经 `applyTransaction` store 事务；永不信任自报值，判卷以重算为准（asserted/recomputed 孪生） | 全部写入入口与 `trust` 块 |
| 词表纪律 | 一切枚举/前缀/转移矩阵镜像 `packages/schemas/assets/vocab-lock.draft.yaml`（FROZEN），代码镜像点唯一在 `@pomaster/schemas`（vocab.ts）；词表外值=FATAL；新值走 `TODO(vocab-pr)` | 全文 |
| 报错带路标 | 失败输出必须包含 escalation hint（说清去哪修），禁止「报错不说去哪修」 | 各 FATAL 分支 |

## 1. Store 与事务

### `createStore(rootDir, options?) => Promise<Store>`

打开（或幂等初始化）store。约定布局：`<rootDir>/.pomaster/{state/truth-index.json, truth/objects/<kind-slug>/*.json, evidence/{runs,claims,blobs}/, runtime/producers/heartbeat.jsonl}`。
- 幂等：重复 open/init 零变化（No-op is elegant）；初始化只写骨架文件，不产生治理事实。
- `options.validateOnOpen`（默认 true）：打开已存在 store 时执行 schema 校验 + vocab 指纹对账。
- 失败语义：目录骨架不可创建/环境不支持原子替换 → `environment_error`（禁静默降级）。

### `loadTruthIndex(store) => Promise<TruthIndex>`

装载并校验信封层：01 schema（ajv draft-07，`strictSchema:false`，组合装载注册 05/06 绝对 `$id`）+ `vocab_lock` 三指纹对账（不一致=FATAL——D24 read_only_service 的 identity 抽验，非写阻断）+ REF_INTEGRITY 基础项。

### `applyTransaction(store, tx) => Promise<TransactionResult>`

**唯一写入路径**（CLAIMED 纪律：一切落库必经此处）。事务内自动维护：
- `seq`/`rev` 单调分配（A4，禁墙钟）；
- `body_sha256` / `content_digest` / `inputsFingerprint` 重算（D24：事务自动维护，永不阻断写入）；
- 同 inputs 重放 → `shortCircuited=true` 零写入短路（字节稳定，rev 不空转）；
- DENOMINATOR 删除请求 → FATAL 并引导 supersede（只许 supersede 不许删除，C2）；
- digest 失配/手改 → WARN + auto-regen hint（进 `digestWarnings`，永不 BLOCK）。
- **D-4 权威维度闸（2026-09-08，裁决 18——显式推翻裁决 11⑤/B3 warning-only）**：指纹短路后、ops 执行前校验 tx sources 对 ops 涉及对象/维度是否 authoritative，非权威 → `AUTHORITY_BOUNDARY_DENY`（确定性 BLOCK，事务零落盘零 journal）。判据三面：触及对象集（upsert primary + payload.affected_objects——T2 Task Contract 编译产出；transition id + 既有 payload.affected_objects）× 对象维度（authority owner 在 authority.json map 的 scope 申报）× 来源轴（payload.source_refs 引用在册 sources/index.yaml 来源的 non_authoritative_for 与对象维度相交）+ boundary_rules deny 规则 scope 命中对象维度。与 permit scope 闸正交互补（permit=谁可写哪些对象，kernel checkPermit 判卷函数承载、exec-guard 命令面在 harness 落笔前调用；authority=哪些来源可驱动哪些维度，本闸住 applyTransaction）。registry 损坏 → `SCHEMA_INVALID` fail-closed；registry 缺席 = opt-in 平面显式跳过（D2 语义）；owner/维度未申报 = 显式中立不构成 deny。
- 实现要求：staged 写入 + 失败回滚；清理路径不得凭存在性推断删除原件（staged-replace 事故教训）；提交前对事务产出复验 01 schema（op 层漏检在此拦截，失败 `SCHEMA_INVALID` 且零落盘，防 store 变砖）+ 重读 truth-index `generation.seq` 复核开卷世代（并发方已推进 → `CONCURRENT_WRITE_DETECTED` 拒绝提交）。journal 事件（TX_APPLIED 等）在正文/台账 staged 批提交成功后以 `appendLine` 原子追加——「index 先行、journal 缺行」为可检出残态（禁 RMW 覆写：会把并发 appendLine 家族刚写的整行抹掉）。

`TransactionOp` 判别联合：`upsert_object` / `transition_object` / `register_producer` / `heartbeat`（追加 runtime 侧车，不进 hash）/ `append_denominator` / `record_claim` / `record_gate_run` / `verify_claim`。

`verify_claim` op（W2 独立验证流判定回写；公开入口 `pomaster record verification`）：对既有 claim 施 VERIFIED 判定——UNVERIFIED→VERIFIED **单向一次性**（A3）。输入 `{clm, verifiedBy: Actor, evidenceRefs?, method?}`（method ∈ `VERIFICATION_METHOD_VALUES` 三值，07 verification_method structural 闭包）。只替换既有记录的 verification 块（`verdict/method/recomputed_by/at_seq` 键序沿 07 schema）、合并 `evidence_refs`（禁重复、空集拒绝）、推进 `rev`——其余字段逐字节保留（不重建 claim 形态，A1 收敛：分型共用 `typedEvidenceRef` 单点）；落盘后 subject `evidence_summary` 重算。守卫码位：`CLAIM_NOT_FOUND`（目标不在 claims 平面）/ `CLAIM_ALREADY_ADJUDICATED`（已判定——改判/回退不在本通道射程；CLI 公开入口先行以 NO_CHANGE exit 0 显式披露零写入）/ `VERIFICATION_EVIDENCE_EMPTY`（07 执行层规则：空 evidence_refs 的 verification 不得为 VERIFIED）/ `SCHEMA_INVALID`（损坏、身份键错位、引用重复）/ `VOCAB_INVALID_VALUE`（method 词表外）。D20 主体分离（recomputed_by ≠ asserted_by）归 doctor 探针 `claim_self_approval_clean` 检出——kernel 不验真主体（B3 warning-only 边界）。

## 2. 转移引擎

### `validateTransition("lifecycle", from, to) => TransitionOutcome`

纯函数。拓扑来自 `LIFECYCLE_TRANSITIONS`（vocab-lock FROZEN 镜像）：
`PROPOSED→CURRENT/REJECTED`（requires authority_approval）、`CURRENT→SUPERSEDED/DEPRECATED`（requires transition_record）、`DEPRECATED→RETIRED`（附加 grace_policy: config）、`SUPERSEDED/RETIRED/REJECTED` 终态（SUPERSEDED ⇒ successor_ref 必填）。
其余轴（confidence/evidence/change）v0.1 无矩阵；扩轴走词汇表 PR 后再扩签名（`TODO(vocab-pr)`）。
跨轴耦合断言（如 `change=MIGRATING` 必持 ACTIVE PERMIT、`evidence=VERIFIED ⇒ realization=wired`）归 `applyTransaction`/REF_INTEGRITY，不在此纯函数。

## 3. ID 解析与别名（A5 / A6）

### `parseGovernedId(id) => ParsedGovernedId`

closed-world 文法解析；未知前缀（`unknown_prefix`）或 SEGMENT/SEQ 文法违规（`grammar`）→ throw `GovernedIdParseError`（FATAL，无 WARNING 档）。前缀白名单 = `GOVERNED_ID_PREFIXES`（16 前缀——PR-0008（2026-09-04，vNext Batch 2 R1）append-only 增补 SPEC.）。

### `resolveAlias(spelling) => AliasResolution`

A6 rename-on-ingest 双向链：legacy→canonical（收编）与 canonical→legacy（考古）。镜像 `ALIASES_V0` 八族（v0.1 五族 + PR-0001 收编 `ISSUE.*`/`FTA-*`/`FB-*` 三族）；内置数字段规则 `TASK-0087→TASK.T0087`、`CHANGE-0104→CHANGE.C0104`（SEGMENT 不允许数字开头）；`PAGE-TASK-STEP-*` 走 token 重排；`ISSUE.*` 登记前缀点段剥离 + 段内连字符→下划线 greedy 打包（32 字符 SEGMENT 上限，段界可为打包伪迹）+ 末尾纯数字段→SEQ；`FTA-*`/`FB-*` 标记词并入首段（机械映射权威=`ingest_change_governance.py pack_segments` 移植）。别名数组 append-only（v0.1 五族只减不增，v0.2 起八族不可删改语义）。canonical→legacy 逆向：`CHANGE.*` 按首段 `FTA_`/`FB_` 前缀判别分流，多候选并列（`ISSUE.` 点形与 `CHANGE-` 横线形双候选；权威考古记录仍是对象 `aliases[]`）。结果仍须过 `parseGovernedId`（本函数不做 closed-world 裁决）。

## 4. Permit（八拍②五件套）

### `issuePermit(store, request) => Promise<Permit>` / `checkPermit(store, permitRef, attempt) => Promise<PermitCheckResult>` / `stealPermit(store, permitRef, by, reason) => Promise<StealResult>`

- `Permit.permitRef`：`PERMIT.*` —— 状态面台账键词形，词形登记于 vocab-lock `id_namespace.state_plane_refs`（PR-0001 文档化收编；非 governed 前缀，不入 prefixes_v0、不过 parseGovernedId，解析归台账存在性 + 显式四态 outcome；维持 general_id 宽松词形）。
- TTL 按事件拍计（禁墙钟，D2/A4）：`expiresAtSeq = currentSeq + ttlBeats`；缺省 `DEFAULT_TTL_BEATS = 168`（C9「TTL 168h」的拍数映射，标称 1 拍 ≈ 1 rebuild 拍）。
- `request.subjectIds` 与 `request.capabilityIds`（可选，八拍②五件套之二）均过 `parseGovernedId` closed-world 校验（A5：词表外前缀/文法违规 → throw `GovernanceError(FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR)`）。
- **P0.5-1 applicability 输入（可选）**：`PermitRequest.changeClass`（∈ `CATALOG_CHANGE_CLASS_VALUES`，vocab-pr-0005 词轴）/ `PermitRequest.governanceProfile`（∈ `CATALOG_GOVERNANCE_PROFILE_VALUES`，O2 对齐 TRIAGE_PROFILES+STRICT；A1 裁定 2026-09-04 后为**信息性申报位**——词表校验保留，不参与 `checkPermit` 判卷）。词表外 → `SCHEMA_INVALID`；签发落台账 `PermitRecord.change_class` / `governance_profile`（`null` = 未申报，缺席显式），`PERMIT_ISSUED` journal 事件同批携带。
- **签发落五件套台账**（state/permits.json，内部状态文件；公共契约类型 `Permit` 不变）：除既有的 scope/requested_by/change_ref 外，同时落 `capability_refs`（capabilityIds）、`acceptance_shape`（五件套之五——契约面 `PermitRequest.acceptanceShape` 既有但实现此前从不持久化，本字段封死「验收形状静默丢失」坑）与 `baseline`（issue 瞬间的逐对象基线快照 `{at_seq, subjects: {[id]: {axes, rev, body_sha256?} | null}}`——journal 是事件流无 axes 历史，issue 瞬间是唯一能拿到该基线的时刻，closure；`null` = 签发时对象尚不存在（PROPOSED 新对象的合法基线态）；`body_sha256` 为 D24 读侧 identity/content_drift 判定用途，事务自动捕获，人永不计算）。`PERMIT_ISSUED` journal 事件携带 `capability_ids`。
- `checkPermit` 显式四态：allowed / denied（outside_scope、policy_forbidden、delete_forbidden_supersede_only）/ expired / unknown_permit——禁止静默放行或静默拒绝。DENOMINATOR 的 delete 一律 denied。**写副作用披露**：outcome=expired 时追加 `PERMIT_EXPIRED_OBSERVED` journal 事件（「过期→事件，不静默」；同 seq 可重复多行，同 seq 去重收敛归后续 kernel PR）。
- `stealPermit`：D2——TTL 过期仅允许手动显式接管并记 journal 事件（actor/reason 留痕）；自动抢占被禁止；未过期 → `rejected_not_expired`；未知许可（含已 stolen）→ throw `PERMIT_NOT_FOUND`。
- scope expansion 拒绝静默放行 → 路由重审升级（D20，GOLDEN-L8-2）。
- CLI 命令面：`pomaster permit issue / check / steal / list` 与 `pomaster exec-guard`（八拍④写路径执行点，纯判卷器）——编排与呈现契约见 `docs/eight-beat-carriers-design.md` §1/§2；list/事件链对 `state/permits.json` / `state/journal.jsonl` 的直读仅限读呈现，写通道唯一保留给 kernel（分层纪律）。

## 5. 投影（八拍③）

### `compileProjection(store, request) => Promise<Projection>`

最小充分上下文投影。契约不变量（GOLDEN-L8-3 判据）：manifest 中与 task 无关的 `POLICY.` 条目 = 0；MUST/ADVISORY 分层可见且 ADVISORY 不进 gate 判卷输入；`inputsFingerprint` 保证同输入重放字节稳定。纯派生视图：不写 store、不产生治理事实。

**P0.5-1 结构化 applicability（PRD v0.5.2 §5.2-§5.4；vocab-pr-0005；裁决 8 ② 2026-09-01）**：

- `ProjectionRequest` 增可选输入 `capabilities`（CAPABILITY.* governed id）/ `changeClass`（∈ `CATALOG_CHANGE_CLASS_VALUES`）；词形 fail-closed 校验（词表外/文法违规 → `SCHEMA_INVALID` / `FATAL_UNKNOWN_PREFIX`）。全部 optional——既有调用零破坏。A1 裁定（2026-09-04）：不设 `governanceProfile` 输入——治理档位降信息性，不参与 catalog applicability 判卷。
- catalog 条目 `applies_when` 机器字段（`lanes`/`capabilities`/`change_classes`/`governance_profiles`/`object_kinds`/`applicability_note`；`risk_at_least`/`technologies` 留位不登记，消费面 not_configured 显式缺席）：未声明机器字段的条目 = lane 回退判定（现行行为逐字节不变，O7）；已声明 = 全字段确定性判定（声明轴全命中才注入；请求侧输入缺席 = 不可判定即不注入，缺席显式）。A1 裁定（2026-09-04）：`governance_profiles` 轴**判卷力解除**——不计入机器判定声明（仅声明该轴的条目按 lane 回退），轴保留为物料元数据，explain 决策面以 informational 注记披露（PR-0005/裁决 8② 不 supersede）。
- 新导出 `explainCatalogProjection(store, request, options?) => Promise<CatalogProjectionExplanation>`：catalog include/exclude 决策记录面（`why_included`/`why_excluded` 逐条 + `matched` 命中轴 + `fallback_lane`）。与 `compileProjection` 共享判定核（included 集与 `manifest.catalogEntries` 逐 ref 一致），但**不进 manifest、不进 `inputsFingerprint`**——excluded 不进 Agent Context（PRD §5.4：只用于 `pomaster context explain` / Audit / Eval / Debug）。
- CLI 面：`pomaster context compile --change/--capability/--change-class` 与新子命令 `pomaster context explain`（同旗标；`--profile` 旗标已按 A1 裁定删除；`pomaster triage` 命令已按 D-1/D-5 退役——裁决 18 2026-09-08，信息性判档呈现随档位语义一并退场）。

**R4/design-context baseline grounding（2026-09-12）**：`compileProjection` 可选 options 增 `baselineGrounding?: BaselineGroundingFacts`（类型化事实契约；生产端 = CLI `baseline-grounding.ts`，baseline confirmed 块/三态机/design-tokens 装载的词形解析独占在生产端，kernel 只做分区派生与指纹折算）。语义：

- **分区映射 ADR**：有效确认记录在座（confirmed/pending-change/drifted，ADR-16 三态机）→ 确认记录条目（ref `baseline/manifest.yaml#confirmed`）进 MUST（AUTHORITATIVE PROJECT STATE——已确认基线是权威项目状态锚；状态词如实携带，drifted 不冒充 confirmed）；state ∈ {absent, unconfirmed} → ADVISORY 注记（absent 时确认条目整体缺席——baselineGateErrors「manifest 缺席 → 门不适用」同边界）。design-tokens（R3）：origin=preset（未定制）→ ADVISORY 蓝图（Owner 确认前不构成项目事实）；origin ∈ {customized, owner} 且 facts.state=confirmed → MUST（确认后的项目设计事实）；absent/invalid → ADVISORY 诚实呈现（fail-closed 非静默当空表）。呈现粒度：确认元数据 + digest 摘要（一致/漂移清单），非 25 文件全文；tokens 九组清单 + UNKNOWN 键点径三态标注，值不搬运（`零值伪造` 结构性成立）。
- **指纹绑定（R2）**：facts 整体折进 `inputsFingerprint` 的 canonical 输入（确认态 + at_seq + 批/ack + 确认快照 + 现盘 25 确认资产 digest 快照——design-tokens.yaml 字节面随第 25 目标同源覆盖 + tokens 装载三态）。任一确认资产漂移/改型/确认动作 → 指纹必变 → `context compile --check` 按既有 STALE_GROUNDING 词形呈现（stale 不阻断——R4 呈现即可，阻断归 closeout `baselineGateErrors` 既有码位）。指纹机制沿既有 sha256OfCanonical 单点复用，零第二套哈希；options 缺席 = 指纹输入零键，既有调用方值域逐字节不变（回归钉：kernel projection.spec grounding describe + cli context-manifest.spec baseline grounding describe）。
- CLI 编排：`runContextCompile`（F4 单一编排权威）默认 compileProjection 依赖单点注入 grounding——显式命令 / maintain pre-dev 链 / judgeTaskContextFreshness 三通路同源继承；纯读零写入（零权威写口）。

## 6. Gate 归一（八拍⑤）

### `normalizeGateResult(raw: Claimed<unknown>, context) => GateResult`

把工具/Agent 的 CLAIMED 输出归一为 03-gate-result 形态：
- `tool`/`toolVersion`/`metricDialect` 三件套由 `context`（GateRunContext）承载，不归工具自报载荷——`assertRunContext` 强制校验：tool 非空、toolVersion 为 semver、metricDialect 为 1..128 字符口径声明，缺一/非法即 FATAL `SCHEMA_INVALID`（工具链计划「强制上报工具名+版本+度量口径」；kernel 不伪造口径）。三字段随 GateResult 契约承载并落盘 inline（03 `required` + 07 inline `$ref` 03）；
- verdict 词表外值 → FATAL（七态词表 `VERDICT_VALUES`）；
- `notApplicable` 缺失/NaN → FATAL（缺席必须显式表达）；
- `verdict=skipped_blindspot` 而 `counts.unchecked_in_blindspot_estimated` 缺失 → FATAL（03 schema「skipped_blindspot 判定必须附证据」；无指标的盲区跳过 = 静默跳过当通过的七态词形变体）；
- `verdict=passed` 而 `counts.violations > 0` 且无已声明失配可解释 → FATAL `GATE_COUNTS_INVALID`（载荷自身结构性矛盾；verdict_cap 只仲裁显式声明的 asserted/recomputed 双源失配故降级留痕，单源自相矛盾无从仲裁必须拒收——与 skipped_blindspot 缺盲区指标同一条「缺席/矛盾必须显式表达」线）；
- `subjectId` 前缀 `TEST.*` ⇔ `isFixture=true` 双向强校验（Q3）；
- `trust.asserted` 保留为 CLAIMED；`recomputed` 是判卷唯一依据；失配 → `mismatch.detected=true`（recomputed_wins_recorded / escalate_to_authority）；
- 本函数永不阻断写入；gate 的阻断语义由 closeout 编排层按 verdict 施加（写阻断与判卷分离）。

配套纯函数导出（G4/G6 证据入账通路复用；docs/eight-beat-carriers-design.md §4.5「形态完全
由 kernel 决定，CLI 不二次实现」）：`gateResultToSnake(result)`（GateResult → 03/07 snake_case
落盘结构，与 store.applyRecordGateRun 的组装逐键同构——CLI canonical 字节重放即用它组装）与
`sha256OfCanonical(value)`（canonical JSON 摘要——claim blob 引用重放需与 store.record_claim
同源同型）。二者均为既有内部纯函数的公共可见化，无新逻辑；D24：人永不计算哈希，sha 导出仅供
机器通路复用。

## 7. Doctor（D7 必检最小集五检）

### `doctorProbes(store) => Promise<DoctorReport>`

五探针（fail-closed，只读不修）：
1. `vocab_lock_consistency` —— 三指纹对账；
2. `dead_producers_empty` —— liveness=dead ⇒ DEFECT（经 heartbeat 对账重算，永不采信自报值，C5）；
3. `alias_conflicts_empty` —— 三重查重（canonical / normalized_key / 全部 alias）冲突非空即 DEFECT；
4. `local_binding_probe_replayable` —— LOCAL binding probe 可重放。
5. `claim_self_approval_clean` —— D20 反自批：扫描 evidence/claims/*.json，verdict=VERIFIED
   且 recomputed_by 与 asserted_by 主体相同（07 x-actor-discipline「同主体自填 VERIFIED 属
   违规，doctor 探针负责检出」的唯一消费点）非空即 DEFECT；claim 平面损坏同报 DEFECT（禁
   静默当 clean）。

探针三态 pass/defect/`environment_error`——单机本地盘假设破裂（os.replace/pid 判定失效）必须报 environment_error，禁静默（D 线风险备忘）。`ok` = 全 pass。

## 8. 错误约定小结

| 信号 | 语义 | 通道 |
|---|---|---|
| FATAL | 词表外值 / 未知前缀 / 非法迁移 / 幽灵 owner / DENOMINATOR 删除 / notApplicable 缺席 | throw（GovernedIdParseError 等）或显式 outcome |
| FATAL | 提交时世代复核失败（并发写检出）；证据记录 id 冲突禁覆写（record 通道） | throw GovernanceError（`CONCURRENT_WRITE_DETECTED` / `EVIDENCE_ALREADY_EXISTS`） |
| WARN + auto-regen hint | digest 失配/手改（D24 violation_treatment） | `TransactionResult.digestWarnings`，永不阻断 |
| 显式缺席 | 门禁 not_run/not_configured/skipped_blindspot；Permit expired/unknown_permit | 七态 verdict / PermitCheckResult outcome |
| CLAIMED | 一切自报值 | `Claimed<T>`，落库必经事务 |

## 9. 实现注记（kernel 建造者落地时的增量契约面；不改既有签名）

- **GovernanceError 体系（src/errors.ts）**：kernel 其余 FATAL 分支的统一错误通道，
  `code`（机器码位）/`hint`（修复路标，escalation 纪律）/`details` 三件套。码位全集见
  `GovernanceErrorCode`（FATAL_UNKNOWN_PREFIX / NOT_CONFIGURED / EVOLUTION_REQUIRED /
  PERMIT_EXPIRED / DENOMINATOR_DELETE_FORBIDDEN / SOURCE_TYPE_FORBIDDEN /
  CROSS_AXIS_ASSERTION / TRANSITION_ILLEGAL / VOCAB_MISMATCH 等）；其中
  PERMIT_EXPIRED / PERMIT_SCOPE_DENIED / DENOMINATOR_DELETE_FORBIDDEN 为「outcome 通道
  的 throw 语义同义码位」（PermitCheckResult / GovernedIdParseError 是 canonical 表达，
  CLI 层可据此翻译为退出码）。
- **store 内部状态文件**（契约布局之外的 kernel 内部 detail，均不进 hash）：
  `state/authority.json`（Authority Map，BOOTSTRAP 登记 owner；幽灵 owner=FATAL 的解析源）、
  `state/permits.json`（许可台账，含 stolen 标记留档与五件套扩展字段
  `capability_refs` / `acceptance_shape` / `baseline`——CLI `permit list` / `issue`
  回读呈现直读该文件，故本文件构成对 CLI 呈现层的隐性契约：kernel 改其字段须同步
  CLI 呈现层，防字段演进静默破坏 list）、`state/journal.jsonl`
  （TX_APPLIED / PERMIT_ISSUED（带 capability_ids）/ PERMIT_EXPIRED_OBSERVED /
  PERMIT_STOLEN 事件流）。台账/journal 损坏 → `SCHEMA_INVALID`（readPermitsFile /
  readJournalLines 透传给 CLI 信封）。
- **幂等语义细化**：同 inputs 重放（inputs_fingerprint 相等）或零有效变化（同内容
  重写）→ `shortCircuited=true` 零写入（字节稳定，seq/rev 不空转，GOLDEN-L8-4）；
  auto-regen（D24 digest 修正）算有效变化，正常分配 seq 并留 journal 痕迹。
- **跨轴断言归 applyTransaction**：MIGRATING⇒permits_active 非空、
  PROPOSED/REJECTED⇒evidence=PLANNED、LOCKED+STABLE→CHALLENGED⇒authorityRef
  （EVOLUTION_REQUIRED）；转移矩阵仅在 lifecycle 实际变更时裁决（纯 confidence/
  evidence/change 补丁不触发自环误判）。upsert_object 对既有对象直改 lifecycle
  同受转移矩阵裁决与 requires 的 authorityRef 要求（upsert 不豁免；SUPERSEDED→CURRENT
  复活支线在 upsert 通道同样 TRANSITION_ILLEGAL 封死）。
- **alias 收编的机械/数据面分界（GOLDEN-AX-04）**：GRID.*、TASK-*、CHANGE-*、ISSUE.*、
  FTA-*、FB-* 六族
  mechanical=true（kernel 直接给出 canonical，双向链机械可逆；PR-0001 三新族逆向为多候选
  并列）；KB 点分形态与
  PAGE-TASK-STEP-* / PAGE-APP-* 的重排 mechanical=false——resolveAlias 返回
  `matchedRuleLegacy`（家族命中）但 `canonical=null`，映射随对象 aliases[] 数据面登记。
- **GateResult 三件套（P12a 已落地）**：03 要求的 tool/tool_version/metric_dialect 现由
  kernel `GateResult` 契约承载（经 `GateRunContext` 注入，强制上报 + 不伪造口径），run 文件
  落盘 inline 保留（与 07 inline `$ref` 03 对齐）。CLI ingest 归一上下文优先级：tool/tool_version
  = 显式覆盖 > tool_snapshot > 内嵌 > 诚实缺省 pomaster-cli/CLI_VERSION（CLI 即入账工具）；
  metric_dialect = 显式覆盖 > tool_snapshot > 内嵌 > 缺席 fail-closed（度量口径是原始测量属性，
  CLI 未参与测量无诚实缺省）。存量 pre-canonical 超集 `tool_snapshot` 块收编时折叠入内嵌三字段，
  不另存第二套格式；`items[]` 违规明细仍不属 kernel GateResult v0 契约（独立缺口）。
- **doctor 辅助导出**：`probeToolEnvironment(projectRoot)`（node/pnpm/git/gitHubCli →
  READY|NOT_INSTALLED；.mcp.json chrome-devtools → MISSING_CONFIGURATION+安装提示；
  src 引用 TEST.* → 违规探针）为契约五检之外的超集，供 CLI `pomaster doctor` 消费。

## 10. Reconcile（八拍⑥；delta/例外/抽样三段报告）

### `reconcilePermit(store, permitRef, options?) => Promise<ReconcileReport>`

- **纯读零写**：报告生成不产生治理事实、不落任何文件；同 store state + 同参数重放输出
  字节稳定（A4：stride 抽样确定、零墙钟、一切序号锚定 seq/rev）。`clean=true` 是 ⑥ 拍
  零审阅负担的合法出口（不是跳过）。
- **基线 closure（§4 台账扩展）**：基线快照在 permit issue 瞬间存入 `PermitRecord.baseline`
  （journal 是事件流无 axes 历史，事后不可重建）；reconcile 只读不重建。
  `baseline_missing=true`（本特性之前签发的旧形态许可）→ 显式 fail（CLI 翻译为
  `RECONCILE_BASELINE_MISSING`），delta 段不可计算故为空——不能拿「没有基线」冒充
  「无变化」（not_configured ≠ passed 的 ⑥ 拍镜像）。
- **`changed_objects`**（仅 permit 范围内 subject，按 id 字典序）：`kind` 词形
  `axes_change`（四轴任一 from≠to；axes 只列变化轴）/ `materialized`（签发时 absent、
  现已存在）/ `vanished`（签发时存在、现已消失——含索引行仍在但正文文件缺失的 REF
  异常形态，A1 成对纪律，必 fail）/ `content_drift`（四轴未变而 body_sha256 变化——
  静默漂移显式打捞）。`content_drift` 字段三态：`true` / `false`（对 kernel 维护的行
  结构不可达：sha 覆盖内嵌 rev）/ `null`（基线无 sha 锚或对象 absent——显式未知，
  不冒充「无漂移」）。kind 词形已随 vocab-lock v0.2 `presentation_axes.reconcile_delta_kinds`
  登记（PR-0001；`content_drift` 一词二用的成文收编）；其中 `content_drift`
  词形是设计 §3.2 三值之外的第 4 词形，承载其自身 `content_drift=true` 状态所需的宿主
  （不冒用 `axes_change`——其定义明确要求四轴任一 from≠to）。N6 机判字段
  `drift_origin`（仅 `kind=content_drift` 条目在场，其余 kind 键不落盘）：content_drift
  一词二用（合法事务 payload 变更 vs 越权静默漂移）由 journal 台账对账消解——
  `transaction` = rev 推进可被事务台账解释（baseline 之后存在 TX_APPLIED 事件，事件
  ops 含 rev 推进 op（`upsert_object`/`transition_object`）且 changed_object_ids 含该
  对象）；`unexplained` = 台账无解释（rev 未动而内容变的 sweep auto-regen 行锚同步
  形态、或 rev 动了但找不到解释事务）→ 该条目**原样升格**计入 `exceptions` 人审队列
  （clean 语义不变——升格不新增 fail 面，changed_objects 已 fail）。对账纯读（只扫
  journal 追加流，零写入，收集为集合与行序无关）；词形闭包
  `transaction|unexplained` 为 reconcile 报告呈现层局部词（kernel
  `RECONCILE_DRIFT_ORIGINS`），TODO(vocab-pr-0002) 登记进 vocab-lock
  `presentation_axes`。
- **`exceptions`**：scope 内 subject 的证据平面扫描；runs 取 verdict ∈
  {failed, not_configured, skipped_blindspot}，claims 取 verification.verdict = REJECTED；
  row 级正文探测的 `content_tamper` 条目亦计入本段（见下）；N6 `drift_origin=unexplained`
  的 `content_drift` 条目**原样升格**为本段第三类构成（同一行双呈现：changed_objects 保
  delta 分母完整、本段入人审队列；判别走字段位 `drift_origin`，不发明新例外 kind 词）。
  段内序固定字节稳定：证据例外（evidence_ref 序）→ `content_tamper`（探测分母 id 序）→
  unexplained 升格条目（scope id 序）。证据平面损坏（*.json 无法解析 / verdict 缺失）→
  throw `SCHEMA_INVALID`（禁静默跳过损坏证据）；run 文件兼容 kernel canonical
  （gate_result.result 内嵌）与 pre-canonical 夹具（GateResult 直落顶层）两形态——与
  compact 收编读取规则同一条线。
- **`verdict_census`**：证据平面全量 verdict 计数（含例外条目与 scope 外条目——聚合
  不吞没，不进例外段 ≠ 不可见）；键字典序输出，字节稳定。
- **`samples_to_review`**：scope 内全部证据条目（runs+claims 合并）按 evidence_ref
  字典序排列后等距步长抽样（`floor(i×total/N)`，i=0..N-1；total ≤ N 全取）；N=
  `options.samples` 缺省 3，0 = 显式放弃抽样（不静默）；非 ≥0 整数 → `SCHEMA_INVALID`。
- **row 级正文探测（N1 盲区收窄）**：对「抽中样本的 subject ∪ `changed_objects`」（恒在
  permit scope 内）读正文文件重算内容指纹（`sha256OfCanonical`，与写路径
  `applyTransaction.sweepDigestTampering` 同源同型），与索引行 `bodySha256` 对账。失配即
  「只手改正文、不碰索引行」的篡改实锤（该篡改对 baseline↔行的双索引锚 delta 不可见，
  原先要等下一次事务的 row 级抽验才暴露），以 `kind=content_tamper` 例外条目
  （`subject_id` / `body_ref` / `index_sha256` / `body_sha256`；词形登记于 vocab-lock
  `presentation_axes.reconcile_exception_kinds`（PR-0001），不冒用七态 verdict）追加在证据例外之后（subject_id 字典序）计入
  `exceptions`，并使 `clean=false`。探测纯读只报不修不拦写（D24：告警不拦写；写侧
  auto-regen 仍归事务双轨）。成本边界：只探分母内对象，不全库扫（全库 sweep 仍是写路径
  事务的职责）；正文文件缺失由 `vanished` 承载（探测不越界重复报）；正文无法解析 →
  throw `SCHEMA_INVALID`（禁静默跳过损坏正文）；`baseline_missing` 路径 delta 分母不
  成立，探测不跑（行为同旧形态）。
- **fail-closed 出口语义（CLI 翻译为退出码，设计 §3.5）**：clean 且基线在场 →
  ok/exit 0；有 delta/例外/vanished → `RECONCILE_DIRTY` exit 1（人须审，机器不代审
  不代决）；baseline 缺失 → `RECONCILE_BASELINE_MISSING` exit 1；许可不存在 → throw
  `PERMIT_NOT_FOUND`。stolen 许可仍可 reconcile（纯读审计；接管事件在 journal 留痕）。
- CLI 命令面：`pomaster reconcile --permit <PERMIT.*> [--samples <n>]`（八拍⑥）——
  编排与呈现契约见 `docs/eight-beat-carriers-design.md` §3；报告 snake_case 形态由
  kernel 直接产出，CLI 逐字渲染不二次映射。

## 11. Discovery 状态链（P18 · PRD §80.3 Ephemeral Discovery）

### `validateDiscoveryTransition(from, to) => DiscoveryChainOutcome`（纯函数）

- **状态链（PRD §80.3 原文词形）**：`IDEA → DISCOVERY → READY_TO_PROMOTE → CHANGE/TASK`；
  拓扑唯一来源 `DISCOVERY_CHAIN_TRANSITIONS`（@pomaster/schemas，逐值镜像
  `08-discovery-state-chain` x-pomaster-transition-matrix）。Discovery 状态链是**新状态面**
  （Discovery 讨论生命周期），与 `state_axes.lifecycle`（PROPOSED/CURRENT/…，FROZEN）
  正交、值域不相交、禁止互转互填；词轴待词汇表 PR 收编（TODO(vocab-pr)，镜像点
  schemas/vocab.ts「待收编」段）。
- **矩阵**：IDEA→[DISCOVERY]；DISCOVERY→[READY_TO_PROMOTE]；READY_TO_PROMOTE→[CHANGE, TASK]；
  CHANGE/TASK 终态（to: []）。矩阵外（跳步/倒退/自环）不 throw——返回 `allowed:false`
  显式拒绝（fail-closed，reason + hint 路标，与 lifecycle 引擎同构；词形集独立）。
- **提升边**：READY_TO_PROMOTE→CHANGE/TASK `requires ["promotion_basis"]`
  （PRD §80.3 四条晋升条件任一满足，词形见 `DISCOVERY_PROMOTION_BASIS_VALUES`），
  `promoteEdge=true`，notes 携带晋升条件与 **P11 maintain 面**路标——提升写入必须走
  P11 maintain 面（受控写入唯一面），Discovery 层不私造第二写入通道；本原语只判定，
  不落盘、不写入。
- **schema 载体**：`08-discovery-state-chain`（状态链记录 + 转移矩阵 + promotion_basis）、
  `09-msd-uncertainty`（§82 十分类 / 防幻觉八问 / assumption_risk / blueprint envelope /
  msd_assessment——promotion_basis=msd_reached 的判据面）、`10-research-artifact`
  （§81.6 四文件 + §81.4 finding 六字段 + handoff 三件）三份 schema 随 @pomaster/schemas
  分发（allSchemas 7→10）。

## 12. Question Gate 与 Research 契约判卷（P18 · PRD §80.4/80.5/80.7 + §81.3/81.4/82.5）

### `evaluateQuestionGate(input) => QuestionGateOutcome`（纯函数）

- **七关（§80.4 原文行序，不跳关）**：Q1 Current Truth / Q2 Existing Docs/BP/Prototype /
  Q3 Repo/Code/OpenAPI / Q4 Existing Evidence / Q5 Knowledge 低风险默认 / Q6 Research /
  Q7 不回答是否真的阻塞当前 Increment。`answerable` 七键由调用方提供（本模块是判卷器
  不是检索器）；首个命中关决定处置：Q1-Q5→`DERIVABLE`、Q6→`RESEARCHABLE`（Research-first
  §80.6）、Q7 不阻塞→`DEFERABLE`。
- **ASK_HUMAN 双闸**：七关全过 **且** 申报分类 ∈ `ASKABLE_CATEGORIES`
  （BLOCKING_AUTHORITY/PREFERENCE，§80.4「只能主动问」）才 `ASK_HUMAN`；
  分类 ∉ 可问类 → `ASK_REJECTED`（矛盾显式拒绝，绝不静默放行）。
- **对账信号**：`declaredConsistent` = 申报分类与七关重算一致——判卷以七关重算为准（C5），
  申报值只是对账对象，不替代重算。
- 词形五分类（QUESTION_GATE_CATEGORIES）与七关问句逐字冻结于本模块常量；词轴待词汇表
  PR 收编（TODO(vocab-pr)）。

### `selectNextQuestion(queue) => OneQuestionOutcome`（纯函数）

- **One-question-at-a-time（§80.5）**：一次只返回价值最高的一个问题。`priority` 是机械
  序号 1-5（PRD 原文五条描述句逐字挂 `QUESTION_PRIORITY_DESCRIPTIONS`——序号化不发明
  词形）；同优先级稳定排序，零墙钟（A4）。
- **fail-closed**：队列混入未过闸问题（`gateVerdict !== "ASK_HUMAN"`）或优先级词形外值
  → 整批显式拒绝（不静默吞问题）；空队列 `next: null`（显式 NONE）。

### `evaluateConvergencePartition(partition) => ConvergenceOutcome`（纯函数）

- **Diverge→Converge（§80.7）**：三区 `current_increment` / `future_considerations` /
  `out_of_scope`（原文 yaml 逐键）必须显式存在（缺席 fail；空数组合法）；分区互斥——
  同一 statement 跨区重复 = fail（`future_considerations ∩ current_increment` 是
  「Future 偷进当前范围」的直接违例形态）；`future_considerations` 非空时 notes 携带
  「不得自动进入当前实现范围」原文路标。

### `checkResearchWriteContract(hostRef, targetPath) => ResearchWriteContractOutcome`（纯函数）

- **Read-only Contract（§81.3）写面判卷**：申报路径必须落在 `<host>/research/**` 内；
  判定顺序 portability（盘符/绝对/反斜杠/`..` 逃逸 → `path_not_portable`）→ 受治理面
  （`.pomaster/state|truth|objects|policies|evidence/` → `governed_surface`——Evidence
  Pack 合法入账走 record 通路，文件直写=旁路）→ 宿主面（`outside_research_dir`）。
  一切 `allowed:false` 携带 `fatal:true`——**越写即 FATAL**（wave3-plan P18 出口判据），
  CLI 层据此 exit 1。
- **分级**：research/ 下首段 ∈ 四文件名（`RESEARCH_ARTIFACT_FILES`，§81.6 逐字镜像
  10-research-artifact）→ `artifact_file`；其余 → `scratch`（§81.3 写 research/**
  允许，notes 提示正式产物寻址契约是四文件）。

### `adjudicateResearchFindings(findings) => FindingsAdjudicationReport`（纯函数）

- **五级 Evidence 判卷语义（§81.4）**：`evidence_type`/`confidence`/`authority_effect`
  词形独立重算（C5：schema 之外第二道闸）——词表外 violation。
- **§81.5 Existence ≠ Correctness ≠ Authority**：`CONFLICTS` → escalation（冲突是发现
  不是裁决——上报正式治理面，绝不自动改 Authority）；`IMPLEMENTATION`+`SUPPORTS` 且
  caveats 未记录对账 → 降信 warning（对账记录形态 PRD 未定义，只提示不阻断、不发明）。

### `evaluateBlueprintEnvelope(input) => BlueprintEnvelopeAdjudication`（纯函数）

- **§82.5 聚合规则**（09 顶层 allOf 同源重算）：`unknowns` 含 HARD_BLOCKER ⇒ status
  不得为 ACCEPTED/CONDITIONALLY_ACCEPTED。
- **CONDITIONALLY_ACCEPTED 七条前提**：a（goal_defined）/b（scope_defined）/
  c（HARD_BLOCKER=0）/d（assumptions 显式记录）/f（acceptance_verifiable）机器判
  PASS/FAIL；e（Deferred 不被偷实现）/g（可回滚或风险被接受）显式 `NOT_MACHINE_CHECKABLE`
  ——不冒充已查（C1 缺席显式纪律）。MSD 面（msd_assessment）缺失 → a/b/f FAIL。
- **msd_reached 双向派生一致**：与三轴派生不一致 → 整体 fail（09 allOf 双向强制）。
  BLOCKED/REJECTED 不触发前提核查（逐条 SKIPPED 显式呈现）。

---

## 13. D 线地基：Sessions / Locks / Execution Identity（P20 · PRD §25.3/§25.4 + D 线 §1/§2/§3.3）

> 范围锚：wave3-plan.md P20（D 线 §7 P0 清单①②；R2 重分类：**P0=地基，P1=池**——
> DEF-SUP 严格留 P1）。三原语是 Task 层并发地基：会话/锁住 runtime 侧车（易变态，
> 墙钟合法位——GOLDEN-L1-WALLCLOCK 判词「人类时间只住 evidence/runtime 侧车」）；
> 执行身份住 `executions/` 正式档案（进 Git）。事件留痕统一走 `state/journal.jsonl`
> （A4 seq 采样，无墙钟）。确定性由各输入的 `now` 注入点保障（基础设施盖章语义，
> 非会话自报）。

### 会话（`packages/kernel/src/session.ts`）

- `attachSession(store, input) => Promise<SessionAttachOutcome>` —— 注册/刷新会话
  （D 线 §3.1）。首注册 journal `SESSION_ATTACHED`；刷新 = 心跳语义零事件；
  `resumed_task` 回带既有任务指针；`session_key + harness` 成对纪律。
- `refreshSession(store, sessionKey, now?)` —— 心跳顺手刷新 `last_seen_at`；
  未注册会话 `SESSION_NOT_FOUND`（禁静默重建——重建会洗掉 held_locks/current_task）。
- `readSessionRecord(paths, key)` / `listSessionRecords(paths, now?)` /
  `judgeSessionLiveness(record, now)` —— 清单 = 记录 + liveness 判定并排（显式可见
  非隐式）；stale = 超过 ttl_seconds（缺省 900，D 线例文逐字）。
- 词形：`SESSION_KEY_PATTERN`（D 线例文 `claude_9f3ab2c1` + 子代理后缀 `.sa1`）；
  路径 `SESSIONS_RELATIVE = .pomaster/runtime/sessions`（D 线 §1.3 逐字）。

### 锁（`packages/kernel/src/locks.ts`）

- `acquireLock(store, input) => Promise<LockAcquireOutcome>` —— 三粒度
  `change | task | unit`（D 线 §3.3.1 表；unit 锁 lock_type=unit_write 例文逐字，
  change/task 该字段原文缺位留 null 不发明）。原子独占创建（tmp + link 语义——
  D 线「避免读-改-写竞态」的机制意图；rename 会覆写既有锁故取独占 link 落法）。
  blocked 显式回带持有者快照 + holder_liveness + stale_reason；**acquire 永不自动
  抢占**（D2：自动抢占掩盖协调问题）。持有人必须已 attach；execution_id 在场时过
  档案存在性校验（不接悬空引用）。
- `heartbeatLock(store, lockId, sessionKey, now?)` / `releaseLock(store, lockId, sessionKey)`
  —— 仅持有人（`LOCK_NOT_HELD` 显式拒绝）；释放删文件 + journal `LOCK_RELEASED`。
- `stealLock(store, input) => Promise<{stolen, lock, previous_holder}>` —— 抢占仪式：
  reason 非空必填（D2 硬性要求）；fence 单调 +1（旧持有者迟写因 fence 过期被拒）；
  journal `LOCK_STOLEN`；原持有人 execution 封口 interrupted（D 线 §3.3.1「使原
  execution 以 interrupted 结束」；档案缺失容忍，`EXECUTION_INTERRUPTED` 事件仍留痕）。
- `checkLockFence(paths, lockId, fence)` —— 写闸消费原语：valid / stale_fence /
  unknown_lock 显式三态（hook 接线归 P21）。
- `listLocks(paths, now?)` / `readLockRecord(paths, lockId)` / `judgeLockStaleness`
  —— stale 判定两支（§3.3.1 逐字）：heartbeat 过期 **或** holder.pid 不存在；清单
  纯读零写。
- journal 事件族：`LOCK_ACQUIRED / LOCK_RELEASED / LOCK_STOLEN / LOCK_STALE_OBSERVED`
  （A4 seq 采样；`LOCK_STALE_OBSERVED` 镜像 `PERMIT_EXPIRED_OBSERVED` 先例）。

### 执行身份（`packages/kernel/src/execution.ts`）

- `beginExecution(store, input) => Promise<ExecutionRecord>` —— AGX 词形
  （`^AGX-[0-9]{4}-[0-9]+$`；PRD §25.4 例文 AGX-2026-00182）；缺省分配 =
  现有最大序号 +1（5 位零填充，年段取当前日历年——标识符铸造位，非新鲜度判定）；
  同号唯一（`EXECUTION_ALREADY_EXISTS`）；词表三轴 role/runtime/identity_kind 闭包
  （`VOCAB_INVALID_VALUE`）；session_key 在场须已 attach 且与 harness 成对。
- `endExecution(store, executionId, input?)` —— 封口置 ended_at + journal
  `EXECUTION_ENDED`；重复封口 `EXECUTION_ALREADY_ENDED`（显式拒绝）。
- `assertExecutionAttachable(paths, executionId)` —— record 通路挂载校验：词形
  `SCHEMA_INVALID` + 档案存在性 `EXECUTION_NOT_FOUND`（S1 禁自造身份）；已封口执行
  允许事后补录（ended_at 如实在场，不伪造时间围栏）。
- 档案闭形态 16 键（镜像 D 线 §2.1 JSON 例文：execution_id/schema/
  pomaster.execution/v1、identity_kind、session_key+harness、role、runtime、
  policy_lock、permit_ids、task_id/change_id、context_manifest_id（PRD §25.4
  context_hash 的 solo 降级，直连如实 null）、model、started_at/ended_at、notes）；
  缺席 = null 显式（C1）。
- journal 事件族：`EXECUTION_BEGUN / EXECUTION_ENDED / EXECUTION_INTERRUPTED`。

### execution_id 贯穿证据链（record 通路透传；decisions 裁定）

- **schema 兼容裁定**：07 evidence 记录（run_record/claim_record）新增**可选**
  `execution_id`（pattern 同上；存量记录零迁移）——**缺席 = 键缺席**（与存量字节
  兼容，canonical 幂等不破，不伪造 null 占位）；**携带即 kernel 侧强制校验**
  （`store.applyRecordGateRun` / `applyRecordClaim`：词形 + executions/ 档案存在性，
  S1 禁自造身份）。新记录不强制携带：compact 批量收编与 check 下游消费不因身份
  缺席而拒（证据平面先收编后富化）；环境身份盖章（任意命令自动 begin + 自动随附）
  归 P21 Runtime Adapter 面（DEF-GATEKEEPER 触发观测在该面消费本原语）。
- 通路：`GateRunRecordInput.executionId?` / `ClaimRecordInput.executionId?`（kernel op）
  → GRN/CLM 文件 `execution_id` 键（canonical 键序位：run 在 trigger 之后、claim 在
  clm 之后；CLI `canonicalRunBytes`/`canonicalClaimBytes` 逐键同构）+ CLI 信封
  `execution_id` 回读；CLI `record gate-run/claim --execution-id <AGX-n>` 显式覆盖
  优先于文件自报。compact 收编对已带身份文件 already_canonical 零剥字段。

### D 线地基 CLI 命令面（P20-Commands；§44.8 注记状态裁定）

- `session attach/refresh/list`（§1.2/§3.1 词形）——attach 首注册 `CREATED` /
  既有 `REFRESHED`，`resumed_task` 回带既有任务指针（resume 探测）；refresh 心跳
  零事件；list 记录 + liveness 并排。`--session-key/--harness` 必填；`--task/--ttl/
  --meta k=v` 可选。
- `lock acquire/heartbeat/release/steal/list`（§3.3.1 词形：`lock steal <lock>
  --reason` 逐字）——acquire `ACQUIRED` exit 0；`blocked` **exit 1 + `LOCK_BLOCKED`**
  且回带持有者快照/`holder_liveness`/`stale_reason`（判卷语义对齐 permit check
  「非 allow 一律 exit 1」先例；acquire 永不自动抢占，D2）；steal 仪式 fence+1 +
  原持有人 execution 封口 interrupted；list 记录 + liveness 并排。
- `execution begin/end/list`（§25.4）——AGX-n 缺省分配；词表三轴闭包
  （`VOCAB_INVALID_VALUE`）；`--session-key` 须已 attach 且与 `--harness` 成对；
  end 重复封口 `EXECUTION_ALREADY_ENDED`；list 呈现两态 `active | ended`
  （interrupted 状态归 journal 面查询）。`execution audit`（09-11 变更越界审计，
  Detection 半边）——`--execution-id + --diff-base`：git diff 起始锚变更集 →
  KEYBINDING 解析 → permit scope 判 in/out → OBS 回执 sidecar + 越界明细
  （越界 exit 1；纯读 + sidecar 零权威写口；非 git 工作区/锚缺席或无效
  fail-closed 零落盘）。
- **墙钟注入点不进 CLI 面**：`now`/`startedAt` 是基础设施盖章语义（argv 申报即
  会话自报，D 线 S1）；测试确定性走 kernel API 直调。`pathsOf`/`StorePaths` 随本批
  公共化（清单函数消费面）。
- §44.8 三命令裁定（decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md）：
  `agents status` **兑现** = solo 运行时观测面（下节）；`run`/`handoff` **显式
  deferred**——注册命令面 + 执行恒 `COMMAND_DEFERRED` exit 1 + P21 指路 hint
  （「不静默缺席」；AgentRuntime 归 wave3-plan P21，回填记录 MECHANISM_GAP 类
  落 docs/ 本地档）。

### DEF-GATEKEEPER 触发观测器（`packages/kernel/src/gatekeeper.ts`）

- `detectGatekeeperDrift(store, input?) => GatekeeperDriftReport`（纯函数式聚合，
  纯读零写入）。D 线 §5 逐字锚：「同一 execution 既提 proposal 又 ALLOW ≥N 次/周」。
- **对位裁定**（D 线原文 proposal/ALLOW 在 P0 证据面无逐字载体，取最近对位不发明
  新面）：「提 proposal」↔ CLM（record 通道恒 UNVERIFIED 的提案性断言）；「ALLOW」↔
  GRN `verdict=passed`（七态唯一判卷放行词形）。P21 若落独立 Proposal 载体则扩展。
- **触发语义**：`min(proposal_count, allow_count) >= threshold`；`threshold` 缺省 1
  （N 原文未定值 → 最严观测，宁严不漏）；`windowDays` 缺省 7（「次/周」逐字窗宽）。
- **周窗锚**：证据记录只带 seq 不带墙钟（A4）→ 以 execution 档案 `started_at` 为
  窗锚（evidence/runtime 墙钟合法位）；档案缺失 = `in_window=true` 宁严不漏 +
  `execution_started_at: null` 显式。
- **纪律**：分母只收携带 `execution_id` 键的 GRN/CLM 词形文件（缺席不伪造）；损坏
  证据 `SCHEMA_INVALID` fail-closed（观测面静默损坏 = 假绿）；`execution_id` 词形
  漂移 `SCHEMA_INVALID`（手改痕迹显性暴露）。
- CLI 呈现位：`agents status` 的 `gatekeeper_drift` 段；`triggered=true` → warning
  `GATEKEEPER_DRIFT_OBSERVED`（观测不施断——触发处置是 P1-P2 升级裁定，呈报 Owner）。

## 14. Runtime Adapter 契约与 Capability Pool（P21-Contract · PRD §25.1/§25.2/§58 + §24 + D 线 §5）

> 范围锚：wave3-plan.md P21（§58 四条降级规则 + §25.3 十二角色词汇 + D 线 §5
> DEF-SUP 触发制；R2 重分类「P0=地基，P1=池」）。**本节是契约与判定面**——
> 不实现任何真实 runtime、**不建 daemon**（PRD grep "daemon" 0 命中；Supervisor
> 是 §25.3 角色不是进程；托管编排是 DEF-SUP 触发制的 P1+ 形态）。全部纯函数
> 零 IO 零墙钟（同输入重放 deep equal，A4）。

### Runtime Adapter 契约（`packages/kernel/src/runtime-adapter.ts`）

- `AgentRuntime` interface（§58 方法名逐字）：`spawn(role, context, permissions)` /
  `send(handle, packet)` / `wait(handle)` / `cancel(handle)` + 三探针
  `supportsParallel()` / `supportsToolPermissions()` / `supportsContextIsolation()`。
  这是外部 Runtime Adapter 的实现契约；kernel 判定面只消费三探针
  （`RuntimeCapabilityProbe`）。字段形状最小化（PRD 只给方法名——不发明富字段）；
  `role` 形参即 Capability Pool 十二角色词汇（词汇层消费位）。
- `probeRuntimeCapabilities(runtime)` —— 能力探测：三方法各调用一次并结构化；
  非布尔返回 `SCHEMA_INVALID`（探测不出不得静默洗成「支持」）。
- **「不支持多 Agent」判定裁定**（decisions）：`isMultiAgentCapable` =
  `supportsParallel ∧ supportsContextIsolation`（§58 将并发与上下文隔离并列为多
  Agent 的两个能力面）；`tool_permissions` 是 §25.1 适配器职责面而非「多 Agent 性」
  判据——缺席如实进降级报告 rows，但不触发 sequential 回退。
- **§58 四条降级规则逐条**（`evaluateCapabilityDegradation` 的 `rules_applied`
  四位逐条可测）：① `sequential_fallback` ② `context_recompile_per_role` 在
  !multi-agent 时成立；③ `no_concurrency_masquerade` **恒 true**（契约封条非条件
  行为）；④ `capability_degradation_report` 在 degraded 时成立（报告本体即兑现）。
  报告逐能力行呈现 `capability / supported / affected_rules`（缺席显式，C1）。
- `planRoleExecution({capabilities, roles, directExecution?})` —— 角色执行计划
  三形态：`direct`（§25.2 MINIMAL 主 Harness 直接执行——零 spawn 步、零重编译、
  **零降级报告**：solo 默认运行形态不变的零开销锚）/ `parallel`（探针合取成立；
  每角色 spawn + 独立上下文 §24）/ `sequential`（降级：每角色先重编译上下文再
  顺序执行、spawnRequired=false、降级报告必附）。roles 过 §25.3 十二角色闭包
  （`VOCAB_INVALID_VALUE`）；空 roles `SCHEMA_INVALID`。**mode 是派生值**——
  调用方无字段位可宣称并发。
- **伪装并发封条（规则③，MAJOR 级语义）**：`assertHonestConcurrency(plan,
  claimsConcurrency)`——申报 concurrent 而 mode 非 parallel →
  `RUNTIME_CONCURRENCY_MASQUERADE`（「报告并发实为串行」在契约层封死；
  `concurrency_honest: true` 是结构位不是承诺字段）。

### Capability Pool 词汇层（§25.3；`@pomaster/schemas` 待收编段）

- `AGENT_ROLE_POOL_VALUES` 十二角色机器词形 + `AGENT_ROLE_POOL_PRD_HEADINGS`
  PRD §25.3 十二标题逐字镜像（一词二形成文收编——content_drift 先例）。词形裁定
  （decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md §5）：IMPLEMENTER/CLEANER
  锚 §24/§25.4 yaml；BRAINSTORM/RESEARCH/ARCHITECT/GATEKEEPER/STRENGTHENER/QA
  锚 §25.2 池选图短词形；SUPERVISOR/GOVERNANCE_WRITER/RECONCILIATION/
  KNOWLEDGE_CURATOR 为标题机械映射。`TODO(vocab-pr)`：pending_vocab_pr，不私加
  vocab-lock 主表；与 P0 六值 `EXECUTION_ROLE_VALUES` 分层不相交。
- `RUNTIME_EXECUTION_MODE_VALUES`（direct/sequential/parallel）、
  `RUNTIME_CAPABILITY_VALUES`（§58 三探针 snake_case）、
  `RUNTIME_DEGRADATION_RULE_IDS`（§58 四 bullet mechanical mirror）同段收编。

### DEF-SUP 触发制观测器（`packages/kernel/src/supervisor-trigger.ts`）

- `detectSupervisorTrigger(store, input?) => SupervisorTriggerReport`（纯读零
  写入）。D 线 §5 DEF-SUP 行三触发条件，**triggered = 满足其一**（「满足其一即
  立项评估」逐字）：
  - (a) `sop_chain_repeat`（source=measured）：journal 事件型连续链重复计数——
    链长 ≥ `chainMinLength`（缺省 2）、链内事件型 ≥2 种（同型连发去噪）、逐长度
    最左优先贪心不重叠计数、阈值缺省 3（「≥3 次」逐字）；窗口=现存全量 journal
    （append-only 无墙钟，A4——周窗无合法锚，`window: "full_journal"` 如实呈现，
    宁严不漏观测近似）；
  - (b) `second_contributor` / (c) `headless_ci`（source=declared）：人的事实与
    环境意图在 repo 状态面无机器可判载体——显式申报入参（CLI
    `--second-contributor` / `--headless-ci`），**不冒充实测**（S1 同源）。
- 纪律：观测不施断——触发 = 呈报 Owner 的立项评估信号（是否立项 supervisor 托管
  编排处置权全在 Owner）；journal 损坏行 `SCHEMA_INVALID` fail-closed；阈值/链长
  非法定值 `SCHEMA_INVALID`。
- CLI 呈现位：`agents status` 的 `supervisor_trigger` 段；`triggered=true` →
  warning `SUPERVISOR_TRIGGER_OBSERVED`（ok 恒 true）。

### §44.8 run/handoff deferred 词形复核（P21 收口义务；decisions）

- `COMMAND_DEFERRED` 码位**不退役**（命令仍 deferred）；`deferred_to` 由阶段位
  `P21` 更正为触发制 `DEF-SUP`、`reason` 由 `AGENT_RUNTIME_NOT_LANDED` 更正为
  `DEF_SUP_NOT_TRIGGERED`——AgentRuntime 契约已落地（本节），deferred 语义 =
  DEF-SUP 触发制门槛未成立，非契约缺席。回填记录状态位更新见
  docs/wave3-p20-sec79-backfill-44-8.md §5（Owner 本地档）。

## 15. Handoff Protocol 契约面 + 事务级 Execution 盖章（P21-Enforcement · PRD §24/§25.4/§25.5）

> 范围锚：wave3-plan.md P21 出口判据「§25.5 七条禁止模式对照测试」+ gaps A10
> （Handoff Packet）；P20 收口义务（maintain 通路事务级 execution 盖章——回填
> 记录 §3 裁定 5 归 P21）。同 §14 纪律：契约与执行分层——`pomaster handoff`
> 命令仍显式 deferred（DEF-SUP 触发制门槛），本节是其 deferred 下的契约面；
> 全部纯函数零 IO 零墙钟。

### Handoff Packet（`packages/kernel/src/handoff.ts`）

- **closed form（§24「必须通过 Handoff Packet：」唯一 yaml 形态）**：顶层键闭包
  于九键 `HANDOFF_PACKET_KEYS`（task / from / to / intent / changed_units /
  contracts_changed / evidence{fast_gate} / known_issues / open_questions——
  §24 例文键序），evidence 子对象闭包于 `fast_gate` 一键。extra 键 →
  `SCHEMA_INVALID`——这是「Agent 之间不得直接继承完整聊天上下文」的**结构封条**：
  chat_transcript / thinking_trace / messages 之类的全量轨迹载体没有可表达的键位
  （拒绝靠形态闭合，不靠黑名单枚举——黑名单永远漏）；扩展走治理 PR，消费面不私放。
- `validateHandoffPacket(input) => HandoffPacket`（冻结产物）：
  - `from`/`to` ∈ `AGENT_ROLE_POOL_VALUES` 十二角色闭包（§24 例文
    `from: IMPLEMENTER` / `to: CLEANER` 即该轴词形裁定锚；词表外
    `VOCAB_INVALID_VALUE`）；
  - `task` canonical/legacy 双读（§24 例文 `TASK-0173` legacy 词形合法；
    `resolveAlias` 收编判定，canonical=null 拒绝）；
  - `evidence.fast_gate` ∈ `HANDOFF_FAST_GATE_VALUES`（`PASS`/`FAIL`——§24 例文
    `fast_gate: PASS` 大写词形逐字 + 同族 FAIL；§26 七态 GRN verdict 词形不混入）；
  - 九键缺一 `SCHEMA_INVALID`（显式缺席 C1：`known_issues: []` / `open_questions:
    []` 空数组合法——例文逐字；省键不合法；数组内空串不合法）；`intent` 非空。
- `compileHandoffContext(packet) => AgentContext`——§24 原则「Agent 出生 → 获取
  最小 Context」的机器形态：七内容键恰为分母（路由两键 from/to 归 §25.1 Runtime
  Adapter 的信封职责面）。closed form 保证 context 分母不多不少——少一键 = 信包
  形态非法，多一键 = 无键位可表达。「最小 Context」由此是结构事实而非纪律劝告。
- 对照测试：`packages/kernel/tests/handoff.spec.ts`（17 例）+ §25.5 七禁止模式
  对照 `packages/kernel/tests/forbidden-patterns.spec.ts`（15 例，模式②即信包
  轨迹走私拒绝 + 池形态每角色 contextRecompile）。

### 事务级 execution 盖章（maintain 通路；P20 收口义务兑现）

- `Transaction.executionId?`（kernel `index.ts`）：携带即校验——词形非法
  `SCHEMA_INVALID` / 档案缺失 `EXECUTION_NOT_FOUND`（`assertExecutionIdClaimed`
  同 record op 闸，S1 禁自造身份），且**先于幂等短路**（重放路径同样不放行自造
  身份）。
- TX_APPLIED journal 事件新增 `execution_id` 键：盖章值；事务未携带 = `null`
  显式（C1——「这次变化是谁做的」不冒充已答；存量消费方只读既有键，向后兼容）。
  §25.4 审计问题「哪个 Agent，在什么 Context、什么 Policy 版本、什么 Permit 下，
  做了哪次变化？」由此在事务通路可答（policy_lock/permit 面归 execution 档案 +
  record 通路既有字段）。
- **盖章不进 `inputs_fingerprint`**（provenance ≠ 变更输入）：同 ops 重放携带
  不同身份仍幂等短路、零写入字节稳定；零变化事务（NO_CHANGE）无 TX_APPLIED 事件
  ——无变化即无「哪次变化」可答（GOLDEN-L8-4 同源）。
- 已封口执行的盖章**容忍**（事后补录是合法通路——与 record op 同裁定，不伪造
  时间围栏）。
- CLI：`pomaster maintain <anchor> --ops <tx> --execution-id AGX-n`；apply 结果
  回读 `execution_id`（缺席 = null 显式）；human 输出 `execution:` 行。

### Struggle Detection 归属矛盾（呈报项，不做实现裁定）

PRD §71.10（P1 清单第 10 条）列「Agent Struggle Detection / Break-loop
intelligence」，而 §56 标题自带「（P2/P3）」、D 线 §5 DEF-STRUGGLE 同判 P2/P3
——P1 vs P2/P3 归属矛盾呈报 Owner 裁定（wave3-plan.md P21 出口判据「呈报
Owner」位）；本阶段零实现。

## 16. Engineering Knowledge 内核（P28-Kernel · PRD §83 Knowledge / Engineering Experience Kernel）

> 范围锚：PRD §83 全章（83.2 Authority 隔离表 + 铁律「**Knowledge 不能直接让 Gate
> FAIL**」/ 83.3 四类型 / 83.4 Schema / 83.8 检索而非全量注入 + [AUTHORITATIVE]/
> [ADVISORY] 分区 / 83.9 生命周期 / 83.10 Promotion 链 / 83.11 Demotion 去僵化）
> + §25.3 Knowledge Curator + §25.5 ⑦ 禁止模式。实现住 `packages/kernel/src/knowledge.ts`；
> 形态契约 `packages/schemas/assets/12-knowledge-entry.schema.json`。

### Authority 隔离（§83.2 铁律的结构性保证，非约定）

1. **形态层**：12 schema `authority` 字段 `const "ADVISORY"`——知识对象在形态层面
   **不存在** AUTHORITATIVE 选项；`readKnowledgeLibrary` 装载面对异值 fail-closed
   （`SCHEMA_INVALID`，手改侧车伪权威在装载即拒）。
2. **类型层**：`KnowledgeEntry["authority"]` 是 `"ADVISORY"` 字面量类型（编译期写不出）。
3. **通路层**：knowledge 侧车走 knowledge.ts 专属写通路；`TransactionOp` 联合无
   knowledge op——knowledge 条目没有任何经 store 事务入 truth-index（gate 对象分母）
   的键位；且 §83.3 四类型 kind 词形不在 `TRUTH_BODY_KINDS` 十类（两平面词轴不相交，
   误投 store 词表闸即 `VOCAB_INVALID_VALUE`）。
4. **消费层**：knowledge 平面零影响投影 MUST 区与 gate 证据字节（对抗测试钉：
   knowledge 状态全遍历前后 `compileProjection` manifest/inputsFingerprint 字节一致；
   侧车 PROMOTED 前后 `normalizeGateResult` 输出字节一致）。

### 生命周期（§83.9 状态机，fail-closed 纯函数）

- `validateKnowledgeTransition(from, to) => KnowledgeTransitionOutcome`——拓扑唯一来源
  `KNOWLEDGE_TRANSITIONS`（@pomaster/schemas vocab.ts 待收编段，镜像 12
  x-pomaster-transition-matrix）：`CANDIDATE→VALIDATED|REJECTED`、
  `VALIDATED→PROMOTED|DEPRECATED`、`PROMOTED→DEPRECATED`；DEPRECATED/REJECTED 终态。
  矩阵外（跳步/倒退/自环/词表外）一律 `allowed:false` 显式拒绝 + hint（discovery-chain 同构）。
- 唯一权威边 `VALIDATED→PROMOTED` requires `["promotion_authority"]`（§83.10 提升链）；
  `PROMOTED→DEPRECATED` = §83.11 去僵化（被推翻的提升经验显式淘汰，禁静默滞留）。
- 侧车 `state/knowledge-library.json`（不进 content_digest；journal `KNOWLEDGE_*`
  事件流 + staged write，模式同 exception-ledger）。`last_validated_at` 字段名逐字
  §83.4、值域按 A4 禁墙钟取 store 事件拍。

### 写通路（每个生命周期边恰好一个语义入口）

- `recordKnowledge(store, input)`——登记 Knowledge Candidate（§25.3；status 恒
  CANDIDATE 起步；id 库内唯一；KB-* legacy 词形 hint 指路 resolveAlias 收编）。
- `applyKnowledgeTransition(store, input)`——通用转移面（Validation 边置
  last_validated_at、REJECTED 否决边）；promote/demote 边**显式拒绝并指路**
  专属通路（单一权威通路纪律）。
- `promoteKnowledge(store, input)`——VALIDATED→PROMOTED 唯一通路。权威位词形闸：
  `promotionAuthority ∈ KNOWLEDGE_PROMOTION_AUTHORITY_VALUES`（MAINTAIN | AUTHORITY |
  GATEKEEPER，§25.3/§83.10 原文角色词形）；非权威位（含 KNOWLEDGE_CURATOR——§25.5 ⑦）
  `AUTHORITY_REQUIRED`。kernel 不判申报真（C5）：`authorityRef` 审批引用 +
  `promotedRef`（Governance Proposal/Policy 指向）必填留痕；强约束载体是提升后经
  P11 maintain 面落地的 Current Policy/Truth 对象，knowledge 本体恒 ADVISORY。
- `demoteKnowledge(store, input)`——→DEPRECATED 唯一通路（reason 必填，
  journal KNOWLEDGE_DEMOTED）。
- `demoteSpecToKnowledge(store, input)`——§83.11 主链落库：产物 kind 限定
  ENGINEERING_PATTERN | DECISION_HEURISTIC（「Recommended Pattern / Heuristic」
  逐字两词形），`demotedFrom` + `reviewRef`（Architecture/Governance Review）
  谱系成对强制；产物 status 恒 CANDIDATE（评审是降级授权前提，非 validation）。
- journal 事件词形：`KNOWLEDGE_RECORDED` / `KNOWLEDGE_TRANSITIONED` /
  `KNOWLEDGE_PROMOTED` / `KNOWLEDGE_DEMOTED`。

### 词轴（pending_vocab_pr，镜像点 @pomaster/schemas vocab.ts）

`KNOWLEDGE_KIND_VALUES`（§83.3 四类型）/ `KNOWLEDGE_STATUS_VALUES`（§83.9 五状态）/
`KNOWLEDGE_TRANSITIONS` / `KNOWLEDGE_PROMOTION_AUTHORITY_VALUES`（§25.3/§83.10）/
`CONTEXT_AUTHORITY_PARTITION_VALUES`（§83.8 [AUTHORITATIVE]/[ADVISORY]）/ 
`KNOWLEDGE_CONFIDENCE_VALUES`（§83.4 例文 HIGH + §81.4 三级同词形）。

### 检索分区注入（P28-Commands · §83.8「检索而不是全量注入」）

- `searchKnowledge(library, request) => KnowledgeSearchHit[]`——检索语义单一实现点
  （projection 注入与 CLI `knowledge search` 同源同语义）。检索域（Change
  Localization 承载）= `role` + `taskRef` + `denominatorIds` + `hints` 各自
  `knowledgeQueryTokens` 后的并集；检索键 = `entry.title` + `entry.triggers`
  （§83.4：title 是身份必填、triggers 是「什么情况下应想起这条经验」的检索键
  承载；observations/diagnostic_questions/recommendation/counter_examples 是经验
  正文不是检索键——检索而非全文扫描）。命中 = 词级精确 token 交集（禁子串/等价
  猜测——P31 同款纪律的检索面应用；FE↔frontend 等未登记等价不做猜测，等价须经
  词汇表 PR）。注入分母 `KNOWLEDGE_INJECTABLE_STATUSES = {VALIDATED, PROMOTED}`
  （decisions：§83.10 链 Validation 之后才可注入；CANDIDATE 是 review-candidates
  等待分母；REJECTED/DEPRECATED 终态「不再生效」；PROMOTED 与 VALIDATED 同权注入
  ——knowledge 本体恒 ADVISORY，PROMOTED 只是谱系状态）。
- `Projection.manifest.knowledgeEntries`——第五分区（消费 P14 catalog 分区同款
  通道模式）：reason 逐条标明出处 `state/knowledge-library.json` + 命中 token
  （why-matched 可判卷）+ 「不进 gate 判卷输入（GOLDEN-L8-3）」；**reason 不含
  status**——knowledge 生命周期状态不进入投影任何字节（带命中场景下
  VALIDATED→PROMOTED 前后 manifest/inputsFingerprint 字节一致，knowledge 平面
  零影响投影的更强形态）；分母增减随注入分母闭包显式可见。侧车损坏
  （SCHEMA_INVALID）→ 原样抛出（fail-closed，禁静默当空分区）；缺席 = 合法空库
  （opt-in 登记面）。`inputsFingerprint` 自然包含本分区（manifest 派生）。
- `buildStorePaths` 公共化：knowledge 纯读命令不建账读侧车（路径派生与
  createStore 同源纯函数；装载面防线与写通路共享同一 readKnowledgeLibrary）。

### CLI 命令面（P28-Commands · §44.10 五命令 + §83 上游候选通道）

`pomaster knowledge search/inspect/record/review-candidates/promote/demote`
（packages/cli/src/knowledge.ts）：

- `search <query>`：检索呈现（--role 加入检索域）；空查询显式拒绝。
- `inspect <id>`：单条目全字段呈现（纯读；OBJECT_NOT_FOUND 显式）。
- `record`：候选登记通道（status 恒 CANDIDATE 起步，CLI 无初始状态覆盖位）。
  直登形态 + `--from-research <artifact> --finding <n>` P18 上游形态：finding 的
  statement→title、sources→source_episodes、confidence→confidence 机械搬运
  （显式 flag 优先），id/kind 必须显式给——finding 的 evidence_type（§81.4 词轴）
  与 knowledge kind（§83.3 词轴）值域不相交，机械映射即发明未登记等价。登记后
  review-candidates 即可见（候选通道走通）。
- `review-candidates`：CANDIDATE 分母呈现（含 from-research 与降级谱系标注）。
- `promote <id>`：提升唯一通路 CLI 面（--promotion-authority MAINTAIN|AUTHORITY|
  GATEKEEPER + --authority-ref + --promoted-ref 全必填；kernel 词形闸透传
  AUTHORITY_REQUIRED）。验证边（CANDIDATE→VALIDATED）CLI 入口缺席呈报：§44.10
  五命令词形闭包外（kernel applyKnowledgeTransition 已承载；如需 CLI 面须 Owner
  裁定词形，不私造 §44.10 词形）。
- `demote <id>`：--reason 必填（journal KNOWLEDGE_DEMOTED 留痕）。
- 纯读命令（search/inspect/review-candidates）零建账（view/audit 先例）；
  context compile markdown 升级五分区（MUST [AUTHORITATIVE] / ADVISORY [ADVISORY] /
  KNOWLEDGE [ADVISORY] / CATALOG / LAZY TOOLS——§83.8 分区词形逐字）。

### 对照测试

`packages/kernel/tests/knowledge.spec.ts`（状态机全矩阵 + 侧车 + 提升/降级链 +
Authority 隔离对抗）+ `packages/kernel/tests/knowledge-schema.spec.ts`（12 schema
ajv 正反例）+ `packages/kernel/tests/knowledge-projection.spec.ts`（P28-Commands：
检索分区注入——命中/未命中/分区不混 MUST/生命周期注入分母/带命中状态遍历字节一致/
损坏 fail-closed）+ `packages/cli/tests/knowledge-commands.spec.ts`（§44.10 命令面
+ record 候选通道 + review-candidates 可见性 + 权威位闸透传）。

## 17. Trellis Spec Analyzer（P30 · PRD §96 第 8 步「只分析，不 Apply」+ §93.3/93.4/93.5/93.6）

> 范围锚：PRD §96 第 8 步 + §70.6；§93.3 自动拆解 Pipeline（Analyzer 止步于 Human
> Review 之前）；§93.4 Migration Classification（十二分类 + 防文件名升级）；
> §93.5 Universal 与 Project-specific 分离；§93.6 Migration Validation（--analyze
> 内核形态；--propose/--diff/--apply 显式 deferred）；§92.1 十一行拆解表 /
> §92.5 Policy Activation / §92.6 Hard Spec 名称退场。实现住
> `packages/kernel/src/spec-analyzer.ts`。

### 导出面（全部纯分析；零写 IO）

- `analyzeSpecDir(specDir: string) => SpecAnalysisReport`——只读入口：递归扫 .md、
  分母 fail-closed（目录缺席/空目录/空输入 = `NOT_CONFIGURED` 显式错误非空清单）。
- `analyzeSpecFiles(files: readonly SpecFileInput[], source?) => SpecAnalysisReport`
  ——纯入口（零 IO；测试/嵌入方注入内容集）。
- `parseSpecMarkdown(relativePath, text) => SpecSection[]`——Section Parser
  （#/标题切段，P28 tokenizer 机械切段先例；代码围栏免疫；frontmatter 剥离；
  逐段 file+headingPath+1-based 行锚）。
- `normalizeClassificationValue(value) => CatalogClassificationValue | null`——
  分类词表闸（防篡改探测：词表外值运行时拒绝；发射面前统一过闸）。
- `specSimilarityTokens(text)`——相似度特征（latin 词形 token 沿 P28 先例 + CJK
  字符 bigram 机械 n-gram，非分词、无词典；仅用于重复/重叠相似度）。

### 报告结构（JSON 内联 schema = 导出类型）

`denominator`（分母 fail-closed：逐文件清单+sha256+frontmatterId/段数/候选数/
classified/unclassified）→ `candidates`（SA-nnnn 局部通路编号；八类 candidateKind
= §93.3 右列逐字；evidence_excerpt ≤3 行 + 截断标注 + 提取理由 + 出处锚；十二分类
或 null=PENDING_REVIEW 诚实桶 + 判据注记；policyPolarity；enforcementHint 仅
CATALOG_ENFORCEMENT_VALUES 词形）→ `pendingReview`（呈现桶，非词表新值）→
`overlapLinks`（文本级 duplicate ≥0.9 / overlap ≥0.6；语义级 paraphrase 不硬判）
→ `crossLaneConsolidation`（呈现清单，不自动合并）→ `precheck`（§93.6 六检
analyze 版：semantic_duplicate / frontend_backend_overlap / contradictory_must /
should_upgraded_to_hard / project_choice_in_global / example_as_project_truth）
+ `precheckDeferred`（其余三项 Apply 时态检查 + --propose/--diff/--apply 逐字
deferred）→ `activationCandidates`（§92.5；TECHNOLOGY_PROFILE=激活输入不在承载集）
→ `nameExitList`（§92.6：DEPRECATED/DUPLICATE/REJECTED 候选旧名称退场）→ `notes`。

### 分类判据（§93.4 防升级的机器化）

文件名词形不进分类特征集，只有正文语义证据计分（同内容异文件名 ⇒ 同分类，对照
测试钉住）；lane 判定同样只看正文 lane 词形。判据层级：占位/空正文 → PENDING；
project-choice-only → PENDING + split；废弃/否决声明 → DEPRECATED/REJECTED；
宪法级词形 → CONSTITUTION；行默认落地（MUST/MUST NOT/SHOULD/Change Policy →
UNIVERSAL/LANE 按 lane 词形；Contract → CONTRACT_TEMPLATE / 混排 project choice →
PROJECT_BASELINE_TEMPLATE；Checklist → GATE_RECIPE；Example → KNOWLEDGE_PATTERN；
Anti-pattern → FAILURE_PATTERN；Ownership → UNIVERSAL_POLICY 按 pilot-0001 先例，
十二轴无独立 AUTHORITY 词值）。词形先例：pilot-0001（catalog/candidates-draft.json
的 section→classification 分布）。

### analyze-only 结构封条（四层，对照测试钉住）

1. 导出面闭集且无写入词形（runtime keys 断言）；2. 类型层：analyzeSpecDir 参数 0
= string、不接受 Store（expectTypeOf + 条件类型锚）；3. 通路层：TransactionOp
无任何 Analyzer op（候选清单无 store 事务键位）；4. IO 层：全树字节快照零落盘。
`splitHint=PROJECT_STATE` 是呈现位不是写入位——§93.5 拆分落盘归 Human Review
之后的受控通路。

### 对照测试

`packages/kernel/tests/spec-analyzer.spec.ts`（42 例：八类映射逐字 + 逐类一正一反
×8、文件名防升级、PENDING_REVIEW 诚实桶、分母 fail-closed 三入口、封条四面、
vocab 十二值 + 篡改探测类型/运行时双面、§93.5 句级拆分、Duplicate/Overlap/Cross-lane、
§93.6 六检、§92.5/92.6 附带清单、确定性字节稳定、Section Parser 锚点/围栏/序文）。

## 18. 跨域联结词形等价登记内核（P31 · GRN-4402 转译 · A13 / OPEN-M6-12）

> 范围锚：docs/wave3-research-gaps.md §3（L94-107，GRN-4402 词形漂移 → 产品需求
> 转译；断链三层 L99-102：①工具内硬编码映射表不是治理对象、②公式侧中文 vs 源 id
> 侧拼音精确命中 0 无等价登记、③页域散文词形无 governed 联结键）；三条现行纪律
> L103 逐字（只登记不裁决 / 禁启发式·子串猜测 / 判不了显式 skipped_blindspot
> 而非假绿）；L105 产品需求一句话（词形等价登记表 declared-equivalence-only +
> 未登记词形 pending 桶 + 联结覆盖率盲区指标）。实现住
> `packages/kernel/src/equivalence.ts`；形态契约
> `packages/schemas/assets/13-equivalence-registry.schema.json`。

### 语义边界（三条纪律的结构性落法）

1. **只登记不裁决**：等价表是声明性事实不是裁决权行使——`registerEquivalence`
   无 `declaredBy` 结构性写不出 active（落 pending 桶）；kernel 不判申报真
   （C5 自报，`declared_by` 只登记声明事实）。Authority 声明时机械清理重叠
   pending 队列条目是声明事实的簿记后果（journal
   `EQUIVALENCE_DECLARED.disposed_groups` 留痕），不是 kernel 裁决。
2. **禁启发式/子串猜测**：解析面只做 active 登记 `word_forms[].text` 的全等
   精确匹配（trim 后逐字符相等——登记侧已 trim，零其他归一：禁大小写/NFKC 折叠、
   禁子串、禁编辑距离、禁模糊匹配）。机械入册 domain 恒 `unknown`（判域即启发
   式；显式未知非猜测，域标记由 Authority 声明时补登）。
3. **判不了显式 unresolved 而非假绿**：未命中 active 登记 →
   `status=unresolved`（canonical=null）+ 机械入册 pending 裁决队列，绝不静默
   返回「最近似」候选；pending 条目永不命中。

### 导出面

- `registerEquivalence(store, input) => EquivalenceEntry`——声明/候选登记唯一
  语义入口：携带 `declaredBy` ⇒ active（`declarationRef` 必填 + 形态封条：≥2
  词形 + 恰一 canonical 位 + canonical 过 `parseGovernedId`）；无 `declaredBy`
  ⇒ pending（声明位恒空）。同词形集 active 重复 / 与在册 active 词形重叠 =
  `SCHEMA_INVALID`（冲突显式禁静默合并）；与 pending 候选重叠 = 机械处置
  （裁决消费队列）。
- `recordPendingEquivalence(store, input) => PendingRecordOutcome`——pending
  桶机械入册面（encounter 自动入册共用入口；dedupe 三态：
  `created`/`extended`/`noop`；词形已属 active 组或跨条目配对 = `SCHEMA_INVALID`）。
- `resolveWordForm(registry, text) => WordFormResolution`——纯函数解析面
  （declared-equivalence-only；未命中 = 显式 unresolved + 禁猜测路标注记）。
- `wordFormsFor(registry, canonicalId) => EquivalenceReverseLookup`——反向查找
  （canonical → 等价词形；A6 双向链考古方向镜像；非 governed id 输入 FATAL 同
  `parseGovernedId` 契约）。
- `resolveLinkageWordForm(store, input) => LinkageResolution`——联结键解析
  唯一入口（D15/A6 挂接四腿链）：①精确 id（`parseGovernedId` 全过 = 词形即 id；
  存在性归消费 gate 的 REF 判卷——本面只解析命名）→ ②A6 机械别名族 canonical
  化（ALIASES_V0 是词汇表 PR 已声明的等价；canonical 仍过文法验证）→ ③等价表
  active 登记精确匹配 → ④显式 unresolved + pending 桶入册（dedupe）。
  `resolveAlias` 本体零改动（既有 alias 双向链测试零回归）。
- `computeLinkageCoverage(attempts) => LinkageCoverage`——联结覆盖率盲区指标
  （纯函数）：分母封闭 `resolved+pending+unresolved=total`；
  `coverageRatio = resolved/total`，`total=0` → 0 + `zeroDenominator=true`
  （零分母禁当满分，P26 同款）；`uncheckedInBlindspotEstimated` =
  unresolved 计数（03 GateCounts 同名键位同型）；词表外 outcome =
  `SCHEMA_INVALID`（禁静默归桶）。
- `readEquivalenceRegistry(paths) => EquivalenceRegistryFile`——装载面
  fail-closed：缺失 = 合法空表（opt-in 登记面）；损坏/手改 = `SCHEMA_INVALID`
  （逐条目结构 + active 形态封条复核 + 跨条目不变式：组号唯一、词形 text
  全域唯一——text→唯一条目是解析确定性的结构保证，group_seq ≥ 在册最大组号，
  回卷 = 手改痕迹）。
- `normalizeWordFormDomain(value)`——domain 词表闸（防篡改探测，P30 先例）。
- 常量：`EQUIVALENCE_REGISTRY_RELATIVE`（".pomaster/state/equivalence-registry.json"）、
  `EQUIVALENCE_GROUP_PATTERN`（`/^EQG-[0-9]+$/` 通路编号词形，GRN-/CLM-/EXC-/
  AGX-/SA-nnnn 同族先例；非 governed 前缀，不入 prefixes_v0 闭包）。

### 词表纪律（pending_vocab_pr）

domain 轴 `WORD_FORM_DOMAIN_VALUES` 六值（zh-formal / pinyin / abbrev /
compressed / canonical / unknown）与 status 轴 `EQUIVALENCE_STATUS_VALUES`
两值（active / pending）唯一来源 `@pomaster/schemas` vocab.ts 待收编段
（13 schema definitions 镜像同源对账；提请词汇表 PR 收编，不私加 vocab-lock
主表）。EQG-n 组号 kernel 单调分配、永不复用（A4；已处置组号不复用，journal
考古无歧义）。

### 存储与写入

侧车 `state/equivalence-registry.json`（kernel 内部补充状态，不进
content_digest）：staged write（`executeWrites` + `captureOriginal`，失败不落
半写状态，knowledge.ts 先例）+ journal 事件流 `EQUIVALENCE_DECLARED` /
`EQUIVALENCE_PENDING_RECORDED` / `EQUIVALENCE_PENDING_EXTENDED`（A4 事件拍，
禁墙钟；noop 零写入 = 零事件幂等）。

### 对照测试与出处锚

`packages/kernel/tests/equivalence.spec.ts`（26 例：登记正反例、子串猜测禁令
——「MIDU」vs「密度」未登记 → unresolved 而非命中、pending 机械入册 + dedupe
三态、盲区指标分母封闭三查 + 零分母、侧车损坏 fail-closed 四态 + 手改形态面、
D15/A6 零回归 pin、GRN-4402 场景回归——声明前 1/10 精确命中 + 9 条显式入
pending 队，声明后 9/10 resolved（实录源 id 词形 FIELD.MATERIAL-DB.MIDU 经
等价组解析到 corpus proposed_canonical FIELD.MATERIAL_DB.MIDU）+ 1 条无
governed 联结键散文词形 KPI#5 [RMB/pc.] 显式留队不假绿）；
`packages/kernel/tests/equivalence-schema.spec.ts`（13 例 ajv 正反例）。词形
锚出处：docs/wave3-research-gaps.md §3 L101/L102 + corpus/master/batch-3/
field-semantic-pending-registration.yaml:864/:867（实录源词形与 proposed_
canonical 的分立是等价组存在的语料实证）。

### 呈报边界（P31 后续件）

联结覆盖率盲区指标接入 truth-index 与跨对象引用完整性 gate 判卷（REF 消费面）
属 gate 侧后续；EQG-n 前缀与两词轴词形待词汇表 PR 裁决（呈报 Owner，不私加
vocab-lock 主表）。

## 19. 跨对象引用完整性 gate（P31 第二件 · gaps §3 GRN-4402 转译 REF 消费面）

> 范围锚：docs/wave3-research-gaps.md §3 L98（原症：判据「公式引用的字段在
> FIELD 对象中存在」对 177/177 条引用发射无法产出机判 → verdict=skipped_
> blindspot、escape_ratio=1——corpus/master/batch-3/gate-runs/calculation/
> GTR-MIG-B3-calculation-02-formula-source-anchor.json 实录）；L103 三条现行
> 纪律；L105（联结覆盖率盲区指标 + 真实七态 verdict）。wave3-plan.md P31 出口
> 判据第二/三件（场景回归 + 盲区指标入账）。实现住
> `packages/kernel/src/ref-integrity.ts`；词形解析消费 §18 三腿链纯读半边
> `resolveLinkageReadOnly`（单一实现，禁第二套）。

### 语义边界（判卷面：解析与存在性分立）

对对象集的跨对象引用（公式→字段 / 页段→对象 / 任意 ref 轴——联结键词形原文
进同一判卷面，ref 轴无关）逐条两步：

1. **词形解析**（§18 三腿链）：精确 governed id / A6 机械别名 canonical 化 /
   active 等价登记全等精确匹配。命中 → 拿到 canonical；未命中 → 盲区条
   （pending 桶机械入册，禁猜测）。
2. **存在性判定**（本 gate 新增）：canonical 对被引用方登记面（`knownTargets`，
   closed-world 逐条过 `parseGovernedId`——文法外 id 如实录源词形
   FIELD.MATERIAL-DB.MIDU 须先经等价声明落 proposed_canonical 再入册）全等
   查册，零归一。在册 = `present`；缺席 = `dangling`（真悬空机判，
   `REF_DANGLING` 违规明细——原 gate fixture A「悬空 CALC 依赖 → 闭合探针
   检出」同型）。

判卷输出三态 `RefDisposition`（present / dangling / blindspot）是逐条处置，
不是 verdict——verdict 是聚合位，走下述七态矩阵。

### verdict 判卷矩阵（七态真判政策）

`refIntegrityVerdict({total, dangling, blindspot})`（纯函数，输入域 fail-closed
——负数/非整数 = `SCHEMA_INVALID`，禁钳位）：

| 条件 | verdict | 机器可辨依据 |
| --- | --- | --- |
| total = 0 | `not_run` | 零分母禁当满分（P26 同款；scope.note 显式注记） |
| dangling > 0 | `failed` | 真悬空机判成立；真违规不被盲区余量洗白（violations 与盲区计数正交并存） |
| dangling = 0 且 blindspot > 0 | `skipped_blindspot` | 诚实下限：字面问题未对全分母机判；escape_ratio = blindspot/total < 原症 1；counts.unchecked_in_blindspot_estimated 显式附计数（03 FROZEN「skipped_blindspot 判定必须附证据」） |
| 全判净 | `passed` | passed ⇔ violations=0（C1 自洽校验一致） |

### 导出面

- `resolveRefBatch(registry, refs, knownTargets) => RefJudgement[]`——纯函数
  逐条判卷（零写盘）：发射词形/出处锚非空校验（空槽位是上游产出缺陷，显式
  拒绝非静默跳过）；登记面 fail-closed。盲区条 pending 恒 null（机械入册归
  gate 主通路批量面）。
- `refIntegrityVerdict(input) => RefIntegrityVerdictDecision`——七态矩阵纯函数
  （上表；rationale 逐格机读留痕）。
- `attemptsOfRefJudgements(judgements) => LinkageAttempt[]`——判卷 → §18
  coverage attempts 全词表映射（resolved 三腿 / pending_registered /
  unresolved_blindspot；真判条缺腿位、词表外 disposition = `SCHEMA_INVALID`，
  禁静默归桶）。
- `runRefIntegrityGate(store, input) => RefIntegrityGateRun`——gate 主通路
  （GateRunner 语义）：①resolveRefBatch 逐条判卷 → ②盲区词形首见去重后
  recordPendingEquivalence 机械入册（dedupe noop 幂等；同词形多发射首条候选
  配对为准）→ ③computeLinkageCoverage + 分母封闭三查机器断言（产出侧
  `GATE_COUNTS_INVALID`；派生与判卷分母失配同判）→ ④七态矩阵 →
  normalizeGateResult（C1 全套自洽校验）→ ⑤指标侧车 + journal 事件流。
  store 未初始化 = `NOT_CONFIGURED`。GateResult 产物经既有 record_gate_run
  通路入账 evidence/runs/（A8：运行产物永不入 truth-index，本函数不写账本）。
- `readLinkageCoverage(paths) => LinkageCoverageFile`——指标侧车装载面
  fail-closed：缺失 = 合法空表（opt-in 指标面）；损坏/手改 = `SCHEMA_INVALID`
  （结构封闭 + verdict 词表 + grn/gate 词形 + **分母封闭三查** +
  unchecked=unresolved 同型一致 + coverage_ratio 精确复算 +
  zero_denominator ⇔ total=0——装载侧与产出侧双锚）。
- 常量：`REF_INTEGRITY_GATE`（"REF_INTEGRITY"，store.ts integrity_ruleset 既有
  词形）/ `REF_INTEGRITY_GATE_DEF`（"POLICY.GATE.REF_INTEGRITY@1.0.0"，03
  gate_def 契约口径锚）/ `REF_DANGLING_RULE`（"REF_DANGLING"）/
  `LINKAGE_COVERAGE_RELATIVE`（".pomaster/state/linkage-coverage.json"）。

### 盲区指标双平面（gate_counts vs coverage）

同一 run 的盲区在两个平面各有一份计数，语义分立、键名同型
（`unchecked_in_blindspot_estimated`），嵌套位即语义：

- **03 判卷层**（`gate_counts.unchecked_in_blindspot_estimated`，journal 事件
  携带；`counts.uncheckedInBlindspotEstimated`，GateResult/evidence/runs/
  GRN-*.json 携带）：本 gate 机判不了的**引用发射条数**（= blindspot 处置
  计数；verdict=skipped_blindspot 的直接判卷依据；03 FROZEN 盲区证据在
  journal 侧的兑现位——原症 escape_ratio=1 在此可追溯）。
- **P31a 词形轴**（`coverage.unchecked_in_blindspot_estimated`，侧车块携带）：
  **纯盲区**词形条数（未入裁决队列；pending 在册 = 裁决队列有料，不计）。
  readLinkageCoverage 强制 unchecked=unresolved 同型一致。

### truth-index 挂点取舍（呈报 Owner）

01-truth-index health 块是 `additionalProperties:false` 闭表；
`worst_blindspot {gate, escape_ratio}` 是既有盲区证据链位，但 v0 kernel 明示
「不派生，保留先前值」（store.ts finalizeHealth）——就地派生需要跨 gate 聚合
政策（最差比较/并列裁决）且会改写所有既有 record_gate_run 事务的
finalizeHealth 行为（棘轮面大批量回归）。故本件按任务预设 fallback：盲区指标
走 ①03 证据链（record_gate_run → evidence/runs/GRN-*.json，A8 形态）+
②store 侧车 state/linkage-coverage.json（按 gate 名合并更新；分母封闭三查
两侧机器断言）+ ③journal LINKAGE_COVERAGE_RECORDED 事件流（A4 事件拍取
store 当前 seq，禁墙钟）。truth-index 就地挂点留 Owner 裁定（01 schema 扩值
走 schema PR，不在本面私改）。

### 存储与写入

侧车 `state/linkage-coverage.json`（kernel 内部补充状态，不进 content_digest）：
staged write（executeWrites + captureOriginal）+ journal 追加一事务（
equivalence.ts writeRegistryAndJournal 同模式）；gates 键排序写保证字节确定
（A4：同输入同 seq 同字节）。侧车单 gate 指标块 `{grn, gate, updated_at_seq,
verdict, violations, coverage}`——grn 留最近一次 run 身份（侧车是终态指标块
非历史，历史在 evidence/runs/ 与 journal）。

### GRN-4402 同型场景回归

`tests/integration/ref-integrity-grn4402-regression.spec.ts`（L2，6 例）：内联
fixture 复刻 177 条引用发射的词形分布特征（corpus batch-3 只读取材转录——
external:* 结构化 16 / inputs 散文 102 / output_field 59，与原症
carrier_coverage 同分布；CI 零语料运行时依赖），登记面 = authenticate 组
FIELD.AUTH.* 九条（原症 FIELD 对象层覆盖 9/785 同型）+ 三个已落册
proposed_canonical。三段断言：①无等价登记——177/177 显式盲区（
skipped_blindspot + escape_ratio=1，原症逐值复现；14 词形 pending 机械入册，
登记≠裁决）；②声明子集后——51 条 resolved 真判（4 条真悬空 failed 不被盲区
洗白 + 47 条 present），escape_ratio 降至 126/177≈0.712 < 1；③全量裁决 +
对象落册——177/177 判净零悬空 → passed（escape_ratio=0 非假绿）。dedupe
noop 幂等复跑钉住。单元面矩阵见
`packages/kernel/tests/ref-integrity.spec.ts`（L1/ir_invariants，19 例：七态
真判正反例、子串猜测禁令 gate 级、纯读零写盘、侧车手改六态 fail-closed、
03 证据链入账贯通）。语料级实测与取材映射对照报告：
`docs/grn4402-ref-integrity-regression-report.md`（Owner 本地目录）。

### 呈报边界（P31 后续件）

CLI 消费面（check/maintain 编排接入）未在本件——kernel GateRunner 语义入口
已就位，编排层按 verdict 施加阻断语义属后续件；truth-index 就地挂点留 Owner
裁定（见上）；联结键词形词轴词表收编同 §18（pending_vocab_pr）。

---

## 20. Portability Kernel（P32）

PRD §85 全节 + §84.6 Hidden Memory Drift 的产品半边。出处锚：PRD L5125-5216；实现 packages/kernel/src/portability.ts；CLI packages/cli/src/portability.ts。

### 20.1 八项检查（§85.2 逐字）

PORTABILITY_CHECK_IDS 原文序：Project Truth / Architecture State / Knowledge Index / Decision History / Verified Evidence / Active Task Recovery / Harness Bootstrap / Hidden Memory Dependency。三态 PASS/FAIL/NOT_RUN——应存在而缺席或损坏=FAIL，环境性缺席=NOT_RUN；truth-index 缺席或损坏时下游五检查 NOT_RUN（upstreamUnavailable 归一）。`pomaster portability check` 非全 PASS=PORTABILITY_CHECK_FAILED exit 1。

### 20.2 Portability Manifest（§85.3）

.pomaster/portability-manifest.json 四顶层键（project_memory_version=1 / required_canonical_sets 五族 / required_runtime_rebuild / forbidden_dependencies；PRD 原文「五键」实为 4 键+五族值闭集，注记呈报）。读侧损坏 SCHEMA_INVALID；findings 词形闭包 *_MISMATCH/_INCOMPLETE/_UNKNOWN_VALUE/_SHAPE_INVALID。

### 20.3 可删除测试（§85.4）

runDeletabilityTest(root)：root 必须含临时标记段（pomaster-portability-fixture- / pvnext-kernel-test-），无标记 ENVIRONMENT_ERROR 拒绝且全树字节零变（结构性防线，红队 8 条攻击路径实证全拒）。语义：rm -rf <root>/.pomaster/runtime → bootstrap → state/ 逐侧车哈希集相等。bootstrap 零治理事实零 journal 事件（重建非变更，A4）——state equivalent 字节判定的结构性前提。

### 20.4 MEMORY_DRIFT（§84.6）

harness 记忆位（~/.claude、~/.codex 及注入探测位）仅 statSync 存在性探测，内容零读取零入库；对应性全量核验归 P33 harvest/classification 通道（禁自动写入 Canonical State 裁定不变）。

### 20.5 词形轴

PORTABILITY_CHECK_STATUS_VALUES / PORTABILITY_CANONICAL_SET_VALUES / PORTABILITY_RUNTIME_REBUILD_VALUES / PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES / MEMORY_DRIFT —— absent_in_vocab_lock__pending_vocab_pr（G7 同批呈报）。

---

## 21. Memory Harvest 台账管线内核（P33a）

PRD §48.2/§48.4/§48.5/§44.10 memory 命令组 + Case N；thread-B §4 迁移设计（四桶+inbox）的产品半边。出处锚：PRD L3232-3320 / L3061-3085 / L5526-5530 逐字；实现 packages/kernel/src/memory-harvest.ts；schema assets/14-memory-harvest.schema.json（allSchemas 14 份聚合）。CLI 命令面归 P33b。

### 21.1 数据落点（结构性封条）

一切数据在 .pomaster/memory/ 子树：.pomaster/memory/inbox/<batch>/<id>.json（batch 目录式：capture / harvest-<harness> / audit-drift）+ <userMemoryRoot>/memory-ledger.json（默认 ~/.pomaster/user，§48.6 不随 repo 提交，测试注入临时目录）。本模块不 import applyTransaction、零 journal 事件、不写 .pomaster/state/**（inbox 是 staging 平面不是治理事实；KNOWLEDGE 桶晋升经 P28 recordKnowledge 落 state/knowledge-library.json 属 P28 既有落点非新落点）。

### 21.2 四桶 + 特殊出口 + 拒绝位（thread-B §4.1 逐字）

TRUTH（陈述现状基线值/规模/栈/权威指针）/ KNOWLEDGE（失败模式/诊断法/教训，不随 M6 失效）/ EPISODE（事件史/时间线/翻案过程）/ PREFERENCE（个人工作偏好）四桶 + AUTHORITY_POLICY（type=feedback 用户明令——从 PREFERENCE/TRUTH 升格，须显式 authorityUpgrade 默认拒绝）/ INVALID_EXPIRED（被后续事实推翻）两特殊出口 + UNCLASSIFIED_PENDING 机械拒绝位（禁模糊猜测：判不了恒 LOW、memory_class=null、promote 拒绝）。桶→§48.2 七类映射显式常量化 MEMORY_CLASS_OF_BUCKET（PREFERENCE→USER、AUTHORITY_POLICY→DECISION、两特殊位→null）。

### 21.3 机械预筛与三分法（classifyForHarvest，thread-B §4.2/§4.3）

规则优先级=frontmatter 显式声明（HIGH）> type:feedback 升格位（MEDIUM）> obsolete 词面→INVALID_EXPIRED（MEDIUM）> HARVEST_RULES 词面表首条命中（filename/header 两域，MEDIUM）> UNCLASSIFIED_PENDING+LOW。frontmatter 解析是行级正则非 YAML 运行时依赖。三分法机械位：①bucket=TRUTH 恒 needs_conflict_check=true（与 Current Truth 对照判定与「truth 胜出+标 EXPIRED+提取 FAILURE_PATTERN」留待消费侧——kernel 不做数值裁决）；②EPISODE 保序=text 逐字保真（零改写）；③expiry/obsolete_after 键显式声明机械搬运（OBSOLETE_AFTER_M6 型）。

### 21.4 语义入口

- captureMemory(root, text, {scope})——STRICT 模式统一入口（§48.5 用户「记住」），恒 UNCLASSIFIED_PENDING+LOW（分类归 Memory Curator，PRD §48.4）；同文重复捕获 SCHEMA_INVALID。
- harvestHarness(root, harnessPath)——COMPATIBILITY 模式批量收割（全量 .md 逐条→预筛→落 inbox）；路径缺席/零 md 文件=显式 NOT_RUN（HARNESS_PATH_MISSING/HARNESS_MEMORY_EMPTY，P32 三态同源）不伪造条目；同文跨 batch 去重（skippedExisting），幂等重跑零新增。
- reviewInbox(root, filters)——纯读过滤（state/bucket/source/batch 四面），counts 恒全量分母（分母封闭呈现）。
- decideInboxEntry(root, {id, outcome, reviewedBy, note, reclassify?})——batch review 唯一人工闸：只改 review_state+review_notes+分类标签，**签名无 text 参数位**（零改写铁律的结构封条）；reclassify 到 TRUTH 重算 needs_conflict_check；已决再决 TRANSITION_ILLEGAL（三态封闭无回退边）。
- promoteMemory(root, id, {actor, knowledge?, authorityUpgrade?, userMemoryRoot?})——分桶路由：KNOWLEDGE→P28 recordKnowledge（恒 CANDIDATE 起步+authority 恒 ADVISORY，knowledge.id/kind 必填显式申报不旁路生命周期）；memory_class TRUTH/DECISION/EVIDENCE→escalate_owner **不写 Canonical State**（Case N「不得自动成为 Truth」正向镜像呈报位）；USER→user-scope 台账（不入项目 Git）；AUTHORITY_POLICY→authorityUpgrade 显式声明闸（默认 AUTHORITY_REQUIRED）；INVALID_EXPIRED/UNCLASSIFIED_PENDING/EPISODE/HARNESS_RUNTIME→SCHEMA_INVALID 显式拒绝（EPISODE 归档通路未建、HARNESS_RUNTIME 可丢弃——显式缺席非静默）。
- auditMemory(root, {harnessMemoryRoots?})——§44.10 memory audit：分母封闭恒等式 total=pending+promoted+rejected（违反 SCHEMA_INVALID）+ 七桶零填充计数 + Case N 半边（消费 P32 runPortabilityChecks hidden_memory_dependency=FAIL → drift 项自动进 inbox，review_state=PENDING、source=memory_drift_audit、同文幂等；不自动成为 Truth）。

### 21.5 id 词形与词轴

id = HM-<12hex>（sha256(text) 前 12 hex 内容寻址——同文同 id 重复显式检出、A4 无墙钟无随机），通路编号词形（GRN-/CLM-/EXC-/EQG-/AGX-/SA-nnnn 同族），非 governed 前缀不过 parseGovernedId。词轴 HARVEST_BUCKET_VALUES / HARVEST_PRIMARY_BUCKETS / HARVEST_SPECIAL_EXIT_VALUES / MEMORY_CLASS_VALUES / REVIEW_STATE_VALUES / HARVEST_SOURCE_VALUES / HARVEST_CONFIDENCE_VALUES ——absent_in_vocab_lock__pending_vocab_pr（schemas vocab.ts P33 段，词汇表 PR 同批呈报）。装载面 fail-closed：词表外值、已决无留痕、PENDING 携带已决痕迹、UNCLASSIFIED 携带分类一律 SCHEMA_INVALID；schema allOf 四封条（已决必有留痕 / PENDING 无痕迹 / 缺省恒 PENDING 不可缺省为 PROMOTED / REJECTED 无路由产物）。

### 21.6 harvest review 通道启用状态（P35）

通道状态：**active**（Owner 决议 2026-09-01：批准启动——P33 呈报件 §2.2 启动位的落地面）。本节是启用注记不是新语义入口：六命令行为零变更（CLI help 无 inactive 标注故无词形同步面），启用只落在文档与流程两个维度。

- **最小可用启动形态**：第一轮 review = 对当前 inbox 出一份呈报清单（`memory review --list --json` + `memory inspect --json`）；**空 inbox 也出报告**——「inbox 空、通道可用、待首批 capture」是合法呈报态不是失败态（与 `memory inspect` 显式空态、`memory harvest` 显式 NOT_RUN 同源纪律：空≠静默）。
- **呈报 cadence**：每个开发批次收尾时跑一轮 harvest review 呈报（batch 边界=呈报周期；不设墙钟定时——批次是本仓库的节拍单位）。
- **首轮（P35）实况**：仓库自身无 `.pomaster/` store（inbox 显式空）——首轮端到端在 fixture 上验证（capture×2 → harvest 3 条 → review 队列 5 PENDING → decide×2（1 PROMOTED / 1 REJECTED）→ 终态分母封闭 5=3+1+1）；呈报清单证据档 docs/memory-review-round1-p35.json。
- **词形严格度位（P33 呈报件 §2.1 STRICT vs COMPATIBILITY）**：**已裁——COMPATIBILITY（Owner 直答 2026-09-01，台账裁决 7-④）**：继续使用 harness 自动项目记忆，按批次把有价值条目经本管线收割进 pomaster 正式账本（capture→harvest→review→promote，cadence 见上）；STRICT 的 harness 配置关闭动作不执行。COMPATIBILITY 定期 harvest 由本裁定正式激活为治理例行。

## 22. Production Feedback / Control Band 命令面（P34 · PRD §95 全节 + §30 第四态 + §55.1/§90.4）

出处锚：PRD L2553-2563（§30）/ L6099-6156（§95）/ L3579-3597（§55.1）/ L5682-5696（§90.4）逐字；实现 packages/kernel/src/production.ts（P34a 语义入口）+ packages/cli/src/production.ts（P34b 命令面）；schema assets/15-production-band.schema.json（allSchemas 15 份聚合）；词轴镜像 @pomaster/schemas vocab.ts P34 段。

**命令组定名（Owner 决议 2026-09-01）**：PRD §44 命令清单未定义 production 命令组——组词形 `pomaster production` + 六子命令位（band / evaluate / challenge / diagnose / metrics / self-improvement；band 含 define/list、self-improvement 含 register/list，共八 leaf）经 Owner 2026-09-01 认可（呈报件 docs/production-feedback-p34-report.md §2.1 裁定落档）。词表只收错误词形族不收命令名（memory CLI 六命令 P33b 同款先例）——本节即命令面命名权的落档位。

### 22.1 §95.2 链序与三条封条

链序 metric/log/error budget/SLO/control band → Deterministic Detection → Evidence → State Challenge → Agent Diagnosis →（链尾 Change Proposal/Rollback/Research 经治理面既有显式动作，不在 P34 范围）。三条结构封条：①§95.2 判定零 LLM 判定位（evaluateControlBand 纯函数只收显式谓词五算子 + 数值 observation；BREACHED 产 Evidence 恒 detected_by=tool_signal）；②§95.3 challenge 走 applyTransaction 零旁路（change 轴 STABLE→CHALLENGED；authorityRef=breach Evidence 引用）；③§90.4 登记恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态（零 journal 零 state/ 写入，无自动应用通路）。

### 22.2 id 词形（id_namespace.state_plane_refs 五通路）

observation/breach/challenge/diagnosis/self-improvement 五类台账 id = POB-/PBR-/PCH-/PDG-/PSI-<12hex>（内容寻址 sha256 前 12 hex——A4 无墙钟无随机；HM-/GRN-/CLM-/EQG-/AGX- 同族通路编号词形，**非 governed 前缀**：不入 prefixes_v0 闭包、不过 parseGovernedId，词形校验归 kernel ENTRY_ID_PATTERN 正则 + 台账存在性）。词形登记于 vocab-lock id_namespace.state_plane_refs（vocab-pr-0004 增补，Owner 决议 2026-09-01；PERMIT.* 文档化收编同款先例）。PBR-*（breach Evidence）兼作 challenge 事务 tx.authorityRef 承载位——「确定性工具信号即挑战权威」的接线事实（呈报件 §2.6 裁定落档；store 仅校验非空，PR-0004 登记事实不是新约束）。

### 22.3 词轴与错误词形族（vocab-lock production_band_vocab@v0.3-resolved）

八词轴（PHASE_TIMELINE_VALUES / PRODUCTION_SIGNAL_SOURCE_VALUES / BAND_PREDICATE_OPERATOR_VALUES / CONTROL_BAND_EVALUATION_STATUS_VALUES / DIAGNOSIS_KIND_VALUES（SCREAMING_SNAKE 大小写裁定 Owner 2026-09-01 照准，呈报件 §2.2）/ CAPABILITY_OUTCOME_METRIC_STATUS_VALUES / CAPABILITY_OUTCOME_METRIC_KEY_VALUES / SELF_IMPROVEMENT_SIGNAL_VALUES + SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 人读原文镜像）+ NOT_EVALUABLE 缺席归因三呈现码（METRIC_NAME_MISMATCH / VALUE_NOT_FINITE_NUMBER / PREDICATE_CORRUPT）+ 产物/常量词形两枚（POMASTER_SELF_IMPROVEMENT_CANDIDATE / tool_signal）+ production CLI 错误词形族六词形（BAND_SCHEMA_INVALID / BAND_NOT_FOUND / OBSERVATION_NOT_EVALUABLE / CHALLENGE_REJECTED / EVIDENCE_NOT_FOUND / DIAGNOSIS_WITHOUT_BREACH_EVIDENCE——呈报件 §2.4 裁定落档；第 6 位与 kernel GovernanceErrorCode 同名透传零二次造词，CLI 经 PRODUCTION_CLI_ERROR_VALUES 元组解构取词）——全部经 2026-09-01 vocab-pr-0004 正式收编（append-only 纯增量；CHALLENGED 复用既有 CHANGE_VALUES 零新增）。扩值走词汇表 PR。

### 22.4 CLI exit 语义（呈报件 §2.6 裁定落档）

`production evaluate` BREACHED 时 exit 0（附 evidence_ref/evidence_path——evaluate 是动作非判卷，BREACHED 是确定性检测的成功产出，链的下一拍 challenge 是显式独立动作）；NOT_EVALUABLE 与观测缺席 fail-closed exit 1（OBSERVATION_NOT_EVALUABLE），绝不静默绿。

### 22.5 对照测试

packages/kernel/tests/production.spec.ts（词轴逐值 + 三封条内核面）+ packages/cli/tests/production.spec.ts（命令词形 + exit code + 信封词形 + --help 子命令词形面）+ tests/integration/production-feedback-chain.spec.ts（§95.2 全链端到端 + 链外捷径全断 + state-delta 字节级钉死）+ packages/kernel/tests/vocab.spec.ts（production_band_vocab 段三镜像对账）。

## 23. Execution Trace Manifest Lite（W1-C · PRD v0.5.2 §8 + §14 P0.5-3 + §15 Benchmark C + §16 Case A）

出处锚：PRD v0.5.2 §8 全节（§8.1 Identity 短/稳/Git durable、§8.2 manifest 闭形态、§8.3 retention 四档、§8.4 隐私边界）+ §14 P0.5-3 逐字；Owner 裁决 8 ②（2026-09-01，corpus/master/cutover/owner-adjudications.md）：「trace 独立 traces/ 分区 + 投影 + 可选 --seal / retention 四档逐字仅记录不 GC」；实现 packages/kernel/src/trace.ts；schema assets/16-execution-trace.schema.json（allSchemas 16 份聚合，W1-C 增量 15→16）。

**语义边界**：Trace 是 Execution Identity 的**派生投影/侧车**（A19 Identity Is Not Trace——不新增第二套身份；四克制：零新 State Axis/Gate/Runner/采集器）。§8.2 键位结构性不含 runtime/model/permit/policy_lock/context_manifest（这些属于 Identity）。§8.4 隐私封条 = manifest 闭形态（TS 闭类型 + 16 schema additionalProperties:false）无任何自由文本载荷键位——禁私有思维链/隐藏推理/凭据，只存 observable actions / resource refs / tool receipts / state transitions / artifact references。

### 23.1 派生（零新采集器；reads = Lite 边界）

- `compileExecutionTrace(paths, executionId) => ExecutionTraceManifest`（纯读零写；同 state 重放字节稳定——A4 seq 锚无墙钟）。journal 半边：TX_APPLIED 事件按 execution_id 过滤，changed_object_ids 并集去重排序 → `writes.governed_refs`、transition_object op 计数行 `{seq, transition_ops}` → `transition_proposals`；evidence 半边：GRN/CLM 文件自报 execution_id 过滤（P20 贯穿链落盘位）→ `tool_receipts`（07 run_record 词形同源：grn/gate/gate_def/tool/tool_version/metric_dialect/verdict/ran_at_seq 八键）+ `evidence_refs`（开放引用位，GRN-/CLM- 先行）。`reads`/`agent_spawns` 恒空数组**显式**（§14 P0.5-3「不先采集完整 read trace」的 Lite 边界——空数组是边界声明非「读过且为零」判卷断言）；`raw_trace_ref` 恒 null（Lite 不采集 raw）。证据/档案损坏 SCHEMA_INVALID fail-closed；证据 execution_id 词形漂移显性暴露（gatekeeper 同款纪律）。
- `execution_id` 复用 `assertExecutionAttachable` 严格通道（§16 Case A：词形非法 SCHEMA_INVALID / 档案缺失 EXECUTION_NOT_FOUND——禁自造第二种 EXEC-* 身份，零新错误码）。

### 23.2 落盘与封存（裁决 8 ② OD-1=B / OD-2=I+显式 --seal / OD-4=仅记录）

- 双平面：`.pomaster/traces/AGX-*.json`（durable，TASK/INCIDENT/AUDIT 留存档进 Git）+ `.pomaster/runtime/traces/AGX-*.json`（EPHEMERAL 易变平面——§85.4 可删除测试 runtime/ 判据豁免，删后投影可重建，§15 Benchmark C 第四断言）。P34 production 新分区先例：不进 content_digest、零 journal 事件（manifest 自带 derived_from_seq 锚）。
- `sealExecutionTrace(store, executionId, {retention})`（retention 必填显式；词表外 VOCAB_INVALID_VALUE）：编译当前投影 + 写 retention 档与 derived_from_seq（封存时刻 store seq）；重复封存 TRACE_ALREADY_SEALED（跨双平面检查，审计快照禁静默覆盖）；已封口执行可封存（post-hoc 合法，不伪造时间围栏）。
- `readSealedExecutionTrace(paths, executionId)`：读封存文件 + **canonical 重放对账**——重算投影、剥 retention/derived_from_seq 派生视图逐字节比对（evidence compact「磁盘字节 ≠ canonical 重放字节」同构），漂移 = stale 显式呈现（快照不冒充新鲜）；`executionTraceDerivedView` 导出供对账面复用（单一实现）。`listSealedExecutionTraces(paths)`：双平面清单（同号 durable 优先单行，execution_id 字典序）。
- 词形轴 pending vocab-pr-0005（批 1 文件面互斥，词表三镜像登记归主控批次）：TRACE_RETENTION_VALUES（§8.3 逐字四档 EPHEMERAL/TASK_RETENTION/INCIDENT_RETENTION/AUDIT_RETENTION）+ schema 词形 pomaster.execution_trace/v1 + trace_version=1；模块常量承载于 trace.ts，收编后迁 @pomaster/schemas vocab.ts 逐值镜像。

### 23.3 CLI 命令面（W1-C2 · 批 2 落地）

`trace show <AGX>` / `trace list`（OD-5 已批词形；批 1 未注册——cli/src/index.ts 批 1 文件面互斥归 W1-A1，批 2 由 W1-C2 注册；kernel 侧读取面（本节 §23.1/§23.2 三函数）已齐备，CLI 为薄编排**零判卷**）。实现 packages/cli/src/trace.ts + index.ts trace 命令组：

- `trace show <AGX>`：缺省 = 纯投影纯读（compileExecutionTrace on-demand——OD-2 主形态，journal+evidence 唯一事实源零漂移）；封存在座 = 封存快照呈现 + canonical 重放对账（readSealedExecutionTrace——**stale 显式呈现非错误**，exit 0：漂移是信号不是故障，快照不冒充新鲜）；`--seal --retention <档>` = 显式物化（sealExecutionTrace；retention 必填成对显式——单边携带 SCHEMA_INVALID（CLI argv 预检 IO 前 fail-closed：--retention 是封存承诺，投影形态恒 null；--seal 缺 --retention 同拒绝），词表外 kernel VOCAB_INVALID_VALUE 唯一裁决位——CLI 零判卷不复制第二套词表闸）。
- `trace list`：封存清单（listSealedExecutionTraces 双平面扫描，同号 durable 优先单行，execution_id 字典序；空 = 显式空「0 sealed traces」——空≠静默）。
- 结果面闭形态：`{execution_id, mode(projection|sealed), manifest, plane, path, stale}` 六键显式（projection 形态 plane/path/stale 恒 null；失败路径 manifest=null 缺席显式）；--json 信封沿 §45 既有命令形态；人读纯文本无颜色码。零 GC 零 prune（OD-4 仅记录不执法——本命令组没有删除面）。
- 错误词形全原码透传，零新错误码：NOT_INITIALIZED / SCHEMA_INVALID（词形非法，§16 Case A）/ EXECUTION_NOT_FOUND（档案未登记——禁自造身份）/ VOCAB_INVALID_VALUE（retention 词表外）/ TRACE_ALREADY_SEALED（重复封存）。

### 23.4 对照测试

packages/kernel/tests/trace.spec.ts（24 例：派生正确性/闭形态键集/Case A/Benchmark C 四断言/retention 四档分层与 fail-closed/seal 零 journal/stale 对账/装载面/schema ajv 正反例）+ 四份既有 schema 注册计数锚同步 15→16（discovery-schema/equivalence-schema/knowledge-schema/production）；批 2 增 packages/cli/tests/trace-cli.spec.ts（22 例：trace 组注册面恰含 show/list / --help 词形含 --seal/--retention 与四档逐字提示 / --json 信封六键结构 / 缺席显式三态 NOT_INITIALIZED·EXECUTION_NOT_FOUND·词形非法 / fail-closed 四态 --seal 缺 --retention·--retention 孤值·VOCAB_INVALID_VALUE·TRACE_ALREADY_SEALED / stale 对账 exit 0 双模式呈现 / EPHEMERAL→runtime/traces 分层 / 封存落盘零墙钟键断言）+ readme-command-surface.spec.ts 双向锚（README trace 广告行 ↔ 注册表，子命令 / 连接同行 view blueprint/task 先例）。

## 24. Grounded Decision Graph 纯函数面（VB-PR1 · PRD v0.5.3 §5-§16）

出处锚：PRD v0.5.3 §5.2（十键节点）/§5.3+§12.1-12.4（反幻觉：Recommendation basis / INFERENCE 披露 / CONFLICT 禁自行挑答案 / INFERENCE 不升 Fact）/§6.1-6.2（G1-G8 Grounding Gate → 五值 verdict **派生判定不落盘**）/§7.3（Decision Frontier 动态计算）/§9.1-9.4（Research Request 九键 + mode 路由 + Request Gate）/§10.1-10.2（Research Handoff 联结回填）/§13.2+§14（ACCEPT/CHANGE/UNKNOWN/DEFER 四词形 + 六问重分类）/§15（Discovery Sufficiency）/§16（禁 frontier.json）逐字；Owner 裁决 9（2026-09-01，corpus/master/cutover/owner-adjudications.md）② VB-A 词形词表包（DECISION./RESEARCH.REQ./FINDING./DISCOVERY.INTENT./FACT. 不入 governed prefixes——Discovery 平面局部词形 state_plane_refs 先例 / decision class SCOPE 单值起步 / CONTRACT.* 按 PRD 示意词形处理 / authority.owner 对齐 owner_registry / GRILLING/GRILLED/GRILL_CONFIRMED 禁词负例登记）+ ③ VB-B 架构落点包（schema=18-decision-graph；research_request/handoff 住决策图 schema——10 号零改动；relation 六值与 RESEARCH_AUTHORITY_EFFECT_VALUES 三值两轴并存禁互填划界；投影指纹 kernel 自动维护 human_touch forbidden）。实现 packages/kernel/src/decision-graph.ts；schema assets/18-decision-graph.schema.json（allSchemas 17 份聚合，VB-PR1 增量 16→17）。

**纪律面**：纯函数零 IO 不 throw——非法输入一律显式 outcome 拒绝（fail-closed，对齐 discovery-chain/question-gate 判卷风格）；零墙钟（A4：一切事件序靠调用方供给 seq，本模块零 Date/零随机）；`graph_fingerprint` 由 kernel 自动维护（`sha256OfCanonical({projection_fingerprint, decisions, request_refs})`，D24：human_touch forbidden / write_blocking:false / read_only_service）；**零写入通道**——decision-graph.json 的读写归 CLI 命令面（PR-2 起），提升仍走 promote→maintain（§21 禁绕过）；Grounding Verdict 五值与 §7.3 frontier 均为派生判定，不进 Canonical Object State Axis 也不落盘（§6.2/§16）；invalidateDependentDecisions（§7.4 Upstream Change Invalidation）留 P1——P0.5 frontier 对上游非 ACCEPT/CHANGE（含 DEFER/UNKNOWN/OPEN）的下游一律保守排除。

### 24.1 七函数签名（全部纯函数）

- `buildDecisionGraph(candidates, options?) => BuildDecisionGraphOutcome`（§5.2）：LLM 候选 → 校验后 graph——id 词形/唯一、depends_on 无环/无悬空（DFS 三色）、class 闭包（SCOPE 单值起步，裁决9②）、§12.1 缺失事实不得冒充推荐前提、禁词负例在 decision_id/class/options 词形位机器拒绝；build 产物全 OPEN（resolution 只经 resolveDecision 写入）；`options.requestRefs` 是 research/index.yaml 落档 id 的同步标记（§16 禁第二持久化面）。
- `computeDecisionFrontier(graph) => DecisionFrontierOutcome`（§7.3）：五桶分区 frontier/waiting/resolved/deferred/unknown——每一轮 Grill 只处理当前 Frontier；prerequisites 满足 = 上游 resolution ∈ ACCEPT/CHANGE；手搓 graph 携带悬空依赖/环显式拒绝；零持久化。
- `evaluateDecisionGrounding(input) => DecisionGroundingOutcome`（§6.1/§6.2）：G1-G8 全量逐条判卷（不只第一个失败——判卷面完整可审计）→ 五值派生 verdict（READY_FOR_DECISION/NEEDS_DERIVATION/NEEDS_RESEARCH/CONFLICT_REVIEW/INSUFFICIENT_GROUNDING）；派生优先序：G1-G4/G7/G8 任一失败 → INSUFFICIENT_GROUNDING，G5 冲突在场 → CONFLICT_REVIEW（禁自行挑答案），G6 路由（RESEARCHABLE → NEEDS_RESEARCH / 全 DERIVABLE → NEEDS_DERIVATION / 未路由或越界 → G6 fail）；判卷全部机械重算（R6：G3 以图重算为准，不采信自报）；G2 刻意不含 KNOWLEDGE 面（§83.2：Knowledge 是 ADVISORY 策展源，永不进 gate 判卷输入）。
- `createResearchRequest(input) => CreateResearchRequestOutcome`（§9.1/§9.3/§9.4）：九键词形；mode 显式优先，缺省按 §9.3 gapKind 路由表（CURRENT_REALITY→INTERNAL 等六键），两者皆缺显式拒绝（「不得因为更全面默认 MIXED」零缺省政策）；§9.4 Request Gate 四条件前两条（来源不足 + 可被证据回答）本函数判，后两条（影响当前决策/成本合算）由调用方申报——机器不替人做成本判断。
- `applyResearchHandoff(graph, handoff) => ApplyResearchHandoffOutcome`（§10.1/§10.2）：finding 联结回填产出**新图**（不可变）——research_finding_refs 增量去重、RESOLVES_FACT 消解目标 missing_facts（只能在已登记缺口上）、CONTRADICTS_PREMISE 入 conflicts 披露面（下一轮 G-Gate 判 CONFLICT_REVIEW）；INSUFFICIENT_EVIDENCE/NO_DECISION_EFFECT 不回填显式 no-op；§12.4 反洗白（INFERENCE+RESOLVES_FACT → `inference_cannot_resolve_fact` 拒绝；CONTRADICTS_PREMISE 零来源 → `contradiction_without_source` 拒绝）；request_refs/decision_refs 悬空引用拒绝；同 handoff 重放幂等 NO_CHANGE（canonical 深比）。
- `resolveDecision(graph, input) => ResolveDecisionOutcome`（§13.2/§14）：ACCEPT = 采纳 recommendation.option（无推荐不可 ACCEPT；ACCEPT 带 value 矛盾拒绝）；CHANGE 必带 value（notes 携带 re-ground 路标）；UNKNOWN 必带六问 triage（行序取第一个 yes 派生处置；全 no + blocks=false = 申报自相矛盾显式拒绝；BLOCKER_CANDIDATE 只产候选——升级 HARD_BLOCKER 必须走 09 八问升级通路，本函数永不直接产）；DEFER 显式延后（§15 合法残留）；同决议重放幂等 NO_CHANGE、重开显式留痕（§19 Decision Reopen Rate 可审计面）。
- `evaluateDiscoverySufficiency(input) => EvaluateDiscoverySufficiencyOutcome`（§15）：停止条件判卷——OPEN decision（class→显著改变维度，未映射保守按显著）/未走出路的 UNKNOWN 重分类/已决议但 conflicts 未消解（§12.3 带冲突晋升 = 偷渡）/MSD 未达成（09 msd_assessment 三轴派生 `msd_reached`）→ blocking；合法残留入四桶（deferred/assumptions/unknowns[SOFT_UNCERTAINTY=Known Unknown]/future_considerations）；sufficient = blocking 空 = READY_TO_PROMOTE 的机器判据面（promotion_basis=msd_reached，仍经 promote→maintain 晋升——零新写入通道）。诚实注记：PRD §15 原文第九维 Critical Failure Behavior 的 class 词形映射待词表批扩容（当前任务口径八维），notes 显式携带不悄悄丢弃。
- `validateAcceptanceAnchors(input) => ValidateAcceptanceAnchorsOutcome`（T2 D-7 增量 · 语义收口战役 09-08）：Task Contract acceptance 挂锚存在性判卷——四态 fail-closed：`acceptance_empty`（零条目=空验收不是合同）/ `criterion_empty`（空白判据）/ `anchor_malformed`（词形外）/ `anchor_dangling`（DECISION 锚不在图内**或 resolution=null 未决议**——验收判据不得预支未决议结论；ASSUMPTION:EXC-<n> 锚不在调用方传入的 ledger 在册清单）。本函数零 IO（ledger 在册清单由调用方过滤 ASSUMPTION 分类后传入）；CLI 消费面 = brainstorm `--ready` 与 promote 闸 2.5 双点接线（promote 时刻重校验——禁信任 --ready 时刻的陈旧判卷），拒绝词形 `CONTRACT_<REASON>`。

辅以 `classifyUnknownTriage(triage) => UnknownDisposition`（§14 六问 → 处置派生纯函数，PRD 原文行序 derive→research→assume→defer→prototype/observe→block 取第一个 yes；全 no → BLOCKER_CANDIDATE）。

### 24.2 词形常量公共面（Owner 裁决 9②③；TODO(vocab-pr) 独立词汇表批收编）

- 局部词形正则：`DECISION_ID_PATTERN`（`DECISION.<SEGMENT>[.SEQ]`）/ `RESEARCH_REQUEST_ID_PATTERN`（`RESEARCH.REQ.<n>`）/ `FINDING_ID_PATTERN`（`FINDING.R<n>.<n>`）/ `DISCOVERY_INTENT_REF_PATTERN`（`DISCOVERY.INTENT.<n>`）/ `MISSING_FACT_REF_PATTERN`（`FACT.<SEG>` ≤4 段）/ `ASSUMPTION_ANCHOR_PATTERN`（`ASSUMPTION:EXC-<n>`——T2 D-7 Task Contract 锚词形，存在性对账 = 调用方传入的 ledger 在册清单）。词形是 **Discovery 平面局部词形**（state_plane_refs 先例）：不入 `GOVERNED_ID_PREFIXES`、不过 `parseGovernedId`，校验 = 本模块词形正则 + 图内存在性；truth_refs/contract_refs/architecture_refs/implementation_refs/evidence_refs/knowledge_refs/affects/basis_refs 等外部引用槽按宽松词形放行（CONTRACT.* 等 PRD 示意词形放行，裁决9②；存在性对账归 Truth 对账面，P1）。
- 禁词负例：`DECISION_GRAPH_FORBIDDEN_WORDFORMS`（GRILLING/GRILLED/GRILL_CONFIRMED，§1.1 不新增 State Axis——09 号 forbidden_wordforms 同款登记位）：不得出现在 decision_id/class/options 词形位。
- 词轴闭包（模块常量承载，待词汇表 PR 收编，禁实现侧私扩）：`DECISION_CLASS_VALUES`（SCOPE 单值起步，裁决9②）/ `GROUNDING_VERDICT_VALUES`（五值——**仅 kernel 常量承载，schema 18 无 verdict 字段**：§6.2 派生判定不进 Canonical Object State Axis）/ `DECISION_RELATION_VALUES`（六值，与 10 号 `RESEARCH_AUTHORITY_EFFECT_VALUES` 三值两轴并存禁互填——裁决9③ 划界）/ `DECISION_ANSWER_VALUES`（ACCEPT/CHANGE/UNKNOWN/DEFER）/ `RECOMMENDATION_SOURCE_VALUES`（PROJECT_GROUNDED/INFERENCE——§12.2 披露位）/ `GROUNDING_SURFACE_VALUES`（CURRENT_TRUTH/DOCS/REPO/EVIDENCE——刻意不含 KNOWLEDGE，§83.2）/ `MISSING_FACT_ROUTE_VALUES`（DERIVABLE/RESEARCHABLE——ASK_HUMAN 刻意不在轴：事实型问题禁止问 Human，§8）/ `UNKNOWN_DISPOSITION_VALUES`（六处置，词源 MSD 十分类子集——零新分类词）/ `SUFFICIENCY_DIMENSIONS`（任务口径八维）+ `DECISION_CLASS_TO_DIMENSIONS` / `SUFFICIENCY_RESIDUAL_CLASSIFICATIONS`（四合法残留）/ `RESEARCH_MODE_ROUTE_HINTS`（§9.3 六键路由表，mode 词形复用 RESEARCH_MODE_VALUES 零新轴）。

### 24.3 schema 18 与对照测试

- assets/18-decision-graph.schema.json（`$id https://pomaster.dev/schemas/decision-graph/v1-draft.json`）：`decision_graph` 顶层（§5.2 十键一次锁全，additionalProperties:false + graph_fingerprint）+ `definitions.research_request`（§9.1 九键）/`research_handoff`/`finding_link`（§10.1 联结形态）三平面 definitions 同住一份 schema——10 号零改动（裁决9③）。
- 对照测试：packages/kernel/tests/decision-graph.spec.ts（局部 ajv 直载资产正反例 + 八函数全对 + 幂等/反洗白/禁词负例；T2 D-7 增量 validateAcceptanceAnchors 四态正反例 describe）；allSchemas 挂载计数锚 16→17（discovery-schema/equivalence-schema/knowledge-schema/production/trace 五 spec 同步）。

## 25. Evidence Artifact 内容寻址与存在性绑定（W1-B 欠账补记 · P0.5-2 · PRD §7/§14）

出处锚：PRD §7.2（Raw Artifact → Infrastructure-issued Receipt → Normalized Gate Result → Evidence Pack 四环节）/§7.3（content_identity 只能由基础设施产生）/§7.4（Acceptance）/§14（tracer 收窄 screenshot）；Owner 裁决 8（2026-09-01，corpus/master/cutover/owner-adjudications.md）③ B2 架构包——D1=A：receipt 身份 = blob sha256 即身份（不新增 EVR- id，四克制最优）/ D2·D3=A：落点 = 07 run_record 增 **optional artifact_refs**（复用既有 definitions）+ tracer 收窄 screenshot、条目收窄 blob 分支 / D5：EVIDENCE_BINDING_INCOMPLETE = 门内 rule + 稳定码并用 + ④ **D4=A 升版路径**（Owner 明示，异于研究侧倾向 B）：存在性绑定写进门禁判卷本体——POLICY.GATE.BROWSER gate_def 版本化变更 @0.1.0→@0.2.0，绑定缺失/失配 = 判卷红。实现 packages/kernel/src/evidence-artifacts.ts（kernel `index.ts` Evidence Artifact Binding 段已导出）。本节是 W1-B research 笔记 deferred 列明的 kernel-api.md 契约段欠账补记——语义与实现零变更，只补文档。

### 25.1 契约面

- `sha256OfBytes(bytes)`——raw 字节摘要（artifact 内容寻址身份）。与 `sha256OfCanonical` 是两种不同哈希对象（raw 字节 ≠ canonical-JSON，R3），禁止互替；D24：人永不计算哈希，本导出仅供机器通路复用。
- `persistEvidenceArtifact(evidenceDir, {media, bytes}) => PersistedEvidenceArtifact`——**evidence blob 平面唯一写入口**：写 `<evidenceDir>/blobs/sha256/<aa>/<rest>`（07 blob_ref.storage_path 纯派生——`storagePathOfSha256` 机械派生，禁手拼）；幂等（同字节重复 persist 命中同路径且字节全等 → 零写入）；碰撞防线（同路径已有**不同**字节 → `REF_INTEGRITY_VIOLATION` fail-closed——内容寻址基本不变量：同一路径 ⇔ 同一字节，禁静默覆盖既有 artifact）；写后读回重算自证（「消费方必须重算」纪律的写侧镜像），失配 = `ENVIRONMENT_ERROR`（磁盘假设破裂，禁静默）。media 1..64 字符开放词（07 blob_ref.media；tracer 固定 "screenshot"——D3=A 收窄）；空字节 `SCHEMA_INVALID`（空字节不是证据）。
- `verifyEvidenceBinding({runRecordPath, evidenceDir}) => EvidenceBindingOutcome`——**四态存在性绑定校验**（PRD §7.4 Acceptance 的机器落点；D24 read_only_service——只读校验，永不改写任何文件）：①`bound`（refs 在场且逐条文件在场、读回重算 sha256/byteSize 与引用一致）；②`artifact_file_missing`；③`artifact_bytes_tampered`（「Adapter 验证 Screenshot A、Evidence Pack 存 Screenshot B」的检出形态——sha256 或 byteSize 失配）；④`binding_refs_missing_while_passed`（verdict=passed 而 artifact_refs 缺席——0.2.0 判卷语义：passed 即存在性主张，无 refs 的 passed = 主张悬空）。②③④统一 code=`EVIDENCE_BINDING_INCOMPLETE`（**稳定码与门内 items[].rule 同词形**——D5：gate 侧消费本 outcome 落判卷红，kernel 保持 gate 无关）。verdict 非 passed 且无 refs → `bound`（无主张即无绑定义务；not_run/failed 不受条款约束）。校验对象是已落盘 evidence/runs/GRN-*.json（先入账再校验；畸形/损坏记录 `SCHEMA_INVALID` fail-closed）。
- `GateRunRecordInput.artifactRefs?`（07 run_record `artifact_refs` 的 kernel op 契约）：可选——缺席 = 键缺席（存量 GRN 字节兼容，canonical 幂等不破）；**携带即 kernel 侧强制校验**：`assertArtifactRefs`（sha256 词形 `sha256:<64hex>` / media 1..64 字符 / byteSize ≥1 整数可省 / storagePath 词形 `blobs/sha256/<aa>/<rest>` 且**必须与 sha256 机械派生一致**——路径⇔身份分叉即引用自相矛盾拒收；空数组 `SCHEMA_INVALID`——空数组既非绑定也非缺席，两义性禁入，有绑定就带 refs 无绑定就省键）+ `assertArtifactBlobsExist`（悬空 blob 引用 `REF_INTEGRITY_VIOLATION`——先 persist 再 record）。落盘映射唯一源 `artifactRefsToSnake`（`store.applyRecordGateRun` 与 cli `canonicalRunBytes` 逐键同构——R1 canonical 字节双写点纪律「同一函数，不两套」；键序 ref_type → blob{sha256 → media → [byte_size] → storage_path}）。绑定的门内判卷（POLICY.GATE.BROWSER@0.2.0 条款）归 gate 侧（gauntlet-lite browser-evidence 消费本模块 outcome 裁决）。

### 25.2 对照测试

packages/kernel/tests/evidence-artifacts.spec.ts（persist 幂等/碰撞防线/读回自证、assertArtifactRefs 词形与路径⇔身份派生一致性矩阵、verifyEvidenceBinding 四态矩阵、存量字节兼容）。

## 26. Perception Receipts schema 与 Browser 腿环境判卷门（W1-D2 · PRD v0.5.2 §6 + §14 P0.5-4）

出处锚：PRD v0.5.2 §6 全章（§6.2 Four Anchors 缺一不可 / §6.3 observation_request 最小形态 / §6.7 Environment & Instance Identity——「观察之前必须有 Doctor」「无法确认观察实例 → WRONG_OR_UNVERIFIED_INSTANCE，Verification 不得 PASS」「安全字段只记录可审计引用，不落 Secret」/ §6.13 Observation Receipt——「观察不以 Agent 自报为凭证……进入 Trace/Evidence Sidecar，不进入 Truth Index」/ §6.14 负观察七词形「否则只是 INCONCLUSIVE」/ §6.15 Probe 副作用四级 / §6.16 感知降级禁静默）；Owner 裁决 8（2026-09-01，corpus/master/cutover/owner-adjudications.md）②③ 感知域词形与撞族消歧；kernel 纯函数面 packages/kernel/src/perception.ts（W1-D1 批 1 已落：OBSERVATION_SURFACE_VALUES 八值 / SIDE_EFFECT_CLASS_VALUES 四级 + PROBE_SIDE_EFFECT_RULES / NEGATIVE_OBSERVATION_VALUES 七词形 / OBSERVATION_RESULT_VALUES 单轴闭包 / ENVIRONMENT_DOCTOR_VERDICT_VALUES 二值 / OBS_ID_PATTERN + ENVREC_ID_PATTERN / validateObservationRequest 四锚 / runEnvironmentDoctor 九项比对 / buildEnvironmentReceipt / judgeNegativeObservation）。本节契约词形由 W1-C2 线代为落档（批 2 docs/kernel-api.md 文件面互斥归 W1-C2）；schema 17 与 browser 腿消费门实现归 W1-D2 线。

**纪律面**：纯函数零 IO 零墙钟零 seq（perception.ts 头注——A4：时间戳禁入身份与判定字段）；OBS-/ENVREC- 是状态/证据面通路编号词形（AGX/GRN/CLM 同族先例），**非 governed 前缀不入 id_namespace 闭包**；词轴八族 TODO(vocab-pr-0005)（surface 八值/side-effect 四值/doctor verdict 二值/负观察七值/hypothesis status 五值/probe 四值/SENSOR.* 词形/journey 词形——词表三镜像登记归主控词汇批次）；撞族消歧（裁决 8）：CAPABILITY_DEGRADED 与 RUNTIME_DEGRADATION_RULE_IDS.capability_degradation_report（§58）同词根不同概念，前者是感知域 scopeNote 呈现词，结构性不进 OBSERVATION_RESULT_VALUES 闭包。

### 26.1 EnvironmentReceipt → Browser 腿 blocked（Case H 的机器判据）

- **EnvironmentReceipt**（§6.7 yaml 形态逐键）：八确认字段（environment_ref/repository_ref/revision_ref/runtime_instance/base_url/dataset_ref/auth_role/feature_flags——实测未确认=null 显式缺席，禁空串冒充已确认）+ `doctor_verdict`（二值 READY | WRONG_OR_UNVERIFIED_INSTANCE）+ `execution_id`（AGX 通路锚，§6.13「证明我看过」的身份前提——在场必填，词形/档案校验归 execution.ts 单一镜像）。判卷分母 = runEnvironmentDoctor 九项比对（expected null → exempt 申报豁免显式呈现 / observed null → missing / 值不等 → mismatch / 相等 → confirmed）；五项实例身份核（repository_ref/revision_ref/runtime_instance/base_url/environment_ref）expected 侧必填非空——缺判卷分母 SCHEMA_INVALID（连「该确认什么」都未申报的观察请求不得进入管线，P0.5-4 验收句）。WRONG_OR_UNVERIFIED_INSTANCE 回执可诚实落盘（实测 null 原样保留——blocked 证据链消费位）。
- **消费门（gauntlet-lite browser-adapter，W1-D2）**：BrowserGatePlan 增 environment 供给面（编排方注入——adapter 不自产 receipt；两腿共享同一 receipt，同一次观察同一环境）；normalize 判卷段前置门：**environment 缺席或 doctor_verdict ≠ READY → verdict=blocked**（03 七态既有词形零新增——PRD Case H 逐字「Verification BLOCKED」；WRONG_OR_UNVERIFIED_INSTANCE 禁 PASS 的结构性兑现：MCP 证据三件套齐备不再等于 passed）。scopeNote 载 doctor missing/mismatch 字段明细 + WRONG_OR_UNVERIFIED_INSTANCE 禁 PASS 词形；counts 全零 + blindspot 显式（absenceRecord 同款诚实缺席形态）。门的语义次序钉死（测试锚）：not_configured → blocked(environment) → not_run(证据三件套) → failed(连接) → passed——三件套缺照旧 not_run，不被 doctor 门吞掉。
- verdict 词形与 gate_def 版本位注记：blocked 属 03 七态既有值（零新增 verdict 词形—— Case H 逐字「Verification BLOCKED」）；环境门进门禁判卷链后 BROWSER gate_def 是否随之升版，随 W1-D2 线实施与 gate_def 版本化纪律（gate 名不属 vocab-lock 管辖；新增判卷条款须版本化登记——browser-adapter 口径常量段在案纪律）呈报，本节只钉 verdict 语义与门序。

### 26.2 ObservationReceipt 挂 evidence 平面

- **OBS- 通路编号**（OBS_ID_PATTERN `/^OBS-[0-9]+$/`；ENVREC- 同族）：AGX/GRN/CLM/EXC 先例注记逐字复用——状态/证据面通路编号词形，非 governed 前缀，不过 parseGovernedId，词形校验归模块正则（§6.13 observation_id 例文词形）。
- **ObservationReceipt**（§6.13 字段面：sensor_capability/adapter/operation/surface/normalized_facts/result/captured_at_seq）落 **evidence 平面 sidecar**（x-index-policy forbidden_in_truth_index 同族——不进 truth-index、不进 content_digest；§6.13 逐字「进入 Trace/Evidence Sidecar，不进入 Truth Index」）；`result` = OBSERVED + 七负值**单轴闭包**（OBSERVED 只能由成功观察通路产出；judgeNegativeObservation 结构性不发 OBSERVED——declared 非空取链序最前 ENVIRONMENT_INVALID→PERMISSION_DENIED→SENSOR_UNAVAILABLE→NOT_OBSERVABLE→PROBE_FAILED；captureEmpty 时 OBSERVED_ABSENT 四前提——正确页面+正确实例+Sensor 已工作+捕获窗口覆盖操作——全真才成立，任一假 = INCONCLUSIVE，「没看到」不能直接等于「不存在」）。
- **与 trace 的联结零 schema 变更**：§23.1 ExecutionTraceManifest.evidence_refs 是开放引用位（词形自描述字符串数组，GRN-/CLM- 先行）——OBS-* 直挂即可（研究 trace-eval §4.4「本簇只在 trace schema 留 evidence_refs 开放引用位，未来 EVR/OBS 皆可挂」）。

### 26.3 schema 17（assets/17-perception-receipts.schema.json）

- `$id https://pomaster.dev/schemas/perception-receipts/v1-draft.json`（draft-07；16-execution-trace 与 18-decision-graph 之间顺延）：`environment_receipt` + `observation_receipt` 双 record definitions 同住一份（16 号 execution-trace 独立文件同款裁定——07 的 root oneOf 是 GRN/CLM 判卷记录族，receipt 族生命周期是 trace sidecar，独立文件更干净）；additionalProperties:false 隐私封条（无 Secret 字段位——auth_role 是角色类别词不是凭据）；OBS-/ENVREC- pattern 住此定义，x-vocab-pr 注记 vocab-pr-0005 批次。
- 挂载：packages/schemas/src/index.ts 增 import + SCHEMA id 常量 + allSchemas 导出（**allSchemas 计数锚 17→18**——discovery-schema/equivalence-schema/knowledge-schema/production/trace 五 spec toBe(18) 同步；该文件面归 W1-D2 批 2 互斥位）。

### 26.4 对照测试

packages/kernel/tests/perception.spec.ts（W1-D1 已落：四锚缺一/词轴外值/doctor 九项明细与二值 verdict/负观察七值分岔/ receipt 组装诚实落盘）+ W1-D2 增 gauntlet-lite browser-adapter environment 门矩阵（fake receipt 注入——READY→passed / revision mismatch→blocked（Case H）/ receipt 缺→blocked（fail-closed 一刀切）/ 三件套缺照旧 not_run 不被 doctor 门吞掉；门序五态次序钉死）+ integration e2e（全 fake 零网络——P36 纪律）+ schemas 注册计数锚五 spec 同步。

## 27. Software Graph relation sidecar（P-v06 批次 0 · Owner 决议 D-3 · PRD v0.6 §6-8）

出处锚：PRD v0.6 §6（「Graph 不是第六原语；Graph 是 Governed Object + Typed Relation 的主要实现方式」逐字）/ §7 Relation Model / §8 Graph Provenance；Owner 四决议 D-1~D-4（2026-09-02，.trellis/tasks/09-02-vnext-prd-v06-governed-substrate/prd.md）；kernel packages/kernel/src/relations.ts（relations.spec.ts 对照）。

**纪律面**：只承载边、零新节点存储（节点=truth-index 对象 ∪ catalog 条目）；sidecar `state/relations.jsonl` 追加流（equivalence-registry 先例：不进 content_digest、A8 不入 truth-index、01 additionalProperties:false 封条不动）；EDGE-\<12hex\> 内容寻址（canonical (source,type,target) sha256 前 12 hex——POB- 同族；同三元组重登记 noop 幂等，analyzer 重跑安全）；runtime_trace 边必须附 observation_ref（OBS-n/POB-\<12hex\>——「Agent 必须证明我看过」边侧封条）；confidence=probable 必附 uncertainty_note（§148）；装载面逐行 fail-closed + edge_id/三元组双唯一不变式；端点存在性归消费面（「本面只解析命名」equivalence 三腿链先例）。

### 27.1 API 面

- `registerRelation(store, input)`（唯一写通路）：输入 {type, source{domain,id}, target, origin, confidence, producer, sourceRef, locator?, observationRef?, declaredBy?, note?}；输出 {registered, entry}（noop 幂等位）。词表闸 normalizeRelationType/normalizeRelationOrigin/normalizeEndpointDomain/normalizeRelationConfidence（PR-0006 四轴闭包，词表外 SCHEMA_INVALID）。
- `readRelations(paths)`（只读装载；缺失=空台账合法状态；坏行/手改=SCHEMA_INVALID 整体拒绝）。
- 派生算子（One Model Many Projections——dependencies/composition/runtime 视图与 Change Impact 全部从台账派生）：`relationsTouching` / `reverseDependents`（§106-108 最小算子）/ `forwardDependencies`。
- 词形：RELATIONS_RELATIVE=`.pomaster/state/relations.jsonl`；EDGE_ID_PATTERN `/^EDGE-[0-9a-f]{12}$/`（vocab-lock id_namespace.state_plane_refs PR-0006 注记——非 governed 前缀不过 parseGovernedId）；OBSERVATION_REF_PATTERN `/^(OBS-[0-9]+|POB-[0-9a-f]{12})$/`；CATALOG_ENDPOINT_ID_PATTERN（≥2 段 SCREAMING_SNAKE）。
- 词轴（PR-0006 收编 vocab-lock@v0.5-resolved software_graph_vocab）：RELATION_TYPE_VALUES 首批 8 值（INSTANCE_OF/IMPLEMENTS/CONTAINS/CALLS/READS/WRITES/VERIFIED_BY/DERIVED_FROM——「只收真实消费」，MAPS_TO_SOURCE 语义归 key_bindings、SUPERSEDES 归信封，零重复登记）；RELATION_ORIGIN_VALUES 三值；RELATION_ENDPOINT_DOMAIN_VALUES 两值（truth/catalog——D-2）；RELATION_CONFIDENCE_VALUE_VALUES 三值（deterministic/probable/declared）。schema 载体 19-software-graph-relations.schema.json（allSchemas 计数锚 18→19 五 spec 同步）。

## 28. Object Family 派生视图 + Analyzer Output Contract（P-v06 批次 0 · PRD v0.6 §1.2/§6.1/§148-149/§163）

### 28.1 family.ts（family=派生视图，零信封改动）

PREFIX_FAMILY_MAP：16 前缀→12 family 全总映射（PAGE/COMPONENT→UI；CAPABILITY→PRODUCT；API_REQ/ERR→INTERFACE；FIELD→DATA；KEYBINDING→CODE；KNOWLEDGE/CHANGE/TASK/DENOMINATOR/POLICY/PROFILE/AUTHORITY→GOVERNANCE；TEST/SPEC→EVIDENCE——PR-0008（2026-09-04）增补 SPEC. 同批映射）；装载期全总性自检（新前缀忘补映射立即 FATAL）。`deriveFamily(prefix)` / `familyOfId(id)`；FAMILIES_WITHOUT_PREFIX 五族显式缺席（RUNTIME/RESOURCE/RELIABILITY/SECURITY/DELIVERY——§163 Phase C 逐批落，禁猜测派生）。

### 28.2 analyzer-contract.ts（§148 八字段必答 + §149 盲区四态映射）

- `normalizeAnalyzerReport(input)`：analyzer（ANALYZER.* 词形）/scannedScope/objectsResolved/relationsResolved/unsupportedConstructs/unresolvedConstructs/parseFailures/confidence/sourceSha 八位必答（缺席=SCHEMA_INVALID——「只返回成功项」结构性写不出合法报告）；**确定性宣称杀手**：parse_failures 或 unresolved 非空 ⇒ 禁 deterministic（假绿洗白封死；unsupported 是声明面缺席不禁）；sourceSha 须过 sha256 词形（§132 Graph Rebuild 可重复性锚）。
- 盲区四态零新词：PRD_BLINDSPOT_STATES 四值是 PRD §149 原文词形**文档镜像位**（一词二形成文收编先例）；规范存储位 PRD_BLINDSPOT_STATE_MAPPING → OBSERVED ∪ NEGATIVE_OBSERVATION_VALUES（SUPPORTED_AND_OBSERVED→OBSERVED / SUPPORTED_NOT_FOUND→OBSERVED_ABSENT / UNSUPPORTED→NOT_OBSERVABLE|SENSOR_UNAVAILABLE|PERMISSION_DENIED|ENVIRONMENT_INVALID / FAILED_TO_OBSERVE→PROBE_FAILED|INCONCLUSIVE），装载期自检 canonical ⊆ 既有词面。`partitionBlindSpotAttempts`：分母封闭四态分账（observed+absent+unsupported+blindspot=total）——**FAILED_TO_OBSERVE 恒盲区位绝不折算 absence**（§149 逐字禁令；unchecked_in_blindspot_estimated 同名键位语义；零分母禁当满分）。

## 29. Resolver 门面 + New Entity Gate 解析侧（P-v06 批次 0 · 批次 2 派生面并拢 · PRD v0.6 §98 + v0.6.1 §69/§73/§75/§87）

- `resolveNeed(store, catalogRoot, {need, hints?})`（纯读零写入；解析≠采用——INSTANCE_OF 边归显式采用动作经 registerRelation）：三精确腿（parseGovernedId → resolveAlias 本体零改动 → equivalence active 全等）+ 词形腿（knowledgeQueryTokens 同一实现，词级精确禁子串）；两分母（truth-index objects + loadCatalogArchetypes）。
- match_class 确定性派生（禁主观判档）——派生优先级固定序 **EXACT > COMPOSABLE > CONFIGURABLE > EXTENSIBLE > REFERENCE > NO_MATCH**（批次 2 起六值全派生）：
  - EXACT_MATCH=精确腿在册命中；
  - COMPOSABLE_MATCH（批次 2）=core 命中 archetype 集合 |C|≥2 且 C 内存在组合链——组合链=core 命中集上的无向图，边=任一端 composition.requires / composition.optional 含另一端 id（或反向）；matches=参与链（连通分量 ≥2）的 archetype（matched_tokens 数降序、id 升序）；why=「多标准件组合可满足——v0.6.1 §69」；
  - CONFIGURABLE_MATCH=core 命中 ≥1 且无组合链（v0.6.1 §70 用户管理判例）；
  - EXTENSIBLE_MATCH=core 零命中且仅 truth 词形命中；
  - REFERENCE_MATCH（批次 2）=refOnly 命中 ≥1——某 archetype 的命中 token 全部 ∈ referenceTokens（coreTokens 零命中）；why=「外部参照体系命中——需求描述的是参照实现而非本项目对象」；
  - NO_MATCH=两分母零命中。
  - 词形腿双 token 集（批次 2）：每 archetype coreTokens=knowledgeQueryTokens（title + id + summary + semantic 三槽）；referenceTokens=knowledgeQueryTokens（x-research-anchors.note + urls）且剔除与 coreTokens 重叠的 token。
  - sources_examined 批次 2 增量两位（向后兼容只增不删）：`composable_links`=core 命中集上的组合链边数；`reference_hits`=refOnly 候选数（命中 token 全 ∈ referenceTokens 的 archetype 数）。
- §73 输出契约：matches/alternatives/required_bindings（命中 archetype composition.requires 聚合）/required_gates（恒含 NEW_ENTITY_GATE_DEF=`POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0` 披露位）/why/sources_examined（分母披露——NO_MATCH 的可信度来自分母在场，禁「没查就说没有」）。
- §87 Anti-Hallucination：NO_MATCH 显式不臆造；advisory 面（knowledge/policy）命中不改变 match_class（advisory ≠ match）。
- `newEntityVerdictFromResolution(matchClass)`：NO_MATCH → 五否成立允许 Design New；其余任一 match_class → new_entity_allowed=false + denied_by=[matchClass]。**批次 2 起五否全机判闭合**：exact/configuration/extension 三否由 EXACT/CONFIGURABLE/EXTENSIBLE 承载；composition 否由 COMPOSABLE_MATCH 承载（组合链命中即组合可满足，否不成立）；adapter/参照否由 REFERENCE_MATCH 承载（参照系已有落点）——New Entity Gate 解析侧唯一判卷源（「同一函数，不两套」），词表外值 SCHEMA_INVALID。
- `loadCatalogArchetypes(catalogRoot)`：archetypes/ 目录 readdir（opt-in——目录缺失=空数组合法状态，禁空壳仪式 PRD v0.6 §10；在册则逐文件 fail-closed：id 词形/kind ∈ CATALOG_KIND_VALUES/layer ∈ SUBSTRATE_LAYER_VALUES（v0.6.1 §2 七层）/composition 三槽 catalog id 数组/semantic 三槽）。批次 2 增量：`CatalogArchetypeMaterial.referenceAnchors`（物料 `x-research-anchors.note` + `sources[].url`）可选装载——字段缺席 → note=null/urls=[] 诚实缺省不新增必填校验，槽位在场坏形仍 fail-closed。archetype 物料 id/kind/layer 词形见 vocab-lock@v0.5-resolved catalog_layer_vocab.catalog_kind + software_graph_vocab.substrate_layer（PR-0006）。

## 30. import 静态扫描 Analyzer（P-v06 批次 2 Frontend 模型 · PRD v0.6 §103/§148 + §6-8）

- `analyzeImportGraph({files, mapping, sourceSha})`：analyze-only 封条（导出面无写函数、零 fs——内容注入、零 store 依赖；spec-analyzer.ts 先例）。产出 `{report, edges, externalImports, unmapped}`。
- 扫描面：静态 `import ... from '...'` 与动态 `import('...')` 两条正则；**已知边界诚实声明——不做注释内 import 剔除**（误报风险由置信级承载）；re-export/require/CSS 引用不在扫描面。相对引用（`./` `../` 开头）以源文件目录折叠为仓库相对 posix 路径后按候选后缀序归一（原样/.ts/.tsx/.vue/.js//index.ts——RELATIVE_IMPORT_CANDIDATE_SUFFIXES，首个命中 mapping 者胜）；裸引用（包名）只计数 externalImports（不进边、不进 unmapped）。
- 边提案 `{source, target, type: "CALLS", locator: 源文件路径}`（不落盘——登记由消费方经 registerRelation 显式执行；EDGE 内容寻址幂等使重复扫描重放 noop 安全；(source,target) 去重、(source,target,locator) 字典序确定性）。mapping 值非法（不过 parseGovernedId A5 文法）→ SCHEMA_INVALID 整体拒绝；源文件未登记 mapping → 不产边且进 unmapped（reason=source_not_mapped，禁静默丢弃）；目标候选全部未命中 → unmapped（reason=target_unresolved）。
- report 经 normalizeAnalyzerReport（§28.2 单一实现）：analyzer=`ANALYZER.TS.IMPORT_GRAPH`（批次 1 Tracer 词面锚）；objectsResolved=命中 mapping 的文件数、relationsResolved=edges 数、unresolvedConstructs=unmapped 清单、parseFailures=[]、confidence=unmapped 空 → deterministic / 非空 → probable、sourceSha 过 SOURCE_SHA_PATTERN。

## 31. Engineering Catalog 读取与 relock 恢复键（P14 + P-v06 批次 2.5 · PRD §44.10 + §92.2 + D24）

- 完整性三层（批次 2.5 成文）——哈希校验的是 pomaster 自身资产与治理状态的「未被静默篡改」，不是项目过程文档的写作流程：①工具自身资产（catalog/ 受控五节）= hash 强呈现（catalog status 漂移 exit 1 体检异常显性 + `pomaster catalog relock` 恢复键）；②项目治理产物（.pomaster/**）= D24 只报不拦（reconcile content_drift 呈现，修正走治理面显式事务）；③词表/schema = VOCAB_MISMATCH FATAL（closed-world 根不属「项目文档」）。
- `relockCatalog(catalogRoot)`（P-v06 批次 2.5 新增；纯计算零写盘——返回 next 内容，落盘归 CLI 层，分层纪律同 status/explain）：扫描 CATALOG_SECTIONS 五节全部 *.json（逐文件读 id——缺失/非字符串 SCHEMA_INVALID fail-closed；id 跨节重复 SCHEMA_INVALID）+ content_sha256 = sha256OfUtf8(文件字节)（与 verifyCatalogLock / materialize producer 同一口径，复用单一实现）；entries = 扫描条目按 id 排序（source_ref 沿 previous 同路径条目——provenance 不重写历史，全新条目 = `package://catalog/<path>` 确定性缺省）；controlled_children.allowed = required = 全部扫描路径排序；catalog_version/profile/x-digest-ethics/note 等扩展键原样保留（原键序）；generated_by 幂等追加 CATALOG_RELOCK_GENERATED_BY_NOTE（`pomaster catalog relock（CLI 恢复键；幂等重锁不含时戳——A4）`——已含则不重复，无时戳故同物料两次 relock next 字节全等）。返回 { previous, next, added, removed, refreshed }（路径级 diff，refreshed = 同路径 hash 变化）。边界 fail-closed：lock 缺失/坏形透传 NOT_CONFIGURED/SCHEMA_INVALID（relock 不是初始化工具）。
- `pomaster catalog relock`（CLI；无授权闸——Owner 裁决 2026-09-03：幂等重算 sha256 是 D24 工具侧动作非治理事实）：kernel relockCatalog → CLI 字节落盘（indent=2 + 非 ASCII 原文 + 尾换行，与 materialize producer 落盘形态一致）→ 写后 verifyCatalogLock 复验 ok → 人读呈现 diff 计数与路径（≤10 条全列，超出到 10 条+省略行）+ `catalog-lock: relocked & verified（N entries）`；--json 走 §45 五键信封（result = catalog_root/entries_total/added/removed/refreshed）。写后复验非 ok → CATALOG_LOCK_DRIFT fail-closed（重锁产物对账不过绝不假绿）。status 漂移保持 exit 1（体检命令异常显性），修复点 = 恢复键。
- 漂移 hint 全扫改指恢复键：cli driftError 与 kernel readCatalogLock/verifyCatalogLock 的 detail/hint 首选 `pomaster catalog relock`（catalog/tools/materialize_*.py 提法降为次选）。

## 32. 任务内 Context negative history（W1-R1-7 · 09-10 PRD REQ-03/AC-02）

- 需求锚：REQ-03「Context 含已否定方案/失败原因/约束；未命中保持未知」+ AC-02「已否定方案经 Context rollover 可重新获得（Goal/Constraint/失败原因和证据可重新获得；重试旧方案须新依据）」。W0 reuse-map REQ-03 行裁定「沿 task notes 扩展不建第二库」——扩展点 = task_object payload 自由区字段 `negative_history`（02 信封 payload 层 additionalProperties true——`source_refs` 同款自由区词位：不新增 schema 字段、不新增 canonical kind、不建第二真值库；否决 knowledge-library 借道——KNOWLEDGE_INJECTABLE_STATUSES 排除 REJECTED 是已裁定且有对抗测试钉死的语义，不破坏不扩分母）。
- 条目形状（snake_case；六字段逐键）：`{approach, reason, evidence_ref|null, status:"REJECTED", recorded_by:{actor_type,actor,self_attested}, recorded_at_seq}`。approach/reason 必填非空（检索键承载；不留原因的否定 = 静默禁）；status 恒 REJECTED 字面量（复用既有词形不发明——REJECTED 在 LIFECYCLE/KNOWLEDGE/REVIEW 词表均在座）；recorded_at_seq 是 store 事件拍采样（A4 禁墙钟）。
- `appendTaskNegativeEntry(store, {taskRef, approach, reason, evidenceRef?, recordedBy})`：唯一写通路。NOT_CONFIGURED 守卫 → taskRef 词形闸（TASK.* 前缀，非 TASK 前缀 FATAL_UNKNOWN_PREFIX）→ 在册检查（OBJECT_NOT_FOUND）→ kind 闸（非 task_object SCHEMA_INVALID——negative history 是任务内台账，禁跨 kind 借位）→ 读正文校验既有字段面 → 合并条目 → 信封重建（snake→camel 逐字段镜像 applyUpsertObject 落盘组装；除 payload 外逐字段原样保留，必填键缺失 = 手改痕迹 SCHEMA_INVALID）→ `applyTransaction(upsert_object)`（TransactionOp 联合零新 op；lifecycle/axes 不变——不触发转移矩阵，无需 authorityRef；journal TX_APPLIED 留痕）。每次调用 = 一次否定事件（非幂等覆盖，ledger.recordException 先例）。返回 `{taskRef, entry, entryIndex, totalEntries, appliedSeq}`。
- `readTaskNegativeHistory(paths, taskRef)`（纯读零写入）：索引缺席/对象不在册/非 task_object/正文缺失或不可解析/字段缺席 → `[]` 诚实缺席不猜测（referencedSourceIds 同款——对象存在性归信封层判，本字段面不越权）；字段在场但畸形 → SCHEMA_INVALID fail-closed（本模块是唯一写通路，畸形只可能来自手改——readKnowledgeLibrary 装载面同款纪律）。
- `searchTaskNegativeHistory(entries, query)`：词级精确 token 交集（knowledgeQueryTokens 同一实现——禁子串/等价猜测，P31 纪律）；检索键 = approach + reason；空 query（token 化后为空）= 列全部（清单语义）；命中按 entryIndex 升序（登记顺序 = 时间谱序，D24 确定性）、matchedTokens 字典序（why-matched 可判卷）；未命中显式空不虚构。
- 投影消费（projection.consumeNegativeHistory）：taskRef 对象的 negative_history → `advisoryEntries`（[ADVISORY] 分区，context compile 落位 ADVISORY KNOWLEDGE 分区与 manifest.advisory_entries 键——CLI context.ts 零改动自动落位）。ref 词形 `${taskRef}#negative_history[${i}]`；reason 携带 `ADVISORY: negative history` + approach/reason/evidence_ref/status/recorded_at_seq + AC-02 尾注「重试不被机器禁止，但须新依据（流程纪律，非阻断闸）；不进 gate 判卷输入（GOLDEN-L8-3）」。**语义边界：只做可见性，不新增阻断**——重复尝试不被禁止，「曾否定+原因」可见是本切片的全部施断。指纹绑定双保险：条目在 manifest.advisoryEntries + 数据在 truth 正文层（scopeContentRowsOf 边界③ taskRef 正文 rev/body_sha256）——append 后指纹必变；重编译字节稳定 → rollover 后仍可检索（AC-02）。
- `pomaster negative-history record/search`（CLI 命令面；判卷权威在 kernel，本面只做 argv 收敛与呈现）：record `<task-id> --approach <text> --reason <text> [--evidence-ref <ref>] --actor <type>:<name>`（requiredOption 闸 + kernel 词形闸双层）；search `<task-id> [query]`（query 缺席 = 列全部；未命中显式「无记录」；纯读零建账——requireInitialized + buildStorePaths + kernel 读取面，零 createStore）；均走 §45 --json 五键信封。
- 词形治理注记（Semantic Change Proposal 待办）：命令组名 `negative-history` 属命令面非词表管辖面（P33b/P34b 先例——落档本节待 Owner 追认）；payload 字段面 `negative_history` + 条目字段名不入 vocab-lock 主表（`source_refs` 同例），建议随下一轮词汇表 PR 登记。

## 33. Checkpoint 恢复引用快照（W4-S2 · 09-10 PRD §6-1 + 战役 W4 R4-1）

- 语义裁决：checkpoint = 对「恢复所需世界状态引用集」的**显式快照**，不是新真值库——每项都是**引用**（既有实体），本体只是可重建的引用清单文件（§6-1「优先复用现有记录，不按清单创建新库」逐字）。红线三条：零新 canonical kind（分区档案面沿 trace seal 定位；零 TransactionOp、不进 truth-index、不进 content_digest）；不自动创建（显式命令触发）；零 journal 事件（P34 新分区先例；A4 时点锚 = captured_at_seq 采样，无墙钟）。
- 落盘：`state/checkpoints/CKPT-*.json`（durable 进 Git——恢复引用须跨重启/clone 存活，runtime/ 易变面不适用；traces/ 是 AGX 锚定执行行为投影分区【裁决 8 ②固定语义】，task 锚定的恢复面不入）。kernel paths.ts `checkpointsDir` 登记 + CLI layout.ts LAYOUT_DIRECTORIES 双向对账（沿 state/contexts/ 同类先例——per-task 生成服务面）。
- 引用清单闭形态（11 键；`pomaster.checkpoint/v1`；缺席 = null/空数组显式 C1）：`{checkpoint_id, schema, task_ref, permit_ref|null, execution|null{execution_id, inflight_receipts{state: recorded|none, receipt_count}}, task_surface{acceptance_ref, acceptance_count, negative_history_ref, negative_history_count}, unknowns_refs[], trace_ref|null{path, plane}, workspace_anchor{anchor_status: collected|absent, git_head|null, dirty_summary|null, note}, note|null, captured_at_seq}`。
- `saveCheckpoint(store, {taskRef, permitRef?, executionId?, ckptId?, note?, workspaceAnchor?})`：引用逐项存在性校验 fail-closed 零落盘——task 锚（词形闸 TASK.* → 在册 OBJECT_NOT_FOUND → kind 闸 SCHEMA_INVALID → 正文 → acceptance 计数[缺席诚实 0、在场漂移 SCHEMA_INVALID] + negative_history 计数走 readTaskNegativeHistory 同一装载面）；permit 台账成员判定（PERMIT_NOT_FOUND 透传——恢复时 `session attach --reconcile` 的判卷引用）；execution 走 assertExecutionAttachable（SCHEMA_INVALID / EXECUTION_NOT_FOUND 同款——S1 禁自造身份）+ countExecutionInflightReceipts 结果（W4-S1 同轴 recorded|none 复用零新词轴）+ 封存 trace 存在性（durable 优先，缺席显式 null）；unknowns_refs = Exception Ledger 锚定本任务的 OPEN_QUESTION EXC 引用（view review Known Unknown 同一判据，禁第二套启发式）；workspace 锚 = 调用方采集显式申报（gitHead + dirty 两计数三键成组，半给 SCHEMA_INVALID 禁静默补零；缺席 = anchor absent 显式申报——锚定诚实，非伪造），note 恒带「保存时点快照，非实时」。缺省 id 分配 = 现有最大序号 +1（CKPT-00001 五位零填充，allocateExecutionId 同法）；落盘前并发复核（beginExecution A1 同族）。
- 幂等纪律（store 同款）：显式 `--ckpt` 同号重放按重算引用集字节比对——一致 = 零写入幂等短路（replayed=true）；异内容 = `CHECKPOINT_ALREADY_EXISTS` 显式冲突（EVIDENCE_ALREADY_EXISTS 同族语义——世界演进后旧号不可静默覆写恢复快照）。
- `readCheckpoint(paths, checkpointId)`（纯读零写）：缺席 → null（调用方翻译 CHECKPOINT_NOT_FOUND）；损坏/id 不一致/schema 漂移 → SCHEMA_INVALID（loadSealedManifest 同款 fail-closed 装载）。
- `pomaster checkpoint save/show`（CLI；判卷权威在 kernel，本面只做 workspace 锚 git 只读采集[rev-parse HEAD + status --porcelain 计数；任何失败 = absent 显式申报] + argv 收敛与呈现）：save = 引用集快照落盘 + 恢复通路路标；show = 引用面纯读呈现（零写入字节快照钉）。**分层纪律（与 W4-S1 组合）**：checkpoint = 引用快照（保存时点存在性），reconcile = 新鲜度判定（恢复时点）——save/show 不做新鲜度判定、不重跑对账；恢复通路 = `session attach --task <ref> --reconcile <permit>`。
- 词形 SP 提案待 Owner 追认：`pomaster.checkpoint/v1` schema、`CKPT-<n>` id 词形（AGX-n 同款通路编号，非 governed 前缀）、`CHECKPOINT_NOT_FOUND` / `CHECKPOINT_ALREADY_EXISTS` 错误码、anchor_status 两值轴（collected|absent）；复用闭集：NOT_CONFIGURED / OBJECT_NOT_FOUND / SCHEMA_INVALID / PERMIT_NOT_FOUND / EXECUTION_NOT_FOUND / FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR、recorded|none（W4-S1 execution_inflight_evidence）。

## 34. Steering 事件建模（W4-S3 · 09-10 PRD REQ-08/AC-07 + §6-5）

- 需求锚：REQ-08「Steering 是现有任务的有来源事件，按影响范围重编译约束、Context、计划和证据适用性」（受影响 pending work 被标识；旧结果不覆盖新 Expected；无关安全工作可继续）+ AC-07 + §6-5「Steering 可使部分计划、Permit 或证据失效；保留≠永远有效」。W0 evidence-invalidation-map A6 行「Steering 全库零匹配」的「无事件载体/无消费者」半边由本切片闭合；完整「pending work 停止/旧结果失效传播/证据适用性重判」仍是 REQ-08 远期（诚实标注——本片交付第一类事件面+投影+重编译输入面可见，不冒充失效传播已实现）。W2 S5 拍先例（negative-history 演示性登记 Steering 约束）由本通路升级为第一类事件面。
- 载体裁决（W0 §5-6 最小增量方向 = 沿现有 journal 事件面扩词形）：数据落 `state/steering-log.json`（append-only 事件台账——exception-ledger 同款 sidecar 形态；STE-<n> 引用 = EXC-n 同法「现有最大序号 +1」确定性分配）；journal 事件词形 `STEERING_RECORDED`（SP 提案——journal.jsonl 事件词形常量集追加，EXCEPTION_RECORDED/KNOWLEDGE_RECORDED 既有事件词形族；A2 纪律：sidecar staged 提交成功后 appendLine，「台账先行、journal 缺行」是可检出残态）；零 TransactionOp（negative-history「联合零新 op」通路层封条同款纪律——避免波及 compact 重放/reconcile REV_ADVANCING_OPS/D-4 权威闸三消费者）、零 canonical kind、不进 truth-index、不进 content_digest。
- 条目形状（snake_case；闭形态 8 键）：`{steering_ref, task_ref, constraint, source_ref, affected_scope[], declared_by:{actor_type,actor,self_attested}, recorded_at_seq, note|null}`。constraint/source_ref 必填非空（REQ-08「有来源」——无来源的纠偏不构成事件）；affected_scope = 对象/能力词形数组（条目 trim、空串剔除；[] = 全 task 显式申报——缺席语义显式化非猜测）；recorded_at_seq 是 store 事件拍采样（A4 禁墙钟；sidecar 面零 seq 推进——recordException 同款）。
- **诚实红线（申报面/判定面分离）**：constraint 是申报面——机器不判定「约束是否被遵守」（那是 exec-guard/audit 的职责），只提供可检索、可投影的载体；affected_scope 申报不机器验证（投影/呈现词形显式标注 declared）。
- `recordSteering(store, {taskRef, constraint, sourceRef, affectedScope?, declaredBy, note?})`：唯一写通路。NOT_CONFIGURED 守卫 → taskRef 词形闸（TASK.* 前缀，非 TASK 前缀 FATAL_UNKNOWN_PREFIX）→ 在册检查（OBJECT_NOT_FOUND）→ kind 闸（非 task_object SCHEMA_INVALID——禁跨 kind 借位）→ constraint/source_ref 必填闸 → affected_scope 归一 → STE-n 分配 → 台账 staged 提交（executeWrites）→ journal `STEERING_RECORDED` appendLine。每次调用 = 一次事件（非幂等覆盖，ledger.recordException 先例）。零 store 事务（truth-index/seq 零推进）。返回 `{record, appliedSeq, totalForTask}`。
- `readSteeringLog(paths)` / `readTaskSteeringConstraints(paths, taskRef)`（纯读零写）：文件缺席 → [] 诚实缺席不猜测（opt-in 登记面）；文件在场但畸形 → SCHEMA_INVALID fail-closed（本模块是唯一写通路，畸形只可能来自手改——readExceptionLedgerFile 装载面同款纪律）；readTaskSteeringConstraints 按登记序过滤本任务条目（projection/context compile 与 CLI search/plan compile 共用同一装载面）。
- `searchTaskSteeringConstraints(entries, query)`：词级精确 token 交集（knowledgeQueryTokens 同一实现——禁子串/等价猜测，P31 纪律）；检索键 = constraint + affected_scope（source_ref 是出处指针非散文，不入检索键）；空 query = 列全部（清单语义）；命中按登记序（全局流水序 = 时间谱序，D24 确定性）、matchedTokens 字典序；未命中显式空不虚构。
- 投影消费（projection.consumeSteering）：本任务的 Steering 条目 → `advisoryEntries`（[ADVISORY] 分区，永不进 gate 判卷输入——§83.2 铁律 / GOLDEN-L8-3 消费层防线）。**词形区分（W4-S3 设计定案）**：reason 携 `[STEERING]` 标记 vs [ADVISORY] 经验条目；ref = STE-<n> 全局事件引用（检索/计划呈现可回指台账行）；affected_scope 空时呈现「（全 task——未申报对象/能力词形）」不猜测。指纹绑定：advisoryEntries 进 inputsFingerprint——登记后 context compile 指纹必变（受影响工作下次编译带上约束的机器判据）；重编译字节稳定（rollover 后仍可检索）。
- plan compile 接缝（cli plan.ts steeringUnknownsFor）：`--task` 通路把本任务 Steering 约束申报呈现为 changeSurface.unknowns（kernel input_unknown 词形——[STEERING] detail 携 constraint/source_ref/affected_scope declared 注记）。**不阻断**：applicability 计数与无约束时一致（申报面不是判卷输入）；指纹必变（REQ-08「重编译」最小形态 = 约束在编译输入面可见）；affected_scope 与本次变更面的对齐判定缺席 = 显式保留 unknown；台账损坏 fail-closed 拒绝编译（静默当零约束 = 分母漂移）。
- `pomaster steering record/search`（CLI 命令面；判卷权威在 kernel，本面只做 argv 收敛与呈现）：record `<task-id> --constraint <text> --source-ref <ref> [--scope <word>]… [--note <text>] --actor <type>:<name>`（requiredOption 闸 + kernel 词形闸双层；--scope 可重复）；search `<task-id> [query]`（query 缺席 = 列全部；未命中显式「无记录/无命中」；纯读零建账——requireInitialized + buildStorePaths + kernel 读取面，零 createStore）；均走 §45 --json 五键信封。
- 词形 SP 提案待 Owner 追认：journal 事件词形 `STEERING_RECORDED`（journal 事件词形常量集追加——「词形扩展是否等同新增 kind」是 W1 裁定边界，本切片只扩词形常量集并留痕提案，不动 vocab-lock 主表）、`pomaster.steering-log/v1` schema、`STE-<n>` 引用词形（EXC-n/CKPT-n 同款通路编号，非 governed 前缀）、命令组名 `steering`（命令面非词表管辖面——P33b/P34b 先例）；复用闭集：NOT_CONFIGURED / OBJECT_NOT_FOUND / SCHEMA_INVALID / FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR。

## 35. Provider 能力映射（W4-S4 · 战役 W4 R4-3 + 09-10 PRD REQ-11/R §5.2 Provider-neutral）

- 需求锚（R4-3 逐字）：「Provider 能力映射：原生 async/steering/取消有无如实报告；无则按声明安全边界降级」+ 红线「不把某 Provider API 叙述当跨 Provider 保证」。R §5.2 Provider-neutral：可在无原生 async/steering 的环境验证治理契约，再由 Adapter 报告支持程度。reference-patterns §4 候选降级词形逐条承载：「无工具发现时预先编译较小工具集；无原生 async 时采用有持久记录的同步步骤/轮询；无原生 steering 时在下一派发边界应用新约束；无法立即取消时明确状态并隔离冲突结果——这些是产品可验证的降级语义，不是假定已有的 API」。
- 与 §58 三探针的关系（平行扩展零破坏）：runtime-adapter.ts 三探针服务「多 Agent 性」判定（§58 四条降级规则）；本模块（kernel provider-capabilities.ts）服务**长时运行四维能力**的如实报告与降级声明。AgentRuntime/RuntimeCapabilities 契约面零改动；真实 Provider 适配（DEF-RUNTIME-ADAPTER）是后续——本片只落**能力探测与报告面**，不引入真实 Provider SDK（R P5）。
- 四维度 × 三值词形（SP 提案待追认）：`PROVIDER_CAPABILITY_DIMENSIONS = native_async | native_steering | cancellable | tool_discovery`（探针方法名轴 `supportsNativeAsync/NativeSteering/Cancellable/ToolDiscovery` 逐位机械映射）；支持度 `native`（探针确证支持）/ `absent`（探针确证不支持）/ `unknown`（**探针缺席或报错——禁猜**：缺探针 ≠ 不支持、报错 ≠ 支持）。方法在场返回非布尔 → `SCHEMA_INVALID`（§58 三探针同款纪律：静默真值化会把「探测不出」洗成「支持」）。判词依据轴 `basis = probe_true | probe_false | probe_absent | probe_threw`（unknown 有据非猜测；probe_error 留错误摘要）。
- 降级语义声明面（absent/unknown 同映射——未确证的能力不使用，安全边界；词形区分留在 support 位）：`native_async → sync_steps_with_persistent_record`（有持久记录的同步步骤/轮询；锚 = AGX-n 执行台账 + journal）、`native_steering → constraint_at_next_dispatch_boundary`（下一派发边界应用新约束；锚 = W4-S3 Steering 事件面 recordSteering + context/plan 编译消费）、`cancellable → explicit_status_and_conflict_isolation`（在途状态明确呈现 + 隔离迟到冲突结果不盲重放；锚 = W4-S1 execution 在途诚实分态 recorded|none）、`tool_discovery → precompiled_smaller_toolset`（预编译较小工具集；锚 = catalog/ToolBinding 预编译工具面）。降级是**声明式**的：每条 anchor 指向仓内已就位载体，本模块不实现边界本身、不对 Provider API 作假定。
- `probeProviderCapabilities(runtime: ProviderCapabilityProbe): ProviderCapabilitiesReport`（纯函数零 IO 零墙钟）：四维逐位探测，每维探针恰调用一次（不缓存不重试不推断——§58 探测纪律同构）；报告 `{degraded（任一维非 native）, all_unknown（全 unknown = 未接入真实 Provider 的诚实缺省形态）, native_count, rows[]}`，rows 顺序 = 维度轴顺序（字节稳定）。**零硬编码 Provider 型号断言**：报告由探针结果唯一决定（不同「型号」适配器同探针结果 → 报告同形）。
- `pomaster provider capabilities --runtime <名>`（CLI；判卷/探测权威在 kernel，本面只做 argv 收敛与呈现）：`--runtime` 过 `EXECUTION_RUNTIME_VALUES` 闭包（claude-code|codex|script——D 线 §2.1 必填枚举，词表外 `VOCAB_INVALID_VALUE` fail-closed，扩值走词汇表 PR）；呈现维度×词形×降级语义矩阵 + 注记（全 unknown 时带「诚实缺省」注记；恒带「不把某 Provider API 叙述当跨 Provider 保证」注记）。`report_source` 诚实标注 `injected_probe`（嵌入方经 deps.resolveProbe 注入实测）vs `declarative_default`（缺省无真实 SDK——全 unknown），不冒充实测。纯报告零 store 依赖（不 createStore、不 requireInitialized、零读写 .pomaster）；ok = 报告成功产出（degraded 不是失败——如实报告正是交付物，REQ-11「档位可解释」可演示形态）。
- 词形 SP 提案待 Owner 追认：四维度轴 / 三值支持词形 / 四值 basis 轴 / 降级 id 词形（`sync_steps_with_persistent_record` 等四值）/ 命令组名 `provider` + 子命令 `capabilities`（命令面非词表管辖面——P33b/P34b 先例）；复用闭集：SCHEMA_INVALID / VOCAB_INVALID_VALUE、EXECUTION_RUNTIME_VALUES（既有在册词轴，零新增）。
- 对照测试：kernel provider-capabilities.spec.ts 19 例（三值词形探针驱动 / 降级映射逐维 / 词形闭包 / 确定性 / 零 Provider 断言 / §58 三探针零破坏回归）；cli provider-commands.spec.ts 10 例（声明式缺省报告 / --runtime 词形闸 / 注入探针实测与违例 fail-closed / runCli 程序面 / 未初始化目录零落盘）。
