import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import * as ajvModule from "ajv";
import type { ValidateFunction } from "ajv";
import { allSchemas } from "./vocab.js";
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";

export interface PersistedSignoffExpectation {
  readonly kind: "accept" | "kickoff";
  readonly ref: string;
  readonly sha256: string;
  readonly consumedBy: string;
  readonly intentSha256?: string;
  readonly maxTtlMs?: number;
}

/** Trusted host adapter must call the existing registry/SSHSIG verifier with requireConsumedBy. */
export type PersistedSignoffVerifier = (root: string, signoff: string, expected: PersistedSignoffExpectation) => {
  readonly signoff: string | null;
  readonly principal: string | null;
  readonly fingerprint: string | null;
  readonly assurance: "strong" | "weak" | "unknown" | "self_attested";
  /** Prepared by the registered verifier only; kernel performs exclusive creation at commit. */
  readonly consumption?: { readonly path: string; readonly next: string };
};
let persistedSignoffVerifier: PersistedSignoffVerifier | undefined;

/** Process bootstrap boundary, not a transaction input or caller-supplied authorization object. */
export function registerPersistedSignoffVerifier(verifier: PersistedSignoffVerifier): void {
  if (persistedSignoffVerifier !== undefined && persistedSignoffVerifier !== verifier) {
    throw new GovernanceError("SCHEMA_INVALID", "Persisted signoff verifier is already registered", "Do not replace the trusted verification boundary", {});
  }
  persistedSignoffVerifier = verifier;
}

/** Missing registry cannot restore legacy mode when persisted trust traces remain. */
export function hasPersistedSignoffState(root: string): boolean {
  if (existsSync(resolve(root, ".pomaster/trust/signers.json"))) return true;
  return ["requests", "consumed", "accepts"].some(name => {
    try { return readdirSync(resolve(root, ".pomaster/trust", name)).length > 0; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  });
}

export function assertPersistedSignoff(root: string, signoff: string | undefined, expected: PersistedSignoffExpectation): ReturnType<PersistedSignoffVerifier> {
  if (signoff === undefined || !/^SO-[0-9a-f]{12}$/.test(signoff) || persistedSignoffVerifier === undefined) {
    throw new GovernanceError("SCHEMA_INVALID", "A registered persisted signature verifier and consumed signoff are required", "Register the existing SSH verifier at trusted process bootstrap and supply the subject-bound signoff reference", { reason_code: "TRUST_SIGNOFF_REQUIRED", ...expected });
  }
  const proof = persistedSignoffVerifier(root, signoff, expected);
  if (proof === null || typeof proof !== "object" || proof.signoff !== signoff ||
      typeof proof.principal !== "string" || proof.principal.trim().length === 0 ||
      typeof proof.fingerprint !== "string" || !/^SHA256:[A-Za-z0-9+/]+$/.test(proof.fingerprint) ||
      !["strong", "weak", "unknown"].includes(proof.assurance)) {
    throw new GovernanceError("SCHEMA_INVALID", "Signoff does not establish a registered signer", "Use the existing persisted registry and consumed signature boundary", { reason_code: "TRUST_SIGNATURE_INVALID" });
  }
  return proof;
}

export function keybindingConfirmationSubject(row: KeybindingRow): PersistedSignoffExpectation {
  const declaration = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "probe"));
  const sha256 = sha256OfCanonical(declaration).replace(/^sha256:/, "");
  return { kind: "accept", ref: `keybinding:${row.id}`, sha256, consumedBy: `keybinding:${row.id}:${sha256}` };
}

export interface KeybindingRow {
  readonly id: string;
  readonly binding_class: "page_to_dir" | "contract_operation_to_operationId" | "capability_to_file";
  readonly canonical_id: string;
  readonly physical_path: string;
  readonly binding_status: "confirmed" | "derived" | "stale";
  readonly match_rule: "mechanical" | "manual_confirmed";
  readonly probe: { readonly method: string; readonly last_run_seq: number; readonly result: "matched" | "mismatched" | "unreachable" | "not_probed" };
  readonly [key: string]: unknown;
}

let keybindingValidator: ValidateFunction | undefined;
export function assertKeybindingRow(value: unknown): asserts value is KeybindingRow {
  if (keybindingValidator === undefined) {
    const Ajv = (ajvModule as unknown as { default: new (options: Record<string, unknown>) => { compile(schema: unknown): ValidateFunction } }).default;
    keybindingValidator = new Ajv({ strict: false, allErrors: true }).compile(allSchemas.keybinding);
  }
  if (!keybindingValidator(value)) throw new GovernanceError("SCHEMA_INVALID", `KEYBINDING: ${JSON.stringify(keybindingValidator.errors)}`, "Follow schema 04", {});
}

function withinRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** Resolve the nearest existing ancestor too: a missing final file cannot hide a parent symlink. */
function assertBindingStorage(root: string, dir: string): void {
  let ancestor = dir;
  for (;;) {
    try {
      if (!withinRoot(realpathSync(root), realpathSync(ancestor))) throw new GovernanceError("SCHEMA_INVALID", "Binding storage escapes project through a symlink", "Restore project-local binding storage", { path: dir });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
}

export function readKeybindings(root: string): KeybindingRow[] {
  const dir = resolve(root, ".pomaster/truth/keybindings");
  assertBindingStorage(root, dir);
  let names: string[];
  try { names = readdirSync(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const seen = new Set<string>();
  return names.filter(name => name.endsWith(".json")).sort().map(name => {
    const path = resolve(dir, name);
    assertBindingStorage(root, path);
    let value: unknown;
    try { value = JSON.parse(readFileSync(path, "utf8")); } catch (error) { throw new GovernanceError("SCHEMA_INVALID", "Binding record is unreadable", "Restore the persisted binding", { path, cause: String(error) }); }
    assertKeybindingRow(value);
    if (`${value.id}.json` !== name && `${value.id.toLowerCase()}.json` !== name) throw new GovernanceError("SCHEMA_INVALID", "Binding filename differs from identity", "Restore the canonical binding record", { path });
    if (seen.has(value.id)) throw new GovernanceError("SCHEMA_INVALID", "Duplicate binding identity", "Keep one canonical record per binding", { id: value.id });
    seen.add(value.id);
    return value;
  });
}

export function physicalKeybindingAnchor(root: string, row: KeybindingRow): string {
  if (row.binding_class === "contract_operation_to_operationId") return row.physical_path;
  const path = resolve(root, row.physical_path);
  try { return realpathSync(path); } catch { return path; }
}

/** Actual filesystem probe, confined to the project including symlink resolution. */
export function probeKeybinding(root: string, row: KeybindingRow, seq: number): KeybindingRow {
  if (row.binding_class === "contract_operation_to_operationId") {
    // A schema-04 operationId token cannot locate an OpenAPI document. A signed manual
    // declaration is allowed, but it is explicitly unprobed rather than a fake machine match.
    if (row.match_rule === "manual_confirmed") return { ...row, probe: { method: "manual-confirmed", last_run_seq: seq, result: "not_probed" } };
    return { ...row, binding_status: "stale", probe: { method: "operationId-source-unavailable", last_run_seq: seq, result: "unreachable" } };
  }
  const path = row.physical_path;
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").includes("..") || path.trim().length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", "KEYBINDING path escapes project", "Use a project-relative POSIX path", { id: row.id });
  }
  let result: KeybindingRow["probe"]["result"] = "unreachable";
  try {
    const actual = realpathSync(resolve(root, path));
    const rel = relative(realpathSync(root), actual);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("outside project");
    const info = statSync(actual);
    result = (row.binding_class === "page_to_dir" ? info.isDirectory() : info.isFile()) ? "matched" : "mismatched";
  } catch { result = "unreachable"; }
  return { ...row, binding_status: result === "matched" ? row.binding_status : "stale", probe: { method: row.binding_class === "page_to_dir" ? "directory-exists" : "file-exists", last_run_seq: seq, result } };
}
