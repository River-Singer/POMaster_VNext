# tiny-csv-tool（examples/，不入 pnpm workspace）

独立小项目：两个功能的 CSV 工具——

1. **解析**（`src/parse.js`）：RFC4180 状态机解析，同步产出五项 failure-pattern 机械检查
   （`quoted_delimiter` / `embedded_newline` / `escaped_quote` / `bom_encoding` /
   `trailing_delimiter`，与 `KNOWLEDGE.CSV_FAILURE_PATTERN` 的 checks 清单逐字对应）。
2. **序列化**（`src/serialize.js`）：正确引号转义（内部 `"` 翻倍、含分隔符/换行自动加引号）。

运行演示：

```bash
node index.js     # 解析→序列化→往返自检（= GRN-0001 的 CSV_ROUNDTRIP 探针）
```

## 定位

本目录是 **Phase C 八拍 Change Loop 演示的靶子**：一个有真实治理对象的最小消费项目。
`examples/` 不在 `pnpm-workspace.yaml` 的 `packages/*` 内，拥有自己的 `package.json`，
不参与根仓构建/测试（根 vitest 只收集 `tests/**` 与 `packages/**`）。

## .pomaster/ 治理样例目录

| 文件 | 形态契约 | 说明 |
|---|---|---|
| `truth/objects/capability/csv-tool.serialize-rows.json` | 02-object-envelope（kind=capability） | CAPABILITY.* 对象样例：realization=wired、capability↔file 键绑定、forbidden 禁两条反面教材 |
| `truth/keybindings/keybinding.code.csv-serialize-rows.json` | 04-keybinding（行对象） | KEYBINDING 绑定样例：capability_to_file、derived+mechanical ⇒ probe.result=matched（allOf 耦合） |
| `evidence/runs/GRN-0001.json` | 07-evidence-records（run_record，内嵌 03-gate-result） | TEST.* fixture 对象样例：subject_id=TEST.CSV.QUOTED_CELL 且 is_fixture=true（Q3 双向耦合；fixture 不污染生产分母） |
| `fixtures/quoted-cell.csv` | ——（演示资产，非治理对象） | GRN-0001 探针的输入样本 |

## 样例遵守的全局纪律

- **词表**：一切 id/枚举镜像 `vocab-lock@v0.2-resolved`（FROZEN；v0.1-resolved 2026-08-27
  冻结后经 2026-08-29 PR-0001 append-only 纯增量增补，本样例所用词值零改动）；测试域用
  `TEST.` 前缀（Q3 已决），无词表外值。
- **D24 哈希伦理**：样例零 sha256/digest 字段、零墙钟字段（时间住 evidence 平面
  `ran_at_utc` 位，本样例连它也省略）；人从未计算任何哈希。
- **幂等（A4）**：对象无 created_at/updated_at，只有事务分配的 `rev` / `last_run_seq`。
- **人类散文唯一入口**：叙事在 `notes_md`（02 信封），机器不解析其内容判卷。

## 已知待收编（TODO(vocab-pr)）

- `test-fixture` 对象族的 kind 值不在 `truth_bodies` 十类内（02b §14.2）——故 TEST.*
  fixture 对象样例按 07 evidence-plane run record 形态落盘（03/07 的 `is_fixture`
  语义是 Q3 裁决的既有词形），kind 登记后可复用 02 信封。
- KEYBINDING 行对象的物理落盘布局（control-plane 族目录约定）待 kernel store 布局
  PR 定谳；本样例取 `truth/keybindings/` 仅作演示。
