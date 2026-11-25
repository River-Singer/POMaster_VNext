import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GovernanceError, registerPersistedSignoffVerifier, registerPlannerConstructionVerifier, type PersistedSignoffVerifier } from "@pomaster/kernel";
import { verifySignoff } from "./trust.js";
import { verifyScenarioConstruction } from "./plan-scenarios.js";

/** Shared SSH verification remains the only signer/registry/assurance judge. */
export const cliPersistedSignoffVerifier: PersistedSignoffVerifier = (root, id, expected) => {
  const path = resolve(root, ".pomaster/trust/consumed", `${id}.json`);
  const consumed = existsSync(path);
  const verified = verifySignoff(root, id, { kind: expected.kind, ref: expected.ref, sha256: expected.sha256 }, {
    consume: false, ...(consumed ? { requireConsumed: true, requireConsumedBy: expected.consumedBy } : {}),
  });
  if (!verified.ok) throw new GovernanceError("SCHEMA_INVALID", verified.error.message, verified.error.hint, { reason_code: verified.error.code });
  if (expected.maxTtlMs !== undefined && Date.parse(verified.request.expires_at) - Date.parse(verified.request.issued_at) > expected.maxTtlMs) {
    throw new GovernanceError("SCHEMA_INVALID", "Signature TTL exceeds this action's bound", "Sign a short-lived exact statement", { reason_code: "BREAK_GLASS_INVALID" });
  }
  if (consumed) {
    const record = JSON.parse(readFileSync(path, "utf8")) as { intent_sha256?: unknown };
    if (record.intent_sha256 !== undefined && expected.intentSha256 !== undefined && record.intent_sha256 !== expected.intentSha256) {
      throw new GovernanceError("SCHEMA_INVALID", "Consumed signature belongs to a different transaction intent", "Recover only the exact original action and content", { reason_code: "TRUST_SIGNOFF_REPLAYED" });
    }
    return verified.record;
  }
  if (expected.kind === "kickoff") throw new GovernanceError("SCHEMA_INVALID", "Kickoff must already be confirmed", "Use kickoff confirm before planning", { reason_code: "TRUST_SIGNOFF_MISMATCH" });
  return { ...verified.record, consumption: { path, next: `${JSON.stringify({ id, kind: verified.request.kind, by: expected.consumedBy, ...verified.record, consumed_at: new Date().toISOString(), ...(expected.intentSha256 !== undefined ? { intent_sha256: expected.intentSha256 } : {}) }, null, 2)}\n` } };
};

/** Stable callbacks are registered once per trusted CLI process, never supplied through transaction JSON. */
export function bootstrapTrustedWrites(): void {
  registerPersistedSignoffVerifier(cliPersistedSignoffVerifier);
  registerPlannerConstructionVerifier(verifyScenarioConstruction);
}
