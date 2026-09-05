/**
 * context-manifest.spec.ts —— vNext Batch 2 R2（D7）context manifest 落盘 + stale
 * 闭环 + R3（D8）五分区词形/VERIFICATION 分区（R1 联动）。
 *
 * 判据锚（cli/src/context.ts 头注 ADR）：
 * - 落盘位 `.pomaster/state/contexts/<task-id>.context.json`（无 taskRef → role 键名
 *   ——§58 context_recompile_per_role 词形；ADR 留痕）；layout 目录口径不在此锚死
 *   数字——全量登记见 kernel paths.ts 增量注记与 cli layout.ts LAYOUT_DIRECTORIES
 *   （现口径 41，B6a 播种目录登记后；D8-2，封堵 28→41 式口径漂移再现）；
 * - manifest 字段：task_ref / generated_at_seq（store seq，A4 零墙钟）/ compiler
 *   （tool id + kernel 版本锚）/ inputs_fingerprint / 五分区 entries（每条 ref+reason）
 *   / catalog_source；编译产物非第二配置源（宪法 §19）——禁手改只读服务面；
 * - 字节稳定（A4）：同输入重放逐字节相等（重编译覆盖同 id 文件可比对）；
 * - stale→recompile：现盘 manifest inputs_fingerprint 漂移 → STALE_GROUNDING 显式
 *   呈现（18 号 schema P1 预留词形启用，schema 词面已在零新增）+ 覆盖写不静默；
 *   现盘不可解析同按 STALE_GROUNDING 处置；
 * - `--check`：纯读比对（absent/fresh/stale_grounding 三态 + 现盘指纹回显），零写入；
 *   stale 不阻断（呈现不阻断是 D24 read_only_service 姿态）；
 * - VERIFICATION 分区（R1 联动）：binding CURRENT 的 SPEC.* 对象引用呈现
 *   （direct/change 两通路）；非 CURRENT / 无绑定 → 显式空区（缺席诚实）；
 *   VERIFICATION 不进 must_entries、不进 inputsFingerprint——gate 判卷输入语义零变更。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { runInit, runContextCompile } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-context-manifest-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

async function initStore(): Promise<void> {
  await runInit(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

/** 登记 Evidence Spec 一等对象（kind=business_rule 承载 + payload.spec_kind 判别——21 schema 词形）。 */
async function seedEvidenceSpec(overrides: {
  readonly id?: string;
  readonly lifecycle?: string;
  readonly evidence?: string;
  readonly boundTaskRef?: string | null;
  readonly boundChangeRef?: string | null;
  readonly claimRefs?: readonly string[];
  readonly gateRefs?: readonly string[];
} = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: overrides.id ?? "SPEC.CALC_EXPORT_EVIDENCE",
          kind: "business_rule",
          axisProfile: "rule_default",
          axes: {
            lifecycle: overrides.lifecycle ?? "CURRENT",
            confidence: "PROVISIONAL",
            evidence: overrides.evidence ?? "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: "计算导出证据要求",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            spec_kind: "evidence_spec",
            title: "计算导出需要什么证明（要求面）",
            bound_task_ref: overrides.boundTaskRef ?? null,
            bound_change_ref: overrides.boundChangeRef ?? null,
            applies_to: [],
            requirements: [
              {
                clause_id: "R1",
                proof_type: "build_gate",
                description: "导出计算经构建 gate 重算确认",
                subject_ref: null,
                claim_refs: overrides.claimRefs ?? [],
                gate_refs: overrides.gateRefs ?? [],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

function manifestPath(name: string): string {
  return join(root, ".pomaster", "state", "contexts", name);
}

interface ContextManifestDoc {
  readonly schema: string;
  readonly task_ref: string | null;
  readonly role: string;
  readonly generated_at_seq: unknown;
  readonly compiler: { readonly tool: string; readonly kernel: string };
  readonly inputs_fingerprint: string;
  readonly partitions: Record<string, readonly { ref: string; reason: string }[]>;
  readonly catalog_source: { readonly status: string };
}

// ============================================================
// R2/D7：落盘 + 字段集 + A4 零墙钟
// ============================================================

describe("context manifest 落盘（R2/D7）", () => {
  it("compile --change TASK.* → 落盘 <task-id>.context.json（字段集齐备；A4 零墙钟零时戳）", async () => {
    await initStore();
    const outcome = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.T0087",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.persisted).toBe(true);
    expect(outcome.result.manifest_path).toBe(
      ".pomaster/state/contexts/TASK.T0087.context.json",
    );
    const doc = JSON.parse(
      readFileSync(manifestPath("TASK.T0087.context.json"), "utf8"),
    ) as ContextManifestDoc;
    expect(doc.schema).toBe("pomaster.context-manifest/1");
    expect(doc.task_ref).toBe("TASK.T0087");
    expect(doc.role).toBe("frontend");
    expect(typeof doc.generated_at_seq).toBe("number");
    expect(doc.compiler.tool.startsWith("pomaster-cli@")).toBe(true);
    expect(doc.compiler.kernel).toBe("pomaster-kernel@0.0.0");
    expect(doc.inputs_fingerprint.startsWith("sha256:")).toBe(true);
    // 五分区 entries（每条 ref+reason）+ catalog_source。
    for (const partition of [
      "authoritative_project_state",
      "required_policy",
      "advisory_knowledge",
      "reuse_catalog",
      "verification",
    ]) {
      expect(Array.isArray(doc.partitions[partition]), partition).toBe(true);
    }
    expect(doc.catalog_source.status).toBe("catalog");
    // A4 零墙钟：manifest 无任何墙钟时戳键。
    const raw = readFileSync(manifestPath("TASK.T0087.context.json"), "utf8");
    expect(raw).not.toMatch(/"(created_at|updated_at|generated_at|timestamp|captured_at)"/);
    // 与 result 指纹一致。
    expect(doc.inputs_fingerprint).toBe(outcome.result.inputs_fingerprint);
  });

  it("无 taskRef → role 键名 <role>.context.json（§58 context_recompile_per_role 词形；ADR 留痕）", async () => {
    await initStore();
    const outcome = await runContextCompile(root, "architect");
    expect(outcome.ok).toBe(true);
    expect(outcome.result.manifest_path).toBe(
      ".pomaster/state/contexts/architect.context.json",
    );
    expect(existsSync(manifestPath("architect.context.json"))).toBe(true);
  });

  it("同输入重编译 → 字节稳定（重编译覆盖同 id 文件逐字节相等；A4）", async () => {
    await initStore();
    await runContextCompile(root, "frontend", undefined, { change: "TASK.T0087" });
    const first = readFileSync(manifestPath("TASK.T0087.context.json"), "utf8");
    await runContextCompile(root, "frontend", undefined, { change: "TASK.T0087" });
    const second = readFileSync(manifestPath("TASK.T0087.context.json"), "utf8");
    expect(second).toBe(first);
    // fresh 状态：指纹一致。
    expect(outcomeStaleState(await runContextCompile(root, "frontend", undefined, { change: "TASK.T0087" }))).toBe("fresh");
  });

  // CI windows 慢 runner 实证：本例跑完整 init（152 seeds + SPEC 预植）+ 二次编译，5s 默认超时不够（裁决批 H 终验）。
  it("指纹漂移 → STALE_GROUNDING 显式 warning + 覆盖写（不静默覆盖）", { timeout: 60_000 }, async () => {
    await initStore();
    await runContextCompile(root, "frontend", undefined, { change: "TASK.T0087" });
    // 模拟漂移：现盘 manifest 指纹被替换为异值（真实漂移 = Truth/Policy/catalog 更新
    // 导致重编译指纹变化——比对语义同构）。
    const path = manifestPath("TASK.T0087.context.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as ContextManifestDoc;
    writeFileSync(
      path,
      `${JSON.stringify({ ...doc, inputs_fingerprint: `sha256:${"f".repeat(64)}` }, null, 2)}\n`,
    );
    const outcome = await runContextCompile(root, "frontend", undefined, { change: "TASK.T0087" });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("STALE_GROUNDING");
    expect(outcome.result.stale_check.state).toBe("stale_grounding");
    expect(outcome.result.stale_check.existing_inputs_fingerprint).toBe(
      `sha256:${"f".repeat(64)}`,
    );
    // 覆盖写：现盘指纹恢复为本编译指纹（重编译完成，指路 --check 复核）。
    const reread = JSON.parse(readFileSync(path, "utf8")) as ContextManifestDoc;
    expect(reread.inputs_fingerprint).toBe(outcome.result.inputs_fingerprint);
  });

  it("现盘 manifest 不可解析（手改/损坏）→ 同按 STALE_GROUNDING 处置（禁手改纪律）", async () => {
    await initStore();
    await runContextCompile(root, "frontend");
    writeFileSync(manifestPath("frontend.context.json"), "{ 损坏 JSON");
    const outcome = await runContextCompile(root, "frontend");
    expect(outcome.ok).toBe(true);
    expect(outcome.result.stale_check.state).toBe("stale_grounding");
    expect(outcome.result.stale_check.detail).toContain("禁手改");
  });

  it("--check：纯读零写入（absent 不建文件 / fresh / stale 三态呈现，ok 恒 true——ADR 呈现不阻断）", async () => {
    await initStore();
    const absent = await runContextCompile(root, "frontend", undefined, undefined, {
      check: true,
    });
    expect(absent.ok).toBe(true);
    expect(absent.result.persisted).toBe(false);
    expect(absent.result.manifest_path).toBe(null);
    expect(absent.result.stale_check.state).toBe("absent");
    expect(existsSync(manifestPath("frontend.context.json"))).toBe(false);

    await runContextCompile(root, "frontend");
    const fresh = await runContextCompile(root, "frontend", undefined, undefined, {
      check: true,
    });
    expect(fresh.result.stale_check.state).toBe("fresh");
    expect(fresh.result.persisted).toBe(false);

    const path = manifestPath("frontend.context.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as ContextManifestDoc;
    writeFileSync(
      path,
      `${JSON.stringify({ ...doc, inputs_fingerprint: `sha256:${"e".repeat(64)}` }, null, 2)}\n`,
    );
    const stale = await runContextCompile(root, "frontend", undefined, undefined, {
      check: true,
    });
    expect(stale.ok).toBe(true);
    expect(stale.result.stale_check.state).toBe("stale_grounding");
    // --check 零写入：现盘漂移指纹原样保留（未被覆盖）。
    const reread = JSON.parse(readFileSync(path, "utf8")) as ContextManifestDoc;
    expect(reread.inputs_fingerprint).toBe(`sha256:${"e".repeat(64)}`);
  });
});

// ============================================================
// R3/D8（R1 联动）：VERIFICATION 分区
// ============================================================

function outcomeStaleState(outcome: Awaited<ReturnType<typeof runContextCompile>>): string {
  return outcome.result.stale_check.state;
}

describe("VERIFICATION 分区（R3/D8 词形 + R1 联动）", () => {
  it("绑定 CURRENT Spec（direct）→ verification 分区与 markdown 呈现 Spec 引用；机器判卷输入零变更", async () => {
    await initStore();
    await seedEvidenceSpec({ boundTaskRef: "TASK.T0087" });
    const outcome = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.T0087",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain("`SPEC.CALC_EXPORT_EVIDENCE`");
    expect(outcome.result.markdown).toContain("closeout 按资格条件判卷");
    expect(outcome.result.markdown).toContain("## VERIFICATION");
    // 不绑定本任务的 Spec 不出现（缺席诚实）。
    // VERIFICATION 是呈现分区：不进 must_entries、不进 fingerprint 输入——
    // 同投影去掉 Spec 对象后 must_entries 不因 verification 变化（语义零变更的机器面）。
    expect(outcome.result.manifest.must_entries.every((e) => !e.ref.startsWith("SPEC."))).toBe(true);
  });

  it("非 CURRENT Spec 绑定 → 显式空区（缺席诚实，不冒充无验证义务）", async () => {
    await initStore();
    await seedEvidenceSpec({
      boundTaskRef: "TASK.T0087",
      lifecycle: "PROPOSED",
      evidence: "PLANNED",
    });
    const outcome = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.T0087",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).not.toContain("SPEC.CALC_EXPORT_EVIDENCE`");
    expect(outcome.result.markdown).toContain("本任务无 CURRENT 生命周期 Evidence Spec 绑定");
    expect(outcome.result.markdown).toContain("## VERIFICATION");
  });

  it("无任何 Spec → VERIFICATION 显式空区（五分区词形在场——D8 闭包）", async () => {
    await initStore();
    const outcome = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.T0087",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain("## AUTHORITATIVE PROJECT STATE");
    expect(outcome.result.markdown).toContain("## REQUIRED POLICY");
    expect(outcome.result.markdown).toContain("## ADVISORY KNOWLEDGE");
    expect(outcome.result.markdown).toContain("## REUSE / CATALOG");
    expect(outcome.result.markdown).toContain("## VERIFICATION");
  });
});
