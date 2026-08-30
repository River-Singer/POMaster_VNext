/**
 * fixture-vue3-project.spec.ts —— P16 L2 fixture ②：Vue3 工程全链。
 *
 * 技术栈形态：Vue3 前端工程（package.json 声明 vitest/vue/vite + vite.config.ts +
 * index.html + src/main.ts + src/App.vue + 组件），**不做 npm install**——fixture
 * 验证的是 pomaster 对工程形态的治理链，不是第三方栈自身构建。
 *
 * 与 git-repo fixture 的判卷差异面：
 * - triage 文本命中契约升档词 → STANDARD（E_CONTRACT_KEYWORD，matched 保序）；
 * - lane=frontend；锚 TASK.V0001 → PERMIT.TASK_V0001.*；
 * - BUILD 腿：vitest 依赖已声明 → detect READY → **真实执行** `corepack pnpm exec
 *   vitest run --reporter=json`（无 node_modules 必然不可判卷）→ verdict=not_run
 *   非绿非红（P12 缺席显式语义在 BUILD 腿的实跑形态，status=READY 非 NOT_INSTALLED）。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  envelopeOf,
  journalEvents,
  runFixtureChain,
  runJsonStep,
  truthIndexBytes,
  type FixtureChain,
  type StepRecord,
} from "./fixture-chain-lib.js";

const TASK_ID = "TASK.V0001";
const CHANGE_OR_TASK = TASK_ID;
const REQUEST = "Vue3 表单组件契约字段调整：props 校验与跨域 emit 声明";
const ACTOR = "agent:fixture-vue3";
const ROLE = "frontend";
const OPS_FILE = "tx.task.json";

let root: string;
let chain: FixtureChain;
/** 链前幂等窗口（state 零变化时连续两次 init——A4 断言的真实时点）。 */
let initFirst: StepRecord;
let initReplay: StepRecord;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-fixture-vue3-"));
  mkdirSync(join(root, "src", "components"), { recursive: true });
  // —— 就地构造 Vue3 最小工程（声明依赖但不安装） ——
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "vue3-admin-fixture",
        version: "0.1.0",
        private: true,
        scripts: { build: "vite build", test: "vitest run" },
        dependencies: { vue: "3.5.12" },
        devDependencies: { vite: "5.4.10", vitest: "2.1.8" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "vite.config.ts"),
    [
      "import { defineConfig } from 'vite';",
      "import vue from '@vitejs/plugin-vue';",
      "export default defineConfig({ plugins: [vue()] });",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n',
    "utf8",
  );
  writeFileSync(
    join(root, "src", "main.ts"),
    "import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');\n",
    "utf8",
  );
  writeFileSync(
    join(root, "src", "App.vue"),
    "<template><StatCard :value=\"42\" /></template>\n<script setup lang=\"ts\">\nimport StatCard from './components/StatCard.vue';\n</script>\n",
    "utf8",
  );
  writeFileSync(
    join(root, "src", "components", "StatCard.vue"),
    "<template><span class=\"stat\">{{ value }}</span></template>\n<script setup lang=\"ts\">\ndefineProps<{ value: number }>();\n</script>\n",
    "utf8",
  );

  // 链前幂等窗口：state 零变化时的两次 init（A4 NO_CHANGE 的合法时点）。
  initFirst = await runJsonStep(root, ["init"]);
  initReplay = await runJsonStep(root, ["init"]);

  chain = await runFixtureChain(root, {
    changeOrTask: CHANGE_OR_TASK,
    request: REQUEST,
    subject: TASK_ID,
    actor: ACTOR,
    role: ROLE,
    opsFile: join(root, OPS_FILE),
  });
}, 240_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** StepRecord → 非 null 信封（不可解析即显式红）。 */
function env(rec: StepRecord) {
  return envelopeOf(rec);
}

/** 信封 result 窄化。 */
function resultOf(rec: StepRecord): Record<string, unknown> {
  return (env(rec).result ?? {}) as Record<string, unknown>;
}

// ============================================================
// fixture 工程形态与 init（BOOTSTRAP）
// ============================================================

describe("fixture 形态与 init（Vue3 工程）", () => {
  it("就地构造自检：Vue3 工程文件齐备（SFC/入口/配置），init 后与 .pomaster 共存", () => {
    for (const rel of [
      "package.json",
      "vite.config.ts",
      "index.html",
      "src/main.ts",
      "src/App.vue",
      "src/components/StatCard.vue",
    ]) {
      expect(existsSync(join(root, rel)), `${rel} 应在场`).toBe(true);
    }
    expect(existsSync(join(root, ".pomaster", "state", "truth-index.json"))).toBe(true);
  });

  it("init exit 0：信封 ok=true、command=init、change=CREATED（首次 BOOTSTRAP）", () => {
    const rec = initFirst;
    expect(rec.code).toBe(0);
    const envelope = env(rec);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("init");
    expect(resultOf(rec)["change"]).toBe("CREATED");
  });

  it("init 骨架关键件在场：truth-index / authority（BOOTSTRAP owner）/ AGENTS.md 轻入口", () => {
    expect(existsSync(join(root, ".pomaster", "state", "truth-index.json"))).toBe(true);
    const authority = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "authority.json"), "utf8"),
    ) as { authorities: Record<string, unknown> };
    expect(Object.keys(authority.authorities)).toContain("BOOTSTRAP_OWNER");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });

  it("init 幂等（链前窗口）：state 零变化重跑 change=NO_CHANGE、产物全 unchanged（A4）", () => {
    const rec = initReplay;
    expect(rec.code).toBe(0);
    const result = resultOf(rec);
    expect(result["change"]).toBe("NO_CHANGE");
    const files = (result["files"] ?? []) as Record<string, unknown>[];
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f["action"] === "unchanged")).toBe(true);
  });

  it("链后重跑 init：state 已变 → UPDATED（轻入口状态速览诚实跟随，非静默跳过）", async () => {
    const rerun = await runJsonStep(root, ["init"]);
    expect(rerun.code).toBe(0);
    expect(resultOf(rerun)["change"]).toBe("UPDATED");
    const files = (resultOf(rerun)["files"] ?? []) as Record<string, unknown>[];
    expect(files.some((f) => f["action"] !== "unchanged")).toBe(true);
  });
});

// ============================================================
// 八拍① triage
// ============================================================

describe("八拍① triage（Vue3 工程）", () => {
  it("triage exit 0：契约升档词命中 → STANDARD（E_CONTRACT_KEYWORD）", () => {
    const rec = chain.triage;
    expect(rec.code).toBe(0);
    const envelope = env(rec);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("triage");
    const result = resultOf(rec);
    expect(result["profile"]).toBe("STANDARD");
    expect(result["matched_rule"]).toBe("E_CONTRACT_KEYWORD");
  });

  it("matched_keywords 保序命中：[契约, 跨域]（词表序遍历，去重保序）", () => {
    const result = resultOf(chain.triage);
    expect(result["matched_keywords"]).toEqual(["契约", "跨域"]);
    expect(result["evidence_grade"]).toBe("INFERRED");
    expect(result["ttl_hours"]).toBe(168);
  });

  it("缺席显式：absent_signals 全量 8 项（升档档位也不把缺席渲染成干净）", () => {
    const absent = resultOf(chain.triage)["absent_signals"] as readonly string[];
    expect(absent).toHaveLength(8);
    expect(absent).toContain("contract_surface_registry");
    expect(absent).toContain("governed_object_hits");
  });

  it("triage 重放字节稳定（同请求 stdout 全等，GOLDEN-L8-1 判据）", async () => {
    const replay = await runJsonStep(root, ["triage", REQUEST]);
    expect(replay.code).toBe(0);
    expect(replay.stdout).toBe(chain.triage.stdout);
  });
});

// ============================================================
// 八拍①②③ maintain --phase pre-dev
// ============================================================

describe("八拍①②③ maintain --phase pre-dev（Vue3 工程）", () => {
  it("pre-dev 链 exit 0：mode=pre_dev_chain、failed_at_step=null、三步视图齐备", () => {
    const rec = chain.predev;
    expect(rec.code).toBe(0);
    const envelope = env(rec);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("maintain");
    const result = resultOf(rec);
    expect(result["mode"]).toBe("pre_dev_chain");
    expect(result["phase"]).toBe("pre-dev");
    expect(result["failed_at_step"]).toBeNull();
    expect(result["triage"]).not.toBeNull();
    expect(result["permit"]).not.toBeNull();
    expect(result["projection"]).not.toBeNull();
  });

  it("① triage 视图与独立 triage 同判（STANDARD + matched 保序一致）", () => {
    const triage = resultOf(chain.predev)["triage"] as Record<string, unknown>;
    expect(triage["profile"]).toBe("STANDARD");
    expect(triage["matched_keywords"]).toEqual(
      resultOf(chain.triage)["matched_keywords"],
    );
  });

  it("② permit 五件套：PERMIT.TASK_V0001.1 + scope 圈定单对象 + ttl 168 拍", () => {
    const permit = resultOf(chain.predev)["permit"] as Record<string, unknown>;
    expect(permit["permit_ref"]).toBe("PERMIT.TASK_V0001.1");
    expect(permit["ttl_beats"]).toBe(168);
    expect(permit["issued_at_seq"]).toBe(0);
    const scope = permit["scope"] as Record<string, unknown>;
    expect(scope["subject_ids"]).toEqual([TASK_ID]);
  });

  it("② permits.json 台账落盘：1 条 + change_ref=锚 + requested_by actor 留痕", () => {
    const ledger = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "permits.json"), "utf8"),
    ) as {
      permits: {
        permit_ref: string;
        change_ref: string | null;
        requested_by: Record<string, unknown>;
      }[];
    };
    expect(ledger.permits).toHaveLength(1);
    expect(ledger.permits[0]?.permit_ref).toBe("PERMIT.TASK_V0001.1");
    expect(ledger.permits[0]?.change_ref).toBe(CHANGE_OR_TASK);
    expect(ledger.permits[0]?.requested_by["actor"]).toBe("fixture-vue3");
  });

  it("journal PERMIT_ISSUED 留痕且 permit_ref 与台账一致（事件流闭环）", () => {
    const issued = journalEvents(root).find(
      (event) => event["type"] === "PERMIT_ISSUED",
    );
    expect(issued).toBeDefined();
    expect(issued?.["permit_ref"]).toBe("PERMIT.TASK_V0001.1");
  });

  it("③ 投影：role=frontend 回显 + inputs_fingerprint（sha256 64hex）+ 三分区数组在场", () => {
    const projection = resultOf(chain.predev)["projection"] as Record<string, unknown>;
    expect(projection["role"]).toBe("frontend");
    expect(projection["inputs_fingerprint"]).toMatch(/^sha256:[0-9a-f]{64}$/);
    for (const key of ["must_entries", "advisory_entries", "catalog_entries", "lazy_tools"]) {
      expect(Array.isArray(projection[key]), `${key} 应为数组`).toBe(true);
    }
  });

  it("permit issue 非幂等：二次签发确定性递增 PERMIT.TASK_V0001.2", async () => {
    const second = await runJsonStep(root, [
      "maintain",
      CHANGE_OR_TASK,
      "--phase",
      "pre-dev",
      "--request",
      REQUEST,
      "--subject",
      TASK_ID,
      "--actor",
      ACTOR,
      "--role",
      ROLE,
    ]);
    expect(second.code).toBe(0);
    const permit = resultOf(second)["permit"] as Record<string, unknown>;
    expect(permit["permit_ref"]).toBe("PERMIT.TASK_V0001.2");
  });
});

// ============================================================
// 八拍⑥ reconcile：clean → 受控变更（task 落账）→ dirty
// ============================================================

describe("八拍⑥ reconcile（clean → task 落账 → dirty，Vue3 工程）", () => {
  it("reconcile clean exit 0：clean=true、baseline=current=0（零审阅合法出口）", () => {
    const rec = chain.reconcileClean;
    expect(rec.code).toBe(0);
    expect(env(rec).ok).toBe(true);
    const result = resultOf(rec);
    expect(result["clean"]).toBe(true);
    expect(result["baseline_at_seq"]).toBe(0);
    expect(result["current_seq"]).toBe(0);
    expect(result["permit_ref"]).toBe("PERMIT.TASK_V0001.1");
  });

  it("reconcile 纯读纪律：reconcile 前后 truth-index 字节全等（报告生成零落盘）", async () => {
    const before = truthIndexBytes(root);
    const rerun = await runJsonStep(root, [
      "reconcile",
      "--permit",
      "PERMIT.TASK_V0001.1",
    ]);
    expect(rerun.code).toBe(1); // ops 已落账：重跑恒 dirty
    expect(truthIndexBytes(root)).toBe(before);
  });

  it("maintain --ops upsert task exit 0：APPLIED + changed=[TASK.V0001] + ops_counts", () => {
    const rec = chain.opsApply;
    expect(rec.code).toBe(0);
    expect(env(rec).ok).toBe(true);
    const result = resultOf(rec);
    expect(result["mode"]).toBe("apply");
    expect(result["change"]).toBe("APPLIED");
    expect(result["changed_object_ids"]).toEqual([TASK_ID]);
    expect(result["ops_counts"]).toEqual({ upsert_object: 1 });
  });

  it("首个事务 applied_seq=1 且 digest_warnings 空（D24 零口径分叉）", () => {
    const result = resultOf(chain.opsApply);
    expect(result["applied_seq"]).toBe(1);
    expect(result["short_circuited"]).toBe(false);
    expect(result["digest_warnings"]).toEqual([]);
  });

  it("reconcile dirty exit 1：RECONCILE_DIRTY + changed_objects 含 TASK.V0001（materialized）", () => {
    const rec = chain.reconcileDirty;
    expect(rec.code).toBe(1);
    expect(env(rec).ok).toBe(false);
    expect(env(rec).errors[0]?.code).toBe("RECONCILE_DIRTY");
    const result = resultOf(rec);
    expect(result["clean"]).toBe(false);
    expect(result["current_seq"]).toBe(1);
    const changed = result["changed_objects"] as Record<string, unknown>[];
    expect(changed.map((row) => row["id"])).toEqual([TASK_ID]);
    expect(changed[0]?.["kind"]).toBe("materialized");
  });

  it("dirty 报告分母语义：scope_summary materialized=1 vanished=0 + census/抽样结构在场", () => {
    const result = resultOf(chain.reconcileDirty);
    expect(result["scope_summary"]).toEqual({ subjects: 1, materialized: 1, vanished: 0 });
    expect(result["exceptions"]).toEqual([]);
    expect(Array.isArray(result["samples_to_review"])).toBe(true);
    expect(result["verdict_census"]).toEqual({ runs: {}, claims: {} });
  });

  it("reconcile 重放确定性：同命令连跑两次 stdout 字节全等（同 state 重放字节稳定）", async () => {
    const permitRef = resultOf(chain.reconcileDirty)["permit_ref"] as string;
    const first = await runJsonStep(root, ["reconcile", "--permit", permitRef]);
    const second = await runJsonStep(root, ["reconcile", "--permit", permitRef]);
    expect(first.code).toBe(1);
    expect(second.code).toBe(1);
    expect(second.stdout).toBe(first.stdout);
  });

  it("链后 status：generation_seq=2（ops 1 + gates 入账 1）+ by_lifecycle CURRENT=1", async () => {
    const status = await runJsonStep(root, ["status"]);
    expect(status.code).toBe(0);
    const objects = (resultOf(status)["objects"] ?? {}) as Record<string, unknown>;
    expect(resultOf(status)["generation_seq"]).toBe(2);
    expect((objects["by_lifecycle"] ?? {})["CURRENT"]).toBe(1);
  });
});

// ============================================================
// 八拍⑤ gate：check --gates（NOT_RUN 入账）+ check --fast（BUILD 腿真跑）
// ============================================================

describe("八拍⑤ gate（Vue3 工程）", () => {
  it("check --gates exit 1：5 recipe 全派发 passed=0 + applied_seq=2（fail-closed 非绿）", () => {
    const rec = chain.gates;
    expect(rec.code).toBe(1);
    expect(env(rec).ok).toBe(false);
    const result = resultOf(rec);
    expect(result["recipes_total"]).toBe(5);
    expect(result["passed"]).toBe(0);
    expect(result["applied_seq"]).toBe(2);
  });

  it("rows 判卷词形：not_configured + not_run×4 + GRN-0001..0005 连号（缺席非绿非红）", () => {
    const rows = (resultOf(chain.gates)["rows"] ?? []) as Record<string, unknown>[];
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row["verdict"])).toEqual([
      "not_configured",
      "not_run",
      "not_run",
      "not_run",
      "not_run",
    ]);
    expect(rows.map((row) => row["grn"])).toEqual([
      "GRN-0001",
      "GRN-0002",
      "GRN-0003",
      "GRN-0004",
      "GRN-0005",
    ]);
  });

  it("GRN 落盘 evidence/runs：5 文件 record_type=run + 三件套 + counts 全零显式", () => {
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    expect(readdirSync(runsDir).sort()).toEqual([
      "GRN-0001.json",
      "GRN-0002.json",
      "GRN-0003.json",
      "GRN-0004.json",
      "GRN-0005.json",
    ]);
    for (const fileName of readdirSync(runsDir).sort()) {
      const record = JSON.parse(readFileSync(join(runsDir, fileName), "utf8")) as {
        record_type?: unknown;
        gate_result?: { result?: Record<string, unknown> };
      };
      expect(record.record_type).toBe("run");
      const inline = record.gate_result?.result ?? {};
      expect(typeof inline["tool"]).toBe("string");
      expect(typeof inline["tool_version"]).toBe("string");
      expect(typeof inline["metric_dialect"]).toBe("string");
      expect(inline["counts"]).toEqual({
        scanned: 0,
        applicable_scanned: 0,
        violations: 0,
        not_applicable: 0,
      });
    }
  });

  it(
    "check --fast exit 1：vitest 腿 READY → 真实执行（无 node_modules）→ not_run 非绿非红",
    async () => {
      const rec = chain.fast;
      expect(rec.code).toBe(1);
      expect(env(rec).ok).toBe(false);
      const result = resultOf(rec);
      expect(result["gate"]).toBe("BUILD");
      // 依赖已声明 → 探测 READY（与 git-repo/fastapi 的 NOT_INSTALLED 形态区分）；
      // 执行面无 node_modules → 不可判卷 → verdict=not_run（缺席显式，绝不静默当绿）。
      expect(result["status"]).toBe("READY");
      expect(result["verdict"]).toBe("not_run");
      expect(result["detail"]).toBeNull();
      expect(result["counts"]).toEqual({
        scanned: 0,
        applicableScanned: 0,
        violations: 0,
        notApplicable: 0,
      });
      expect(env(rec).errors[0]?.code).toBe("GATE_NOT_RUN");
    },
    240_000,
  );

  it("check --fast 纯读：runs 平面仍 5 文件（--fast 不落 GRN，G6 纪律）", () => {
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    expect(readdirSync(runsDir)).toHaveLength(5);
  });

  it("gates 二次跑：GRN 续号 0006..0010 + applied_seq=3（观察追加非覆写）", async () => {
    const second = await runJsonStep(root, ["check", "--gates"]);
    expect(second.code).toBe(1);
    const result = resultOf(second);
    const rows = (result["rows"] ?? []) as Record<string, unknown>[];
    expect(rows[0]?.["grn"]).toBe("GRN-0006");
    expect(rows[rows.length - 1]?.["grn"]).toBe("GRN-0010");
    expect(result["applied_seq"]).toBe(3);
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs"))).toHaveLength(10);
  });
});

// ============================================================
// 八拍⑧ closeout + 检视与终态
// ============================================================

describe("八拍⑧ closeout 与终态（Vue3 工程）", () => {
  it("inspect TASK.V0001 exit 0：对象在场、id 回显（正文+谱系纯读）", async () => {
    const inspect = await runJsonStep(root, ["inspect", TASK_ID]);
    expect(inspect.code).toBe(0);
    expect(env(inspect).ok).toBe(true);
    expect(resultOf(inspect)["id"]).toBe(TASK_ID);
  });

  it("closeout exit 1：DOD_CLAIM_NOT_FOUND（acceptance 引用 CLM-9001 悬空——硬阻断）", () => {
    const rec = chain.closeout;
    expect(rec.code).toBe(1);
    expect(env(rec).ok).toBe(false);
    expect(env(rec).errors[0]?.code).toBe("DOD_CLAIM_NOT_FOUND");
    expect(env(rec).errors[0]?.message).toContain("CLM-9001");
  });

  it("closeout 阻断零写入：truth-index/journal 字节不变 + claims 平面零产出", async () => {
    const indexBefore = truthIndexBytes(root);
    const journalBefore = readFileSync(
      join(root, ".pomaster", "state", "journal.jsonl"),
      "utf8",
    );
    const replay = await runJsonStep(root, ["closeout", TASK_ID]);
    expect(replay.code).toBe(1);
    expect(truthIndexBytes(root)).toBe(indexBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(
      journalBefore,
    );
    expect(existsSync(join(root, ".pomaster", "evidence", "claims"))).toBe(false);
  });

  it("permit list 台账呈现：2 条签发记录全部 active（TTL 拍面未过期）", async () => {
    const list = await runJsonStep(root, ["permit", "list"]);
    expect(list.code).toBe(0);
    const permits = (resultOf(list)["permits"] ?? []) as Record<string, unknown>[];
    expect(permits.map((entry) => entry["permit_ref"])).toEqual([
      "PERMIT.TASK_V0001.1",
      "PERMIT.TASK_V0001.2",
    ]);
    expect(permits.every((entry) => entry["status"] === "active")).toBe(true);
  });

  it("终态 status：generation_seq=3（ops 1 + gates×2）+ CURRENT=1", async () => {
    const status = await runJsonStep(root, ["status"]);
    expect(status.code).toBe(0);
    const result = resultOf(status);
    expect(result["generation_seq"]).toBe(3);
    const objects = (result["objects"] ?? {}) as Record<string, unknown>;
    expect((objects["by_lifecycle"] ?? {})["CURRENT"]).toBe(1);
  });
});
