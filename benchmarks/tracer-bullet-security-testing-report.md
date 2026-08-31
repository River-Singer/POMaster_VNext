# ④ 出口判据——五主题 Tracer Bullet 扩迁（security / testing 二新主题）实测演示报告

> **seq**: DEMO-THEME-0002（A4：无墙钟日期，seq 代号锚定；前序 DEMO-THEME-0001）　**性质**：在 DEMO-THEME-0001 三主题（change governance / API contract / data grid）之上，按 PRD §96 第 11 步 Tracer Bullet 纪律**再扩迁两个代表主题**：security（authz 护栏升级）与 testing（COVERAGE 腿真跑 + 覆盖率底线收紧）。两条真实 change 各走八拍 8/8 全环（全部输出为命令真实 stdout；非 mock、非单测复述）。testing 主题的 COVERAGE 腿是**真跑 c8**（gauntlet-lite coverage adapter 真实 detect/prepare/run/normalize），不是 NOT_RUN 诚实占位的复述——not_run 形态本身也以一条真实 GRN（GRN-0005）如实入账。
> **CLI**：`packages/cli/dist/bin.js`（`@pomaster/cli` 0.0.0；dist 与 src 同步）；node v22.13.1
> **调用方式**：`node <仓库绝对路径>/packages/cli/dist/bin.js --dir <项目根> <command> [--json]`
> **靶子**：系统临时目录自建 fixture `%TEMP%\pomaster-tracer2\`（`pomaster init` 起步的 `tracer-guard-console` 0.1.0 独立项目；**临时目录不拷回**——对象 JSON 完整形状见附录 A 即可复现）。素材只读取材 MASTer 语料的已纳管形态（`corpus/master/batch-1/truth/objects/`；本轮对象族为 capability / knowledge_entry / change_object，payload 为 fixture 域自设计，authority 块源形参考 batch-1 `capability/grid.editable-grid.json`；语料批内无 security/testing 同族已纳管件，**不冒充语料出处**）。
>
> **纪律声明**：
> - 未执行任何 git 操作；FROZEN 资产（`packages/schemas/assets/*`、两处 `vocab.ts`、`tests/golden/cases.json`）零触碰；`MASTer_master` 绝对只读（本轮零写入）；外层 `D:/Vscode Documents/po-master/.trellis/spec/` 绝对只读（§8 探针的迁移面只读复跑）；本文件是本次演示在仓库内的唯一新增落盘产物（P30 交付物代码/测试由任务主线交付，见 §5.6）；
> - 全部输出捕获件（45 件命令 stdout + 组装器/coverage 腿 runner 脚本 + tx/attempt/gate-result/claim/dod 输入件）存于 `%TEMP%\pomaster-tracer2-captures\`（不入库；报告内 sha 以捕获件为对账锚，清单见附录 C）；
> - 本机 PATH 含游离引号（phaseC 附录 A 的 G7），每条 shell 调用前以 `PATH="$(printf '%s' "$PATH" | tr -d '"')"` 消毒——**产品代码零改动**（§8 变异探针的改动已按探针协议还原并复绿验证）；
> - 演示结束后两临时目录（fixture + captures）按「即建即删」纪律清除；本报告留存全部对账锚。

---

## 0. 预置事实

### 0.1 fixture 布局（二主题一店，同一 store）

```text
pomaster-tracer2/
├── package.json               # tracer-guard-console 0.1.0；scripts.test=vitest run；
│                              # devDeps: vitest 2.1.9 + c8 10.1.3；c8.include=src/**
│                              # （pnpm add 落 declared，BUILD/COVERAGE 双 detect 依赖声明在场）
├── .npmrc / pnpm-workspace.yaml   # 环境预处理（同 0001 §0.3 三项），fixture 侧自包含，产品零改动
├── coverage-gate.json         # COVERAGE 腿事实源：{"runner":"c8","command":"corepack pnpm exec node --test tests/authz.test.mjs tests/report.test.mjs","thresholds":{"lines":80,"branches":70}}（初始 80/70；主题⑤事务内收紧为 85/80）
├── src/
│   ├── authz.js               # 主题④被测代码：issueToken（HMAC 签发）/ checkPermission（初始 allow-by-default + 密钥缺席静默回退）
│   └── report.js              # 主题⑤被测代码：discountTier（初始 > 1000 边界缺陷）/ formatRate / refundEligible / shippingFee
└── tests/
    ├── testkit.mjs            # 双跑器兼容层（BUILD=vitest / COVERAGE=node --test；§7-H1 披露）
    ├── authz.test.mjs         # 基线 4 → 主题④后 6 断言
    └── report.test.mjs        # 基线 6 → 主题⑤后 13 断言
```

### 0.2 治理对象分母（6 对象；kind/payload 形状只读取材 MASTer 收编件，security/testing 族 payload 为域内自设计）

| 主题 | 对象（id / kind / 初始四轴） | 主题变更靶 |
|---|---|---|
| ④ security | `CAPABILITY.SEC.TOKEN_ISSUANCE`（capability；payload.unresolved 显式登记「密钥缺席回退签发」缺口） | ★本轮变更对象（rev 1→2） |
| | `CAPABILITY.SEC.PERMISSION_CHECK`（capability；payload 登记初始 allow-by-default 语义） | ★同事务语义翻转（实现翻转，对象 payload 随 ④ 升级批注） |
| | `KNOWLEDGE.ADR_DENY_BY_DEFAULT`（knowledge_entry；ADR-0002 deny-by-default 决策记录） | |
| ⑤ testing | `CAPABILITY.TEST.COVERAGE_FLOOR`（capability；payload.thresholds={lines:80,branches:70}，payload.unresolved 登记「COVERAGE 腿未真跑」缺口） | ★本轮变更对象（rev 1→2：阈值 85/80 + unresolved 清空） |
| | `CAPABILITY.TEST.FLAKY_DISCIPLINE`（capability；flaky 纪律，本轮 scope 外诚实留守） | |
| | `CHANGE.COVERAGE_GATE_TIGHTEN`（change_object，PROPOSED/EXPERIMENTAL/PLANNED；R4 class_scan_result 必填已给全） | 主题⑤治理记录载体 |

两组对象各一次 `compact --ops <tx> --no-ingest` 预登记（mid-episode 显式关闭兜底收编，phaseD N2 / 0001 教训沿用）；单 store，seq 账本两主题共享（附录 B）。

### 0.3 环境预处理（沿用 0001 §0.3 三项 + 本轮新增一项，全部 fixture/会话侧，产品代码零改动）

1. **vitest + c8 安装**：`corepack pnpm add -D vitest@2.1.9 c8@10.1.3`（tool_version 口径可判卷）。
2. **pnpm verify-deps 陷阱**：`.npmrc` 关 `verify-deps-before-run` + workspace `allowBuilds: esbuild`（0001 同款）。
3. **corepack keyid 过旧**：不钉 `packageManager`，用 corepack 自带 pnpm；`%TEMP%\pomaster-bin` shim 目录前置 PATH（0001 同款）。
4. **（新增）vite-node evalmachine V8 覆盖盲区**：vitest 2.x 经 vite-node 以 `evalmachine/[eval]` 匿名脚本求值 `src/**`，c8 的 V8 覆盖 JSON 无法映射回真实文件——实测 coverage-summary `total=0/0`，COVERAGE 腿按此判卷必得假 not_run/假零分母。处置：fixture 自建 `tests/testkit.mjs` 双跑器兼容层（`process.env.VITEST` 分流：BUILD 腿走 vitest，COVERAGE 腿走 `node --test` 原生 import——真实文件 URL 可被 V8 映射）。**两跑器执行同一批测试体**，口径都是真实执行；披露与动机见 §7-H1。

### 0.4 BOOTSTRAP 与基线

- `init` ×2：CREATED → **NO_CHANGE**（零写入幂等，A4；捕获件 002/003）。
- `state/authority.json` BOOTSTRAP 人工登记 2 个 owner：`SEC_GUARDRAIL_OWNER` / `TEST_FLOOR_OWNER`（0001 N3 沿用）。
- fixture 测试基线：**2 文件 10 断言全绿**（主题④后 12、主题⑤后 19，演进全程见 §1）。
- 仓库测试（本轮实测前全量）：全量 vitest **2332 passed + 11 skipped = 2343 total / 0 failed**（与 floor.json minTests=2343 同值为 total 口径；§5.6）。〔勘正：初稿「2343 passed」系 total 口径误作 passed 口径，审计 NOTE 抓出〕

---

## 1. 执行序列与退出码（45 件捕获件，编号即执行序）

```text
000 pnpm add -D vitest c8                              exit 0
001 vitest run 基线（2 文件 10 断言）                    exit 0
002/003 pomaster init ×2（CREATED → NO_CHANGE）          0 / 0
004 tx-sec-predregister（3 对象预登记，--no-ingest）       0
   ── 主题④ security：CHANGE.SEC_GUARDRAIL_UPGRADE ──
005 triage（→ LIGHT / DEFAULT_NO_SIGNAL / NOT_CONFIGURED 诚实缺省）   0
006 permit issue（PERMIT.CHANGE_SEC_GUARDRAIL_UPGRADE.1，issued_at_seq=1，ttl 168 拍） 0
007 context（role=implementer，inputs_fingerprint=sha256:acc56a84…，catalog advisory 条目在场）0
008 exec-guard in-scope（TOKEN_ISSUANCE ↑ upsert_object）→ allowed                    0
009 exec-guard 跨主题探针（CAPABILITY.TEST.COVERAGE_FLOOR）→ denied/outside_scope      1
010 check --fast 基线（BUILD passed，10/10/0/0）                       0
011 record gate-run → GRN-0001（passed，applied_seq=2）                0
012 落 2 条失败回归测试 → check --fast（BUILD failed，12/12/2/0，GATE_FAILED）          1
013 record gate-run → GRN-0002（failed，applied_seq=3；主题④ exceptions 真实证据）      0
014 tx-sec-upgrade（TOKEN_ISSUANCE rev 1→2：SEC_SIGNING_SECRET_REQUIRED + deny-by-default
    + forbidden 补 fallback_signing_secret 明文禁令 + unresolved 清空；authorityRef=permit）0
015 check --fast（BUILD passed，12/12/0/0）                            0
016 record gate-run → GRN-0003（passed，applied_seq=5）                0
017 record claim → CLM-0001（UNVERIFIED 起步，先立后证，C5）             0
018 reconcile #1 → RECONCILE_DIRTY（content_drift 命中主题对象 + exceptions 抓 GRN-0002）1
019 reconcile #2（正文手改篡改探针）→ RECONCILE_DIRTY + **content_tamper 异常入列**      1
020 reconcile #3（恢复后重放）→ RECONCILE_DIRTY，结果与 #1 **零字段差异**（§4.2）        1
   ── 主题⑤ testing：CHANGE.COVERAGE_FLOOR_TIGHTEN（Permit 词形）/ CHANGE.COVERAGE_GATE_TIGHTEN（对象词形，见 §7-H5）──
021 tx-test-predregister（3 对象预登记）                                0
022 triage（→ LIGHT / DEFAULT_NO_SIGNAL）                              0
023 permit issue（PERMIT.CHANGE_COVERAGE_FLOOR_TIGHTEN.1，issued_at_seq=7；DoD 预登记 COVERAGE 真跑）0
024 context（同款四件套）                                               0
025 exec-guard in-scope（COVERAGE_FLOOR ↑ upsert_object）→ allowed      0
026 exec-guard 跨主题探针（CAPABILITY.SEC.TOKEN_ISSUANCE）→ denied       1
027 check --fast 基线（BUILD passed，12/12/0/0）                        0
028 record gate-run → GRN-0004（passed，applied_seq=8）                 0
029 COVERAGE 腿首跑：命令词形错误（`node --test tests/` 目录式）→ not_run
    → record gate-run → GRN-0005（**not_run 如实入账**，applied_seq=9；不静默重试抹掉） 0
030 COVERAGE 腿真跑（c8，修正命令词形）→ **failed：行口径 76.47% < 80**
    → record gate-run → GRN-0006（failed，gate=COVERAGE，applied_seq=10）              0
031 补 7 断言（含满 1000 边界）→ check --fast（BUILD failed，19/19/1/0，边界缺陷）       1
032 record gate-run → GRN-0007（failed，gate=BUILD，applied_seq=11）                   0
033 tx-test-floor-close（COVERAGE_FLOOR rev 1→2：thresholds 80/70→85/80 + unresolved 清空
    + floor_basis 注记「猜测分支口径、实跑行口径」）                                    0
034 修 `>` → `>=` → check --fast（BUILD passed，19/19/0/0）             0
035 record gate-run → GRN-0008（passed，applied_seq=13）                0
036 COVERAGE 腿复跑（c8）→ **passed：行 100.00%（≥85）/ 分支 100.00%（≥80）**
    → record gate-run → GRN-0009（passed，gate=COVERAGE，applied_seq=14）              0
037 reconcile（主题⑤）→ RECONCILE_DIRTY（content_drift 命中 + exceptions 抓 GRN-0006/0007）1
038 compact ×4 → 全部 NO_CHANGE（9 runs + 1 claim 全 already_canonical）                0×4
039 catalog 树 sha 前后对照（两行全同 31bc0364…，compact 零写入实证）                    0
040/041 status ×2 → 6 对象分母，两次输出字节全同（§4.3）                                0 / 0
042 permit list → 双 Permit active（beats_remaining 155 / 161）                        0
043 view narrative（scope=CAPABILITY.，4 稳定核对象；exception-ledger 缺席=opt-in 诚实注记）0
044 migrate trellis-spec --analyze --spec-root <外层 .trellis/spec>（只读复跑，交叉验证 P30a 分母）0
```

退出码口径（§45 双信封）：**非 passed 一律 ok=false exit 1**（红 check / denied 探针 / RECONCILE_DIRTY 全部显式非零）；`record` 类入账命令「成功记录一次 failed/not_run 判决」本身是 ok=true exit 0（判决与入账分离，判决不因红而被吞）。

---

## 2. 八拍对照表（2 新主题 × 8 拍全实跑）

| 拍 | 名称 | 主题④ security 载体与结果 | 主题⑤ testing 载体与结果 | 证据锚 |
|---|---|---|---|---|
| ① | TRIAGE | `triage` → **LIGHT**（DEFAULT_NO_SIGNAL；8 项 absent_signals 逐一显式，NOT_CONFIGURED 诚实缺省） | 同款 **LIGHT**（本主题无契约关键词，与 0001 主题② 的 STANDARD 升档恰成分母多样性） | 005/022 |
| ② | FRAMEWORK LOCK | `permit issue` → **PERMIT.CHANGE_SEC_GUARDRAIL_UPGRADE.1**（DoD 三条：结构化错误词形 / deny-by-default / forbidden 补禁令；issued@1，ttl 168 拍） | **PERMIT.CHANGE_COVERAGE_FLOOR_TIGHTEN.1**（DoD 三条：COVERAGE 真跑阈值 / 满 1000 边界 / thresholds 收紧；issued@7） | 006/023 |
| ③ | PROJECTION | `context` → role=implementer，inputs_fingerprint 固定 sha，catalog advisory 条目在场（无 must 强制——LIGHT profile 诚实呈现） | 同款 | 007/024 |
| ④ | EXECUTE | `exec-guard` in-scope **allowed**；跨主题探针（⑤的 COVERAGE_FLOOR）→ **denied/outside_scope**（PERMIT_SCOPE_DENIED，hint 给扩权路标） | allowed；跨主题探针（④的 TOKEN_ISSUANCE）→ denied——**二主题互为越权探针闭环**（与 0001 三主题互探同构） | 008/009/025/026 |
| ⑤ | VERIFY | BUILD 腿：baseline 绿（GRN-0001）→ 红 12/12/2/0（**GRN-0002 failed**）→ 修复 → 绿（GRN-0003）；claim 先立后证（CLM-0001 UNVERIFIED） | BUILD 腿红绿成对（GRN-0007 红 / GRN-0008 绿）+ **COVERAGE 腿真跑三态全演**：not_run（GRN-0005，命令词形错误如实入账）→ **failed**（GRN-0006，行 76.47%<80）→ **passed**（GRN-0009，行/分支 100%≥85/80） | 010–017 / 027–036 |
| ⑥ | RECONCILE | `reconcile --permit …` ×3 → **RECONCILE_DIRTY exit 1**：content_drift 命中主题对象（rev 1→2，`drift_origin:"transaction"`）+ exceptions 抓 GRN-0002 + **content_tamper 篡改探针被抓**（index/body 双 sha）+ 恢复重放 ≡ 首跑 | reconcile → RECONCILE_DIRTY：content_drift 命中 COVERAGE_FLOOR（rev 1→2，drift_origin=transaction）+ exceptions 抓 GRN-0006（COVERAGE）+ GRN-0007（BUILD）双门真实 failed | 018–020 / 037 |
| ⑦ | COMPACT | （两主题共享收尾）`compact` ×4 → 全 **NO_CHANGE**（short_circuited=true 语义：9 runs + 1 claim 全 already_canonical、零 op 重放）；树 sha 前后全同 **31bc0364…**（零写入实证） | 同左 | 038/039 |
| ⑧ | STATUS | `status` ×2 字节全同（6 对象分母 / by_kind / by_lifecycle PROPOSED 1 + CURRENT 5）；`permit list` 双 Permit active（beats_remaining **155/161**）；`view narrative` 4 稳定核对象 + exception-ledger 缺席 opt-in 诚实注记 | 同左 + `migrate --analyze` 只读交叉验证（§4.4） | 040–044 |

---

## 3. 各主题实测详情

### 3.1 主题④ security —— authz 护栏升级（签名密钥 + deny-by-default）

**请求**：「TOKEN_SIGNING_SECRET 缺席时 issueToken 必须结构化拒绝签发（不回退不告警放行）；checkPermission 翻转 deny-by-default：未显式授予即拒绝」→ triage LIGHT（DEFAULT_NO_SIGNAL——本主题无关键词升档面，分母诚实）。

**⑤ VERIFY 三步红绿**：
1. 基线 `check --fast` **passed（10/10/0/0）**→ `record gate-run` → **GRN-0001（passed，ran_at_seq=1，applied_seq=2）**；
2. 落 2 条失败回归测试（`/TOKEN_SIGNING_SECRET/` 词形断言 + deny-by-default 断言）→ `check --fast` **failed（12/12/2/0，exit 1，GATE_FAILED）**→ 组装归一结果（counts 逐字）→ `record gate-run` → **GRN-0002（failed，applied_seq=3）**——主题④ exceptions 的真实证据；
3. 修复 `src/authz.js`（`SEC_SIGNING_SECRET_REQUIRED` 结构化错误 + `granted` 数组 deny-by-default）+ `compact --ops tx-sec-upgrade`（TOKEN_ISSUANCE rev 1→2：payload.forbidden 补 `fallback_signing_secret` 明文禁令、unresolved 清空、authorityRef=permit）→ `check --fast` **passed（12/12/0/0）**→ **GRN-0003（passed，applied_seq=5）**。
4. `record claim` → **CLM-0001**：断言「实现已落地、安全复审（VERIFIED）待权威位确认，先立后证」——**C5 自报恒 UNVERIFIED 起步**（0001 CLM-0001 同款），evidence_refs=[GRN-0002, GRN-0003]。

**⑥ RECONCILE 三连（篡改探针嵌入）**：
- **#1（018）**：`RECONCILE_DIRTY exit 1`。`changed_objects` 命中主题对象：`{id: CAPABILITY.SEC.TOKEN_ISSUANCE, kind: content_drift, content_drift: true, rev: {from:1, to:2}, drift_origin: "transaction"}`——**rev 推进 + journal TX_APPLIED 在场 = 合法事务变更的人审证据**；`drift_origin:"transaction"` 字段使 0001 §7-N7 的「kind 词形不分合法/越权来源」语义张力**机器可见化**（升级批注：合法来源已被显式标注，张力收窄为「该字段可被伪造的事务自证」——处置归后续批次）。`exceptions` 抓到主题真实 failed 证据：`{evidence_ref: GRN-0002, plane: runs, verdict: failed, subject_id: CAPABILITY.SEC.TOKEN_ISSUANCE, gate: BUILD}`。`verdict_census` 全量计数（当时 runs failed:1 / passed:2 + claims UNVERIFIED:1）吞不掉任何 scope 外条目。
- **#2（019，篡改探针）**：绕开命令通道手改对象正文后 reconcile → **额外异常入列**：`{kind: "content_tamper", subject_id: CAPABILITY.SEC.TOKEN_ISSUANCE, body_ref: "truth/objects/capability/capability.sec.token-issuance.json", index_sha256: "sha256:00c24c6b…", body_sha256: "sha256:5549dfce…"}`——正文手改与事务变更被区分取证（content_tamper vs content_drift+drift_origin），`RECONCILE_DIRTY` 同样 fail-closed。
- **#3（020，恢复重放）**：正文恢复后 reconcile → 输出与 #1 **零字段差异**（程序化逐字段对比；捕获件 sha 锚 `04cbc2f4…`）。纯读重放的字节稳定性在此三连中闭环。

### 3.2 主题⑤ testing —— COVERAGE 腿真跑 + 覆盖率底线收紧

**请求**：「COVERAGE 腿必须真跑 c8（不是 NOT_CONFIGURED 占位）；用真跑结果收紧覆盖率底线并把缺口清账」→ triage LIGHT；permit DoD **预登记**「COVERAGE 腿真跑（c8）分支覆盖 ≥ 80 且行覆盖 ≥ 85（收紧后阈值）」。

**⑤ VERIFY（BUILD + COVERAGE 双腿，COVERAGE 三态全演）**：
1. BUILD 基线 **passed（12/12/0/0）**→ **GRN-0004（passed，applied_seq=8）**。
2. COVERAGE 腿首跑：coverage adapter 经 gauntlet-lite 真实 `detect → prepare → run → normalize`（`run-coverage-leg.mjs` 经 `pathToFileURL` 动态 import dist）。首跑命令词形写成 `node --test tests/`（目录式）→ spawn 产物不可判卷 → **not_run** → `record gate-run` → **GRN-0005（not_run，gate=COVERAGE，applied_seq=9）**——**四态纪律：缺席必须显式表达，not_run 不静默重试抹掉**（0001「通道内纠偏重录」的诚实版：本条不纠偏，保留原样入账）。
3. 修正命令词形为 `node --test tests/authz.test.mjs tests/report.test.mjs` → c8 真跑 → **failed**：`counts={scanned:2, applicableScanned:2, violations:1}`，item=`{rule: "coverage_below_threshold", location: "coverage/coverage-summary.json", message: "行口径 76.47% < 阈值 80%"}`；scope 注记双口径（行 76.47%<80 / 分支 75.00%≥70）+ 「runner=c8 exit=0 是被包裹测试命令语义，非本 gate 判卷锚——测试失败归 BUILD gate」→ **GRN-0006（failed，gate=COVERAGE，applied_seq=10）**。**真实缺口被真跑抓到**：`discountTier` 满 1000 边界（`>` 应为 `>=`）及其余未覆盖分支行。
4. 补 7 断言（含满 1000 边界回归 + vip/member/防御分支全集）→ BUILD **failed（19/19/1/0）**——边界缺陷在 BUILD 腿同步现形 → **GRN-0007（failed，gate=BUILD，applied_seq=11）**。
5. `compact --ops tx-test-floor-close`（COVERAGE_FLOOR rev 1→2：`thresholds` 80/70→**85/80**、`unresolved` 清空、`floor_basis` 注记明确记录「**预登记缺口镜像猜测分支口径失守、真跑实测行口径失守——治理记录不冒充判卷输入（C5），以机器重算为准**」）→ 修 `>` → `>=` → BUILD **passed（19/19/0/0）**→ **GRN-0008（passed，applied_seq=13）**。
6. COVERAGE 复跑 → **passed**：行 **100.00%**（≥85）/ 分支 **100.00%**（≥80），counts 违规 0 → **GRN-0009（passed，gate=COVERAGE，applied_seq=14）**。fixture 侧 `coverage-gate.json` 与治理对象 thresholds 同批收紧——**可执行镜像与治理记录一致性**由同事务保证。

**⑥ RECONCILE（037，捕获件 sha 锚 `d1f0511d…`）**：`RECONCILE_DIRTY exit 1`。`changed_objects` 命中 COVERAGE_FLOOR（content_drift，rev 1→2，drift_origin=transaction；FLAKY_DISCIPLINE scope 外诚实留守不在列）；`exceptions` 抓到**双门真实 failed**：GRN-0006（gate=COVERAGE）+ GRN-0007（gate=BUILD）；`verdict_census` 全量呈现 9 runs（passed:5 / failed:3 / not_run:1）+ claims UNVERIFIED:1——**not_run 在 census 中显式在场，全局可见性吞不掉任何形态**（与 0001「census 全量计数」行为一致）。

### 3.3 收尾四拍（两主题共享）

- **⑦ COMPACT ×4**：全部 `NO_CHANGE`（`applied_seq=14`；`ingested.runs` 9 条全 `already_canonical` + `ran_at_seq_ahead:false`、claims CLM-0001 `already_canonical`、malformed:[]）。catalog 树 sha 前后对照两行全同：`31bc036422f02977b6c020186decf710f90586cf793b9b9cb59c211aaa82895c`（捕获件 039 原文两行）——**compact 零写入实证**。
- **⑧ STATUS ×2**：两次输出字节全同（捕获件 040 sha 锚 `ce26ed02…`）：6 对象、by_kind={capability:4, knowledge_entry:1, change_object:1}、by_lifecycle={PROPOSED:1, CURRENT:5}（唯一 PROPOSED 即 `CHANGE.COVERAGE_GATE_TIGHTEN`，生命周期演进留待人审，demo 不越权替主人翻 CURRENT）、producers dead:[]、worst_blindspot:null。
- `permit list`：双 Permit **active**，`beats_remaining` **155 / 161**（ttl 168 − 已耗拍数，逐 Permit 独立核算），`stolen` 双 null。
- `view narrative`（scope=CAPABILITY.）：4 稳定核对象；**exception-ledger 缺席（opt-in 登记面）以显式注记呈现，不伪装成「无异常」**（§49.1/§91 诚实缺省词形）。
- `migrate trellis-spec --analyze`（044，只读）：对外层真实 spec 目录复跑，分母与 P30a 实测完全一致（§4.4）。

---

## 4. 关键判定汇总

### 4.1 reconcile delta 命中主题对象 + exceptions 抓到主题真实 failed 证据

| 主题 | 真实变更（命令通道） | reconcile `changed_objects` 命中 | reconcile `exceptions` 命中（真实 failed/not_run） |
|---|---|---|---|
| ④ security | `compact --ops tx-sec-upgrade`（TOKEN_ISSUANCE rev 1→2） | `{TOKEN_ISSUANCE, content_drift, rev 1→2, drift_origin:"transaction"}` | GRN-0002（BUILD failed）；+ 篡改探针 `content_tamper`（index/body 双 sha） |
| ⑤ testing | `compact --ops tx-test-floor-close`（COVERAGE_FLOOR rev 1→2） | `{COVERAGE_FLOOR, content_drift, rev 1→2, drift_origin:"transaction"}`（FLAKY_DISCIPLINE 不在列——scope 外不误报） | GRN-0006（**COVERAGE failed**）+ GRN-0007（BUILD failed）——**COVERAGE 腿的失败证据首次被 reconcile exceptions 捕获** |

五主题合计 delta kind 覆盖：axes_change / content_drift / materialized（0001）+ content_drift×2 与 content_tamper 异常形态（本轮）；vanished 仍属异常形态不制造（与 0001 同口径）。

### 4.2 纯读重放字节稳定（三重实证）

1. reconcile #1 ≡ #3（恢复后重放）：程序化逐字段对比零差异（捕获件 sha `04cbc2f4…`）；
2. status ×2 字节全同（`ce26ed02…`）；
3. compact ×4 NO_CHANGE + 树 sha 两行全同 `31bc0364…`。

### 4.3 跨主题越权探针闭环

二主题互为探针且双向 denied（009：④探⑤对象；026：⑤探④对象）——`PERMIT_SCOPE_DENIED` + outside_scope + hint 扩权路标（回 FRAMEWORK LOCK 重审，不旁路扩权）。0001 三主题互探 + 本轮二主题互探 = **五主题 Permit 体系无一例静默放行**。

### 4.4 migrate analyze 只读交叉验证（P30 命令面 × Analyzer 内核）

对外层真实 `D:/Vscode Documents/po-master/.trellis/spec` 只读复跑（捕获件 044，631 KB 完整 SpecAnalysisReport）：

- 分母：`files=77 sections=683 candidates=414 classified=413 pending_review=1`（与 P30a 内核实测逐字一致）；
- 名称退场清单（§92.6）：`nameExitList=7` 条（DEPRECATED/DUPLICATE/REJECTED——只进呈现清单）；
- 分类分布：UNIVERSAL_POLICY 235 / GATE_RECIPE 46 / CONTRACT_TEMPLATE 44 / KNOWLEDGE_PATTERN 35 / FAILURE_PATTERN 33 / LANE_POLICY 13 / DEPRECATED 4 / REJECTED 2 / DUPLICATE 1 / PENDING_REVIEW 1；
- **零写入**：analyze-only 封条（本命令在只读复跑前后对 catalog/ 与项目 state/ 均无通路；机器钉见 §8 与 `tests/integration/migrate-tracer-bullet-golden.spec.ts`）。

### 4.5 五主题关键判定对照（三旧 + 二新）

| 判定维度 | ① change governance | ② API contract | ③ data grid | ④ security（新） | ⑤ testing（新） |
|---|---|---|---|---|---|
| triage profile | LIGHT | **STANDARD**（E_CONTRACT_KEYWORD） | LIGHT | LIGHT | LIGHT |
| 八拍完成度 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 |
| VERIFY 门与红绿 | BUILD 红→绿（GRN-0002/0003） | BUILD 红→绿 | BUILD 红→绿（含一次纠偏重录） | BUILD 红→绿（GRN-0002/0003） | BUILD 红→绿 + **COVERAGE not_run→failed→passed 三态全演**（GRN-0005/0006/0009） |
| reconcile delta kind | axes_change（rev 1→3） | content_drift（rev 1→2） | content_drift + **materialized** | content_drift（rev 1→2）+ **content_tamper 探针** | content_drift（rev 1→2） |
| exceptions 真实证据 | GRN-0002（BUILD） | GRN（BUILD failed） | GRN-0008/0009 双 failed 如实呈现 | GRN-0002（BUILD） | GRN-0006（**COVERAGE**）+ GRN-0007（BUILD） |
| 生命周期门槛实测 | **PROPOSED→CURRENT 需 authority_approval**（缺 authorityRef 即 EVOLUTION_REQUIRED 拦截一次） | payload 升级（axes 不动） | 换锚 + 组件 materialized | payload 升级 + 先立后证 claim（C5 UNVERIFIED） | 阈值收紧事务（治理记录 ↔ coverage-gate.json 同批） |
| 跨主题越权探针 | denied ×2 | denied ×2 | denied ×2 | denied（⑤对象） | denied（④对象） |
| 新增诚实形态 | NOT_CONFIGURED 分母 | INFERRED 证据级如实 | absent→present 双 kind | **content_tamper / content_drift 分流取证** | **not_run 如实入账不抹掉**；**COVERAGE 真跑判卷** |

---

## 5. 纪律专项核对

1. **零 git 操作**：全程无 commit/push/add；`git status` 残留核查见 §8 探针收尾。
2. **FROZEN 零触碰**：schemas assets / vocab.ts / golden cases 未被任何命令写通路触及（分析型命令纯读；写型命令只落 fixture 临时目录）。
3. **MASTer / 外层 spec 只读**：本轮对 `corpus/` 仅读取材（capability/knowledge_entry/change_object 三族形态），对外层 `.trellis/spec` 仅 044 只读分析，零写入。
4. **临时目录不拷回**：对象 JSON 完整形状附录 A 自足可复现；捕获件不入库、报告内 sha 对账。
5. **棘轮与全绿**：本轮演示零改产品代码（探针已还原，§8）；仓库全量 2343 total tests（2332 passed + 11 skipped）/ 0 failed 与 floor 同值（§5.6）。
6. **P30 交付物衔接**（任务主线，非本演示改动）：`migrate.ts` 命令面 + `migrate.spec.ts`（13 tests）+ `migrate-tracer-bullet-golden.spec.ts`（7 tests，含 catalog 字节快照钉）+ floor.json 映射同步（minTests 2280→2343）+ README 快速上手行——全部由全量 vitest / ratchet / build-all 门禁覆盖，见 §8 与任务收尾验证。
7. **词形纪律**：全部判定注记 PRD 锚（§45 双信封 / §49.1 / §91 / §92.6 / §93.6 / §96 第 8 与 11 步 / C5）；十二分类词形复用 vocab 词表（044 分类分布即词表序呈现）；本轮**零新造词形**（`drift_origin:"transaction"`、`content_tamper`、`not_run` 均为既有机器词形）。

---

## 6. 共性结论

1. **八拍环对异质主题的适配成本趋零**：0001 三主题（治理/契约/网格）+ 本轮二主题（安全/测试）= 五主题共用同一套命令词形与同一套 fail-closed 退出语义；主题差异只体现在 DoD 文案、对象 payload 与被测代码，环本身零分叉。
2. **门禁矩阵的腿是可插拔的，纪律不是**：本轮把 gate 从单 BUILD 扩到 BUILD+COVERAGE 双门，reconcile exceptions 与 verdict_census 对新门零改动即纳入（GRN-0006 的 COVERAGE failed 与 GRN-0002 的 BUILD failed 在 exceptions 平面同权呈现）。
3. **诚实形态在五主题中已形成闭集**：NOT_CONFIGURED（triage 分母）/ INFERRED（证据级）/ absent→null（对象缺席）/ not_run（腿缺席或不可判卷）/ UNVERIFIED（自报起步）/ RECONCILE_DIRTY（漂移显式出口）/ exception-ledger 缺席注记（opt-in 面）——**七种「不知道/未做到」全部显式成词，无一例静默吞掉或伪装成绿**。
4. **Tracer Bullet 的证伪力得到二次验证**：0001 抓出 skipped_blindspot 假绿通道、本轮抓出 vite-node V8 覆盖盲区（§7-H1）与 permit/change-object 词形一致性缝隙（§7-H5）——两条真缺陷都是「真实全链路」跑出来的，单测复述抓不到。

---

## 7. 缺口与诚实段

- **H1（fixture 侧处置，已披露）vite-node evalmachine V8 覆盖盲区**：vitest 2.x 下 `src/**` 经 vite-node 以匿名脚本求值，c8 的 V8 覆盖 JSON 只含 `evalmachine` URL、coverage-summary `total=0/0`（实测 2026-08-31）。处置为 fixture 侧双跑器 testkit（BUILD=vitest / COVERAGE=node --test，同批测试体），**产品代码零改动**。这是「COVERAGE 腿可真跑」的 fixture 前提；对无此兼容层的真实项目，coverage adapter 的 not_run 判卷路径是四态兜底（不假绿）。候选后续：gauntlet-lite 内建双跑器探测或 vitest `coverage.experimentalAstAwareRemapping` 适配。
- **H2（过程披露）COVERAGE 首跑命令词形错误**：`node --test tests/` 目录式不可解析 → not_run → **如实入账 GRN-0005 后再修正重跑**（不是悄悄换命令）。GRN-0005 永久留在账本（census not_run:1 可见）。
- **H3（C5 校准披露）预登记口径猜测与实测 divergence**：permit DoD 预登记「分支覆盖 ≥ 80」，真跑实测violated 的是**行口径**（76.47% < 80，分支 75% 当时尚达标）。处置遵守 C5：治理记录（floor_basis 注记）明确写「猜测分支口径失守、真跑行口径失守」，**不回头改写预登记 DoD 文案冒充先知**；阈值收紧以机器重算结果为锚。附带观察：c8 json-summary 的分支计数为 V8 块口径（shippingFee 的 if/三元组合与源码阅读直觉有出入），本轮以 c8 为唯一判卷锚、不另立口径。
- **H4（探针边界发现，已并入 §8）字节稳定重写对字节快照不可见**：变异探针 v1（确定性同字节重写 catalog 文件）**没有**使 golden 变红——字节快照钉的是「零新增字节」，幂等重写不在其判卷面内。这不是 golden 失效（其钉的是 analyze-only 零写入通路），而是**快照语义边界**：byte-stable rewrite 需要 mtime/内容双锚或 syscall 层探针才能覆盖，登记为 golden 体系的已知判卷面边界（探针 v2 以 append 型变异验证红通路，见 §8）。
- **H5（本轮新缺口 TB2-G1）permit.change_ref ↔ change_object id 无一致性校验**：主题⑤执行中 Permit 以词形 `CHANGE.COVERAGE_FLOOR_TIGHTEN` 签发，而预登记的 change_object id 为 `CHANGE.COVERAGE_GATE_TIGHTEN`——一词之差**全环无一处拦截**（permit issuance 不验证 change_ref 是否对应 catalog 中已登记 change_object；reconcile 亦不报）。八拍环的 permit 平面与对象平面之间存在 id 一致性缝隙；五主题 tracer bullet 的证伪价值再次兑现。**建议后续批次**：permit issuance 时对 catalog change_object 存在性做 fail-closed 校验（或至少 advisory 呈现）。本报告如实保留 demo 账本原样（不回头改名），两词形均在捕获件与 store 中可对账。
- **H6（环境重放披露）演示后裸 PATH 复跑 `check --fast` → BUILD not_run exit 1**：脱离演示会话的 PATH 预处理（pnpm shim 前置）后，BUILD adapter spawn 不可判卷 → not_run（非绿非红）→ fail-closed exit 1。四态纪律在演示外的环境复现中再次自证（不因环境缺件而假绿）。
- **H7（口径披露）reconcile verdict_census 为 store 全量平面计数**：主题⑤ census 显示 9 runs 全量（passed:5/failed:3/not_run:1）而非 permit scope 内 6 条——exceptions 按 subject 过滤、census 全局可见，二者分工与 0001 行为一致（「census 全量计数吞不掉任何 scope 外条目」），非缺陷；登记为口径注记防误读。
- **H8**：本轮对象 payload 为 fixture 域自设计（语料批无 security/testing 同族已纳管件），authority 块源形对齐 batch-1 `grid.editable-grid.json`；**不冒充语料出处**（0.2 已注记）。

---

## 8. 变异探针物证（§96 golden 钉子自证；floor.json P30-Commands 注记指向本节）

**探针目标**：验证 `tests/integration/migrate-tracer-bullet-golden.spec.ts` 的 analyze-only 零写入钉（catalog 字节快照断言，line 192：`treeSha(resolveCatalogRoot())` 前后全同）真的会红。

**v2 探针（append 型，红通路验证）**：

1. **篡改**：向 `packages/cli/src/migrate.ts` 的 `analyzeSpecDir` 调用后注入一行写通路——`appendFileSync(join(<repoRoot>, "catalog", "probe-mutant.tmp.json"), JSON.stringify({probe:"…", t:Date.now()}) + "\n")`（**append 且含时间戳 ⇒ 每次调用新增字节**）；以 vitest 实跑 golden（vitest alias 直达 src，无需重建 dist）。
2. **红**：`migrate-tracer-bullet-golden.spec.ts` → **1 failed | 6 passed**；失败点即 catalog 字节快照断言（line 192）：`expected: "98404b96…"` / `received: "25df38bc…"`（16-hex 前缀；快照前后 tree sha 不再全同）。**golden 红通路成立**。
3. **还原**：migrate.ts 还原为字节原样（探针行删除；P30 主线交付内容不变），删除 `catalog/probe-mutant.tmp.json` 探针残留。
4. **绿**：golden 复跑 **7/7 passed**；`git status --short catalog/` 输出为空（探针零残留）；后续全量验证见 §9 尾。
   〔双核验勘正（2026-08-31，审计 MAJOR 抓出，修复轮主控补记）：审计开始时点 `catalog/probe-mutant-b.json` 在场——实际探针写入的文件名是 `probe-mutant-b.json`（`-b` 变体名），本节按注入代码字面记载为 `probe-mutant.tmp.json`，实际清理动作与残留物名存在出入（tmp 名清理了、b 名漏清）。该残留于双核验进行中被清（终态 `git status` catalog/ 干净、字节快照前后 diff=空经审计亲验）；根因=探针自证环节自身的清理核对以报告文字而非盘面实况为分母——与 P29 先行运行漏报同型，留档作呈报卫生纪律的反面教材。修复轮后主控复核：`ls catalog/probe-mutant*` 空。〕
5. **v1 探针（字节稳定重写，不红——诚实记录）**：首次注入为确定性同字节 `writeFileSync`（每次覆写相同内容）→ golden **仍绿**。判定：字节快照对 byte-stable rewrite 不敏感（H4），红通路必须以 append/变异型写入验证。**两次探针结果均如实留档，不隐去 v1 的「不红」**。

**另一钉子的结构性自证**（无需探针，结构即证）：`pomaster migrate trellis-spec --apply` 在 CLI 选项注册表中**结构性不存在**——实跑 `--apply` 得 unknown option 拦截 + deferred 指路提示，**exit 1**（本轮复核于演示 fixture；`migrate.spec.ts` 三条 deferred 词形测试同钉）。`--spec-root` 缺席同 fail-closed（NOT_CONFIGURED，exit 1）。

---

## 9. 五主题 Tracer Bullet 达成声明（PRD §96 第 11 步）

> 「不应以一次迁完所有 Frontend/Backend Hard Spec 作为 v0.4 的完成条件。Migration 应采用 Tracer Bullet：先挑 3~5 个代表主题打通全链路（Catalog → Project State → Context Projection → Gate → Human View），再扩大迁移。」（PRD §96 第 11 步 L6178-6190 词形）

**达成声明**：五主题（0001 三主题 change governance / API contract / data grid + 本轮 security / testing）已各自以一条真实 change 走通八拍 8/8 全环——**达到并超过 §96 第 11 步要求的「3~5 个代表主题」区间下限，且落在区间之内**；五主题合计覆盖：

- 对象五族：change_object / contract_operation / capability+component / knowledge_entry（+ 本轮 security/testing capability 族与 ADR knowledge 族）；
- 门禁三门：BUILD（五主题）+ COVERAGE（本轮**真跑**，含 not_run/failed/passed 三态）+ reconcile delta 五词形中的四词形（axes_change / content_drift / materialized / content_tamper 异常形态；vanished 不制造）；
- 诚实七形态全出场（§6.3）；
- 全链路五环（Catalog → Project State → Context Projection → Gate → Human View）每主题至少一次完整实证，其中 Human View 环由 status/permit list/view narrative/migrate analyze 四个只读面共同承载。

**结论**：迁移方法论层面的 tracer-bullet 阶段目标已达成；后续批次可按 §93.6 deferred 词形（--propose/--diff/--apply）进入「扩大迁移」前的 Proposal 生成面，且应携带本轮沉淀的两项工程前提（H1 覆盖映射前提、H5 一致性校验缺口）。

**任务收尾验证锚**（报告定稿时点）：`node scripts/build-all.mjs` exit 0；全量 `pnpm vitest run` **0 failed**（与 floor.json minTests=2343 映射同步）；`node tests/ratchet/ratchet.mjs` exit 0；变更文件 eslint 0 violations；`git status` 无探针残留（migrate.ts 字节还原、catalog/ 干净）。

---

## 附录 A：对象 JSON 形状（6 对象； rev=2 者为本轮变更后形态）

```jsonc
// truth/objects/capability/capability.sec.token-issuance.json（rev 1→2，主题④变更对象）
{
  "id": "CAPABILITY.SEC.TOKEN_ISSUANCE", "kind": "capability", "axisProfile": "capability_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "titleZh": "签发令牌（HMAC-SHA256）",
  "authority": { "owner": "SEC_GUARDRAIL_OWNER", "delegates": [], "writePolicy": "AGENT_WITH_PERMIT",
                 "escalation_hint": "阈值收紧/放松须走 CHANGE 对象（EVOLUTION_CHANNEL；源形参考 corpus/master/batch-1/truth/objects/capability/grid.editable-grid.json 的 authority 块）" },
  "origin": "natural",
  "payload": {
    "canonical_realization": { "component": "authz", "import": "src/authz.js" },
    "category": "security", "technology_base": "NODE_BUILTIN", "domain_states": ["issue", "verify", "reject"],
    "forbidden": ["fallback_signing_secret", "silent_secret_fallback", "allow_by_default"],
    "unresolved": [],
    "floor_basis": "CHANGE.SEC_GUARDRAIL_UPGRADE：SEC_SIGNING_SECRET_REQUIRED 结构化错误 + deny-by-default（GRN-0002 红→GRN-0003 绿）已闭合；forbidden 补 fallback_signing_secret 明文禁令"
  },
  "sources": [{ "type": "human_directive", "ref": "ADR_DENY_BY_DEFAULT", "capturedBy": "human:owner", "pin": { "baseline": "tracer2-b1" } }],
  "notesMd": "…（变更叙述）…"
}
// CAPABILITY.SEC.PERMISSION_CHECK：同构；payload 登记 deny_by_default 语义（granted 数组显式授予）。
// KNOWLEDGE.ADR_DENY_BY_DEFAULT：knowledge_entry，ADR-0002 决策记录（denied-by-default + 结构化错误词形）。
// CAPABILITY.TEST.COVERAGE_FLOOR（rev 1→2，主题⑤变更对象）：payload.thresholds={lines:85,branches:80}
//   （初始 80/70）、unresolved=[]、floor_basis=「COVERAGE 腿真跑抓到的行口径缺口（76.47%<80，GRN-0006
//   failed）已闭合（GRN-0009 录绿）；阈值同步收紧 80/70→85/80；预登记缺口镜像猜测分支口径失守、真跑实测
//   行口径失守——治理记录不冒充判卷输入（C5），以机器重算为准」。
// CAPABILITY.TEST.FLAKY_DISCIPLINE：capability，flaky 纪律（本轮 scope 外诚实留守，rev 恒 1）。
// CHANGE.COVERAGE_GATE_TIGHTEN：change_object，PROPOSED/EXPERIMENTAL/PLANNED，payload.class_scan_result
//   （R4 必填：scope/hits/fixed_count/regression_case_ref）给全；生命周期演进留人审。
```

## 附录 B：seq 账目表（generation_seq 0→14；两主题共享单 store）

| seq | 事件 | 载体 |
|---|---|---|
| 1 | Permit④ 签发（PERMIT.CHANGE_SEC_GUARDRAIL_UPGRADE.1；事件不耗 seq 面，ran_at_seq 采样点） | 006 |
| 2 | GRN-0001 入账（passed，ran_at_seq=1） | 011 |
| 3 | GRN-0002 入账（failed，ran_at_seq=2） | 013 |
| 4 | —（GRN-0003 ran_at_seq=4） | |
| 5 | GRN-0003 入账（passed）；同批 tx-sec-upgrade 已在此前 compact 携行（TOKEN_ISSUANCE rev 1→2） | 016/014 |
| 6 | CLM-0001 入账（UNVERIFIED） | 017 |
| 7 | Permit⑤ 签发（PERMIT.CHANGE_COVERAGE_FLOOR_TIGHTEN.1） | 023 |
| 8 | GRN-0004 入账（passed，ran_at_seq=7） | 028 |
| 9 | GRN-0005 入账（**not_run**，gate=COVERAGE，ran_at_seq=8） | 029 |
| 10 | GRN-0006 入账（failed，gate=COVERAGE，ran_at_seq=9） | 030 |
| 11 | GRN-0007 入账（failed，gate=BUILD，ran_at_seq=10） | 032 |
| 12 | —（GRN-0008 ran_at_seq=12；tx-test-floor-close 携行：COVERAGE_FLOOR rev 1→2，thresholds 85/80） | 033 |
| 13 | GRN-0008 入账（passed） | 035 |
| 14 | GRN-0009 入账（passed，gate=COVERAGE）＝终态 applied_seq；compact ×4 NO_CHANGE、status/permit list/view/migrate 均零 seq 推进 | 036–044 |

## 附录 C：环境与捕获件对账锚

- node v22.13.1；pnpm 经 corepack（不钉 packageManager）；fixture devDeps vitest 2.1.9 + c8 10.1.3；PATH 消毒（游离引号 G7）+ `%TEMP%\pomaster-bin` shim（0001 §0.3 同款）。
- 捕获件目录 `%TEMP%\pomaster-tracer2-captures\`（演示后删除；本节 sha 为对账锚，sha256 16-hex 前缀）：

| 捕获件 | sha256（16-hex 前缀） | 内容 |
|---|---|---|
| 012-check-sec-red.json | `409bb8df2dc2200a` | 主题④ BUILD 红（12/12/2/0，GATE_FAILED） |
| 015-check-sec-green.json | `ceca9d6e5dd3cb5e` | 主题④ BUILD 绿（12/12/0/0） |
| cov-test-baseline2.json | `6e7a7f6a3585918d` | 主题⑤ COVERAGE 真跑 failed（行 76.47%<80） |
| cov-test-green.json | `a4f6df343923e2ad` | 主题⑤ COVERAGE 真跑 passed（100%/100% ≥85/80） |
| 018-reconcile-sec-1.json | `04cbc2f42031453e` | 主题④ reconcile 首跑（≡ 恢复后重放 020） |
| 037-reconcile-test.json | `d1f0511dc709aab6` | 主题⑤ reconcile（双门 exceptions） |
| 040-status-1.json | `ce26ed025eba67bf` | status（≡ 041；6 对象分母） |
| 039-tree-zw.txt（内文） | 树 sha 全文 `31bc036422f02977b6c020186decf710f90586cf793b9b9cb59c211aaa82895c` ×2 行 | compact 前后零写入 |

（完）
