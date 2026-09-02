/**
 * concept-ledger.spec.ts —— vNext 治理概念账本守卫（P-v06 批次 0；防治理体系
 * 自身熵增——概念账本机制沿旧体系 PRD §1.7 落地先例移植）。
 *
 * 守卫面：
 * - schema 形状（document_type/schema_version/budget_limit/rule/concepts 必备）；
 * - 状态词形二值闭包（planned/delivered——账本注记逐字）；delivered 必附 carrier
 *   且 carrier 实存（文件系统对账——「账面 delivered、盘上缺席」= 假绿）；
 * - 加权计数 ≤ budget_limit（超限=SCHEMA 式失败——新增概念必须先合并或删除）；
 * - 与旧体系账本概念名零同名重复（Owner 裁决 D-1：两账本互斥登记）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const ledgerPath = join(repoRoot, "references", "concept-ledger.yaml");
const legacyLedgerPath = join(
  repoRoot,
  "..",
  "pomaster",
  "references",
  "governance-concept-ledger.yaml",
);

interface LedgerConcept {
  readonly name: string;
  readonly count: number;
  readonly introduced_by_batch: string;
  readonly status: string;
  readonly carrier: string;
}

interface LedgerDocument {
  readonly document_type: string;
  readonly schema_version: number;
  readonly budget_limit: number;
  readonly rule: string;
  readonly accounting_note: string;
  readonly concepts: readonly LedgerConcept[];
}

const STATUS_VOCABULARY = ["planned", "delivered"] as const;

describe("vNext 概念账本守卫（references/concept-ledger.yaml）", () => {
  const raw = readFileSync(ledgerPath, "utf8");
  const ledger = yaml.load(raw) as LedgerDocument;

  it("schema 形状齐备（document_type/schema_version/budget_limit/rule/concepts）", () => {
    expect(ledger.document_type).toBe("governance-concept-ledger-vnext");
    expect(ledger.schema_version).toBe(1);
    expect(ledger.budget_limit).toBeGreaterThan(0);
    expect(typeof ledger.rule).toBe("string");
    expect(Array.isArray(ledger.concepts)).toBe(true);
  });

  it("状态词形二值闭包（planned/delivered；词表外=账本破坏）", () => {
    for (const concept of ledger.concepts) {
      expect(
        (STATUS_VOCABULARY as readonly string[]).includes(concept.status),
        `${concept.name} status 词形非法：${concept.status}`,
      ).toBe(true);
    }
  });

  it("delivered 必附 carrier 且 carrier 实存（账面 delivered、盘上缺席=假绿；全角括号注记剥离后对账）", () => {
    for (const concept of ledger.concepts) {
      if (concept.status !== "delivered") continue;
      expect(concept.carrier, `${concept.name} delivered 缺 carrier`).toBeTruthy();
      const segments = concept.carrier
        .split(/\s*\+\s*/)
        .map((segment) => segment.trim().replace(/（[^）]*）$/u, "").trim())
        .filter((segment) => segment.length > 0);
      for (const carrierPath of segments) {
        const target = join(repoRoot, carrierPath);
        expect(
          existsSync(target),
          `${concept.name} carrier 缺席：${carrierPath}`,
        ).toBe(true);
      }
    }
  });

  it("加权计数 ≤ budget_limit（超限=设计复审触发——记账规则硬闸）", () => {
    const total = ledger.concepts.reduce((sum, concept) => sum + concept.count, 0);
    expect(total).toBeLessThanOrEqual(ledger.budget_limit);
  });

  it("概念名唯一（账本内零重复）", () => {
    const names = ledger.concepts.map((concept) => concept.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("与旧体系账本概念名零同名重复（Owner 裁决 D-1：两账本互斥登记；旧账本缺席=skip 语义放行）", () => {
    if (!existsSync(legacyLedgerPath)) {
      return;
    }
    const legacy = yaml.load(readFileSync(legacyLedgerPath, "utf8")) as {
      concepts?: readonly { name?: string }[];
    };
    const legacyNames = new Set((legacy.concepts ?? []).map((c) => c.name ?? ""));
    for (const concept of ledger.concepts) {
      expect(
        legacyNames.has(concept.name),
        `概念「${concept.name}」与旧体系账本同名重复——先合并或改名`,
      ).toBe(false);
    }
  });
});
