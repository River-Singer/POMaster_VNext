# BATCH-1 · MASTer 镜像收编（MIG-B1）

> 状态：**已落地并通过双独立核验（2 FAIL 已修复复验）**。三主题 10 对象域，只读取材，转录物全部在本目录。
> 决议锚：D11 tracer bullet / D15 key-binding / D16-D18 backend / §61 M0-M7（镜像变体——消费项目只读约束下，tombstone/写仲裁留待写授权）。

## 一批看懂

| 层 | 产出 | 硬数字 |
|---|---|---|
| M0 盘点 | `inventory.yaml` + `key-binding-map.draft.yaml` | 10 资产 sha256 pin · 6 分母实测 · published OpenAPI operationIds=**190**（设计稿称 178，以实测为准） |
| M1 分类 | `classification-ledger.yaml` | 覆盖率 10/10 · conflicts_pending_owner=0（诚实零） |
| M2 转录 | `truth/objects/**` **290 对象** | API_REQ **129=129 零丢失** · issue 107=107 · mock 11 · ERR 14 · GRID 切片 3/90 · vendor-adapter 6 库全字段保真 · 字典 76 叶子单元零 diff |
| M3 Authority | `authority.json` | 290 map 全覆盖 · frontend-only 边界规则一等化 · owner 零幽灵 |
| M4 Gate | `gate-runs/**` 16 文件 16/16 过 03 schema | 见下方四态分布 |
| 校准二轮 | `calibration/` | 16 真实任务回放：title 域 12/12，偏离 4/4 全系 NOT_CONFIGURED 信号缺席；PROPOSED 挂 Owner 批准位 |

## Gate 四态分布（13 check 运行 + 3 主题聚合，聚合均 failed——不报绿）

```text
contract : C1 openapi-ref failed(17 violation/117 适用) · C2 mock-declaration failed(6/11)
           C3 implementation-honesty failed(32/121，mock_unverified 全数命中)
           C4 error-chain skipped_blindspot · C5 boundary-consumption passed
grid     : G1 forbidden-direct-import failed(6 violation/422 扫描——设计稿曾测零违例，须查漂移)
           G2 usage-binding skipped_blindspot · G3 adapter-preservation passed(6/6) · G4 engine-lock not_configured
change   : issue-evidence-chain failed(107/107——见下方语义注记) · supersede-chain passed(18)
           machine-readability skipped_blindspot · status-semantic-audit passed(247/247)
```

**语义注记（诚实分账）**：change G1 的 107 violations 里 106 条是 OPEN issue「尚未有关闭证据」的天然态（evidence 随关闭产生）——这是 **gate recipe 语义待精化**（应区分 OPEN-no-evidence-yet vs CLOSED-without-evidence），不是 106 个项目缺陷；WONT_FIX 1 条无关闭证据是真发现。grid G1 的 6 处直接 import 违例与设计稿 08-27 实测「零违例」相悖——**待查源仓漂移 vs 扫描器口径**。

## 核验结论

- **保真 PASS**：129/129 全量对账（超抽样要求）· vendor-adapter 逐字段零丢失 · pin digest 现场重算全 MATCH · 469/469 tests · catalog 零污染
- **确定性 FAIL→已修复**：①AGG-MIG-B1-grid 自由形状→改合规 GateResult 聚合；②126 个 change-object 文件名大写违 CONVENTIONS→工具补 `.lower()` 全下游按依赖序重产，对象内容 byte-identical、判定零变异
- 修复复验：16/16 schema · 290/290 文件名 · 幂等 331 文件零差异 · vitest 469

## 挂 Owner 裁决（不擅自修）

1. **OBS-3**：GRID capability origin=natural vs FROZEN 02 schema 正例的 ingested（A6 场景）——CONVENTIONS §6 自相矛盾处，需裁决或 vocab PR
2. **OBS-4**：ISSUE.*×107 / FTA-*×17 / FB-*×1 源侧跟踪 id 未入 ALIASES_V0——merge-preserving 逐字保真（schema 合法），下游 REF_INTEGRITY 悬空；词汇表 PR 或改挂 payload，二选一
3. **校准二轮**：T-1 提案（TRIAGE_ESCALATION_KEYWORDS 增补 global，证据 2/53 命中 0 反例）+ 信号优先级 S-1 fan_out > S-2 declared_paths > S-2b churn > S-3 architecture_impact+C5——PROPOSED 未生效
4. **写授权**：tombstone/写仲裁的真实施工（当前为镜像变体）

## 重放

`tools/` 12+ 确定性工具按依赖序可全量重放（幂等已证：连跑 byte-identical；零墙钟字段；seq 代号 MIG-B1）。
