# Catalog pilot-0001 · Human Review 落账摘要（2026-08-28）

> 依据 `docs/catalog-pilot-report.md` §8 Human Review Checklist。Owner 授权「按机器建议分布全批 + 7 项管线级裁决照建议执行」。
> 执行脚本（留档审计）：`catalog/tools/apply_human_review_pilot_0001.py`；物化经 `catalog/tools/materialize_catalog_pilot.py` 重生成。
> 纪律遵守：FROZEN 词表未动（V1–V9 仅登记不执行）；axes.lifecycle 全部保持 PROPOSED；无 git 操作。

## 1. 处置统计（实际 vs 建议分布）

| 处置 | 报告预填 | **实际落账（逐行表）** | 差异 |
|---|---|---|---|
| ACCEPT | 41 | **42** | +1 |
| ADJUST | 24 | **23** | −1 |
| REJECT | 17 | **17** | 0 |
| 合计 | 82 | **82** | — |

**差异行说明**：报告头部「预填统计 ACCEPT 41 / ADJUST 24 / REJECT 17」与 §8.1–§8.5 逐行表实数（42/23/17）相差 1 条（ACCEPT↔ADJUST 归类），与报告 §3.1/§6.2 自注的「口径差 1，无实质影响」同类。落账以逐行表为准，已在 `candidates-draft.json` meta.`human_review_application.note` 登记。

分协议实数：FE06 10/7/5 · FE15 14/5/4 · FE30 10/5/4 · BE08 3/3/3 · BE12 5/3/1（ACCEPT/ADJUST/REJECT）。

## 2. 落账内容

- **ACCEPT 42**：条目保留，物化条目与候选卡均加 `review:{disposition:'ACCEPT', seq:'pilot-0001', ref:'报告:L<行>（§8.x #n）'}`；15 个合并正本另附 `absorbed_duplicates`（合计 21 条指针，镜像 REJECT 侧 `duplicate_of`）。
- **ADJUST 23**：按报告 adjust 说明修改后同上标注。实质修改：
  - M1–M3 合并稿入正本（PRECHANGE_CONSUMER_SCAN 吸纳 BE08 六要素；DEPRECATE_BEFORE_DELETE 增禁止形态段；BREAKING_VERSIONING 并入「显式审批+可执行回退」两子句）；
  - R-F 上提 2 条（TRANSPORT_VS_BUSINESS、NO_NETWORK_OPTIMISM：LANE_POLICY→UNIVERSAL_POLICY，物化文件分类字段同步）；
  - R-E 专名清理 3 卡（GLOBAL_TD_WIDTH 剥旧包工具名、INTERACTION_REGISTRY 剥 po-master 决议编号且保留 opt-in/not-configured 语义、API_CONTRACT_OWNERSHIP 改写为通用边界模式）；
  - SERVER_OPS_VIRTUALIZATION 正本显式声明「阈值由 Project Baseline 供给」；
  - METADATA_REQUIRED 按 R-D 转机器派生改写；其余为互引/登记注记（§3.4 两口径互指、M5/M6/M7、T1 precedence、BE22 对照、指针条款候选）。
- **REJECT 17**：全部为 DUPLICATE，本就未物化（物化集无删除动作）；条目留档新建 `catalog/candidates/rejected.json`（17 条全卡 + reject 理由引用报告行 + duplicate_of，4 条双目标正本注明 secondary）；candidates-draft 内保留原卡并标 disposition=REJECT；物化脚本新增 fail-closed 守卫：disposition=REJECT 永不物化。

## 3. 管线级裁决执行结果（R-A…R-G）

| # | 裁决 | 执行结果 |
|---|---|---|
| R-A | M1–M4 | **全采纳**。M1：六要素并入 PRECHANGE_CONSUMER_SCAN 单一 UNIVERSAL 正本（PRECHANGE_SCAN_BE 让位；COMPAT_MIGRATION_ROLLBACK 保持独立互引）；M2：BE 禁止形态并入 DEPRECATE_BEFORE_DELETE；M3：两子句并入 BREAKING_VERSIONING；M4：CHG_RECORD/CHG_RECORD_BE 不硬合并，审阅为统一 CHANGE_RECORD 模板两 lane profile（互引登记） |
| R-B | DRAFT_NOT_BASELINE 升格 | **留 UNIVERSAL_POLICY**。报告未给出升格方向建议，按试点「不默认升格」纪律保守处置；升 CONSTITUTION 诉求登记挂起（待 vocab-pr V6 分类轴落地后 Owner 专项裁决），理由入 meta.pipeline_rulings |
| R-C | CONTRACT_TEMPLATE 落点 | **方案 b**。5 条暂留 candidates-draft；gate.web.api.request_checks 检查项③悬空引用改为内联字段清单（StatusPolicy/Cancellation/Retry/RetryAfter/Idempotency，物化集中 `POLICY.TPL` 引用 0 命中）；templates/ 落点挂起至 vocab-pr V8/GATE 前缀收编后（已登记） |
| R-D | METADATA_REQUIRED 落法 | **转机器派生**（T2 两卡同批）。policy 改为信封 authority/axes 结构性派生承载 + 机器预检字段存在性；GATE.CHG.PRECHANGE_CHECKS 检查项⑤同步改写为「机器预检：Spec 元数据字段存在」（选择依据：物化草案⑤本已机器形态、02 信封 authority/axes 系结构性生成，转派生消除 policy/gate 残余张力） |
| R-E | 3 卡专名清理 | **授权改写已执行**（见上 ADJUST 项；statement 均通用，无需降级） |
| R-F | Universal 上提 | **部分采纳**。2 条上提执行分类变更（applies_when.lane 维持不动，待 V7 lane 轴登记后再议）；RETRY_DISCIPLINE 维持 LANE 作为上提边界对照样本；AUTHORITY 5→1+N 合并审登记留后续批次 |
| R-G | vocab-pr V1–V9 | **原则批准为 vocab-pr 草案段落，本批只登记不执行**（V1–V10 已在 meta.vocab_findings + 物化条目 x-vocab-pr 注记；FROZEN 词表未动） |

## 4. 变更文件清单

| 文件 | 变更 |
|---|---|
| `catalog/candidates/candidates-draft.json` | 82 卡加 review 处置；M1–M3 合并稿/R-D 改写/R-F 上提/R-E 清理；meta 增 `human_review_application`（含 R-A…R-G 决议与差异注记）；stats 分类计数同步（UNIVERSAL 22 / LANE 23） |
| `catalog/candidates/rejected.json` | **新建**：17 条 REJECT 留档（理由引用报告行 + duplicate_of） |
| `catalog/{policies,knowledge,gates}/**`（60 文件） | 由物化脚本重生成：全部加 `review` 块；分类/语句/notes/gate 检查项随裁决更新 |
| `catalog/catalog-lock.draft.json` | 重生成（60 entries，content_sha256 全量对账一致） |
| `catalog/tools/apply_human_review_pilot_0001.py` | **新建**：本次落账脚本（含 82 条处置表与 7 裁决议案，留档审计） |
| `catalog/tools/materialize_catalog_pilot.py` | 输入契约更新：输出条目携带 review；REJECT fail-closed 跳过；R-D 检查项⑤与 R-C 检查项③改写；头部计数注释同步（UNIVERSAL 22/LANE 23） |

## 5. 验证记录

- **幂等**：物化脚本连续两次运行全 catalog 63 个 JSON 聚合 sha256 逐字节一致（`0f91daaf…`），幂等未破坏。
- **JSON 自检**：63 个 JSON 全部解析通过。
- **lock 对账**：60 entries 的 content_sha256 与落盘文件 0 mismatch；REJECT 17 条 0 泄漏进 lock。
- **引用核验**：82 条 review.ref 行号与报告实际行 82/82 命中对应 Checklist 行。
- **残留检查**：物化集中 `POLICY.TPL` 悬空引用 0 命中；lifecycle 全部保持 PROPOSED。

## 6. 留后续批次（登记，不在本批）

M5 两条同型知识合并为一条跨 lane 知识；M6 AUTHORITY 5→1+N Universal 模板上提；CLIENT_CHANGE_IMPACT 指针条款化改写；DRAFT_NOT_BASELINE 升 CONSTITUTION 诉求专项裁决；R-C templates/ 落点 + TEMPLATE. 前缀（V8）随 vocab-pr/GATE 收编；V1–V9 vocab-pr 正式执行。
