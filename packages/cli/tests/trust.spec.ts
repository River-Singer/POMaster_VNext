// 可信人工签发钉测（code-spec trusted-signoff §3–§6；AP-0a / D-2）：登记（首次信任 → 链式登记）、登记表被改 /
// 被删时 fail closed；请求 → 签名 → 核验 → 一次性消费；重放、内容变了、过期、没签、别人签；保障等级；
// 人工点（scaffold confirm）没登记照旧记 self_attested、登记后不带签发拒绝、带签发通过且只能用一次。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore } from "@pomaster/kernel";
import { runScaffoldConfirm } from "../src/scaffold-governance.js";
import {
  loadRegistry,
  requireHumanSignoff,
  runTrustEnroll,
  runTrustRequest,
  runTrustSign,
  runTrustStatus,
  runTrustVerify,
  statementSubject,
  verifySignoff,
  type TrustEnv,
} from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const SAMPLE_SPEC = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-trust-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };

function writeKey(name: string, key: TestKey, cipher: "none" | "aes256-ctr" = "aes256-ctr"): { pub: string; priv: string } {
  const pub = join(dir, `${name}.pub`);
  const priv = join(dir, name);
  writeFileSync(pub, `${key.line}\n`);
  writeFileSync(priv, opensshPrivateKeyText(cipher));
  return { pub, priv };
}

/** 人在自己终端签名的替身：把请求文件字节用测试密钥签成 .sig。 */
function humanSigns(id: string, key: TestKey): void {
  const path = join(dir, ".pomaster", "trust", "requests", `${id}.json`);
  writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
}

function enrollOwner(key: TestKey = makeKey("ssh-ed25519")): TestKey {
  const files = writeKey("owner", key);
  expect(runTrustEnroll(dir, { key: files.pub, principal: "owner", private: files.priv }, noAgent).ok).toBe(true);
  return key;
}

function requestFor(kind: string, subject: { ref: string; sha256: string }, env: TrustEnv = noAgent): string {
  const outcome = runTrustRequest(dir, { kind, ref: subject.ref, sha256: subject.sha256 }, env);
  expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
  return (outcome.result as { id: string }).id;
}

describe("trust enroll · 登记表", () => {
  it("第一个签名人首次信任；之后加人必须由已登记的人签发；登记表按链校验", () => {
    const owner = enrollOwner();
    expect(loadRegistry(dir)).toMatchObject({ state: "ok" });
    expect(readFileSync(join(dir, ".pomaster", "trust", "allowed_signers"), "utf8")).toContain(`owner namespaces="pomaster" ssh-ed25519 `);
    const reviewer = makeKey("ecdsa-sha2-nistp256");
    const files = writeKey("reviewer", reviewer);
    const refused = runTrustEnroll(dir, { key: files.pub, principal: "reviewer" }, noAgent);
    expect(refused.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    const hint = refused.errors[0]?.hint ?? "";
    const sha = /--sha256 ([0-9a-f]{64})/.exec(hint)?.[1] ?? "";
    const id = requestFor("trust-enroll", { ref: "signer:reviewer", sha256: sha });
    humanSigns(id, reviewer); // 新人自己签：不算
    expect(runTrustEnroll(dir, { key: files.pub, principal: "reviewer", signoff: id }, noAgent).errors[0]?.code).toBe("TRUST_SIGNATURE_INVALID");
    humanSigns(id, owner);
    const enrolled = runTrustEnroll(dir, { key: files.pub, principal: "reviewer", signoff: id }, noAgent);
    expect(enrolled.ok, JSON.stringify(enrolled.errors)).toBe(true);
    const registry = loadRegistry(dir);
    expect(registry.state === "ok" ? registry.file.signers.map((signer) => signer.principal) : []).toEqual(["owner", "reviewer"]);
    expect(runTrustEnroll(dir, { key: files.pub, principal: "reviewer" }, noAgent).result).toMatchObject({ change: "NO_CHANGE" });
  });

  it("有人手改 signers.json 塞进自己的公钥：登记表不成立，所有人工点拒绝", () => {
    enrollOwner();
    const intruder = makeKey("ssh-ed25519");
    const path = join(dir, ".pomaster", "trust", "signers.json");
    const file = JSON.parse(readFileSync(path, "utf8"));
    file.signers.push({ ...file.signers[0], principal: "agent", key: intruder.line.split(" ").slice(0, 2).join(" "), fingerprint: "x", bootstrap: undefined });
    writeFileSync(path, JSON.stringify(file));
    expect(loadRegistry(dir)).toMatchObject({ state: "invalid" });
    const gate = requireHumanSignoff(dir, { kind: "scaffold-confirm", ref: "x", sha256: "0".repeat(64), by: "human:owner", consumedBy: "test" });
    expect(gate.ok ? "" : gate.error.code).toBe("TRUST_REGISTRY_INVALID");
  });

  it("删掉 signers.json 想退回自报模式：还有签发记录就判不成立", () => {
    enrollOwner();
    requestFor("kickoff", statementSubject("启动确认单 v1"));
    rmSync(join(dir, ".pomaster", "trust", "signers.json"));
    expect(loadRegistry(dir)).toMatchObject({ state: "invalid" });
    expect(runTrustStatus(dir).result).toMatchObject({ mode: "invalid" });
  });

  it("公钥不支持、文件不对：明确报错", () => {
    writeFileSync(join(dir, "dsa.pub"), "ssh-dss AAAAB3NzaC1kc3MAAACB comment\n");
    expect(runTrustEnroll(dir, { key: join(dir, "dsa.pub"), principal: "owner" }).errors[0]?.code).toBe("TRUST_KEY_UNSUPPORTED");
    expect(runTrustEnroll(dir, { key: join(dir, "missing.pub"), principal: "owner" }).errors[0]?.code).toBe("TRUST_KEY_NOT_FOUND");
    expect(runTrustEnroll(dir, { key: join(dir, "dsa.pub"), principal: "bad name" }).errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("签发 · 请求 → 签名 → 核验 → 一次性消费", () => {
  it("签过的能用一次；第二次是重放；内容变了是不符；别人签的、没签的都不算", () => {
    const owner = enrollOwner();
    const subject = statementSubject("baseline:baseline/backend/stack.yaml not-applicable — 纯前端项目");
    const gate = (signoff?: string) => requireHumanSignoff(dir, { kind: "baseline-retire", ...subject, by: "human:owner", consumedBy: "test", ...(signoff !== undefined ? { signoff } : {}) }, noAgent);
    const noSignoff = gate();
    expect(noSignoff.ok ? "" : noSignoff.error.code).toBe("TRUST_SIGNOFF_REQUIRED");
    expect(noSignoff.ok ? "" : noSignoff.error.hint).toContain("pomaster trust request baseline-retire --ref");
    const id = requestFor("baseline-retire", subject);
    expect((gate(id) as { error: { code: string } }).error.code).toBe("TRUST_SIGNATURE_MISSING");
    humanSigns(id, makeKey("ssh-ed25519"));
    expect((gate(id) as { error: { code: string } }).error.code).toBe("TRUST_SIGNATURE_INVALID");
    humanSigns(id, owner);
    const used = gate(id);
    expect(used).toMatchObject({ ok: true, record: { signoff: id, principal: "owner", assurance: "strong" } });
    expect((gate(id) as { error: { code: string } }).error.code).toBe("TRUST_SIGNOFF_REPLAYED");
    const other = requestFor("baseline-retire", subject);
    humanSigns(other, owner);
    const changed = requireHumanSignoff(dir, { kind: "baseline-retire", ...statementSubject("baseline:baseline/backend/stack.yaml not-applicable — 别的理由"), by: "human:owner", consumedBy: "test", signoff: other }, noAgent);
    expect(changed.ok ? "" : changed.error.code).toBe("TRUST_SIGNOFF_MISMATCH");
    const wrongKind = requireHumanSignoff(dir, { kind: "accept", ...subject, by: "human:owner", consumedBy: "test", signoff: other }, noAgent);
    expect(wrongKind.ok ? "" : wrongKind.error.code).toBe("TRUST_SIGNOFF_MISMATCH");
    expect(existsSync(join(dir, ".pomaster", "trust", "consumed", `${other}.json`))).toBe(false); // 不符的不消费
  });

  it("过期就作废；请求文件改一个字节签名就不成立", () => {
    const owner = enrollOwner();
    const subject = statementSubject("启动确认单 v1");
    const issuedAt = new Date("2026-11-12T00:00:00Z");
    const id = requestFor("kickoff", subject, { ...noAgent, now: () => issuedAt });
    humanSigns(id, owner);
    const later = verifySignoff(dir, id, { kind: "kickoff", ...subject }, { consume: true, env: { ...noAgent, now: () => new Date("2026-11-14T00:00:00Z") } });
    expect(later.ok ? "" : later.error.code).toBe("TRUST_SIGNOFF_EXPIRED");
    const path = join(dir, ".pomaster", "trust", "requests", `${id}.json`);
    writeFileSync(path, readFileSync(path, "utf8").replace("2026-11-13", "2026-11-19"));
    const tampered = verifySignoff(dir, id, { kind: "kickoff", ...subject }, { consume: false, env: { ...noAgent, now: () => issuedAt } });
    expect(tampered.ok ? "" : tampered.error.code).toBe("TRUST_SIGNATURE_INVALID");
  });

  it("两个人工点抢同一份签发：只有一个成功", () => {
    const owner = enrollOwner();
    const subject = statementSubject("启动确认单 v1");
    const id = requestFor("kickoff", subject);
    humanSigns(id, owner);
    const results = [0, 1].map(() => verifySignoff(dir, id, { kind: "kickoff", ...subject }, { consume: true, env: noAgent }));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: { code: "TRUST_SIGNOFF_REPLAYED" } });
  });

  it("trust sign 包 ssh-keygen；trust verify 只读", () => {
    const owner = enrollOwner();
    const id = requestFor("kickoff", statementSubject("启动确认单 v1"));
    const calls: string[][] = [];
    const signed = runTrustSign(dir, { id, key: join(dir, "owner") }, {
      ...noAgent,
      runSshKeygen: (args) => {
        calls.push([...args]);
        humanSigns(id, owner);
        return { status: 0 };
      },
    });
    expect(signed.ok, JSON.stringify(signed.errors)).toBe(true);
    expect(calls[0]?.slice(0, 5)).toEqual(["-Y", "sign", "-f", join(dir, "owner"), "-n"]);
    expect(runTrustSign(dir, { id, key: "k" }, { runSshKeygen: () => ({ status: null, error: new Error("ENOENT") }) }).errors[0]?.code).toBe("TRUST_SSH_KEYGEN_MISSING");
    const verified = runTrustVerify(dir, id, noAgent);
    expect(verified.result).toMatchObject({ consumed: false, principal: "owner" });
    expect(existsSync(join(dir, ".pomaster", "trust", "consumed", `${id}.json`))).toBe(false);
  });
});

describe("保障等级", () => {
  const level = (key: TestKey, cipher: "none" | "aes256-ctr" | null, agent: readonly string[]) => {
    rmSync(join(dir, ".pomaster"), { recursive: true, force: true });
    const files = writeKey("k", key, cipher ?? "none");
    runTrustEnroll(dir, { key: files.pub, principal: "owner", ...(cipher !== null ? { private: files.priv } : {}) }, { listAgentKeys: () => agent });
    return (runTrustStatus(dir, { listAgentKeys: () => agent }).result as { signers: Array<{ assurance: string }> }).signers[0]?.assurance;
  };

  it("硬件密钥 strong；带口令且不在 ssh-agent strong；无口令或在 ssh-agent weak；没查 unknown", () => {
    expect(level(makeKey("sk-ssh-ed25519@openssh.com"), null, [])).toBe("strong");
    const key = makeKey("ssh-ed25519");
    expect(level(key, "aes256-ctr", [])).toBe("strong");
    expect(level(key, "aes256-ctr", [key.line])).toBe("weak");
    expect(level(key, "none", [])).toBe("weak");
    expect(level(key, null, [])).toBe("unknown");
  });

  it("没登记：status 如实报自报模式与 QA 未隔离", () => {
    const status = runTrustStatus(dir);
    expect(status.result).toMatchObject({ mode: "self_attested", qa: { isolation: "not_isolated" } });
    expect(status.human.join("\n")).toContain("self_attested");
  });
});

describe("人工点 · scaffold confirm", () => {
  async function project(): Promise<void> {
    await createStore(dir);
    const authPath = join(dir, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
    auth.authorities["BOOTSTRAP_OWNER"] = {};
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
    mkdirSync(join(dir, ".pomaster", "scaffold"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "scaffold", "domain-spec.yaml"), readFileSync(SAMPLE_SPEC, "utf8"));
  }

  it("没登记签名人：照旧确认，记 self_attested", async () => {
    await project();
    const outcome = await runScaffoldConfirm(dir, { by: "human:owner" });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result.signoff).toMatchObject({ assurance: "self_attested", by: "human:owner" });
    expect(outcome.human.join("\n")).toContain("self_attested");
  });

  it("登记后：--by human: 单独不算；按提示建请求、人签名后带 --signoff 通过，确认记录里有签发证明", async () => {
    await project();
    const owner = enrollOwner();
    const refused = await runScaffoldConfirm(dir, { by: "human:owner" });
    expect(refused.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    expect(refused.errors[0]?.hint).toContain("pomaster trust request scaffold-confirm --subject .pomaster/scaffold/domain-spec.yaml");
    const request = runTrustRequest(dir, { kind: "scaffold-confirm", subject: ".pomaster/scaffold/domain-spec.yaml" }, noAgent);
    const id = (request.result as { id: string }).id;
    humanSigns(id, owner);
    const confirmed = await runScaffoldConfirm(dir, { by: "human:owner", signoff: id });
    expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
    expect(confirmed.result.signoff).toMatchObject({ signoff: id, principal: "owner" });
    const record = JSON.parse(readFileSync(join(dir, ".pomaster", "scaffold", "confirmation.json"), "utf8"));
    expect(record.current.signoff).toMatchObject({ signoff: id });
  });

  it("签的是旧版规格：内容不符，拒绝", async () => {
    await project();
    const owner = enrollOwner();
    const id = (runTrustRequest(dir, { kind: "scaffold-confirm", subject: ".pomaster/scaffold/domain-spec.yaml" }, noAgent).result as { id: string }).id;
    humanSigns(id, owner);
    writeFileSync(join(dir, ".pomaster", "scaffold", "domain-spec.yaml"), `${readFileSync(SAMPLE_SPEC, "utf8")}\n# 改了一行\n`);
    const outcome = await runScaffoldConfirm(dir, { by: "human:owner", signoff: id });
    expect(outcome.errors[0]?.code).toBe("TRUST_SIGNOFF_MISMATCH");
  });
});
