// SSHSIG 验签钉测（code-spec trusted-signoff §3.2、§6；AP-0a）：五种公钥逐一验过；命名空间、篡改、
// 非登记密钥、摘要算法、外壳错误、硬件密钥用户在场标志；私钥口令检测；有 ssh-keygen 时双向互通
// （ssh-keygen 签 → 本模块验，本模块的测试签名 → ssh-keygen 验，指纹与 ssh-keygen -l 一致）。
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_KEY_TYPES, parsePublicKeyLine, parseSshsig, privateKeyProtection, verifySshsig } from "../src/sshsig.js";
import { makeKey, opensshPrivateKeyText, signSshsig } from "./fixtures/trust/sshsig-signer.js";

const message = Buffer.from('{"schema":"pomaster.signoff-request/v1","id":"SO-0123456789ab"}\n');

describe("SSHSIG 验签", () => {
  for (const type of SUPPORTED_KEY_TYPES) {
    it(`${type}：本人签的过；改一个字节、换命名空间、换人都不过`, () => {
      const key = makeKey(type);
      const allowed = [parsePublicKeyLine(key.line)];
      const signature = signSshsig(key, message);
      expect(verifySshsig(message, signature, "pomaster", allowed)).toMatchObject({ ok: true });
      const tampered = Buffer.from(message);
      tampered[5] = (tampered[5] as number) ^ 0x01;
      expect(verifySshsig(tampered, signature, "pomaster", allowed)).toMatchObject({ ok: false, reason: "签名不匹配" });
      expect(verifySshsig(message, signSshsig(key, message, { namespace: "git" }), "pomaster", allowed)).toMatchObject({ ok: false });
      const other = parsePublicKeyLine(makeKey("ssh-ed25519").line);
      expect(verifySshsig(message, signature, "pomaster", [other])).toMatchObject({ ok: false });
    });
  }

  it("sha256 摘要也认；RSA 只认 rsa-sha2-256 / 512", () => {
    const ed = makeKey("ssh-ed25519");
    expect(verifySshsig(message, signSshsig(ed, message, { hash: "sha256" }), "pomaster", [parsePublicKeyLine(ed.line)]).ok).toBe(true);
    const rsa = makeKey("ssh-rsa");
    expect(verifySshsig(message, signSshsig(rsa, message, { rsaAlgorithm: "rsa-sha2-256" }), "pomaster", [parsePublicKeyLine(rsa.line)]).ok).toBe(true);
  });

  it("硬件密钥没触碰（没有用户在场标志）不过", () => {
    const key = makeKey("sk-ssh-ed25519@openssh.com");
    const verdict = verifySshsig(message, signSshsig(key, message, { skFlags: 0x00 }), "pomaster", [parsePublicKeyLine(key.line)]);
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.ok ? "" : verdict.reason).toContain("用户在场");
    expect(parsePublicKeyLine(key.line).hardware).toBe(true);
  });

  it("外壳不对、截断、类型不支持：一律 ok:false，不抛", () => {
    const key = makeKey("ssh-ed25519");
    const allowed = [parsePublicKeyLine(key.line)];
    expect(verifySshsig(message, "not a signature", "pomaster", allowed).ok).toBe(false);
    const signature = signSshsig(key, message);
    expect(verifySshsig(message, signature.replace(/\n[A-Za-z0-9+/]{10}/, "\n"), "pomaster", allowed).ok).toBe(false);
    expect(() => parsePublicKeyLine("ssh-dss AAAAB3NzaC1kc3MAAACBAP")).toThrow();
    expect(() => parsePublicKeyLine(`ssh-rsa ${key.blob.toString("base64")}`)).toThrow(/不一致/);
    expect(parseSshsig(signature).hashAlgorithm).toBe("sha512");
  });

  it("指纹是 SHA256:<base64 无填充>", () => {
    const parsed = parsePublicKeyLine(makeKey("ssh-ed25519").line);
    expect(parsed.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it("私钥口令检测：openssh-key-v1 看加密算法，PEM 看加密头", () => {
    expect(privateKeyProtection(opensshPrivateKeyText("none"))).toBe("none");
    expect(privateKeyProtection(opensshPrivateKeyText("aes256-ctr"))).toBe("passphrase");
    expect(privateKeyProtection("-----BEGIN ENCRYPTED PRIVATE KEY-----\nx\n-----END ENCRYPTED PRIVATE KEY-----")).toBe("passphrase");
    expect(privateKeyProtection("-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n")).toBe("passphrase");
    expect(privateKeyProtection("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----")).toBe("none");
    expect(privateKeyProtection("PuTTY-User-Key-File-3: ssh-ed25519")).toBe("unknown");
  });
});

const hasSshKeygen = spawnSync("ssh-keygen", ["-?"], { stdio: "ignore" }).error === undefined;

describe.skipIf(!hasSshKeygen)("与真实 ssh-keygen 互通（CI 三平台都有 OpenSSH）", () => {
  for (const [type, args] of [
    ["ssh-ed25519", ["-t", "ed25519"]],
    ["ecdsa-sha2-nistp256", ["-t", "ecdsa", "-b", "256"]],
    ["ssh-rsa", ["-t", "rsa", "-b", "2048"]],
  ] as const) {
    it(`${type}：ssh-keygen 签的本模块验得过，指纹与 ssh-keygen -l 一致`, () => {
      const dir = mkdtempSync(join(tmpdir(), "pomaster-sshsig-"));
      try {
        const keyPath = join(dir, "key");
        execFileSync("ssh-keygen", ["-q", ...args, "-N", "", "-C", "interop", "-f", keyPath]);
        const payload = join(dir, "request.json");
        writeFileSync(payload, message);
        execFileSync("ssh-keygen", ["-Y", "sign", "-f", keyPath, "-n", "pomaster", payload], { stdio: "ignore" });
        const publicKey = parsePublicKeyLine(readFileSync(`${keyPath}.pub`, "utf8"));
        const verdict = verifySshsig(message, readFileSync(`${payload}.sig`, "utf8"), "pomaster", [publicKey]);
        expect(verdict.ok, verdict.ok ? "" : verdict.reason).toBe(true);
        const listed = execFileSync("ssh-keygen", ["-l", "-E", "sha256", "-f", `${keyPath}.pub`], { encoding: "utf8" });
        expect(listed).toContain(publicKey.fingerprint);
        expect(privateKeyProtection(readFileSync(keyPath, "utf8"))).toBe("none");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("本模块测试签名器产出的签名 ssh-keygen -Y verify 也认（反向互通，证明测试签名就是真格式）", () => {
    const dir = mkdtempSync(join(tmpdir(), "pomaster-sshsig-"));
    try {
      const key = makeKey("ssh-ed25519");
      writeFileSync(join(dir, "allowed_signers"), `owner namespaces="pomaster" ${key.line}\n`);
      writeFileSync(join(dir, "sig"), signSshsig(key, message));
      const result = spawnSync("ssh-keygen", ["-Y", "verify", "-f", join(dir, "allowed_signers"), "-I", "owner", "-n", "pomaster", "-s", join(dir, "sig")], { input: message });
      expect(result.status, String(result.stderr)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
