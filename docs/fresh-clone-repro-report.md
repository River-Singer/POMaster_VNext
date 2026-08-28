# Fresh-Clone 复现实测报告 —— catalog-lock 出口判据④验证

> **seq**: CLONE-0001（A4：无墙钟日期，seq 代号锚定）　**性质**：判据④「catalog-lock v1 发布且 fresh clone 可复现治理行为」的**后半句实测**——全部结论出自系统临时目录内干净 clone 的真实命令输出，非主库工作区复述
> **对象**：`git clone --no-local` 本库至 `%TEMP%\pomaster-clone-repro\repo`（真传输非硬链接；HEAD `512ff0cf982e90908788c87dd425b642c88714b6`「八拍命令载体补全（G1-G4+G6）+ L4 对抗 Eval 25 例 + 棘轮 466→588」，工作区 clean）
> **诚实分账**：判据前半句（catalog-lock **v1 正式发布**）不在本轮范围——库内 lock 仍为 `catalog-lock.draft.json` / `catalog_version=0.1.0-pilot` 草案形态；本报告只实测后半句「fresh clone 可复现」
> **结论速览**：**catalog 侧复现成立**（60 entries 逐条 sha256 对账 0 mismatch；物化脚本重跑后工作区与 HEAD 零差异）；**node 侧可复现**（frozen-lockfile 安装成功、vitest 588 全绿、CLI 可跑、doctor 四态行为如实）——唯一阻断为 corepack 签名校验坏（环境项，类 G7，已按预案 fallback 闭合，产品代码零改动）
>
> **纪律声明**：
> - 未执行任何 git 写操作（clone 只读源库）；FROZEN 资产零触碰；本文件是本轮实测在仓库内的唯一落盘产物；
> - 临时目录（`%TEMP%\pomaster-clone-repro\`）内含对账脚本 `verify_catalog_repro.py`、物化 stdout、前后快照与 CLI 捕获件，均不入库；本轮结束临时目录可整体删除，不影响任何结论；
> - 本机 PATH 含游离引号（G7），每条 shell 调用前以 `PATH="$(printf '%s' "$PATH" | tr -d '"')"` 消毒——产品代码零改动。

---

## 0. 预置事实

- 库内既有资产：`catalog/tools/materialize_catalog_pilot.py`（物化器：读 `catalog/candidates/candidates-draft.json`，写 `catalog/{policies,knowledge,gates}/<id小写>.json` 60 件 + `catalog/catalog-lock.draft.json` read-side 指纹）与 lock 草案（60 entries：45 POLICY + 10 KNOWLEDGE + 5 GATE）。
- catalog/ 全目录 66 文件 = 60 产物 + candidates 2（输入+rejected 归档）+ lock 1 + projection-presets 1 + tools 2。
- 对账口径四层：
  - **A 层（核心）**：lock.entries 逐条 `content_sha256` ↔ 物化后工作区文件 sha256；
  - **B 层**：物化后工作区文件 ↔ `git cat-file blob HEAD:…` 字节（提交态仓库内容 ≡ 脚本重跑输出）；
  - **C 层**：lock 文件自身重跑前后 byte-stable；
  - **D 层**：产物目录实有文件 ↔ 60 entries 双向对齐（不多文件、不少条目）。
- 换行口径：clone 检出与 git blob 均为 LF（od 抽验 `policy.spec.metadata_required.json` 一致），字节级对账无 CRLF 干扰。

## 1. 执行序列与退出码

| # | 阶段 | 命令（临时目录内执行） | 退出码 | 结果 |
|---|---|---|---|---|
| 1 | clone | `git clone --no-local <本库> %TEMP%\pomaster-clone-repro\repo` | 0 | HEAD `512ff0cf…`，status clean |
| 2 | 物化前快照 | `python verify_catalog_repro.py snapshot <repo>` | 0 | 66 文件 sha256 |
| 3 | 物化第 1 跑 | `PYTHONIOENCODING=utf-8 python catalog/tools/materialize_catalog_pilot.py` | 0 | stderr 空 |
| 4 | 物化后快照 + diff | snapshot → `diff pre post` | 0 | **66 文件逐字节全同** |
| 5 | lock 对账 | `python verify_catalog_repro.py verify <repo>` | 0 | verdict=**REPRODUCED**（见 §2） |
| 6 | 物化第 2 跑（幂等） | 同 #3 → 对比 lock sha 与 stdout | 0 | **lock sha 两跑全同**（`bcb06ce9…`），stdout 全同 |
| 7 | 物化后总检 | `git status --short` | 0 | **空**（重跑产物 ≡ HEAD，含 lock 自身） |
| 8 | corepack 路径 | `corepack pnpm --version` | 非 0 | **签名校验坏**（阻断项 B1，见 §5） |
| 9 | 安装（fallback） | `npm exec --yes pnpm@9.15.9 -- install --frozen-lockfile` | 0 | 157 包，5.4s |
| 10 | 全量测试 | `./node_modules/.bin/vitest run` | 0 | **Test Files 33 passed (33)，Tests 588 passed (588)** |
| 11 | 构建 | `npm run build` | 0 | `ok: schemas, kernel, gauntlet-lite, cli` |
| 12 | CLI 帮助 | `node packages/cli/dist/bin.js --help` | **1** | help 全文输出，但见发现 N1 |
| 13 | CLI 探针 | `node packages/cli/dist/bin.js doctor --json`（clone 根） | 1 | MISSING_CONFIGURATION ×2（fail-closed 诚实，见 §3.3） |
| 14 | CLI 探针（沙箱） | `--dir %TEMP%\pomaster-clone-repro\sandbox init --json` → `doctor --json` | 0 / 1 | init CREATED → kernel 探针转 READY；chrome MCP 保持 MISSING |

## 2. catalog 侧复现（Python，无 node 依赖）——成立

Python 3.14.4（Windows 原生），`PYTHONIOENCODING=utf-8`，对账脚本仅用标准库 json/hashlib/subprocess。

### 2.1 A 层：lock 逐条对账 —— 0 mismatch

```text
$ python verify_catalog_repro.py verify <repo>
{
  "lock_entries": 60,
  "entries_sorted_by_id": true,
  "paths_unique": true,
  "mismatches": [],        ← 60/60 content_sha256 全部命中
  "missing_files": [],     ← lock 无悬空条目
  "extra_files": [],       ← 产物目录无 lock 外文件
  "blob_diffs": [],        ← 60/60 与 HEAD blob 字节一致
  "covered_product_files": 60,
  "verdict": "REPRODUCED"
}
```

分目录计数：policies 45 + knowledge 10 + gates 5 = 60，与 lock 三段一致；entries 按 id 排序、path 唯一。

### 2.2 B 层：提交态 ≡ 重跑输出 —— git status 空

物化脚本对 60 个产物与 lock **全部重写**之后，`git status --short` 为空——重写内容与 HEAD 存储对象逐字节相同。fresh clone 的「下载到的字节」与「脚本从 candidates 输入再算出的字节」完全一致，即 **catalog 产物链（candidates → materialize → lock）在干净环境可复现**。

### 2.3 C 层：幂等 —— 双跑 byte-stable

```text
lock sha256 第 1 跑后：bcb06ce92bd5c28a2d5eac9a3cca1d0eb45b2469b8698082658468231a02b1cd
lock sha256 第 2 跑后：bcb06ce92bd5c28a2d5eac9a3cca1d0eb45b2469b8698082658468231a02b1cd   ← 全同
stdout 两跑 diff = 空（统计输出确定性；无墙钟字段）
```

（同值与主库工作区 `catalog/catalog-lock.draft.json` 的 sha256 逐字节一致——clone 与主库同源同态。）

**结论：catalog 侧复现成立（0 mismatch）。**

## 3. 治理行为复现（node 侧）——成立（含一项环境阻断的 fallback 闭合）

### 3.1 安装

- 官方路径 `corepack pnpm`（packageManager 声明 pnpm@9.15.9）：**失败**——corepack 0.30.0 签名校验坏 `Cannot find matching keyid`（registry 签名 key 已轮换为 `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`，corepack 内置 keys 表无此 keyid）。定性：**环境阻断项 B1**（类比 phaseD 的 G7——环境旧物，非产品缺陷），详见 §5。
- 按预案 fallback：`npm exec --yes pnpm@9.15.9 -- install --frozen-lockfile` → **exit 0**，resolved 157 / added 157，`vitest 2.1.9` 等版本与 pnpm-lock.yaml 逐条一致（frozen 语义成立）。

### 3.2 全量测试 —— 588 全绿

```text
$ ./node_modules/.bin/vitest run
 Test Files  33 passed (33)
      Tests  588 passed (588)
   Duration  6.17s          → exit 0
```

与 benchmarks 附录 C 记录的「33 files / 588 tests」逐字一致——测试谱系在 fresh clone 完整复现。

### 3.3 CLI 与 doctor 四态行为

`npm run build` exit 0（schemas, kernel, gauntlet-lite, cli）后：

| 命令 | 实测 | 判读 |
|---|---|---|
| `pomaster --help` | help 全文输出（八拍命令面完整），**exit 1**，stderr 尾行 `pomaster: (outputHelp)` | 发现 N1（产品行为，见 §5） |
| `pomaster doctor --json`（clone 根，无 store） | ok=false，probes：kernel_doctor_probes=**MISSING_CONFIGURATION**、chrome_devtools_mcp=**MISSING_CONFIGURATION**，双 hint 给处置路标，exit 1 | fresh clone 的「什么都没配」被如实标 **not_configured 而非假绿**——四态纪律复现 |
| `--dir <沙箱> init --json` → `doctor --json` | init ok=true change=**CREATED**；kernel_doctor_probes 随 store 创建转 **READY**；chrome MCP 仍 MISSING_CONFIGURATION；doctor 整体 ok=false exit 1 | 探针状态机对真实状态变化正确响应；任一 MISSING 即不绿（fail-closed）；沙箱建在临时目录，clone 工作区零污染（事后 status 仍 clean） |

**结论：node 侧治理行为复现成立**（安装/测试/构建/CLI/doctor 状态机全链路可跑且行为诚实），阻断项仅 corepack 一处且已被 fallback 闭合。

## 4. 纪律专项核对

| 纪律 | 本轮实证 |
|---|---|
| D24 哈希伦理 | lock 的 sha256 全部由物化脚本与对账器产出，人只读不算；对账为纯读（verify 模式零写入）；全程无「告警拦写」场景引入 |
| A4 确定性 | 物化 stdout 两跑全同、lock 两跑 sha 全同、pre≡post 66 文件字节全同；无墙钟字段 |
| NO_CHANGE 合法出口 | 重跑后 git status 空 = 幂等重生成零 diff（同一纪律的文件级镜像） |
| 四态纪律 | doctor 对未配置项报 MISSING_CONFIGURATION（非 passed）且 exit 1；probe 随 init 真实转 READY |
| 阻断不掩盖 | corepack 签名失败原文捕获并记录（§5 B1），以预案 fallback 闭合而非绕过静默 |
| MASTer_master 只读 | 本轮未触碰 MASTer_master 目录 |

## 5. 阻断项与发现（如实列表）

| # | 类型 | 内容 | 定性与处置 |
|---|---|---|---|
| B1 | 环境阻断（类 G7） | corepack 0.30.0 对 pnpm 的签名校验坏：`Error: Cannot find matching keyid`——npm registry 签名 key 轮换后，旧 corepack 内置公钥表不含新 keyid `SHA256:DhQ8…` | 环境旧物，非产品缺陷。按任务预案以 `npm exec --yes pnpm@9.15.9`（与 packageManager 精确同版）闭合；产品代码零改动。升级/重配 corepack 或设 `COREPACK_INTEGRITY_KEYS` 均属环境侧修复，本轮不代做 |
| N1 | 产品侧行为（如实记录，不定性为缺陷） | `pomaster --help` 退出码 1：commander 的 help 请求以异常形态抛出，落入 `runCli` 的 UNEXPECTED_ERROR 兜底 catch（`packages/cli/src/index.ts` §runCli），stderr 附加 `pomaster: (outputHelp)`。help 文本本身完整输出 | fresh clone 与主库同代码同行为（本轮即在该代码上复现）；「用户要看帮助」与「意外错误」共用退出码 1，或值得后续批次把 help/用法类请求区分为 exit 0 的显式出口 |
| N2 | 执行细节（非产品） | Windows 原生 Python 不识别 Git Bash 的 `/tmp` 路径（映射歧义），对账脚本改以 `cygpath -w` 显式 Windows 路径传参 | 仅影响临时目录内工具调用方式，不影响任何结论 |

## 附录：环境

- git clone：`--no-local`（走打包传输，规避硬链接共享）；HEAD `512ff0cf982e90908788c87dd425b642c88714b6`；clone 后工作区 clean，对账全程零 git 写操作。
- Python 3.14.4（`PYTHONIOENCODING=utf-8`；物化器零第三方依赖）；node v22.13.1；npm 11.13.0；corepack 0.30.0（B1 阻断）；实际安装 pnpm 9.15.9（npm exec，157 包）。
- 临时目录：`%TEMP%\pomaster-clone-repro\`（含 `repo\`、`verify_catalog_repro.py`、`pre/post_snapshot.json`、`materialize_run{1,2}.stdout.txt`、`verify_result.json`、`cli_help.txt`、`cli_doctor.json`、`sandbox_*` 捕获件；内容不拷回，仅路径记录）。
- 主库侧本轮唯一落盘产物：本报告文件。

---

*报告生成：fresh-clone 复现实测（判据④后半句；catalog 对账器四层口径见 §0；全部数字出自真实命令 stdout/退出码）。*
