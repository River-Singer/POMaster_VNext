/**
 * projection.ts —— 最小充分上下文投影（八拍③ PROJECTION）。
 *
 * 契约不变量（GOLDEN-L8-3 判据）：
 * - manifest 中与 task 无关的 POLICY. 条目 = 0（本实现：POLICY.* 仅在属于范围内
 *   对象的 authority owner 治理域时注入，理由字段写明经谁关联）；
 * - MUST/ADVISORY 分层可见：MUST 区（AUTHORITATIVE，进 gate 判卷输入）与 ADVISORY 区
 *   （按触发条件注入的经验/漂移预警，不进 gate 判卷输入）物理分离——契约的
 *   mustEntries/advisoryEntries 两分区即 §74 三分区的前两轴（VERIFICATION 判卷
 *   输入 = MUST 区；gate 归一走 normalizeGateResult）；
 * - 每 entry 必带 reason（why-injected，可判卷；无理由注入=噪声）；
 * - inputsFingerprint 由 manifest+request 派生：同输入重放字节稳定（D24：只读服务）。
 * 纯派生视图：只读 store，不产生治理事实，不写任何文件。
 */
import type { DenominatorRefRow, Projection, ProjectionEntry, Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { readText } from "./io.js";
import { pathsOf, readRawIndex } from "./paths.js";
import { loadTruthIndex } from "./store.js";
import type { ObjectRow } from "./index.js";

type UnknownRecord = Record<string, unknown>;

function entryId(row: ObjectRow): string {
  return row.id;
}

/** 许可台账（state/permits.json；permits.ts 维护，这里只读）。 */
interface PermitLedgerEntry {
  readonly permit_ref: string;
  readonly change_ref: string | null;
  readonly scope: { readonly subject_ids: readonly string[] };
}

function readPermitLedger(store: Store): readonly PermitLedgerEntry[] {
  const paths = pathsOf(store);
  const text = readText(paths.permitsPath);
  if (text === null) return [];
  try {
    const parsed = JSON.parse(text) as UnknownRecord;
    const permits = parsed.permits;
    if (!Array.isArray(permits)) return [];
    return permits.filter(
      (permit): permit is PermitLedgerEntry =>
        typeof permit === "object" &&
        permit !== null &&
        typeof (permit as UnknownRecord).permit_ref === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 编译最小充分上下文投影。范围派生（确定性、可判卷）：
 * - 分母通道：request.denominatorRefs 命中的对象（信封行 denominator_refs 交集）；
 * - 许可通道：request.taskRef 命中 changeRef 的 Permit 的 scope.subjectIds。
 * 范围为空 → manifest 为空（诚实缺席，不杜撰「全域上下文」）。
 */
export async function compileProjection(
  store: Store,
  request: import("./index.js").ProjectionRequest,
): Promise<Projection> {
  // 未初始化的 store：loadTruthIndex 会以 NOT_CONFIGURED 显式报错（禁静默）。
  const raw = readRawIndex(pathsOf(store));
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const index = await loadTruthIndex(store);

  const requestedDenoms: readonly DenominatorRefRow[] = request.denominatorRefs ?? [];
  const requestedDenomIds = new Set(requestedDenoms.map((ref) => ref.id));

  // —— 范围派生 ——
  const scopeReasons = new Map<string, Set<string>>();
  const addToScope = (id: string, reason: string): void => {
    const bucket = scopeReasons.get(id) ?? new Set<string>();
    bucket.add(reason);
    scopeReasons.set(id, bucket);
  };

  for (const row of index.objects) {
    for (const ref of row.denominatorRefs) {
      if (requestedDenomIds.has(ref.id)) {
        addToScope(
          entryId(row),
          `in_scope: 分母 ${ref.id}@${ref.versionSeen} 覆盖对象（kind=${row.kind}, lifecycle=${row.axes.lifecycle}, evidence=${row.axes.evidence}）`,
        );
      }
    }
  }
  if (request.taskRef !== undefined) {
    for (const permit of readPermitLedger(store)) {
      if (permit.change_ref === request.taskRef) {
        for (const subjectId of permit.scope.subject_ids) {
          addToScope(
            subjectId,
            `in_scope: permit ${permit.permit_ref}（changeRef=${request.taskRef}）授权写入对象`,
          );
        }
      }
    }
  }

  const currentDenominatorVersion = new Map<string, number>();
  for (const denom of index.denominators) {
    const existing = currentDenominatorVersion.get(denom.id) ?? 0;
    if (denom.version > existing) currentDenominatorVersion.set(denom.id, denom.version);
  }

  // —— MUST 区（AUTHORITATIVE：进 gate 判卷输入） ——
  const mustEntries: ProjectionEntry[] = [];
  for (const row of index.objects) {
    const reasons = scopeReasons.get(entryId(row));
    if (reasons === undefined) continue;
    mustEntries.push({ ref: entryId(row), reason: [...reasons].sort().join("; ") });
  }
  for (const ref of requestedDenoms) {
    const currentVersion = currentDenominatorVersion.get(ref.id);
    mustEntries.push({
      ref: ref.id,
      reason:
        `coverage denominator anchor（C2：gate 按 id+version_seen=${ref.versionSeen} 引用` +
        (currentVersion === undefined
          ? "；分母未在索引登记——覆盖缺口如实呈现）"
          : currentVersion === ref.versionSeen
            ? `；现行 version=${currentVersion}，无漂移）`
            : `；现行 version=${currentVersion}——引用已落后，覆盖缺口如实呈现）`),
    });
  }
  // POLICY.*：仅当其 authority owner 治理范围内对象时注入（task-agnostic POLICY=0 不变量）。
  const scopeOwners = new Set(
    index.objects
      .filter((row) => scopeReasons.has(entryId(row)))
      .map((row) => row.authorityOwner),
  );
  for (const row of index.objects) {
    if (!row.id.startsWith("POLICY.")) continue;
    if (!scopeOwners.has(row.authorityOwner)) continue;
    mustEntries.push({
      ref: row.id,
      reason: `policy 治理域命中：authority owner=${row.authorityOwner} 的范围内对象受其约束（kind=${row.kind}）`,
    });
  }

  // —— ADVISORY 区（不进 gate 判卷输入） ——
  const advisoryEntries: ProjectionEntry[] = [];
  for (const row of index.objects) {
    if (row.kind !== "knowledge_entry") continue;
    if (!scopeOwners.has(row.authorityOwner)) continue;
    advisoryEntries.push({
      ref: row.id,
      reason: `ADVISORY: 同 authority 域（${row.authorityOwner}）经验条目；按触发条件注入，不进 gate 判卷输入（GOLDEN-L8-3）`,
    });
  }
  // 分母漂移预警（对象钉的 version_seen 落后于现行 version）。
  for (const row of index.objects) {
    const reasons = scopeReasons.get(entryId(row));
    if (reasons === undefined) continue;
    for (const ref of row.denominatorRefs) {
      const currentVersion = currentDenominatorVersion.get(ref.id);
      if (currentVersion !== undefined && currentVersion > ref.versionSeen) {
        advisoryEntries.push({
          ref: ref.id,
          reason: `ADVISORY: 分母漂移——对象 ${row.id} 钉 version_seen=${ref.versionSeen}，现行 version=${currentVersion}；覆盖缺口待 reconcile（write-gate 15/32/20 事故免疫）`,
        });
      }
    }
  }

  // —— 懒加载工具清单：v0 无工具 catalog（catalog/ 层未建成）——显式空，不杜撰。
  const lazyTools: string[] = [];

  const sortEntries = (entries: readonly ProjectionEntry[]): ProjectionEntry[] =>
    [...entries].sort((a, b) => (a.ref === b.ref ? (a.reason < b.reason ? -1 : 1) : a.ref < b.ref ? -1 : 1));

  const manifest = {
    mustEntries: sortEntries(mustEntries),
    advisoryEntries: sortEntries(advisoryEntries),
    lazyTools,
  };
  const inputsFingerprint = sha256OfCanonical({
    role: request.role,
    taskRef: request.taskRef ?? null,
    denominatorRefs: requestedDenoms,
    manifest,
  });
  return { manifest, inputsFingerprint };
}
