/**
 * catalog-relock.spec.ts —— `pomaster catalog relock`（P-v06 批次 2.5；Owner 裁决 2026-09-03）。
 *
 * 四道守门（漂移恢复键 = status exit 1 的修复点）：
 * 1) 漂移→relock→回绿：手改 archetype 字节不重锁 → status CATALOG_LOCK_DRIFT exit 1 →
 *    relock refreshed 精确指路 → status 回绿 exit 0（lock 哈希 = 落盘实际字节）；
 * 2) 幂等 byte-stable：同物料两次 relock 第二次 diff 全空且 lock 文件字节全等
 *    （A4 无时戳；generated_by 注记只追加一次）；
 * 3) 收敛：新增物料 → added 且 entries/allowed/required 三方 143→144 对账绿；
 *    删除物料 → removed 且对账绿（加删文件后三方自动对齐）；
 * 4) store 零依赖：无 .pomaster 的项目根同样可跑（catalog 是工具侧资产 §92.2）；
 *    lock 缺失 → fail-closed 拒绝（relock 不是初始化工具）。
 *
 * 纯读前提：repo 实物 catalog/ 零触碰——全部场景在 trackTempCatalog 临时副本上落盘
 * （relock 的写盘只发生在测试临时副本，手法照 catalog.spec.ts）。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_RELOCK_GENERATED_BY_NOTE,
  readCatalogLock,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
} from "@pomaster/kernel";
import { runCatalogRelock, runCatalogStatus, runCli, type CliEnvelope } from "@pomaster/cli";

/**
 * 写后复验注入位（vi.mock 委托式 hook，store.spec.ts 并发窗口注入先例）：默认 null =
 * 纯透传（本文件其余用例零影响）。「写后复验非 ok → CATALOG_LOCK_DRIFT 拒绝」分支在
 * 公开 API 下只有 relock 扫描→落盘→复验窗口内的并发突变才可达（确定性复现必须注入，
 * 禁 OS 时序 flake）——挂 hook 令写后 verifyCatalogLock 判 not-ok 一次，钉住拒绝路径
 * 不假绿、且拒绝不破坏落盘（磁盘留下的是可对账的 next 字节）。
 */
const verifyRejectHook = vi.hoisted(() => ({
  rejectNext: null as (() => boolean) | null,
}));

vi.mock("@pomaster/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pomaster/kernel")>();
  return {
    ...actual,
    verifyCatalogLock: ((
      catalogRoot: string,
      lock?: Parameters<typeof actual.verifyCatalogLock>[1],
    ) => {
      if (verifyRejectHook.rejectNext !== null && verifyRejectHook.rejectNext()) {
        verifyRejectHook.rejectNext = null;
        return {
          ok: false,
          entries_checked: 0,
          drifts: [
            {
              kind: "content_drift" as const,
              path: "policies/policy.probe.json",
              detail: "注入的写后复验失败（relock 扫描→落盘→复验窗口并发突变模拟）",
            },
          ],
        };
      }
      return actual.verifyCatalogLock(catalogRoot, lock);
    }) as typeof actual.verifyCatalogLock,
  };
});

const REPO_CATALOG = resolveCatalogRoot();

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
  verifyRejectHook.rejectNext = null;
});

afterEach(() => {
  for (const root of tempRoots) rmSync(dirname(root), { recursive: true, force: true });
});

function trackTempCatalog(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-relock-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  tempRoots.push(catalogRoot);
  return catalogRoot;
}

const TAMPER_PATH = "archetypes/archetype.page.master_data.json";

/** 手改一份 archetype 字节（合法 JSON 内容变更——坏 JSON 走 SCHEMA_INVALID 非 content_drift）。 */
function tamperArchetype(catalogRoot: string): void {
  const target = join(catalogRoot, TAMPER_PATH);
  const original = readFileSync(target, "utf8");
  writeFileSync(target, original.replace("主数据管理页", "主数据管理页（漂移测试变更）"), "utf8");
}

describe("catalog relock（漂移恢复键：漂移→relock→回绿）", () => {
  it("手改 archetype 不重锁 → status exit 1（CATALOG_LOCK_DRIFT）→ relock → status 回绿 exit 0（added=0/refreshed=1）", async () => {
    const catalogRoot = trackTempCatalog();
    tamperArchetype(catalogRoot);

    const drifted = await runCatalogStatus({ catalogRoot });
    expect(drifted.ok).toBe(false);
    expect(drifted.errors[0]?.code).toBe("CATALOG_LOCK_DRIFT");
    expect(drifted.errors[0]?.hint).toContain("pomaster catalog relock");
    expect(drifted.errors[0]?.hint).toContain("重锁");

    const relocked = await runCatalogRelock({ catalogRoot });
    expect(relocked.ok).toBe(true);
    expect(relocked.errors).toEqual([]);
    expect(relocked.result.entries_total).toBe(143);
    expect(relocked.result.added).toEqual([]);
    expect(relocked.result.removed).toEqual([]);
    expect(relocked.result.refreshed).toEqual([TAMPER_PATH]);
    const human = relocked.human.join("\n");
    expect(human).toContain("catalog-lock: relocked & verified（143 entries）");
    expect(human).toContain(`~ ${TAMPER_PATH}`);

    const green = await runCatalogStatus({ catalogRoot });
    expect(green.ok).toBe(true);
    expect(green.result.lock_verification).toEqual({ ok: true, entries_checked: 143, drifts: [] });
    // 重锁后 lock 登记哈希 = 落盘实际字节（与 verifyCatalogLock 同一口径的直算复核）。
    const entry = readCatalogLock(catalogRoot).entries.find(
      (candidate) => candidate.path === TAMPER_PATH,
    );
    expect(entry?.content_sha256).toBe(
      sha256OfUtf8(readFileSync(join(catalogRoot, TAMPER_PATH), "utf8")),
    );
  });

  it("幂等 byte-stable：一致 catalog 首锁零 diff（仅 generated_by 注记追加）；再锁全空且 lock 文件字节全等", async () => {
    const catalogRoot = trackTempCatalog();
    const lockPath = join(catalogRoot, "catalog-lock.draft.json");
    const first = await runCatalogRelock({ catalogRoot });
    expect(first.ok).toBe(true);
    expect(first.result.added).toEqual([]);
    expect(first.result.removed).toEqual([]);
    expect(first.result.refreshed).toEqual([]);
    const afterFirst = readFileSync(lockPath, "utf8");
    expect(afterFirst).toContain(CATALOG_RELOCK_GENERATED_BY_NOTE);
    // 原 producer 注记保留（幂等追加 = 增量注记，不重写历史）。
    expect(afterFirst).toContain("materialize_catalog_pilot.py");

    const second = await runCatalogRelock({ catalogRoot });
    expect(second.ok).toBe(true);
    expect(second.result.added).toEqual([]);
    expect(second.result.removed).toEqual([]);
    expect(second.result.refreshed).toEqual([]);
    expect(readFileSync(lockPath, "utf8")).toBe(afterFirst);
  });

  it("收敛：新增物料 → added 含该路径且 entries/allowed/required 三方 143→144 对账绿；删除 → removed 且对账绿", async () => {
    const catalogRoot = trackTempCatalog();
    const probePath = "knowledge/knowledge.relock.probe.json";
    writeFileSync(
      join(catalogRoot, probePath),
      `${JSON.stringify({ id: "KNOWLEDGE.RELOCK.PROBE" }, null, 2)}\n`,
      "utf8",
    );
    const addedRun = await runCatalogRelock({ catalogRoot });
    expect(addedRun.ok).toBe(true);
    expect(addedRun.result.added).toEqual([probePath]);
    expect(addedRun.result.removed).toEqual([]);
    // diff 互斥（分母「两侧都在」）：新增路径不计入 refreshed（呈现位 +/~ 不双标）。
    expect(addedRun.result.refreshed).toEqual([]);
    expect(addedRun.result.entries_total).toBe(144);
    const lock = readCatalogLock(catalogRoot);
    expect(lock.entries).toHaveLength(144);
    expect(lock.controlled_children.allowed).toHaveLength(144);
    expect(lock.controlled_children.required).toHaveLength(144);
    expect(lock.controlled_children.allowed).toContain(probePath);
    expect(lock.controlled_children.required).toContain(probePath);
    // 新条目 source_ref 确定性缺省（package://catalog/<path>）。
    const probeEntry = lock.entries.find((candidate) => candidate.id === "KNOWLEDGE.RELOCK.PROBE");
    expect(probeEntry?.source_ref).toBe(`package://catalog/${probePath}`);
    expect(verifyCatalogLock(catalogRoot).ok).toBe(true);
    const greenStatus = await runCatalogStatus({ catalogRoot });
    expect(greenStatus.ok).toBe(true);
    expect(greenStatus.result.entries_total).toBe(144);

    unlinkSync(join(catalogRoot, probePath));
    const removedRun = await runCatalogRelock({ catalogRoot });
    expect(removedRun.ok).toBe(true);
    expect(removedRun.result.removed).toEqual([probePath]);
    expect(removedRun.result.added).toEqual([]);
    expect(removedRun.result.entries_total).toBe(143);
    expect(readCatalogLock(catalogRoot).entries).toHaveLength(143);
    expect(verifyCatalogLock(catalogRoot).ok).toBe(true);
  });

  it("store 零依赖：无 .pomaster 的项目根同样可跑（catalog 是工具侧资产 §92.2；runCli exit 0 + §45 信封）", async () => {
    const catalogRoot = trackTempCatalog();
    const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-relock-nostore-"));
    const projectRoot = join(tempRoot, "project");
    mkdirSync(projectRoot, { recursive: true });
    tempRoots.push(projectRoot); // afterEach 删 tempRoot 全树
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", projectRoot, "catalog", "relock", "--catalog-root", catalogRoot, "--json"],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("catalog relock");
    expect(envelope.ok).toBe(true);
    expect(envelope.errors).toEqual([]);
    expect(envelope.result["entries_total"]).toBe(143);
    expect(existsSync(join(projectRoot, ".pomaster"))).toBe(false);
  });

  it("lock 缺失 → CATALOG_NOT_AVAILABLE fail-closed（relock 不是初始化工具，禁从零造账）", async () => {
    const catalogRoot = trackTempCatalog();
    unlinkSync(join(catalogRoot, "catalog-lock.draft.json"));
    const outcome = await runCatalogRelock({ catalogRoot });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CATALOG_NOT_AVAILABLE");
    expect(outcome.errors[0]?.message).toContain("catalog-lock 缺失");
    expect(outcome.errors[0]?.hint).toContain("relock 不是初始化工具");
  });

  it("写后复验非 ok → CATALOG_LOCK_DRIFT 拒绝（重锁产物对账不过绝不假绿；并发窗口注入）", async () => {
    const catalogRoot = trackTempCatalog();
    verifyRejectHook.rejectNext = () => true;
    const outcome = await runCatalogRelock({ catalogRoot });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CATALOG_LOCK_DRIFT");
    expect(outcome.errors[0]?.message).toContain("policy.probe.json");
    expect(outcome.human.join("\n")).toContain("RELOCK VERIFY FAILED");
    // 注入只消费一次：拒绝路径不破坏落盘——磁盘留下的是可对账的 next 字节（复验回绿）。
    expect(verifyCatalogLock(catalogRoot).ok).toBe(true);
  });
});
