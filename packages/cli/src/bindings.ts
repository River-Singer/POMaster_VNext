import { applyTransaction, createStore, loadStoreReadOnly, loadTruthIndex, probeKeybinding, readKeybindings, sha256OfCanonical, keybindingConfirmationSubject, type KeybindingRow, type Transaction } from "@pomaster/kernel";
import { statementSubject, verifySignoff, type TrustEnv } from "./trust.js";
import { bootstrapTrustedWrites } from "./trusted-write-bootstrap.js";
export { cliPersistedSignoffVerifier } from "./trusted-write-bootstrap.js";

export interface BindingConflict { readonly code: "KB_UNIQ_001" | "KB_UNIQ_002"; readonly ids: readonly string[]; readonly binding_class: KeybindingRow["binding_class"]; }
/** Only confirmed rows participate; class is part of each uniqueness key. */
export function confirmedBindingConflicts(rows: readonly KeybindingRow[]): BindingConflict[] {
  const conflicts: BindingConflict[] = [];
  for (const [field, code] of [["physical_path", "KB_UNIQ_001"], ["canonical_id", "KB_UNIQ_002"]] as const) {
    const groups = new Map<string, KeybindingRow[]>();
    for (const row of rows.filter(row => row.binding_status === "confirmed")) {
      const key = JSON.stringify([row.binding_class, row[field]]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) if (group.length > 1) conflicts.push({ code, ids: group.map(row => row.id), binding_class: group[0]!.binding_class });
  }
  return conflicts;
}

export interface BindingsSyncInput { readonly dryRun?: boolean; readonly rows?: readonly KeybindingRow[]; readonly permitRef?: string; readonly executionId?: string; readonly signoffRefs?: Readonly<Record<string, string>>; }
export interface BindingsSyncResult { readonly mode: "dry-run" | "apply"; readonly rows: readonly KeybindingRow[]; readonly conflicts: readonly BindingConflict[]; readonly applied_seq: number | null; }
/** Pure dry-run; actual changes always go through the kernel's 04 op and re-probe. */
export async function runBindingsSync(root: string, input: BindingsSyncInput = {}): Promise<BindingsSyncResult> {
  const index = await loadTruthIndex(loadStoreReadOnly(root));
  const current = readKeybindings(root);
  const candidates = new Map(current.map(row => [row.id, row]));
  for (const row of input.rows ?? []) candidates.set(row.id, row);
  const rows = [...candidates.values()].map(row => probeKeybinding(root, row, index.generation.seq));
  const conflicts = confirmedBindingConflicts(rows);
  if (input.dryRun === true) return { mode: "dry-run", rows, conflicts, applied_seq: null };
  if (conflicts.length > 0) throw new Error(`KEYBINDING_CONFLICT: ${JSON.stringify(conflicts)}`);
  bootstrapTrustedWrites();
  const result = await applyTransaction(await createStore(root), {
    ops: [...candidates.values()].map(row => ({ op: "upsert_keybinding" as const, row, ...(input.signoffRefs?.[row.id] !== undefined ? { signoffRef: input.signoffRefs[row.id] } : {}) })),
    ...(input.permitRef !== undefined ? { permitRef: input.permitRef } : {}),
    ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
  });
  return { mode: "apply", rows: readKeybindings(root), conflicts, applied_seq: result.appliedSeq };
}

/** Unique accept statement binds the entire exact declaration, including protected roots. */
export function bindingDeclarationSubject(rows: readonly KeybindingRow[]): { ref: string; sha256: string } {
  if (rows.length === 1) { const subject = keybindingConfirmationSubject(rows[0]!); return { ref: subject.ref, sha256: subject.sha256 }; }
  return statementSubject(`pomaster:keybinding-declaration:${sha256OfCanonical([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "probe"))))}`);
}

/** Verification only: no premature consumption and no fabricated kernel authorization. */
export function prepareBindingDeclaration(root: string, rows: readonly KeybindingRow[], signoff: string, env: TrustEnv = {}) {
  if (rows.length !== 1) return { ok: false as const, error: { code: "KEYBINDING_BATCH_SIGNOFF_UNAVAILABLE", message: "The kernel confirmation subject binds one exact row", hint: "Prepare and sign one accept request per declaration; a batch signature cannot authorize individual rows." } };
  const subject = bindingDeclarationSubject(rows);
  const verified = verifySignoff(root, signoff, { kind: "accept", ...subject }, { consume: false, env });
  if (!verified.ok) return verified;
  return { ok: true as const, subject, signoff: verified.record, consumed_by: keybindingConfirmationSubject(rows[0]!).consumedBy, transaction: { ops: rows.map(row => ({ op: "upsert_keybinding" as const, row, signoffRef: signoff })) } satisfies Transaction };
}

/** Kernel enforces declared signatures; callers cannot substitute an actor string or proof Boolean. */
export async function runBindingsDeclare(root: string, row: KeybindingRow, input: Omit<BindingsSyncInput, "rows" | "dryRun"> = {}) {
  return runBindingsSync(root, { ...input, rows: [row] });
}
