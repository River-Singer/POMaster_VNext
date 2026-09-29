/**
 * source-snapshot.ts —— FR-05 相关源码面捕获（producer 前采样）与消费判定装配（W2 切片）。
 *
 * 职责两半：
 * - 捕获（producer 侧）：工具启动前/后对**显式相关面**各捕获一次 EvidenceSourceSnapshot。
 *   分母由调用方装配（任务授权变更面 + 共享依赖/配置；声明外变化零影响）——零目录扫描、
 *   零扩展名白名单（recon-import-snapshot 的 JS/TS/Vue 全源面不适用本合同：会误伤无关
 *   修改且漏 CSS/SQL/后端源码；本捕获只看声明路径，CSS/SQL/后端语言一律由声明进入分母）。
 *   HEAD 只作出处锚（checkpoint.ts 同款 spawnSync 纪律；非 Git 工区/失败 → null 显式，
 *   锚缺席不阻断内容比较——freshness 判定以内容摘要为准）。存在性摘要：声明路径缺席 =
 *   SOURCE_PATH_ABSENT_DIGEST（untracked 新增/删除/重命名即时漂移可见）。读取失败 →
 *   read_failures 显式（唯一比较核判 unjudgeable——非绿不假绿，禁静默当 fresh）。
 * - 消费判定装配（consumer 侧）：judgeRunSourceStability 把 GRN 落账的运行窗口双采样
 *   对照当下相关面判定「该证据是否仍满足源码稳定性」——窗口判定（before vs after）+
 *   当下判定（after vs 当前捕获）两跳都走 kernel 唯一比较核 compareSourceSnapshots
 *   （禁第二比较器）；无 source_snapshot = legacy 证据「未主张源码新鲜度」（不反填、
 *   不全局硬拒绝——消费者闸对缺席诚实放行，源码保证不冒充在场）。
 *
 * 诚实边界：前后摘要相等只能证明端点相同，不能排除运行中 A→B→A（kernel source-snapshot.ts
 * 头注合同文字）——judgeRunSourceStability 的 stable=true 语义是「可判且未见漂移」，不是
 * 「已证明运行期间无变化」；final-stable 保证归稳定 checkout/编排写入窗口（W2.3）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GovernanceError,
  SOURCE_PATH_ABSENT_DIGEST,
  SOURCE_SNAPSHOT_CONTRACT,
  compareSourceSnapshots,
  sha256OfBytes,
  type EvidenceSourceSnapshot,
  type RunSourceSnapshot,
  type SourceFreshnessState,
} from "@pomaster/kernel";

/** git 只读采集超时上界（checkpoint.ts 同款；本地操作秒级即回）。 */
const SOURCE_HEAD_GIT_TIMEOUT_MS = 30_000 as const;
/** 64MB（checkpoint.ts 同量级；直接字面量避免反向依赖）。 */
const SOURCE_HEAD_GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * HEAD 出处锚只读采集（rev-parse；checkpoint.ts collectWorkspaceAnchor 同款纪律）。
 * 非 Git 工区/git 异常/超时 → null = 锚缺席显式申报（不伪造锚；内容比较不阻断）。
 */
export function captureSourceHead(rootDir: string): string | null {
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    timeout: SOURCE_HEAD_GIT_TIMEOUT_MS,
    maxBuffer: SOURCE_HEAD_GIT_MAX_BUFFER_BYTES,
    encoding: "utf8",
    windowsHide: true,
  });
  if (head.status !== 0 || head.error != null || typeof head.stdout !== "string") return null;
  const value = head.stdout.trim();
  return value.length > 0 ? value : null;
}

export interface CaptureSourceSnapshotInput {
  /** 显式相关面（分母；调用方装配——授权/审阅面 + 共享依赖/配置；posix 相对路径）。 */
  readonly relevantPaths: readonly string[];
  /** HEAD 锚显式注入（测试/编排复算）；缺省 = 现场采集（非 Git 工区 → null）。 */
  readonly head?: string | null;
}

/**
 * 一次相关源码面捕获（工具启动前/后各一次，同一 relevantPaths——「执行后捕获同一面」）。
 * 空 relevantPaths → SCHEMA_INVALID（空面 = vacuously fresh 假绿通道，拒收；调用方不
 * 声明分母就不捕获、不主张源码新鲜度——缺席诚实）。
 */
export function captureEvidenceSourceSnapshot(
  rootDir: string,
  input: CaptureSourceSnapshotInput,
): EvidenceSourceSnapshot {
  const paths = [
    ...new Set(
      input.relevantPaths
        .map((path) => path.replace(/\\/g, "/"))
        .filter((path) => path.length > 0),
    ),
  ].sort();
  if (paths.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "relevantPaths 为空——空相关面捕获被拒绝（空面 = vacuously fresh 假绿通道）",
      "Declare the relevant surface explicitly（任务变更面 + 共享依赖/配置）；不声明则不捕获、不主张源码新鲜度。",
    );
  }
  const digests: Record<string, string> = {};
  const readFailures: string[] = [];
  for (const path of paths) {
    try {
      digests[path] = sha256OfBytes(readFileSync(join(rootDir, ...path.split("/"))));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // 声明路径在捕获时点不存在（untracked 新增前的缺席/删除后的缺席）——存在性摘要。
        digests[path] = SOURCE_PATH_ABSENT_DIGEST;
        continue;
      }
      // 读取失败（EISDIR/EACCES/…）→ read_failures 显式；digest 占位 ABSENT（该值永不
      // 驱动 fresh 判定——read_failures 非空时唯一比较核恒判 unjudgeable）。
      readFailures.push(`${path}: ${code ?? String(err)}`);
      digests[path] = SOURCE_PATH_ABSENT_DIGEST;
    }
  }
  return {
    contract: SOURCE_SNAPSHOT_CONTRACT,
    head: input.head !== undefined ? input.head : captureSourceHead(rootDir),
    relevant_paths: paths,
    digests,
    read_failures: readFailures,
  };
}

/** GRN 源码稳定性消费判定（judgeRunSourceStability 成功形态）。 */
export type RunSourceStabilityJudgment =
  | { readonly stable: true }
  | { readonly stable: false; readonly state: SourceFreshnessState; readonly reason: string };

/**
 * 证据源码稳定性消费判定（复用资格 / 终验 cohort / closeout DOD / record verification
 * 写侧闸共用单点）：窗口判定（落账 before vs after，重算由 assert 已强校验）≠ fresh →
 * 不稳定（运行窗口漂移的证据保留真实 verdict 但不证明稳定终态）；after vs 当前捕获
 * （同一 relevant_paths 新鲜装配）≠ fresh → 不稳定（证据产出后相关源码已变化）。两跳
 * 都走 kernel 唯一比较核——缺失/不可判与确实过期同走三态词形，source 未知不能 fresh。
 */
export function judgeRunSourceStability(
  rootDir: string,
  snapshot: RunSourceSnapshot,
): RunSourceStabilityJudgment {
  if (snapshot.window.state !== "fresh") {
    return { stable: false, state: snapshot.window.state, reason: snapshot.window.reason };
  }
  const current = captureEvidenceSourceSnapshot(rootDir, { relevantPaths: snapshot.after.relevant_paths });
  const comparison = compareSourceSnapshots(snapshot.after, current);
  if (comparison.state !== "fresh") {
    return { stable: false, state: comparison.state, reason: comparison.reason };
  }
  return { stable: true };
}
