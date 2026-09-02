/**
 * catalog-runtime-binding.spec.ts —— P14 出口判据 E2E（tests/integration，L2 账）：
 *
 * ① catalog→运行时联结实跑：临时工程 context compile 输出含 catalog 派生分区
 *    （分区在场 + 逐条标明 catalog 出处 + lazyTools 消费 catalog/tools 非空）；
 * ② catalog-lock 漂移检测：临时 catalog 副本上构造「物料被改而 lock 未重锁」
 *    → verifyCatalogLock / catalog status 显式检出（content_drift 精确指向路径）；
 * ③ §92.2 边界（Catalog 不是第二套 Project Truth）：catalog 变更只影响投影
 *    （catalogEntries/inputsFingerprint 变），.pomaster state 全树字节零变更。
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compileProjection,
  createStore,
  resolveCatalogRoot,
  verifyCatalogLock,
} from "@pomaster/kernel";
import { runCli, runContextCompile, type CliEnvelope } from "@pomaster/cli";

const REPO_CATALOG = resolveCatalogRoot();

let root: string;
let catalogCopy: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-catalog-binding-"));
  const tempRoot = mkdtempSync(join(tmpdir(), "pvnext-catalog-binding-cat-"));
  catalogCopy = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogCopy, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(dirname(catalogCopy), { recursive: true, force: true });
});

/** .pomaster 全树快照（相对路径 → 字节；§92.2 边界的 state 零变更断言面）。 */
function stateTreeSnapshot(): Map<string, string> {
  const base = join(root, ".pomaster");
  const snapshot = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const target = join(dir, name);
      if (statSync(target).isDirectory()) {
        walk(target);
        continue;
      }
      snapshot.set(target.slice(base.length), readFileSync(target, "utf8"));
    }
  };
  walk(base);
  return snapshot;
}

async function runJson(
  args: readonly string[],
): Promise<{ code: number; envelope: CliEnvelope<Record<string, unknown>> }> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  return {
    code,
    envelope: JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>,
  };
}

describe("① context compile 实跑：catalog 派生分区在场且标明出处", () => {
  it("临时工程 init → context compile --role frontend：CATALOG 分区 + catalog 出处 + lazyTools 非空", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const outcome = await runContextCompile(root, "frontend");
    expect(outcome.ok).toBe(true);
    // 分区在场：markdown 四分区 + catalog 标题逐字标明出处语义（§92.2）。
    expect(outcome.result.markdown).toContain(
      "## CATALOG（catalog 策展注入；出处 catalog，非 project state——§92.2）",
    );
    // 逐条出处：每条 reason 以 catalog: + catalog 内路径开头（策展源可溯源）。
    expect(outcome.result.manifest.catalog_entries.length).toBeGreaterThan(0);
    for (const entry of outcome.result.manifest.catalog_entries) {
      expect(entry.reason).toMatch(/^catalog: (policies|projection-presets)\//);
    }
    // policies 与 projection-presets 双消费（P14 出口判据范围锚）。
    // W1-A2 T3 注记（PRD v0.5.2 §5.2/§14；裁决 8 ②）：无输入编译下 capabilities 标注条目
    // （POLICY.WEB.API.SINGLE_HTTP_CLIENT 等 API 族）按「不可判定即不注入」确定性排除——
    // 在场代表改钉 lanes 平移条目（T3 后无输入仍注入；排除面判卷归 case-b spec +
    // benchmarks/applicability.mjs）。
    expect(
      outcome.result.manifest.catalog_entries.some((entry) => entry.ref === "POLICY.WEB.STYLE.OWNERSHIP_MATRIX"),
    ).toBe(true);
    expect(
      outcome.result.manifest.catalog_entries.some((entry) => entry.ref === "registry-tree"),
    ).toBe(true);
    // catalog 出处元信息：root + lock 校验注记。
    expect(outcome.result.catalog_source.status).toBe("catalog");
    expect(outcome.result.catalog_source.root).not.toBeNull();
    expect(outcome.result.catalog_source.note).toContain("catalog-lock 校验通过（111 entries）");
    // lazyTools 消费 catalog/tools（projection.ts:177 显式空自注消灭的实跑验证）。
    expect(outcome.result.manifest.lazy_tools).toContain("tools/materialize_catalog_pilot.py");
  });
});

describe("② catalog-lock 漂移检测（物料被改而 lock 未重锁 → 显式检出）", () => {
  it("verifyCatalogLock：content_drift 精确指向被改文件；恢复字节后回绿", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    const target = join(catalogCopy, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- tampered -->\n`, "utf8");
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({
        kind: "content_drift",
        path: "policies/policy.web.api.single_http_client.json",
      }),
    );
    // 投影消费面同步显式：D24 WARN 呈现（不阻断，但绝不静默）。
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });

  it("catalog status 命令面：漂移 → CATALOG_LOCK_DRIFT exit 1（fail-closed 检出）", async () => {
    const target = join(catalogCopy, "knowledge", "knowledge.web.grid.example_column_preset.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, original.replace("报表共享列 preset", "报表共享列 preset（改）"), "utf8");
    const status = await runJson(["catalog", "status", "--catalog-root", catalogCopy]);
    expect(status.code).toBe(1);
    expect(status.envelope.ok).toBe(false);
    expect((status.envelope.errors[0] as Record<string, unknown>)["code"]).toBe(
      "CATALOG_LOCK_DRIFT",
    );
  });

  it("catalog explain 命令面：单条目 lock 身份 + 正文策展字段实跑（--catalog-root 注入面）", async () => {
    const explain = await runJson([
      "catalog",
      "explain",
      "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
      "--catalog-root",
      catalogCopy,
    ]);
    expect(explain.code).toBe(0);
    const result = explain.envelope.result as Record<string, unknown>;
    expect(result["file"]).toBe("policies/policy.web.api.single_http_client.json");
    const material = result["material"] as Record<string, unknown>;
    expect(material["title_zh"]).toBe("HTTP Client 单点统一");
    expect(material["lane"]).toBe("frontend");
  });

  it("catalog explain 未登记 id → CATALOG_ENTRY_NOT_FOUND exit 1", async () => {
    const explain = await runJson([
      "catalog",
      "explain",
      "POLICY.NO.SUCH_ENTRY",
      "--catalog-root",
      catalogCopy,
    ]);
    expect(explain.code).toBe(1);
    expect((explain.envelope.errors[0] as Record<string, unknown>)["code"]).toBe(
      "CATALOG_ENTRY_NOT_FOUND",
    );
  });
});

describe("③ §92.2 边界：catalog 变更只影响投影，store state 零变更", () => {
  it("改 catalog 副本 → catalogEntries/inputsFingerprint 变，.pomaster 全树字节全等", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const store = await createStore(root);
    const request = { role: "frontend" as const };

    const before = await compileProjection(store, request, { catalogRoot: catalogCopy });
    const snapshot = stateTreeSnapshot();

    // catalog 侧变更（策展源）：新增一条 frontend policy（不重锁——漂移与本判据正交）。
    writeFileSync(
      join(catalogCopy, "policies", "policy.web.api.p14_boundary_probe.json"),
      `${JSON.stringify(
        {
          id: "POLICY.WEB.API.P14_BOUNDARY_PROBE",
          kind: "policy",
          classification: "LANE_POLICY",
          title_zh: "P14 边界探针",
          statement_zh: "P14 §92.2 边界测试探针。",
          applies_when: { lane: "frontend", condition: "P14 边界测试" },
          enforcement: "advisory",
          axes: { lifecycle: "PROPOSED" },
          authority: { owner: "HUMAN_OWNER" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const after = await compileProjection(store, request, { catalogRoot: catalogCopy });
    expect(
      after.manifest.catalogEntries.map((entry) => entry.ref),
    ).toContain("POLICY.WEB.API.P14_BOUNDARY_PROBE");
    expect(after.manifest.catalogEntries.length).toBeGreaterThan(
      before.manifest.catalogEntries.length,
    );
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);

    // state 零变更：catalog 改动不产生任何 store 事实（全树路径集与字节全等）。
    const afterSnapshot = stateTreeSnapshot();
    expect([...afterSnapshot.keys()].sort()).toEqual([...snapshot.keys()].sort());
    for (const [path, body] of snapshot) {
      expect(afterSnapshot.get(path)).toBe(body);
    }
  });
});
