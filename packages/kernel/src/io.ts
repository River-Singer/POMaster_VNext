/**
 * io.ts —— kernel 内部文件 IO：原子写（tmp+rename）+ staged 回滚。
 *
 * staged-replace 事故教训（staged-replace 回滚缺陷）：清理/回滚路径**不得凭
 * exists() 推断删除原件**。本模块的回滚依据是写入前捕获的 `original` 字节：
 * original === null ⇔ 写入前确认不存在（此时才允许删除）；
 * original !== null ⇔ 用捕获的原字节经 tmp+rename 原子恢复。
 */
import {
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
      renameSync(tmpPaths[index] as string, write.path);
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
          renameSync(restoreTmp, done.path);
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
