import { applyTransaction, loadStoreReadOnly, loadTruthIndex, runNewEntityGate, resolveCatalogRoot, validateFactCandidate, sha256OfCanonical, type Actor, type GovernedId, type ObjectEnvelopeInput, type PermitRequest, type Transaction } from "@pomaster/kernel";

export interface FactAddInput {
  readonly envelope: ObjectEnvelopeInput;
  readonly need?: string;
  readonly catalogRoot?: string;
  readonly actor: Actor;
  readonly changeRef?: string;
  readonly ttlBeats?: number;
  readonly executionId?: string;
  readonly permitRef?: string;
  readonly parentRef?: GovernedId;
}
export const FACT_PERMIT_MAX_TTL_BEATS = 3;
/** Pure preparation never mints authority; kernel repeats the gate against the commit generation. */
export async function prepareFactAdd(root: string, input: FactAddInput) {
  const store = loadStoreReadOnly(root), index = await loadTruthIndex(store);
  const envelope = structuredClone(input.envelope);
  const catalogRoot = resolveCatalogRoot(input.catalogRoot);
  const candidates = [{ wordForm: envelope.id, need: input.need ?? envelope.id }];
  const proof = await runNewEntityGate(store, catalogRoot, { candidates });
  const judgement = proof.judgements[0];
  if (proof.result.verdict !== "passed") {
    const reuse = [...new Set([...(index.objects.some(row => row.id === envelope.id) ? [envelope.id] : []), ...(judgement?.matches.map(match => match.id) ?? [])])];
    return { status: reuse.length > 0 ? "reuse" as const : "denied" as const, proof, reuse_ids: reuse, next_action: reuse.length > 0 ? `Reuse ${reuse.join(", ")}; do not create a duplicate.` : "Resolve the actual New Entity denial/blindspot before admission." };
  }
  validateFactCandidate(store, envelope);
  const ttl = input.ttlBeats ?? FACT_PERMIT_MAX_TTL_BEATS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > FACT_PERMIT_MAX_TTL_BEATS) throw new Error("FACT_PERMIT_TTL_INVALID: expected 1..3 sequence beats");
  const permitRequest: PermitRequest = { subjectIds: [envelope.id], requestedBy: input.actor, ttlBeats: ttl, ...(input.changeRef !== undefined ? { changeRef: input.changeRef } : {}), acceptanceShape: { object_digest: sha256OfCanonical(envelope) } };
  const transaction: Transaction = { ops: [{ op: "upsert_object", envelope }], newEntity: { catalogRoot, candidates },
    factAdmission: { request: permitRequest, ...(input.parentRef !== undefined ? { parentRef: input.parentRef } : {}) },
    ...(input.executionId !== undefined ? { executionId: input.executionId } : {}), ...(input.permitRef !== undefined ? { permitRef: input.permitRef } : {}) };
  return { status: "prepared" as const, proof, validation_scope: "official_kind_payload_and_sanctioned_checks" as const, envelope_digest: sha256OfCanonical(envelope), permitRequest, transaction, prepared_at_seq: index.generation.seq };
}

export async function runFactAdd(root: string, input: FactAddInput) {
  const plan = await prepareFactAdd(root, input);
  if (plan.status !== "prepared") return plan;
  const result = await applyTransaction(loadStoreReadOnly(root), plan.transaction);
  return { status: "admitted" as const, id: input.envelope.id, applied_seq: result.appliedSeq, permit: result.issuedPermit, envelope_digest: plan.envelope_digest };
}
