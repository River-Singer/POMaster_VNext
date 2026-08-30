/**
 * catalog.spec.ts —— `pomaster catalog status|explain`（§44.10；P14 Catalog→运行时联结）。
 *
 * 三道守门：
 * 1) status：catalog 构成（版本/profile/分区计数分母 94/3/1）+ lock 校验呈现；
 * 2) explain：单条目 lock 身份层 + 正文策展字段层 + 该条目漂移行；
 * 3) 漂移命令面：临时 catalog 副本改物料不重锁 → CATALOG_LOCK_DRIFT fail-closed
 *    （catalog 物料被改而 lock 未重锁 → 显式检出，出口判据 4 的命令面形态）。
 *
 * 纯读零 store 依赖：catalog 是工具侧策展资产（§92.2），未 init 目录同样可查——
 * 本 spec 全程不建 .pomaster。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readCatalogLock,
  resolveCatalogRoot,
} from "@pomaster/kernel";
import { runCatalogExplain, runCatalogStatus } from "@pomaster/cli";

const REPO_CATALOG = resolveCatalogRoot();

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(() => {
  for (const root of tempRoots) rmSync(dirname(root), { recursive: true, force: true });
});

function trackTempCatalog(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-catalog-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  tempRoots.push(catalogRoot);
  return catalogRoot;
}

describe("catalog status（catalog 构成 + lock 校验）", () => {
  it("repo 实物：版本/profile/分区计数分母 + lock 全绿 + human 行", async () => {
    const outcome = await runCatalogStatus();
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.catalog_version).toBe("0.1.0-pilot");
    expect(outcome.result.profile).toBe("web-standard@0");
    expect(outcome.result.entries_total).toBe(94);
    expect(outcome.result.sections).toEqual({
      policies: 79,
      gates: 5,
      knowledge: 10,
      tools: 3,
      projection_presets: 1,
    });
    expect(outcome.result.lock_verification).toEqual({
      ok: true,
      entries_checked: 94,
      drifts: [],
    });
    expect(outcome.human.join("\n")).toContain("catalog-lock: ok（94 entries");
  });

  it("漂移检出：改 policy 字节不重锁 → ok=false + CATALOG_LOCK_DRIFT（fail-closed 呈现）", async () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    // 合法 JSON 内容变更（坏 JSON 走 SCHEMA_INVALID，内容失配才是 content_drift）。
    writeFileSync(
      target,
      original.replace("统一 HTTP Client 单点处理", "统一 HTTP Client 单点处理（漂移测试变更）"),
      "utf8",
    );
    const outcome = await runCatalogStatus({ catalogRoot });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CATALOG_LOCK_DRIFT");
    expect(outcome.errors[0]?.hint).toContain("重锁");
    expect(outcome.result.lock_verification.ok).toBe(false);
    expect(
      outcome.result.lock_verification.drifts.some(
        (drift) => drift.kind === "content_drift" && drift.path.endsWith("single_http_client.json"),
      ),
    ).toBe(true);
    expect(outcome.human.join("\n")).toContain("catalog-lock: DRIFT");
  });
});

describe("catalog explain（单条目解释）", () => {
  it("policy 条目：lock 身份层 + 正文策展字段 + 本条目校验 ok", async () => {
    const outcome = await runCatalogExplain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(outcome.ok).toBe(true);
    const lockEntry = readCatalogLock(REPO_CATALOG).entries.find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(outcome.result.file).toBe("policies/policy.web.api.single_http_client.json");
    expect(outcome.result.content_sha256).toBe(lockEntry?.content_sha256);
    expect(outcome.result.source_ref).toContain("15-request-api-protocol.md");
    expect(outcome.result.drifts).toEqual([]);
    expect(outcome.result.material.title_zh).toBe("HTTP Client 单点统一");
    expect(outcome.result.material.statement_zh).toContain("统一 HTTP Client");
    expect(outcome.result.material.lane).toBe("frontend");
    expect(outcome.result.material.enforcement).toBe("required_when_applicable");
    expect(outcome.human.join("\n")).toContain("lock 校验: ok");
  });

  it("漂移条目：该条目 lock 哈希失配 → result.drifts 精确携带本条目漂移行", async () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(
      target,
      original.replace("统一 HTTP Client 单点处理", "统一 HTTP Client 单点处理（漂移测试变更）"),
      "utf8",
    );
    const outcome = await runCatalogExplain("POLICY.WEB.API.SINGLE_HTTP_CLIENT", { catalogRoot });
    expect(outcome.ok).toBe(true); // explain 是纯读查看器：漂移进结果不炸命令面
    expect(outcome.result.drifts).toEqual([
      expect.objectContaining({ kind: "content_drift" }),
    ]);
    expect(outcome.human.join("\n")).toContain("lock 校验: DRIFT");
  });

  it("未登记 id → CATALOG_ENTRY_NOT_FOUND（hint 指向 catalog status 分母）", async () => {
    const outcome = await runCatalogExplain("POLICY.DOES.NOT_EXIST");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CATALOG_ENTRY_NOT_FOUND");
    expect(outcome.errors[0]?.hint).toContain("catalog status");
  });
});
