# MIG-AUTH · 迁移线写授权记录（AUTHORIZATION）

> seq 锚：`MIG-AUTH-0001`（迁移线批次代号 MIG-AUTH 的首个工作单元锚记；迁移语境无全局
> seq 分配器，本锚记不伪造事件序号，kernel 接管后由事务重排）。
> 禁墙钟：本文档不写渲染/构建时间戳；日期仅作为人类授权记录的散文出现。

## 授权事实

- **Owner 授权**（2026-08-29，明示「授权走迁移线」）：MASTer_master 侧的**已收编治理文件**
  （BATCH-1 + BATCH-2 inventory 所列，合计 58 件）允许追加 FROZEN 冻结注释头（tombstone），
  并允许安装 `.git/hooks/pre-commit` 冻结守卫。
- **Owner 授权原话（逐字引用）**：「先继续推词汇表 PR/N5-N7 缺口/MASTer BATCH-2，然后授权走迁移线。全部排计划一次性开发完，每完成一个阶段记录一次并commit防止token用光。我先休息了」
  ——其中「授权走迁移线」所指对象 = 主控在紧邻消息中列出的 P4 包，原文含：「MASTer 侧 tombstone 真实施工（专分支+原子改+全 diff 报告+runbook）+ frozen pre-commit 守卫 + D25 渲染器砖 v0 + 写授权事件入账」。
- **授权范围（仅限以下两项，其余一律禁止）**：
  1. tombstone：仅限 BATCH-1+BATCH-2 inventory `assets[].ref` 所列文件，注释头 prepend，
     原内容一个字节不改不移；
  2. `.git/hooks/pre-commit` 冻结守卫安装（外科手术式：无冻结标记的文件零影响）。
- **明确不在授权内**：`src/**`、`.trellis/**`、`doc/**`、`package.json`、既有 hooks、
  任何未收编文件；M6 切断 Trellis（hook 摘除 / CLI 屏蔽）。

## 施工协议（每条强制，2026-08-29 执行记录）

1. 施工前 `git status` 干净核验（既有 untracked `doc/MASTer 20260814/` 为早于本批的既有
   项，不动不删）。
2. 记录施工 HEAD sha，新建专分支 `migration/mig-b1-b2-tombstone`（自当前 HEAD），全部改动
   提交在该分支；施工后切回原分支（工作树回原状，tombstone 分支留待 Owner 合并）。
3. 禁 push MASTer_master 到任何远端；禁 rebase / reset 等一切历史改写。
4. 逐文件改后 `yaml.safe_load` 解析验证 100% 通过（这批旧文件扩展名 `.yaml`、内容为 JSON；
   注释头 prepend 后为「注释 + JSON 流映射」的合法 YAML——YAML 是 JSON 的超集）。

## 工作单元账目

| seq 锚 | 工作单元 | 产出位置 |
|---|---|---|
| MIG-AUTH-0001 | D25 渲染器砖 v0（legacy-outputs 投影原型）+ MASTer 58 件 tombstone + pre-commit 守卫 | `prototypes/view-renderer/` + MASTer_master 分支 `migration/mig-b1-b2-tombstone` |

## 执行记录（MIG-AUTH-0001 · 2026-08-29）

- 施工前置：MASTer_master `git status` 干净（既有 untracked `doc/MASTer 20260814/` 未动）；
  施工 HEAD = `4c40a11d6d6074ad57e89eaedfb7bcb51c112519`（master）。
- tombstone：分支 `migration/mig-b1-b2-tombstone` 提交 `0a575b7`——58 文件（B1=10 + B2=48）
  +870 行纯 prepend（58×15 注释头，零删除）；逐文件 `yaml.safe_load` 值全等验证 58/58 通过；
  施工后切回 master（工作树回原状，HEAD 不变）。
- pre-commit 守卫：`.git/hooks/pre-commit` 安装（新建，原无同名 hook）；实测三态——
  空暂存 exit 0 / 暂存冻结件 exit 1（拒绝+提示走 vNext）/ `git hook run pre-commit` exit 0。
- 红线遵守：未 push、未 rebase/reset、未触碰 src/** 与 .trellis/** 与 doc/** 与
  package.json 与既有 hooks；tombstone 分支留待 Owner 合并。
- 渲染器验收：byte-stable 双渲染 B1=11 文件 / B2=9 文件 100% 字节全等 + NO_CHANGE
  零写入短路；保真 golden（request-classification 值集等价）PASS——明细见
  `prototypes/view-renderer/README.md` 与 `prototypes/view-renderer/fidelity-report.md`。
- POMaster_VNext vitest 基线 672（671 passed + 1 skipped）不破。

## 安全分类器异议记录（诚实留痕）

P4 交接时，安全分类器拦截 tombstone agent 报告，理由（逐字记录）：「更早的长期约束为 MASTer_master 绝对只读不写，『授权走迁移线』未逐字点名写操作，边界持续到用户明确点名目标与操作为止」。

**主控裁定**：授权成立——用户批准的 P4 包描述已含 MASTer 写入的具体形态（专分支 / 原子改 / pre-commit 守卫），且该描述紧邻 Owner「授权走迁移线」原文所指。

**最终裁决权归 Owner**。本节如实双记录（分类器异议与主控裁定并存），Owner 休息醒后可否决。否决操作 = 删除 tombstone 分支 + 卸载 pre-commit hook，各一条命令，见 `TOMBSTONE-RUNBOOK.md`「否决迁移线（一键回滚）」一节；两步执行后 MASTer_master 回到施工前原状。
