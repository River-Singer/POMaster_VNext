# m6-evidence · M6 Go/No-Go 证据包

M6 迁移线（切断 Trellis 前 go/no-go 评审）的机器汇编证据包。唯一施工图：
[`PACK-CONTRACT.md`](./PACK-CONTRACT.md)（判据源 = design-thread-B-migration.md §5.1 G1–G9 表 + §1.7 M6 阶段行）。

## 文件

| 文件 | 性质 | 说明 |
|---|---|---|
| `PACK.md` | 编译产物 | 人类可读证据包（卷头 / §A 执行摘要 ≤40 行 / §B G1–G9 六栏对照 / §C 开放项 / §D Owner 决策位 / §E 附录证据索引）。**禁手工编辑**——重建即覆盖。 |
| `pack-manifest.json` | 编译产物 | 机器事实层；PACK.md 的唯一数据源（facts + criteria + open_items + consumed 文件集 + 自检结果）。 |
| `README.md` | 静态件 | 本文件（非编译器产物，不参与 byte-stable 比对）。 |
| `tools/build_m6_evidence.py` | 汇编器 | 契约 §3 实现（标准库 only；seq=M6-EVID；fail-closed）。`tools/build_pack.py` 为同名委托入口。 |

## 再产与自验

```bash
python corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py --check
# 预期输出：CHECK_OK double_run_byte_stable=true drift=0 anchors=… seq=…
```

`--check` 四步（契约 §3.4）：双跑 byte-stable 证明 → 不变式自检（§3.3 全量：
gate 40 件重算==views、assets 合计恒等、锚解析率 100%、fingerprint 重算一致、
铁律 3 五项 §C 在场）→ 现盘 drift 比对 → 全绿 exit 0。

## 纪律

- **禁墙钟**：产物零日期字段；运行身份 = seq 锚（`M6-EVID-0001` 起单调递增）+ 消费 HEAD sha + `inputs_fingerprint`；日期仅作为照录引文的原文散文出现。
- **零读取 `D:/Vscode Documents/MASTer_master`**（含未提交工作树）：MASTer 现状一律经 `corpus/master/rechecks/` 存档件转述挂锚。
- **go/no-go 判定权 100% 在 Owner**：PACK.md §B 状态词是子项不等式/存在性检查的机械核对结果（满足/部分满足/不满足/无法评估（无档案）四值），§D 只列呈报位，不做倾向性推荐。
- **改动面**：本目录为 additive 新增；corpus 快照、packages/、tests/、catalog/、benchmarks/、既有 cutover/ 文件零改动；不执行 git commit/push。
