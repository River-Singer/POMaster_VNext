# prototypes · 产品原型

本目录存放 PoMaster 的**原型实现**：用于验证设计契约的先行砖，不是治理事实源，
不进 truth-index、不产生治理事实、不分配 seq/rev。

## view-renderer —— registry-tree 投影渲染器 v0

D25 投影预设的原型实现：把 vNext truth objects（`corpus/master/batch-*/truth/objects/**`）
按批次过滤后，反向组装成旧目录骨架的 registry YAML 形状，验证
**Canonical State 唯一事实源 + 投影可再生**的产品语义。

- 契约：`catalog/projection-presets/registry-tree.yaml`（配置骨架）
  与 `docs/registry-tree-projection-preset.md`（硬约束设计文档）。
- 再生契约：byte-stable 零墙钟、fully_regenerable、同态零写入短路、
  absence 显式登记（`renders/**/render-manifest.json`）。
- 工具：`tools/render_registry_tree.py`（渲染）、`tools/check_fidelity.py`（保真对照）、
  `tools/proof_byte_stable.py`（字节稳定性实证）。
- 产物：`renders/batch-1|batch-2/`（投影文件 + manifest）、`renders/_proof/`（重跑实证）、
  `fidelity-report.md` / `fidelity-table.md` / `fidelity-stats.json`（对照结论）。

## 边界

投影文件永不作为任何 compiler / 摄入的输入（单向流：State → 渲染器 → 投影）；
渲染器的状态翻转与正式化归 Owner 裁量，本目录内容仅为原型证据。
