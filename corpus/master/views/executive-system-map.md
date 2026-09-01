<!-- view: executive-system-map | generator: corpus/master/tools/build_human_views.py | batch_code: VIEW-M5 | inputs_fingerprint: 2f9ee72d7fe373570457abdc23865790dd00e447f24fd307792ef9bb837bac99 -->

# executive-system-map

> 受众：Owner 与任何新会话 agent——用 30 秒建立「这个项目是什么、有多大、治理健康如何」的全局认知。
>
> 本文件是 corpus truth 语料的**纯派生投影**（M5 Human View），不是事实源：禁止手工编辑（编辑无效，重建即覆盖）；不写 store、不产生治理事实、不进 truth-index。谱系约定：行内 citation 记号（`[SRC:` + 引用 + `]`），文法四形态见 `docs/p9-human-view-and-l5-contract.md` §1.5；「语料未覆盖」为显式留白（缺席 ≠ 通过）。
>
> 重建：`python corpus/master/tools/build_human_views.py --check`（同输入双跑 byte-stable；inputs_fingerprint=2f9ee72d7fe373570457abdc23865790dd00e447f24fd307792ef9bb837bac99）。

## 1. 项目一句话

「This project is frontend-only; the backend is the published external OpenAPI (MASTer API 0.1.0, doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml, 190 unique operationIds, denominator per M0 inventory openapi_sources[0]); this project performs no backend-owner approval ritual.」[SRC: MIG-B1/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).statement]

## 2. 规模总览

| 指标 | 实测值 | 分母口径 | 谱系 |
|---|---|---|---|
| truth 对象总数 | 1983 | 各批 truth/objects/ 文件枚举（逐批行即分母分解） | [SRC: MIG-B1/authority.json#statistics.object_total.denominator_source]（分母口径声明位，全批同构） |
| MIG-B1 对象数 | 290 | batch-1/truth/objects/ 文件枚举 | [SRC: MIG-B1/authority.json#statistics.object_total.value] |
| MIG-B2 对象数 | 161 | batch-2/truth/objects/ 文件枚举 | [SRC: MIG-B2/authority.json#statistics.object_total.value] |
| MIG-B3 对象数 | 1068 | batch-3/truth/objects/ 文件枚举 | [SRC: MIG-B3/authority.json#statistics.object_total.value] |
| MIG-B4 对象数 | 307 | batch-4/truth/objects/ 文件枚举 | [SRC: MIG-B4/CONVENTIONS.md#hybrid(24)=307] |
| MIG-B5 对象数 | 157 | batch-5/truth/objects/ 文件枚举 | [SRC: MIG-B5/CONVENTIONS.md#全部157对象] |
| 应用页面分母 | 39 | 主 surface 对象 blueprint.source_page_id 去重（1 页 1 主对象） | [SRC: MIG-B2/inventory.yaml#denominators.blueprints.value] + [SRC: MIG-B2/gate-runs/blueprint/GTR-MIG-B2-blueprint-01-blueprint-coverage.json@GRN-4301] |
| published OpenAPI operationIds | 190 | MASTer API 0.1.0 | [SRC: MIG-B1/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).external_baseline] + [SRC: MIG-B1/inventory.yaml#denominators.published_openapi_operationids] |
| 任务语料分母 | 53 | triage 校准语料扫描任务目录 | [SRC: MIG-B1/calibration/proposed-thresholds.json#replay_evidence_base.corpus_scan_denominator.task_dirs] |

## 3. 主题域地图

五批 × 对象域 × 计数矩阵（每格 = 该批该域 truth/objects/ 文件枚举实测；合计恒等式见 §2）。

| batch | architecture-constraint | boundary | business-rule | capability | change-object | component | contract-op | dependency | directory-layout | error-term | field-definition | fixture | http-client | overlay-evidence | page-surface | pattern | performance-budget | style-ownership | 合计 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MIG-B1 | 0 | 0 | 1 | 3 | 126 | 6 | 140 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 290 | [SRC: MIG-B1/authority.json#statistics.object_total.value] |
| MIG-B2 | 0 | 0 | 3 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 151 | 0 | 0 | 0 | 161 | [SRC: MIG-B2/authority.json#statistics.object_total.value] |
| MIG-B3 | 0 | 0 | 803 | 189 | 0 | 0 | 0 | 0 | 0 | 0 | 76 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1068 | [SRC: MIG-B3/authority.json#statistics.object_total.value] |
| MIG-B4 | 10 | 39 | 0 | 0 | 0 | 0 | 0 | 27 | 7 | 0 | 0 | 101 | 3 | 18 | 0 | 12 | 63 | 27 | 307 | [SRC: MIG-B4/CONVENTIONS.md#hybrid(24)=307] |
| MIG-B5 | 0 | 0 | 18 | 109 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | 157 | [SRC: MIG-B5/CONVENTIONS.md#全部157对象] |

## 4. 治理健康一瞥

gate-run 共 40 份：passed 18 / failed 13 / skipped_blindspot 8 / not_configured 1（四态合计 = 份枚举 40，恒等式编译器内 fail-closed 断言）；盲区 escape_ratio 区间 [0.0, 1]；明细一律归 known-debt，本视图不展开。[SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json@GRN-405]（代表锚；四态计数 = 各批 gate-runs/ 逐份 verdict 实测聚合，全量清单见 known-debt §2/§3）

## 5. 重建说明

- 输入域：五批 truth/objects + gate-runs + inventory/authority/pending 登记/calibration/episodes 归档（消费文件集清单与指纹见 build-manifest.json；对象域分母口径声明位 [SRC: MIG-B1/authority.json#statistics.object_total.denominator_source]）。
```text
generator : corpus/master/tools/build_human_views.py（批次代号 VIEW-M5，零墙钟，同输入双跑 byte-stable）
fingerprint: inputs_fingerprint=2f9ee72d7fe373570457abdc23865790dd00e447f24fd307792ef9bb837bac99（消费文件集 relpath+sha256 确定性指纹，明细见 build-manifest.json）
rebuild   : python corpus/master/tools/build_human_views.py --check
exit      : 删掉 views/ 重生成 diff=0 为 M5 退出判据；单向流——本目录产物
            永不作为任何 compiler/ingest 的输入，消费方按此拒收。
```
