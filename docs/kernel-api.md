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
- 实现要求：staged 写入 + 失败回滚；清理路径不得凭存在性推断删除原件（staged-replace 事故教训）。

`TransactionOp` 判别联合：`upsert_object` / `transition_object` / `register_producer` / `heartbeat`（追加 runtime 侧车，不进 hash）/ `append_denominator` / `record_claim` / `record_gate_run`。

## 2. 转移引擎

### `validateTransition("lifecycle", from, to) => TransitionOutcome`

纯函数。拓扑来自 `LIFECYCLE_TRANSITIONS`（vocab-lock FROZEN 镜像）：
`PROPOSED→CURRENT/REJECTED`（requires authority_approval）、`CURRENT→SUPERSEDED/DEPRECATED`（requires transition_record）、`DEPRECATED→RETIRED`（附加 grace_policy: config）、`SUPERSEDED/RETIRED/REJECTED` 终态（SUPERSEDED ⇒ successor_ref 必填）。
其余轴（confidence/evidence/change）v0.1 无矩阵；扩轴走词汇表 PR 后再扩签名（`TODO(vocab-pr)`）。
跨轴耦合断言（如 `change=MIGRATING` 必持 ACTIVE PERMIT、`evidence=VERIFIED ⇒ realization=wired`）归 `applyTransaction`/REF_INTEGRITY，不在此纯函数。

## 3. ID 解析与别名（A5 / A6）

### `parseGovernedId(id) => ParsedGovernedId`

closed-world 文法解析；未知前缀（`unknown_prefix`）或 SEGMENT/SEQ 文法违规（`grammar`）→ throw `GovernedIdParseError`（FATAL，无 WARNING 档）。前缀白名单 = `GOVERNED_ID_PREFIXES`（15 前缀）。

### `resolveAlias(spelling) => AliasResolution`

A6 rename-on-ingest 双向链：legacy→canonical（收编）与 canonical→legacy（考古）。镜像 `ALIASES_V0` 五族；内置数字段规则 `TASK-0087→TASK.T0087`、`CHANGE-0104→CHANGE.C0104`（SEGMENT 不允许数字开头）；`PAGE-TASK-STEP-*` 走 token 重排。别名数组只减不增；结果仍须过 `parseGovernedId`（本函数不做 closed-world 裁决）。

## 4. Permit（八拍②五件套）

### `issuePermit(store, request) => Promise<Permit>` / `checkPermit(store, permitRef, attempt) => Promise<PermitCheckResult>` / `stealPermit(store, permitRef, by, reason) => Promise<StealResult>`

- `Permit.permitRef`：`PERMIT.*`（前缀未入 prefixes_v0，暂用 general_id 宽松词形，`TODO(vocab-pr)`）。
- TTL 按事件拍计（禁墙钟，D2/A4）：`expiresAtSeq = currentSeq + ttlBeats`；缺省 `DEFAULT_TTL_BEATS = 168`（C9「TTL 168h」的拍数映射，标称 1 拍 ≈ 1 rebuild 拍）。
- `request.subjectIds` 与 `request.capabilityIds`（可选，八拍②五件套之二）均过 `parseGovernedId` closed-world 校验（A5：词表外前缀/文法违规 → throw `GovernanceError(FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR)`）。
- **签发落五件套台账**（state/permits.json，内部状态文件；公共契约类型 `Permit` 不变）：除既有的 scope/requested_by/change_ref 外，同时落 `capability_refs`（capabilityIds）、`acceptance_shape`（五件套之五——契约面 `PermitRequest.acceptanceShape` 既有但实现此前从不持久化，本字段封死「验收形状静默丢失」坑）与 `baseline`（issue 瞬间的逐对象基线快照 `{at_seq, subjects: {[id]: {axes, rev, body_sha256?} | null}}`——journal 是事件流无 axes 历史，issue 瞬间是唯一能拿到该基线的时刻，closure；`null` = 签发时对象尚不存在（PROPOSED 新对象的合法基线态）；`body_sha256` 为 D24 读侧 identity/content_drift 判定用途，事务自动捕获，人永不计算）。`PERMIT_ISSUED` journal 事件携带 `capability_ids`。
- `checkPermit` 显式四态：allowed / denied（outside_scope、policy_forbidden、delete_forbidden_supersede_only）/ expired / unknown_permit——禁止静默放行或静默拒绝。DENOMINATOR 的 delete 一律 denied。**写副作用披露**：outcome=expired 时追加 `PERMIT_EXPIRED_OBSERVED` journal 事件（「过期→事件，不静默」；同 seq 可重复多行，同 seq 去重收敛归后续 kernel PR）。
- `stealPermit`：D2——TTL 过期仅允许手动显式接管并记 journal 事件（actor/reason 留痕）；自动抢占被禁止；未过期 → `rejected_not_expired`；未知许可（含已 stolen）→ throw `PERMIT_NOT_FOUND`。
- scope expansion 拒绝静默放行 → 路由重审升级（D20，GOLDEN-L8-2）。
- CLI 命令面：`pomaster permit issue / check / steal / list` 与 `pomaster exec-guard`（八拍④写路径执行点，纯判卷器）——编排与呈现契约见 `docs/eight-beat-carriers-design.md` §1/§2；list/事件链对 `state/permits.json` / `state/journal.jsonl` 的直读仅限读呈现，写通道唯一保留给 kernel（分层纪律）。

## 5. 投影（八拍③）

### `compileProjection(store, request) => Promise<Projection>`

最小充分上下文投影。契约不变量（GOLDEN-L8-3 判据）：manifest 中与 task 无关的 `POLICY.` 条目 = 0；MUST/ADVISORY 分层可见且 ADVISORY 不进 gate 判卷输入；`inputsFingerprint` 保证同输入重放字节稳定。纯派生视图：不写 store、不产生治理事实。

## 6. Gate 归一（八拍⑤）

### `normalizeGateResult(raw: Claimed<unknown>, context) => GateResult`

把工具/Agent 的 CLAIMED 输出归一为 03-gate-result 形态：
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

## 7. Doctor（D7 必检最小集四检）

### `doctorProbes(store) => Promise<DoctorReport>`

四探针（fail-closed，只读不修）：
1. `vocab_lock_consistency` —— 三指纹对账；
2. `dead_producers_empty` —— liveness=dead ⇒ DEFECT（经 heartbeat 对账重算，永不采信自报值，C5）；
3. `alias_conflicts_empty` —— 三重查重（canonical / normalized_key / 全部 alias）冲突非空即 DEFECT；
4. `local_binding_probe_replayable` —— LOCAL binding probe 可重放。

探针三态 pass/defect/`environment_error`——单机本地盘假设破裂（os.replace/pid 判定失效）必须报 environment_error，禁静默（D 线风险备忘）。`ok` = 全 pass。

## 8. 错误约定小结

| 信号 | 语义 | 通道 |
|---|---|---|
| FATAL | 词表外值 / 未知前缀 / 非法迁移 / 幽灵 owner / DENOMINATOR 删除 / notApplicable 缺席 | throw（GovernedIdParseError 等）或显式 outcome |
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
  evidence/change 补丁不触发自环误判）。
- **alias 收编的机械/数据面分界（GOLDEN-AX-04）**：GRID.*、TASK-*、CHANGE-* 三族
  mechanical=true（kernel 直接给出 canonical，双向链机械可逆）；KB 点分形态与
  PAGE-TASK-STEP-* / PAGE-APP-* 的重排 mechanical=false——resolveAlias 返回
  `matchedRuleLegacy`（家族命中）但 `canonical=null`，映射随对象 aliases[] 数据面登记。
- **GateResult v0 字段缺口**：03 亦要求 tool/tool_version/metric_dialect；
  kernel `GateResult` 契约不承载（GateRunner/gauntlet-lite 层职责），run 文件落盘时
  诚实缺席（不伪造），TODO: GateRunner 接线后补齐。
- **doctor 辅助导出**：`probeToolEnvironment(projectRoot)`（node/pnpm/git/gitHubCli →
  READY|NOT_INSTALLED；.mcp.json chrome-devtools → MISSING_CONFIGURATION+安装提示；
  src 引用 TEST.* → 违规探针）为契约四检之外的超集，供 CLI `pomaster doctor` 消费。

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
  不冒充「无漂移」）。kind 为 CLI 呈现层局部词 TODO(vocab-pr)；其中 `content_drift`
  词形是设计 §3.2 三值之外的第 4 词形，承载其自身 `content_drift=true` 状态所需的宿主
  （不冒用 `axes_change`——其定义明确要求四轴任一 from≠to）。
- **`exceptions`**：scope 内 subject 的证据平面扫描；runs 取 verdict ∈
  {failed, not_configured, skipped_blindspot}，claims 取 verification.verdict = REJECTED；
  row 级正文探测的 `content_tamper` 条目亦计入本段（见下）。
  证据平面损坏（*.json 无法解析 / verdict 缺失）→ throw `SCHEMA_INVALID`（禁静默跳过
  损坏证据）；run 文件兼容 kernel canonical（gate_result.result 内嵌）与 pre-canonical
  夹具（GateResult 直落顶层）两形态——与 compact 收编读取规则同一条线。
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
  （`subject_id` / `body_ref` / `index_sha256` / `body_sha256`；词形为呈现层局部词
  TODO(vocab-pr)，不冒用七态 verdict）追加在证据例外之后（subject_id 字典序）计入
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
