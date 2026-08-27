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
- TTL 按事件拍计（禁墙钟，D2/A4）：`expiresAtSeq = currentSeq + ttlBeats`。
- `checkPermit` 显式四态：allowed / denied（outside_scope、policy_forbidden、delete_forbidden_supersede_only）/ expired / unknown_permit——禁止静默放行或静默拒绝。DENOMINATOR 的 delete 一律 denied。
- `stealPermit`：D2——TTL 过期仅允许手动显式接管并记 journal 事件（actor/reason 留痕）；自动抢占被禁止；未过期 → `rejected_not_expired`。
- scope expansion 拒绝静默放行 → 路由重审升级（D20，GOLDEN-L8-2）。

## 5. 投影（八拍③）

### `compileProjection(store, request) => Promise<Projection>`

最小充分上下文投影。契约不变量（GOLDEN-L8-3 判据）：manifest 中与 task 无关的 `POLICY.` 条目 = 0；MUST/ADVISORY 分层可见且 ADVISORY 不进 gate 判卷输入；`inputsFingerprint` 保证同输入重放字节稳定。纯派生视图：不写 store、不产生治理事实。

## 6. Gate 归一（八拍⑤）

### `normalizeGateResult(raw: Claimed<unknown>, context) => GateResult`

把工具/Agent 的 CLAIMED 输出归一为 03-gate-result 形态：
- verdict 词表外值 → FATAL（七态词表 `VERDICT_VALUES`）；
- `notApplicable` 缺失/NaN → FATAL（缺席必须显式表达）；
- `subjectId` 前缀 `TEST.*` ⇔ `isFixture=true` 双向强校验（Q3）；
- `trust.asserted` 保留为 CLAIMED；`recomputed` 是判卷唯一依据；失配 → `mismatch.detected=true`（recomputed_wins_recorded / escalate_to_authority）；
- 本函数永不阻断写入；gate 的阻断语义由 closeout 编排层按 verdict 施加（写阻断与判卷分离）。

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
  `state/permits.json`（许可台账，含 stolen 标记留档）、`state/journal.jsonl`
  （TX_APPLIED / PERMIT_ISSUED / PERMIT_EXPIRED_OBSERVED / PERMIT_STOLEN 事件流）。
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
