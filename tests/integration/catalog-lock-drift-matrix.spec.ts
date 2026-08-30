/**
 * catalog-lock-drift-matrix.spec.ts —— P16 catalog-lock 漂移专项缺口面（tests/integration，L2 账）。
 *
 * 分工与引用：P14（catalog-runtime-binding.spec.ts §②）已入 L2 账并覆盖 content_drift
 * （物料被改而 lock 未重锁 → verifyCatalogLock 精确指路 + catalog status 命令面
 * CATALOG_LOCK_DRIFT exit 1 + 恢复回绿）。本文件**不重写**已覆盖面，只补 verifyCatalogLock
 * 对账四面中 P14 未触达的 drift kind 缺口：
 *   missing（登记在册文件被删）/ unexpected_file（管辖目录新增未登记文件）/
 *   entry_not_allowed（entries 登记了 allowed 之外路径——lock 内部失自洽）/
 *   missing_required（required 声明的文件缺失）/ lock_unreadable（lock 坏形或缺失）。
 * 每例都验证「显式检出 + 恢复（或清除）后回绿」——漂移是显式事实，不是静默绿。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readCatalogLock,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
  type CatalogLockDocument,
} from "@pomaster/kernel";
import { runCli, type CliEnvelope } from "@pomaster/cli";

const REPO_CATALOG = resolveCatalogRoot();

let root: string;
let catalogCopy: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-drift-matrix-"));
  const tempRoot = mkdtempSync(join(tmpdir(), "pvnext-drift-matrix-cat-"));
  catalogCopy = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogCopy, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(dirname(catalogCopy), { recursive: true, force: true });
});

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

describe("catalog-lock 漂移矩阵（P14 content_drift 之外的缺口 kind，逐 kind 显式检出 + 回绿）", () => {
  it("missing：lock 在册文件被删 → kind=missing 精确指路（本 catalog 全部在册条目亦为 required，missing_required 同源双报）；字节恢复后回绿", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    const lock = readCatalogLock(catalogCopy);
    // 实况：本 catalog 的 entries ⊆ required（在册即在必须实存清单），故删除任一在册
    // 文件是 missing 与 missing_required 的同源双形态——两轴各自报，不互吞。
    const victim = lock.entries[0];
    expect(victim, "catalog 至少有一条在册条目").toBeDefined();
    expect(lock.controlled_children.required).toContain(victim?.path);
    const target = join(catalogCopy, victim?.path ?? "");
    const original = readFileSync(target, "utf8");
    unlinkSync(target);
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "missing", path: victim?.path }),
    );
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "missing_required", path: victim?.path }),
    );
    // 恢复字节 → 回绿（登记在册必须实存；检出不代修，修复是恢复/重锁动作）。
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });

  it("unexpected_file：管辖目录新增未登记 .json → kind=unexpected_file；catalog status 命令面 fail-closed exit 1；清除后回绿", async () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    // 放 knowledge/（status 命令面对 policies/ 有全量物料 loader，假物料会先折入
    // CATALOG_NOT_AVAILABLE；knowledge 段计数取自 lock entries——unexpected_file 纯
    // 管辖目录对账轴的正交探针位）。
    const rogue = join(catalogCopy, "knowledge", "knowledge.rogue.extra.json");
    writeFileSync(rogue, `${JSON.stringify({ rogue: true }, null, 2)}\n`, "utf8");
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({
        kind: "unexpected_file",
        path: "knowledge/knowledge.rogue.extra.json",
      }),
    );
    // 命令面同判：fail-closed exit 1 + CATALOG_LOCK_DRIFT（新增文件形态也绝不静默绿）。
    const status = await runJson(["catalog", "status", "--catalog-root", catalogCopy]);
    expect(status.code).toBe(1);
    expect(status.envelope.ok).toBe(false);
    expect((status.envelope.errors[0] as Record<string, unknown>)["code"]).toBe(
      "CATALOG_LOCK_DRIFT",
    );
    unlinkSync(rogue);
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });

  it("entry_not_allowed：entries 登记了 controlled_children.allowed 之外的路径（lock 内部失自洽）→ 独立检出（检查先过文件存在性，与 unexpected_file 同源双报）", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    const lock = readCatalogLock(catalogCopy);
    const forgedPath = "policies/policy.forged.extra.json";
    const forged: CatalogLockDocument = {
      ...lock,
      entries: [
        ...lock.entries,
        {
          id: "POLICY.FORGED.EXTRA",
          path: forgedPath,
          content_sha256: sha256OfUtf8("{}\n"),
          source_ref: "package://test/forged-entry",
        },
      ],
    };
    // 实存文件：entry_not_allowed 检查位于文件存在性之后（缺失分支 continue），故
    // forged 文件必须实存才会触发本 kind——这本身是对账语义的一部分，测试如实钉住。
    writeFileSync(join(catalogCopy, forgedPath), "{}\n", "utf8");
    const drifted = verifyCatalogLock(catalogCopy, forged);
    expect(drifted.ok).toBe(false);
    // entries ⊄ allowed 是独立对账轴：lock 自洽面显式检出。
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "entry_not_allowed", path: forgedPath }),
    );
    // 同源双形态：该文件在盘上但不在 allowed → unexpected_file 同条在场（两轴各自报）。
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "unexpected_file", path: forgedPath }),
    );
    // 恢复回绿：盘上 forged 文件移除（若残留， unexpected_file 轴仍红）+ lock 恢复原生自洽。
    unlinkSync(join(catalogCopy, forgedPath));
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });

  it("missing_required：controlled_children.required 声明的文件缺失 → kind=missing_required", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    const lock = readCatalogLock(catalogCopy);
    const ghost = "knowledge/ghost.required.json";
    const forged: CatalogLockDocument = {
      ...lock,
      controlled_children: {
        allowed: [...lock.controlled_children.allowed, ghost],
        required: [...lock.controlled_children.required, ghost],
      },
    };
    const drifted = verifyCatalogLock(catalogCopy, forged);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "missing_required", path: ghost }),
    );
    // required ⊆ 目录实存是单向声明轴：文件在场（恢复）即回绿，entries 无感。
    writeFileSync(join(catalogCopy, ghost), `${JSON.stringify({ ghost: true }, null, 2)}\n`, "utf8");
    expect(verifyCatalogLock(catalogCopy, forged).ok).toBe(true);
  });

  it("lock_unreadable：lock JSON 坏形与 lock 缺失两种形态均显式检出（kind=lock_unreadable 指向 lock 文件自身），恢复后回绿", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    const lockPath = join(catalogCopy, "catalog-lock.draft.json");
    const original = readFileSync(lockPath, "utf8");

    // 形态一：坏形 JSON（手改损坏）。
    writeFileSync(lockPath, "{ broken json", "utf8");
    const malformed = verifyCatalogLock(catalogCopy);
    expect(malformed.ok).toBe(false);
    expect(malformed.drifts).toHaveLength(1);
    expect(malformed.drifts[0]).toMatchObject({
      kind: "lock_unreadable",
      path: "catalog-lock.draft.json",
    });

    // 形态二：lock 整文件缺失（NOT_CONFIGURED 同样折入显式检出，不静默当空账）。
    writeFileSync(lockPath, original, "utf8");
    unlinkSync(lockPath);
    const absent = verifyCatalogLock(catalogCopy);
    expect(absent.ok).toBe(false);
    expect(absent.drifts[0]).toMatchObject({
      kind: "lock_unreadable",
      path: "catalog-lock.draft.json",
    });

    // 恢复 → 回绿。
    writeFileSync(lockPath, original, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });
});
