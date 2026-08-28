# ④ 出口判据——三主题专属 change 端到端实测演示报告

> **seq**: DEMO-THEME-0001（A4：无墙钟日期，seq 代号锚定）　**性质**：三主题各一条**真实 change** 走八拍 8/8 全环（全部输出为命令真实 stdout；非 mock、非单测复述）。phaseD（`benchmarks/phaseD-demo-report.md`）证明的是**环本身**（CSV 单 fixture、单对象、单 delta kind）；本报告在**三主题异质对象**上复跑全环：change governance / API contract / data grid。
> **CLI**：`packages/cli/dist/bin.js`（`@pomaster/cli` 0.0.0；dist 与 src 同步——含 N1 修复后的 `kernel/src/reconcile.ts` row 级正文探测）；node v22.13.1
> **调用方式**：`node <仓库绝对路径>/packages/cli/dist/bin.js --dir <项目根> <command> [--json]`
> **靶子**：系统临时目录自建 fixture `%TEMP%\pomaster-theme-demo\`（`pomaster init` 起步的 `theme-demo-console` 0.1.0 独立项目；**临时目录不拷回**——对象 JSON 完整形状见附录 A 即可复现）。素材只读取材 MASTer 语料的已收编形态（`migration/master-batch1/truth/objects/` 的 change-object / contract-op / capability+component 三族）。
>
> **纪律声明**：
> - 未执行任何 git 操作；FROZEN 资产（`packages/schemas/assets/*`、两处 `vocab.ts`、`tests/golden/cases.json`）零触碰；`MASTer_master` 绝对只读（本轮仅只读 grep 语料形态，零写入）；本文件是本次演示在仓库内的唯一落盘产物；
> - 全部输出捕获件（58 件命令 stdout + 组装器 + tx/attempt/gate-result/claim 输入件）存于 `%TEMP%\pomaster-theme-demo-captures\`（不入库；报告内 sha 以捕获件为对账锚）；
> - 本机 PATH 含游离引号（phaseC 附录 A 的 G7），每条 shell 调用前以 `PATH="$(printf '%s' "$PATH" | tr -d '"')"` 消毒——**产品代码零改动**。

---

## 0. 预置事实

### 0.1 fixture 布局（三主题一店，对象各自成组）

```text
pomaster-theme-demo/
├── package.json               # theme-demo-console 0.1.0；devDeps: vitest 2.1.9（pnpm add 落 declared，BUILD detect 依赖声明在场）
├── .npmrc / pnpm-workspace.yaml   # 环境预处理（见 §0.3），fixture 侧自包含，产品零改动
├── openapi.yaml               # mini openapi 3.0.3（info.version 0.1.0）——主题② 的契约事实源
├── src/
│   ├── issues.js              # 主题①被测代码：issue 台账（open/close + 证据纪律）
│   ├── api-client.js          # 主题②被测代码：echo/health（real）+ login（初始 mock_unverified）
│   └── grid.js                # 主题③被测代码：grid 渲染注册表（可插拔 canonical 实现）
└── tests/                     # issues / api-client / grid 三个 .test.mjs（确定性假 transport，测试不触网）
```

### 0.2 治理对象分母（11 对象；kind/payload 形状只读取材 MASTer 收编件）

| 主题 | 对象（id / kind / 初始四轴） | 主题变更靶 |
|---|---|---|
| ① change governance | `CHANGE.CLOSE_WITHOUT_EVIDENCE`（change_object，**OPEN**：PROPOSED/EXPERIMENTAL/PLANNED，无 close_evidence） | ★本轮变更对象 |
| | `CHANGE.DEDUPE_OPEN_DUPES`（change_object，**CLOSED 带证据**：CURRENT/LOCKED/IMPLEMENTED，payload.close_evidence 在场） | |
| | `CHANGE.DOCS_STALE_LINKS`（change_object，OPEN，本轮 scope 外诚实留守） | |
| | `KNOWLEDGE.ADR_ISSUES_EVIDENCE_RULE`（knowledge_entry，ADR-0001） | |
| ② API contract | `API_REQ.ECHO.1` / `API_REQ.HEALTH.1`（contract_operation，payload.implementation_form=**real**，operation_id 指向 openapi.yaml） | |
| | `API_REQ.LOGIN.1`（contract_operation，implementation_form=**mock_unverified**，payload.unresolved 显式登记端点缺口——形状参考 MIG-B1 authenticate.1 的 implementation_form 建模） | ★本轮变更对象 |
| ③ data grid | `CAPABILITY.GRID.SUMMARY_TABLE` / `CAPABILITY.GRID.EDITABLE_ROWS`（capability，payload.forbidden 均带直连禁止规则：direct_dom_table_in_page / page_local_grid_css / inline_cell_renderer——源形参考 MIG-B1 grid.editable-grid 的 forbidden 三条） | ★EDITABLE_ROWS 本轮换锚 |
| | `COMPONENT.INLINE_EDITOR` / `COMPONENT.DATA_TABLE`（component，payload 建模参考 MIG-B1 COMPONENT.AG_GRID；**DATA_TABLE 签发时 absent**，预含 Permit scope） | ★DATA_TABLE 本轮 materialized |

三组对象分三次 `compact --ops <tx> --no-ingest` 预登记（mid-episode 显式关闭兜底收编，phaseD 的 N2 教训直接沿用）；`change_object` 类的 `payload.class_scan_result` 必填（R4）在 fixture 域内逐对象给全（scope/hits/fixed_count/regression_case_ref）。

### 0.3 环境预处理（三项，全部 fixture/会话侧，产品代码零改动）

1. **vitest 安装**：`corepack pnpm add -D vitest@2.1.9`（与仓库同版本，tool_version 口径可判卷）。
2. **pnpm 11 verify-deps 陷阱**：`corepack pnpm exec` 的 deps-status-check 会嵌套 spawn 裸 `pnpm`（本机只有 corepack shim）→ 子进程 "不是内部或外部命令"。fixture `.npmrc` 关 `verify-deps-before-run` + `pnpm-workspace.yaml` `allowBuilds: esbuild:true` 后，BUILD adapter 的 `corepack pnpm exec vitest run --reporter=json` 直连执行。
3. **corepack keyid 过旧**：Node 22 内置 corepack 的签名密钥集无法激活 pnpm 9.15.9（`Cannot find matching keyid`）→ fixture 不得钉 `packageManager: pnpm@9.15.9`，改用 corepack 自带的 11.20.0。另建 `%TEMP%\pomaster-bin` corepack shim 目录前置 PATH，保证嵌套 pnpm 调用可解析。

### 0.4 BOOTSTRAP 与基线

- `init` ×2：CREATED → **NO_CHANGE**（零写入幂等，A4）。
- `state/authority.json` BOOTSTRAP 人工登记 3 个 owner：`CHANGE_GOV_OWNER` / `API_CONTRACT_OWNER` / `DATA_GRID_OWNER`（phaseD 的 N3 沿用：init 不建 authority 条目，幽灵 owner=FATAL 的修复路径只在报错 hint 里）。
- fixture 测试基线：**3 文件 8 断言全绿**（后续每主题的红/绿使断言数 8→9→10→11 演进，见 §1 退出码）。
- 仓库测试（本轮实测前全量）：`./node_modules/.bin/vitest run` → **Test Files 33 passed (33)，Tests 593 passed (593)**。

---

## 1. 执行序列与退出码

同一套八拍命令 × 3 主题；seq 账本共享（单 store），账目表见附录 B。

| # | 主题① change governance | 退出码 | 主题② API contract | 退出码 | 主题③ data grid | 退出码 |
|---|---|---|---|---|---|---|
| 预登记 | `compact --ops tx-cg --no-ingest`（4 upsert）APPLIED seq1 | 0 | `compact --ops tx-api --no-ingest`（3 upsert）APPLIED seq7 | 0 | `compact --ops tx-grid --no-ingest`（3 upsert）APPLIED seq12 | 0 |
| ① | `triage "…ADR-0001 关闭该 issue…"` → **LIGHT**（DEFAULT_NO_SIGNAL，NOT_CONFIGURED 诚实缺省） | 0 | `triage "…mock_unverified 升级 real…openapi 契约登记…"` → **STANDARD**（**E_CONTRACT_KEYWORD**，命中 契约/openapi/api_req——升档规则首次在三主题语料中自然分化） | 0 | `triage "…换用已登记组件 DataTable…"` → **LIGHT** | 0 |
| ② | `permit issue` ×4 subject → `PERMIT.CHANGE_CLOSE_WITHOUT_EVIDENCE.1`（issued@1，TTL 168，基线 4 对象全捕获） | 0 | `permit issue` ×3 → `PERMIT.CHANGE_API_LOGIN_REAL.1`（issued@7） | 0 | `permit issue` ×4（含 absent 的 DATA_TABLE）→ `PERMIT.CHANGE_GRID_IMPL_SWAP.1`（issued@12） | 0 |
| ③ | `context compile --role implementer` → 三分区诚实空投影 | 0 | 同左 | 0 | 同左 | 0 |
| ④ | `exec-guard` in-scope（CHANGE.CLOSE_WITHOUT_EVIDENCE↑upsert）→ **allowed**；越权探针 = **API_REQ.LOGIN.1**（主题②对象）→ **denied/outside_scope** | 0 / **1** | allowed；越权探针 = **CAPABILITY.GRID.EDITABLE_ROWS**（主题③对象）→ denied | 0 / **1** | allowed；越权探针 = **CHANGE.CLOSE_WITHOUT_EVIDENCE**（主题①对象）→ denied | 0 / **1** |
| ⑤ 基线 | `check --fast` **passed 8/8/0/0** → `record gate-run` GRN-0001（applied@2） | 0/0 | passed 9/9/0/0 → GRN-0004（applied@8） | 0/0 | passed 10/10/0/0 → GRN-0007（applied@13） | 0/0 |
| 变更·红 | 回归测试先行（TDD）→ `check --fast` **failed 9/9/1/0 exit 1（GATE_FAILED）** → `record gate-run` **GRN-0002（failed，applied@3）** | 1/0 | 真实端点契约测试先行 → failed 10/10/1/0 → **GRN-0005（failed，applied@9）** | 1/0 | data-table 契约测试先行 → failed 11/11/1/0 → **GRN-0008（failed，applied@14）** | 1/0 |
| 变更·落 | 修复 `src/issues.js` + `compact --ops tx-cg-close`（upsert close_evidence + **transition** PROPOSED→CURRENT/PLANNED→IMPLEMENTED，authorityRef=Permit——PROPOSED→CURRENT requires authority_approval 的矩阵门槛实测）APPLIED seq4；→ 绿 9/9/0/0 → GRN-0003（applied@5）；`record claim` CLM-0001（UNVERIFIED，applied@6） | 0/0/0/0 | login 换 real 实现 + openapi 增 `/api/v1/login`（operationId demo_api_v1_login_post）+ `compact --ops tx-api-real`（payload mock_unverified→**real**，四轴不动）APPLIED seq10；→ 绿 10/10/0/0 → GRN-0006（applied@11） | 0/0/0/0 | DataTable 实现落码 + 默认翻转 + `compact --ops tx-grid-swap`（upsert DATA_TABLE **materialized** + upsert EDITABLE_ROWS 换锚）APPLIED seq15；**二次红**（stale 用例漏改，11/11/1/0 → GRN-0009 先误标 passed 后**通道内纠偏重录为 failed** @17，见 §3.3-6）；修 stale → 绿 11/11/0/0 → GRN-0010（applied@18） | 0/1/0/0/0/0 |
| ⑥ | `reconcile --permit …` → **RECONCILE_DIRTY exit 1，delta 命中主题变更对象**（§3.1-7）；纯正文手改 → **content_tamper 被抓**（§3.1-8）；恢复后重放 ≡ 首跑（sha 见 §4.2） | 1/1/1 | reconcile → RECONCILE_DIRTY，**content_drift** 命中 | 1 | reconcile → RECONCILE_DIRTY，**content_drift + materialized** 双命中 | 1 |
| ⑦ | （全局收尾）`compact` ×4：#1–#3 **NO_CHANGE 字节全同**、#4 前后全树零写入 | 0 | 同左（同一批命令） | 0 | 同左 | 0 |
| ⑧ | （全局收尾）`status --json` ×2 **字节全同** + `permit list` 终态 3 许可全 active | 0 | 同左 | 0 | 同左 | 0 |

---

## 2. 八拍对照表（3 主题 × 8 拍全实跑）

| 拍 | 名称 | 主题①载体与结果 | 主题②载体与结果 | 主题③载体与结果 | 证据锚 |
|---|---|---|---|---|---|
| ① | TRIAGE | LIGHT / NOT_CONFIGURED（8 项 absent_signals 全显式） | **STANDARD / E_CONTRACT_KEYWORD**（matched_keywords=[契约, openapi, api_req]，INFERRED 如实不冒充实测） | LIGHT / DEFAULT_NO_SIGNAL | 捕获 003/020/034 |
| ② | FRAMEWORK LOCK | 五字段全落台账 + 签发瞬间基线捕获（4 对象 axes/rev/body_sha256 双态如实）；`--acceptance-shape @file` 三条 dod 落台账 | 同构；capability_refs=[API_REQ.LOGIN.1] | 同构；scope 预含 absent 对象（baseline null=合法基线态） | §3 各节 |
| ③ | PROJECTION | 三分区诚实空投影（无 gate_def 经验块不杜撰） | 同左 | 同左 | 捕获 006/023/037 |
| ④ | EXECUTE | allow/deny fail-closed 双实证；**三主题互为越权探针**（denied/outside_scope → PERMIT_SCOPE_DENIED，hint 给扩权路标） | 同左 | 同左 | §3.1-4 |
| ⑤ | VERIFY | check 纯读 + record 显式入账；failed→passed 成对 GRN 全部 subject 绑定主题对象（harness 绑定决策，§7 披露） | 同左 | 同左 + 一次**通道内纠偏重录**（GRN-0009） | §3.3-6 |
| ⑥ | RECONCILE | **axes_change**（PROPOSED→CURRENT 等 3 轴，rev 1→3）+ exceptions 抓 GRN-0002 failed + N1 content_tamper 实锤 | **content_drift**（true，rev 1→2）+ exceptions 抓 GRN-0005 | **content_drift + materialized**（rev null→1）双对象命中 + exceptions 抓 GRN-0008/0009 | §3/§4.1 |
| ⑦ | COMPACT | NO_CHANGE ×3 字节全同 + 全树零写入（收尾全局） | 同左 | 同左 | §4.2 |
| ⑧ | STATUS | ×2 字节全同；permit list：3 许可 active（beats_remaining 151/157/162），事件链折叠呈现 | 同左 | 同左 | §4.2 |

---

## 3. 各主题实测详情

### 3.1 主题① change governance —— OPEN issue 补关闭证据并关闭

**请求**：「修复 CHANGE.CLOSE_WITHOUT_EVIDENCE：issue 台账对 evidence=undefined 裸崩溃，补回归测试并按 ADR-0001 关闭该 issue」→ triage **LIGHT**（跨域/契约关键词零命中，无信号 = NOT_CONFIGURED 诚实缺省）。

**② 基线捕获双态**：`permit issue` 输出的 `baseline_captured` 对 4 个 subject 全量落 axes/rev/body_sha256（OPEN 对象 `CHANGE.CLOSE_WITHOUT_EVIDENCE`：`{lifecycle: PROPOSED, confidence: EXPERIMENTAL, evidence: PLANNED, change: STABLE}, rev 1, body_sha256: sha256:36de283a…`；CLOSED 对象 `CHANGE.DEDUPE_OPEN_DUPES`：CURRENT/LOCKED/IMPLEMENTED 同构捕获）——OPEN/CLOSED 两种镜像形态在台账逐字可对。

**④ exec-guard 两遍**：

```text
$ pomaster exec-guard --attempt attempt-cg-in-scope.json --json    # id=CHANGE.CLOSE_WITHOUT_EVIDENCE, op=upsert_object
→ ok=true  outcome=allowed   exit 0
$ pomaster exec-guard --attempt attempt-cg-out-of-scope.json --json  # id=API_REQ.LOGIN.1（主题②对象，跨主题探针）
→ ok=false  outcome=denied  reason=outside_scope                        exit 1
  errors[0].code = PERMIT_SCOPE_DENIED
  hint = "scope expansion 拒绝静默放行（D20/GOLDEN-L8-2）：把目标对象纳入 Permit 范围须回 FRAMEWORK LOCK 重审升级，不得旁路扩权"
```

**⑤ 真实变更（TDD 红先于修复）**：

1. 基线 `check --fast` passed（8/8/0/0，真实 vitest）→ `record gate-run` → **GRN-0001**（passed，applied_seq=2，ran_at_seq=1 通路采样）。
2. 落笔回归测试（`tests/issues.test.mjs` 新增「close without evidence fails with a structured error」——期望 `/evidence/` 词形，现状抛裸 TypeError）→ `check --fast` **failed（9/9/1/0，exit 1，GATE_FAILED）**→ 组装归一结果（counts 逐字）→ `record gate-run` → **GRN-0002（failed，applied_seq=3）**——主题①的 exceptions 真实证据。
3. 修复 `src/issues.js`（无证据关闭 → 结构化错误 `close without evidence is forbidden: <id> (evidence required)`）+ `compact --ops tx-cg-close --json`：

```text
$ pomaster compact --ops tx-cg-close.json --json
→ change=APPLIED  applied_seq=4  ops_counts={upsert_object:1, transition_object:1}
  changed_object_ids: ["CHANGE.CLOSE_WITHOUT_EVIDENCE"]
```

   事务内双 op：upsert 补 `payload.close_evidence{regression: TEST.ISSUES.CLOSE_FLOW, grn_refs:[GRN-0002, GRN-0003], …}` + class_scan_result 翻正（hits 1→0、fixed_count 0→1）；transition 补 axes（PROPOSED→CURRENT、EXPERIMENTAL→LOCKED、PLANNED→IMPLEMENTED）——**PROPOSED→CURRENT requires authority_approval 实测**：tx.authorityRef=PERMIT.CHANGE_CLOSE_WITHOUT_EVIDENCE.1 缺失即 EVOLUTION_REQUIRED（矩阵门槛在主题①对象上真实触发过一次拦截验证）。
4. 绿（9/9/0/0）→ **GRN-0003**（passed，applied_seq=5）。附 `record claim` CLM-0001（subject=CHANGE.DEDUPE_OPEN_DUPES，UNVERIFIED 先立后证，D20；applied_seq=6）。

**⑥ reconcile 三段全命中**（`reconcile --permit PERMIT.CHANGE_CLOSE_WITHOUT_EVIDENCE.1 --json`，exit 1 RECONCILE_DIRTY）：

| 段 | 实测内容 |
|---|---|
| `changed_objects` | **命中主题变更对象**：`{id: CHANGE.CLOSE_WITHOUT_EVIDENCE, kind: axes_change, axes: {lifecycle: PROPOSED→CURRENT, confidence: EXPERIMENTAL→LOCKED, evidence: PLANNED→IMPLEMENTED}, content_drift: null, rev: {from:1, to:3}}`——只列变化的 3 轴；rev 1→3 = 事务双 op 的合法指纹（与 phaseD 篡改的 rev 1→1 恰成对照） |
| `exceptions` | **抓到主题真实 failed 证据**：`{evidence_ref: GRN-0002, plane: runs, verdict: failed, subject_id: CHANGE.CLOSE_WITHOUT_EVIDENCE, gate: BUILD}` |
| `verdict_census` | runs `{failed:1, passed:2}` + claims `{UNVERIFIED:1}`（全量计数，scope 内证据一条不吞） |
| `samples_to_review` | pool=4（GRN-0001/2/3 + CLM-0001）> 3 → stride 确定性抽 3：`CLM-0001(0/3), GRN-0001(1/3), GRN-0002(2/3)`——`sample_reason` 可手工预言（禁随机禁墙钟） |

**⑦ N1 row 级正文探测实证（phaseD 盲区收窄在本 store 生效）**：手改正文文件 `change.close-without-evidence.json` 第 6 行 `lifecycle: CURRENT→PROPOSED`（**索引行 body_sha256 不动**——纯正文手改，phaseD 的 reconcile 对此不可见）→ 重跑 reconcile：

```json
{
  "kind": "content_tamper",
  "subject_id": "CHANGE.CLOSE_WITHOUT_EVIDENCE",
  "body_ref": "truth/objects/change-object/change.close-without-evidence.json",
  "index_sha256": "sha256:4d47604d761610387c47f97859f29c76cc1d4b9028e32c995fde1016fbd792dc",
  "body_sha256": "sha256:2b97d2a0833db37cb5ed38e011cb722e82ab9c1469ccb9415d48c3517f11aea9"
}
```

   ——探测分母（抽中样本 ∪ changed_objects）在最小变更场景下即覆盖被改对象；`RECONCILE_DIRTY exit 1`（只报不修，D24 告警不拦写）。人审处置 = 恢复正文原字节 → 第三次 reconcile 与首跑**字节全同**（sha256 见 §4.2，纯读重放稳定的顺带实证）。

### 3.2 主题② API contract —— mock_unverified 升 real 且 openapi 增对应端点

**请求**：「API_REQ.LOGIN.1 从 mock_unverified 升级为 real：接入真实端点并在 openapi 契约登记 demo_api_v1_login_post」→ triage **STANDARD**（matched_rule=E_CONTRACT_KEYWORD，matched_keywords=[契约, openapi, api_req]；INFERRED 证据级如实——关键词只是关于世界的推断，不冒充 contract registry 实测）。三主题 triage 首次自然分化（LIGHT/STANDARD/LIGHT）。

**预登记的对象即契约缺口镜像**：`API_REQ.LOGIN.1` payload `implementation_form: "mock_unverified"` + `implementation_form_basis` 引用 `src/api-client.js` 的 mock 实现证据 + `payload.unresolved: ["openapi_endpoint_missing: demo_api_v1_login_post 不在 openapi.yaml 0.1.0 paths 内"]`——代码 mock 态与 openapi 端点缺口在对象内互为镜像（源形参考 MIG-B1 authenticate.1 的 implementation_form/unresolved 建模）。

**② 基线捕获**：3 个 contract_operation 全量（LOGIN.1：CURRENT/LOCKED/IMPLEMENTED, rev 1——契约面已接受、接线面 mock 的正交双轴拆分，与 MASTer 源形一致）。

**④ exec-guard**：allowed（API_REQ.LOGIN.1↑upsert）/ denied（CAPABILITY.GRID.EDITABLE_ROWS——主题③对象，outside_scope）。

**⑤ 真实变更**：

1. 基线绿（9/9/0/0）→ **GRN-0004**（passed，subject=API_REQ.LOGIN.1，applied_seq=8）。
2. 红：新增真实端点契约测试（transport 注入断言 `POST https://api.example.com/api/v1/login`、请求体 `{username, password}`、响应映射 `{token, mock:false}`；现状 login 忽略 transport 恒回 mock token）→ `check --fast` **failed（10/10/1/0）**→ **GRN-0005（failed，applied_seq=9）**。
3. 变更落笔：`src/api-client.js` login 换 real 实现（transport + 结构化 401 错误）；测试的 mock 用例同步替换为 401 错误路径用例（契约变更连测试一起改，旧 mock 断言不残留）；`openapi.yaml` 追加 `/api/v1/login` 端点块（operationId=demo_api_v1_login_post，request/response schema 与对象 request_need/response_need 对齐）+ `compact --ops tx-api-real`（payload：implementation_form mock_unverified→**real**、basis 更新、unresolved 清空；**四轴不动**）→ APPLIED seq10。

```text
$ pomaster compact --ops tx-api-real.json --json
→ change=APPLIED  applied_seq=10  ops_counts={upsert_object:1}  changed_object_ids: ["API_REQ.LOGIN.1"]
```

4. 绿（10/10/0/0）→ **GRN-0006**（passed，applied_seq=11）。

**⑥ reconcile**（PERMIT.CHANGE_API_LOGIN_REAL.1，exit 1 RECONCILE_DIRTY）：

```json
"changed_objects": [{ "id": "API_REQ.LOGIN.1", "kind": "content_drift", "axes": null, "content_drift": true, "rev": {"from": 1, "to": 2} }],
"exceptions": [{ "evidence_ref": "GRN-0005", "plane": "runs", "verdict": "failed", "subject_id": "API_REQ.LOGIN.1", "gate": "BUILD" }],
"verdict_census": { "runs": {"failed": 2, "passed": 4}, "claims": {"UNVERIFIED": 1} },
"samples_to_review": [GRN-0004(0/3), GRN-0005(1/3), GRN-0006(2/3)]   // pool=3 ≤ samples=3 全取
```

   ——payload 升级（axes 不动）→ delta 以 **content_drift** kind 命中主题变更对象，`content_drift: true` + rev 1→2（rev 推进 + journal TX_APPLIED 在场 = 合法事务变更的人审证据；kind 词形本身不分合法/越权来源——语义张力见 §7-N7）。

### 3.3 主题③ data grid —— grid 对象换 canonical 实现

**请求**：「CAPABILITY.GRID.EDITABLE_ROWS 换用已登记组件 DataTable 作为 canonical 实现，登记 COMPONENT.DATA_TABLE 并更新键绑定」→ triage **LIGHT**。

**② 基线捕获含 absent 态**：scope 4 对象中 `COMPONENT.DATA_TABLE` 签发时不存在 → `baseline_captured["COMPONENT.DATA_TABLE"] = null`（absent=合法基线态，附 baseline_note 披露）——这是 materialized delta 的前提。

**④ exec-guard**：allowed（CAPABILITY.GRID.EDITABLE_ROWS↑upsert）/ denied（CHANGE.CLOSE_WITHOUT_EVIDENCE——主题①对象，outside_scope）。三主题互为越权探针的闭环在此完成：每份 Permit 都拒绝了另外两主题的对象。

**⑤ 真实变更（含一次诚实事故与通道内纠偏）**：

1. 基线绿（10/10/0/0）→ **GRN-0007**（passed，applied_seq=13）。
2. 红：data-table 契约测试先行（断言 `EDITABLE_ROWS_DEFAULT === "DataTable"` 且渲染含 `data-table` 标记）→ `check --fast` **failed（11/11/1/0）**→ **GRN-0008（failed，applied_seq=14）**。
3. 变更落笔：`src/grid.js` 注册 DataTable 实现（`data-table:` 头 + 逐行标记）并翻转默认；InlineRowsEditor 保留注册留档（换锚不删旧实现）；`compact --ops tx-grid-swap`（**双 upsert 单事务**：COMPONENT.DATA_TABLE 首次 materialized + CAPABILITY.GRID.EDITABLE_ROWS payload.canonical_realization 换锚 `InlineRowsEditor→DataTable`，authorityRef=Permit）→ APPLIED seq15。

```text
$ pomaster compact --ops tx-grid-swap.json --json
→ change=APPLIED  applied_seq=15  changed_object_ids: ["CAPABILITY.GRID.EDITABLE_ROWS", "COMPONENT.DATA_TABLE"]
```

4. **二次红与 GRN-0009 纠偏（诚实段，§7-N6）**：绿跑前漏改初始用例（仍在断言旧默认 `InlineRowsEditor`）→ `check --fast` failed（11/11/1/0）——但演示 harness 组装该次结果时**误标 verdict=passed**（violations=1 与 passed 同录入账，applied_seq=16）。纠偏走 record 通路的同号重放：修正组装文件 verdict=failed（与真实 stdout 逐字一致）→ `record gate-run --grn GRN-0009` → 内容有变 → **canonical 化重录 APPLIED seq17, verdict=failed**（判定可复核非盲覆写）；journal append-only 保留两次 TX_APPLIED 痕迹，先误标后纠偏全程可审计。
5. 修复 stale 用例（改为显式选择 InlineRowsEditor 的留档断言）→ 绿（11/11/0/0）→ **GRN-0010**（passed，applied_seq=18）。

**⑥ reconcile**（PERMIT.CHANGE_GRID_IMPL_SWAP.1，exit 1 RECONCILE_DIRTY）：

```json
"changed_objects": [
  { "id": "CAPABILITY.GRID.EDITABLE_ROWS", "kind": "content_drift", "axes": null, "content_drift": true, "rev": {"from": 1, "to": 2} },
  { "id": "COMPONENT.DATA_TABLE", "kind": "materialized", "axes": null, "content_drift": null, "rev": {"from": null, "to": 1} }
],
"exceptions": [
  { "evidence_ref": "GRN-0008", "plane": "runs", "verdict": "failed", "subject_id": "CAPABILITY.GRID.EDITABLE_ROWS", "gate": "BUILD" },
  { "evidence_ref": "GRN-0009", "plane": "runs", "verdict": "failed", "subject_id": "CAPABILITY.GRID.EDITABLE_ROWS", "gate": "BUILD" }
],
"verdict_census": { "runs": {"failed": 4, "passed": 6}, "claims": {"UNVERIFIED": 1} },
"scope_summary": { "subjects": 4, "materialized": 1, "vanished": 0 },
"samples_to_review": [GRN-0007(0/3), GRN-0008(1/3), GRN-0009(2/3)]   // pool=5 > 3，stride 抽样
```

   ——**双对象双 kind 命中**：换锚对象 content_drift + 新组件 materialized（absent→present，content_drift=null 显式未知不冒充「无漂移」）；GRN-0008/0009 两条真实 failed 全部入 exceptions（误标事故被纠偏后如实呈现）。三个主题合计覆盖 RECONCILE_DELTA_KINDS 四词形中的三个（axes_change / content_drift / materialized；vanished 属异常形态不制造）。

---

## 4. 关键判定汇总（任务三条逐项对账）

### 4.1 每主题的 reconcile delta 命中该主题变更对象 + exceptions 抓到主题真实 failed 证据

| 主题 | 真实变更（命令通道） | reconcile `changed_objects` 命中 | reconcile `exceptions` 命中（真实 failed） |
|---|---|---|---|
| ① change governance | OPEN issue 补关闭证据并关闭（`compact --ops`：upsert close_evidence + transition 三轴，authorityRef=Permit，seq4） | `CHANGE.CLOSE_WITHOUT_EVIDENCE` / **axes_change**（3 轴）/ rev 1→3 | **GRN-0002** failed（subject=CHANGE.CLOSE_WITHOUT_EVIDENCE, BUILD） |
| ② API contract | mock_unverified 升 real + openapi 增 `/api/v1/login`（`compact --ops`：upsert payload，seq10） | `API_REQ.LOGIN.1` / **content_drift**(true) / rev 1→2 | **GRN-0005** failed（subject=API_REQ.LOGIN.1, BUILD） |
| ③ data grid | grid 换 canonical 实现 + 新组件登记（`compact --ops`：双 upsert，seq15） | `CAPABILITY.GRID.EDITABLE_ROWS` **content_drift**(true) rev 1→2 ＋ `COMPONENT.DATA_TABLE` **materialized** rev null→1 | **GRN-0008** + **GRN-0009** failed（subject=CAPABILITY.GRID.EDITABLE_ROWS, BUILD） |

三轮 reconcile 均 exit 1（RECONCILE_DIRTY，`errors[0].hint` 给「人审三段后处置」路标）——dirty 是 ⑥ 拍的**正常工作出口**（有变更就该人审），三轮 delta 恰好全部命中有意变更、零误报零漏报。

### 4.2 三次 NO_CHANGE + byte-stable sha 清单

```text
$ pomaster compact --json   # 全 11 证据条目 already_canonical / ops 空集
#1 → change=NO_CHANGE applied_seq=18   sha256 = 369d0297f2e50603f471905427ff87808d8e2ab9dd4b31aa32bfd3f957b37377
#2 → change=NO_CHANGE applied_seq=18   sha256 = 369d0297f2e50603f471905427ff87808d8e2ab9dd4b31aa32bfd3f957b37377   ← 三次字节全同
#3 → change=NO_CHANGE applied_seq=18   sha256 = 369d0297f2e50603f471905427ff87808d8e2ab9dd4b31aa32bfd3f957b37377   ← 三次字节全同
#4 前后对 .pomaster 全树 28 文件逐文件 sha256 快照 diff = 空                                  ← 零写入实证

$ pomaster status --json
#1 → generation_seq=18, objects.total=11   sha256 = b75961e9e388825e8341386d22ecd1f5ac3eb13433c85139e41eda07b4abb6d4
#2 → 同上                                  sha256 = b75961e9e388825e8341386d22ecd1f5ac3eb13433c85139e41eda07b4abb6d4   ← 两次字节全同

$ pomaster permit list --json   # 终态：current_seq=18；三许可全 active（beats_remaining=151/157/162），
                                # 事件链按类型折叠（各 1×PERMIT_ISSUED）；五字段台账全文回读

附：reconcile 纯读重放——主题① 首跑 ≡ 正文恢复后重跑（同 store state 字节全同）
    sha256 = 0f844d41f85a5f6aa41f0be5f9cf563bc30aea6f08a0e8eb229eae0a78ea4a73 （两件捕获件全同）
```

---

## 5. 纪律专项核对

| 纪律 | 本轮实证 |
|---|---|
| FROZEN 零改动 | `packages/schemas/assets/*`、两处 `vocab.ts`、`tests/golden/cases.json` 零触碰；全部对象值取既有词表闭包（kind 十类、四轴、verdict 七态、implementation_form 取 MASTer 语料既有词形 real/mock_unverified）；零新前缀零新词值 |
| D24 哈希伦理 | 全程零人工算 sha 入治理面（所有 digest 事务自动维护）；content_tamper 探测只报不修；demo 无一例 digest_warnings（18 事务全 0）；本报告 §4.2 的 sha 是**演示者对捕获件的对账哈希**（phaseD 同款），非治理 digest |
| A4 确定性 | 全程零墙钟字段（ADR 的 decided_at_seq=1 以 seq 锚定；TTL 只呈现 beats）；compact ×3 / status ×2 / reconcile 重放字节全同；抽样 stride 可手工预言 |
| 四态纪律 | absent 基线=null 显式（COMPONENT.DATA_TABLE）；LIGHT=NOT_CONFIGURED 非绿（两主题）；RECONCILE_DIRTY 是显式出口；census 全量计数吞不掉任何 scope 外条目（`failed:4, passed:6` 全局可见） |
| §45 双输出 | 一切命令 `--json` 机读信封；失败必带 `errors[].hint`（PERMIT_SCOPE_DENIED / GATE_FAILED / RECONCILE_DIRTY 各带处置路标） |
| C5 自报 | ran_at_seq 通路采样/自报沿用不改写；GRN 由通路分配；self_attested=true 如实标注；CLM-0001 恒 UNVERIFIED（先立后证） |
| MASTer 只读 | 仅只读 grep `migration/master-batch1/truth/objects/` 取形状；消费项目零写入 |

---

## 6. 共性结论

1. **治理面与主题解耦成立**：三主题对象 kind/payload 形状异质（change_object 带 class_scan_result 硬约束 / contract_operation 带 operation_id 与 implementation_form / capability+component 带 forbidden 与 canonical_realization），但八拍命令、词表、信封、退出码**零特化适配**——出口判据「环」不挑对象形状。
2. **delta 判定在三型 kind 上全命中**：phaseD 只实证了 axes_change；本轮 axes_change（合法事务三轴推进，rev 1→3）、content_drift（合法 payload 变更与真 content_tamper 两种来源）、materialized（absent→present）三型各自命中对应主题的有意变更对象，零误报。
3. **failed 证据的现实来源是 TDD 红绿循环**：三主题各以「回归/契约测试先行 → 真实失败 → 修复 → 绿」产生 failed/passed 成对 GRN；exceptions 段对主题 failed 证据的命中只依赖 subject 绑定分母，跨主题稳定复现。
4. **exec-guard 的跨主题探针**：三份 Permit 互指对方对象全部 denied/outside_scope——scope 隔离在多主题共存单 store 场景下的 fail-closed 实证（phaseD 单 Permit 无此场景）。
5. **N1 修复在真实三主题 store 上生效**：纯正文手改被 row 级探测当场抓为 content_tamper 例外（§3.1-7），且探测分母在「单对象变更」的最小场景下即覆盖被改对象——写侧 sweep 与读侧 probe 双轨分工的实测闭合。
6. **triage 升档规则自然分化**：同一关键词引擎在「契约登记」请求上命中 E_CONTRACT_KEYWORD 升 STANDARD，在其余两主题诚实落 LIGHT——判档与主题语义相关而与命令面无关。

## 7. 缺口与诚实段

**沿用缺口（本轮复核仍然成立）**：

| # | 缺口 | 本轮证据 |
|---|---|---|
| G5 | ⑤ gate 谱系不全：仅 BUILD（vitest 腿）可实跑；CONTRACT 腿缺席意味着主题②的「契约一致性」实际由 fixture 测试代偿（openapi.yaml 与代码的对齐是人审 + 测试断言，非机器 gate） | 三主题 ⑤ 均只有 BUILD 腿 |
| N2 | `compact --ops` 与证据收编同事务合并的通道混用陷阱 | 本轮预登记统一 `--no-ingest` 规避；主题变更 tx 未带 `--no-ingest`（当时平面无 pending，行为等价——但混用风险仍在，建议文档点名） |
| N3 | init 不建 authority 条目 | BOOTSTRAP 仍需手写 `state/authority.json`（3 owner） |

**本轮新发现（如实列表）**：

| # | 发现 | 实测证据 |
|---|---|---|
| N5 | **GateResult 组装与 subject 绑定归 harness（设计明文的现实重量）**：check --fast 是全项目粒度（subject_id=null），exceptions 命中依赖组装时把主题对象绑进 subject_id；counts/verdict 逐字取自真实 stdout，但绑定决策无法机器复核 | 三主题 GRN 组装件存 captures（`gr-cg-*` / `gr-api-*` / `gr-grid-*`），组装器 `assemble-gate-result.mjs` 一并留档 |
| N6 | **harness 误标事故与通道内纠偏**：GRN-0009 首录时 verdict 与 counts 矛盾（passed + violations=1 入账）——record 通路不拦（归一函数无此交叉校验）；纠偏走 `--grn` 同号重放 canonical 化为 failed，journal append-only 保全两次痕迹。教训：normalizeGateResult 对「verdict=passed 而 counts.violations>0」不判 FATAL（失配 cap 只看 asserted/recomputed 孪生，组装侧绕过了孪生）——该交叉校验缺口如实留档 | §3.3-5；捕获 046（误标 APPLIED）与 048（纠偏 APPLIED） |
| N7 | **content_drift kind 词形的语义张力**：合法事务 payload 变更与越权静默漂移在 changed_objects 中同词形呈现（人审需看 rev 推进 + journal TX_APPLIED 区分来源）；RECONCILE_DELTA_KINDS 是呈现层局部词 TODO(vocab-pr)，扩词形（如事务来源标注）归词汇表 PR | §3.2-⑥ / §3.3-⑥ 与 §3.1-⑦ 的对照 |
| N8 | **pnpm 11 + corepack 的 fixture 侧摩擦**（verify-deps 嵌套 spawn / keyid 过旧钉不了旧版 pnpm）：BUILD adapter 硬编码 `corepack pnpm exec`，在「无裸 pnpm 命令」环境依赖 fixture 侧 .npmrc 让路 | §0.3；产品代码零改动，但 `--help`/文档点名可再降摩擦 |

**演示者诚实披露**：fixture 的三个 src/tests 文件与 openapi.yaml 是演示者编写的最小被测物（确定性假 transport，测试不触网）；三主题红跑均为真实 vitest 失败（非注入探针）；GateResult 组装件如 N5 披露；fixture 与捕获件留在系统临时目录不拷回，本报告 + 附录 A 形状即复现锚。

---

## 附录 A：对象 JSON 形状（复现锚；最终态 = 事务通道产出，rev/axes 可对账附录 B）

### A.1 主题① pivotal：CHANGE.CLOSE_WITHOUT_EVIDENCE（最终态全文，rev 3）

```json
{
  "id": "CHANGE.CLOSE_WITHOUT_EVIDENCE",
  "kind": "change_object",
  "axis_profile": "change_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "title_zh": "Issue：无证据关闭 issue 应为结构化错误",
  "authority": { "owner": "CHANGE_GOV_OWNER", "delegates": [], "write_policy": "AGENT_WITH_PERMIT", "escalation_hint": "run `pomaster doctor` then open a CHANGE object" },
  "origin": "natural",
  "payload": {
    "status": "closed",
    "motivation": "closeIssue 对 evidence=undefined 抛裸 TypeError（Cannot read properties of undefined），既不拦也不教——违反 ADR-0001『issue 关闭必须携带证据』的决策；本对象即该决策的首个 OPEN issue（无关闭证据段=fixed_count=0 的机器镜像）",
    "affected_objects": ["TEST.ISSUES.CLOSE_FLOW"],
    "class_scan_result": {
      "scope": "tests/issues.test.mjs 全部 closeIssue 用例（同类扫描=evidence 缺失路径全集；修一处必须扫一类）",
      "hits": 0, "fixed_count": 1, "regression_case_ref": "TEST.ISSUES.CLOSE_FLOW"
    },
    "close_evidence": {
      "regression": "TEST.ISSUES.CLOSE_FLOW",
      "grn_refs": ["GRN-0002", "GRN-0003"],
      "note": "failed→passed 成对实跑证据：GRN-0002（红，回归用例先行）→ GRN-0003（修复后绿）；引用经 record 通路入账，subject 均绑定本对象"
    }
  },
  "rev": 3,
  "sources": [{ "type": "human_directive", "ref": "src/issues.js", "captured_by": "human:owner", "pin": { "baseline": "demo-b1" } }],
  "notes_md": "issue 型 CHANGE 对象（OPEN 无证据形态）：lifecycle=PROPOSED + evidence=PLANNED（跨轴断言）、payload.status=open、class_scan_result.fixed_count=0。demo 变更=经事务通道补关闭证据并转 CURRENT+IMPLEMENTED。本叙事为人类散文，机器永不解析判卷。"
}
```

（初始态差异：`axes={PROPOSED, EXPERIMENTAL, PLANNED, STABLE}`、`payload.status="open"`、无 close_evidence、class_scan_result `{hits:1, fixed_count:0}`、rev 1。）

### A.2 主题② pivotal：API_REQ.LOGIN.1（最终态全文，rev 2）

```json
{
  "id": "API_REQ.LOGIN.1",
  "kind": "contract_operation",
  "axis_profile": "contract_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "title_zh": "本地登录，颁发 token",
  "authority": { "owner": "API_CONTRACT_OWNER", "delegates": [], "write_policy": "EVOLUTION_CHANNEL", "escalation_hint": "request/response-need 变更走 CHANGE 对象（EVOLUTION_CHANNEL；openapi 为已发布基线）" },
  "origin": "natural",
  "payload": {
    "operation_id": "demo_api_v1_login_post",
    "method": "POST",
    "path": "/api/v1/login",
    "name_zh": "本地登录，颁发 token",
    "classification": "COMMAND",
    "implementation_form": "real",
    "implementation_form_basis": "code_evidence:src/api-client.js login() 经 transport 调 POST /api/v1/login 并回传 {token, mock:false}（CHANGE.API_LOGIN_REAL 升级）；openapi.yaml 已登记 demo_api_v1_login_post",
    "request_need": { "fields": ["username", "password"], "identifiers": [] },
    "response_need": { "fields": ["token", "mock"] },
    "owner": { "frontend": "src/api-client.js" },
    "trigger": { "automatic": false, "type": "user-action" },
    "type": "command",
    "unresolved": []
  },
  "rev": 2,
  "sources": [
    { "type": "openapi_contract", "ref": "openapi.yaml", "captured_by": "human:owner", "pin": { "version": "0.1.0" } },
    { "type": "human_directive", "ref": "src/api-client.js", "captured_by": "human:owner", "pin": { "baseline": "demo-b1" } }
  ],
  "notes_md": "contract_operation（mock_unverified 形态镜像，源形参考 MASTer MIG-B1 authenticate.1 的 implementation_form 建模）：契约面已接受（CURRENT+LOCKED），接线面为 mock；payload.unresolved 显式登记 openapi 端点缺口。demo 变更=升级 real 且 openapi 增对应端点。本叙事为人类散文，机器永不解析判卷。"
}
```

（初始态差异：`implementation_form="mock_unverified"`、basis 描述 mock 证据与 TODO(backend-ready)、`unresolved=["openapi_endpoint_missing: …"]`、rev 1。）

### A.3 主题③ pivotal ×2（最终态全文）

```json
{
  "id": "CAPABILITY.GRID.EDITABLE_ROWS",
  "kind": "capability",
  "axis_profile": "capability_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "title_zh": "可编辑行表格",
  "authority": { "owner": "DATA_GRID_OWNER", "delegates": [], "write_policy": "AGENT_WITH_PERMIT", "escalation_hint": "canonical 实现更换或 forbidden 规则演进须走 CHANGE 对象（GRID 能力族纪律，源形参考 MASTer MIG-B1 grid.* 收编件）" },
  "origin": "natural",
  "payload": {
    "canonical_realization": { "component": "DataTable", "import": "./src/grid.js" },
    "category": "grid",
    "forbidden": ["direct_dom_table_in_page", "inline_cell_renderer"],
    "domain_states": ["idle", "editing", "validating", "saving", "error"],
    "technology_base": "NODE_BUILTIN"
  },
  "rev": 2,
  "sources": [{ "type": "human_directive", "ref": "src/grid.js", "captured_by": "human:owner", "pin": { "baseline": "demo-b1" } }],
  "notes_md": "CAPABILITY.GRID.* 对象：canonical_realization 初始锚定 InlineRowsEditor；demo 变更=换用已登记组件 DataTable（CHANGE.GRID_IMPL_SWAP；InlineRowsEditor 保留注册留档）。四轴不动 → reconcile 预期 content_drift delta。本叙事为人类散文，机器永不解析判卷。"
}
```

```json
{
  "id": "COMPONENT.DATA_TABLE",
  "kind": "component",
  "axis_profile": "component_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "title_zh": "数据表格组件",
  "authority": { "owner": "DATA_GRID_OWNER", "delegates": [{ "role": "HUMAN_OWNER", "requiredFor": ["retire"] }], "write_policy": "EVOLUTION_CHANNEL", "escalation_hint": "组件退役（retire）需 HUMAN_OWNER 委托审批（源形参考 MASTer component/ag-grid 收编件 delegates 语义）" },
  "origin": "natural",
  "payload": {
    "component_name": "DataTable",
    "import_path": "src/grid.js",
    "direct_usage_in_business_pages": "forbidden",
    "vendor_base": { "package": "in-house", "version": "0.1.0" }
  },
  "rev": 1,
  "sources": [{ "type": "human_directive", "ref": "src/grid.js", "captured_by": "human:owner", "pin": { "baseline": "demo-b2" } }],
  "notes_md": "component 对象（COMPONENT.DATA_TABLE）：经 CHANGE.GRID_IMPL_SWAP 事务通道 materialized——签发时 absent 是合法基线态，reconcile 预期 materialized delta。业务页直连禁用，只能经 CAPABILITY.GRID.* canonical_realization 间接使用。本叙事为人类散文，机器永不解析判卷。"
}
```

### A.4 其余 7 对象（payload 全文 + 与 A.1 同构的信封字段）

| 对象 | rev/axes | payload 关键值（完整 payload 形状同上：status/motivation/affected_objects/class_scan_result[+close_evidence] 或 operation_id 族 或 canonical_realization 族） |
|---|---|---|
| `CHANGE.DEDUPE_OPEN_DUPES` | rev1 / CURRENT·LOCKED·IMPLEMENTED | status=closed；class_scan_result `{scope: "tests/issues.test.mjs 全部 openIssue 用例…", hits:0, fixed_count:1, regression_case_ref:"TEST.ISSUES.DEDUPE"}`；close_evidence `{regression:"TEST.ISSUES.DEDUPE", note:…}` |
| `CHANGE.DOCS_STALE_LINKS` | rev1 / **PROPOSED**·EXPERIMENTAL·PLANNED | status=open；class_scan_result `{scope:"README.md 命令示例块…", hits:0, fixed_count:0, regression_case_ref:"NONE__NOT_REGISTERED_YET"}`——本轮 scope 外诚实留守 |
| `KNOWLEDGE.ADR_ISSUES_EVIDENCE_RULE` | rev1 / CURRENT·LOCKED·IMPLEMENTED | payload.adr `{number:"ADR-0001", status:"accepted", decided_at_seq:1, context:…, decision:"closeIssue 必须携带非空证据；无证据关闭=结构化错误，不是 warning", alternatives_considered:[2 条否决项], consequences:…}`（knowledge_entry，决策以 seq 锚定禁墙钟） |
| `API_REQ.ECHO.1` | rev1 / CURRENT·LOCKED·IMPLEMENTED | operation_id=demo_api_v1_echo_post / POST /api/v1/echo / COMMAND / **real** / request_need.fields=[message] / response_need.fields=[echo] / unresolved=[] |
| `API_REQ.HEALTH.1` | rev1 / CURRENT·LOCKED·IMPLEMENTED | operation_id=demo_api_v1_health_get / GET /api/v1/health / QUERY / **real** / response_need.fields=[status] / unresolved=[] |
| `CAPABILITY.GRID.SUMMARY_TABLE` | rev1 / CURRENT·LOCKED·IMPLEMENTED | canonical_realization=SummaryTable；forbidden=[direct_dom_table_in_page, page_local_grid_css, inline_cell_renderer]（**forbidden 直连规则**）；domain_states=[idle,rendering,error] |
| `COMPONENT.INLINE_EDITOR` | rev1 / CURRENT·LOCKED·IMPLEMENTED | component_name=InlineRowsEditor；import_path=src/grid.js；direct_usage_in_business_pages=**forbidden**；vendor_base={in-house, 0.1.0}；delegates 含 HUMAN_OWNER required_for=[retire] |

### A.5 复现命令序列（骨架）

`init` → 登记 authority → 逐主题：`compact --ops tx-<主题>-predregister.json --no-ingest` → `triage "<请求>"` → `permit issue --subject… --change-ref… --acceptance-shape @…` → `context compile --role implementer` → `exec-guard` ×2 → `check --fast` → `record gate-run` → 真实变更（红测试 → check → record → 修复 + `compact --ops tx-<主题>-change.json` → check → record）→ `reconcile --permit …`。tx JSON 全形状见 A.1–A.4 的信封（camelCase 键：axisProfile/titleZh/writePolicy 等）与 §0.2。

## 附录 B：seq 账目表（generation_seq 0→18 全程；journal 21 行）

| seq | 事务内容 | 命令 |
|---|---|---|
| 0 | init 骨架（空账本） | `init`（×2，第二次 NO_CHANGE） |
| 1 | upsert ×4（3 CHANGE + 1 ADR） | `compact --ops tx-cg-predregister --no-ingest` |
| 1 | PERMIT.CHANGE_CLOSE_WITHOUT_EVIDENCE.1 签发（事件写，不推 seq） | `permit issue` |
| 2 | GRN-0001（passed，ran@1） | `record gate-run` |
| 3 | GRN-0002（**failed**，ran@2） | `record gate-run` |
| 4 | upsert close_evidence + transition 三轴（authorityRef=Permit） | `compact --ops tx-cg-close` |
| 5 | GRN-0003（passed，ran@4） | `record gate-run` |
| 6 | CLM-0001（UNVERIFIED） | `record claim` |
| 7 | upsert ×3（2 real + 1 mock_unverified） | `compact --ops tx-api-predregister --no-ingest` |
| 7 | PERMIT.CHANGE_API_LOGIN_REAL.1 签发 | `permit issue` |
| 8 | GRN-0004（passed，ran@7） | `record gate-run` |
| 9 | GRN-0005（**failed**，ran@8） | `record gate-run` |
| 10 | upsert LOGIN.1 payload real（四轴不动） | `compact --ops tx-api-real` |
| 11 | GRN-0006（passed，ran@10） | `record gate-run` |
| 12 | upsert ×3（2 GRID capability + 1 component） | `compact --ops tx-grid-predregister --no-ingest` |
| 12 | PERMIT.CHANGE_GRID_IMPL_SWAP.1 签发（DATA_TABLE 基线=null） | `permit issue` |
| 13 | GRN-0007（passed，ran@12） | `record gate-run` |
| 14 | GRN-0008（**failed**，ran@13） | `record gate-run` |
| 15 | 双 upsert（DATA_TABLE materialized + EDITABLE_ROWS 换锚，authorityRef=Permit） | `compact --ops tx-grid-swap` |
| 16 | GRN-0009 首录（**harness 误标 passed**，ran@15） | `record gate-run` |
| 17 | GRN-0009 纠偏重录（failed，ran@16；--grn 同号 canonical 化） | `record gate-run --grn GRN-0009` |
| 18 | GRN-0010（passed，ran@17） | `record gate-run` |
| 18 | NO_CHANGE ×3（零写入）+ 全树 diff 空 | `compact` ×4 |
| — | reconcile ×7（CG×3 / API×1 / GRID×1 + 校验性重跑；全部纯读零 seq） | `reconcile --permit …` |

## 附录 C：环境

- node v22.13.1；`@pomaster/cli` 0.0.0（dist 与 src 同步，含 N1 修复后的 kernel reconcile row 级探测）；corepack pnpm 11.20.0 → fixture vitest 2.1.9。
- 仓库测试全绿（本轮收尾全量实测）：`./node_modules/.bin/vitest run` → **Test Files 37 passed (37)，Tests 635 passed | 1 skipped (636)**（skipped = BROWSER 真实 e2e 对 chrome-devtools MCP 的诚实缺席，非通过；demo 期间仓库树曾被并行改动短暂打破一致后恢复，收尾实测以全绿为准）。
- fixture 断言演进：基线 8 → 红后 9/10/11 → 终态 11（3 测试文件全绿）。
- 捕获件（命令 stdout 原文 58 件 + tx/attempt/gate-result/claim 输入件 + 组装器 + 全树快照对照件）存 `%TEMP%\pomaster-theme-demo-captures\`（不入库、不拷回）。

---

*报告生成：④ 出口判据三主题端到端实测演示（DEMO-THEME-0001）；所有 `--json` 原文摘自真实命令 stdout。*
