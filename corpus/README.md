# corpus · 真实治理语料（field corpus）

本目录是 PoMaster 的**语料层**：从真实消费项目只读采集、逐字转录得到的治理事实集合。
它是校准、验证与知识提取的**源**，不是可执行产品，也不承载任何运行时状态。

## 产品语义

- **校准源**：calibration 采样与阈值提案的事实分母（见 `master/batch-1/calibration/`）。
- **验证源**：gate-runs、baseline、golden 断言的取证材料（各批次 `gate-runs/`）。
- **知识提取源**：catalog policy/knowledge 条目的 clean-room 上提素材
  （`catalog/` 条目的 `sources[].ref` 指向本目录）。

## 结构

```
corpus/
├── master/
│   ├── batch-1 … batch-5/     # 五个采集批：inventory / classification-ledger /
│   │                          #   authority / truth objects / gate-runs / CONVENTIONS
│   └── cutover/               # 写授权记录（AUTHORIZATION）与处置手册（TOMBSTONE-RUNBOOK）
└── spec-knowledge/            # SPEC-D 协议语义拆解：candidates 池 / 汇总池 / backlog /
                               #   materialize-curated.py（catalog 精选物化）
```

## 纪律

- 源仓（MASTer_master）绝对只读；本目录一切内容为转录/登记，不改写源事实。
- 零墙钟：机器字段无时间戳；批次代号（`MIG-Bn` / `MIG-AUTH` / `SPEC-D`）是采集运行的
  档案身份锚，等同 commit sha，不做叙事性改名。
- truth objects 的语义内容为转录事实；对象 id 与 `aliases[]` 遵循词汇表机械映射纪律。
- 采集批的施工规范见各批 `CONVENTIONS.md`（效力区间与确定性契约）。
