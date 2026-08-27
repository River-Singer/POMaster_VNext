# Phase C —— 八拍 Change Loop 实测演示报告

> **日期**：2026-08-28　**性质**：P0 骨架真实 CLI 实测（非 mock、非单测复述——全部输出为命令真实 stdout）
> **CLI**：`POMaster_VNext/packages/cli/dist/bin.js`（`@pomaster/cli` 0.0.0；node v22；pnpm workspace 依赖已装，dist 与 src 同步构建）
> **调用方式**：`node <仓库绝对路径>/packages/cli/dist/bin.js --dir <项目根> <command> [--json]`（`--dir` 为程序级全局选项）
> **靶子**：`examples/tiny-tool`（tiny-csv-tool 0.1.0）的**临时副本** `%TEMP%\pomaster-phasec-OXGJ\tiny-tool`
>
> **纪律声明**：
> - 未执行任何 git 操作；
> - `examples/tiny-tool` 已提交状态零改动——全部演示（含 vitest 安装与测试文件增删）只落在临时副本上；
> - `MASTer_master` 目录全程未触碰；
> - 本文件是本次演示在仓库内的唯一落盘产物。

---

## 0. 预置事实（理解本报告的前提）

提交态的 `examples/tiny-tool/.pomaster/` 已预置**证据平面夹具**（这是 Phase C 演示靶子的一部分）：

- `evidence/runs/GRN-0001.json` —— CSV_ROUNDTRIP gate，verdict=passed，ran_at_seq=3，subject=TEST.CSV.QUOTED_CELL，`is_fixture: true`；
- `evidence/claims/CLM-0001.json`、`truth/objects/capability/csv-tool.serialize-rows.json`、`truth/keybindings/keybinding.code.csv-serialize-rows.json`。

但 **state 平面（`state/truth-index.json`）不在提交态里**——由演示第一步 `pomaster init` 创建（seq=0 空账本）。按 A8（run 信封不入 truth-index），status 的对象计数为 0 是**符合设计的诚实呈现**，不是丢失。

## 1. 执行序列与退出码

| # | 命令（均加 `--dir <demo>`） | 退出码 | 语义 |
|---|---|---|---|
| 1 | `init` | 0 | `CREATED`（创建 4 文件骨架） |
| 2 | `init`（第二次） | 0 | `NO_CHANGE`（字节稳定零写入，幂等） |
| 3 | `triage "<纯样式请求>" --json` | 0 | MINIMAL |
| 4 | `triage "<新能力请求>" --json` | 0 | LIGHT |
| 5 | `triage "<跨域契约请求>" --json` | 0 | STANDARD |
| 6 | `context compile --role implementer --json` | 0 | 三分区投影（诚实空） |
| 7 | `check --fast --json`（原始临时副本） | **1** | NOT_INSTALLED / not_run（fail-closed） |
| 8 | `check --fast --json`（副本装 vitest 后，环境 PATH 缺陷未除） | **1** | READY / not_run（spawn 失败，绝不静默通过） |
| 9 | `check --fast --json`（PATH 消毒后实跑） | **1** | READY / **failed**（violations=1，gate 抓住真缺陷） |
| 10 | `check --fast --json`（修正测试断言后） | **0** | READY / **passed** |
| 11 | `status --json`（第 1 次） | 0 | seq=0 空账本诚实汇总 |
| 12 | `status --json`（第 2 次） | 0 | 与第 1 次输出**字节全同** |
| 13 | `status --json`（全部 check 跑完后第 3 次） | 0 | 仍与第 1 次字节全同（check 全程零写状态） |

## 2. 八拍对照表

> 拍号按本次任务编号；括号内为 README「THE LOOP」/`docs/architecture.md` 的 canonical 对应拍。

| 拍 | 名称 | 本次载体 | 实测结果 | 证据锚 |
|---|---|---|---|---|
| ① | TRIAGE | `pomaster triage <request> --json` | 三请求三档：MINIMAL / LIGHT / STANDARD，判定必附 absent_signals（8 项缺席信号全量显式） | §3.1 |
| ② | FRAMEWORK LOCK | **无独立命令**（kernel 已有 `issuePermit/checkPermit/stealPermit`，CLI 未暴露） | 未实跑（见 §5 缺口 G1） | §5 |
| ③ | PROJECTION | `pomaster context compile --role implementer --json` | 三分区（MUST/ADVISORY/LAZY TOOLS）markdown + 机读 manifest；空账本 → 诚实空投影 + 稳定 inputs_fingerprint | §3.2 |
| ④ | EXECUTE | **无独立命令**（设计上= Permit 内免检写代码；kernel `checkPermit(WriteAttempt)` 是判卷原语但写路径无人调） | 未实跑（见 §5 缺口 G2） | §5 |
| ⑤ | VERIFY | `pomaster check --fast --json`（gauntlet-lite BUILD adapter 实跑） | **四段全谱系实测**：NOT_INSTALLED → not_run（环境缺陷）→ failed（真违规）→ passed | §3.3 |
| ⑥ | RECONCILE | **无独立命令，且 kernel 尚无 reconcile 实现** | 未实跑（见 §5 缺口 G3） | §5 |
| ⑦ | STATUS（对 canonical ⑦ COMPACT「NO_CHANGE 即成功」语义的读侧实证） | `pomaster status --json` 连续两次 + check 后第三次 | 三次输出 sha256 全同（`e0f5f7fa…818d7`），diff 为空——NO_CHANGE 幂等成立，且证明 check 全程零写状态 | §3.4 |
| ⑧ | COMPACT | **无独立命令**（kernel `applyTransaction` 已实现 = canonical ⑦「COMPACT 出口」，但无 CLI 编排） | 未实跑（见 §5 缺口 G4；GRN-0001/CLM-0001 夹具暂无入账路径） | §5 |

## 3. 可运行拍实测详情

### 3.1 拍① TRIAGE —— 三请求三档

| 请求 | 命中规则 | 判档 | 证据级 | 命中关键词 |
|---|---|---|---|---|
| 「把登录页按钮的**样式**和**配色**调整为新版设计规范，仅改 CSS 与**文案**，不动任何逻辑」 | F_COPY_STYLE_ONLY（短路快道） | **MINIMAL** | MEASURED（谓词只关于输入文本自身） | 文案、样式、配色、css |
| 「为 tiny-csv-tool **新增列统计汇总能力**：对解析后的数值列输出 min/max/sum」 | DEFAULT_NO_SIGNAL（兜底缺省） | **LIGHT** | NOT_CONFIGURED（无信号下的诚实缺省，不是绿） | （无） |
| 「CSV 解析模块与外部导出服务对齐 OpenAPI **契约**，涉及**跨域**接口变更」 | E_CONTRACT_KEYWORD（升档触发） | **STANDARD** | INFERRED（关键词是关于世界的推断，不冒充实测） | 契约、openapi、跨域 |

三次判定均显式携带 `ttl_hours: 168`（C9）与 8 项 absent_signals（declared_paths / path_class / contract_surface_registry / dependency_manifest_hit / migration_hit / test_only_hit / diff_stat / governed_object_hits）——P0 引擎唯一可采信号是请求文本，其余信号源全部如实标记缺席，**缺席没有被渲染成干净**。

<details>
<summary><code>triage1 --json</code>（纯样式 → MINIMAL）原文</summary>

```json
{
  "command": "triage",
  "ok": true,
  "result": {
    "profile": "MINIMAL",
    "evidence_grade": "MEASURED",
    "absent_signals": [
      "declared_paths",
      "path_class",
      "contract_surface_registry",
      "dependency_manifest_hit",
      "migration_hit",
      "test_only_hit",
      "diff_stat",
      "governed_object_hits"
    ],
    "ttl_hours": 168,
    "matched_rule": "F_COPY_STYLE_ONLY",
    "matched_keywords": [
      "文案",
      "样式",
      "配色",
      "css"
    ]
  },
  "warnings": [],
  "errors": []
}
```

</details>

<details>
<summary><code>triage2 --json</code>（新能力 → LIGHT）原文</summary>

```json
{
  "command": "triage",
  "ok": true,
  "result": {
    "profile": "LIGHT",
    "evidence_grade": "NOT_CONFIGURED",
    "absent_signals": [
      "declared_paths",
      "path_class",
      "contract_surface_registry",
      "dependency_manifest_hit",
      "migration_hit",
      "test_only_hit",
      "diff_stat",
      "governed_object_hits"
    ],
    "ttl_hours": 168,
    "matched_rule": "DEFAULT_NO_SIGNAL",
    "matched_keywords": []
  },
  "warnings": [],
  "errors": []
}
```

</details>

<details>
<summary><code>triage3 --json</code>（跨域契约 → STANDARD）原文</summary>

```json
{
  "command": "triage",
  "ok": true,
  "result": {
    "profile": "STANDARD",
    "evidence_grade": "INFERRED",
    "absent_signals": [
      "declared_paths",
      "path_class",
      "contract_surface_registry",
      "dependency_manifest_hit",
      "migration_hit",
      "test_only_hit",
      "diff_stat",
      "governed_object_hits"
    ],
    "ttl_hours": 168,
    "matched_rule": "E_CONTRACT_KEYWORD",
    "matched_keywords": [
      "契约",
      "openapi",
      "跨域"
    ]
  },
  "warnings": [],
  "errors": []
}
```

</details>

### 3.2 拍③ PROJECTION —— `context compile --role implementer`

实跑于 `init` 后的 seq=0 空账本。结果：`ok=true`，三分区全部**诚实为空**——

- MUST（gate 判卷输入）：`_（空——本角色本任务无 MUST 注入项）_`
- ADVISORY（按触发条件注入、不进判卷，GOLDEN-L8-3）：`_（空——无触发条件命中的经验注入）_`
- LAZY TOOLS：`_（无）_`（v0 无工具 catalog，显式空不杜撰）

这正是 kernel `compileProjection` 的契约行为：范围为空 → manifest 为空（**诚实缺席，不杜撰「全域上下文」**）。`inputs_fingerprint=sha256:c07fb0c2…00be7` 由 manifest+request 派生，同输入重放字节稳定（D24 只读服务）。机读走 `manifest` 字段、人读走 `markdown` 字段（§45 双输出）。

<details>
<summary><code>context compile --role implementer --json</code> 原文</summary>

```json
{
  "command": "context compile",
  "ok": true,
  "result": {
    "role": "implementer",
    "inputs_fingerprint": "sha256:c07fb0c2b7859baab14db49254c3f5cc48b648bf8ebc71fb12d901be7df00be7",
    "manifest": {
      "must_entries": [],
      "advisory_entries": [],
      "lazy_tools": []
    },
    "markdown": "# Context Projection — role: implementer\n\n> inputs_fingerprint: sha256:c07fb0c2b7859baab14db49254c3f5cc48b648bf8ebc71fb12d901be7df00be7\n> 纯派生视图（八拍③）：不写 store、不产生治理事实；MUST 区为 gate 判卷输入，ADVISORY 区不进判卷（GOLDEN-L8-3）。\n\n## MUST（gate 判卷输入）\n\n_（空——本角色本任务无 MUST 注入项）_\n\n## ADVISORY（按触发条件注入；不进 gate 判卷输入）\n\n_（空——无触发条件命中的经验注入）_\n\n## LAZY TOOLS（按需物化）\n\n- _（无）_\n"
  },
  "warnings": [],
  "errors": []
}
```

</details>

### 3.3 拍⑤ VERIFY —— `check --fast` 四段实跑全谱系

BUILD gate（gauntlet-lite §59 adapter：detect → prepare → run → normalize）在四种真实条件下各跑一次，完整覆盖「NOT_INSTALLED / not_run / failed / passed」——**每一段都不是绿即报绿，not_run 与 failed 均以 ok=false + 非零退出码 fail-closed**：

| 段 | 条件 | status | verdict | counts (scanned/applicable/violations/notApplicable) | ok |
|---|---|---|---|---|---|
| a | 原始副本（package.json 未声明 vitest） | NOT_INSTALLED | not_run | 0/0/0/0 | false（exit 1） |
| b | 副本 `corepack pnpm add -D vitest`（4.1.11）后；但本机 PATH 有游离引号破坏 cmd 子进程链（见附录 A） | READY | not_run | 0/0/0/0 | false（exit 1） |
| c | PATH 消毒后真实执行；演示测试其一断言写错（把信息位 issues 当空数组断言） | READY | **failed** | 2/2/**1**/0 | false（exit 1） |
| d | 修正测试断言后 | READY | **passed** | 2/2/0/0 | **true**（exit 0） |

值得强调的三个「报绿纪律」实证：

1. **段 b**：spawn 失败（`'node' 不是内部或外部命令`）→ adapter 归一为 not_run，CLI 拒绝静默通过——环境问题不会被伪装成绿或红，属于七态里诚实的「非绿非红终局报告」。
2. **段 c**：gate 判卷以 `recomputed`（从 assertionResults 逐条重算）为唯一依据，violation=1 被如实判 failed——**这是 gate 抓住了演示者自己写错的断言**（`parseCsv` 返回的 `issues` 是失效模式探针信息位，样本合法含引号分隔符/换行时非空，不该断言其为空）。
3. **段 d**：passed 时 applicableScanned=2 > 0，不触发「零执行断言降级 warning」规则；ok=true 才与退出码 0 对齐。

<details>
<summary><code>check --fast --json</code> 段 a：NOT_INSTALLED 原文（exit 1）</summary>

```json
{
  "command": "check",
  "ok": false,
  "result": {
    "gate": "BUILD",
    "status": "NOT_INSTALLED",
    "verdict": "not_run",
    "counts": {
      "scanned": 0,
      "applicableScanned": 0,
      "violations": 0,
      "notApplicable": 0
    },
    "detail": "package.json 未声明 vitest 依赖（devDependencies/dependencies 均无）（hint: 安装建议：corepack pnpm add -D vitest（BUILD 门禁 test 腿））"
  },
  "warnings": [],
  "errors": [
    {
      "code": "ADAPTER_NOT_INSTALLED",
      "message": "gauntlet-lite build adapter not executable; BUILD gate not_run — package.json 未声明 vitest 依赖（devDependencies/dependencies 均无）（hint: 安装建议：corepack pnpm add -D vitest（BUILD 门禁 test 腿））",
      "hint": "not_run 不是 passed（绝不静默通过）；按 hint 安装/配置测试工具后重试。"
    }
  ]
}
```

</details>

<details>
<summary><code>check --fast --json</code> 段 b：READY / not_run（spawn 失败 fail-closed）原文（exit 1）</summary>

```json
{
  "command": "check",
  "ok": false,
  "result": {
    "gate": "BUILD",
    "status": "READY",
    "verdict": "not_run",
    "counts": {
      "scanned": 0,
      "applicableScanned": 0,
      "violations": 0,
      "notApplicable": 0
    },
    "detail": null
  },
  "warnings": [],
  "errors": [
    {
      "code": "GATE_NOT_RUN",
      "message": "BUILD gate verdict=not_run",
      "hint": "阻断裁决归 closeout 编排层；本命令按 fail-closed 对非 passed 一律 ok=false。"
    }
  ]
}
```

</details>

<details>
<summary><code>check --fast --json</code> 段 c：READY / failed（violations=1，抓到真实断言缺陷）原文（exit 1）</summary>

```json
{
  "command": "check",
  "ok": false,
  "result": {
    "gate": "BUILD",
    "status": "READY",
    "verdict": "failed",
    "counts": {
      "scanned": 2,
      "applicableScanned": 2,
      "violations": 1,
      "notApplicable": 0
    },
    "detail": null
  },
  "warnings": [],
  "errors": [
    {
      "code": "GATE_FAILED",
      "message": "BUILD gate verdict=failed",
      "hint": "阻断裁决归 closeout 编排层；本命令按 fail-closed 对非 passed 一律 ok=false。"
    }
  ]
}
```

</details>

<details>
<summary><code>check --fast --json</code> 段 d：READY / passed 原文（exit 0）</summary>

```json
{
  "command": "check",
  "ok": true,
  "result": {
    "gate": "BUILD",
    "status": "READY",
    "verdict": "passed",
    "counts": {
      "scanned": 2,
      "applicableScanned": 2,
      "violations": 0,
      "notApplicable": 0
    },
    "detail": null
  },
  "warnings": [],
  "errors": []
}
```

</details>

### 3.4 拍⑦ STATUS —— NO_CHANGE 幂等（连续两次 + check 后第三次）

`status` 是纯读命令（D24：从不校验/重算摘要值）。对 `--json` 输出做字节级对比：

```
status1.json = e0f5f7fa631cecf1165bed314f55012fe2b8440e394f3820c713cf816fa818d7
status2.json = e0f5f7fa631cecf1165bed314f55012fe2b8440e394f3820c713cf816fa818d7
status3.json = e0f5f7fa631cecf1165bed314f55012fe2b8440e394f3820c713cf816fa818d7   （全部 check 实跑之后）
diff status1.json status2.json  → 空（byte-identical）
diff status1.json status3.json  → 空（byte-identical）
```

结论：

1. **NO_CHANGE 幂等成立**——同一状态重复读取，输出字节全同（无墙钟时间戳污染，A4/D24 纪律在输出侧的体现）；这实证了 canonical ⑦ COMPACT「Current Truth 更新**或 NO_CHANGE**；No-op is elegant」的读侧语义。
2. **check --fast 全程零写状态**——段 a–d 四次 gate 实跑（含 vitest 子进程执行）之后 status 仍字节全同：check 是判卷呈现，GRN 只在呈现面临时组装、不入 evidence 平面、更不动 store（正式 GRN 分配与 `record_gate_run` 入账归 kernel store 事务，见缺口 G6）。
3. 汇总内容本身：`dialect_match=true`、`generation_seq=0`、对象/分母/producer 全零计数且**词表全量零填充**（10 kinds × 6 lifecycle × 3 denominator-status 显式列出，而非省略键）、`worst_blindspot=null`、无 warning。

<details>
<summary><code>status --json</code> 原文（三次运行字节全同，此处为 run1）</summary>

```json
{
  "command": "status",
  "ok": true,
  "result": {
    "state_path": ".pomaster/state/truth-index.json",
    "dialect_match": true,
    "generation_seq": 0,
    "objects": {
      "total": 0,
      "by_kind": {
        "capability": 0,
        "component": 0,
        "contract_operation": 0,
        "error_term": 0,
        "field_definition": 0,
        "page_surface": 0,
        "knowledge_entry": 0,
        "business_rule": 0,
        "change_object": 0,
        "task_object": 0
      },
      "by_lifecycle": {
        "PROPOSED": 0,
        "CURRENT": 0,
        "SUPERSEDED": 0,
        "DEPRECATED": 0,
        "RETIRED": 0,
        "REJECTED": 0
      }
    },
    "denominators": {
      "total": 0,
      "by_status": {
        "PROPOSED": 0,
        "CURRENT": 0,
        "SUPERSEDED": 0
      }
    },
    "permits": {
      "unique_active_refs": [],
      "objects_with_active_permits": 0,
      "migrating_total": 0,
      "migrating_without_permit": []
    },
    "producers": {
      "total": 0,
      "dead": []
    },
    "worst_blindspot": null
  },
  "warnings": [],
  "errors": []
}
```

</details>

### 3.5 附：BOOTSTRAP 段 `init` 幂等（八拍的入口前置）

```
init 第 1 次 → CREATED（created ×4：.pomaster/state/truth-index.json、.pomaster/config.yaml、AGENTS.md、CLAUDE.md；profile: LIGHT）
init 第 2 次 → NO_CHANGE（unchanged ×4，零写入）
```

字节稳定（账本 seq=0 起点、入口文件无时间戳）——「No-op is elegant」在写路径的入口演示。

## 4. 不可独立运行的拍：②④⑥⑧ 逐拍交代

> canonical 对应：本任务 ②④⑥⑧ = README「THE LOOP」的 ② FRAMEWORK LOCK / ④ EXECUTE / ⑥ RECONCILE / ⑦ COMPACT。当前 P0 CLI 六命令面（init/triage/status/context compile/doctor/check）没有这四拍的独立命令；下表逐拍写明**当前载体 / 缺口 / 归属后续砖**。

| 拍 | 当前载体（已存在的真实物） | 缺口（本次实测确认不存在） | 归属后续砖 |
|---|---|---|---|
| ② FRAMEWORK LOCK | kernel 已实现并导出 `issuePermit` / `checkPermit` / `stealPermit`（`docs/kernel-api.md` §4「八拍②五件套」）；README 定义五件套=身份/Capability/契约引用/Permit 范围/验收形状，人唯一主场 | CLI 无 `permit`/`framework` 子命令——五件套的签核与 Permit 颁发没有命令面入口，人审结论无法经 CLI 落成 PERMIT | **CLI 命令面扩建**：`pomaster permit issue/check/steal`（转调 kernel permits.ts，编排与呈现归 cli） |
| ④ EXECUTE | 设计语义=「Permit 内实现免检；FAST gate 内循环自检」——由 harness/agent 在 Permit 范围内直接写代码；kernel `checkPermit(store, permitRef, WriteAttempt)` 是写路径判卷原语 | 写路径**无机器执行点**：没有任何 hook/wrapper 在写文件前调用 checkPermit，「免检」当前只是约定，未被机器执行 | **execution 写路径集成砖**（hook 或 wrapper：写前 checkPermit、Permit 外写被拦） |
| ⑥ RECONCILE | 无（kernel 全源码 grep 无 reconcile 实现；仅 `projection.ts` advisory 文案出现「覆盖缺口待 reconcile」字样——即：连缺口的消费端提示都已预留，生产端缺席） | 双缺：kernel reconcile 模块（delta 审：框架偏离/例外清单/抽样点）不存在；CLI 命令不存在。`architecture.md` 已把它登记为规划对应（`reconcile`=⑥） | **kernel reconcile.ts 新砖 + CLI `pomaster reconcile` 命令**（先 kernel 后命令面） |
| ⑧ COMPACT | kernel `applyTransaction` 已实现（store 唯一写入路径；幂等重放短路 `shortCircuited`、seq/rev 单调、digest 自动维护）——即 canonical ⑦ 的「COMPACT 出口」原语齐备；`pomaster status` 提供其读侧影子 | CLI 无编排命令：没有 `pomaster compact/record` 把「Current Truth 更新、经验入账、任务归档」串起来；证据平面预置夹具（GRN-0001/CLM-0001）暂无入账路径接进 truth-index（seq 停在 0） | **CLI applyTransaction 编排砖**（`pomaster compact` / `record gate-run|claim`：转调 kernel，含 record_gate_run 入账与经验入库编排） |

## 5. 缺口清单（按本次实测证据编号）

| # | 缺口 | 实测证据 | 归属 |
|---|---|---|---|
| G1 | ② Permit/五件套无 CLI 命令面（kernel 原语齐备，命令面缺席） | §4 表②行；`pomaster --help` 六命令无 permit | CLI 命令面扩建（permit 子命令） |
| G2 | ④ 写路径无机器执行点（checkPermit 无调用方，「免检」未机器化） | §4 表④行 | execution 写路径集成砖（hook/wrapper） |
| G3 | ⑥ RECONCILE kernel 模块与 CLI 命令双缺 | 全源码 grep 无 reconcile 实现 | kernel reconcile.ts → CLI reconcile |
| G4 | ⑧ COMPACT 无 CLI 编排（applyTransaction 原语齐备但无人编排；夹具证据无入账路径） | §4 表⑧行；status generation_seq=0 而 GRN-0001.ran_at_seq=3 | CLI 编排砖（compact/record） |
| G5 | ⑤ gate 谱系不全：build adapter 仅 vitest 腿（pytest run/normalize = TODO(pytest-adapter)，D17 第一波）；CONTRACT/ARCHITECTURE/BROWSER 门禁 adapter 未落（`gateAdapters` 仅 build；doctor 探测面已备四探测） | `gauntlet-lite/src/index.ts` 注释与实现 | gauntlet 后续批次 |
| G6 | check 的 gate 结果不入 evidence 平面（呈现面临时 GRN，`record_gate_run` 无编排调用方） | §3.4 结论 2（check 跑完 status 字节不变） | closeout 编排层 + store 事务接线 |
| G7 | （环境，非产品缺陷）本机 PATH 含游离引号破坏 cmd 子进程链，导致 adapter spawn 失败 | 附录 A；段 b not_run 是 fail-closed 的正确行为而非缺陷 | 用户环境修复（PATH 引号）；产品侧无需改（缺席已诚实表达） |

## 附录 A：环境发现 —— 本机 PATH 游离引号（G7 根因）

本机 `PATH` 环境变量中 `D:\Aspark\spark\bin` 之后有一个**游离双引号字符**（`...spark/bin":...`）。Git Bash 自身容错，但一旦子进程落到 `cmd.exe`（`spawnSync(..., {shell:true})` 即是），cmd 的引号配对解析把后续整段 PATH 吞成一个引号 token，`node`/`corepack` 全部失联，报 `'node' 不是内部或外部命令`。

- 现象：段 b 的 `check --fast` spawn 失败 → adapter 诚实归一 not_run（**正确行为**，禁静默通过）；
- 复现与消毒：`PATH="$(printf '%s' "$PATH" | tr -d '"')"` 后段 c/d 正常实跑；
- 该引号位于本机用户/系统 PATH 配置（与 POMaster_VNext 无关），建议在系统环境变量设置中清除。

---

*报告生成：Phase C 实测演示（POMaster_VNext P0 骨架）；所有 `--json` 原文摘自真实命令 stdout，捕获件存于临时目录 `%TEMP%\pomaster-phasec-OXGJ\captures\`（不入库）。*
