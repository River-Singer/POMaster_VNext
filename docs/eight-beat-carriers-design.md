# 八拍命令载体设计（P0 最小面：无 daemon、无编辑器 hook）

> 状态：**设计级**（实施前契约）。对应缺口 G1-G4+G6（`benchmarks/phaseC-demo-report.md` §5 实测确立；
> G7 是用户环境 PATH 引号问题，产品侧不改）。
> 八拍定义：`.trellis` research `vnext-lifecycle-and-loop.md`——② FRAMEWORK LOCK=人类主场五字段；
> ④ EXECUTE=Permit 内免检；⑥ RECONCILE=只审 delta/例外/抽样（D20/D21）；⑦ COMPACT=Truth 更新或
> NO_CHANGE。Kernel 接口语义以 `docs/kernel-api.md` 为准；本文只新增编排面与呈现面，不重造 kernel 逻辑。
>
> 全局纪律锚（每节默认继承，不再重复）：D24 哈希伦理（digest 只住读侧；人永不计算哈希）；A4 确定性
> （禁墙钟、seq 代号锚定、原子写 tmp+rename、同输入重跑字节稳定）；四态纪律（not_configured ≠ passed、
> 缺席显式、聚合不吞没）；词表纪律（零 FROZEN 改动、零新词值；呈现层局部词一律带 TODO(vocab-pr)）；
> §45 双输出（一切命令 `--json` 机读信封；失败必带 `errors[].hint` 路标）。

## 0. 总览

| 缺口 | 命令面（八拍） | kernel 复用 | kernel 新增 | 命令读写性质 |
|---|---|---|---|---|
| G1 | `permit issue / check / steal / list`（② FRAMEWORK LOCK） | `issuePermit` / `checkPermit` / `stealPermit` / `parseGovernedId` | `PermitRequest` 增可选 `capabilityIds`；`PermitRecord`（内部状态文件）增 `capability_refs` / `acceptance_shape` / `baseline` | issue/steal=事件写；check=判卷读（过期观察有 journal 副作用，见 §1.5）；list=纯读 |
| G2 | `exec-guard`（④ EXECUTE 机器执行点） | `createStore` / `checkPermit` | 无 | 纯判卷器：不碰目标文件、不写 store（过期观察 journal 副作用除外，同上） |
| G3 | `reconcile`（⑥ RECONCILE） | `createStore` / `loadTruthIndex` / `readJournalLines`（paths 层） | **新模块 `kernel/src/reconcile.ts`**：`reconcilePermit(store, permitRef, options)`；`issuePermit` 落基线快照 | 纯读（报告生成，零写） |
| G4+G6 | `compact` + `record gate-run / record claim`（⑦ COMPACT + 证据入账） | `applyTransaction` / `normalizeGateResult` / `gateResultToSnake`（间接）/ `parseGovernedId` | 无（纯 CLI 编排砖；GRN/CLM 分配与 pending 判定在 CLI 层，不触 store 内部） | compact/record=经 `applyTransaction` 的事务写；NO_CHANGE 合法 |

分层裁定（继承 `docs/architecture.md`）：`cli` 只做编排与判卷呈现，一切判卷权威在 `@pomaster/kernel`，
一切落库必经 `applyTransaction`。CLI 直读 `state/permits.json` / `state/journal.jsonl` 仅限**读呈现**
（list / 事件链），写通道唯一保留给 kernel（permits.ts / store.ts）。

命令名注册（`packages/cli/src/index.ts` 的 `createProgram`，commander 子命令模式与 `context compile` 同款；
信封 `command` 字段取多词全名）：

```text
pomaster permit issue | permit check | permit steal | permit list
pomaster exec-guard
pomaster reconcile
pomaster compact
pomaster record gate-run | record claim
```

---

## 1. G1 —— `pomaster permit`（八拍② FRAMEWORK LOCK 命令面）

### 1.1 命令与参数（全部支持 `--json`）

```text
pomaster permit issue
  --subject <governed-id>            # 可重复（commander collect），≥1；Permit 范围（五件套之四）
  --actor <type>:<name>              # 身份（五件套之一）；type ∈ ACTOR_TYPE_VALUES（agent/human/tool/kernel）
  [--change-ref <ref>]               # 契约引用（五件套之三；general_id 宽松词形，如 CHANGE.MIGRATION_001）
  [--capability <governed-id>]       # 可重复；Capability 清单（五件套之二）
  [--acceptance-shape <inline-json | @file>]  # 验收形状（五件套之五；JSON 对象）
  [--ttl-beats <n>]                  # 缺省 168（DEFAULT_TTL_BEATS，C9 映射；禁墙钟只按 seq 判定）
  [--json]

pomaster permit check
  --permit <PERMIT.*>
  --subject <governed-id>
  --op <upsert_object | transition_object | delete>   # kernel WriteAttempt 三值闭包
  [--json]

pomaster permit steal
  --permit <PERMIT.*>
  --actor <type>:<name>
  --reason <text>                    # 非空必填（D2 接管留痕是硬性要求）
  [--json]

pomaster permit list
  [--change-ref <ref>]               # 过滤（缺省=全部，不做静默过滤）
  [--state <active | expired | stolen>]   # 呈现态过滤（缺省=全部）
  [--json]
```

裁定：

- **self_attested 恒为 true**：凡经本进程 argv 传入的主体身份都是调用方自报，如实标注
  `self_attested=true`（C5 本就规定自报值永不单独判卷；第三方认证归 authority.json owner 解析层，
  不归 CLI 输入层）。不提供 `--attested` 旋钮（多一个假开关不如没有）。
- **五件套全部落台账**：`PermitRequest` 增可选 `capabilityIds: readonly GovernedId[]`（过
  `parseGovernedId` 校验）；`state/permits.json` 的 `PermitRecord`（kernel 内部状态文件，不进 hash、
  非公共契约面）增 `capability_refs` / `acceptance_shape` / `baseline`（baseline 服务 G3，见 §3.3）；
  `PERMIT_ISSUED` journal 事件带 `capability_ids`。`docs/kernel-api.md` §4 同 commit 同步
  （改签名先改文档的既有流程）。
- **`--acceptance-shape` 现状披露**：kernel 契约面 `PermitRequest.acceptanceShape` 已存在但
  `issuePermit` 实现从不持久化（读侧契约与台账脱节）——本设计把它与 `capability_refs` 同批落台账，
  「验收形状静默丢失」的坑就此封死。
- **TTL 呈现**：只呈现 `ttl_beats` / `expires_at_seq` / `beats_remaining`（= expires_at_seq −
  current_seq，≤0 即已过期），并附标称注记「1 拍 ≈ 1 rebuild 拍（C9 的 168h 标称节奏）」。绝不换算
  墙钟到期时间（A4：输出禁墙钟）。

### 1.2 输出 JSON 形状（字段级，snake_case 对齐现有 CLI result）

`permit issue`（ok=true，exit 0）：

```json
{
  "command": "permit issue",
  "ok": true,
  "result": {
    "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
    "issued_at_seq": 0,
    "expires_at_seq": 168,
    "ttl_beats": 168,
    "change_ref": "CHANGE.MIGRATION_001",
    "requested_by": { "actor_type": "human", "actor": "owner", "self_attested": true },
    "capability_refs": ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
    "acceptance_shape": { "dod": ["CSV_ROUNDTRIP passed"] },
    "scope": {
      "subject_ids": ["PAGE.DASHBOARD"],
      "write_policy": "AGENT_WITH_PERMIT"
    },
    "baseline_captured": {
      "PAGE.DASHBOARD": { "axes": { "lifecycle": "CURRENT", "confidence": "PROVISIONAL", "evidence": "IMPLEMENTED", "change": "STABLE" }, "rev": 3, "body_sha256": "sha256:…" },
      "PAGE.SETTINGS": null
    },
    "baseline_note": "baseline_captured[subject]=null 表示签发时该对象尚不存在（PROPOSED 新对象的合法基线态）"
  },
  "warnings": [],
  "errors": []
}
```

`permit check`（四态显式；`ok = (outcome === "allowed")`）：

```json
{
  "command": "permit check",
  "ok": false,
  "result": {
    "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
    "attempt": { "id": "PAGE.SETTINGS", "op": "upsert_object" },
    "outcome": "denied",
    "reason": "outside_scope",
    "expired_at_seq": null,
    "current_seq": 5,
    "hint": "scope expansion 拒绝静默放行（D20/GOLDEN-L8-2）：回 FRAMEWORK LOCK 重审升级…"
  },
  "warnings": [],
  "errors": [
    { "code": "PERMIT_SCOPE_DENIED", "message": "…", "hint": "…" }
  ]
}
```

`outcome` 四态逐字来自 kernel `PermitCheckResult`：`allowed / denied / expired / unknown_permit`；
`reason` 三值逐字：`outside_scope / policy_forbidden / delete_forbidden_supersede_only`。
错误码翻译（CLI 层，码位复用 kernel `GovernanceErrorCode` 同义码位约定，见 kernel-api.md §9）：
`outside_scope → PERMIT_SCOPE_DENIED`、`delete_forbidden_supersede_only → DENOMINATOR_DELETE_FORBIDDEN`、
`policy_forbidden → PERMIT_POLICY_FORBIDDEN`（CLI 本地码）、`expired → PERMIT_EXPIRED`、
`unknown_permit → PERMIT_UNKNOWN`（hint 指向 `permit list --json` 的事件链，判别 stolen 与从未签发）。

`permit steal`（`ok = (outcome === "stolen")`）：

```json
{
  "command": "permit steal",
  "ok": true,
  "result": {
    "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
    "outcome": "stolen",
    "event_seq": 7,
    "expires_at_seq": 5,
    "current_seq": 7
  },
  "warnings": [], "errors": []
}
```

`rejected_not_expired` → ok=false，exit 1（显式拒绝，不是失败异常——`errors` 为空、`result.outcome`
表达语义；hint 进 `result` 不再重复）。`PERMIT_NOT_FOUND`（kernel throw）→ 结构化错误信封，exit 1。

`permit list`（纯读）：

```json
{
  "command": "permit list",
  "ok": true,
  "result": {
    "current_seq": 172,
    "permits": [
      {
        "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
        "change_ref": "CHANGE.MIGRATION_001",
        "requested_by": { "actor_type": "human", "actor": "owner", "self_attested": true },
        "capability_refs": [],
        "acceptance_shape": null,
        "scope": { "subject_ids": ["PAGE.DASHBOARD"], "write_policy": "AGENT_WITH_PERMIT" },
        "issued_at_seq": 0,
        "expires_at_seq": 168,
        "beats_remaining": -4,
        "status": "expired",
        "stolen": { "at_seq": null, "by": null, "reason": null },
        "events": [
          { "type": "PERMIT_ISSUED", "seq": 0, "count": 1 },
          { "type": "PERMIT_EXPIRED_OBSERVED", "count": 2, "first_seq": 168, "last_seq": 170 }
        ]
      }
    ]
  },
  "warnings": [], "errors": []
}
```

- `status` 三值（`active / expired / stolen`）是 **CLI 呈现层局部词**（由
  stolen 标记 + current_seq vs expires_at_seq 机械派生）→ TODO(vocab-pr)。
- **TTL 与 steal 事件链呈现**：events 由 `state/journal.jsonl` 按 `permit_ref` 过滤聚合
  （`PERMIT_ISSUED` / `PERMIT_EXPIRED_OBSERVED` / `PERMIT_STOLEN`）。同型
  `PERMIT_EXPIRED_OBSERVED` 多行折叠为 `{count, first_seq, last_seq}`——**声明式聚合**
  （计数与首末 seq 保留，不吞没），理由见 §7-坑9。

### 1.3 kernel 复用与新增

- 复用：`issuePermit` / `checkPermit` / `stealPermit` / `parseGovernedId`（subject 与 capability
  的 closed-world 校验）。CLI 不解析、不改 `state/permits.json`。
- 新增（kernel，同 commit 同步 docs/kernel-api.md §4）：`PermitRequest.capabilityIds?`；
  `issuePermit` 落 `capability_refs` / `acceptance_shape` / `baseline`（§3.3）进 `PermitRecord`
  与 journal 事件。均为内部状态文件扩展，不动公共契约类型 `Permit`。

### 1.4 错误与 exit code（fail-closed）

| 场景 | 错误码（信封 errors[].code） | exit |
|---|---|---|
| `.pomaster` 未初始化 | `NOT_INITIALIZED` | 1 |
| subject/capability 词表外前缀或文法违规 | `FATAL_UNKNOWN_PREFIX` / `FATAL_ID_GRAMMAR`（kernel throw 透传） | 1 |
| 空 subject 集合 / 非法 ttlBeats / 非法 actor 词形 / 非法 acceptance JSON | `SCHEMA_INVALID` | 1 |
| check：denied / expired / unknown_permit | `PERMIT_SCOPE_DENIED` / `PERMIT_POLICY_FORBIDDEN` / `DENOMINATOR_DELETE_FORBIDDEN` / `PERMIT_EXPIRED` / `PERMIT_UNKNOWN` | 1 |
| steal：rejected_not_expired | （result.outcome 表达，errors 空） | 1 |
| steal：许可不存在 / 缺 reason | `PERMIT_NOT_FOUND` / `SCHEMA_INVALID` | 1 |
| 台账/journal 损坏 | `SCHEMA_INVALID`（kernel readPermitsFile / readJournalLines 透传） | 1 |

### 1.5 幂等与 NO_CHANGE 语义

- `issue` 是**事件**不是状态同步：重复签发同一基底 → `PERMIT.<BASE>.2`、`.3`（确定性序号递增，
  无随机无墙钟）。**没有 NO_CHANGE 出口**——签发两次就是两条许可台账记录，这是诚实语义，不是缺陷；
  文档与 `--help` 明示，防误当幂等命令用。
- `check` 是判卷读，**但有写副作用**：outcome=expired 时 kernel 追加 `PERMIT_EXPIRED_OBSERVED`
  journal 事件（kernel 既有语义，「过期→事件，不静默」）。CLI 呈现页头固定披露：
  `note: check 对过期许可会追加 PERMIT_EXPIRED_OBSERVED journal 事件（kernel 契约行为）`。
  除该事件外零写入；同一 state 下对未过期许可重复 check 输出字节全同。
- `steal` 是事件：成功即终态（stolen 后 check 恒 unknown_permit，重复 steal → PERMIT_NOT_FOUND
  ——kernel 语义「stolen 许可同样不再可 steal」透传）。
- `list` 纯读字节稳定：同 state 两次 `--json` 输出逐字节相等（journal 折叠规则保证聚合形态确定）。

### 1.6 测试要点（`packages/cli/tests/permit.spec.ts` + kernel 侧既有 permits.spec 扩展）

- issue：信封字段级断言（permit_ref 词形 / ttl 168 缺省 / capability_refs / acceptance_shape 落
  `state/permits.json`）；同基底重发 `.n` 递增；空 subject → SCHEMA_INVALID 信封 exit 1；
  词表外 subject → FATAL_UNKNOWN_PREFIX。
- check 四态 × exit code 全矩阵（复用 kernel tests/helpers 的 seedPermit 模式）。
- steal：rejected_not_expired exit 1；stolen exit 0 + journal 事件 + 台账 stolen 标记。
- list：事件链聚合（两次 check 过期许可后 list 的 PERMIT_EXPIRED_OBSERVED count=2）；同 state
  两次 `--json` 字节全同；`--state`/`--change-ref` 过滤缺省不静默。
- kernel 侧：PermitRecord 三新字段落盘形状；journal 事件带 capability_ids。

---

## 2. G2 —— `pomaster exec-guard`（八拍④ 写路径执行点）

### 2.1 定位裁定

「Permit 内免检」免的是**人检与逐拍门禁**，不免机器判卷点。exec-guard 是**最小机器执行点**：
单发进程、零 daemon、零编辑器 hook——任何 agent harness 在落笔前以子进程方式调用，
exit code 表达 allow/deny。

**它严格是判卷器，不是写入器**：

1. 不读、不写、不移动目标文件（attempt 里的 `context.file_path` 只是回显，连路径存在性都不查）；
2. 不调 `applyTransaction`、不改 store 状态（唯一例外：checkPermit 对过期许可追加
   PERMIT_EXPIRED_OBSERVED journal 事件——kernel 契约行为，§1.5 已披露）；
3. 判卷输入只有三元组 `(permit_ref, id, op)`——**文件内容盲**（path→governed id 的绑定解析归
   harness 侧与未来 binding-table 砖，P0 不做、不冒充）。

### 2.2 命令与输入

```text
pomaster exec-guard --attempt <file | - >   # `-` = stdin；--json
```

attempt 文件（CLI 本地输入形态，P0 字段）：

```json
{
  "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
  "id": "PAGE.DASHBOARD",
  "op": "upsert_object",
  "context": { "file_path": "src/pages/dashboard.ts", "bytes": 1234, "note": "…" }
}
```

- 必填三键：`permit_ref`（字符串）/ `id`（过 `parseGovernedId`）/ `op`（WriteAttempt 三值闭包，
  词表外值 = ATTEMPT_MALFORMED，绝不发明第四种 op）。
- `context` 任意对象，**原样回显不判卷**；判卷面窄是安全方向（多余键不构成放行理由）。
- 未知顶层键：warnings 呈现 `ATTEMPT_UNKNOWN_KEYS` 后照常判卷（不静默丢弃、也不拒绝——
  拒绝会破坏 harness 侧前向兼容，静默丢弃违反缺席显式）。

harness 调用范式：

```bash
node …/packages/cli/dist/bin.js --dir . exec-guard --attempt attempt.json --json
case $? in 0) allow ;; *) block ;; esac
```

### 2.3 输出 JSON 形状

```json
{
  "command": "exec-guard",
  "ok": false,
  "result": {
    "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
    "attempt": { "id": "PAGE.SETTINGS", "op": "upsert_object" },
    "outcome": "denied",
    "reason": "outside_scope",
    "hint": "scope expansion 拒绝静默放行（D20）：…",
    "checked_at_seq": 12,
    "context_echo": { "file_path": "src/pages/dashboard.ts", "bytes": 1234 }
  },
  "warnings": [],
  "errors": [ { "code": "PERMIT_SCOPE_DENIED", "message": "…", "hint": "…" } ]
}
```

`outcome/reason` 逐字复用 kernel `PermitCheckResult` 四态三因（同 §1.2 错误码翻译表）；
`checked_at_seq` 取 store 当前 seq（呈现锚，A4）。

### 2.4 kernel 复用与新增

纯复用：`createStore` + `checkPermit`。**kernel 零新增**——checkPermit 自 v0 就是为此判卷点设计
的（kernel-api.md §4），本命令只是给无调用方的原语接上机器入口（G2 缺口的本质是接线缺失不是原语缺失）。

### 2.5 错误与 exit code（fail-closed：非 allow 一律非零）

| 场景 | 错误码 | exit |
|---|---|---|
| allowed | —（ok=true） | **0** |
| denied（三因）/ expired / unknown_permit | 同 §1.2 翻译表 | 1 |
| attempt 文件缺失 / 非法 JSON / 缺必填键 / op 词表外 / id 文法违规 | `ATTEMPT_MALFORMED` / `FATAL_UNKNOWN_PREFIX` / `FATAL_ID_GRAMMAR` | 1 |
| store 未初始化 | `NOT_INITIALIZED` | 1 |
| kernel GovernanceError（如 PERMIT_NOT_FOUND 类） | 原码透传 | 1 |

畸形输入**永远不允许放行**——解析失败与判卷 denied 同为 exit 1，码位可区分（ATTEMPT_MALFORMED vs
PERMIT_*），harness 可对「输入坏了」与「被拒了」分别告警。

### 2.6 幂等与 NO_CHANGE

- 判卷是纯函数式读：同 attempt 文件 + 同 store state → 同 verdict（字节稳定）。
- 重复 exec-guard 一个已过期许可：每次都会追加一行 PERMIT_EXPIRED_OBSERVED（journal 线性增长）。
  P0 接受该 kernel 既有行为（journal 是事件流，「每次观察」都是真实事件），**不**在 CLI 做预检去重
  （预检 = 重造过期判定逻辑，违反复用纪律）；收敛归后续 kernel PR（同 seq 去重），见 §7-坑1。
- NO_CHANGE 不适用（无写出口；journal 事件除外且已披露）。

### 2.7 测试要点（`packages/cli/tests/exec-guard.spec.ts`）

- 全四态 × exit code 矩阵（复用 kernel helpers seedPermit / append_denominator 推 seq 的手法）；
- **判卷器非写入器断言**：跑 exec-guard 前后，目标目录文件树与 `status --json` 输出字节不变
  （未过期用例零 journal 变化）；过期用例单独断言 journal 恰好多一行 PERMIT_EXPIRED_OBSERVED；
- context_echo 原样回显；未知顶层键 → warning + 照常判卷；缺键/坏 JSON/词表外 op → exit 1 且码位区分；
- stolen 许可 → unknown_permit（物理存在不构成放行，ADV-D20-03 的 CLI 侧复验）。

---

## 3. G3 —— `pomaster reconcile`（八拍⑥ RECONCILE；kernel+CLI 双缺补齐）

### 3.1 命令与参数

```text
pomaster reconcile --permit <PERMIT.*> [--samples <n>] [--json]    # --samples 缺省 3，≥0
```

### 3.2 报告三段（D20/D21：只审 delta/例外/抽样，人不再逐行看全文）

```json
{
  "command": "reconcile",
  "ok": false,
  "result": {
    "permit_ref": "PERMIT.CHANGE_MIGRATION_001.1",
    "baseline_at_seq": 3,
    "current_seq": 12,
    "clean": false,
    "baseline_missing": false,
    "changed_objects": [
      {
        "id": "PAGE.DASHBOARD",
        "kind": "axes_change",
        "axes": { "lifecycle": { "from": "CURRENT", "to": "SUPERSEDED" } },
        "content_drift": null,
        "rev": { "from": 3, "to": 4 }
      },
      {
        "id": "PAGE.SETTINGS",
        "kind": "materialized",
        "axes": null,
        "content_drift": null,
        "rev": { "from": null, "to": 1 }
      }
    ],
    "exceptions": [
      {
        "evidence_ref": "GRN-0007",
        "plane": "runs",
        "verdict": "failed",
        "subject_id": "PAGE.DASHBOARD",
        "gate": "BUILD"
      },
      {
        "evidence_ref": "CLM-0003",
        "plane": "claims",
        "verdict": "REJECTED",
        "subject_id": "PAGE.DASHBOARD"
      }
    ],
    "verdict_census": { "runs": { "passed": 4, "failed": 1, "not_run": 1 }, "claims": { "VERIFIED": 2, "REJECTED": 1 } },
    "samples_to_review": [
      {
        "evidence_ref": "GRN-0004",
        "plane": "runs",
        "verdict": "passed",
        "subject_id": "PAGE.SETTINGS",
        "gate": "BUILD",
        "sample_reason": "deterministic stride 2/3"
      }
    ],
    "scope_summary": { "subjects": 3, "materialized": 1, "vanished": 0 }
  },
  "warnings": [],
  "errors": [ { "code": "RECONCILE_DIRTY", "message": "…", "hint": "人审三段后处置；delta 处置走 transition/supersede 通道" } ]
}
```

- `changed_objects`：**仅 Permit 范围内** subject。`kind` 三值：`axes_change`（四轴任一 from≠to，
  `axes` 只列变化的轴）/ `materialized`（签发时 absent、现已存在——PROPOSED 新对象落地，合法但人须
  知道）/ `vanished`（签发时存在、现已消失——kernel 无 delete 通道，出现即 REF 异常，必 fail）。
- `content_drift` 三态：`true`（正文 body_sha256 变了而四轴未变——静默漂移显式打捞）/ `false` /
  `null`（基线无 sha 锚或对象 absent——**显式未知，不冒充「无漂移」**，四态纪律的镜像）。
- `exceptions`：scope 内 subject 的证据平面扫描，runs 取 verdict ∈ {failed, not_configured,
  skipped_blindspot}（任务定义的三类例外），claims 取 verification.verdict = REJECTED。
  其余 verdict（passed/warning/blocked/not_run/UNVERIFIED…）进 `verdict_census` **全量计数呈现**——
  聚合不吞没：不进例外段 ≠ 不可见。
- `samples_to_review`：scope 内全部证据条目（runs+claims 合并）按 evidence_ref 字典序排列后
  **等距步长抽样**（取 `floor(i × total / N)`，i=0..N-1；total<N 时全取）。同输入重放抽样集合
  字节稳定（禁随机、禁墙钟）；`--samples 0` 合法（显式放弃抽样，不静默）。

### 3.3 基线来源裁定（任务点名要拍板的问题）

**裁定：基线快照在 permit issue 时存入台账**（`PermitRecord.baseline`），reconcile 只读不重建。
形态：

```json
{
  "baseline": {
    "at_seq": 3,
    "subjects": {
      "PAGE.DASHBOARD": { "axes": { "…四轴": "…" }, "rev": 3, "body_sha256": "sha256:…" },
      "PAGE.SETTINGS": null
    }
  }
}
```

理由（对比另一选项「reconcile 时从 permits 记录取」）：

1. **closure**：journal 是事件流不是状态快照（TX_APPLIED 只记 changed_object_ids，不含 axes 值），
   事后无法重建 issued_at_seq 时刻的四轴——**issue 瞬间是唯一能拿到该基线的时刻**，拿不到事后补的
   东西就不许承诺补（fail-closed 的时态版）。
2. delta 审的定义天然锚定 issue 时刻：「Permit 锁定之后范围内对象变没变」。
3. 存储成本可控：subjects 是逐对象圈定的小集合（kernel 禁全域授权）。
4. `state/permits.json` 是 kernel 内部状态文件（不进 hash、非公共契约面），扩字段零契约爆炸；
   `body_sha256` 入基线属 D24 读侧 identity/tamper-audit 用途（content_drift 判定），合规。
5. subjects 在签发时可以尚不存在（PROPOSED 新对象）→ 基线记 `null`（absent），reconcile 时
   present 即 materialized delta——absent 是合法基线态，不是基线缺失。

**baseline 缺失**（本特性之前签发的许可）→ `baseline_missing=true` 且 `ok=false`：不能拿
「没有基线」冒充「无变化」（not_configured ≠ passed 的 ⑥ 拍镜像）；hint：重新签发带基线许可，
或人工对账后 supersede 旧许可。

### 3.4 kernel 复用与新增

- 复用：`createStore` / `loadTruthIndex` / paths 层 `readJournalLines` / `readText`（evidence 平面
  只读扫描）。
- 新增：**`kernel/src/reconcile.ts`** 导出 `reconcilePermit(store, permitRef, options?) =>
  Promise<ReconcileReport>`（纯读；三段报告结构化产出，CLI 只渲染）；`issuePermit` 增基线捕获
  （读 raw index 中各 subject 行，缺失记 null）。`docs/kernel-api.md` 新增 §10 reconcile 契约
  （同 commit）。判卷逻辑（delta 比较、例外归类、stride 抽样）全部住 kernel——CLI 不重造。

### 3.5 错误与 exit code

| 场景 | 码 | exit |
|---|---|---|
| 干净（无 delta、无例外、无 vanished、基线在） | ok=true，`clean=true` | **0**（⑥ 拍零审阅出口） |
| 有 delta / 例外 / vanished | `RECONCILE_DIRTY` | 1（人须审；机器不代审不代决） |
| baseline 缺失 | `RECONCILE_BASELINE_MISSING` | 1 |
| 许可不存在 / store 未初始化 | `PERMIT_NOT_FOUND` / `NOT_INITIALIZED` | 1 |

### 3.6 幂等与 NO_CHANGE

纯读报告：同 store state + 同参数 → `--json` 输出逐字节相等（stride 抽样确定性保证）。无写出口，
NO_CHANGE 概念由 `clean=true` 承担（审阅负担为零的合法出口）。

### 3.7 测试要点（`packages/kernel/tests/reconcile.spec.ts` + `packages/cli/tests/reconcile.spec.ts`）

- 基线捕获：issue 后 `state/permits.json` 含 baseline（存在对象记 axes/rev/body_sha256，absent 记 null）；
- 四种 delta：无变化 clean=true exit 0；transition 改轴 → axes_change；absent→present → materialized；
  手工删除正文文件模拟 vanished → 必 fail；
- content_drift 三态各一例（改 payload 不改轴 → true；无基线 sha → null）；
- baseline_missing（构造旧形态许可记录）→ ok=false；
- exceptions：造 failed run 与 REJECTED claim → 各入例外段；verdict_census 全量计数；not_run 不入例外但可见；
- 抽样确定性：同 state 两次 `--json` 字节全同；N=3、total=5 的 stride 集合可手工预言；
- CLI：信封 ok/exit 对齐表；`--permit` 缺失 → commander 用法错误 exit 1。

---

## 4. G4+G6 —— `pomaster compact` + `pomaster record`（八拍⑦ COMPACT + 证据入账）

### 4.1 证据入账通路裁决（任务点名要对比与选择）

| 方案 | 内容 | 裁决 |
|---|---|---|
| (A) `check --record` | check 跑完立即入账 | **否决**。check 的「全程零写状态」是 phaseC 实测钉子的性质（§3.4 三次 status 字节全同）；--record 让 ⑤ 拍判卷层叠加写路径失败模式（NOT_INSTALLED 时无 GateResult 可入账；入账失败会污染 verdict 呈现）；C5 落库编排决定权归 ⑦ 拍，不归 ⑤ 判卷层 |
| (B) 独立 `record` 子命令 | 显式单条入账（machine-facing） | **采纳**。check 保持纯读；harness 把一次 gate 运行显式落账；外来证据（tiny-tool 探针这类 gauntlet 之外的 GRN 文件）有合法收编入口 |
| (C) compact 顺带入账 | ⑦ 拍批量收编 evidence 平面未入账文件 | **采纳（compact 默认行为，`--no-ingest` 可关）**。⑦ 的本职就是「episode 入账」；GRN-0001 裂缝的现实修复通路；幂等收编（见 4.4）使重复跑优雅 |

组合语义：**B=显式单条，C=批量兜底，A=否决**。跑与账之间的窗口由 C 兜底收编、B 显式补账。

### 4.2 裂缝闭合定义（GRN-0001.ran_at_seq=3 vs generation_seq=0）

裂缝的本质：证据平面存在 GateResult 而账本零入账（seq 停在 0），且**通路未定义**——没人规定
ran_at_seq 与 generation_seq 的关系如何对账。本设计把关系定义收进通路：

1. **ran_at_seq 是 gate 运行时采样的 CLAIMED 事实**，入账时沿用不改写（把 3 改成当前 seq = 伪造
   采样点，违反 C5）。
2. **本通路新产出的 run**（record gate-run 提交的新运行）：`ranAtSeq = store 当前 seq`
   （normalizeGateResult 的 context 采样点）→ 事务 appliedSeq = seq+1 → 恒 `ran_at_seq < appliedSeq`
   成立，倒挂不再新增。
3. **存量倒挂**（如夹具 ran_at_seq=3 > 收编后 appliedSeq=1）如实保留 + **显式披露**：compact/record
   结果带 `ledger_seq_view.ahead_evidence: [{grn, ran_at_seq}]`（「账本与证据平面的时差」永远可见，
   不静默改写、不静默保留）。
4. 入账后 evidence/runs/<GRN>.json 被覆写为 kernel canonical 形态（07 run_record），此后 status /
   reconcile 的证据扫描读到的是账本同源形态——**平面分叉到此闭合**。

### 4.3 `pomaster compact`（编排 applyTransaction：episode 折叠）

```text
pomaster compact
  [--ops <tx-file>]            # kernel Transaction JSON（{ops:[…], authorityRef?, note?}）
  [--authority-ref <ref>]      # 显式给定则覆盖 tx-file 内同名字段（迁移类 op 需要）
  [--note <text>]              # 同上
  [--no-ingest]                # 关闭证据批量收编（默认开启）
  [--json]
```

执行序（确定性）：

1. `createStore` + `loadTruthIndex`（fail-closed）。
2. **episode 折叠**：把多源 ops 合并为**单次** `applyTransaction`（一次 seq 推进、一条 TX_APPLIED、
   原子 staged 写）——ops = [证据收编 ops（runs 按 grn 字典序、claims 按 clm 字典序）…,
   tx-file 显式 ops（按文件内顺序）…]。
3. 事务结果映射：`appliedSeq` / `shortCircuited` / `changedObjectIds` / `digestWarnings`
   （digestWarnings 透传为信封 warnings——D24 WARN 通道，永不阻断）。
4. 出口：`change: "APPLIED" | "NO_CHANGE"`；**NO_CHANGE 合法且优雅**（ops 空集、或全部被 pending
   判定跳过、或 tx 指纹短路）→ ok=true exit 0。

输出（字段级）：

```json
{
  "command": "compact",
  "ok": true,
  "result": {
    "change": "APPLIED",
    "applied_seq": 2,
    "short_circuited": false,
    "ops_counts": { "record_gate_run": 1, "upsert_object": 1 },
    "ingested": {
      "runs": [
        { "grn": "GRN-0001", "action": "canonicalized", "ran_at_seq": 3, "ran_at_seq_ahead": true }
      ],
      "claims": [
        { "clm": "CLM-0001", "action": "skipped_adjudicated" }
      ],
      "malformed": []
    },
    "changed_object_ids": ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
    "digest_warnings": [],
    "ledger_seq_view": {
      "generation_seq": 2,
      "ahead_evidence": [ { "grn": "GRN-0001", "ran_at_seq": 3 } ]
    }
  },
  "warnings": [],
  "errors": []
}
```

`ingested.*[].action` 词形（CLI 本地词，TODO(vocab-pr)）：
runs：`canonicalized`（入账并覆写为 canonical 形态）/ `already_canonical`（字节已等价，跳过）；
claims：`recorded` / `already_canonical` / `skipped_adjudicated`（已带独立判定，见 4.4 规则 3）。
`malformed[]` 条目 `{path, code: "EVIDENCE_MALFORMED", detail}` 同时镜像为信封 warnings——**显式
呈现不吞没，但不 fail 整个命令**（畸形证据不能自动修，也不该卡住本轮合法 truth 更新）；
`--ops` 文件自身非法 / applyTransaction throw → 整体 fail exit 1（kernel staged 回滚保证零残留）。

### 4.4 pending 判定（「未入账」的确定性判据）与 record 子命令

**runs 平面**（`evidence/runs/GRN-*.json`）：`pending ⇔ 磁盘字节 ≠ kernel canonical 重放字节`。
canonical 重放 = 解析文件 → 取 `gate_result.result`（无则整个文件视作 GateResult 值）→ CLI 注入
grn 后过 `normalizeGateResult`（**永不信任文件自报**：verdict 词表外 / counts 缺失 / notApplicable
缺席 → FATAL，落 `malformed` 不落账）→ `gateResultToSnake` 组装 07 形态 → 以 kernel 的序列化器
（`JSON.stringify(…, null, 2) + "\n"`）序列化。该判据同时服务 compact 批量扫描与 record 显式路径
（同一函数，不两套）。

注意：canonical 化是**有损规范化**——夹具的超集字段（`tool_snapshot` / 内嵌 `tool` /
`metric_dialect`）会被剥离（kernel GateResult v0 契约不承载，`gateResultToSnake` 诚实缺席——
kernel-api.md §9 既有 TODO 的同一条线）。首收入账必须标 `action: "canonicalized"`（非静默覆写）；
超集字段的保留归 GateRunner 接线砖。

**claims 平面**（`evidence/claims/CLM-*.json`）：pending 判定**不能**用纯字节比较（见 §7-坑4），
规则三条：

1. 磁盘文件与 `record_claim` 重放（UNVERIFIED 初始形态）字节等价 → `already_canonical`；
2. `verification.verdict ∈ {UNVERIFIED}` 且非 kernel 形态（如手写缺字段）→ `recorded`
   （重新以 canonical 形态入账；verification 恒 UNVERIFIED——D20：声称方不可自填 VERIFIED）；
3. `verification.verdict ∈ {VERIFIED, PARTIALLY_VERIFIED, REJECTED}` → `skipped_adjudicated`
   （已独立判定，**record_claim 通道无权覆写判定**；独立验证流砖才有判定通路）。夹具 CLM-0001
   （VERIFIED）即走此分支——入账它的 claim 会把判定打回 UNVERIFIED，数据倒退，故显式跳过并披露。

**`pomaster record gate-run`**（显式单条）：

```text
pomaster record gate-run --from <file>
  [--grn <GRN-n>]              # 缺省分配：evidence/runs/ 现有最大序号 +1，4 位零填充（GRN-0002；>9999 自然位数）
  [--trigger <type>]           # RUN_TRIGGER_VALUES 五值闭包；缺省 on_demand（词表内既有值）
  [--tool <id>] [--tool-version <semver>]   # 缺省 pomaster-cli / CLI_VERSION（自报如实：运行主体就是 CLI）；文件 tool_snapshot 优先
  [--json]
```

- normalizeGateResult 的 `context.ranAtSeq = store 当前 seq`（§4.2 定义 2）。
- 输出：`{grn, change: "APPLIED" | "SKIPPED_CANONICAL", applied_seq, ran_at_seq, verdict, gate,
  ran_at_seq_ahead}`；SKIPPED_CANONICAL = 该 GRN 文件已是 canonical 且等价 → 零写入 exit 0
  （**CLI 层补齐幂等**，理由见 §7-坑2）。
- `--grn` 显式重放同号：pending 判定命中 already_canonical → 跳过；内容有变 → canonical 化
  （判定可复核，非盲覆写）。

**`pomaster record claim`**（显式单条）：

```text
pomaster record claim --from <file> [--clm <CLM-n>] [--json]
```

- 输入字段（ClaimRecordInput 对齐）：`clm`（缺省同法分配）/ `subject_id`（过 parseGovernedId；
  对象不存在 → kernel OBJECT_NOT_FOUND 透传 exit 1）/ `assertion`（非空）/ `asserted_by` /
  `evidence_refs`（GRN-*/治理对象/blob 三型，kernel record_claim 既有分型）。
- 输出：`{clm, change: "APPLIED" | "SKIPPED_CANONICAL" | "SKIPPED_ADJUDICATED", applied_seq,
  verification: "UNVERIFIED"}`。

### 4.5 kernel 复用与新增

纯复用：`applyTransaction`（record_gate_run / record_claim / upsert_object / … 全 op 谱系）、
`normalizeGateResult`、`createStore` / `loadTruthIndex`。**kernel 零新增**——G4 的本质是
「原语齐备无人编排」，CLI 编排砖即闭环。GRN/CLM 分配、pending 字节判定、canonical 序列化均在
CLI 层实现但**形态完全由 kernel 决定**（复用 gateResultToSnake 的输出结构 + kernel 落盘序列化器），
不重造任何 digest/判卷/store 逻辑。

### 4.6 错误与 exit code

| 场景 | 码 | exit |
|---|---|---|
| compact APPLIED / NO_CHANGE | —（ok=true） | 0 |
| compact 畸形证据（平面内） | warnings（EVIDENCE_MALFORMED），其余照常入账 | 0（显式呈现不阻断） |
| compact --ops 非法 / applyTransaction throw | `KERNEL_ERROR`（原码透传） | 1 |
| record：normalize FATAL（verdict 词表外 / counts 缺失） | `VOCAB_INVALID_VALUE` / `GATE_COUNTS_INVALID` 等 kernel 原码 | 1 |
| record claim：subject 不存在 | `OBJECT_NOT_FOUND` | 1 |
| store 未初始化 | `NOT_INITIALIZED` | 1 |

### 4.7 幂等与 NO_CHANGE

- **同输入重跑 byte-stable**：二次 compact → pending 集为空（全部 already_canonical / skipped）+
  ops 重放走 tx 指纹短路 → `change: "NO_CHANGE"`，truth-index / journal / evidence 全部字节不变。
- kernel 的 record 类 op 无 per-op 幂等（anyChange 恒 true）——CLI 用 pending 字节预比较在构造 ops
  前剔除已 canonical 条目补齐幂等（§7-坑2）。
- `--ops` 同文件二次提交：upsert/register 类 op kernel 自带内容比较幂等；record 类 op 由 CLI pending
  判定剔除。全部剔除后 ops 空集 → NO_CHANGE。

### 4.8 测试要点（`packages/cli/tests/compact.spec.ts` + `tests/integration/` 裂缝闭合 E2E）

- record gate-run 收编 tiny-tool 式夹具（含 tool_snapshot 超集）：canonical 化 + 超集剥离 +
  `action: "canonicalized"` + ahead 披露；status 之后 `generation_seq ≥ 1`；
- **裂缝闭合 E2E**（integration）：临时副本 init → 预置 GRN-0001/CLM-0001 夹具 → compact →
  status generation_seq 推进、runs 文件为 canonical 形态、ahead_evidence 如实列出 → 二次 compact
  NO_CHANGE 且全部相关文件字节不变；
- record 幂等：同文件二次 record → SKIPPED_CANONICAL exit 0 零写入；
- claims 三分支：UNVERIFIED 手写残缺 → recorded；VERIFIED 夹具 → skipped_adjudicated（文件字节不变）；
- normalize fail-closed：counts 缺 notApplicable / verdict 词表外 → malformed（compact 不阻断、
  record 单条 exit 1）；
- compact --ops upsert → APPLIED；同 ops 二次 → NO_CHANGE；非法 op → KERNEL_ERROR 且零残留
  （kernel 回滚）；digestWarnings 透传为信封 warnings。

---

## 5. 全局退出码语义（汇总）

`runCli` 既有约定（0 当且仅当全部 runs ok）不变。各命令 ok 语义：

| 命令 | exit 0 | exit 1（fail-closed） |
|---|---|---|
| permit issue | 签发成功 | 形状/词表/环境错误 |
| permit check | allowed | denied / expired / unknown / 异常 |
| permit steal | stolen | rejected_not_expired / NOT_FOUND / 缺 reason |
| permit list | 读成功 | 未初始化 / 台账损坏 |
| exec-guard | **仅 allowed** | 一切其他（含输入畸形） |
| reconcile | clean 且基线在 | 有 delta/例外/vanished / baseline_missing / 异常 |
| compact | APPLIED / NO_CHANGE | tx 失败 / 未初始化（畸形证据走 warnings 不失败） |
| record gate-run | APPLIED / SKIPPED_CANONICAL | 畸形 / normalize FATAL / tx 失败 |
| record claim | APPLIED / SKIPPED_CANONICAL / SKIPPED_ADJUDICATED | 畸形 / OBJECT_NOT_FOUND / tx 失败 |

## 6. 约束自查清单

- **kernel 原语复用**：G1=permits.ts 三函数+parseGovernedId；G2=checkPermit（原语早备，只接线）；
  G3=新 reconcile.ts 但只组合 loadTruthIndex/paths/readJournalLines 只读件，无新 store/digest 逻辑；
  G4=applyTransaction+normalizeGateResult。全设计无一处绕开 applyTransaction 写账、无一处重造
  permit 判卷/digest 计算。
- **确定性**：全部输出零墙钟（seq 代号锚定；TTL 只呈现 beats；抽样 stride 确定；list 事件链声明式
  折叠）；compact/record 原子写由 kernel io 层（tmp+rename+按捕获字节回滚）承担；同输入重跑
  byte-stable（NO_CHANGE / clean / SKIPPED 是合法优雅出口）。
- **零 FROZEN 改动、零新词值**：不动 packages/schemas/assets/*、vocab.ts、golden cases；op 三值 /
  trigger 五值 / verdict 七态 / actor 四型全部取既有词表闭包；`PERMIT` 前缀维持 general_id 宽松词形
  既有 TODO(vocab-pr) 不收编；呈现层局部词（permit `status` 三值、`action`/`change`/`kind` 词形）
  全部带 TODO(vocab-pr) 注记；attempt 文件的 `context` 键族是 CLI 本地输入形态非治理词表。
- **exec-guard 严格判卷器**：不读不写目标文件、内容盲、不写 store（过期观察 journal 事件为 kernel
  契约行为并显式披露）；非 allow 一律 exit 1，畸形输入永不放行。
- **reconcile 基线 closure**：基线在 issue 瞬间存入 permit 台账（closure：journal 无 axes 历史，
  事后不可重建）；absent 是合法基线态；baseline_missing 显式 fail（not_configured ≠ passed）。
- **docs 同步义务**：实施时同 commit 更新 docs/kernel-api.md（§4 五字段台账 + §10 reconcile 契约）
  与 docs/architecture.md 命令面对应行（六命令 → 命令面扩建）。

## 7. 设计中发现的坑（前人未写）

1. **checkPermit 有写副作用**：outcome=expired 时每次调用追加一行 PERMIT_EXPIRED_OBSERVED
   （同 seq 可重复多行、journal 线性增长）。「check 是纯读」对 permit check 不成立；CLI 呈现必须
   披露；同 seq 去重收敛归后续 kernel PR（P0 不做 CLI 预检去重——那等于重造过期判定）。
2. **record_gate_run / record_claim 无 per-op 幂等**：两 op 恒置 anyChange=true（对比
   upsert_object/register_producer 有内容比较幂等）——隔事务重放同 ops 会 seq 空转重写文件；
   tx 级指纹短路只救「与上一次事务完全同输入」。CLI 层以 canonical 字节预比较补齐（compact 批量与
   record 显式共用同一 pending 函数），kernel 层缺口如实留档。
3. **入账是有损规范化**：夹具超集字段（tool_snapshot / tool / metric_dialect）会被 canonical 形态
   剥离（kernel GateResult v0 契约不承载、gateResultToSnake 诚实缺席）。首收入账必须标
   canonicalized 而非静默覆写；字段保留归 GateRunner 接线砖（kernel-api.md §9 同一条 TODO 线）。
4. **VERIFIED 夹具会被 claim 入账打回 UNVERIFIED**：record_claim 恒置 UNVERIFIED（D20：声称方不可
   自填 VERIFIED），纯字节比较的 pending 判定会把 CLM-0001 判为 pending 并覆写判定——数据倒退。
   claims 平面的 pending 判定必须先看 verification 判定态（已判定 → skipped_adjudicated）。
5. **issuePermit 契约面有 acceptanceShape 但实现从不持久化**：读侧契约与台账实现脱节；不点名则
   ② 五件套的「验收形状」经 CLI 传入后静默丢失。本设计将其与 capability_refs/baseline 同批落台账。
6. **ran_at_seq 倒挂不能靠改写闭合**：入账时把 ranAtSeq 改成当前 seq = 伪造采样点（违反 C5）。
   闭合只能三件套：新 runs 由通路采样 store seq（恒 ran_at_seq < appliedSeq）+ 存量倒挂如实保留 +
   ahead_evidence 永远显式。
7. **只报 axes delta 会漏静默漂移**：正文变了而四轴没变的对象不在 changed_objects 定义内——基线
   必须连 body_sha256 一起存（D24 读侧 identity 用途合规），content_drift 用三态（true/false/null），
   null=基线无锚的显式未知，不许 null 冒充「无漂移」。
8. **CLI 直读 state/permits.json 使内部文件成为隐性契约**：list/事件链读它、kernel 独占写通道
   （分层纪律保持），但 kernel 改该文件字段须同步 CLI 呈现层——登记进 kernel-api.md §9 实现注记，
   防未来字段演进静默破坏 list。
9. **list 的事件链逐条呈现与字节稳定不可兼得**：PERMIT_EXPIRED_OBSERVED 随每次 check 增行，逐条
   呈现会让 list 输出随观察次数漂移。折叠为 {count, first_seq, last_seq} 是声明式聚合（计数保留、
   不吞没），这是两难下的明确取舍而非疏漏。
