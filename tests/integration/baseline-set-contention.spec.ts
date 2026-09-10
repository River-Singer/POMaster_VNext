/**
 * baseline-set-contention.spec.ts —— 审计 R1 回归：并行 baseline set 的跨进程
 * 并发安全（lost update 封堵）。
 *
 * 病灶（audit-report §2 R1）：baseline set 的 stack+manifest 读-改-写链无共享
 * 临界区、无版本比较——双子进程各从旧状态计算、整文件覆盖，后写覆盖先写，双方
 * 都报 UPDATED 而盘面只留一击（并发五轮 5/5 复现的静默丢写）。
 *
 * 纪律（steal-contention-child.mjs 同源）：真并发只能靠独立进程——非 spec 的
 * child 脚本（baseline-set-contention-child.mjs，不入 ratchet mapping）直接
 * import cli dist；父测试 spawn 双子进程同拍起跑各 set frontend 两键之一，修复
 * 后判据 = 双 UPDATED 双落盘（stack 两键同在 + pending batch 双条 + 台账双销 +
 * unknowns_remaining=0——confirm 已把台账收编进确认记录，确认后台账本就为空，
 * 两键词形住在 pending batch）。修复 = 文件级 CAS 事务（packages/cli/src/fs-cas.ts，
 * kernel swapLockCas 认领仪式 + withBoundedRetry 确定性退避同族）。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  BASELINE_LANES,
  BASELINE_MANIFEST_RELATIVE,
  STACK_KEYS,
  baselineStackRelative,
  runBaselineConfirm,
  runBaselineSet,
  runInit,
} from "@pomaster/cli";
import { casSwapFile } from "../../packages/cli/src/fs-cas.js";

const here = join(fileURLToPath(new URL(import.meta.url)), "..");
const childScript = join(here, "baseline-set-contention-child.mjs");

const CHANGE_REF = "CHANGE.R1CONC";

interface SetChildResult {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** 起一个争用子进程（cli dist 的 runBaselineSet：SET {json} / FAILED {json}）。 */
function spawnSetChild(
  root: string,
  lane: string,
  key: string,
  value: string,
): Promise<SetChildResult> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [childScript, root, lane, key, value, CHANGE_REF],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ code: code ?? -1, out, err }));
  });
}

function parseSetLine(text: string, label: string): {
  change: string;
  unknowns_remaining: number;
  confirmation_invalidated: boolean;
} {
  const match = /SET (\{.*\})/.exec(text);
  expect(match, `${label} 应输出 SET 行: ${text}`).not.toBeNull();
  return JSON.parse(match?.[1] ?? "{}") as {
    change: string;
    unknowns_remaining: number;
    confirmation_invalidated: boolean;
  };
}

/** 治理通路对象夹具（baseline.spec seedGovernedFixture 同款：kernel applyTransaction 唯一写通道）。 */
async function seedChangeObject(root: string, id: string): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind: "change_object",
          axisProfile: "change_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "治理通路夹具（R1 并发回归）",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            motivation: "治理通路授权的基线修改",
            affected_objects: ["CAPABILITY.DEMO"],
            reopen_count: 0,
            class_scan_result: {
              scope: "src/shared/**",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-0001",
            },
          },
        } as never,
      },
    ],
  });
}

/** 全链已确认项目夹具（baseline.spec fillAllKeys 同底座）：init → 14 键销账 → confirm。 */
async function seedConfirmedProject(root: string): Promise<void> {
  await runInit(root);
  for (const lane of BASELINE_LANES) {
    for (const key of STACK_KEYS[lane]) {
      const outcome = await runBaselineSet(root, {
        lane,
        key,
        value: key === "cache" || key === "grid" ? "none" : `${key}-value`,
      });
      expect(outcome.ok, `${lane}.${key}`).toBe(true);
    }
  }
  const confirmed = await runBaselineConfirm(root);
  expect(confirmed.ok).toBe(true);
  await seedChangeObject(root, CHANGE_REF);
}

/** 双落盘判卷（修复后的语义分母——串行/并发两路共用）：stack 两键同在 + 台账双销 + 批内双条。 */
function expectBothKeysPersisted(root: string, frameworkValue: string, routerValue: string): void {
  const stack = readFileSync(join(root, baselineStackRelative("frontend")), "utf8");
  expect(stack).toContain(`framework: ${frameworkValue}`);
  expect(stack).toContain(`router: ${routerValue}`);
  // 旧值零残留（lost update 的 stack 半边病灶：后写整文件覆盖把先写键打回旧值）。
  expect(stack).not.toContain("framework: framework-value");
  expect(stack).not.toContain("router: router-value");

  const manifest = readFileSync(join(root, BASELINE_MANIFEST_RELATIVE), "utf8");
  // 台账双销：flat 行（2 空格缩进）双双不在——丢写方的 manifest 覆盖会让对方的
  // 销账行回魂（含 4 空格缩进的缩进歧义，一律以行锚 + 精确缩进判）。
  expect(manifest).not.toMatch(/^ {2}- baseline\/frontend\/stack\.yaml:framework$/m);
  expect(manifest).not.toMatch(/^ {2}- baseline\/frontend\/stack\.yaml:router$/m);
  // pending batch 双条（丢写方的覆盖会让批只剩自己那一键）。
  expect(manifest).toMatch(/^ {6}- baseline\/frontend\/stack\.yaml:framework$/m);
  expect(manifest).toMatch(/^ {6}- baseline\/frontend\/stack\.yaml:router$/m);
  expect(manifest).toContain(`change_ref: ${CHANGE_REF}`);
}

describe("baseline set 并发安全（审计 R1：并行 set 双 UPDATED 双落盘）", () => {
  it("串行对照：同 CHANGE 连改两键，双键双落盘（丢写只在跨进程交错出现）", async () => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-r1-baseline-serial-"));
    await seedConfirmedProject(root);
    const first = await runBaselineSet(root, {
      lane: "frontend", key: "framework", value: "alt-framework-s", change: CHANGE_REF,
    });
    const second = await runBaselineSet(root, {
      lane: "frontend", key: "router", value: "alt-router-s", change: CHANGE_REF,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.result.change).toBe("UPDATED");
    expect(second.result.change).toBe("UPDATED");
    expect(second.result.confirmation_invalidated).toBe(true);
    expectBothKeysPersisted(root, "alt-framework-s", "alt-router-s");
  });

  it("双子进程同拍 set 两键：双双 UPDATED 且双落盘（stack 两键 + 批双条 + 台账双销 + unknowns=0）；三轮往复", async () => {
    for (let round = 1; round <= 3; round += 1) {
      const root = mkdtempSync(join(tmpdir(), "pomaster-r1-baseline-conc-"));
      await seedConfirmedProject(root);
      const frameworkValue = `alt-framework-${round}`;
      const routerValue = `alt-router-${round}`;
      // 真并发：两独立子进程同拍起跑（同进程 Promise.all 会串行化同步 IO——假通过）。
      const [first, second] = await Promise.all([
        spawnSetChild(root, "frontend", "framework", frameworkValue),
        spawnSetChild(root, "frontend", "router", routerValue),
      ]);
      expect(first.code, `round${round} A stderr: ${first.err}`).toBe(0);
      expect(second.code, `round${round} B stderr: ${second.err}`).toBe(0);
      const firstResult = parseSetLine(first.out, `round${round} A`);
      const secondResult = parseSetLine(second.out, `round${round} B`);
      expect(firstResult.change).toBe("UPDATED");
      expect(secondResult.change).toBe("UPDATED");
      // 确认后台账为空（confirm 已收编全部台账行）：unknowns_remaining 恒 0，
      // 两键的销账词形在 pending batch 内（expectBothKeysPersisted 断言批双条）。
      expect(firstResult.unknowns_remaining).toBe(0);
      expect(secondResult.unknowns_remaining).toBe(0);
      expect(firstResult.confirmation_invalidated).toBe(true);
      expect(secondResult.confirmation_invalidated).toBe(true);
      expectBothKeysPersisted(root, frameworkValue, routerValue);
    }
  }, 120_000);
});

describe("casSwapFile（文件级 CAS 原语：认领-比对-安装的三态语义）", () => {
  const roots: string[] = [];
  const newRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-r1-cas-"));
    roots.push(root);
    return root;
  };
  afterEach(() => {
    roots.length = 0; // 临时目录留给 OS tmp 清理（Windows EBUSY 噪声规避，同 L4 spec 纪律）
  });

  it("认领到他人新世代 → conflict 且零触碰；目标缺席 → absent；匹配 → swapped 且无残片", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");

    // expected 与现盘不符：conflict，目标字节零触碰（认领后原样归还原位）。
    expect(casSwapFile(target, "B", "C")).toEqual({ kind: "conflict" });
    expect(readFileSync(target, "utf8")).toBe("A");

    // 认领时目标缺席：absent（并发方移除——调用方走缺席语义，不猜测重写）。
    expect(casSwapFile(join(root, "absent.txt"), "A", "B")).toEqual({ kind: "absent" });

    // 匹配：swapped，next 原子安装到位。
    expect(casSwapFile(target, "A", "B")).toEqual({ kind: "swapped" });
    expect(readFileSync(target, "utf8")).toBe("B");

    // 成功路径零残片：claim/tmp 邻接名全部退役；absent 路径不发明目标文件
    // （目录项唯一 = 既有目标本身）。
    expect(readdirSync(root).sort()).toEqual(["file.txt"]);
  });
});
