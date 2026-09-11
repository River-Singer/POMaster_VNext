/**
 * fs-cas.ts —— 文件级 CAS 交换写（跨进程读-改-写链的并发安全原语；审计 R1）。
 *
 * 病灶（audit-report §2 R1）：`baseline set` 的 stack+manifest 读-改-写链无共享
 * 临界区、无版本比较——两进程各从旧状态计算、整文件覆盖，后写覆盖先写，双方都
 * 报 UPDATED（并发五轮 5/5 静默丢写）。文件系统没有 compare-and-swap，本原语沿
 * kernel 既有机制同族落法（禁第二套锁体系——无持有人/无 ttl/无 journal，不是锁，
 * 是「比对-安装」原子化）：
 *
 * - 独占认领 = kernel locks.ts swapLockCas 的认领仪式（rename target→claim 原子
 *   唯一胜出；认领后字节复核；linkSync 独占回装——认领-复核-回装窗口内 target
 *   缺席，其余认领者一律 ENOENT → 任意交错下「比对-安装」原子成立）；
 * - 瞬时重试 = kernel io.ts withBoundedRetry 同款确定性退避（20/50/100ms，无随机
 *   ——并发测试可复现；Windows 并发 rename 的瞬时 EPERM/EACCES，io.ts 发现 4 同源；
 *   ENOENT 不吃盲重试——它是认领胜负语义，由本原语显式消费为 absent/conflict）；
 * - 冲突语义 = 调用方整链重读重算重判卷（baseline set 消费），重试耗尽显式冲突
 *   错误（BASELINE_WRITE_CONFLICT，hint 指路重跑），禁静默丢写。
 *
 * kernel 公共契约面（docs/kernel-api.md 1:1 纪律）不为 CLI 内部并发原语扩位，且
 * 深路径导入（dist/io.js）禁断——withBoundedRetry/sleepSync 在此本地复刻，机制
 * 出处以本头注锚定（locks.ts/io.ts 注释为唯一先例源）。
 *
 * 诚实披露（认领窗口）：认领-回装窗口内 target 对并发读者瞬态缺席（conflict 归还
 * 路径走 rename 原样还原、零窗口；仅成功安装路径有 syscall 级窗口）——读面缺席
 * 语义 fail-closed（绝不猜测重写；消费侧按 manifest 在座性分类——已播种走有界
 * 重读后显式冲突、未播种 NOT_CONFIGURED，见 baseline.ts ADR-21 缺席读分类，
 * 09-11 ci-cas-window）。崩溃至多留下 inert 残片
 * （claim/tmp 同目录邻接名，不参与读面；locks.ts「claim 原样留盘」同纪律）。
 */
import { existsSync, linkSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

/**
 * casSwapFile 显式三态：swapped = 认领-比对-安装成功（next 已在位）；conflict =
 * 认领到他人已换入的新世代（现盘字节 ≠ expected——调用方重读重算）；absent =
 * 认领时目标已缺席（并发方移除——调用方走缺席语义）。
 */
export type CasSwapOutcome =
  | { readonly kind: "swapped" }
  | { readonly kind: "conflict" }
  | { readonly kind: "absent" };

/** 认领/归还原位 rename 的瞬时锁重试档（io.ts IO_RETRY_DELAYS_MS 逐字同族；无随机）。 */
const CLAIM_RETRY_DELAYS_MS: readonly number[] = [20, 50, 100];

/** 确定性同步等待（io.ts sleepSync 同款：Atomics.wait 优先，宿主不可用忙等兜底）。 */
export function sleepSync(ms: number): void {
  if (ms <= 0) return;
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  try {
    Atomics.wait(buffer, 0, 0, ms);
  } catch {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* spin：确定性时长兜底 */
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * 认领 rename 的瞬时锁判定（io.ts isTransientSwapError 收窄）：EPERM/EACCES 吃
 * 有界重试（并发读者/写方持句柄的 Windows 瞬时锁）；ENOENT 不重试——认领胜负
 * 语义由 casSwapFile 显式消费，盲重试只会把认领胜负伪装成环境故障。
 */
function isTransientClaimError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "EPERM" || code === "EACCES";
}

/**
 * rename 的「撒谎防御」（Windows 过滤驱动实证：rename 物理成功却被伪报 EPERM/
 * EACCES——R1 并发回归 1/3 轮复现）：有界重试的第二次尝试会吃 ENOENT（源已被
 * 第一次物理搬走）。ENOENT 不盲重试也不盲抛——查证定性：
 *   - 认领/归还的 dst 在座 = 前次尝试已物理成功 → 吞掉（按成功收尾）；
 *   - dst 缺席 = 源确实不在（真缺席/被他人处理）→ 原样上抛（调用方消费语义）。
 * rename 是原子搬移，不存在半搬状态——dst 在座即证明搬移已发生。
 */
function renameWithLiarDefense(op: () => void, dst: string): void {
  withBoundedRetry(() => {
    try {
      op();
    } catch (error) {
      if (isNotFoundError(error) && existsSync(dst)) return;
      throw error;
    }
  });
}

/** 残片清理尽力而为（locks.ts removeBestEffort 同纪律：残片 inert，交由下轮/Owner）。 */
function removeBestEffort(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    /* 主流程已成立或已上抛；残片交由 Owner/下轮清理 */
  }
}

/** 唯一邻接名（locks.ts uniqueAdjacentPath 同构：pid + 同进程单调计数，跨/同进程唯一）。 */
let casSequence = 0;
function uniqueAdjacentPath(target: string, tag: string): string {
  casSequence += 1;
  return `${target}.${tag}-${process.pid}-${casSequence}`;
}

function withBoundedRetry(op: () => void): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      op();
      return;
    } catch (error) {
      if (attempt >= CLAIM_RETRY_DELAYS_MS.length || !isTransientClaimError(error)) throw error;
      sleepSync(CLAIM_RETRY_DELAYS_MS[attempt] as number);
    }
  }
}

/**
 * 文件级 CAS 交换写：现盘字节仍等于 expected 才把 next 原子安装到位，否则显式
 * 报冲突（调用方整链重读重算）。字节未变（expected === next）不得调用——空交换
 * 是说谎捷径（现盘可能已被他人换走），由调用方以 `!==` 显式守卫（零字节变化
 * 不落盘的 A4 契约在调用侧表达）。
 *
 * 仪式（swapLockCas 同族）：
 *   1. tmp 先落完整 next（认领窗口最小化——认领后只剩 syscall 级安装）；
 *   2. renameSync(target → claim) 原子认领（并发认领者唯一胜出；ENOENT = 已被
 *      认领/移除 → absent）；
 *   3. 复核 claim 字节 ≠ expected → rename 原样归还原位（零读者窗口）→ conflict；
 *   4. linkSync(tmp → target) 独占回装（EEXIST = 认领窗口有非 CAS 写方插入新世代
 *      → 本世代弃置报 conflict；claim 原样留盘——认领内容未受损）；
 *   5. 成功：清 tmp 目录项（link 同 inode）、退役 claim（旧世代消亡）。
 */
export function casSwapFile(target: string, expected: string, next: string): CasSwapOutcome {
  const tmp = uniqueAdjacentPath(target, "r1tmp");
  try {
    writeFileSync(tmp, next, "utf8");
  } catch (error) {
    removeBestEffort(tmp);
    throw error;
  }
  const claim = uniqueAdjacentPath(target, "r1claim");
  try {
    renameWithLiarDefense(() => renameSync(target, claim), claim);
  } catch (error) {
    removeBestEffort(tmp);
    if (isNotFoundError(error)) return { kind: "absent" }; // 被并发方认领（或已移除）
    throw error;
  }
  let claimedBytes: string | null = null;
  try {
    claimedBytes = readFileSync(claim, "utf8");
  } catch {
    claimedBytes = null; // 认领字节不可读 = 无法证明世代 → 按冲突走归还原位
  }
  if (claimedBytes !== expected) {
    // 认领到他人已换入的新世代：原样归还原位（rename 原子——零读者缺席窗口）后
    // 报冲突；归还原位失败（重试耗尽）照常上抛——claim 原样留盘，禁静默丢世代。
    renameWithLiarDefense(() => renameSync(claim, target), target);
    removeBestEffort(tmp);
    return { kind: "conflict" };
  }
  try {
    linkSync(tmp, target);
  } catch (error) {
    removeBestEffort(tmp);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      // 认领窗口有非 CAS 写方（writeFile/rename 覆写族）插入了新世代：本世代弃置，
      // claim 原样留盘（inert 残片；新世代已在座，调用方重读重算即可收敛）。
      return { kind: "conflict" };
    }
    throw error; // claim 原样留盘（手工归位指路随错误上抛——locks.ts 同纪律）
  }
  removeBestEffort(tmp); // link 后同 inode 双目录项：tmp 目录项清理（target 在座）
  removeBestEffort(claim); // 旧世代退役
  return { kind: "swapped" };
}
