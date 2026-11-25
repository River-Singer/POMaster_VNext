/** SK-2: static local evidence and immutable exact-byte manifests, never installation/trust. */
import { lstatSync, opendirSync } from "node:fs";
import { sha256OfBytes, sha256OfCanonical } from "@pomaster/kernel";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { SKILLS_CATALOG, skillCard, validatePin, type SkillPin } from "./skills-catalog.js";
import { hasLocal, jsonBytes, portablePath, readLocal, readLocalJson, record, safePath, SKILLS_LIMITS, SkillsError, skillsError, writeOnce } from "./skills-local.js";

const AREA = ".pomaster/skills";
const AUDIT_SCHEMA = "pomaster.skill-audit/v1";
const LOCK_SCHEMA = "pomaster.skill-lock/v1";
const SCANNER = "pomaster.local-skill-static/v1";
const COVERAGE = [
  "Only the selected local directory's regular file bytes and lexical indicators are covered; no third-party code is executed.",
  "No network, dependency resolution, upstream audit, revision lookup or verification of local bytes against upstream content.",
  "Scripts, binary/opaque files and lexical capabilities require review; no findings is not proof of safety.",
  "Remote instructions, runtime behavior, dependencies and semantic/obfuscated threats are not exhaustively covered.",
  "Endpoint identity and byte checks are not hostile filesystem race isolation, nor proof of no A-to-B-to-A changes.",
  "Unsigned content-addressed receipts detect drift/tampering against their digest and regenerated scan, not coherent replacement of the entire local plane.",
  "Audit and lock/check do not grant human trust, approve unsafe instructions, authorize installation or satisfy workflow gates.",
] as const;
export interface SkillFile { readonly path: string; readonly sha256: string; readonly bytes: number; readonly executable: boolean }
export interface SkillFinding { readonly code: string; readonly path: string; readonly line: number | null; readonly severity: "info" | "warning" | "high"; readonly capability: string | null; readonly message: string }
export interface SkillAuditReceipt {
  readonly schema: typeof AUDIT_SCHEMA;
  readonly scanner: typeof SCANNER;
  readonly skill: string;
  readonly directory: string;
  readonly source: string;
  readonly pin: SkillPin | null;
  readonly upstream_verification: "not_performed";
  readonly human_trust: "not_granted";
  readonly limits: typeof SKILLS_LIMITS;
  readonly files: readonly SkillFile[];
  readonly directories: readonly string[];
  readonly content_digest: string;
  readonly findings: readonly SkillFinding[];
  readonly capabilities: readonly string[];
  readonly risk_review: "required" | "no_lexical_findings";
  readonly coverage: readonly string[];
}
export interface SkillsAuditInput { readonly skill: string; readonly directory: string; readonly pin?: SkillPin }
export interface SkillsAuditResult { readonly audit: string; readonly receipt_path: string; readonly status: "CREATED" | "NO_CHANGE"; readonly receipt: SkillAuditReceipt }
interface SkillManifest {
  readonly schema: typeof LOCK_SCHEMA;
  readonly skill: string;
  readonly directory: string;
  readonly source: string;
  readonly pin: SkillPin;
  readonly audit: string;
  readonly content_digest: string;
  readonly files: readonly SkillFile[];
  readonly directories: readonly string[];
  readonly risk_review: SkillAuditReceipt["risk_review"];
  readonly human_trust: "not_granted";
}
export interface SkillDifference { readonly path: string; readonly kind: "missing" | "extra" | "changed" }
export interface SkillCheck {
  readonly skill: string;
  readonly status: "match" | "drift" | "invalid";
  readonly differences: readonly SkillDifference[];
  readonly risk_review: SkillAuditReceipt["risk_review"] | "unknown";
  readonly human_trust: "not_granted";
}
const RULES: readonly { code: string; pattern: RegExp; capability: string; message: string }[] = [
  { code: "DOWNLOAD_EXECUTION", pattern: /(?:curl|wget)[\s\S]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i, capability: "process_execution", message: "Download piped to a shell; do not execute." },
  { code: "NETWORK", pattern: /https?:\/\/|\b(?:curl|wget|fetch|requests\.(?:get|post)|urllib|Invoke-WebRequest)\b/i, capability: "network", message: "External network reference/call; runtime fetch not covered." },
  { code: "REMOTE_INSTRUCTIONS", pattern: /(?:remote|download|fetch|load)[\s\S]*(?:instructions|SKILL\.md|rules\.md)|https?:\/\/\S+\.(?:md|sh|exe|ps1)\b/i, capability: "remote_instructions", message: "Possible remote instructions or payload; local review cannot cover later bytes." },
  { code: "CREDENTIAL_ACCESS", pattern: /(?:\.ssh|\.aws|\.env\b|id_rsa|id_ed25519|credentials|api[_-]?key|access[_-]?token|process\.env|os\.environ)/i, capability: "credential_access", message: "Credential/environment reference; access and exfiltration risk requires review." },
  { code: "PROCESS_EXECUTION", pattern: /\b(?:exec(?:Sync)?|spawn(?:Sync)?|subprocess|os\.system|eval|Invoke-Expression|npx|bash|powershell|pwsh)\b|\|\s*sh\b/i, capability: "process_execution", message: "Process/command evaluation indicator; not executed." },
  { code: "DYNAMIC_ENCODING", pattern: /\b(?:base64|b64decode|atob|eval|Function)\b|[A-Za-z0-9+/]{200,}={0,2}/, capability: "dynamic_evaluation", message: "Encoding/dynamic evaluation may conceal behavior." },
  { code: "FILESYSTEM_MUTATION", pattern: /\brm\s+-|\b(?:writeFile|unlink|rmtree|chmod|chown|Remove-Item|Set-Content)\b|open\([^\n]*["'](?:w|a)/i, capability: "filesystem_write", message: "Filesystem mutation indicator; review scope and reversibility." },
  { code: "HOST_CONFIGURATION", pattern: /\.claude|\.codex|settings\.json|AGENTS\.md|\bmcpServers\b|\bhooks\b|disable.{0,25}(?:sandbox|permissions|security)/i, capability: "host_configuration", message: "Host settings/hooks/security indicator; not authorized by skill content." },
  { code: "PROMPT_INJECTION", pattern: /ignore.{0,40}(?:previous|prior|system).{0,25}instructions|(?:override|reveal).{0,25}system\s+prompt|(?:bypass|disable).{0,30}(?:permissions|security|sandbox)|忽略.{0,20}(?:指令|规则)|绕过.{0,20}(?:权限|安全)/i, capability: "instruction_override", message: "Potential instruction injection; treated as untrusted data, not approval." },
];
function directoryName(path: string): string {
  portablePath(path);
  if (path.split("/")[0]?.toLowerCase() === ".pomaster") throw new SkillsError("SKILLS_PATH_UNSAFE", "Selected skill content cannot include the receipt/control plane.");
  return path;
}
function names(root: string, directory: string, budget: number = SKILLS_LIMITS.entries): string[] {
  const full = safePath(root, directory);
  if (!lstatSync(full).isDirectory()) throw new SkillsError("SKILLS_PATH_UNSAFE", `Expected directory: ${directory}`);
  const dir = opendirSync(full);
  const rows: string[] = [];
  try {
    for (let row = dir.readSync(); row !== null; row = dir.readSync()) {
      rows.push(row.name);
      if (rows.length > budget) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", `Directory entry budget exceeded: ${directory}`);
    }
  } finally { dir.closeSync(); }
  return rows.sort();
}
function inventory(root: string, directory: string): { files: SkillFile[]; directories: string[]; findings: SkillFinding[] } {
  directoryName(directory);
  const files: SkillFile[] = [];
  const directories: string[] = [];
  const findings: SkillFinding[] = [];
  let entries = 0;
  let bytes = 0;
  const paths = new Set<string>();
  const walk = (rel: string, depth: number) => {
    if (depth > SKILLS_LIMITS.depth) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", "Selected directory depth exceeds the fixed budget.");
    const dir = rel ? `${directory}/${rel}` : directory;
    const children = names(root, dir, SKILLS_LIMITS.entries - entries);
    entries += children.length; // reserve prelisted siblings before recursion consumes the remaining budget
    for (const name of children) {
      const path = rel ? `${rel}/${name}` : name;
      portablePath(path);
      if (paths.has(path.toLowerCase())) throw new SkillsError("SKILLS_PATH_UNSAFE", "Case-colliding paths are not portable or independently lockable.");
      paths.add(path.toLowerCase());
      const fullPath = `${directory}/${path}`;
      const stat = lstatSync(safePath(root, fullPath));
      if (stat.isDirectory()) { directories.push(path); walk(path, depth + 1); continue; }
      if (files.length >= SKILLS_LIMITS.files) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", "Selected directory file count exceeds the fixed budget.");
      const data = readLocal(root, fullPath);
      bytes += data.bytes.length;
      if (bytes > SKILLS_LIMITS.total_bytes) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", "Selected directory total bytes exceed the fixed budget.");
      files.push({ path, sha256: sha256OfBytes(data.bytes), bytes: data.bytes.length, executable: data.executable });
      const add = (code: string, line: number | null, severity: SkillFinding["severity"], capability: string | null, message: string) => findings.push({ code, path, line, severity, capability, message });
      let text: string | null;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(data.bytes); if (text.includes("\0")) text = null; } catch { text = null; }
      const script = data.executable || /\.(?:sh|bash|zsh|ps1|bat|cmd|py|js|mjs|cjs|ts|tsx|jsx|rb|pl|lua|exe|dll|wasm)$/i.test(path) || text?.startsWith("#!");
      if (script) add("SCRIPT", null, "warning", "process_execution", "Script/executable content exists; independent human review required before any execution.");
      if (text === null) { add("OPAQUE_CONTENT", null, "warning", null, "Binary/opaque content is hashed but not semantically audited."); continue; }
      const lines = text.split(/\r?\n/);
      for (const rule of RULES) {
        const match = rule.pattern.exec(text);
        if (match) add(rule.code, text.slice(0, match.index).split("\n").length, "high", rule.capability, rule.message);
      }
      if (/^SKILL\.md$/i.test(path)) add("INSTRUCTIONS", null, "info", null, "Instruction text is untrusted data; it cannot approve its own actions.");
      // Source anchors are sufficient; do not echo injection text as new instructions.
      if (lines.some(line => line.length > 16000)) add("LONG_LINE", null, "warning", null, "Very long text may contain minified or hidden payloads; review required.");
    }
  };
  walk("", 0);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  findings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  directories.sort();
  return { files, directories, findings };
}
function makeReceipt(root: string, input: SkillsAuditInput): SkillAuditReceipt {
  const card = skillCard(input.skill);
  const pin = input.pin === undefined ? null : validatePin(card, input.pin);
  const scan = inventory(root, input.directory);
  if (!scan.files.some(f => f.path === "SKILL.md")) throw new SkillsError("SKILLS_INSTRUCTIONS_MISSING", "Selected directory must contain a regular SKILL.md file.");
  return { schema: AUDIT_SCHEMA, scanner: SCANNER, skill: card.id, directory: input.directory, source: card.source, pin, upstream_verification: "not_performed", human_trust: "not_granted", limits: SKILLS_LIMITS, files: scan.files, directories: scan.directories, content_digest: sha256OfCanonical({ files: scan.files, directories: scan.directories }), findings: scan.findings, capabilities: [...new Set(scan.findings.flatMap(f => f.capability ? [f.capability] : []))].sort(), risk_review: scan.findings.some(f => f.severity !== "info") ? "required" : "no_lexical_findings", coverage: COVERAGE };
}
function receiptRef(ref: string): string {
  if (typeof ref !== "string" || !/^sha256:[0-9a-f]{64}$/.test(ref)) throw new SkillsError("SKILLS_AUDIT_REQUIRED", "Supply the content-addressed digest returned by skills audit, not a file path or claimed approval.");
  return `${AREA}/audits/${ref.slice(7)}.json`;
}
function readReceipt(root: string, ref: string): SkillAuditReceipt {
  const path = receiptRef(ref);
  if (!hasLocal(root, path)) throw new SkillsError("SKILLS_AUDIT_MISSING", "Referenced local audit receipt is missing.");
  const bytes = readLocal(root, path).bytes;
  if (sha256OfBytes(bytes) !== ref) throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Audit receipt bytes do not match the referenced digest.");
  const raw = record(JSON.parse(bytes.toString("utf8")));
  if (raw.schema !== AUDIT_SCHEMA || raw.scanner !== SCANNER || typeof raw.skill !== "string" || typeof raw.directory !== "string") throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Audit schema/scanner/selection is invalid; rerun audit.");
  const card = skillCard(raw.skill);
  directoryName(raw.directory);
  if (raw.source !== card.source) throw new SkillsError("SKILLS_SOURCE_CONFLICT", "Audit source differs from approved catalog identity.");
  if (raw.pin !== null) validatePin(card, raw.pin);
  if (!Array.isArray(raw.files) || !Array.isArray(raw.directories) || raw.content_digest !== sha256OfCanonical({ files: raw.files, directories: raw.directories })) throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Audit inventory digest is invalid.");
  for (const directory of raw.directories) {
    if (typeof directory !== "string") throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Audit directory inventory is malformed.");
    portablePath(directory);
  }
  for (const row of raw.files) {
    const file = record(row);
    if (typeof file.path !== "string" || typeof file.sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0 || typeof file.executable !== "boolean") throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Audit file inventory is malformed.");
    portablePath(file.path);
  }
  return raw as unknown as SkillAuditReceipt;
}
function differences(expected: readonly SkillFile[], actual: readonly SkillFile[], expectedDirectories: readonly string[] = [], actualDirectories: readonly string[] = []): SkillDifference[] {
  const old = new Map<string, SkillFile | string>(expected.map(f => [f.path, f]));
  const current = new Map<string, SkillFile | string>(actual.map(f => [f.path, f]));
  for (const path of expectedDirectories) old.set(`${path}/`, path);
  for (const path of actualDirectories) current.set(`${path}/`, path);
  return [...new Set([...old.keys(), ...current.keys()])].sort().flatMap(path => {
    const before = old.get(path); const after = current.get(path);
    const kind = !before ? "extra" : !after ? "missing" : sha256OfCanonical(before) !== sha256OfCanonical(after) ? "changed" : null;
    return kind ? [{ path, kind }] : [];
  });
}
function freshReceipt(root: string, receipt: SkillAuditReceipt): void {
  const current = inventory(root, receipt.directory);
  if (differences(receipt.files, current.files, receipt.directories, current.directories).length) throw new SkillsError("SKILLS_AUDIT_STALE", "Selected local bytes changed after audit; unaudited changes cannot be locked.");
  const fresh = makeReceipt(root, { skill: receipt.skill, directory: receipt.directory, ...(receipt.pin ? { pin: receipt.pin } : {}) });
  if (!jsonBytes(fresh).equals(jsonBytes(receipt))) throw new SkillsError("SKILLS_AUDIT_TAMPERED", "Regenerated static audit differs; rehashed/scrubbed findings cannot be accepted.");
}
function manifestOf(receipt: SkillAuditReceipt, audit: string): SkillManifest {
  if (!receipt.pin) throw new SkillsError("SKILLS_REVISION_UNRESOLVED", "Unknown source revision cannot be locked.", "Obtain an independent exact source revision and rerun skills audit with that pin.");
  return { schema: LOCK_SCHEMA, skill: receipt.skill, directory: receipt.directory, source: receipt.source, pin: receipt.pin, audit, content_digest: receipt.content_digest, files: receipt.files, directories: receipt.directories, risk_review: receipt.risk_review, human_trust: "not_granted" };
}
function loadManifest(root: string, skill: string): { manifest: SkillManifest; receipt: SkillAuditReceipt } {
  skillCard(skill);
  const path = `${AREA}/locks/${skill}.json`;
  if (!hasLocal(root, path)) throw new SkillsError("SKILLS_LOCK_MISSING", `No locked manifest for ${skill}.`);
  const raw = record(readLocalJson(root, path));
  if (raw.schema !== LOCK_SCHEMA || raw.skill !== skill || typeof raw.audit !== "string") throw new SkillsError("SKILLS_LOCK_INVALID", `Invalid manifest for ${skill}.`);
  const receipt = readReceipt(root, raw.audit);
  const expected = manifestOf(receipt, raw.audit);
  if (receipt.skill !== skill || sha256OfCanonical(expected) !== sha256OfCanonical(raw)) throw new SkillsError("SKILLS_LOCK_INVALID", "Manifest selection/source/version/hash bindings do not match audit evidence.");
  return { manifest: expected, receipt };
}
function overlappingDirectories(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function lockedNames(root: string): string[] {
  const directory = `${AREA}/locks`;
  if (!hasLocal(root, directory)) return [];
  return names(root, directory).map(name => {
    const skill = name.endsWith(".json") ? name.slice(0, -5) : "";
    if (!SKILLS_CATALOG.some(s => s.id === skill)) throw new SkillsError("SKILLS_LOCK_INVALID", `Unexpected locked manifest: ${name}`);
    return skill;
  });
}
export function runSkillsAudit(root: string, input: SkillsAuditInput): CommandOutcome<SkillsAuditResult | null> {
  try {
    const receipt = makeReceipt(root, input);
    freshReceipt(root, receipt); // resample before persistence, not runtime execution
    const bytes = jsonBytes(receipt);
    const audit = sha256OfBytes(bytes);
    const path = receiptRef(audit);
    const status = writeOnce(root, path, bytes);
    return okOutcome("skills audit", { audit, receipt_path: path, status, receipt }, [`${input.skill}: static local audit ${audit}; review ${receipt.risk_review}; human trust not granted`, ...receipt.findings.map(f => `${f.path}${f.line ? `:${f.line}` : ""} ${f.code}: ${f.message}`), ...COVERAGE]);
  } catch (e) { return failOutcome("skills audit", null, [skillsError(e)], ["Audit unavailable; no third-party content executed or installed."]); }
}
export function runSkillsLock(root: string, input: { readonly skill: string; readonly audit: string }): CommandOutcome<{ readonly status: "CREATED" | "NO_CHANGE"; readonly manifest_path: string; readonly manifest: SkillManifest } | null> {
  try {
    skillCard(input.skill);
    const receipt = readReceipt(root, input.audit);
    if (receipt.skill !== input.skill) throw new SkillsError("SKILLS_SOURCE_CONFLICT", "Audit belongs to another catalog skill.");
    const manifest = manifestOf(receipt, input.audit);
    freshReceipt(root, receipt);
    const path = `${AREA}/locks/${input.skill}.json`;
    const bytes = jsonBytes(manifest);
    for (const other of lockedNames(root)) {
      const old = loadManifest(root, other);
      if (other === input.skill) {
        if (!readLocal(root, path).bytes.equals(bytes)) throw new SkillsError("SKILLS_LOCK_CONFLICT", "Existing same-skill manifest differs; no automatic replacement or update.");
      } else {
        if (overlappingDirectories(old.manifest.directory, manifest.directory)) throw new SkillsError("SKILLS_LOCK_CONFLICT", "Different skills cannot claim the same or nested selected directories.");
        freshReceipt(root, old.receipt);
      }
    }
    freshReceipt(root, receipt);
    const status = writeOnce(root, path, bytes);
    return okOutcome("skills lock", { status, manifest_path: path, manifest }, [`${input.skill}: ${status}; exact supplied revision ${manifest.pin.revision}; local byte identity only, not safety or human trust.`]);
  } catch (e) { return failOutcome("skills lock", null, [skillsError(e)], ["Lock refused; existing manifests/evidence are not overwritten."]); }
}
export function runSkillsCheck(root: string, input: { readonly skill?: string } = {}): CommandOutcome<{ readonly checks: readonly SkillCheck[] }> {
  const checks: SkillCheck[] = [];
  const errors: ReturnType<typeof skillsError>[] = [];
  try {
    const skills = input.skill ? [skillCard(input.skill).id] : lockedNames(root);
    if (!skills.length) throw new SkillsError("SKILLS_LOCK_MISSING", "No locked skill manifests; absence is not integrity success.");
    const directories: string[] = [];
    for (const skill of skills) {
      let drift: SkillDifference[] = [];
      let review: SkillCheck["risk_review"] = "unknown";
      try {
        const { manifest, receipt } = loadManifest(root, skill);
        review = receipt.risk_review;
        const directory = manifest.directory.toLowerCase();
        if (directories.some(other => overlappingDirectories(other, directory))) throw new SkillsError("SKILLS_LOCK_CONFLICT", "Multiple locked skills claim the same or nested selected directories.");
        directories.push(directory);
        if (!hasLocal(root, manifest.directory)) {
          drift = differences(manifest.files, [], manifest.directories, []);
        } else {
          const live = inventory(root, manifest.directory);
          drift = differences(manifest.files, live.files, manifest.directories, live.directories);
        }
        if (drift.length) throw new SkillsError("SKILLS_CONTENT_DRIFT", "Locked local files are missing, changed or extra; old audit is not reusable.");
        freshReceipt(root, receipt);
        checks.push({ skill, status: "match", differences: [], risk_review: review, human_trust: "not_granted" });
      } catch (e) {
        errors.push(skillsError(e));
        checks.push({ skill, status: drift.length ? "drift" : "invalid", differences: drift, risk_review: review, human_trust: "not_granted" });
      }
    }
  } catch (e) { errors.push(skillsError(e)); }
  const human = [...checks.map(c => `${c.skill}: ${c.status}; risk review ${c.risk_review}; human trust not granted`), "Read-only local integrity check; not upstream verification, safety approval or installation authority."];
  return errors.length ? failOutcome("skills check", { checks }, errors, human) : okOutcome("skills check", { checks }, human);
}
