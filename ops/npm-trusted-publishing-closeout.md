# npm Trusted Publishing 收尾清单（Owner 手查 2 项）

> 来源：任务 research/npm-trusted-publishing.md（2026-09-08 联网核实，npm 官方文档 2026-09-04 口径）。
> 结论：pomaster 已在用 Trusted Publishing（OIDC 零凭据），0.5.1 provenance 已在线上实证——
> 本清单是**加固收尾**，不是迁移。AI 不代操作 npmjs.com（配置只在 web 端管理，无 CLI 替代），
> 以下两项须 Owner 登录 npmjs.com 手工完成。

## 已由本仓（T4 R1）完成的机器侧项

- [x] publish.yml 机器闸 `npm >= 11.5` → `>= 11.5.1`（对齐官方文档口径；semver 逐段比较，11.5.0 不放行）。
- [x] workflow 门控改造（publish 等 CI 全绿）不影响 npmjs 侧 TP 配置——npm 校验的是「调用方
      workflow 名」，publish 步仍住 publish.yml（调用方向 = publish.yml → ci.yml），workflow
      filename 配置值 `publish.yml` 不变。

## Owner 手查 1：Publishing access 切「disallow tokens」

1. 登录 https://www.npmjs.com → 进入 `pomaster` 包页 → **Settings**；
2. 找到 **Publishing access** 区，从默认档切换为
   **「Require two-factor authentication and disallow tokens」**
   （锁死传统 token 发布通道——TP OIDC 发布不受影响，granular/automation token 从此不能发布此包）；
3. 保存。注意（官方文档口径）：pomaster 的 TP 配置建于 2026-09-02（属 2026-09-03 前「创建」档），
   下次编辑该 Trusted Publisher 配置时 npm 会要求**显式选至少一个 allowed action**——保留
   「npm publish」即可。

## Owner 手查 2：吊销 0.1.0 时代遗留 token

背景：npm 上 0.1.0（2026-09-01）发布早于 publish.yml（2026-09-02 引入 TP）一天，按当时会话记录为
手工发布——凭证机制无法本地证实，推定为 Owner 本机 token 或交互登录。该 token 若仍存活，即是一条
绕过 TP 通道的持久写权限路径。

1. npmjs.com → 右上头像 → **Access Tokens**；
2. 清点存量 token：重点看 **Granular Access Token / Automation / Classic（Publish）** 中创建于
   2026-09-01 前后、至今未用的条目；
3. 逐个确认无下游依赖后 **Delete/Revoke**：
   - 依赖自查：本机 `~/.npmrc` 是否存有 `//registry.npmjs.org/:_authToken=...`（0.1.0 手工发布所留）；
     如有，先删除该行（0.1.0 之后全部版本已走 CI TP，零本地发布需求）；
   - granular token 有官方强制过期上限（2025 末收紧），但「过期前仍可写」——不等过期，直接吊销；
4. 吊销后验证：本机执行 `npm whoami`（期望匿名/未登录态，或至少无 publish 权限）；
   CI 侧下一次 tag 发布照常走 OIDC 即为终极回归。

## 可选（非本任务范围，登记备查）

- **staged publishing**（`npm stage publish` + 人工 `npm stage approve`，TP 配置可限 stage-only）：
  「CI 全绿后人工确认才公开」的官方第二闸——与 workflow 门控（R1）正交，如需仪式感可后续评估。

## 完成登记

- [ ] 手查 1 完成（Publishing access = disallow tokens）
- [ ] 手查 2 完成（0.1.0 时代 token 吊销 + 本机 ~/.npmrc token 行清除）
- [ ] 完成后在本文件勾选并留日期
