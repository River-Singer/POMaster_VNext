# ops/ — Owner 运维操作指引（AI 不改远端）

> 定位：本目录存放**需要 Owner 在远端（GitHub / npmjs.com）手工执行**的操作脚本与指引。
> 战役宪法：AI 不擅自改远端 GitHub/npmjs 配置——本目录产物 = 机器可判的脚本 + 人工 runbook，
> 均为纯产出物：**不进 CI、不由测试执行**（脚本内的 `gh api` 只在 Owner 手工运行时触达远端）。

## 当前清单

| 文件 | 用途 | 对应任务 |
|---|---|---|
| `main-ruleset-apply.sh` | main 分支 ruleset 应用（required checks + 禁直推；dry-run/apply 分离） | T4 R2 |
| `main-ruleset-verify.sh` | ruleset 验证（配置在座性逐项判卷 + check 名核对 + 回滚取 id） | T4 R2 |
| `npm-trusted-publishing-closeout.md` | npm TP 收尾手查 2 项（disallow tokens + 吊销遗留 token） | T4 R1 附属 |

## R2：main ruleset 操作流程（一次性）

### 0. 前置

```bash
winget install GitHub.cli   # gh CLI 缺席时（研究步受阻项 B-2 的解锁动作）
gh auth login               # 登录并对 River-Singer/POMaster_VNext 有 admin 权限
```

### 1. 核对 required check 名（fail-closed 核对步，必做）

```bash
bash ops/main-ruleset-verify.sh --list-checks
```

输出 = main 最新 commit 的真实 check-run 名。与 `ops/main-ruleset-apply.sh` 顶部
`REQUIRED_CHECKS` 数组**逐字**核对（默认值按 ci.yml 形态推导：三 OS matrix 腿
`ci (<os>)` + `bootstrap-clean`）；不一致就改数组（apply 与 verify 两处同步）。

### 2. dry-run（零远端写入，默认模式）

```bash
bash ops/main-ruleset-apply.sh --dry-run
```

打印将提交的 API 调用与完整 JSON 体。语义速览：

- `required_status_checks`：main 上的合并必须四条 check 全绿（三 OS CI 腿 + bootstrap-clean）；
- `pull_request` 规则（0 个必需批准）：**一切变更必须经 PR 落 main——直推对所有角色
  （含管理员）一律被拒**，Owner 自合 PR 即可快速落变更；
- `deletion` + `non_fast_forward`：防删分支、防强推；
- `bypass_actors`：Repository admin 仅在 **PR merge 通道**可旁路（`bypass_mode=pull_request`）——
  直推不豁免。

### 3. apply（幂等；同名 ruleset 在座则就地 PUT 更新，不堆并行规则）

```bash
bash ops/main-ruleset-apply.sh --apply
bash ops/main-ruleset-verify.sh        # 全量验证：逐项 PASS 才算落地
```

### 4. 演练（验收「main 直推被拒」的实弹断言；一次性）

```bash
git commit --allow-empty -m "drill: ruleset should reject direct push"
git push origin main        # 期望：被拒（GH 系 ruleset 拒绝报错，非绿通过）
git reset --hard HEAD~1     # 本地清理 drill commit（远端从未收到）
```

期望输出含拒绝信息（`remote: error: GH0xx` 或 ruleset 字样）。若 push 意外成功，
立即 `git push origin HEAD~1:main` 回退远端指针，并重查 ruleset enforcement。

### 5. 回滚路径

```bash
bash ops/main-ruleset-verify.sh --list                     # 取 ruleset id
gh api -X DELETE repos/River-Singer/POMaster_VNext/rulesets/<id>   # 整体删除（彻底回滚）
# 软回滚（保留配置、暂停生效——排查期用）：
gh api -X PUT repos/River-Singer/POMaster_VNext/rulesets/<id> \
  --input - <<< '{"name":"main-protected","target":"branch","enforcement":"disabled",
  "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
  "bypass_actors":[],"rules":[]}'
```

> 注：PUT 全量替换语义——软回滚会清空规则体；恢复时重跑 `--apply` 即还原（脚本幂等）。

### 6. 可选加固（research 方案 D 加分项，未含在脚本内）

`v*` 发布 tag 的 ruleset（Restrict creations/updates/deletions）：research/github-release-gating.md
建议同批配置（成本低、防误建/误删发布 tag）。端点同上（`target: "tag"`，`conditions.ref_name.include:
["refs/tags/v*"]`）。因 rule 参数形态（`creation` 的 allowed_actors）需以当前 API 实况为准，
此项留 Owner 按 `--dry-run` 同款流程人工核对后再建——不在本任务机器断言面内。

## R1 附属：npm TP 收尾

见 [`npm-trusted-publishing-closeout.md`](./npm-trusted-publishing-closeout.md)——
Owner 登 npmjs.com 手查 2 项（Publishing access 切 disallow tokens + 吊销 0.1.0 时代遗留 token）。

## 发布（tag 演练）交接

发布动作本身由 Owner 按既有发布 SOP 执行（两处 POMASTER_VERSION 对齐 + notices 同步前置 +
`git tag vX.Y.Z && git push origin vX.Y.Z`）。R1 改造后的机器语义：tag push → 同 run 内
CI（三 OS + bootstrap-clean）全绿 → publish（npm ≥ 11.5.1 闸 + tag↔version 一致性闸 +
OIDC 发布）。**publish run 一定开始于 CI 全绿之后**（needs DAG 结构保证 + run 内防御性断言步）；
首次 tag 演练时在 Actions 页核对两个 job 的时间顺序即为验收。
