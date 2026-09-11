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
 *
 * 09-11 fs-cas-install-enoent 批：casSwapFile 全步错误归类（fs-cas.ts 头注矩阵）
 * 的回归钉挂本文件——「全步错误归类」describe（casSwapFile 五步注入式故障 +
 * runBaselineSet 注入链：CasSwapFs 注入面，SpawnFn/ExecutableProbeFn 同族；确定性
 * 脚本化故障，禁真并发碰运气）+ 双子进程 CRASH 词形禁现断言（回装步认领位 ENOENT
 * 曾裸逃成子进程 CRASH——CI run 34610508238 实证病灶，本 spec round2 B 首发）。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
import { casSwapFile, nodeCasSwapFs, type CasSwapFs } from "../../packages/cli/src/fs-cas.js";

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
      // CRASH 词形禁现（09-11 fs-cas-install-enoent R3）：casSwapFile 全步错误归类
      // 前，回装步认领位 ENOENT 曾裸逃成本文件的 round2 B CRASH（CI run 34610508238
      // job 103299571）——子进程 stderr 禁含 CRASH/FATAL 裸错误词形。
      expect(first.err, `round${round} A stderr: ${first.err}`).not.toMatch(/CRASH|FATAL/);
      expect(second.err, `round${round} B stderr: ${second.err}`).not.toMatch(/CRASH|FATAL/);
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

// ============================================================
// casSwapFile 全步错误归类（09-11 fs-cas-install-enoent：注入式回归钉——禁真并发）
// ============================================================
//
// fs-cas.ts 头注归类矩阵的机器钉：五步仪式（tmp 落盘 / 认领 / 字节复核 / 回装 /
// link 回装）× 注入错误码（ENOENT/EPERM/EACCES/ENOSPC/EEXIST）逐一断言——零裸
// fs 错误逃逸（casSwapFile 零 throw）、瞬时/交错类 → contended（附成因词形）、
// persistent → 受控 fault、EEXIST → conflict（既有语义）。注入面 = CasSwapFs
//（SpawnFn/ExecutableProbeFn 同族：缺省 nodeCasSwapFs 真机实现，测试脚本化故障）；
// 交错动作确定性内嵌于注入位（无线程无时序碰运气），回装步精确交错钉 = CI
// run 34610508238 job 103299571 的「round2 B CRASH ENOENT r1claim」原生复现形态。
describe("casSwapFile 全步错误归类（09-11 fs-cas-install-enoent：注入式回归钉——禁真并发）", () => {
  const roots: string[] = [];
  const newRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-r1-cas-fault-"));
    roots.push(root);
    return root;
  };
  afterEach(() => {
    roots.length = 0; // 临时目录留给 OS tmp 清理（Windows EBUSY 噪声规避，同上纪律）
  });

  /** ErrnoException 词形故障（注入 op 抛出——fs-cas 归类矩阵的输入形态）。 */
  function err(code: string): NodeJS.ErrnoException {
    const error = new Error(`injected ${code}`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  }

  /** contended 收窄（cause 成因词形断言用）；非 contended 即显式失败（禁静默换形）。 */
  function asContended(outcome: ReturnType<typeof casSwapFile>): { kind: "contended"; cause: string } {
    if (outcome.kind !== "contended") throw new Error(`应 contended，实际 ${JSON.stringify(outcome)}`);
    return outcome;
  }

  /** fault 收窄（code/cause 断言用）。 */
  function asFault(outcome: ReturnType<typeof casSwapFile>): { kind: "fault"; code: string; cause: string } {
    if (outcome.kind !== "fault") throw new Error(`应 fault，实际 ${JSON.stringify(outcome)}`);
    return outcome;
  }

  /** r1 残片清点（claim/tmp 邻接名——inert 残面纪律的观察位）。 */
  function casResidues(dir: string, baseName: string): string[] {
    return readdirSync(dir).filter((f) => f.startsWith(`${baseName}.r1`));
  }

  it("步1 tmp 落盘 ENOENT → contended（附成因词形；目标零触碰零残片）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      writeFileSync: () => {
        throw err("ENOENT");
      },
    };
    const contended = asContended(casSwapFile(target, "A", "B", injected));
    expect(contended.cause).toContain("tmp 落盘");
    expect(contended.cause).toContain("ENOENT");
    expect(readFileSync(target, "utf8")).toBe("A");
    expect(casResidues(root, "file.txt")).toEqual([]);
  });

  it("步1 tmp 落盘 EPERM → contended（瞬时锁类；零 throw）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      writeFileSync: () => {
        throw err("EPERM");
      },
    };
    const contended = asContended(casSwapFile(target, "A", "B", injected));
    expect(contended.cause).toContain("EPERM");
    expect(readFileSync(target, "utf8")).toBe("A");
  });

  it("步1 tmp 落盘 ENOSPC → 受控 fault（persistent 不裸抛；code=errno 词形）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      writeFileSync: () => {
        throw err("ENOSPC");
      },
    };
    const fault = asFault(casSwapFile(target, "A", "B", injected));
    expect(fault.code).toBe("ENOSPC");
    expect(fault.cause).toContain("tmp 落盘");
    expect(readFileSync(target, "utf8")).toBe("A");
  });

  it("步2 认领 ENOENT → absent（认领胜负语义不变；零残片）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      renameSync: () => {
        throw err("ENOENT");
      },
    };
    expect(casSwapFile(target, "A", "B", injected)).toEqual({ kind: "absent" });
    expect(readFileSync(target, "utf8")).toBe("A");
    expect(casResidues(root, "file.txt")).toEqual([]);
  });

  it("步2 认领 EPERM 有界重试耗尽 → contended（认领失败零状态变更；无残片）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      renameSync: () => {
        throw err("EPERM");
      },
    };
    const contended = asContended(casSwapFile(target, "A", "B", injected));
    expect(contended.cause).toContain("认领");
    expect(contended.cause).toContain("耗尽");
    expect(contended.cause).toContain("EPERM");
    // 认领未发生：目标原样在座（零状态变更——重试安全性的行为面证明）。
    expect(readFileSync(target, "utf8")).toBe("A");
    expect(casResidues(root, "file.txt")).toEqual([]);
  });

  it("步2 认领 EPERM 谎报（首次物理认领成功）→ 防御复核吞掉 → swapped（零残片）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const realRename = nodeCasSwapFs.renameSync;
    let renameCalls = 0;
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      renameSync: (src, dst) => {
        renameCalls += 1;
        realRename(src, dst); // 物理认领成功
        if (renameCalls === 1) throw err("EPERM"); // Windows 谎报形态
        // 第二次尝试：源已被首次搬走 → 真实 fs ENOENT → 防御复核 dst 在座吞掉。
      },
    };
    expect(casSwapFile(target, "A", "B", injected)).toEqual({ kind: "swapped" });
    expect(readFileSync(target, "utf8")).toBe("B");
    expect(readdirSync(root).sort()).toEqual(["file.txt"]);
  });

  it("步3 字节复核不可读（EACCES/ENOENT）→ 世代不可证明按 conflict 归还原位（目标字节复原）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      readFileSync: () => {
        throw err("EACCES");
      },
    };
    expect(casSwapFile(target, "A", "B", injected)).toEqual({ kind: "conflict" });
    // 原样归还原位：旧世代字节复原，零覆盖零丢失。
    expect(readFileSync(target, "utf8")).toBe("A");
    expect(casResidues(root, "file.txt")).toEqual([]);
    // ENOENT 同列（矩阵行 3「同左」：吞——世代不可证明，与 EACCES 同一处置路径；
    // 每步 ENOENT/EPERM 至少各 1 的矩阵完备性钉）。
    writeFileSync(target, "A", "utf8");
    const enoentInjected: CasSwapFs = {
      ...nodeCasSwapFs,
      readFileSync: () => {
        throw err("ENOENT");
      },
    };
    expect(casSwapFile(target, "A", "B", enoentInjected)).toEqual({ kind: "conflict" });
    expect(readFileSync(target, "utf8")).toBe("A");
    expect(casResidues(root, "file.txt")).toEqual([]);
  });

  it("步4 回装 ENOENT：claim 被对手交错取走（CI run 34610508238 精确交错钉）→ contended 不崩", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    const opponentClaim = `${target}.opp`;
    writeFileSync(target, "A", "utf8");
    const realRename = nodeCasSwapFs.renameSync;
    let renameCalls = 0;
    let opponentClaimed = false;
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      renameSync: (src, dst) => {
        renameCalls += 1;
        if (renameCalls === 1) return realRename(src, dst); // 步 2 认领：真实放行
        // 步 4 回装首次尝试：物理归位成功却被伪报 EPERM（Windows 谎报形态）。
        realRename(src, dst);
        throw err("EPERM");
      },
      existsSync: (p) => {
        if (!opponentClaimed && p === target) {
          // 对手在退避窗口内认领走刚归位的世代——交错动作确定性内嵌于防御查证位。
          opponentClaimed = true;
          realRename(target, opponentClaim);
        }
        return nodeCasSwapFs.existsSync(p);
      },
    };
    // expected="B" ≠ 现盘 "A"：认领成功 → 字节复核不匹配 → 回装步。修复前此处
    // 裸 ENOENT 逃逸成子进程 CRASH（liar 防御只查 dst——对手取走后 dst 缺席即裸抛）。
    const contended = asContended(casSwapFile(target, "B", "C", injected));
    expect(contended.cause).toContain("回装");
    expect(contended.cause).toContain("claim");
    // 交错终态：旧世代 "A" 由对手持有（.opp 认领位），本方零写零崩（不崩 = 本断言可达）。
    expect(opponentClaimed).toBe(true);
    expect(readFileSync(opponentClaim, "utf8")).toBe("A");
    expect(existsSync(target)).toBe(false);
    expect(casResidues(root, "file.txt")).toEqual([]);
  });

  it("步4 回装 EPERM 真锁重试耗尽 → contended（claim 原样留盘——禁静默丢世代）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const realRename = nodeCasSwapFs.renameSync;
    let renameCalls = 0;
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      renameSync: (src, dst) => {
        renameCalls += 1;
        if (renameCalls === 1) return realRename(src, dst); // 步 2 认领：真实放行
        throw err("EPERM"); // 回装被真锁持续拒绝（未物理发生）
      },
    };
    const contended = asContended(casSwapFile(target, "B", "C", injected));
    expect(contended.cause).toContain("回装");
    expect(contended.cause).toContain("耗尽");
    // claim 原样留盘（认领内容未受损——不静默丢世代，残片 inert 不参与读面）。
    expect(casResidues(root, "file.txt").some((f) => f.includes(".r1claim-"))).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  it("步5 link ENOENT → contended（安装位被并发方移除；claim 原样留盘）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      linkSync: () => {
        throw err("ENOENT");
      },
    };
    const contended = asContended(casSwapFile(target, "A", "B", injected));
    expect(contended.cause).toContain("link 回装");
    expect(contended.cause).toContain("claim 原样留盘");
    expect(contended.cause).toContain("ENOENT");
    expect(casResidues(root, "file.txt").some((f) => f.includes(".r1claim-"))).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  it("步5 link EPERM → contended（瞬时锁；claim 原样留盘）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      linkSync: () => {
        throw err("EPERM");
      },
    };
    const contended = asContended(casSwapFile(target, "A", "B", injected));
    expect(contended.cause).toContain("link 回装");
    expect(contended.cause).toContain("EPERM");
    expect(existsSync(target)).toBe(false);
  });

  it("步5 link EEXIST → conflict（非 CAS 写方插入新世代——既有语义零回退）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      linkSync: () => {
        throw err("EEXIST");
      },
    };
    expect(casSwapFile(target, "A", "B", injected)).toEqual({ kind: "conflict" });
    // claim 原样留盘（新世代已由对手在座，认领内容未损——既有纪律）。
    expect(casResidues(root, "file.txt").some((f) => f.includes(".r1claim-"))).toBe(true);
  });

  it("步5 link ENOSPC → 受控 fault（persistent；claim 原样留盘可辨）", () => {
    const root = newRoot();
    const target = join(root, "file.txt");
    writeFileSync(target, "A", "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      linkSync: () => {
        throw err("ENOSPC");
      },
    };
    const fault = asFault(casSwapFile(target, "A", "B", injected));
    expect(fault.code).toBe("ENOSPC");
    expect(fault.cause).toContain("link 回装");
    expect(casResidues(root, "file.txt").some((f) => f.includes(".r1claim-"))).toBe(true);
  });

  it("链级：注入认领前 tmp 落盘 EPERM → 4 轮 contended 重试耗尽受控冲突（成因词形随耗尽呈现；零 CRASH）", async () => {
    const root = newRoot();
    await runInit(root);
    const manifestBefore = readFileSync(join(root, BASELINE_MANIFEST_RELATIVE), "utf8");
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      writeFileSync: () => {
        throw err("EPERM");
      },
    };
    // 不崩 = 本调用正常resolve出受控信封（修复前任何一步裸 fs 错误都会抛出逃逸）。
    const outcome = await runBaselineSet(root, { lane: "frontend", key: "framework", value: "vue3" }, injected);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_WRITE_CONFLICT");
    // 4 轮有界重试确实走满（瞬时/交错类进重试环，不快败）。
    expect(outcome.errors[0]?.message).toContain("4 轮");
    // contended 成因词形（附步位）随耗尽呈现——操作者可辨 tmp 落盘位。
    expect(outcome.errors[0]?.message).toContain("最近认领交错成因");
    expect(outcome.errors[0]?.message).toContain("tmp 落盘");
    // fail-closed 零写入：manifest 逐字节不动。
    expect(readFileSync(join(root, BASELINE_MANIFEST_RELATIVE), "utf8")).toBe(manifestBefore);
  });

  it("链级：注入 link 回装 ENOSPC（persistent）→ 即时受控 BASELINE_WRITE_CONFLICT 信封（claim inert 残片可辨；不进重试环）", async () => {
    const root = newRoot();
    await runInit(root);
    const injected: CasSwapFs = {
      ...nodeCasSwapFs,
      linkSync: () => {
        throw err("ENOSPC");
      },
    };
    const outcome = await runBaselineSet(root, { lane: "frontend", key: "framework", value: "vue3" }, injected);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_WRITE_CONFLICT");
    // persistent 受控形态：errno 词形 + 步位成因点名，即时收束（不走 4 轮重试空转）。
    expect(outcome.errors[0]?.message).toContain("持续文件系统故障");
    expect(outcome.errors[0]?.message).toContain("errno=ENOSPC");
    expect(outcome.errors[0]?.message).not.toContain("4 轮");
    // 认领位 inert 残片在盘可辨（认领内容未受损——禁静默丢世代；不参与读面）。
    const residueDirs = [
      dirname(join(root, BASELINE_MANIFEST_RELATIVE)),
      dirname(join(root, baselineStackRelative("frontend"))),
    ];
    expect(residueDirs.some((d) => readdirSync(d).some((f) => f.includes(".r1claim-")))).toBe(true);
  });
});
