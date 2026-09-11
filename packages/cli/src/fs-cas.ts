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
 *
 * ── 09-11 fs-cas-install-enoent 批：全步错误归类（零裸 fs 错误逃逸）──────────
 *
 * CI 实证缺口（run 34610508238 job 103299571，PR #7 后 v0.6.1 tag publish 轮）：
 * 回装步 rename `manifest.yaml.r1claim-7920-2 → manifest.yaml` 抛裸 ENOENT——
 * 既有 renameWithLiarDefense 只查 dst 安装位在座性：本进程首次回装尝试物理归位
 * 却被伪报 EPERM（Windows 谎报），退避窗口内对手认领走了刚归位的世代，重试
 * rename 吃 ENOENT（claim 已被首次尝试物理搬走）且 dst 缺席（对手持有）→ 原样
 * 上抛成子进程 CRASH。认领位的 ENOENT（认领文件被对手交错取走/外部清理）与
 * dst 安装位缺席是两条不同交错路径——本批起 casSwapFile 每一步 fs 操作失败都
 * 归类收束，任何步、任何错误码都不再裸抛（结构性零 CRASH 面）。
 *
 * 归类矩阵（步 × 错误码 → 处置。「防御复核」= 查证 dst/claim 在座性再定性；
 * contended/fault 结局均附成因词形 cause——调用方与操作者可辨步位与成因）：
 *
 * | 步                | fs 操作                | ENOENT                                                    | EPERM/EACCES                                              | EEXIST                            | 其他（ENOSPC/EIO/EISDIR/EBUSY…） |
 * |------------------|------------------------|-----------------------------------------------------------|-----------------------------------------------------------|-----------------------------------|----------------------------------|
 * | 1 tmp 落盘       | writeFileSync(tmp)     | contended（落盘位/目录被并发方移除——整链重读重算再分类） | contended（Windows 瞬时锁/AV 句柄）                       | —（邻接名唯一，不碰撞）          | fault                            |
 * | 2 认领           | rename(target→claim)   | 防御复核：dst(claim) 在座=首次尝试已物理认领，吞；否则 absent（认领胜负语义——被并发方认领/移除） | 有界重试 → 耗尽：dst 在座=吞；dst 缺席=contended（目标持续被锁） | —（rename 不产 EEXIST）          | fault                            |
 * | 3 字节复核       | readFileSync(claim)    | 吞——世代不可证明 → 按 conflict 走归还原位（回装步再分类） | 同左                                                      | —                                 | 同左                             |
 * | 4 回装（冲突归还原位） | rename(claim→target) | 防御复核：dst(target) 在座=已物理归位，吞；dst 缺席=认领文件被对手交错取走（CI 实证本行）→ contended | 有界重试 → 耗尽：dst 在座=吞；dst 缺席=contended（claim 原样留盘） | —                                 | fault（claim 原样留盘）          |
 * | 5 link 回装      | linkSync(tmp→target)   | contended（安装位/落盘位被并发方移除；claim 原样留盘）    | contended（瞬时锁；claim 原样留盘）                       | conflict（非 CAS 写方插入新世代——既有语义，claim 原样留盘） | fault（claim 原样留盘）          |
 *
 * - contended = 瞬时/交错类 → 调用方整链重读重算重判卷（baseline.ts 事务重试环，
 *   耗尽 BASELINE_WRITE_CONFLICT 显式冲突）。认领残留处残片 inert（不参与读面，
 *   locks.ts「claim 原样留盘」同纪律；禁静默丢世代，不做自动归位——归位 rename
 *   对 dst 具覆写语义，会踩掉并发方新写入的世代）。
 * - swapped/conflict/absent = 既有三态语义逐字不变（认领式交换仍是认领式交换，
 *   非锁体系）。
 * - fault = persistent（持续环境故障，重试无益）→ 受控结局 `{ kind: "fault",
 *   code, cause }`，不携带裸 Error/stack 上抛（比「允许上抛但须受控形态」更强：
 *   结局空间封闭，消费方 exhaustive 处理——baseline.ts 落 BASELINE_WRITE_CONFLICT
 *   族信封呈现，结构上不可能逃逸成 CRASH）。
 *
 * 注入面：fs 参数（SpawnFn/ExecutableProbeFn 同族注入先例——缺省 nodeCasSwapFs
 * 真实 node:fs；测试脚本化每步故障做确定性回归钉，禁真并发碰运气，见
 * tests/integration/baseline-set-contention.spec.ts「全步错误归类」describe）。
 */
import { existsSync, linkSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

/**
 * casSwapFile 显式结局空间（09-11 fs-cas-install-enoent 起五态）：swapped = 认领-
 * 比对-安装成功（next 已在位）；conflict = 认领到他人已换入的新世代（现盘字节 ≠
 * expected——调用方重读重算）；absent = 认领时目标已缺席（并发方移除——调用方走
 * 缺席语义）；contended = 瞬时/交错类 fs 故障（cause 附成因词形——调用方整链重读
 * 重算）；fault = persistent 持续环境故障（code = errno 词形、cause 附成因词形
 * ——调用方受控呈现，禁重试空转）。
 */
export type CasSwapOutcome =
  | { readonly kind: "swapped" }
  | { readonly kind: "conflict" }
  | { readonly kind: "absent" }
  | { readonly kind: "contended"; readonly cause: string }
  | { readonly kind: "fault"; readonly code: string; readonly cause: string };

/**
 * casSwapFile 的 fs 注入面（SpawnFn/ExecutableProbeFn 同族）：六 op 恰为五步仪式
 * 的全部 fs 触点（rmSync/existsSync 供清理与防御复核）。缺省 = nodeCasSwapFs。
 */
export interface CasSwapFs {
  readonly writeFileSync: typeof writeFileSync;
  readonly renameSync: typeof renameSync;
  readonly readFileSync: typeof readFileSync;
  readonly linkSync: typeof linkSync;
  readonly existsSync: typeof existsSync;
  readonly rmSync: typeof rmSync;
}

/** 缺省真机实现（recon.ts reconSbomSpawn 同款：缺省 = 真实实现，注入仅测试承载）。 */
export const nodeCasSwapFs: CasSwapFs = {
  writeFileSync,
  renameSync,
  readFileSync,
  linkSync,
  existsSync,
  rmSync,
};

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

/** errno 词形提取（非 ErrnoException 形态 → null——fault 结局兜底 UNKNOWN）。 */
function errnoOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isNotFoundError(error: unknown): boolean {
  return errnoOf(error) === "ENOENT";
}

/**
 * 认领 rename 的瞬时锁判定（io.ts isTransientSwapError 收窄）：EPERM/EACCES 吃
 * 有界重试（并发读者/写方持句柄的 Windows 瞬时锁）；ENOENT 不重试——认领胜负
 * 语义由 casSwapFile 显式消费，盲重试只会把认领胜负伪装成环境故障。
 */
function isTransientClaimError(error: unknown): boolean {
  const code = errnoOf(error);
  return code === "EPERM" || code === "EACCES";
}

/**
 * 步级归类（矩阵「瞬时/交错 vs persistent」列实现）：{ENOENT, EPERM, EACCES}
 * = 并发交错/瞬时锁类 → contended（附成因词形，调用方整链重读重算）；其余
 * （ENOSPC/EIO/EISDIR/EBUSY…）= persistent → 受控 fault（code = errno 词形）。
 * EEXIST 不经此函数——各步自有语义消费（link 步 = conflict）。
 */
function classifyContentionOrFault(error: unknown, stepCause: string): CasSwapOutcome {
  const code = errnoOf(error);
  if (code === "ENOENT" || code === "EPERM" || code === "EACCES") {
    return { kind: "contended", cause: `${stepCause}（${code}）——并发交错/瞬时锁，整链重读重算` };
  }
  return { kind: "fault", code: code ?? "UNKNOWN", cause: `${stepCause}——持续环境故障（重试无益）` };
}

/**
 * rename 的「撒谎防御」（Windows 过滤驱动实证：rename 物理成功却被伪报 EPERM/
 * EACCES——R1 并发回归 1/3 轮复现）：有界重试的第二次尝试会吃 ENOENT（源已被
 * 第一次物理搬走）。ENOENT 不盲重试也不盲抛——查证定性：
 *   - 认领/归还的 dst 在座 = 前次尝试已物理成功 → 吞掉（按成功收尾）；
 *   - dst 缺席 = 源确实不在（真缺席/被他人处理）→ 原样上抛（调用方消费语义；
 *     09-11 fs-cas-install-enoent 起消费位一律归类 contended/fault，不再裸抛）。
 * rename 是原子搬移，不存在半搬状态——dst 在座即证明搬移已发生。
 */
function renameWithLiarDefense(fs: CasSwapFs, op: () => void, dst: string): void {
  withBoundedRetry(fs, () => {
    try {
      op();
    } catch (error) {
      if (isNotFoundError(error) && fs.existsSync(dst)) return;
      throw error;
    }
  });
}

/** 残片清理尽力而为（locks.ts removeBestEffort 同纪律：残片 inert，交由下轮/Owner）。 */
function removeBestEffort(fs: CasSwapFs, path: string): void {
  try {
    fs.rmSync(path, { force: true });
  } catch {
    /* 主流程已成立或已归类收束；残片交由 Owner/下轮清理 */
  }
}

/** 唯一邻接名（locks.ts uniqueAdjacentPath 同构：pid + 同进程单调计数，跨/同进程唯一）。 */
let casSequence = 0;
function uniqueAdjacentPath(target: string, tag: string): string {
  casSequence += 1;
  return `${target}.${tag}-${process.pid}-${casSequence}`;
}

function withBoundedRetry(fs: CasSwapFs, op: () => void): void {
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
 *
 * 每一步失败按头注归类矩阵收束（五态结局；本函数零 throw——fs 注入面抛出的
 * 裸 fs 错误一律在此归类，禁逃逸成 CRASH）。
 */
export function casSwapFile(
  target: string,
  expected: string,
  next: string,
  fs: CasSwapFs = nodeCasSwapFs,
): CasSwapOutcome {
  const tmp = uniqueAdjacentPath(target, "r1tmp");
  // —— 步 1 tmp 落盘（矩阵行 1）——
  try {
    fs.writeFileSync(tmp, next, "utf8");
  } catch (error) {
    removeBestEffort(fs, tmp);
    return classifyContentionOrFault(error, "tmp 落盘失败（认领前落盘位）");
  }
  const claim = uniqueAdjacentPath(target, "r1claim");
  // —— 步 2 认领（矩阵行 2；ENOENT = 认领胜负语义，其余按矩阵归类）——
  try {
    renameWithLiarDefense(fs, () => fs.renameSync(target, claim), claim);
  } catch (error) {
    removeBestEffort(fs, tmp);
    if (isNotFoundError(error)) return { kind: "absent" }; // 被并发方认领（或已移除）
    if (isTransientClaimError(error)) {
      return {
        kind: "contended",
        cause: `认领 rename 瞬时锁有界重试耗尽（${errnoOf(error) ?? "UNKNOWN"}）——目标持续被并发方锁住`,
      };
    }
    return {
      kind: "fault",
      code: errnoOf(error) ?? "UNKNOWN",
      cause: "认领 rename 持续环境故障（重试无益）",
    };
  }
  // —— 步 3 字节复核（矩阵行 3：读不成 = 世代不可证明 → 按冲突走归还原位）——
  let claimedBytes: string | null = null;
  try {
    claimedBytes = fs.readFileSync(claim, "utf8");
  } catch {
    claimedBytes = null; // 认领字节不可读 = 无法证明世代 → 按冲突走归还原位
  }
  if (claimedBytes !== expected) {
    // —— 步 4 回装（冲突归还原位；矩阵行 4 = CI 实证裸崩位 run 34610508238）——
    // claim 缺席 + target 缺席 = 认领文件被对手交错取走（本进程首次尝试物理归位
    // 却被伪报 EPERM、退避窗口内对手认领走归位世代，重试 ENOENT 即此形态；外部
    // 清理同形）→ contended 整链重读：世代内容随对手认领仪式收敛，本方零写零崩。
    try {
      renameWithLiarDefense(fs, () => fs.renameSync(claim, target), target);
    } catch (error) {
      removeBestEffort(fs, tmp);
      if (isNotFoundError(error)) {
        return {
          kind: "contended",
          cause: "回装步认领文件被并发方交错取走（claim 位 ENOENT 且 target 缺席）——世代随对手认领收敛，整链重读",
        };
      }
      if (isTransientClaimError(error)) {
        return {
          kind: "contended",
          cause: `回装归还原位 rename 瞬时锁有界重试耗尽（${errnoOf(error) ?? "UNKNOWN"}）——claim 原样留盘`,
        };
      }
      return {
        kind: "fault",
        code: errnoOf(error) ?? "UNKNOWN",
        cause: "回装归还原位 rename 持续环境故障——claim 原样留盘（认领内容未受损）",
      };
    }
    removeBestEffort(fs, tmp);
    return { kind: "conflict" };
  }
  // —— 步 5 link 回装（矩阵行 5）——
  try {
    fs.linkSync(tmp, target);
  } catch (error) {
    removeBestEffort(fs, tmp);
    if (errnoOf(error) === "EEXIST") {
      // 认领窗口有非 CAS 写方（writeFile/rename 覆写族）插入了新世代：本世代弃置，
      // claim 原样留盘（inert 残片；新世代已在座，调用方重读重算即可收敛）。
      return { kind: "conflict" };
    }
    return classifyContentionOrFault(error, "link 回装失败（安装位）——claim 原样留盘（认领内容未受损）");
  }
  removeBestEffort(fs, tmp); // link 后同 inode 双目录项：tmp 目录项清理（target 在座）
  removeBestEffort(fs, claim); // 旧世代退役
  return { kind: "swapped" };
}
