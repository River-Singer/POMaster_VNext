/**
 * trust.ts —— 可信人工签发（code-spec trusted-signoff；AP-0a / D-2；Owner 2026-11-12 定 SSH 签名）。
 *
 * 人工点（脚手架规格确认、基线退役、项目识别确认、成果 ACCEPT，以及之后的启动确认与终审）不再只认
 * `--by human:<owner>` 这种谁都能打的字符串：项目登记了签名人之后，每个人工点都要一份「签发请求」——
 * 写明确认什么、内容摘要、有效期——由人用自己的 SSH 私钥签（`ssh-keygen -Y sign -n pomaster`），
 * POMaster 用登记的公钥验签、核对摘要与当前内容一致、核对未过期，再以独占创建一次性消费。
 *
 * - 登记表 `.pomaster/trust/signers.json`：首个签名人首次信任（bootstrap），之后每加一人都要已登记签名人
 *   签过的 trust-enroll 请求；每次加载都按链校验，断链则所有人工点 fail closed；
 * - 没有登记表：人工点照旧接受 `--by human:`，并如实记 `self_attested`（不冒充已签）；
 * - 保障等级：硬件密钥或带口令且不在 ssh-agent 里 = strong；无口令或已在 ssh-agent（agent 也能用）= weak；
 *   没查过 = unknown。消费时记录，之后不升级。
 * - QA 隔离（独立会话）是 AP-0b；status 如实报「QA 未隔离」。
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CliError } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { parsePublicKeyLine, privateKeyProtection, verifySshsig, type SshPublicKey } from "./sshsig.js";

export const TRUST_DIR = ".pomaster/trust";
export const TRUST_SIGNERS_SCHEMA = "pomaster.trust-signers/v1";
export const SIGNOFF_REQUEST_SCHEMA = "pomaster.signoff-request/v1";
export const SIGNOFF_NAMESPACE = "pomaster";
export const SIGNOFF_KINDS = ["kickoff", "accept", "scaffold-confirm", "baseline-retire", "project-identification", "trust-enroll"] as const;
export type SignoffKind = (typeof SIGNOFF_KINDS)[number];
export type Protection = "hardware" | "passphrase" | "none" | "unknown";
export type Assurance = "strong" | "weak" | "unknown" | "self_attested";

const DEFAULT_TTL_MINUTES = 24 * 60;
const MAX_TTL_MINUTES = 7 * 24 * 60;

const KIND_SUMMARY: Readonly<Record<SignoffKind, string>> = {
  kickoff: "确认启动确认单",
  accept: "接受成果",
  "scaffold-confirm": "确认脚手架规格",
  "baseline-retire": "退役基线项",
  "project-identification": "确认项目识别结果",
  "trust-enroll": "登记新的签名人",
};

export interface SignerRecord {
  readonly principal: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly enrolled_at: string;
  readonly protection: Protection;
  readonly bootstrap?: true;
  readonly enroll_signoff?: string;
}

export interface SignersFile {
  readonly schema: string;
  readonly project_id: string;
  readonly signers: readonly SignerRecord[];
}

export interface SignoffRequest {
  readonly schema: string;
  readonly id: string;
  readonly kind: SignoffKind;
  readonly project_id: string;
  readonly subject: { readonly ref: string; readonly sha256: string };
  readonly summary: string;
  readonly nonce: string;
  readonly issued_at: string;
  readonly expires_at: string;
}

/** 人工点记录在自己回执里的签发证明。 */
export interface SignoffRecord {
  readonly assurance: Assurance;
  readonly signoff: string | null;
  readonly principal: string | null;
  readonly fingerprint: string | null;
  /** self_attested 时是 `--by` 的原文。 */
  readonly by?: string;
}

export interface TrustEnv {
  readonly now?: () => Date;
  /** ssh-agent 里的公钥行；null = 无法得知。缺省跑 `ssh-add -L`。 */
  readonly listAgentKeys?: () => readonly string[] | null;
  /** 执行 ssh-keygen（trust sign 用）；缺省 spawnSync 继承终端，好让人输口令 / 触碰密钥。 */
  readonly runSshKeygen?: (args: readonly string[]) => { status: number | null; error?: Error };
}

const trustPath = (root: string, ...parts: string[]) => join(root, TRUST_DIR, ...parts);
const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** 陈述型主体（不是文件的人工点）：引用就是陈述原文，人在签发请求里看得到自己确认的是什么。 */
export function statementSubject(statement: string): { ref: string; sha256: string } {
  return { ref: statement, sha256: sha256Hex(statement) };
}

/** trust-enroll 请求的主体：新签名人「principal + 公钥行」的摘要。 */
export function enrollSubject(principal: string, keyLine: string): { ref: string; sha256: string } {
  return { ref: `signer:${principal}`, sha256: sha256Hex(`${principal} ${keyLine}`) };
}

export type RegistryState =
  | { readonly state: "absent" }
  | { readonly state: "invalid"; readonly reason: string }
  | { readonly state: "ok"; readonly file: SignersFile; readonly keys: readonly SshPublicKey[] };

function parseRequest(path: string): { bytes: Buffer; request: SignoffRequest } | null {
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  try {
    const request = JSON.parse(bytes.toString("utf8")) as SignoffRequest;
    if (request.schema !== SIGNOFF_REQUEST_SCHEMA || typeof request.id !== "string" || typeof request.subject?.sha256 !== "string") return null;
    return { bytes, request };
  } catch {
    return null;
  }
}

/** 加载登记表并按链校验：首个是 bootstrap，之后每人都要有前人签过且已消费的 trust-enroll 请求。 */
export function loadRegistry(root: string): RegistryState {
  const path = trustPath(root, "signers.json");
  if (!existsSync(path)) {
    // 登记表没了但签发记录还在：多半是被删来退回自报模式——判为不成立，不当作「从没登记过」。
    const traces = ["requests", "consumed", "accepts"].filter((dir) => existsSync(trustPath(root, dir)) && readdirSync(trustPath(root, dir)).length > 0);
    return traces.length > 0 ? { state: "invalid", reason: `signers.json 缺失，但 ${traces.join("、")} 里还有签发记录` } : { state: "absent" };
  }
  const file = readJson(path) as SignersFile | null;
  if (file === null || file.schema !== TRUST_SIGNERS_SCHEMA || typeof file.project_id !== "string" || !Array.isArray(file.signers) || file.signers.length === 0) {
    return { state: "invalid", reason: "signers.json 不可解析或结构不对" };
  }
  const keys: SshPublicKey[] = [];
  for (const [index, signer] of file.signers.entries()) {
    let key: SshPublicKey;
    try {
      key = parsePublicKeyLine(signer.key);
    } catch (error) {
      return { state: "invalid", reason: `签名人 ${signer.principal} 的公钥不可解析：${(error as Error).message}` };
    }
    if (key.fingerprint !== signer.fingerprint) return { state: "invalid", reason: `签名人 ${signer.principal} 的指纹与公钥不符` };
    if (index === 0) {
      if (signer.bootstrap !== true) return { state: "invalid", reason: "首个签名人必须是 bootstrap 登记" };
    } else {
      if (signer.bootstrap === true) return { state: "invalid", reason: `签名人 ${signer.principal} 冒充 bootstrap（只有第一个可以）` };
      const id = signer.enroll_signoff;
      const parsed = typeof id === "string" ? parseRequest(trustPath(root, "requests", `${id}.json`)) : null;
      const expected = enrollSubject(signer.principal, signer.key);
      if (parsed === null || parsed.request.kind !== "trust-enroll" || parsed.request.project_id !== file.project_id || parsed.request.subject.sha256 !== expected.sha256) {
        return { state: "invalid", reason: `签名人 ${signer.principal} 没有对应的登记签发请求` };
      }
      const sigPath = trustPath(root, "requests", `${id}.json.sig`);
      const verdict = existsSync(sigPath) ? verifySshsig(parsed.bytes, readFileSync(sigPath, "utf8"), SIGNOFF_NAMESPACE, keys) : { ok: false as const, reason: "缺签名" };
      if (!verdict.ok) return { state: "invalid", reason: `签名人 ${signer.principal} 的登记签名不成立：${verdict.reason}` };
      if (!existsSync(trustPath(root, "consumed", `${id}.json`))) return { state: "invalid", reason: `签名人 ${signer.principal} 的登记签发请求未被消费` };
    }
    if (keys.some((existing) => existing.blob.equals(key.blob))) return { state: "invalid", reason: `公钥 ${key.fingerprint} 重复登记` };
    keys.push(key);
  }
  return { state: "ok", file, keys };
}

function renderAllowedSigners(file: SignersFile): string {
  return `# 由 pomaster trust enroll 生成；手工核验：ssh-keygen -Y verify -f .pomaster/trust/allowed_signers -I <principal> -n ${SIGNOFF_NAMESPACE} -s <请求>.json.sig < <请求>.json\n${file.signers
    .map((signer) => `${signer.principal} namespaces="${SIGNOFF_NAMESPACE}" ${signer.key}`)
    .join("\n")}\n`;
}

function writeRegistry(root: string, file: SignersFile): void {
  mkdirSync(trustPath(root), { recursive: true });
  writeFileSync(trustPath(root, "signers.json"), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  writeFileSync(trustPath(root, "allowed_signers"), renderAllowedSigners(file), "utf8");
}

export function defaultListAgentKeys(): readonly string[] | null {
  const result = spawnSync("ssh-add", ["-L"], { encoding: "utf8", timeout: 3000, windowsHide: true });
  if (result.error !== undefined) return []; // 没有 ssh-add：也就没有能代签的 agent
  if (result.status === 0) return result.stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
  return []; // 1 = agent 里没有密钥；2 = 连不上 agent
}

function exposedInAgent(key: SshPublicKey, env: TrustEnv): boolean | null {
  const lines = (env.listAgentKeys ?? defaultListAgentKeys)();
  if (lines === null) return null;
  return lines.some((line) => {
    try {
      return parsePublicKeyLine(line).blob.equals(key.blob);
    } catch {
      return false;
    }
  });
}

export function assuranceOf(signer: SignerRecord, key: SshPublicKey, env: TrustEnv): { assurance: Exclude<Assurance, "self_attested">; exposed: boolean | null } {
  const exposed = exposedInAgent(key, env);
  if (signer.protection === "hardware") return { assurance: "strong", exposed };
  if (exposed === true || signer.protection === "none") return { assurance: "weak", exposed };
  if (signer.protection === "passphrase" && exposed === false) return { assurance: "strong", exposed };
  return { assurance: "unknown", exposed };
}

type Verified = { ok: true; record: SignoffRecord; request: SignoffRequest } | { ok: false; error: CliError };

const failVerify = (code: string, message: string, hint: string): Verified => ({ ok: false, error: { code, message, hint } });

/**
 * 核验一份签发：登记表成立 → 请求可解析 → 种类 / 项目 / 主体与预期一致 → 签名成立 → 未过期 →（consume 时）独占消费。
 * allowConsumed：已被使用的签发也照样核验（trust verify / trust sign 的回显）。
 * requireConsumed：closeout 复核成果 ACCEPT 时用——必须是已被人工点消费过的签发，且签名仍成立（不再消费）。
 */
export function verifySignoff(
  root: string,
  id: string,
  expect: { kind: SignoffKind; ref: string; sha256: string } | null,
  options: { consume: boolean; allowConsumed?: boolean; requireConsumed?: boolean; env?: TrustEnv; consumedBy?: string },
): Verified {
  const env = options.env ?? {};
  const registry = loadRegistry(root);
  if (registry.state === "absent") return failVerify("TRUST_NOT_ENROLLED", "项目还没有登记签名人", "pomaster trust enroll --key <你的公钥.pub> --principal <名字>");
  if (registry.state === "invalid") return failVerify("TRUST_REGISTRY_INVALID", `签名人登记表不成立：${registry.reason}`, "看过 .pomaster/trust/ 的 git 历史后恢复；登记表断链时所有人工点都拒绝");
  if (!/^SO-[0-9a-f]{12}$/.test(id)) return failVerify("TRUST_SIGNOFF_NOT_FOUND", `签发编号格式不对：${id}`, "形如 SO-0123456789ab");
  const parsed = parseRequest(trustPath(root, "requests", `${id}.json`));
  if (parsed === null) return failVerify("TRUST_SIGNOFF_NOT_FOUND", `找不到签发请求 ${id}（或不可解析）`, "pomaster trust request <种类> … 先创建请求");
  const { bytes, request } = parsed;
  if (request.project_id !== registry.file.project_id) return failVerify("TRUST_SIGNOFF_MISMATCH", `请求 ${id} 属于别的项目`, "在本项目里重新创建请求");
  if (expect !== null) {
    if (request.kind !== expect.kind) return failVerify("TRUST_SIGNOFF_MISMATCH", `请求 ${id} 是「${request.kind}」，这里需要「${expect.kind}」`, "为这个人工点创建对应种类的请求");
    if (request.subject.ref !== expect.ref || request.subject.sha256 !== expect.sha256) {
      return failVerify("TRUST_SIGNOFF_MISMATCH", `请求 ${id} 签的是 ${request.subject.ref}（${request.subject.sha256.slice(0, 12)}…），当前要确认的是 ${expect.ref}（${expect.sha256.slice(0, 12)}…）`, "内容变了旧签发就作废：按当前内容重新创建请求并签名");
    }
  }
  const sigPath = trustPath(root, "requests", `${id}.json.sig`);
  if (!existsSync(sigPath)) {
    return failVerify("TRUST_SIGNATURE_MISSING", `请求 ${id} 还没有签名`, `由人在自己的终端签：ssh-keygen -Y sign -f <私钥> -n ${SIGNOFF_NAMESPACE} ${TRUST_DIR}/requests/${id}.json`);
  }
  const verdict = verifySshsig(bytes, readFileSync(sigPath, "utf8"), SIGNOFF_NAMESPACE, registry.keys);
  if (!verdict.ok) return failVerify("TRUST_SIGNATURE_INVALID", `请求 ${id} 的签名不成立：${verdict.reason}`, "用已登记的密钥、命名空间 pomaster 重新签");
  const signerIndex = registry.keys.findIndex((key) => key.blob.equals(verdict.publicKey.blob));
  const signer = registry.file.signers[signerIndex] as SignerRecord;
  const consumedPath = trustPath(root, "consumed", `${id}.json`);
  const alreadyConsumed = existsSync(consumedPath);
  if (alreadyConsumed && !options.allowConsumed && !options.requireConsumed) return failVerify("TRUST_SIGNOFF_REPLAYED", `签发 ${id} 已经用过了`, "每份签发只能用一次：重新创建请求并签名");
  if (!alreadyConsumed && (env.now ?? (() => new Date()))().getTime() > Date.parse(request.expires_at)) {
    return failVerify("TRUST_SIGNOFF_EXPIRED", `签发 ${id} 已于 ${request.expires_at} 过期`, "重新创建请求并签名");
  }
  if (options.requireConsumed && !alreadyConsumed) return failVerify("TRUST_SIGNOFF_MISMATCH", `签发 ${id} 没有被人工点使用过`, "成果 ACCEPT 时须带 --signoff");
  const { assurance } = assuranceOf(signer, verdict.publicKey, env);
  const record: SignoffRecord = { assurance, signoff: id, principal: signer.principal, fingerprint: signer.fingerprint };
  if (options.consume && !alreadyConsumed) {
    mkdirSync(dirname(consumedPath), { recursive: true });
    try {
      writeFileSync(consumedPath, `${JSON.stringify({ id, kind: request.kind, by: options.consumedBy ?? request.kind, ...record, consumed_at: (env.now ?? (() => new Date()))().toISOString() }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch {
      return failVerify("TRUST_SIGNOFF_REPLAYED", `签发 ${id} 已经被并发的另一个人工点用掉了`, "重新创建请求并签名");
    }
  }
  return { ok: true, record, request };
}

/**
 * 人工点的统一入口（所有消费入口同一契约）：
 * - 没有登记表：照旧放行，记 self_attested（`by` 原文留档）；
 * - 有登记表：必须带 --signoff，核验并一次性消费；不带就拒，提示给出确切的 request 命令。
 */
export function requireHumanSignoff(
  root: string,
  gate: { kind: SignoffKind; ref: string; sha256: string; signoff?: string; by: string; subjectPath?: string; consumedBy: string },
  env: TrustEnv = {},
): { ok: true; record: SignoffRecord } | { ok: false; error: CliError } {
  const registry = loadRegistry(root);
  if (registry.state === "absent") return { ok: true, record: { assurance: "self_attested", signoff: null, principal: null, fingerprint: null, by: gate.by } };
  if (gate.signoff === undefined) {
    const request = gate.subjectPath !== undefined
      ? `pomaster trust request ${gate.kind} --subject ${gate.subjectPath}`
      : `pomaster trust request ${gate.kind} --ref "${gate.ref.replace(/"/g, '\\"')}" --sha256 ${gate.sha256}`;
    return {
      ok: false,
      error: {
        code: registry.state === "invalid" ? "TRUST_REGISTRY_INVALID" : "TRUST_SIGNOFF_REQUIRED",
        message: registry.state === "invalid" ? `签名人登记表不成立：${registry.reason}` : `本项目已登记签名人：「${KIND_SUMMARY[gate.kind]}」需要签发，--by human: 不再单独算数`,
        hint: `${request}；由人用 ssh-keygen -Y sign 签名后，带 --signoff <SO-…> 重跑`,
      },
    };
  }
  const verified = verifySignoff(root, gate.signoff, { kind: gate.kind, ref: gate.ref, sha256: gate.sha256 }, { consume: true, env, consumedBy: gate.consumedBy });
  return verified.ok ? { ok: true, record: verified.record } : { ok: false, error: verified.error };
}

// ———————————————————— 成果 ACCEPT 的签发（决策应答 → closeout 复核）————————————————————

export interface AcceptBinding {
  readonly task_ref?: string;
  readonly change_ref?: string;
  readonly revision_fingerprint?: string;
}

/** 绑定的规范形（固定键序、只留有值的键）：写旁记录、比对、拼陈述都用它。 */
export function canonicalBinding(binding: AcceptBinding): AcceptBinding {
  return {
    ...(typeof binding.task_ref === "string" ? { task_ref: binding.task_ref } : {}),
    ...(typeof binding.change_ref === "string" ? { change_ref: binding.change_ref } : {}),
    ...(typeof binding.revision_fingerprint === "string" ? { revision_fingerprint: binding.revision_fingerprint } : {}),
  };
}

/** 成果 ACCEPT 签的那句陈述：哪个讨论的哪个决议、绑定哪个成果、哪个内容修订。 */
export function acceptStatement(discoveryId: string, decisionId: string, raw: AcceptBinding): string {
  const binding = canonicalBinding(raw);
  const target = [binding.task_ref, binding.change_ref !== undefined ? `change ${binding.change_ref}` : undefined].filter((part) => part !== undefined).join(" ");
  return `accept ${discoveryId}/${decisionId} → ${target} @ ${binding.revision_fingerprint ?? "（未绑定修订）"}`;
}

const acceptSidecarPath = (root: string, discoveryId: string, decisionId: string) => trustPath(root, "accepts", `${discoveryId}--${decisionId}.json`);

export function writeAcceptSidecar(root: string, discoveryId: string, decisionId: string, binding: AcceptBinding, record: SignoffRecord): void {
  const path = acceptSidecarPath(root, discoveryId, decisionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ schema: "pomaster.trust-accept/v1", discovery_id: discoveryId, decision_id: decisionId, binding: canonicalBinding(binding), signoff: record }, null, 2)}\n`, "utf8");
}

/**
 * closeout 复核一条覆盖成果的 ACCEPT：没有登记表 → self_attested 照旧有效；有登记表 → 要有签发旁记录，
 * 绑定与决策图一致，签名仍成立（已消费的签发只复核、不再消费）。
 */
export function checkAcceptSignoff(
  root: string,
  discoveryId: string,
  decisionId: string,
  binding: AcceptBinding,
  env: TrustEnv = {},
): { ok: true; record: SignoffRecord } | { ok: false; error: CliError } {
  const registry = loadRegistry(root);
  if (registry.state === "absent") return { ok: true, record: { assurance: "self_attested", signoff: null, principal: null, fingerprint: null } };
  if (registry.state === "invalid") return { ok: false, error: { code: "TRUST_REGISTRY_INVALID", message: `签名人登记表不成立：${registry.reason}`, hint: "看过 .pomaster/trust/ 的 git 历史后恢复" } };
  const sidecar = readJson(acceptSidecarPath(root, discoveryId, decisionId)) as { binding?: AcceptBinding; signoff?: SignoffRecord } | null;
  const unsigned = (why: string): { ok: false; error: CliError } => ({
    ok: false,
    error: {
      code: "CLOSEOUT_ACCEPT_UNSIGNED",
      message: `决议 ${decisionId} 的成果 ACCEPT 没有成立的签发：${why}`,
      hint: `pomaster trust request accept --ref "${acceptStatement(discoveryId, decisionId, binding).replace(/"/g, '\\"')}" --sha256 ${statementSubject(acceptStatement(discoveryId, decisionId, binding)).sha256}；人签名后 pomaster brainstorm decide ${discoveryId} --answer ${decisionId} --accept …（同样的绑定）--signoff <SO-…>`,
    },
  });
  if (sidecar === null || typeof sidecar.signoff?.signoff !== "string") return unsigned("没有签发记录（登记签名人后的 ACCEPT 必须带 --signoff）");
  if (JSON.stringify(canonicalBinding(sidecar.binding ?? {})) !== JSON.stringify(canonicalBinding(binding))) return unsigned("签发记录里的绑定与决策图不一致");
  const subject = statementSubject(acceptStatement(discoveryId, decisionId, binding));
  const verified = verifySignoff(root, sidecar.signoff.signoff, { kind: "accept", ...subject }, { consume: false, requireConsumed: true, env });
  return verified.ok ? { ok: true, record: verified.record } : unsigned(`${verified.error.code} ${verified.error.message}`);
}

/** 项目内相对路径（POSIX 写法）；越出项目的路径拒绝。 */
function projectRef(root: string, path: string): string | null {
  const absolute = isAbsolute(path) ? path : resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

export function fileSha256(path: string): string {
  return sha256Hex(readFileSync(path));
}

/** 签发作为 ADVANCE 证据的引用：请求文件路径 + 字节摘要（kernel evidence_refs 的文件引用写法）。 */
export function signoffEvidenceRef(root: string, record: SignoffRecord): string[] {
  if (record.signoff === null) return [];
  const path = trustPath(root, "requests", `${record.signoff}.json`);
  return existsSync(path) ? [`${TRUST_DIR}/requests/${record.signoff}.json#sha256=${fileSha256(path)}`] : [];
}

// ———————————————————————————— 命令 ————————————————————————————

const PRINCIPAL = /^[A-Za-z0-9._@-]{1,64}$/;

export interface TrustEnrollInput {
  readonly key: string;
  readonly principal: string;
  readonly private?: string;
  readonly signoff?: string;
}

export function runTrustEnroll(root: string, input: TrustEnrollInput, env: TrustEnv = {}): CommandOutcome<Record<string, unknown> | null> {
  const fail = (code: string, message: string, hint: string) => failOutcome("trust enroll", null, [{ code, message, hint }], [`trust enroll: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`]);
  if (!PRINCIPAL.test(input.principal)) return fail("SCHEMA_INVALID", `签名人名字不合法：${input.principal}`, "字母、数字和 . _ @ -，最多 64 个字符");
  const keyPath = isAbsolute(input.key) ? input.key : resolve(root, input.key);
  if (!existsSync(keyPath)) return fail("TRUST_KEY_NOT_FOUND", `找不到公钥文件 ${input.key}`, "传 .pub 公钥文件（不是私钥）");
  let key: SshPublicKey;
  try {
    key = parsePublicKeyLine(readFileSync(keyPath, "utf8").split(/\r?\n/).find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "");
  } catch (error) {
    return fail("TRUST_KEY_UNSUPPORTED", `公钥不可用：${(error as Error).message}`, "支持 ed25519、ecdsa-p256、rsa 及硬件（sk-）版本");
  }
  let protection: Protection = key.hardware ? "hardware" : "unknown";
  if (!key.hardware && input.private !== undefined) {
    const privatePath = isAbsolute(input.private) ? input.private : resolve(root, input.private);
    if (!existsSync(privatePath)) return fail("TRUST_KEY_NOT_FOUND", `找不到私钥文件 ${input.private}`, "--private 只用来查有没有口令，不读取、不保存私钥内容");
    const detected = privateKeyProtection(readFileSync(privatePath, "utf8"));
    protection = detected === "unknown" ? "unknown" : detected;
  }
  const now = (env.now ?? (() => new Date()))().toISOString();
  const registry = loadRegistry(root);
  if (registry.state === "invalid") return fail("TRUST_REGISTRY_INVALID", `签名人登记表不成立：${registry.reason}`, "先恢复 .pomaster/trust/ 再登记");
  const record: SignerRecord = { principal: input.principal, key: key.line, fingerprint: key.fingerprint, enrolled_at: now, protection };
  const { assurance, exposed } = assuranceOf(record, key, env);
  const report = (change: "ENROLLED" | "NO_CHANGE", extra: Record<string, unknown> = {}) =>
    okOutcome("trust enroll", { change, principal: input.principal, fingerprint: key.fingerprint, protection, assurance, exposed_in_agent: exposed, ...extra }, [
      `trust enroll: ${change} — ${input.principal} ${key.fingerprint}（${key.type}）`,
      `  保护：${protection === "hardware" ? "硬件密钥" : protection === "passphrase" ? "带口令" : protection === "none" ? "无口令" : "未查（加 --private <私钥> 只检查有没有口令）"}${exposed === true ? "；已加载在 ssh-agent 里，agent 也能用它签" : ""} → 保障 ${assurance}`,
      ...(extra["bootstrap"] === true ? ["  这是第一个签名人（首次信任）。请核对上面的指纹就是你自己的密钥；启动确认单也会显示它。"] : []),
    ]);
  if (registry.state === "absent") {
    const file: SignersFile = { schema: TRUST_SIGNERS_SCHEMA, project_id: randomBytes(8).toString("hex"), signers: [{ ...record, bootstrap: true }] };
    writeRegistry(root, file);
    return report("ENROLLED", { bootstrap: true, project_id: file.project_id });
  }
  const same = registry.file.signers.find((signer) => signer.fingerprint === key.fingerprint);
  if (same !== undefined) {
    if (same.principal === input.principal) return report("NO_CHANGE");
    return fail("SCHEMA_INVALID", `这把公钥已登记为 ${same.principal}`, "一把密钥只对应一个签名人");
  }
  if (registry.file.signers.some((signer) => signer.principal === input.principal)) return fail("SCHEMA_INVALID", `签名人 ${input.principal} 已存在（用的是另一把密钥）`, "换个名字；换密钥请先由已登记签名人签发");
  const subject = enrollSubject(input.principal, key.line);
  if (input.signoff === undefined) {
    return fail(
      "TRUST_SIGNOFF_REQUIRED",
      "已经有签名人了：加新签名人要由已登记的人签发",
      `pomaster trust request trust-enroll --ref "${subject.ref}" --sha256 ${subject.sha256}；已登记的人签名后带 --signoff <SO-…> 重跑`,
    );
  }
  const verified = verifySignoff(root, input.signoff, { kind: "trust-enroll", ref: subject.ref, sha256: subject.sha256 }, { consume: true, env, consumedBy: "trust enroll" });
  if (!verified.ok) return failOutcome("trust enroll", null, [verified.error], [`trust enroll: FAILED — ${verified.error.code}`, `  ${verified.error.message}`, `  hint: ${verified.error.hint ?? ""}`]);
  writeRegistry(root, { ...registry.file, signers: [...registry.file.signers, { ...record, enroll_signoff: input.signoff }] });
  return report("ENROLLED", { enrolled_by: verified.record.principal });
}

export interface TrustRequestInput {
  readonly kind: string;
  readonly subject?: string;
  readonly ref?: string;
  readonly sha256?: string;
  readonly ttlMinutes?: number;
}

export function runTrustRequest(root: string, input: TrustRequestInput, env: TrustEnv = {}): CommandOutcome<Record<string, unknown> | null> {
  const fail = (code: string, message: string, hint: string) => failOutcome("trust request", null, [{ code, message, hint }], [`trust request: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`]);
  if (!(SIGNOFF_KINDS as readonly string[]).includes(input.kind)) return fail("SCHEMA_INVALID", `不认识的签发种类：${input.kind}`, `取 ${SIGNOFF_KINDS.join(" / ")}`);
  const kind = input.kind as SignoffKind;
  const registry = loadRegistry(root);
  if (registry.state === "absent") return fail("TRUST_NOT_ENROLLED", "项目还没有登记签名人，签发请求无从验证", "pomaster trust enroll --key <你的公钥.pub> --principal <名字>");
  if (registry.state === "invalid") return fail("TRUST_REGISTRY_INVALID", `签名人登记表不成立：${registry.reason}`, "先恢复 .pomaster/trust/");
  let subject: { ref: string; sha256: string };
  if (input.subject !== undefined) {
    const ref = projectRef(root, input.subject);
    if (ref === null) return fail("SCHEMA_INVALID", `--subject 必须是项目里的文件：${input.subject}`, "传项目内的相对路径");
    const path = join(root, ...ref.split("/"));
    if (!existsSync(path)) return fail("TRUST_SUBJECT_NOT_FOUND", `找不到 ${ref}`, "先生成要确认的内容");
    subject = { ref, sha256: fileSha256(path) };
  } else if (input.ref !== undefined && input.sha256 !== undefined && /^[0-9a-f]{64}$/.test(input.sha256)) {
    subject = { ref: input.ref, sha256: input.sha256 };
  } else {
    return fail("SCHEMA_INVALID", "要么 --subject <文件>，要么 --ref <引用> --sha256 <64 位十六进制>", "人工点被拒时的提示里有确切命令");
  }
  const ttl = Math.min(Math.max(Math.trunc(input.ttlMinutes ?? DEFAULT_TTL_MINUTES), 1), MAX_TTL_MINUTES);
  const issued = (env.now ?? (() => new Date()))();
  const id = `SO-${randomBytes(6).toString("hex")}`;
  const request: SignoffRequest = {
    schema: SIGNOFF_REQUEST_SCHEMA,
    id,
    kind,
    project_id: registry.file.project_id,
    subject,
    summary: `${KIND_SUMMARY[kind]}：${subject.ref}（sha256 ${subject.sha256.slice(0, 12)}…）`,
    nonce: randomBytes(8).toString("hex"),
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + ttl * 60_000).toISOString(),
  };
  const relPath = `${TRUST_DIR}/requests/${id}.json`;
  mkdirSync(trustPath(root, "requests"), { recursive: true });
  writeFileSync(trustPath(root, "requests", `${id}.json`), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return okOutcome("trust request", { id, path: relPath, request, sign_command: `ssh-keygen -Y sign -f <你的私钥> -n ${SIGNOFF_NAMESPACE} ${relPath}` }, [
    `trust request: ${id} — ${request.summary}`,
    `  有效期至 ${request.expires_at}`,
    "  请在你自己的终端里签名（agent 不能替你签）：",
    `    ssh-keygen -Y sign -f <你的私钥> -n ${SIGNOFF_NAMESPACE} ${relPath}`,
    `  或：pomaster trust sign ${id} --key <你的私钥>`,
  ]);
}

export function runTrustSign(root: string, input: { id: string; key: string }, env: TrustEnv = {}): CommandOutcome<Record<string, unknown> | null> {
  const fail = (code: string, message: string, hint: string) => failOutcome("trust sign", null, [{ code, message, hint }], [`trust sign: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`]);
  const requestPath = trustPath(root, "requests", `${input.id}.json`);
  if (!/^SO-[0-9a-f]{12}$/.test(input.id) || parseRequest(requestPath) === null) return fail("TRUST_SIGNOFF_NOT_FOUND", `找不到签发请求 ${input.id}`, "pomaster trust request … 先创建");
  const keyPath = isAbsolute(input.key) ? input.key : resolve(root, input.key);
  const run = env.runSshKeygen ?? ((args) => spawnSync("ssh-keygen", [...args], { stdio: "inherit", windowsHide: false }));
  const result = run(["-Y", "sign", "-f", keyPath, "-n", SIGNOFF_NAMESPACE, requestPath]);
  if (result.error !== undefined) return fail("TRUST_SSH_KEYGEN_MISSING", `运行 ssh-keygen 失败：${result.error.message}`, "安装 OpenSSH 客户端（Windows 10+ 自带，可在「可选功能」里开启）");
  if (result.status !== 0 || !existsSync(`${requestPath}.sig`)) return fail("TRUST_SIGNATURE_INVALID", `ssh-keygen 没有产出签名（exit ${result.status}）`, "检查私钥路径与口令后重试");
  const verified = verifySignoff(root, input.id, null, { consume: false, allowConsumed: true, env });
  return verified.ok
    ? okOutcome("trust sign", { id: input.id, ...verified.record }, [`trust sign: SIGNED — ${input.id}，签名人 ${verified.record.principal}（${verified.record.fingerprint}），保障 ${verified.record.assurance}`])
    : failOutcome("trust sign", null, [verified.error], [`trust sign: FAILED — ${verified.error.code}`, `  ${verified.error.message}`]);
}

export function runTrustVerify(root: string, id: string, env: TrustEnv = {}): CommandOutcome<Record<string, unknown> | null> {
  const verified = verifySignoff(root, id, null, { consume: false, allowConsumed: true, env });
  if (!verified.ok) return failOutcome("trust verify", null, [verified.error], [`trust verify: FAILED — ${verified.error.code}`, `  ${verified.error.message}`, `  hint: ${verified.error.hint ?? ""}`]);
  const consumed = existsSync(trustPath(root, "consumed", `${id}.json`));
  return okOutcome("trust verify", { id, kind: verified.request.kind, subject: verified.request.subject, consumed, ...verified.record }, [
    `trust verify: OK — ${id}（${verified.request.summary}）`,
    `  签名人 ${verified.record.principal}（${verified.record.fingerprint}），保障 ${verified.record.assurance}；${consumed ? "已被使用" : `未使用，${verified.request.expires_at} 前有效`}`,
  ]);
}

export function runTrustStatus(root: string, env: TrustEnv = {}): CommandOutcome<Record<string, unknown>> {
  const registry = loadRegistry(root);
  const qa = { isolation: "not_isolated", reason: "QA 独立会话尚未接入（AP-0b）：确认单与验收单如实标「QA 未隔离」" };
  if (registry.state !== "ok") {
    const mode = registry.state === "absent" ? "self_attested" : "invalid";
    return okOutcome("trust status", { mode, signers: [], qa, ...(registry.state === "invalid" ? { reason: registry.reason } : {}) }, [
      registry.state === "absent"
        ? "trust status: 未登记签名人——人工点只认 --by human: 自报（self_attested），不算可信签发"
        : `trust status: 登记表不成立（${registry.reason}）——所有人工点拒绝`,
      registry.state === "absent" ? "  登记：pomaster trust enroll --key <你的公钥.pub> --principal <名字> [--private <私钥>]" : "  看 .pomaster/trust/ 的 git 历史后恢复",
      `  QA：${qa.reason}`,
    ]);
  }
  const signers = registry.file.signers.map((signer, index) => {
    const { assurance, exposed } = assuranceOf(signer, registry.keys[index] as SshPublicKey, env);
    return { principal: signer.principal, fingerprint: signer.fingerprint, protection: signer.protection, exposed_in_agent: exposed, assurance, bootstrap: signer.bootstrap === true, enrolled_at: signer.enrolled_at };
  });
  const requestsDir = trustPath(root, "requests");
  const pending = existsSync(requestsDir)
    ? readdirSync(requestsDir).filter((name) => /^SO-[0-9a-f]{12}\.json$/.test(name) && !existsSync(trustPath(root, "consumed", name))).length
    : 0;
  return okOutcome("trust status", { mode: "signed", project_id: registry.file.project_id, signers, pending_requests: pending, qa }, [
    `trust status: 已登记 ${signers.length} 个签名人——人工点须带签发（--signoff）`,
    ...signers.map((signer) => `  ${signer.bootstrap ? "★" : " "} ${signer.principal} ${signer.fingerprint} 保护 ${signer.protection}${signer.exposed_in_agent === true ? "（在 ssh-agent 里）" : ""} → 保障 ${signer.assurance}`),
    "  ★ = 首次信任登记的签名人：请确认这就是你自己的密钥",
    `  未使用的签发请求：${pending}`,
    `  QA：${qa.reason}`,
  ]);
}
