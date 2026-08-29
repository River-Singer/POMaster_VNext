# MIG-AUTH · MASTer tombstone 处置手册（TOMBSTONE-RUNBOOK）

> seq 锚：`MIG-AUTH-0001`（与 `AUTHORIZATION.md` 同一工作单元；迁移语境无全局
> seq 分配器，本锚记不伪造事件序号，kernel 接管后由事务重排）。
> 禁墙钟：本文档不写渲染/构建时间戳；日期仅作为散文出现。
> 适用对象：MASTer_master（`D:/Vscode Documents/MASTer_master`）。
> 授权事实 / 范围 / 账目 / 安全分类器异议记录：见文末交叉引用 `AUTHORIZATION.md`。

## 1. 现状速览

以下事实已由独立核验确认：

- 专分支 `migration/mig-b1-b2-tombstone`，单 commit `0a575b7`（parent = `4c40a11` = master HEAD）。
- 58 文件（18 registry + 40 screen-blueprints，均在 `outputs/frontend/10_planned/`）：
  每文件 15 行 FROZEN 注释头 prepend，正文零字节改动（全量核验过）。
- master 分支未动；未 push 任何远端；工作树干净。
- `.git/hooks/pre-commit` 冻结守卫**当前已激活**（本地 hook，不随分支走）：
  暂存含 FROZEN 标记的文件 → exit 1 拒绝并提示走 vNext；无标记文件零影响；
  文件头 13-14 行有卸载注释。

查看命令（可逐条复制，Git Bash / PowerShell 通用）：

```bash
git -C "D:/Vscode Documents/MASTer_master" branch --show-current
git -C "D:/Vscode Documents/MASTer_master" log --oneline -2
git -C "D:/Vscode Documents/MASTer_master" diff master..migration/mig-b1-b2-tombstone --stat
```

## 2. 接受迁移线

```bash
git -C "D:/Vscode Documents/MASTer_master" merge migration/mig-b1-b2-tombstone
```

- 行为说明：当前 master HEAD（`4c40a11`）正是 tombstone 分支单 commit 的 parent，
  因此该 merge 为 **fast-forward**——master 指针直接前移到 `0a575b7`，不产生
  merge commit，不新增历史节点。
- 守卫保持激活：`.git/hooks/pre-commit` 是本地 hook，不随分支与合并变化，
  接受迁移线后无需任何额外操作，守卫原样生效。
- 可选核验：`git -C "D:/Vscode Documents/MASTer_master" log --oneline -2`
  应显示 master 已到 `0a575b7`。
- 若 Owner 希望强制「只允许 fast-forward」（master 在此期间被移动过则拒绝而非
  产生 merge commit），可将命令改为 `git -C "D:/Vscode Documents/MASTer_master" merge --ff-only migration/mig-b1-b2-tombstone`。

## 3. 否决迁移线（一键回滚）

两步，各一条命令：

```bash
# 第 1 步：删除 tombstone 分支
git -C "D:/Vscode Documents/MASTer_master" branch -D migration/mig-b1-b2-tombstone

# 第 2 步：卸载 pre-commit 守卫
rm "D:/Vscode Documents/MASTer_master/.git/hooks/pre-commit"
```

（`rm` 适用于 Git Bash / PowerShell；若用 cmd 请改用 `del "D:\Vscode Documents\MASTer_master\.git\hooks\pre-commit"`。）

两步之后 MASTer_master 回到施工前原状——master 从未被移动（tombstone 全部改动
只存在于专分支上，删除分支即销毁全部改动），hook 是独立文件，删除即卸载。
这是结构性保证，不需要任何手工核对历史。

- 注：本节适用于尚未执行第 2 节 merge 的当前状态（master 仍在 `4c40a11`）；
  若已 merge 后再否决，回滚将涉及 master 历史操作，请 Owner 自行裁量。

## 4. 守卫日常说明

- **会被拒的操作**：暂存那 58 个带 FROZEN 标记的冻结文件并提交 → pre-commit
  exit 1 拒绝，并提示改走 vNext。
- **零影响的操作**：不涉及冻结文件的正常业务提交，hook 直接放行（exit 0），
  无任何额外开销。
- **为何不提供临时绕过**（如 `--no-verify`）：冻结文件代表已收编进 vNext 的
  旧治理事实，提供绕过即留下与 vNext 分叉重写旧事实的通道。需要写新事实时，
  请走 vNext `corpus/master/*/truth/objects/`，不要改动冻结文件。

## 5. 锚记纪律

- seq 锚：`MIG-AUTH-0001`（迁移语境无全局 seq 分配器，不伪造事件序号，
  kernel 接管后由事务重排）。
- 禁墙钟：本文档不写渲染/构建时间戳；日期仅出现在散文。

## 6. 交叉引用

- 授权事实 / 授权范围 / 施工协议 / 工作单元账目 / 安全分类器异议记录：
  `AUTHORIZATION.md`（同目录）。
- 渲染器砖 v0 明细：`prototypes/view-renderer/README.md`、`prototypes/view-renderer/fidelity-report.md`。
