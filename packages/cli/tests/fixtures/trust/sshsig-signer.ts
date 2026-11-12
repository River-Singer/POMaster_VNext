// 测试用 SSHSIG 签名器（sshsig.spec / trust.spec）：用 node:crypto 生成密钥并按 OpenSSH PROTOCOL.sshsig
// 产生与 `ssh-keygen -Y sign` 同格式的签名。sk-* 硬件密钥按 FIDO 签名数据构造法模拟（可选去掉用户在场标志）。
import { createHash, generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import { sshString, sshsigSignedData, SSHSIG_MAGIC, type SshKeyType } from "../../../src/sshsig.js";

export interface TestKey {
  readonly type: SshKeyType;
  readonly blob: Buffer;
  /** OpenSSH 公钥行（带注释）。 */
  readonly line: string;
  readonly privateKey: KeyObject;
  readonly application?: string;
}

const mpint = (raw: Buffer) => {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start += 1;
  const trimmed = raw.subarray(start);
  return (trimmed[0] as number) & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
};

export function makeKey(type: SshKeyType, comment = "test@pomaster"): TestKey {
  if (type === "ssh-ed25519" || type === "sk-ssh-ed25519@openssh.com") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const x = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url");
    const application = type.startsWith("sk-") ? "ssh:" : undefined;
    const blob = Buffer.concat([sshString(type), sshString(x), ...(application !== undefined ? [sshString(application)] : [])]);
    return { type, blob, line: `${type} ${blob.toString("base64")} ${comment}`, privateKey, ...(application !== undefined ? { application } : {}) };
  }
  if (type === "ecdsa-sha2-nistp256" || type === "sk-ecdsa-sha2-nistp256@openssh.com") {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x as string, "base64url"), Buffer.from(jwk.y as string, "base64url")]);
    const application = type.startsWith("sk-") ? "ssh:" : undefined;
    const blob = Buffer.concat([sshString(type), sshString("nistp256"), sshString(point), ...(application !== undefined ? [sshString(application)] : [])]);
    return { type, blob, line: `${type} ${blob.toString("base64")} ${comment}`, privateKey, ...(application !== undefined ? { application } : {}) };
  }
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const blob = Buffer.concat([sshString("ssh-rsa"), sshString(mpint(Buffer.from(jwk.e as string, "base64url"))), sshString(mpint(Buffer.from(jwk.n as string, "base64url")))]);
  return { type, blob, line: `ssh-rsa ${blob.toString("base64")} ${comment}`, privateKey };
}

export interface SignOptions {
  readonly namespace?: string;
  readonly hash?: "sha256" | "sha512";
  readonly rsaAlgorithm?: "rsa-sha2-256" | "rsa-sha2-512";
  /** sk-*：默认 0x01（用户在场）。 */
  readonly skFlags?: number;
}

function ecdsaField(der: Buffer): Buffer {
  // ieee-p1363 r||s → string(mpint r) ‖ string(mpint s)
  return Buffer.concat([sshString(mpint(der.subarray(0, 32))), sshString(mpint(der.subarray(32)))]);
}

export function signSshsig(key: TestKey, message: Buffer, options: SignOptions = {}): string {
  const namespace = options.namespace ?? "pomaster";
  const hash = options.hash ?? "sha512";
  const data = sshsigSignedData(message, namespace, hash);
  let field: Buffer;
  if (key.type === "ssh-ed25519") {
    field = Buffer.concat([sshString("ssh-ed25519"), sshString(cryptoSign(null, data, key.privateKey))]);
  } else if (key.type === "ssh-rsa") {
    const algorithm = options.rsaAlgorithm ?? "rsa-sha2-512";
    field = Buffer.concat([sshString(algorithm), sshString(cryptoSign(algorithm === "rsa-sha2-512" ? "sha512" : "sha256", data, key.privateKey))]);
  } else if (key.type === "ecdsa-sha2-nistp256") {
    field = Buffer.concat([sshString(key.type), sshString(ecdsaField(cryptoSign("sha256", data, { key: key.privateKey, dsaEncoding: "ieee-p1363" })))]);
  } else {
    const flags = options.skFlags ?? 0x01;
    const counter = Buffer.from([0, 0, 0, 7]);
    const signed = Buffer.concat([createHash("sha256").update(key.application ?? "").digest(), Buffer.from([flags]), counter, createHash("sha256").update(data).digest()]);
    const raw = key.type === "sk-ssh-ed25519@openssh.com"
      ? cryptoSign(null, signed, key.privateKey)
      : ecdsaField(cryptoSign("sha256", signed, { key: key.privateKey, dsaEncoding: "ieee-p1363" }));
    field = Buffer.concat([sshString(key.type), sshString(raw), Buffer.from([flags]), counter]);
  }
  const version = Buffer.alloc(4);
  version.writeUInt32BE(1, 0);
  const blob = Buffer.concat([Buffer.from(SSHSIG_MAGIC, "latin1"), version, sshString(key.blob), sshString(namespace), sshString(Buffer.alloc(0)), sshString(hash), sshString(field)]);
  const body = blob.toString("base64").replace(/.{1,70}/g, "$&\n");
  return `-----BEGIN SSH SIGNATURE-----\n${body}-----END SSH SIGNATURE-----\n`;
}

/** openssh-key-v1 私钥文件的最小外壳（只为测口令检测：ciphername 决定是否加密）。 */
export function opensshPrivateKeyText(cipher: "none" | "aes256-ctr"): string {
  const blob = Buffer.concat([Buffer.from("openssh-key-v1\0", "latin1"), sshString(cipher), sshString(cipher === "none" ? "none" : "bcrypt"), sshString(Buffer.alloc(0))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${blob.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----\n`;
}
