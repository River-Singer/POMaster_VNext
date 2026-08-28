# Phase D —— 八拍 Change Loop 全谱系实测演示报告

> **seq**: demo-D-0001（A4：无墙钟日期，seq 代号锚定）　**性质**：八拍 8/8 全部真实命令实跑（非 mock、非单测复述——全部输出为命令真实 stdout）
> **取代关系**：本报告取代 `benchmarks/phaseC-demo-report.md`。Phase C 只跑通 ①③⑤⑦ 读侧，②④⑥⑧ 以「缺口 G1–G4」交卷；本批八拍载体（`permit` / `exec-guard` / `reconcile` / `compact` / `record`，见 `docs/eight-beat-carriers-design.md`）落地后，本报告在**临时目录副本**上跑完整八拍。
> **CLI**：`packages/cli/dist/bin.js`（`@pomaster/cli` 0.0.0；实测前已重建 dist 使与 src 同步；node v22.13.1）
> **调用方式**：`node <仓库绝对路径>/packages/cli/dist/bin.js --dir <项目根> <command> [--json]`
> **靶子**：`examples/tiny-tool`（tiny-csv-tool 0.1.0）的临时副本 `%TEMP%\pomaster-phaseD\tiny-tool`（演示全程含 vitest 安装与测试文件增删只落在副本上；仓内 `examples/` 零改动）
>
> **纪律声明**：
> - 未执行任何 git 操作；FROZEN 资产零触碰；本文件是本次演示在仓库内的唯一落盘产物；
> - 全部输出捕获件存于副本旁 `%TEMP%\pomaster-phaseD\captures\`（不入库）；
> - 本机 PATH 含游离引号（phaseC 附录 A 的 G7），每条 shell 调用前以 `PATH="$(printf '%s' "$PATH" | tr -d '"')"` 消毒——**产品代码零改动**。

---

## 0. 预置事实

- 提交态的 `examples/tiny-tool/.pomaster/` 预置证据平面夹具：`evidence/runs/GRN-0001.json`（CSV_ROUNDTRIP，verdict=passed，**自报 ran_at_seq=3**，tool_snapshot 超集）、`evidence/claims/CLM-0001.json`（**verification.verdict=VERIFIED**，独立判定）、truth 平面两对象。state 平面（truth-index.json）不在提交态，由 `init` 创建（seq=0 空账本）。
- demo 请求（八拍① 的输入）：**「为 CSV 工具增加引号转义变体：serializeRows 新增 force_quote_all 变体，全部单元格强制加引号，并补往返测试」**——代码侧 `forceQuoteAll` 选项已在 `src/serialize.js` 实现，但治理平面尚无该变体能力对象：episode 的治理主线即把它登记、验证、入账。

## 1. 执行序列与退出码

| # | 命令（均加 `--dir <demo>`） | 拍 | 退出码 | 语义 |
|---|---|---|---|---|
| 1 | `init --json` | 前置 | 0 | CREATED（4 文件骨架，seq=0） |
| 2 | `init --json`（第二次） | 前置 | 0 | NO_CHANGE（零写入幂等） |
| 3 | `triage "<请求>" --json` | ① | 0 | LIGHT（DEFAULT_NO_SIGNAL） |
| 4 | `compact --ops <tx> --no-ingest --json` | ①→② 预登记 | 0 | APPLIED seq 1（upsert PROPOSED 对象；证据平面不动） |
| 5 | `permit issue --subject ×2 --actor --change-ref --capability --acceptance-shape --json` | ② | 0 | `PERMIT.CHANGE_CSV_QUOTE_VARIANT.1`（基线捕获双态） |
| 6 | `context compile --role implementer --json` | ③ | 0 | 三分区诚实空投影 |
| 7 | `exec-guard --attempt <in-scope> --json` | ④ | **0** | **allowed**（checked_at_seq=1） |
| 8 | `exec-guard --attempt <out-of-scope> --json` | ④ | **1** | **denied / outside_scope**（PERMIT_SCOPE_DENIED，fail-closed） |
| 9 | `check --fast --json` | ⑤ | 0 | READY / **passed**（2/2/0/0，真实 vitest 执行） |
| 10 | `status --json`（check 前后各一次） | ⑤ | 0 | 两次**字节全同**（check 零写状态实证） |
| 11 | `record gate-run --from <GateResult> --json` | ⑤ | 0 | GRN-0002 APPLIED，applied_seq=2；**generation_seq 1→2** |
| 12 | `check --fast --json`（真实回归注入后） | ⑥ | **1** | READY / **failed**（violations=1） |
| 13 | `record gate-run --from <failed GateResult> --json` | ⑥ | 0 | GRN-0003 APPLIED，applied_seq=3（seq→3） |
| 14 | （手改 `state/truth-index.json` 对象四轴——**真实越权篡改**，非命令） | ⑥ | — | PROPOSED→CURRENT、PLANNED→IMPLEMENTED，rev 未动（篡改痕迹） |
| 15 | `reconcile --permit PERMIT.CHANGE_CSV_QUOTE_VARIANT.1 --json` | ⑥ | **1** | **RECONCILE_DIRTY**：三段全命中 |
| 16 | `compact --json`（第 1 次） | ⑦ | 0 | **APPLIED seq 4** + **DIGEST_WARNING（篡改被 D24 抓住）** |
| 17 | `compact --json`（第 2 次） | ⑦ | 0 | **NO_CHANGE**（seq 4 不动） |
| 18 | `compact --json`（第 3 次） | ⑦ | 0 | 与第 2 次**字节全同**（sha256 见 §3.7） |
| 19 | `compact --json`（第 4 次，前后 .pomaster 全树 sha256 快照） | ⑦ | 0 | 全部文件哈希不变（**零写入实证**） |
| 20 | `status --json` ×2 | ⑧ | 0/0 | 两次**字节全同**（sha256 见 §3.8） |
| 21 | `permit list --json` | ⑧ | 0 | 终态：active，beats_remaining=165，事件链折叠呈现 |

## 2. 八拍对照表（8/8 全实跑）

| 拍 | 名称 | 本次载体 | 实测结果 | 证据锚 |
|---|---|---|---|---|
| ① | TRIAGE | `pomaster triage <request> --json` | LIGHT（DEFAULT_NO_SIGNAL，evidence_grade=NOT_CONFIGURED 诚实缺省，8 项 absent_signals 全显式） | §3.1 |
| ② | FRAMEWORK LOCK | `pomaster permit issue --json` | 五字段全落台账 + **签发瞬间基线捕获**（absent=null 与 PROPOSED@rev1 双态如实）；`permit list` 终态事件链折叠 | §3.2 |
| ③ | PROJECTION | `pomaster context compile --role implementer --json` | 三分区（MUST/ADVISORY/LAZY TOOLS）诚实空投影 + 稳定 inputs_fingerprint | §3.3 |
| ④ | EXECUTE | `pomaster exec-guard --attempt <file> --json` | **两遍实跑**：范围内=allowed exit 0；范围外=denied(outside_scope) exit 1——fail-closed 实证；判卷器非写入器 | §3.4 |
| ⑤ | VERIFY | `check --fast --json`（纯读）→ `record gate-run --from <GateResult> --json`（入账） | passed（真实 vitest）零写状态；record 后 **generation_seq 1→2**、GRN-0002 落盘 canonical 形态 | §3.5 |
| ⑥ | RECONCILE | `pomaster reconcile --permit <ref> --json` | 真实篡改 axes + 真实 failed 证据 → **RECONCILE_DIRTY exit 1，三段全命中**（changed_objects 命中被篡改对象 / exceptions 抓 GRN-0003 / samples 给出） | §3.6 |
| ⑦ | COMPACT | `pomaster compact --json` | 第 1 次=APPLIED seq 4（证据收编 + **D24 篡改告警不拦写**）；第 2 次=NO_CHANGE 且 byte-stable；第 4 次前后全树零写入 | §3.7 |
| ⑧ | STATUS | `pomaster status --json` ×2 + `permit list --json` | 两次字节全同（无墙钟污染）；permit 终态 active / beats_remaining=165 | §3.8 |

## 3. 各拍实测详情

### 3.1 拍① TRIAGE —— LIGHT（诚实缺省档）

```text
$ pomaster triage "为 CSV 工具增加引号转义变体：serializeRows 新增 force_quote_all 变体，全部单元格强制加引号，并补往返测试" --json
→ profile=LIGHT  evidence_grade=NOT_CONFIGURED  matched_rule=DEFAULT_NO_SIGNAL  matched_keywords=[]  ttl_hours=168
→ absent_signals: declared_paths / path_class / contract_surface_registry / dependency_manifest_hit
                  / migration_hit / test_only_hit / diff_stat / governed_object_hits   （全量显式，原文见 captures/01-triage.json）
```

新能力请求无升档关键词（契约/跨域）也无纯样式短路 → 兜底 LIGHT；「无信号」被如实标为 NOT_CONFIGURED 而非冒充实测（四态纪律的①拍镜像）。

### 3.2 拍② FRAMEWORK LOCK —— 五字段签发 + 基线捕获

拍②前以唯一写通道预登记 PROPOSED 新对象（`compact --ops <tx> --no-ingest`，APPLIED seq 1，`changed_object_ids: ["CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL"]`，ingested 全空——mid-episode 显式关闭兜底收编）：

```json
{ "ops": [{ "op": "upsert_object", "envelope": {
    "id": "CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL", "kind": "capability", "axisProfile": "capability_default",
    "axes": { "lifecycle": "PROPOSED", "confidence": "PROVISIONAL", "evidence": "PLANNED", "change": "STABLE" },
    "authority": { "owner": "TOOL_OWNER", "delegates": [] }, "origin": "natural", "payload": { "…": "…" } } }] }
```

（跨轴断言实测：PROPOSED 强制 evidence=PLANNED，写反即 FATAL。）

```text
$ pomaster permit issue \
    --subject CAPABILITY.CSV_TOOL.SERIALIZE_ROWS \
    --subject CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL \
    --actor human:owner \
    --change-ref CHANGE.CSV_QUOTE_VARIANT \
    --capability CAPABILITY.CSV_TOOL.SERIALIZE_ROWS \
    --acceptance-shape '{"dod": ["BUILD gate passed on serialize variant tests", "CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL 生命周期推进走事务通道"]}' \
    --json
→ permit_ref = PERMIT.CHANGE_CSV_QUOTE_VARIANT.1   issued_at_seq=1  expires_at_seq=169  ttl_beats=168
```

五字段 → 台账逐项落位：身份=`requested_by {human, owner, self_attested:true}`（argv 自报恒标自报）；Capability 引用=`capability_refs`；契约引用=`change_ref`；Permit 范围=`scope.subject_ids`（两对象，write_policy=AGENT_WITH_PERMIT）；验收形状=`acceptance_shape.dod[2]`。

**基线捕获（G3 的 closure 前提）双态如实**：

```json
"baseline_captured": {
  "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS": null,   ← 签发时不在索引（absent=合法基线态，附 baseline_note 披露）
  "CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL": {
    "axes": { "lifecycle": "PROPOSED", "confidence": "PROVISIONAL", "evidence": "PLANNED", "change": "STABLE" },
    "rev": 1, "body_sha256": "sha256:cb7fa26f…" }
}
```

### 3.3 拍③ PROJECTION —— 三分区诚实空

`context compile --role implementer --json` → `ok=true`，MUST/ADVISORY/LAZY TOOLS 全部显式空（本项目无 gate_def 经验块与工具 catalog，范围空 → manifest 空，不杜撰全域上下文）；`inputs_fingerprint=sha256:c07fb0c2…00be7` 与 phaseC 逐字节同值（同输入重放稳定，D24 只读服务）。

### 3.4 拍④ EXECUTE —— exec-guard 两遍（allow / deny fail-closed）

```text
$ pomaster exec-guard --attempt attempt-in-scope.json --json      # id=CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL, op=upsert_object
→ ok=true  outcome=allowed  checked_at_seq=1  context_echo 原样回显                    exit 0

$ pomaster exec-guard --attempt attempt-out-of-scope.json --json  # id=PAGE.DASHBOARD（合法前缀、范围外）
→ ok=false  outcome=denied  reason=outside_scope                                      exit 1
  errors[0].code = PERMIT_SCOPE_DENIED
  hint = "scope expansion 拒绝静默放行（D20/GOLDEN-L8-2）：把目标对象纳入 Permit 范围须回 FRAMEWORK LOCK 重审升级，不得旁路扩权"
```

harness 判据 `case $? in 0) allow ;; *) block ;; esac` 两条腿各自成立：**范围内写免人检不免机器判卷点；范围外写被机器拦下并给扩权路标**。attempt 的 `context` 任意对象原样回显不判卷；命令全程不碰目标文件、不写 store（④拍内两次 exec-guard 后 status 字节不变）。

随后 Permit 内真实落笔：`tests/serialize.test.mjs`（default 引号 + force_quote_all 全引号两用例，往返逐字节断言）。

### 3.5 拍⑤ VERIFY —— check 纯读 + record 入账（generation_seq 推进实证）

副本安装 vitest 4.1.11 后：

```text
$ pomaster status --json    → generation_seq: 1
$ pomaster check --fast --json
→ ok=true  status=READY  verdict=passed  counts={scanned:2, applicableScanned:2, violations:0, notApplicable:0}   exit 0
$ pomaster status --json    → 与 check 前【字节全同】（cmp 通过）——check 全程零写状态（⑤判卷层不叠写路径，--record 方案否决的实证）
```

设计的入账形态 = **显式单条 `record gate-run`**（GateResult 文件由该次真实 check 运行的归一结果组装：counts 逐字取自 stdout，subject_id=harness 侧绑定决策，trust.asserted=null / recomputed 孪生随行）：

```text
$ pomaster record gate-run --from gate-result-passed.json --tool pomaster-cli-gauntlet --tool-version 0.0.0 --json
→ { "grn": "GRN-0002", "change": "APPLIED", "applied_seq": 2, "ran_at_seq": 1, "verdict": "passed",
    "gate": "BUILD", "ran_at_seq_ahead": false }          exit 0
$ pomaster status --json → generation_seq: 2      ← record 前后 1 → 2，证据入账 + seq 推进实证
```

（GRN 缺省分配=现有最大序号+1 → GRN-0002；ran_at_seq 未携带 → 采样 store 当前 seq=1 < applied_seq=2，倒挂不再新增。）

### 3.6 拍⑥ RECONCILE —— 真实篡改 + 真实 failed 证据 → 三段全命中

两个真实输入：

1. **真实回归**：把测试期望值写错（toUpperCase 探针）→ `check --fast` 真实失败（violations=1，exit 1，GATE_FAILED）→ `record gate-run` 入账 **GRN-0003**（applied_seq=3，verdict=failed）。
2. **真实越权篡改**：绕过事务通道直接手改 `state/truth-index.json` 中 FORCE_QUOTE_ALL 行的四轴（伪装「已实现」）。diff 恰两行：

```diff
-        "lifecycle": "PROPOSED",
+        "lifecycle": "CURRENT",
-        "evidence": "PLANNED",
+        "evidence": "IMPLEMENTED",
```

（rev 未动仍为 1——**绕过通道的篡改痕迹**：合法事务推进必推 rev。）

```text
$ pomaster reconcile --permit PERMIT.CHANGE_CSV_QUOTE_VARIANT.1 --json     exit 1（RECONCILE_DIRTY）
```

三段报告（原文见 captures/06d-reconcile.json）：

| 段 | 实测内容 |
|---|---|
| `changed_objects` | **命中被篡改对象**：`{id: CAPABILITY.CSV_TOOL.FORCE_QUOTE_ALL, kind: axes_change, axes: {lifecycle: PROPOSED→CURRENT, evidence: PLANNED→IMPLEMENTED}, content_drift: null, rev: {from:1, to:1}}`——只列变化的两轴；rev 1→1 即篡改指纹 |
| `exceptions` | **抓到 failed 证据**：`{evidence_ref: GRN-0003, plane: runs, verdict: failed, subject_id: CAPABILITY.CSV_TOOL.SERIALIZE_ROWS, gate: BUILD}` |
| `samples_to_review` | scope 内证据按 evidence_ref 字典序全取：`GRN-0002 (passed)` + `GRN-0003 (failed)`，`sample_reason: "all (total 2 <= samples 3)"`（确定性、零随机） |

`verdict_census` 全量计数（聚合不吞没）：runs `{failed:1, passed:2}`（GRN-0001 虽 scope 外仍可见）、claims `{VERIFIED:1}`（CLM-0001 夹具，scope 外仅入 census）。

### 3.7 拍⑦ COMPACT —— 入账推进 + D24 篡改告警不拦写 + NO_CHANGE byte-stable

```text
$ pomaster compact --json        # 第 1 次
→ change=APPLIED  applied_seq=4  ops_counts={record_gate_run:1}
  ingested.runs:  GRN-0001 canonicalized (ran_at_seq=3, ahead=false)   ← phaseC 裂缝闭合：夹具有损 canonical 化
                  GRN-0002 already_canonical / GRN-0003 already_canonical
  ingested.claims: CLM-0001 skipped_adjudicated                        ← VERIFIED 独立判定不被打回 UNVERIFIED（D20）
  ledger_seq_view.generation_seq = 4
  digest_warnings: [ "content_digest mismatch (stored sha256:bb152569… ≠ recomputed sha256:0211b0b9…) —
                      auto-regen applied（D24：WARN + auto-regen hint，永不阻断写入）" ]   ← ⑥拍真实篡改被当场抓住
```

三个要点：

1. **裂缝闭合（G4+G6）**：GRN-0001 自报 ran_at_seq=3 逐字保留（C5 不改写），但 truth-index 从 seq=0 推进到 4——phaseC 的「证据在、账本零入账」裂缝经 compact 收编闭合；超集字段（tool_snapshot/metric_dialect/digest_excluded_fields）被有损 canonical 化剥离（kernel v0 契约诚实缺席，首收编标 canonicalized 非静默覆写）。
2. **D24 哈希伦理实证**：篡改被 content_digest 失配**告警**抓住，auto-regen 后 ok=true exit 0——**告警不拦写**；且 auto-regen 只把摘要对齐现状，**篡改值不被回滚**（附录 A：索引/正文轴分歧永久留存供人审）。
3. **NO_CHANGE byte-stable**：

```text
$ pomaster compact --json        # 第 2 次 → change=NO_CHANGE, applied_seq=4（pending 集空：全部 already_canonical/skipped）
$ pomaster compact --json        # 第 3 次 → change=NO_CHANGE
sha256(#2) = 2851413cd935d3e26bd23b347cf4ab1220204864ee08bdab9ab5ac6732e0ee70
sha256(#3) = 2851413cd935d3e26bd23b347cf4ab1220204864ee08bdab9ab5ac6732e0ee70   ← 字节全同
第 4 次前后对 .pomaster 全树逐文件 sha256 快照 diff = 空                          ← 零写入实证
```

### 3.8 拍⑧ STATUS 收尾 + permit list 终态

```text
$ pomaster status --json ×2
sha256(#1) = c957e9505fde8bd9db3f4e707dcc873b2ba364b445bceb168c64485032d6391b
sha256(#2) = c957e9505fde8bd9db3f4e707dcc873b2ba364b445bceb168c64485032d6391b   ← 字节全同（无墙钟污染）
终态：dialect_match=true, generation_seq=4, objects.total=1 (capability/CURRENT——被篡改轴如实入状态呈现)
$ pomaster permit list --json
→ PERMIT.CHANGE_CSV_QUOTE_VARIANT.1  status=active  beats_remaining=165 (expires 169 − current 4)
  events: [{ type: PERMIT_ISSUED, seq: 1, count: 1 }]     ← 事件链按类型折叠（声明式聚合，计数保留）
  五字段台账全文回读（capability_refs / acceptance_shape / scope / self_attested 全在）
```

## 4. 纪律专项核对

| 纪律 | 本轮实证 |
|---|---|
| D24 哈希伦理 | digest 只住读侧：reconcile/compact 的 sha 全部由事务维护，人只读不算；篡改 → `DIGEST_WARNING` + auto-regen，ok=true 不拦写；篡改值不被静默回滚（分歧留存人审，附录 A） |
| A4 确定性 | 全程零墙钟字段；seq 账目表见附录 B；compact #2≡#3、status #1≡#2 字节全同；抽样 `sample_reason` 确定性可预言 |
| 四态纪律 | absent 基线=null 显式披露；LIGHT=NOT_CONFIGURED 非绿；RECONCILE_DIRTY/baseline_missing 是显式出口；census 全量计数不吞没 scope 外与例外外条目 |
| §45 双输出 | 一切命令 `--json` 机读信封；失败必带 `errors[].hint`（PERMIT_SCOPE_DENIED / GATE_FAILED / RECONCILE_DIRTY 各带处置路标） |
| C5 自报 | ran_at_seq 沿用/采样不改写；self_attested=true 如实标注；trust.asserted/recomputed 孪生随行入账 |

## 5. 缺口与诚实段

**沿用缺口（本轮复核）**：

| # | 缺口 | 本轮证据 |
|---|---|---|
| G5 | ⑤ gate 谱系不全：`gateAdapters` 仅 build（vitest 腿）；CONTRACT/ARCHITECTURE/BROWSER adapter 与 pytest 腿未落（gauntlet-lite/src/index.ts 注释明示「归后续批次」） | 本轮 ⑤ 仍只有 BUILD 腿可实跑 |
| G7 | （环境，非产品缺陷）本机 PATH 游离引号破坏 cmd 子进程链 | 本轮以逐调用 PATH 消毒绕过；产品侧 not_run fail-closed 行为已在 phaseC 段 b 实证，产品代码零改动 |

**本轮新发现（如实列表，不定性为缺陷）**：

| # | 发现 | 实测证据 |
|---|---|---|
| N1 | **reconcile 的 content_drift 双锚都在索引侧**（baseline.body_sha256 vs 当前行 bodySha256）：只手改**正文文件**不碰索引行的篡改，reconcile 不可见，要等下一次事务的 `sweepDigestTampering` row 级抽验才抓到——⑥拍 delta 审对「纯正文手改」存在覆盖盲区（纯读审计的时差，非误报） | kernel/src/reconcile.ts delta 比较逻辑 + sweepDigestTampering 写时抽验的双轨分工 |
| N2 | **mid-episode 用 `compact --ops` 物化对象时，默认兜底收编同时生效**（--ops 与证据收编同事务合并）：④拍工作流若无意收编必须记得 `--no-ingest`。本轮首次预登记即误收编 GRN-0001，重置副本重跑改用 `--no-ingest`。设计如此（方案 C=批量兜底），但通道混用陷阱真实存在，建议文档/`--help` 点名 | 本报告 §1 #4 与重跑记录 |
| N3 | **init 不创建 `state/authority.json`**（createStore 首开才惰性建）；upsert 前需人按种子形状登记 owner，「幽灵 owner=GHOST_AUTHORITY_OWNER FATAL」的修复路径只在报错 hint 里，init 引导未含 BOOTSTRAP 提示 | 本轮 §3.2 预登记前的手工登记 |
| N4 | **倒挂自愈后与「从未倒挂」在终态不可区分**：GRN-0001 ran_at_seq=3 的 ahead 倒挂随 seq 推进到 4 自然消解（ahead_evidence 转空）；C5 保持 ran_at_seq 不改写，但审计「时差曾存在」需回看 journal 逐事件，单看终态呈现无痕 | §3.7 `ran_at_seq_ahead:false` 与 journal TX_APPLIED 序列 |

**演示者诚实披露**：⑤/⑥ 的 GateResult JSON 文件由 harness（演示者）从对应真实 `check --fast` stdout 的归一结果组装（counts 逐字、trust 孪生、tool=pomaster-cli-gauntlet/0.0.0 自报）；`subject_id` 与受检能力的绑定是 harness 侧决策（path→id 绑定归 harness 是设计明文）。副本内 vitest/tests 增删与最终未回滚的回归注入均为演示产物，不入仓库。

## 附录 A：篡改的持久痕迹（auto-regen 不回滚篡改值）

compact #1 的 DIGEST_WARNING 之后，索引 content_digest 已对齐现状（stored==recomputed），但**篡改的轴值不被回滚**，索引/正文分歧永久留存供人审：

```text
index axes (state/truth-index.json): {"lifecycle":"CURRENT","confidence":"PROVISIONAL","evidence":"IMPLEMENTED","change":"STABLE"}
body  axes (truth/objects/capability/…force-quote-all.json): {"lifecycle":"PROPOSED","confidence":"PROVISIONAL","evidence":"PLANNED","change":"STABLE"}
row.rev = 1（未随轴变推进——绕过事务通道的指纹）
```

## 附录 B：seq 账目表（generation_seq 0→4 全程）

| seq | 事务内容 | 命令 |
|---|---|---|
| 0 | init 骨架（空账本） | `init` |
| 1 | upsert_object FORCE_QUOTE_ALL（PROPOSED/PLANNED） | `compact --ops … --no-ingest` |
| — | PERMIT.CHANGE_CSV_QUOTE_VARIANT.1 签发（事件写，不推 seq；journal 事件 seq=1） | `permit issue` |
| 2 | record_gate_run GRN-0002（passed，ran_at_seq=1） | `record gate-run` |
| 3 | record_gate_run GRN-0003（failed，ran_at_seq=2） | `record gate-run` |
| 4 | record_gate_run GRN-0001（夹具收编 canonicalized）+ D24 auto-regen | `compact` |
| 4 | NO_CHANGE ×3（零写入） | `compact` ×3 |

## 附录 C：环境

- node v22.13.1；`@pomaster/cli` 0.0.0（dist 实测前重建，与 src 同步）；corepack pnpm 11.20.0 → 副本 vitest 4.1.11。
- 仓库测试全绿：`./node_modules/.bin/vitest run` → **Test Files 33 passed (33)，Tests 588 passed (588)**。
- 捕获件（命令 stdout 原文 28 件）存 `%TEMP%\pomaster-phaseD\captures\`。

---

*报告生成：Phase D 实测演示（POMaster_VNext 八拍载体全谱系验证）；所有 `--json` 原文摘自真实命令 stdout。*
