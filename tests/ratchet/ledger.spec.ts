import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * P15 分层账本契约（tests/ratchet/floor.json · ledger）。
 *
 * 断言对象是账本文件自身的结构性不变量（策略面）：五层/四域 floor 不低于测试
 * 战略值（棘轮只升不降：actual 达标后 floor 随改动合规提升，调低即红）、
 * mapping 与磁盘 spec 分母闭合、词形合法、内部相容。运行时「实测计数
 * >= floor」由 tests/ratchet/ratchet.mjs 按 pnpm ratchet 强制——两道闸互补：
 * 本文件防账本被改坏，棘轮防测试面塌方。
 */

interface LayerDef {
  title?: string;
  floor: number;
}
interface DomainDef {
  layer: string;
  title?: string;
  floor: number;
}
interface MappingEntry {
  layer: string;
  domain?: string;
}
interface LedgerFile {
  minTests: number;
  ledger: {
    version?: number;
    layers: Record<string, LayerDef>;
    domains: Record<string, DomainDef>;
    mapping: Record<string, MappingEntry>;
    notes?: Record<string, string>;
  };
}

const specDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(specDir, "..", "..");
const repoRootPosix = repoRoot.split("\\").join("/");

const floorRaw = JSON.parse(
  readFileSync(join(repoRoot, "tests", "ratchet", "floor.json"), "utf8"),
) as LedgerFile;
const ledger = floorRaw.ledger;

const LAYER_IDS = ["L1", "L2", "L3", "L4", "L5"] as const;
const DOMAIN_IDS = [
  "ir_invariants",
  "state_machine_pairs",
  "permit_evidence",
  "router_matrix",
] as const;

/** 测试战略承诺下限（docs/wave3-research-toolchain.md §2 L1-L5 行 + wave3-plan.md P15）。 */
const STRATEGY_LAYER_FLOORS: Record<(typeof LAYER_IDS)[number], number> = {
  L1: 400,
  L2: 120,
  L3: 50,
  L4: 20,
  L5: 15,
};
const STRATEGY_DOMAIN_FLOORS: Record<(typeof DOMAIN_IDS)[number], number> = {
  ir_invariants: 150,
  state_machine_pairs: 120,
  permit_evidence: 80,
  router_matrix: 60,
};

/** 与根 vitest.config.ts include 同口径：tests/** 与 packages/** 下的 *.spec.ts。 */
function listSpecFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSpecFiles(full, out);
    } else if (entry.name.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("P15 分层账本契约（tests/ratchet/floor.json · ledger）", () => {
  it("台账结构合法：minTests 非负整数；L1-L5 五层与 L1 四域 floors 均为非负整数", () => {
    expect(Number.isInteger(floorRaw.minTests)).toBe(true);
    expect(floorRaw.minTests).toBeGreaterThanOrEqual(0);
    for (const id of LAYER_IDS) {
      const def = ledger.layers[id];
      expect(def, `layer ${id} 定义在场`).toBeTruthy();
      expect(def?.floor, `layer ${id} floor 为非负整数`).toEqual(
        expect.any(Number),
      );
      expect(def?.floor, `layer ${id} floor >= 0`).toBeGreaterThanOrEqual(0);
    }
    for (const id of DOMAIN_IDS) {
      const def = ledger.domains[id];
      expect(def, `domain ${id} 定义在场`).toBeTruthy();
      expect(def?.floor, `domain ${id} floor 为非负整数`).toEqual(
        expect.any(Number),
      );
      expect(def?.layer, `domain ${id} 挂 L1 层`).toBe("L1");
    }
  });

  it("L1 四域与五层 floor 不得低于测试战略值（IR 150/状态机 120/Permit·Evidence 80/Router 60；L1 400/L2 120/L3 50/L4 20/L5 15；棘轮只升不降——actual 达标后 floor 随改动提升，调低即红）", () => {
    for (const [id, expected] of Object.entries(STRATEGY_DOMAIN_FLOORS)) {
      expect(ledger.domains[id]?.floor, `domain ${id}`).toBeGreaterThanOrEqual(expected);
    }
    for (const [id, expected] of Object.entries(STRATEGY_LAYER_FLOORS)) {
      expect(ledger.layers[id]?.floor, `layer ${id}`).toBeGreaterThanOrEqual(expected);
    }
  });

  it("mapping 分母闭合：磁盘上全部 *.spec.ts（vitest include 同口径）与 mapping 键集合全等", () => {
    const onDisk = [
      ...listSpecFiles(join(repoRoot, "tests")),
      ...listSpecFiles(join(repoRoot, "packages")),
    ]
      .map((p) => {
        const posix = p.split("\\").join("/");
        return posix.startsWith(`${repoRootPosix}/`)
          ? posix.slice(repoRootPosix.length + 1)
          : posix;
      })
      .sort();
    expect(onDisk.length, "磁盘上确有 spec 文件（分母非空）").toBeGreaterThan(0);
    const mapped = Object.keys(ledger.mapping)
      .map((k) => k.split("\\").join("/"))
      .sort();
    expect(mapped, "mapping 与磁盘 spec 分母逐一对等（双向：无未归类、无 stale）").toEqual(
      onDisk,
    );
  });

  it("mapping 词形合法：layer ∈ 五层闭包；domain ∈ 四域闭包且与条目 layer 一致；带 domain 的文件必在 packages/ 下（L1=单元层）", () => {
    expect(Object.keys(ledger.mapping).length, "mapping 非空").toBeGreaterThan(0);
    for (const [file, entry] of Object.entries(ledger.mapping)) {
      expect(
        ledger.layers[entry.layer],
        `${file}: layer ${entry.layer} 已定义`,
      ).toBeTruthy();
      if (entry.domain !== undefined) {
        expect(
          ledger.domains[entry.domain],
          `${file}: domain ${entry.domain} 已定义`,
        ).toBeTruthy();
        expect(
          ledger.domains[entry.domain]?.layer,
          `${file}: domain 定义层与条目 layer 一致`,
        ).toBe(entry.layer);
        expect(
          file.split("\\").join("/").startsWith("packages/"),
          `${file}: 带域条目必须在 packages/（L1 单元层）`,
        ).toBe(true);
      }
    }
  });

  it("账本内部相容：四域 floor 之和 >= L1 层 floor（战略 410>=400，防 L1 被迫靠域外凑数）；minTests >= 五层 floor 之和", () => {
    const domainSum = DOMAIN_IDS.reduce((s, id) => s + (ledger.domains[id]?.floor ?? 0), 0);
    expect(domainSum).toBeGreaterThanOrEqual(ledger.layers.L1?.floor ?? Number.MAX_SAFE_INTEGER);
    const layerSum = LAYER_IDS.reduce((s, id) => s + (ledger.layers[id]?.floor ?? 0), 0);
    expect(floorRaw.minTests, "总 floor 不得低于各层 floor 之和").toBeGreaterThanOrEqual(layerSum);
  });
});
