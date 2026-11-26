import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, compareSourceSnapshots, createStore, issuePermit, storagePathOfSha256, type GovernedId } from "@pomaster/kernel";
import { CURRENT_GATE_DEFS } from "@pomaster/gauntlet-lite";
import { captureEvidenceSourceSnapshot } from "../src/source-snapshot.js";
import {
  createProgram, projectReviewStatement, runCli, runIntakeRead, runTrustEnroll,
  runTrustRequest, statementSubject, type CliEnvelope, type ProjectReviewSnapshot,
  type ReviewDraftResult, type SkillsAuditResult, type SkillsRecommendResult,
} from "../src/index.js";
import { loadIntakeLatest } from "../src/intake.js";
import { verifySignoff } from "../src/trust.js";
import { SKILL_MANIFEST } from "../src/heavy-entry.js";
import { makeKey, signSshsig } from "./fixtures/trust/sshsig-signer.js";

let root: string;
const skill = "frontend-design";
// Caller-supplied identity fixture, not an assertion of a verified upstream commit.
const pin = { source: "https://github.com/anthropics/claude-plugins-official", revision: "3298993c5ec35c7eed6103a462a348169de243eb", evidence: "independent CLI test revision fixture; upstream not verified" };
const task = "TASK.CLI.REVIEW";
const execution = "AGX-2026-09101";
const noAgent = { listAgentKeys: () => [] };
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const absolute = (ref: string) => join(root, ref);
function put(ref: string, value: unknown): void {
  mkdirSync(dirname(absolute(ref)), { recursive: true });
  writeFileSync(absolute(ref), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function tree(): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (ref: string) => {
    for (const entry of readdirSync(absolute(ref), { withFileTypes: true })) {
      const child = ref ? `${ref}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { found[`${child}/`] = "directory"; walk(child); }
      else found[child] = readFileSync(absolute(child)).toString("hex");
    }
  };
  walk("");
  return found;
}
async function cli<T = unknown>(args: readonly string[]): Promise<{ code: number; envelope: CliEnvelope<T>; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], { stdout: line => stdout.push(line), stderr: line => stderr.push(line) });
  expect(stdout).toHaveLength(1); // Exactly one envelope, never a naked exception or extra human output.
  return { code, envelope: JSON.parse(stdout[0]!) as CliEnvelope<T>, stderr: stderr.join("\n") };
}
function expectFailure(out: { code: number; envelope: CliEnvelope }, command?: string): void {
  expect(out.code).toBe(1);
  expect(out.envelope.ok).toBe(false);
  expect(out.envelope.errors.length).toBeGreaterThan(0);
  if (command) {
    expect(out.envelope.command).toBe(command);
    expect(out.envelope.errors[0]?.code).not.toBe("UNEXPECTED_ERROR");
  }
}

// Real authority and input fixtures; deliberately no passing GRNs, VERIFIED claims or Human ACCEPT.
async function blockedReviewFixture(): Promise<void> {
  const store = await createStore(root);
  put(".pomaster/state/authority.json", { version: 1, authorities: { BUSINESS_OWNER: {} } });
  put("input/requirements.md", "# Orders\n\n必须校验订单金额。\n");
  expect((await runIntakeRead(root, { paths: [absolute("input")], name: "cli-review" })).ok).toBe(true);
  const loaded = loadIntakeLatest(root, "cli-review");
  if (!loaded.ok) throw new Error("Intake fixture unavailable");
  const key = makeKey("ssh-ed25519");
  put("owner.pub", key.line);
  expect(runTrustEnroll(root, { key: absolute("owner.pub"), principal: "owner" }, noAgent).ok).toBe(true);
  const sheet = {
    schema: "pomaster.kickoff-sheet/v1", id: "KO-cli-review-r1", workspace: "cli-review", revision: loaded.data.files.revision,
    scope: { in: ["orders"], out: [] }, budget: { valid_days: 14, max_rework_rounds: 3, stop_on: [] }, thresholds: [],
    autonomy: { allow: ["naming"], stop: ["scope_change"] },
  };
  const sheetRef = `.pomaster/kickoff/${sheet.id}/sheet.json`;
  put(sheetRef, sheet);
  const request = runTrustRequest(root, { kind: "kickoff", subject: sheetRef }, noAgent);
  expect(request.ok).toBe(true);
  const signoff = request.result!.id as string;
  const requestPath = absolute(`.pomaster/trust/requests/${signoff}.json`);
  writeFileSync(`${requestPath}.sig`, signSshsig(key, readFileSync(requestPath)));
  expect(verifySignoff(root, signoff, { kind: "kickoff", ref: sheetRef, sha256: hash(readFileSync(absolute(sheetRef))) }, { consume: true, env: noAgent, consumedBy: "kickoff confirm" }).ok).toBe(true);
  const now = Date.now();
  put(".pomaster/kickoff/current.json", { schema: "pomaster.kickoff-current/v1", sheet: sheet.id, sheet_sha256: hash(readFileSync(absolute(sheetRef))), signoff, principal: "owner", assurance: "unknown", applied_at: new Date(now).toISOString(), valid_until: new Date(now + 14 * 86400000).toISOString() });
  expect((await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
    id: task, kind: "task_object", axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "CLI review task", authority: { owner: "BUSINESS_OWNER", delegates: [] }, origin: "natural",
    payload: { intent: "Final delivery", round: sheet.id, acceptance: [{ criterion: "Independent result", claim: "CLM-0001", requires: ["unit_behavior"] }], class_scan_result: { scope: "CLI fixture missing independent evidence", hits: 1, fixed_count: 0, regression_case_ref: "TEST.CLI.REVIEW.PENDING" } },
  } as never }] })).changedObjectIds).toContain(task);
  put(`.pomaster/plan/${sheet.id}/plan.json`, { committed: true, fingerprint: "cli-fixture-plan", units: [{ id: task, lane: "be", entity: "orders" }] });
  const qaRef = `.pomaster/qa/${sheet.id}/cases-frozen.json`;
  put(qaRef, { schema: "pomaster.qa-cases/v1", round: sheet.id, revision: sheet.revision, sheet_sha256: hash(readFileSync(absolute(sheetRef))), resolutions_sha256: loaded.data.files.resolutions_sha256, plan_fingerprint: "cli-fixture-plan", cases: [{ id: "CASE-0001", source_refs: ["REQ-0001"], expected_zh: "校验金额" }], isolation: "not_isolated", parent: null });
  put(".pomaster/qa/current.json", { schema: "pomaster.qa-current/v1", round: sheet.id, sheet: sheet.id, sheet_sha256: hash(readFileSync(absolute(sheetRef))), revision: sheet.revision, resolutions_sha256: loaded.data.files.resolutions_sha256, cases_frozen_sha256: hash(readFileSync(absolute(qaRef))), isolation: "not_isolated", parent: null });
  const permit = await issuePermit(store, { subjectIds: [task as GovernedId], requestedBy: { actorType: "agent", actor: "coordinator", selfAttested: true }, ttlBeats: 1000 });
  await beginExecution(store, { executionId: execution, role: "orchestrator", runtime: "script", identityKind: "script", permitIds: [permit.permitRef] });
  put("src/app.ts", "export const app = 1;\n");
  put("src/client.ts", "export const client = 1;\n");
  put("dist/app.bin", "declared build bytes; not a passing receipt");
}
const draftArgs = ["autopilot", "review", "draft", "--execution", execution, "--code", "src/app.ts", "--code", "src/client.ts", "--build", "dist/app.bin"];
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "pomaster-cli-sk-review-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }); });

describe("public skills/review CLI wiring uses actual handlers", () => {
  it("registers every leaf with JSON/help and no bypass/write/installer flags", async () => {
    const program = createProgram();
    const skills = program.commands.find(command => command.name() === "skills")!;
    const review = program.commands.find(command => command.name() === "autopilot")!.commands.find(command => command.name() === "review")!;
    expect(skills.commands.map(command => command.name())).toEqual(["catalog", "recommend", "audit", "lock", "check"]);
    expect(review.commands.map(command => command.name())).toEqual(["draft", "show", "statement", "decide", "apply"]);
    for (const [prefix, leaves] of [[ ["skills"], skills.commands ], [ ["autopilot", "review"], review.commands ]] as const) {
      for (const leaf of leaves) {
        const output: string[] = [];
        expect(await runCli([...prefix, leaf.name(), "--help"], { stdout: line => output.push(line), stderr: line => output.push(line) })).toBe(0);
        expect(output.join("\n")).toContain("--json");
      }
    }
    expect(review.commands.find(command => command.name() === "apply")!.options.map(option => option.long)).toEqual(["--decision", "--json"]);
    expect(tree()).toEqual({});
  });

  it("catalog/recommend are read-only; exact pins advertise but never execute installers", async () => {
    put("pins.json", { [skill]: pin });
    put(".claude/settings.json", "{\"fixture\":true}\n");
    put("AGENTS.md", "Host authority sentinel\n");
    const before = tree();
    const catalog = await cli<{ skills: { id: string; known_revision: null }[] }>(["skills", "catalog"]);
    expect(catalog.code).toBe(0);
    expect(catalog.envelope.result.skills).toHaveLength(5);
    const unresolved = await cli<SkillsRecommendResult>(["skills", "recommend"]);
    expect(unresolved.code).toBe(0);
    expect(unresolved.envelope.result.recommendations.every(row => row.install_command === null)).toBe(true);
    const pinned = await cli<SkillsRecommendResult>(["skills", "recommend", "--pins", "pins.json", "--agent", "codex"]);
    expect(pinned.code).toBe(0);
    expect(pinned.envelope.result.recommendations.find(row => row.id === skill)?.install_command).toContain(`/tree/${pin.revision}`);
    expect(pinned.envelope.result.recommendations.find(row => row.id === skill)?.install_command).toContain("--agent codex");
    expect(pinned.envelope.result.required_route_skills).toBe("unchanged");
    expect(tree()).toEqual(before);
  });

  it.each(["null", "[]", "{", '{"frontend-design":null}', '{"frontend-design":[]}', JSON.stringify({ [skill]: { ...pin, revision: "main" } }), JSON.stringify({ [skill]: { ...pin, source: "https://example.invalid" } }), JSON.stringify({ unknown: pin })])("rejects bad pin maps in a named envelope: %s", async bytes => {
    put("pins.json", bytes);
    const before = tree();
    expectFailure(await cli(["skills", "recommend", "--pins", "pins.json"]), "skills recommend");
    expect(tree()).toEqual(before);
  });

  it("rejects repeated singleton arguments, escaping paths and oversized JSON without writes", async () => {
    put("pins.json", { [skill]: pin });
    put("pin.json", pin);
    put("large.json", " ".repeat(1024 * 1024 + 1));
    const before = tree();
    for (const args of [
      ["recommend", "--pins", "pins.json", "--pins", "pins.json"],
      ["recommend", "--pins", "../pins.json"],
      ["recommend", "--pins", absolute("pins.json")],
      ["recommend", "--pins", "large.json"],
      ["recommend", "--agent", "invalid"],
      ["audit", "--skill", skill, "--directory", "selected/design", "--pin", "pin.json", "--pin", "pin.json"],
      ["audit", "--skill", skill, "--skill", skill, "--directory", "selected/design"],
    ]) expectFailure(await cli(["skills", ...args]), `skills ${args[0]}`);
    expect(tree()).toEqual(before);
  });

  it.each(["null", "[]", "{", JSON.stringify({ [skill]: pin }), JSON.stringify({ ...pin, revision: "main" })])("rejects malformed single audit pins: %s", async bytes => {
    put("pin.json", bytes);
    put("selected/design/SKILL.md", "Use project standards.\n");
    const before = tree();
    expectFailure(await cli(["skills", "audit", "--skill", skill, "--directory", "selected/design", "--pin", "pin.json"]), "skills audit");
    expect(tree()).toEqual(before);
  });

  it("audit/lock receipts are immutable and idempotent; check reports drift, never safety/trust", async () => {
    put("pin.json", pin);
    put("selected/design/SKILL.md", "Use project design standards.\n");
    put("selected/design/installer.js", 'require("node:fs").writeFileSync("INSTALLER-RAN", "forbidden");\n');
    const auditArgs = ["skills", "audit", "--skill", skill, "--directory", "selected/design", "--pin", "pin.json"];
    const audited = await cli<SkillsAuditResult>(auditArgs);
    expect(audited.code).toBe(0);
    expect(audited.envelope.result.receipt.human_trust).toBe("not_granted");
    const receipt = readFileSync(absolute(audited.envelope.result.receipt_path));
    const again = await cli<SkillsAuditResult>(auditArgs);
    expect(again.envelope.result.status).toBe("NO_CHANGE");
    expect(again.envelope.result.audit).toBe(audited.envelope.result.audit);
    const lockArgs = ["skills", "lock", "--skill", skill, "--audit", audited.envelope.result.audit];
    expect((await cli(lockArgs)).code).toBe(0);
    const locked = tree();
    const repeated = await cli<{ status: string }>(lockArgs);
    expect(repeated.envelope.result.status).toBe("NO_CHANGE");
    expect((await cli(["skills", "check", "--skill", skill])).code).toBe(0);
    expect(tree()).toEqual(locked);
    put("selected/design/SKILL.md", "Changed content\n");
    expectFailure(await cli(["skills", "check"]), "skills check");
    expectFailure(await cli(lockArgs), "skills lock");
    const changedAudit = await cli<SkillsAuditResult>(auditArgs);
    expect(changedAudit.code).toBe(0);
    const beforeConflict = tree();
    expectFailure(await cli(["skills", "lock", "--skill", skill, "--audit", changedAudit.envelope.result.audit]), "skills lock");
    expect(tree()).toEqual(beforeConflict); // A different valid audit cannot overwrite the existing lock.
    expect(readFileSync(absolute(audited.envelope.result.receipt_path))).toEqual(receipt);
    expect(existsSync(absolute("INSTALLER-RAN"))).toBe(false);
    expect(existsSync(absolute(".agents"))).toBe(false);
    expect(existsSync(absolute(".claude"))).toBe(false);
  });

  it("missing required options and an empty lock set remain non-green", async () => {
    for (const args of [["skills", "audit"], ["skills", "lock"], ["autopilot", "review", "draft", "--execution", execution], ["autopilot", "review", "apply"]]) expectFailure(await cli(args));
    expectFailure(await cli(["skills", "check"]), "skills check");
    expect(tree()).toEqual({});
  });

  it("statement is byte-identical to decide's canonical subject without signing or consuming", async () => {
    const ref = `sha256:${"a".repeat(64)}`;
    const before = tree();
    const statement = await cli<{ statement: string; ref: string; sha256: string }>(["autopilot", "review", "statement", "--review", ref, "--verdict", "REWORK", "--affected", "TASK.Z", "--affected", "TASK.A", "--affected", "TASK.Z", "--reason", "  fix these  "]);
    const canonical = projectReviewStatement(ref, "REWORK", ["TASK.Z", "TASK.A", "TASK.Z"], "  fix these  ");
    expect(statement.code).toBe(0);
    expect(statement.envelope.result).toEqual({ statement: canonical, ...statementSubject(canonical) });
    expect(tree()).toEqual(before);
    const key = makeKey("ssh-ed25519");
    put("owner.pub", key.line);
    expect(runTrustEnroll(root, { key: absolute("owner.pub"), principal: "owner" }, noAgent).ok).toBe(true);
    const requested = await cli<{ id: string }>(["trust", "request", "accept", "--ref", statement.envelope.result.ref, "--sha256", statement.envelope.result.sha256]);
    expect(requested.code, JSON.stringify(requested.envelope.errors)).toBe(0);
    const request = JSON.parse(readFileSync(absolute(`.pomaster/trust/requests/${requested.envelope.result.id}.json`), "utf8"));
    expect(request.subject).toEqual(statementSubject(canonical));
    expect(existsSync(absolute(`.pomaster/trust/requests/${requested.envelope.result.id}.json.sig`))).toBe(false);
  });

  it("decide missing signature and apply without a signed decision remain non-green with no side effects", async () => {
    const key = makeKey("ssh-ed25519");
    put("owner.pub", key.line);
    expect(runTrustEnroll(root, { key: absolute("owner.pub"), principal: "owner" }, noAgent).ok).toBe(true);
    const ref = `sha256:${"b".repeat(64)}`;
    const before = tree();
    const decided = await cli(["autopilot", "review", "decide", "--review", ref, "--verdict", "ACCEPT"]);
    expectFailure(decided, "autopilot review decide");
    expect(decided.envelope.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    expectFailure(await cli(["autopilot", "review", "apply", "--decision", ref]), "autopilot review apply");
    expectFailure(await cli(["autopilot", "review", "apply", "--decision", ref, "--bypass"]));
    expectFailure(await cli(["autopilot", "review", "statement", "--review", ref, "--verdict", "GREEN"]), "autopilot review statement");
    expect(tree()).toEqual(before);
  });

  it("real init README placeholders allow draft/show blocked progress and immutable idempotent blobs", async () => {
    const initialized = await cli(["init", "--architecture", "vue", "--platforms", "none"]);
    expect(initialized.code, JSON.stringify(initialized.envelope.errors)).toBe(0);
    const placeholders = [".pomaster/evidence/runs/README.md", ".pomaster/evidence/claims/README.md"];
    const placeholderBytes = placeholders.map(ref => readFileSync(absolute(ref)));
    expect(placeholderBytes.every(bytes => bytes.toString().startsWith("<!-- pomaster"))).toBe(true);
    await blockedReviewFixture();
    const out = await cli<ReviewDraftResult>(draftArgs);
    expect(out.code, JSON.stringify(out.envelope.errors)).toBe(0);
    expect(out.envelope.result.ready).toBe(false);
    expect(out.envelope.result.blockers.length).toBeGreaterThan(0);
    expect(out.envelope.result.code_paths).toEqual(["src/app.ts", "src/client.ts"]);
    expect(out.envelope.result.tasks[0]?.machine_receipt.actor).not.toContain("human");
    expect(out.envelope.result.tasks[0]?.machine_receipt.satisfied).toBe(false);
    for (const placeholder of placeholders) expect(out.envelope.result.dependencies).not.toHaveProperty(placeholder);
    const ref = out.envelope.result.review_ref;
    const blob = absolute(`.pomaster/evidence/${storagePathOfSha256(ref)}`);
    const bytes = readFileSync(blob);
    const before = tree();
    expect((await cli<ReviewDraftResult>(draftArgs)).envelope.result.review_ref).toBe(ref);
    const shown = await cli<{ ready: boolean; validation: string; snapshot: ProjectReviewSnapshot }>(["autopilot", "review", "show", "--review", ref]);
    expect(shown.code, JSON.stringify(shown.envelope.errors)).toBe(0);
    expect(shown.envelope.result.validation).toBe("current");
    expect(shown.envelope.result.ready).toBe(false);
    expect(shown.envelope.result.snapshot.blockers).toEqual(out.envelope.result.blockers);
    expect(tree()).toEqual(before);
    put("src/app.ts", "export const app = 2;\n");
    const changed = tree();
    const stale = await cli<{ ready: boolean; validation: string; snapshot: ProjectReviewSnapshot }>(["autopilot", "review", "show", "--review", ref]);
    expectFailure(stale, "autopilot review show");
    expect(stale.envelope.result.validation).toBe("stale");
    expect(stale.envelope.result.ready).toBe(false);
    expect(stale.envelope.result.snapshot.blockers).toEqual(out.envelope.result.blockers);
    expect(tree()).toEqual(changed);
    expect(readFileSync(blob)).toEqual(bytes);
    expect(existsSync(absolute(".pomaster/evidence/runs/GRN-0001.json"))).toBe(false);
    expect(placeholders.map(ref => readFileSync(absolute(ref)))).toEqual(placeholderBytes);
  });

  it("a scenario-plan marker cannot downgrade missing fullstack generation to BUILD-only review", async () => {
    await blockedReviewFixture();
    // Synthetic final evidence establishes the ordinary baseline, not real project acceptance.
    const snapshot = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/app.ts", "src/client.ts", "dist/app.bin"], head: null });
    put(".pomaster/evidence/runs/GRN-0001.json", {
      record_type: "run", grn: "GRN-0001", execution_id: execution, evidence_purpose: "final_stable",
      source_snapshot: { before: snapshot, after: snapshot, window: compareSourceSnapshots(snapshot, snapshot) },
      gate_result: { mode: "inline", result: { grn: "GRN-0001", gate: "BUILD", gate_def: CURRENT_GATE_DEFS.BUILD, tool: "scoped-test-fixture", tool_version: "1.0.0", metric_dialect: "cases", verdict: "passed", ran_at_seq: 9999, subject_id: task, is_fixture: true } },
    });
    put(".pomaster/evidence/claims/CLM-0001.json", {
      record_type: "claim", clm: "CLM-0001", subject: { object_id: task },
      asserted_by: { actor_type: "agent", actor: "builder" }, evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
      verification: { verdict: "VERIFIED", at_seq: 9999, recomputed_by: { actor_type: "agent", actor: "independent-fixture" } },
    });
    const ordinary = await cli<ReviewDraftResult>(draftArgs);
    expect(ordinary.code, JSON.stringify(ordinary.envelope.errors)).toBe(0);
    expect(ordinary.envelope.result.ready, JSON.stringify(ordinary.envelope.result.blockers)).toBe(true);
    const planRef = ".pomaster/plan/KO-cli-review-r1/plan.json";
    const plan = JSON.parse(readFileSync(absolute(planRef), "utf8"));
    plan.schema = "pomaster.scenario-plan/v1";
    plan.sheet = "KO-cli-review-r1";
    put(planRef, plan);
    const out = await cli<ReviewDraftResult>(draftArgs);
    expect(out.code, JSON.stringify(out.envelope.errors)).toBe(0);
    expect(out.envelope.result.ready).toBe(false);
    expect(out.envelope.result.required_project_checks).toContain("sit");
    expect(out.envelope.result.blockers.some(blocker => blocker.code === "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING")).toBe(true);
    expect(existsSync(absolute(".pomaster/scaffold/generation-manifest.json"))).toBe(false);
  });

  it("draft JSON candidates and source paths go through real bounded/API validation", async () => {
    await blockedReviewFixture();
    put("candidates.json", null);
    expectFailure(await cli([...draftArgs, "--candidates", "candidates.json"]), "autopilot review draft");
    put("candidates.json", [{ kind: "arbitrary-write", subject: task, target: "AGENTS.md" }]);
    const invalid = await cli<ReviewDraftResult>([...draftArgs, "--candidates", "candidates.json"]);
    // The actual API retains candidate rejection as blocked progress, not a passing receipt.
    expect(invalid.code).toBe(0);
    expect(invalid.envelope.result.ready).toBe(false);
    expect(invalid.envelope.result.candidates).toEqual([]);
    expect(invalid.envelope.result.blockers.some(blocker => blocker.code === "AUTOPILOT_REVIEW_CANDIDATE_BLOCKED")).toBe(true);
    expectFailure(await cli([...draftArgs, "--code", "../outside.ts"]), "autopilot review draft");
    expectFailure(await cli([...draftArgs, "--candidates", "candidates.json", "--candidates", "candidates.json"]), "autopilot review draft");
    expect(existsSync(absolute("AGENTS.md"))).toBe(false);
  });

  it("existing cards remain fifteen; nested review examples resolve to real leaf options", () => {
    expect(SKILL_MANIFEST).toHaveLength(15);
    const program = createProgram();
    const verify = SKILL_MANIFEST.find(card => card.name === "pomaster-verify")!;
    const lines = verify.bodyLines.filter(line => line.trimStart().startsWith("pomaster autopilot review "));
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      const name = line.trim().split(/\s+/)[3];
      const leaf = program.commands.find(command => command.name() === "autopilot")!.commands.find(command => command.name() === "review")!.commands.find(command => command.name() === name)!;
      expect(leaf).toBeDefined();
      for (const match of line.matchAll(/--[a-z][a-z-]*/g)) expect(leaf.options.some(option => option.long === match[0])).toBe(true);
    }
    expect(verify.bodyLines.join("\n")).toContain("pytest、gradle"); // Preserve the Owner's BE-1 correction.
  });
});
