# corpus/master/views/ —— Human View 四视图（M5 投影产物）

> 本目录是 corpus truth 语料的**纯派生投影**（契约 `docs/p9-human-view-and-l5-contract.md` §1，
> 批次代号 `VIEW-M5`）：不是事实源——不写 store、不产生治理事实、不进 truth-index、
> 不分配 seq/rev；**永不作为任何 compiler/ingest 的输入**（消费方按此拒收）。
> 项目专名（Pinia / AG Grid / 页面名 / 端点名）按 §0.1 域规则如实保留。

## 文件与受众

| 文件 | 受众（本视图回答的 30 秒问题） |
|---|---|
| `executive-system-map.md` | Owner 与新会话 agent——这个项目是什么、有多大、治理健康如何 |
| `current-business-truth.md` | 业务 Owner——系统对外呈现哪些业务能力、各自处于什么就绪状态 |
| `technology-baseline.md` | 工程/架构——现在技术面长什么样、受哪些约束 |
| `known-debt.md` | Owner 与维护者——系统欠什么、哪些绿灯带盲区、哪些事挂在案头（不粉饰视图） |
| `build-manifest.json` | 机器/审计——`inputs_fingerprint`、逐视图行数/sha256/citation 计数、显式缺席登记 |
| `README.md`（本文件） | 静态人类说明；**非编译器产物**，不参与 byte-stable 比对 |

## 再生产方式

```bash
python corpus/master/tools/build_human_views.py          # 生成/更新（幂等：同输入零写入短路）
python corpus/master/tools/build_human_views.py --check  # 双跑 byte-stable 证明 + 不变量自检 + 现盘 drift 检查
```

- 输入（全部只读）：五批 `truth/objects/**`、`gate-runs/**`、`inventory.yaml`、
  `authority.json`、`classification-ledger.yaml`、batch-3 三份 pending 登记、
  `batch-1/calibration/`、各批 README/CONVENTIONS 的语义注记（消费文件集与逐文件
  sha256 指纹见 manifest `inputs_fingerprint`）。
- 确定性纪律：零墙钟（产出无日期字段）；确定性排序与序列化；同输入双跑 byte-stable；
  staged write（`.tmp` + `os.replace`）；计数恒等式 fail-closed（合计 ≠ 分母枚举即拒绝产出）。
- **禁止手工编辑四视图与 manifest**：编辑无效，重建即覆盖。要改事实 → 改语料，视图随之重建；
  退出判据 = 删掉本目录重生成 diff=0。

## 谱系约定

- 行内 citation：`[SRC: ` + 引用 + `]`，文法四形态（契约 §1.5，闭世界校验）：
  1. truth 对象：`MIG-B1/truth/objects/contract-op/authenticate.1.json#API_REQ.AUTHENTICATE.1`
  2. gate-run（grn 为主锚）：`MIG-B1/gate-runs/contract/GTR-MIG-B1-03-implementation-honesty.json@GRN-0003`
  3. 登记文件键路径：`MIG-B3/pending-registrations.business-rule-registry.yaml#denominator.identity`
  4. 校准/README 锚：`MIG-B1/calibration/proposed-thresholds.json#status`、
     `MIG-B1/README.md#挂Owner裁决（不擅自修）@GRN-4101`
- 内置不变量（编译器 `--check` 断言，违者编译失败）：每节 ≥1 条 citation；一切数字
  （计数/分母/ratio）逐条同行挂锚；citation 可解析率 100%。
- 「语料未覆盖」= 显式留白（缺席 ≠ 通过），并同步登记进 manifest `explicit_absence`；
  转引语料内中文语义注记一律逐字加引号挂锚，禁止转述弱化；known-debt 禁止把 failed
  洗成中性表述、禁止省略 escape_ratio、禁止把 PROPOSED 写成已生效。
