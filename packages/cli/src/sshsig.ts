/**
 * sshsig.ts —— OpenSSH 签名（SSHSIG，`ssh-keygen -Y sign` 的产物）的纯 Node 验签（code-spec trusted-signoff §3.2；AP-0a）。
 *
 * 为什么不调 ssh-keygen 验签：验签发生在 POMaster 运行的任何机器上（CI、agent 沙箱、Windows），那里不一定
 * 有 OpenSSH；签名格式是公开的（OpenSSH PROTOCOL.sshsig），node:crypto 原生支持 Ed25519 / ECDSA / RSA。
 * 签名仍由人在自己的终端用 `ssh-keygen -Y sign` 产生。
 *
 * 支持的公钥：ssh-ed25519、sk-ssh-ed25519@openssh.com、ecdsa-sha2-nistp256、
 * sk-ecdsa-sha2-nistp256@openssh.com、ssh-rsa（签名 rsa-sha2-256 / rsa-sha2-512）。
 * 消息摘要：sha256 / sha512。硬件密钥（sk-*）要求签名带「用户在场」标志（ssh-keygen 的缺省要求）。
 */
import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

export const SSHSIG_MAGIC = "SSHSIG";
export const SUPPORTED_KEY_TYPES = [
  "ssh-ed25519",
  "sk-ssh-ed25519@openssh.com",
  "ecdsa-sha2-nistp256",
  "sk-ecdsa-sha2-nistp256@openssh.com",
  "ssh-rsa",
] as const;
export type SshKeyType = (typeof SUPPORTED_KEY_TYPES)[number];

export class SshFormatError extends Error {}

/** SSH 线格式读取器（uint32 大端 + 长度前缀字符串）。 */
class Reader {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}
  bytes(length: number): Buffer {
    if (this.offset + length > this.buf.length) throw new SshFormatError("数据被截断");
    const out = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }
  uint32(): number {
    return this.bytes(4).readUInt32BE(0);
  }
  byte(): number {
    return this.bytes(1)[0] as number;
  }
  string(): Buffer {
    return this.bytes(this.uint32());
  }
  text(): string {
    return this.string().toString("utf8");
  }
  done(): boolean {
    return this.offset === this.buf.length;
  }
}

export function sshString(value: Buffer | string): Buffer {
  const body = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

const b64url = (buf: Buffer) => buf.toString("base64url");
/** mpint → 无符号大端字节（去掉正数的前导 0x00）。 */
const unsignedMpint = (buf: Buffer) => {
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0) start += 1;
  return buf.subarray(start);
};
const padTo = (buf: Buffer, length: number) => {
  const raw = unsignedMpint(buf);
  if (raw.length > length) throw new SshFormatError("ECDSA 分量过长");
  return Buffer.concat([Buffer.alloc(length - raw.length), raw]);
};

export interface SshPublicKey {
  readonly type: SshKeyType;
  /** 完整公钥 blob（指纹与比对都用它）。 */
  readonly blob: Buffer;
  /** `SHA256:<base64 无填充>`，与 `ssh-keygen -l` 一致。 */
  readonly fingerprint: string;
  /** OpenSSH 一行格式（不含注释）。 */
  readonly line: string;
  readonly hardware: boolean;
  readonly key: KeyObject;
  /** sk-* 的 application（通常 "ssh:"）。 */
  readonly application?: string;
}

export function fingerprintOf(blob: Buffer): string {
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

/** 解析公钥 blob（类型字段必须是支持的五种之一）。 */
export function parsePublicKeyBlob(blob: Buffer): SshPublicKey {
  const reader = new Reader(blob);
  const type = reader.text();
  if (!(SUPPORTED_KEY_TYPES as readonly string[]).includes(type)) throw new SshFormatError(`不支持的公钥类型：${type}`);
  let key: KeyObject;
  let application: string | undefined;
  if (type === "ssh-ed25519" || type === "sk-ssh-ed25519@openssh.com") {
    const pk = reader.string();
    if (pk.length !== 32) throw new SshFormatError("Ed25519 公钥长度不对");
    key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64url(pk) }, format: "jwk" });
    if (type.startsWith("sk-")) application = reader.text();
  } else if (type === "ecdsa-sha2-nistp256" || type === "sk-ecdsa-sha2-nistp256@openssh.com") {
    const curve = reader.text();
    if (curve !== "nistp256") throw new SshFormatError(`不支持的曲线：${curve}`);
    const point = reader.string();
    if (point.length !== 65 || point[0] !== 0x04) throw new SshFormatError("只支持未压缩的 P-256 点");
    key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33)) }, format: "jwk" });
    if (type.startsWith("sk-")) application = reader.text();
  } else {
    const e = unsignedMpint(reader.string());
    const n = unsignedMpint(reader.string());
    key = createPublicKey({ key: { kty: "RSA", n: b64url(n), e: b64url(e) }, format: "jwk" });
  }
  if (!reader.done()) throw new SshFormatError("公钥 blob 末尾有多余数据");
  return {
    type: type as SshKeyType,
    blob,
    fingerprint: fingerprintOf(blob),
    line: `${type} ${blob.toString("base64")}`,
    hardware: type.startsWith("sk-"),
    key,
    ...(application !== undefined ? { application } : {}),
  };
}

/** 解析 OpenSSH 公钥行 `<type> <base64> [comment]`；行首类型须与 blob 内类型一致。 */
export function parsePublicKeyLine(line: string): SshPublicKey {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) throw new SshFormatError("公钥行应为 `<类型> <base64> [注释]`");
  const blob = Buffer.from(parts[1] as string, "base64");
  const parsed = parsePublicKeyBlob(blob);
  if (parsed.type !== parts[0]) throw new SshFormatError(`公钥行类型 ${parts[0]} 与内容 ${parsed.type} 不一致`);
  return parsed;
}

export interface ParsedSshsig {
  readonly publicKey: SshPublicKey;
  readonly namespace: string;
  readonly hashAlgorithm: "sha256" | "sha512";
  readonly signature: Buffer;
  readonly reserved: Buffer;
}

const ARMOR_BEGIN = "-----BEGIN SSH SIGNATURE-----";
const ARMOR_END = "-----END SSH SIGNATURE-----";

export function parseSshsig(armored: string): ParsedSshsig {
  const text = armored.replace(/\r\n/g, "\n").trim();
  const begin = text.indexOf(ARMOR_BEGIN);
  const end = text.indexOf(ARMOR_END);
  if (begin < 0 || end < 0 || end < begin) throw new SshFormatError("不是 SSH 签名（缺少 BEGIN / END SSH SIGNATURE）");
  const blob = Buffer.from(text.slice(begin + ARMOR_BEGIN.length, end).replace(/\s+/g, ""), "base64");
  const reader = new Reader(blob);
  if (reader.bytes(6).toString("latin1") !== SSHSIG_MAGIC) throw new SshFormatError("SSHSIG 魔数不对");
  const version = reader.uint32();
  if (version !== 1) throw new SshFormatError(`不支持的 SSHSIG 版本：${version}`);
  const publicKey = parsePublicKeyBlob(reader.string());
  const namespace = reader.text();
  const reserved = reader.string();
  const hashAlgorithm = reader.text();
  if (hashAlgorithm !== "sha256" && hashAlgorithm !== "sha512") throw new SshFormatError(`不支持的摘要算法：${hashAlgorithm}`);
  const signature = reader.string();
  if (!reader.done()) throw new SshFormatError("SSHSIG 末尾有多余数据");
  return { publicKey, namespace, hashAlgorithm, signature, reserved };
}

/** SSHSIG 实际被签的字节：魔数 ‖ string(namespace) ‖ string(reserved) ‖ string(hash_alg) ‖ string(H(message))。 */
export function sshsigSignedData(message: Buffer, namespace: string, hashAlgorithm: "sha256" | "sha512", reserved: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([
    Buffer.from(SSHSIG_MAGIC, "latin1"),
    sshString(namespace),
    sshString(reserved),
    sshString(hashAlgorithm),
    sshString(createHash(hashAlgorithm).update(message).digest()),
  ]);
}

export type SshsigVerdict =
  | { readonly ok: true; readonly publicKey: SshPublicKey }
  | { readonly ok: false; readonly reason: string };

/** 按公钥类型验签字段（签名字段内的算法名须与公钥匹配；sk-* 要求用户在场标志）。 */
function verifySignatureField(publicKey: SshPublicKey, field: Buffer, data: Buffer): string | null {
  const reader = new Reader(field);
  const algorithm = reader.text();
  const raw = reader.string();
  switch (publicKey.type) {
    case "ssh-ed25519":
      if (algorithm !== "ssh-ed25519") return `签名算法 ${algorithm} 与公钥不符`;
      if (!reader.done()) return "签名字段末尾有多余数据";
      return cryptoVerify(null, data, publicKey.key, raw) ? null : "签名不匹配";
    case "ssh-rsa": {
      const hash = algorithm === "rsa-sha2-512" ? "sha512" : algorithm === "rsa-sha2-256" ? "sha256" : null;
      if (hash === null) return `不接受的 RSA 签名算法：${algorithm}（只认 rsa-sha2-256 / rsa-sha2-512）`;
      if (!reader.done()) return "签名字段末尾有多余数据";
      return cryptoVerify(hash, data, publicKey.key, raw) ? null : "签名不匹配";
    }
    case "ecdsa-sha2-nistp256": {
      if (algorithm !== "ecdsa-sha2-nistp256") return `签名算法 ${algorithm} 与公钥不符`;
      if (!reader.done()) return "签名字段末尾有多余数据";
      const inner = new Reader(raw);
      const sig = Buffer.concat([padTo(inner.string(), 32), padTo(inner.string(), 32)]);
      return cryptoVerify("sha256", data, { key: publicKey.key, dsaEncoding: "ieee-p1363" }, sig) ? null : "签名不匹配";
    }
    case "sk-ssh-ed25519@openssh.com":
    case "sk-ecdsa-sha2-nistp256@openssh.com": {
      if (algorithm !== publicKey.type) return `签名算法 ${algorithm} 与公钥不符`;
      const flags = reader.byte();
      const counter = reader.bytes(4);
      if (!reader.done()) return "签名字段末尾有多余数据";
      if ((flags & 0x01) === 0) return "硬件密钥签名没有「用户在场」标志（没有触碰密钥）";
      const signed = Buffer.concat([
        createHash("sha256").update(publicKey.application ?? "").digest(),
        Buffer.from([flags]),
        counter,
        createHash("sha256").update(data).digest(),
      ]);
      if (publicKey.type === "sk-ssh-ed25519@openssh.com") return cryptoVerify(null, signed, publicKey.key, raw) ? null : "签名不匹配";
      const inner = new Reader(raw);
      const sig = Buffer.concat([padTo(inner.string(), 32), padTo(inner.string(), 32)]);
      return cryptoVerify("sha256", signed, { key: publicKey.key, dsaEncoding: "ieee-p1363" }, sig) ? null : "签名不匹配";
    }
  }
}

/**
 * 验 `message` 的 SSHSIG：命名空间相符、签名人在允许名单里（按公钥 blob 全等）、签名正确。
 * 任何解析错误都返回 ok:false（fail closed），不抛。
 */
export function verifySshsig(message: Buffer, armored: string, namespace: string, allowed: readonly SshPublicKey[]): SshsigVerdict {
  let parsed: ParsedSshsig;
  try {
    parsed = parseSshsig(armored);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  if (parsed.namespace !== namespace) return { ok: false, reason: `命名空间是 ${parsed.namespace}，应为 ${namespace}` };
  const signer = allowed.find((candidate) => candidate.blob.equals(parsed.publicKey.blob));
  if (signer === undefined) return { ok: false, reason: `签名密钥 ${parsed.publicKey.fingerprint} 不在登记的签名人里` };
  try {
    const failure = verifySignatureField(signer, parsed.signature, sshsigSignedData(message, namespace, parsed.hashAlgorithm, parsed.reserved));
    return failure === null ? { ok: true, publicKey: signer } : { ok: false, reason: failure };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

/** 私钥文件是否加了口令（不解密、不需要 ssh-keygen）：openssh-key-v1 看 ciphername；PEM 看加密头。 */
export function privateKeyProtection(text: string): "passphrase" | "none" | "unknown" {
  if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) || /Proc-Type:\s*4,ENCRYPTED/.test(text)) return "passphrase";
  const match = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END OPENSSH PRIVATE KEY-----/.exec(text);
  if (match !== null) {
    try {
      const reader = new Reader(Buffer.from((match[1] ?? "").replace(/\s+/g, ""), "base64"));
      if (reader.bytes(15).toString("latin1") !== "openssh-key-v1\0") return "unknown";
      return reader.text() === "none" ? "none" : "passphrase";
    } catch {
      return "unknown";
    }
  }
  if (/-----BEGIN (RSA |EC |)PRIVATE KEY-----/.test(text)) return "none";
  return "unknown";
}
