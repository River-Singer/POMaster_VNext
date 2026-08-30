/**
 * io.ts —— kernel 内部文件 IO：原子写（tmp+rename）+ staged 回滚 + 有界重试 + 追加流。
 *
 * staged-replace 事故教训（staged-replace 回滚缺陷）：清理/回滚路径**不得凭
 * exists() 推断删除原件**。本模块的回滚依据是写入前捕获的 `original` 字节：
 * original === null ⇔ 写入前确认不存在（此时才允许删除）；
 * original !== null ⇔ 用捕获的原字节经 tmp+rename 原子恢复。
 *
 * Windows 并发瞬时锁（P20 红队发现 4）：双进程并发 rename 覆写同一目标时，libuv 的
 * 打开句柄未带 FILE_SHARE_DELETE，目标被并发方持有期间 rename 报瞬时 EPERM（探针
 * 16 轮 3 轮命中）——对 EPERM/EACCES/ENOENT 加有界确定性重试（20/50/100ms，无随机），
 * 重试耗尽仍显式抛出（禁静默吞错）。
 */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { GovernanceError } from "./errors.js";

/** 单个目标文件的写入计划：next 为目标内容，original 为写入前捕获的字节（null=确认不存在）。 */
export interface FileWrite {
  readonly path: string;
  readonly next: string;
  readonly original: string | null;
}

/** 捕获当前文件字节（不存在 → null）。读取失败视为环境异常（禁静默当空文件）。 */
export function captureOriginal(path: string): string | null {
  try {
    statSync(path);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `cannot read existing file for staged write: ${path}`,
      "检查文件占用/权限后重试；单机本地盘假设破裂时 doctor 会报 environment_error（禁静默）",
      { path, cause: String(error) },
    );
  }
}

export function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `cannot create directory skeleton: ${dir}`,
      "检查磁盘可写性与路径合法性后重试 createStore",
      { dir, cause: String(error) },
    );
  }
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/** 解析 JSON 文件；损坏/不可解析由调用方包装为语义错误（此处抛原始异常）。 */
export function readJsonText(path: string): string | null {
  return readText(path);
}

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

// ============================================================
// 有界确定性重试 + 追加写（P20 红队发现 1/4 共用原语）
// ============================================================

/** 确定性同步等待（Atomics.wait；宿主不可用时忙等兜底——时长确定优先于让出 CPU）。 */
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
export function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(sleepBuffer, 0, 0, ms);
  } catch {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* spin：确定性时长兜底 */
    }
  }
}

/**
 * Windows rename 瞬时锁错误判定（P20 红队发现 4）：并发方持有目标句柄期间 rename 报
 * EPERM；目标恰被并发流程移除时报 ENOENT（如锁释放/认领窗口）。三者有界重试后仍失败
 * = 真环境异常照常上抛。
 */
export function isTransientSwapError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "EPERM" || code === "EACCES" || code === "ENOENT";
}

/** 共享 IO 面的确定性退避档（无随机——并发测试可复现；最终失败仍显式抛出）。 */
export const IO_RETRY_DELAYS_MS = [20, 50, 100] as const;

/**
 * 有界确定性重试（注入式：op/isRetryable 可测——单测用失败计数器验证重试路径，
 * 不必 OS 级 flake 测试）。重试耗尽抛**最后一次**的原始错误（禁静默吞错）。
 */
export function withBoundedRetry<T>(
  op: () => T,
  isRetryable: (error: unknown) => boolean,
  delays: readonly number[] = IO_RETRY_DELAYS_MS,
): T {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return op();
    } catch (error) {
      if (attempt >= delays.length || !isRetryable(error)) throw error;
      sleepSync(delays[attempt] as number);
    }
  }
}

/**
 * 追加写（journal 事件流等 append-only 面专用）：O_APPEND（POSIX）/
 * FILE_APPEND_DATA（Windows）语义下单次 write 原子落位于当时文件尾——并发追加方
 * 各自完整留痕。read-modify-write 覆写落法（读全量→拼行→rename 覆写）会把并发方的
 * 整行抹掉（P20 红队发现 1 的 journal 半边病灶：并发 LOCK_STOLEN 只剩一条）。
 * 取舍：追加流放弃 staged 原子替换的「要么完整要么不在」，硬崩溃至多留下可检出的
 * 末行残片（append-only 读者按行 JSON 解析，残片显式拒——SCHEMA_INVALID）。
 */
export function appendLine(path: string, text: string): void {
  appendFileSync(path, text, "utf8");
}

/**
 * staged 原子写：先把全部 next 写入同目录 tmp 文件，再逐个 rename 覆盖目标。
 * 任一步失败：删除未 rename 的 tmp（全部是我们创建的，非推断），并按捕获的
 * original 逆序恢复已 rename 的目标 → 状态回到事务前。
 */
export function executeWrites(writes: readonly FileWrite[]): void {
  const tmpPaths: string[] = [];
  const renamed: { readonly path: string; readonly original: string | null }[] =
    [];
  try {
    writes.forEach((write, index) => {
      ensureDir(dirname(write.path));
      const tmp = `${write.path}.tmp-${process.pid}-${index}`;
      writeFileSync(tmp, write.next, "utf8");
      tmpPaths.push(tmp);
    });
    writes.forEach((write, index) => {
      // Windows 并发瞬时锁（EPERM/ENOENT）有界重试——P20 红队发现 4（双进程并发写
      // 侧车 16 轮探针 3 轮硬失败；重试窗口内并发方句柄释放即自愈，耗尽仍显式抛出）。
      withBoundedRetry(
        () => renameSync(tmpPaths[index] as string, write.path),
        isTransientSwapError,
      );
      renamed.push({ path: write.path, original: write.original });
    });
  } catch (error) {
    for (const tmp of tmpsNotYetRenamed(tmpPaths, renamed.length)) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* 清理尽力而为；主错误先行抛出 */
      }
    }
    for (const done of [...renamed].reverse()) {
      if (done.original === null) {
        try {
          rmSync(done.path, { force: true });
        } catch {
          /* 同上 */
        }
      } else {
        const restoreTmp = `${done.path}.tmp-restore-${process.pid}`;
        try {
          writeFileSync(restoreTmp, done.original, "utf8");
          // 回滚恢复同样吃 Windows 瞬时锁（回滚失败=状态不回到事务前——更须重试自愈）。
          withBoundedRetry(
            () => renameSync(restoreTmp, done.path),
            isTransientSwapError,
          );
        } catch {
          /* 同上 */
        }
      }
    }
    throw error;
  }
}

function tmpsNotYetRenamed(tmpPaths: string[], renamedCount: number): string[] {
  return tmpPaths.slice(renamedCount);
}

/** 稳定的每文件唯一 tmp 名（测试用断言无 tmp 残留时按前缀匹配）。 */
export const TMP_SUFFIX_PATTERN = /\.tmp-\d+-\d+(?:\.tmp-restore-\d+)?$/;
