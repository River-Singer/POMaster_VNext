/**
 * plan-scenarios.ts —— `pomaster plan scenarios`（code-spec scenario-planning.md v2；PRD 11-11-agent-autopilot PL-1 / D-6）。
 *
 * 消费生效中的启动确认单与已确认领域版本，编译场景依赖候选、跑 scaffold generate（既有治理面原样），
 * 把 DB / BE / FE / contract 单元落成 TASK 对象——kernel applyTransaction 唯一写路径（brainstorm promote
 * 同一信封形状：task_object + task_default 轴 + intent/acceptance/affected_objects/class_scan_result，
 * 逐条验收挂 record_claim 先立后证），journal 追加 PLAN_COMPILED 记 authorized_by: kickoff <id>。
 *
 * 前置（fail-closed，顺序即报告顺序）：确认单在 force（current.json 在座、未过期、sheet.json 字节与
 * 签名时一致）→ intake 修订与判读绑定未超前 → 领域规格 confirmed。单元 id 确定性派生
 * （TASK.<工作区大写化>_R<修订>.<LANE>.<实体>，Owner 2026-11-18 定）；全输入指纹进 plan.json，
 * 指纹相同且已提交 → NO_CHANGE 零写入；单元 id 在座且验收不同 → PLAN_UNIT_DRIFT（不静默改任务）。
 *
 * compact 落地（style.json choice=compact）：scaffold generate 新落地的 shell App.vue 上做行级补丁
 * （ConfigProvider 挂 compactAlgorithm + controlHeight 24——与画廊预览、design-tokens 记录三处同值）；
 * shell 是种子文件 write-once，已在座且无标记 → 显式 warning + style_landed:false，不静默改写。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { applyTransaction, createStore, loadStoreReadOnly, loadTruthIndex, sha256OfCanonical, sha256OfUtf8, plannerTaskArchetype, GovernanceError, type GovernedId, type Transaction, type PlannerConstructionVerifier, type PlanCapabilityWord } from "@pomaster/kernel";
import { verifySignoff } from "./trust.js";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { INTAKE_DRAFT_GENERATOR, INTAKE_DRAFT_SCHEMA, type IntakeDraft } from "./intake-draft.js";
import { loadIntakeLatest } from "./intake.js";
import { KICKOFF_CURRENT_SCHEMA, KICKOFF_DIR, type KickoffSheet } from "./kickoff.js";
import { resolveStyleChoice } from "./style-candidates.js";
import { assessScaffoldSpec } from "./scaffold-governance.js";
import { readDomainSpecFile } from "./scaffold-spec.js";
import { runScaffoldGenerate, readGenerationManifest } from "./scaffold-generate.js";
import { assessScaffoldConsistency } from "./scaffold-check.js";
import { bootstrapTrustedWrites } from "./trusted-write-bootstrap.js";
import { allocateEvidenceRef } from "./evidence.js";
import { claimsDirPath, journalFilePath, SCAFFOLD_DOMAIN_SPEC_RELATIVE, SCAFFOLD_GENERATION_MANIFEST_RELATIVE } from "./store-layout.js";
import { BOOTSTRAP_OWNER } from "./init.js";

export const SCENARIO_PLAN_SCHEMA = "pomaster.scenario-plan/v1";
export const PLAN_DIR = ".pomaster/plan";
export const PLAN_COMPILED_EVENT = "PLAN_COMPILED";
export const PLAN_UNITS_TX_FILE = "units.tx.json";

type Lane = "contract" | "db" | "be" | "fe";

const LANE_LABEL: Record<Lane, string> = { contract: "接口契约", db: "数据库迁移", be: "后端", fe: "前端" };

/** Minimum obligations already stated by each signed lane criterion, never inferred from available tools. */
const LANE_REQUIRED_CAPABILITIES: Readonly<Record<Lane, readonly PlanCapabilityWord[]>> = {
  contract: ["api_contract"], db: ["migration_drill"], be: ["unit_behavior"], fe: ["ui_render"],
};

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** governed-id SEGMENT 规范化：大写、非 [A-Z0-9] → 下划线、截到 32、字母开头（kernel id.ts 文法）。 */
export function segmentOf(raw: string): string {
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const leading = /^[A-Z]/.test(upper) ? upper : `X${upper}`;
  return leading.slice(0, 32);
}

interface ManagedFile {
  readonly path: string;
  readonly entities: readonly string[];
  readonly keybinding_id: string;
}

interface UnitPlan {
  readonly id: string;
  readonly lane: Lane;
  readonly entity: string | null;
  readonly title_zh: string;
  readonly intent: string;
  readonly criterion: string;
  affected_objects: string[];
}

export interface PlanScenariosResult {
  readonly sheet: string;
  readonly round: string;
  readonly change: "CREATED" | "NO_CHANGE";
  readonly modules: number;
  readonly scenario_edges: number;
  readonly units: readonly { readonly id: string; readonly lane: Lane; readonly entity: string | null }[];
  readonly claims: readonly string[];
  readonly style_landed: boolean;
  readonly applied_at_seq: number | null;
}

const fail = (command: string, errors: readonly CliError[]): CommandOutcome<PlanScenariosResult | null> =>
  failOutcome<PlanScenariosResult | null>(command, null, errors, errors.map((error) => `${command}: FAILED — ${error.code}：${error.message}${error.hint !== undefined ? `\n  hint: ${error.hint}` : ""}`));

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

interface KickoffCurrent {
  readonly schema: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly principal: string | null;
  readonly signoff: string;
  readonly valid_until: string;
}

/** compact 主题补丁（纯函数，行级两处插入；marker = `:theme="compactTheme"`）。 */
export function applyCompactShellPatch(text: string, sheetId: string): { readonly text: string; readonly changed: boolean } {
  if (text.includes(`:theme="compactTheme"`)) return { text, changed: false };
  const themeAnchor = `<a-config-provider :locale="zhCN">`;
  if (!text.includes(themeAnchor)) return { text, changed: false };
  const importAnchor = `import zhCN from "ant-design-vue/es/locale/zh_CN";`;
  let next = text.replace(
    themeAnchor,
    `<a-config-provider :locale="zhCN" :theme="compactTheme">`,
  );
  if (next === text) return { text, changed: false };
  const injection = `${importAnchor}\nimport { theme as antdTheme } from "ant-design-vue";\n// 样式候选 compact（启动确认单 ${sheetId} 选定）：控件高 24（与 design-tokens density.control_height 同值）。\nconst compactTheme = { algorithm: antdTheme.compactAlgorithm, token: { controlHeight: 24 } };`;
  next = next.replace(importAnchor, injection);
  return { text: next, changed: next !== text };
}

/** 生成的 shell App.vue（种子，write-once）在座路径候选——与 design-adopt 的工程根探测同族。 */
const SHELL_CANDIDATES = ["frontend/src/App.vue", "web/src/App.vue", "client/src/App.vue", "ui/src/App.vue", "app/src/App.vue", "src/App.vue"];

function scenarioUnits(sheet: KickoffSheet, draft: IntakeDraft, entityKeys: readonly string[]): UnitPlan[] {
  const sheetId = sheet.id, ws = segmentOf(`KO_${sheet.workspace}_R${sheet.revision}`);
  const styleResolved = resolveStyleChoice(sheet.style);
  const moduleClean = (key: string) => key.toLowerCase().replace(/^[0-9_]+/, "");
  const unitOf = (lane: Lane, entity: string | null): UnitPlan => {
    const id = entity === null ? `TASK.${ws}.${lane.toUpperCase()}` : `TASK.${ws}.${lane.toUpperCase()}.${segmentOf(entity)}`;
    const ruleIds = draft.business.filter(module => moduleClean(module.key).includes((entity ?? "").toLowerCase())).flatMap(module => (module.key_rules.approval ?? []).map(rule => rule.id));
    const criteria: Record<Lane, (entity: string | null) => string> = {
      contract: () => "接口契约与确认的领域规格一致：scaffold generate 对账绿、OpenAPI 文档通过校验（generation manifest sha 对账无手改）",
      db: key => `迁移与确认领域规格一致：空库按序迁移可重放；受管迁移文件无手改（KEYBINDING 对账）——实体 ${key}`,
      be: key => `${key}：CRUD 受管件无手改（KEYBINDING 对账）；确认单审批/校验规则（${ruleIds.length > 0 ? ruleIds.join("、") : "无审批规则，按规格字段即可"}）由项目自有种子模块实现并有通过的单元测试`,
      fe: key => `${key}：页面在生成路由下可渲染；主题按启动确认单样式候选（${styleResolved.candidate?.title_zh ?? sheet.style.design_system ?? "未定"}）落地`,
    };
    const intentParts = [`轮次 ${sheetId}（kickoff ${sheetId} 授权）`, entity === null ? "全实体" : `实体 ${entity}`, LANE_LABEL[lane]];
    return { id, lane, entity, title_zh: `${LANE_LABEL[lane]}单元：${entity === null ? sheet.workspace : entity}`, intent: `${intentParts.join(" · ")}。${criteria[lane](entity)}`, criterion: criteria[lane](entity), affected_objects: [] };
  };
  return [unitOf("contract", null), ...entityKeys.flatMap(entity => [unitOf("db", entity), unitOf("be", entity), unitOf("fe", entity)])];
}
function bindUnitTargets(units: UnitPlan[], files: readonly ManagedFile[]): void {
  for (const unit of units) unit.affected_objects = [...new Set(files.filter(file => unit.lane === "contract" ? /openapi/i.test(file.path) : unit.entity !== null && file.entities.includes(unit.entity)).map(file => file.keybinding_id))];
}
function scenarioDocument(sheet: KickoffSheet, draft: IntakeDraft, entityKeys: readonly string[]) {
  const modules = draft.business.map(module => {
    const approvalRules = module.key_rules.approval ?? [];
    const derivedEdges = approvalRules.map(rule => ({ kind: "approval_chain" as const, from_rule: rule.id, derived: true, note: `审批规则 ${rule.id}：提交 → 审核 链（推导自规则文本）` }));
    return {
      module: module.module, key: module.key, name: module.name_zh,
      scenarios: module.scenarios.map(entry => ({ id: entry.id, text: entry.text })),
      rules: Object.fromEntries(Object.entries(module.key_rules).filter(([, rules]) => rules.length > 0).map(([tag, rules]) => [tag, rules.map(rule => ({ id: rule.id, text: rule.text }))])),
      derived_edges: derivedEdges,
      undetermined: module.scenarios.length > 0 && derivedEdges.length === 0 ? module.scenarios.map(entry => entry.id) : [],
    };
  });
  const moduleClean = (key: string) => key.toLowerCase().replace(/^[0-9_]+/, "");
  const unmappedEntities = entityKeys.filter(entity => !draft.business.some(module => moduleClean(module.key).includes(entity.toLowerCase())));
  return { schema: SCENARIO_PLAN_SCHEMA, sheet: sheet.id, revision: sheet.revision, modules, unmapped_entities: unmappedEntities, note: "候选记录：推导边只有审批链一种；推不出的在 undetermined，不默认无害。消费方 TC-1 / AP-2 只读。" };
}

/** Real immutable construction artifacts, not invented code or QA bindings. */
function scenarioArtifactBindings(dir: string, sheet: KickoffSheet) {
  return [
    { role: "kickoff", value: `.pomaster/kickoff/${sheet.id}/sheet.json` },
    { role: "scenario_plan", value: `${PLAN_DIR}/${sheet.id}/scenarios.json` },
    { role: "generation", value: SCAFFOLD_GENERATION_MANIFEST_RELATIVE },
  ].map(({ role, value }) => ({ artifactType: "file", value, expect: { role, sha256: sha256OfUtf8(readFileSync(join(dir, value), "utf8")) }, matchRule: "mechanical" as const }));
}

function scenarioOperations(dir: string, units: readonly UnitPlan[], sheet: KickoffSheet, sheetSha256: string, firstClmSeq: number): Transaction["ops"] {
  const artifact = scenarioArtifactBindings(dir, sheet);
  return units.flatMap((unit, index) => {
    const claim = `CLM-${String(firstClmSeq + index).padStart(4, "0")}`;
    return [
      { op: "upsert_object" as const, envelope: {
        id: unit.id as GovernedId, kind: "task_object" as const, axisProfile: "task_default", axes: { lifecycle: "PROPOSED" as const, confidence: "UNRESOLVED" as const, evidence: "PLANNED" as const, change: "STABLE" as const }, titleZh: unit.title_zh,
        authority: { owner: BOOTSTRAP_OWNER, delegates: [] }, origin: "natural" as const,
        keyBindings: { artifact },
        payload: { intent: unit.intent, acceptance: [{ criterion: unit.criterion, claim, requires: LANE_REQUIRED_CAPABILITIES[unit.lane] }], affected_objects: unit.affected_objects,
          round: sheet.id, kickoff_sheet: `.pomaster/kickoff/${sheet.id}/sheet.json`, kickoff_sha256: sheetSha256, lane: unit.lane, entity: unit.entity, style: sheet.style.choice ?? "standard",
          class_scan_result: { scope: `plan_scenarios_no_code_change:${unit.id}（规划创建，无同类代码修改）`, hits: 0, fixed_count: 0, regression_case_ref: `plan-scenarios:${unit.id}` } },
        sources: [{ type: "human_directive" as const, ref: `.pomaster/kickoff/${sheet.id}/sheet.json`, capturedBy: "pomaster-plan-scenarios", pin: { digest: `sha256:${sheetSha256}` } }],
      } },
      { op: "record_claim" as const, claim: { clm: claim, subjectId: unit.id as GovernedId, assertion: unit.criterion, assertedBy: { actorType: "tool" as const, actor: "pomaster-plan-scenarios", selfAttested: false }, evidenceRefs: [] } },
    ];
  });
}

/** Old signed construction intent is immutable; upgrading its template needs fresh bounded authority. */
function assertScenarioRequiredModel(tx: Transaction): void {
  for (const op of tx.ops) {
    if (op.op !== "upsert_object" || op.envelope.kind !== "task_object") continue;
    const acceptance = op.envelope.payload.acceptance;
    if (Array.isArray(acceptance) && acceptance.some(entry => entry !== null && typeof entry === "object" && !("requires" in entry))) {
      throw new GovernanceError("SCHEMA_INVALID", "Legacy deterministic planner construction has no required acceptance capabilities", "Preserve historical TASKs/CLMs/operations; create a new intake revision → kickoff draft → Owner signature → kickoff confirm → plan scenarios. Do not retrofit historical signed operations.", { reason_code: "PLANNER_ADOPTION_REBUILD_REQUIRED" });
    }
  }
}

function scenarioCommitSeq(dir: string, tx: Transaction): number | undefined {
  const events = readFileSync(journalFilePath(dir), "utf8").split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line) as { type: string; admission_intent?: string; seq: number });
  return events.find(event => event.type === "TX_APPLIED" && event.admission_intent === sha256OfCanonical(tx))?.seq;
}

function assertScenarioKickoff(dir: string, current: KickoffCurrent, sheet: KickoffSheet): void {
  const signed = verifySignoff(dir, current.signoff, { kind: "kickoff", ref: `.pomaster/kickoff/${current.sheet}/sheet.json`, sha256: current.sheet_sha256 }, { consume: false, requireConsumed: true, requireConsumedBy: "kickoff confirm" });
  if (!signed.ok) throw new GovernanceError("SCHEMA_INVALID", signed.error.message, "Restore the enrolled content-bound kickoff signature", { reason_code: "PLANNER_CONSTRUCTION_INVALID" });
  const days = sheet.budget?.valid_days, deadline = Date.parse(current.valid_until);
  // The signed request expiry bounds the unsigned projection's finite runtime budget.
  const limit = Date.parse(signed.request.expires_at) + days * 86_400_000;
  if (sheet.id !== current.sheet || !Number.isFinite(days) || days <= 0 || !Number.isFinite(limit) || !Number.isFinite(deadline) || deadline <= Date.now() || deadline > limit) throw new GovernanceError("SCHEMA_INVALID", "Kickoff validity exceeds its signed finite budget", "Reconfirm through the existing signed kickoff channel", { reason_code: "PLANNER_CONSTRUCTION_INVALID" });
}

/** This trusted adapter rederives templates and generation scope; transaction JSON cannot assert a pass. */
export const verifyScenarioConstruction: PlannerConstructionVerifier = async (dir, tx) => {
  function deny(message: string): never { throw new GovernanceError("SCHEMA_INVALID", message, "Recompile the actual signed kickoff plan and generation denominator", { reason_code: "PLANNER_CONSTRUCTION_INVALID" }); }
  const current = readJson<KickoffCurrent>(join(dir, KICKOFF_DIR, "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA || !/^[A-Za-z0-9_-]+$/.test(current.sheet) || !Number.isFinite(Date.parse(current.valid_until)) || Date.parse(current.valid_until) <= Date.now() || tx.plannerConstruction?.signoffRef !== current.signoff || tx.authorityRef !== undefined || tx.newEntity !== undefined || tx.factAdmission !== undefined || tx.breakGlass !== undefined || tx.note !== `plan scenarios：authorized_by kickoff ${current.sheet}`) deny("Planner request is not the in-force kickoff construction");
  const sheetRef = `.pomaster/kickoff/${current.sheet}/sheet.json`, sheetPath = join(dir, sheetRef);
  if (!existsSync(sheetPath) || sha256(readFileSync(sheetPath)) !== current.sheet_sha256) deny("Signed kickoff bytes changed");
  const sheet = readJson<KickoffSheet>(sheetPath);
  if (sheet === null || sheet.id !== current.sheet) deny("Kickoff sheet is malformed");
  assertScenarioKickoff(dir, current, sheet);
  const intake = loadIntakeLatest(dir, sheet.workspace);
  if (!intake.ok) deny("Signed intake is unavailable");
  const draftPath = join(intake.workspace.dir, "draft/draft.json"), draft = readJson<IntakeDraft>(draftPath);
  const choices = join(dir, KICKOFF_DIR, current.sheet, "choices.yaml");
  if (draft === null || draft.schema !== INTAKE_DRAFT_SCHEMA || draft.generator !== INTAKE_DRAFT_GENERATOR || draft.revision !== sheet.revision || intake.data.files.revision !== sheet.revision || draft.resolutions_sha256 !== intake.data.files.resolutions_sha256 || sha256(readFileSync(draftPath)) !== sheet.provenance.draft_sha256 || sha256(existsSync(choices) ? readFileSync(choices) : "") !== sheet.provenance.choices_sha256) deny("Intake or choices differ from the signed construction");
  const spec = readDomainSpecFile(join(dir, SCAFFOLD_DOMAIN_SPEC_RELATIVE));
  if (!spec.ok || sha256(readFileSync(join(dir, SCAFFOLD_DOMAIN_SPEC_RELATIVE))) !== sheet.domain.sha256) deny("Domain differs from the signed kickoff denominator");
  const consistency = await assessScaffoldConsistency(dir);
  if ("code" in consistency || !consistency.applicable || consistency.spec_state !== "confirmed" || consistency.errors.length > 0) deny("Generation or KEYBINDING denominator is not valid");
  const entities = (spec.raw as { entities: { key: string }[] }).entities.map(entity => entity.key);
  const units = scenarioUnits(sheet, draft, entities);
  const manifest = await readGenerationManifest(dir);
  if (manifest.kind !== "ok") deny("Generation manifest is unavailable");
  bindUnitTargets(units, manifest.manifest.files);
  assertScenarioRequiredModel(tx);
  const first = tx.ops.find(op => op.op === "record_claim");
  if (first?.op !== "record_claim" || !/^CLM-[0-9]+$/.test(first.claim.clm)) deny("Planner claim denominator is missing");
  if (first.claim.clm !== allocateEvidenceRef(claimsDirPath(dir), "CLM") && scenarioCommitSeq(dir, tx) === undefined) deny("Claim seed differs from the actual allocator and no exact construction was committed");
  const planRef = `${PLAN_DIR}/${sheet.id}/scenarios.json`;
  const plan = readJson<unknown>(join(dir, planRef));
  if (plan === null || sha256OfCanonical(plan) !== sha256OfCanonical(scenarioDocument(sheet, draft, entities))) deny("Scenario plan artifact differs from the signed deterministic denominator");
  if (tx.ops.some(op => op.op === "upsert_object" && op.envelope.keyBindings === undefined)) throw new GovernanceError("SCHEMA_INVALID", "Legacy deterministic planner construction has no artifact adoption bindings", "Preserve historical TASKs/CLMs/operations; create a new intake revision → kickoff draft → Owner signature → kickoff confirm → plan scenarios. Do not retrofit historical signed operations.", { reason_code: "PLANNER_ADOPTION_REBUILD_REQUIRED" });
  const expected = scenarioOperations(dir, units, sheet, current.sheet_sha256, Number(first.claim.clm.slice(4)));
  if (sha256OfCanonical(expected) !== sha256OfCanonical(tx.ops)) deny("Operations differ from the exact signed deterministic task templates");
  const recorded = readJson<Transaction>(join(dir, PLAN_DIR, sheet.id, PLAN_UNITS_TX_FILE));
  if (recorded === null || sha256OfCanonical(recorded) !== sha256OfCanonical(tx)) deny("Actual construction artifact does not match the transaction");
  const projection = readJson<{ units?: unknown; fingerprint?: string; sheet?: string }>(join(dir, PLAN_DIR, sheet.id, "plan.json"));
  const assessment = await assessScaffoldSpec(dir);
  if ("code" in assessment || projection?.sheet !== sheet.id || projection.fingerprint !== sha256(`${readFileSync(sheetPath, "utf8")}\n${assessment.semantic_sha256}\n${sheet.provenance.choices_sha256}`) || sha256OfCanonical(projection.units) !== sha256OfCanonical(units.map(unit => ({ id: unit.id, lane: unit.lane, entity: unit.entity, criterion: unit.criterion, affected_objects: unit.affected_objects })))) deny("Plan projection differs from the actual deterministic unit denominator");
  const bindings = scenarioArtifactBindings(dir, sheet);
  return { sheetRef, sheetSha256: current.sheet_sha256, planRef, planSha256: bindings[1]!.expect.sha256, generationRef: SCAFFOLD_GENERATION_MANIFEST_RELATIVE, generationSha256: bindings[2]!.expect.sha256, subjectIds: [...new Set(units.flatMap(unit => [unit.id, ...unit.affected_objects]))].sort() };
};

export async function runPlanScenarios(dir: string): Promise<CommandOutcome<PlanScenariosResult | null>> {
  // 1) 确认单在 force：current.json 在座 + 未过期 + sheet.json 字节与签名时一致
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA) {
    return fail("plan scenarios", [{ code: "PLAN_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }]);
  }
  if (Number.isNaN(Date.parse(current.valid_until)) || Date.parse(current.valid_until) < Date.now()) {
    return fail("plan scenarios", [{ code: "PLAN_KICKOFF_NOT_IN_FORCE", message: `生效中的启动确认单 ${current.sheet} 已过有效期（${current.valid_until}）`, hint: "改材料或 choices 后重新 draft → 签名 → confirm（增量重签同一机制）" }]);
  }
  const sheetId = current.sheet;
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), sheetId, "sheet.json");
  if (!existsSync(sheetPath) || sha256(readFileSync(sheetPath)) !== current.sheet_sha256) {
    return fail("plan scenarios", [{ code: "PLAN_KICKOFF_NOT_IN_FORCE", message: `确认单 ${sheetId} 的字节与签名时不一致（材料或 choices 在确认后又变了）`, hint: "pomaster kickoff draft → 重新签名 → kickoff confirm；已生效轮次按增量重签处理" }]);
  }
  const sheet = readJson<KickoffSheet>(sheetPath);
  if (sheet === null) return fail("plan scenarios", [{ code: "PLAN_KICKOFF_NOT_IN_FORCE", message: `确认单 ${sheetId} 读不了（sheet.json 损坏）`, hint: "pomaster kickoff draft 重新生成并重签" }]);
  try { assertScenarioKickoff(dir, current, sheet); }
  catch (error) { return fail("plan scenarios", [{ code: "PLAN_KICKOFF_NOT_IN_FORCE", message: error instanceof Error ? error.message : String(error), hint: "Restore or reconfirm the actual signed kickoff" }]); }
  const sheetBytes = readFileSync(sheetPath);
  try { plannerTaskArchetype(); }
  catch (error) { return fail("plan scenarios", [{ code: "PLANNER_ADOPTION_INVALID", message: error instanceof Error ? error.message : String(error), hint: "Restore the owner-approved TASK_UNIT catalog identity and membership; pomaster catalog relock verifies the actual content" }]); }

  // 2) intake 修订与判读绑定不得超前于确认单
  const loaded = loadIntakeLatest(dir, sheet.workspace);
  if (!loaded.ok) {
    return fail("plan scenarios", [{ code: "PLAN_INTAKE_MISSING", message: `需求读取工作区 ${sheet.workspace} 不在了`, hint: "确认单依赖的读取工作区被删：恢复材料后重新读取与确认（增量重签）" }]);
  }
  const draftPath = join(loaded.workspace.dir, "draft", "draft.json");
  const draftBytes = existsSync(draftPath) ? readFileSync(draftPath) : null;
  const draft = draftBytes === null ? null : readJson<IntakeDraft>(draftPath);
  if (loaded.data.files.revision !== sheet.revision || draft === null || draftBytes === null || draft.schema !== INTAKE_DRAFT_SCHEMA || draft.revision !== loaded.data.files.revision || draft.resolutions_sha256 !== loaded.data.files.resolutions_sha256 || draft.generator !== INTAKE_DRAFT_GENERATOR) {
    return fail("plan scenarios", [{ code: "PLAN_REVISION_AHEAD", message: `读取工作区在确认单之后又变过（确认单 r${sheet.revision}，当前 r${loaded.data.files.revision}）`, hint: "材料有新修订：走增量重签（kickoff draft → 签名 → confirm）后再规划" }]);
  }

  // 3) 领域规格 confirmed（scaffold-governance 单点判卷，零第二算法）
  const assessment = await assessScaffoldSpec(dir);
  if ("code" in assessment) return fail("plan scenarios", [assessment]);
  if (assessment.state !== "confirmed" || assessment.record === null || assessment.semantic_sha256 === null) {
    return fail("plan scenarios", [{ code: "PLAN_DOMAIN_DRIFT", message: `领域规格不是确认态（${assessment.state}）`, hint: "确认过的规格被改过要走变更通道；没确认就先走 kickoff confirm" }]);
  }
  const specRead = readDomainSpecFile(join(dir, ...SCAFFOLD_DOMAIN_SPEC_RELATIVE.split("/")));
  if (!specRead.ok) return fail("plan scenarios", [{ code: "PLAN_DOMAIN_DRIFT", message: specRead.issue.message, hint: specRead.issue.hint }]);
  const rawEntities = (specRead.raw as { entities?: unknown }).entities;
  const entityKeys = Array.isArray(rawEntities)
    ? rawEntities.flatMap((entry) => (entry !== null && typeof entry === "object" && typeof (entry as Record<string, unknown>).key === "string" ? [(entry as Record<string, unknown>).key as string] : []))
    : [];
  if (entityKeys.length === 0) return fail("plan scenarios", [{ code: "PLAN_DOMAIN_DRIFT", message: "领域规格里读不到实体键（entities[].key）", hint: "规格应是 pomaster.domain-spec/v1 形状；pomaster scaffold validate 看问题" }]);

  // 4) 指纹与 NO_CHANGE（确认单字节 + 领域语义摘要 + choices 摘要）
  const choicesPath = join(dir, ...KICKOFF_DIR.split("/"), sheetId, "choices.yaml");
  const choicesSha = sha256(existsSync(choicesPath) ? readFileSync(choicesPath) : "");
  const fingerprint = sha256(`${sheetBytes.toString("utf8")}\n${assessment.semantic_sha256}\n${choicesSha}`);
  const roundDir = join(dir, ...PLAN_DIR.split("/"), sheetId);
  const planPath = join(roundDir, "plan.json");
  const existingPlan = readJson<{ schema: string; fingerprint: string; committed?: boolean; applied_at_seq: number | null; units: { id: string; lane: Lane; entity: string | null }[]; style_landed: boolean }>(planPath);
  const recorded = readJson<Transaction>(join(roundDir, PLAN_UNITS_TX_FILE));
  const retained = existingPlan?.fingerprint === fingerprint ? recorded : null;
  if (recorded !== null) {
    try { assertScenarioRequiredModel(recorded); }
    catch (error) {
      const rebuild = error instanceof GovernanceError && error.details.reason_code === "PLANNER_ADOPTION_REBUILD_REQUIRED";
      return fail("plan scenarios", [{ code: rebuild ? "PLANNER_ADOPTION_REBUILD_REQUIRED" : "PLAN_UNIT_DRIFT", message: error instanceof Error ? error.message : String(error), hint: rebuild ? error.hint : "Restore the exact retained construction transaction; never rewrite signed operations" }]);
    }
  }
  if (existingPlan !== null && existingPlan.fingerprint === fingerprint && existingPlan.committed === true) {
    let committedSeq: number;
    try {
      if (retained?.plannerConstruction?.signoffRef !== current.signoff) throw new Error("Signed construction transaction is missing");
      const receiptSeq = scenarioCommitSeq(dir, retained);
      if (receiptSeq === undefined) throw new Error("Exact construction commit receipt is missing");
      bootstrapTrustedWrites();
      if (!(await applyTransaction(await loadStoreReadOnly(dir), retained)).shortCircuited) throw new Error("Committed construction was not an exact replay");
      committedSeq = receiptSeq;
    } catch (error) {
      const rebuild = error instanceof GovernanceError && error.details.reason_code === "PLANNER_ADOPTION_REBUILD_REQUIRED";
      return fail("plan scenarios", [{ code: rebuild ? "PLANNER_ADOPTION_REBUILD_REQUIRED" : "PLAN_UNIT_DRIFT", message: error instanceof Error ? error.message : String(error), hint: rebuild ? error.hint : "Reconcile the actual committed task/claim records; plan metadata is not authority" }]);
    }
    const result: PlanScenariosResult = { sheet: sheetId, round: sheetId, change: "NO_CHANGE", modules: draft.business.length, scenario_edges: 0, units: existingPlan.units, claims: [], style_landed: existingPlan.style_landed, applied_at_seq: committedSeq };
    return okOutcome("plan scenarios", result, [
      `plan scenarios: NO_CHANGE — ${sheetId}（输入指纹一致，轮次已提交 at_seq=${existingPlan.applied_at_seq ?? "?"}）`,
      `  单元 ${existingPlan.units.length} 个已落库；QA 用例冻结在 TC-1，派发在 AP-2`,
    ]);
  }

  // 5) 场景依赖候选（诚实最小推导：只有审批规则出边；其余不造）
  const scenariosJson = scenarioDocument(sheet, draft, entityKeys);
  const modules = scenariosJson.modules;
  mkdirSync(roundDir, { recursive: true });
  writeFileSync(join(roundDir, "scenarios.json"), `${JSON.stringify(scenariosJson, null, 2)}\n`, "utf8");

  // 6) 单元骨架（affected_objects 待 generate 后从 manifest 取）
  const styleResolved = resolveStyleChoice(sheet.style);
  const units = scenarioUnits(sheet, draft, entityKeys);

  // 7) 脚手架契约（既有治理面原样：manifest + KEYBINDING + journal SCAFFOLD_GENERATED）
  const generated = await runScaffoldGenerate(dir);
  if (!generated.ok) return failOutcome<PlanScenariosResult | null>("plan scenarios", null, generated.errors, ["plan scenarios: FAILED — scaffold generate 未通过（契约先行，单元不落在没契约的地上）", ...generated.human], generated.warnings);

  // 8) affected_objects ← generation manifest（KEYBINDING id 在落库时必然在座）
  const manifest = readJson<{ files?: readonly ManagedFile[] }>(join(dir, ...SCAFFOLD_GENERATION_MANIFEST_RELATIVE.split("/")));
  const files = manifest?.files ?? [];
  bindUnitTargets(units, files);

  // 9) compact 落地：generate 新落地的 shell 行级补丁；已在他轮落地（有标记）算 true；write-once 不静默改写
  const warnings: CliWarning[] = [];
  let styleLanded = false;
  if (styleResolved.candidate !== null && styleResolved.candidate.id === "compact") {
    const seededShell = generated.result?.seeded.find((path) => path.endsWith("src/App.vue"));
    const shellPath = seededShell !== undefined ? join(dir, seededShell) : SHELL_CANDIDATES.map((relative) => join(dir, relative)).find((candidate) => existsSync(candidate));
    if (shellPath !== undefined && existsSync(shellPath)) {
      const patch = applyCompactShellPatch(readFileSync(shellPath, "utf8"), sheetId);
      if (patch.changed) {
        writeFileSync(shellPath, patch.text, "utf8");
        styleLanded = true;
      } else if (readFileSync(shellPath, "utf8").includes(`:theme="compactTheme"`)) {
        styleLanded = true;
      } else {
        warnings.push({ code: "PLAN_STYLE_NOT_LANDED", message: `compact 主题没落地：shell（${shellPath}）已存在且无标记，种子 write-once 不静默改写`, hint: "手工按 style.json 给 shell 挂 compact 主题，或挪走种子文件后重跑 plan scenarios（会重新播种并打补丁）" });
      }
    } else {
      warnings.push({ code: "PLAN_STYLE_NOT_LANDED", message: "compact 主题没落地：scaffold generate 没有产出 shell 种子", hint: "确认前端 stack 组合支持脚手架后重跑；或 FE 单元实现时按 style.json 手工落地" });
    }
  } else {
    styleLanded = styleResolved.candidate === null ? false : true;
  }

  // 10) 单元漂移检查（同 id 在座且验收不同 → 拒绝，不静默改任务）
  const drifted = units.filter((unit) => {
    // 正文层机械映射（store.ts bodyRefFor：slug(kind) + id 小写、下划线转连字符）——truth-index 行不带 payload
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.id.toLowerCase().replaceAll("_", "-")}.json`);
    if (!existsSync(bodyPath)) return false;
    const body = readJson<{ payload?: { intent?: unknown; acceptance?: unknown } }>(bodyPath);
    const payload = body?.payload;
    if (payload === undefined) return false;
    const existingCriteria = Array.isArray(payload.acceptance) ? payload.acceptance.flatMap((entry) => (entry !== null && typeof entry === "object" && typeof (entry as Record<string, unknown>).criterion === "string" ? [(entry as Record<string, unknown>).criterion as string] : [])) : [];
    return payload.intent !== unit.intent || existingCriteria.join("|") !== unit.criterion;
  });
  if (drifted.length > 0) {
    return fail("plan scenarios", [{ code: "PLAN_UNIT_DRIFT", message: `单元任务已在座且内容与本次规划不同：${drifted.map((unit) => unit.id).join("、")}`, hint: "单元任务不静默改：已开工的走任务变更通道；确认要重建就先处理在座任务（transition 或撤销）再重跑" }]);
  }

  // 11) 落库：upsert 单元 TASK + 逐条验收 record_claim（先立后证），kernel 唯一写路径
  const retainedClaim = retained?.ops.find(op => op.op === "record_claim");
  const firstClm = retainedClaim?.op === "record_claim" ? retainedClaim.claim.clm : allocateEvidenceRef(claimsDirPath(dir), "CLM");
  const firstClmSeq = Number(firstClm.slice("CLM-".length));
  const ops = scenarioOperations(dir, units, sheet, current.sheet_sha256, firstClmSeq);
  if (retained !== null && (retained.plannerConstruction?.signoffRef !== current.signoff || sha256OfCanonical(retained.ops) !== sha256OfCanonical(ops))) return fail("plan scenarios", [{ code: "PLAN_UNIT_DRIFT", message: "Retained transaction differs from the actual signed deterministic construction", hint: "Reconcile the interrupted transaction; never silently allocate replacement claims" }]);
  const claims = ops.flatMap(op => op.op === "record_claim" ? [op.claim.clm] : []);

  const preCommit = { schema: SCENARIO_PLAN_SCHEMA, sheet: sheetId, fingerprint, committed: false, applied_at_seq: null, units: units.map((unit) => ({ id: unit.id, lane: unit.lane, entity: unit.entity, criterion: unit.criterion, affected_objects: unit.affected_objects })), style: { design_system: sheet.style.design_system, choice: styleResolved.candidate?.id ?? null, landed: styleLanded }, note: "候选规划记录；committed 只在 applyTransaction 成功后翻真" };
  writeFileSync(planPath, `${JSON.stringify(preCommit, null, 2)}\n`, "utf8");
  writeFileSync(join(roundDir, PLAN_UNITS_TX_FILE), `${JSON.stringify({ ops, note: `plan scenarios：authorized_by kickoff ${sheetId}` }, null, 2)}\n`, "utf8");

  let store: Awaited<ReturnType<typeof createStore>>;
  try {
    store = await createStore(dir);
    await loadTruthIndex(store);
  } catch (error) {
    return fail("plan scenarios", [{ code: "STORE_LOAD_FAILED", message: error instanceof Error ? error.message : String(error), hint: "store 装载失败（init 在座吗）；units.tx.json 留座可重放或经 maintain --ops 显式应用" }]);
  }
  let appliedSeq: number;
  try {
    bootstrapTrustedWrites();
    const transaction: Transaction = { ops, note: `plan scenarios：authorized_by kickoff ${sheetId}`, plannerConstruction: { signoffRef: current.signoff } };
    writeFileSync(join(roundDir, PLAN_UNITS_TX_FILE), `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
    const result = await applyTransaction(store, transaction);
    appliedSeq = scenarioCommitSeq(dir, transaction) ?? result.appliedSeq;
  } catch (error) {
    return fail("plan scenarios", [{ code: error instanceof Error && error.name === "GovernanceError" ? "TX_REJECTED" : "TX_FAILED", message: error instanceof Error ? error.message : String(error), hint: "kernel 判卷拒绝（整事务零残留）；units.tx.json 留座，修正后重跑 plan scenarios 或 maintain --ops 显式应用" }]);
  }

  // 12) journal PLAN_COMPILED + plan.json 翻 committed
  const compiled = readFileSync(journalFilePath(dir), "utf8").split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line) as { type: string; seq: number; sheet: string });
  if (!compiled.some(event => event.type === PLAN_COMPILED_EVENT && event.seq === appliedSeq && event.sheet === sheetId)) appendFileSync(journalFilePath(dir), `${JSON.stringify({ type: PLAN_COMPILED_EVENT, seq: appliedSeq, sheet: sheetId, authorized_by: `kickoff ${sheetId}`, units: units.map((unit) => unit.id), style_landed: styleLanded })}\n`, "utf8");
  const committed = { ...preCommit, committed: true, applied_at_seq: appliedSeq };
  writeFileSync(planPath, `${JSON.stringify(committed, null, 2)}\n`, "utf8");

  const result: PlanScenariosResult = {
    sheet: sheetId,
    round: sheetId,
    change: "CREATED",
    modules: draft.business.length,
    scenario_edges: modules.reduce((sum, module) => sum + module.derived_edges.length, 0),
    units: units.map((unit) => ({ id: unit.id, lane: unit.lane, entity: unit.entity })),
    claims,
    style_landed: styleLanded,
    applied_at_seq: appliedSeq,
  };
  return okOutcome(
    "plan scenarios",
    result,
    [
      `plan scenarios: CREATED — ${sheetId}（round 目录 .pomaster/plan/${sheetId}/）`,
      `  ${modules.length} 个模块、${result.scenario_edges} 条推导边（只有审批链；其余在 undetermined）`,
      `  单元 ${units.length} 个已落库（contract 1、db/be/fe 每实体各 1）；验收 claim ${claims.length} 条（先立后证）`,
      `  compact 主题${styleLanded ? "已落地（shell 补丁）" : "未落地（见 warning）"}`,
      "  下一步：QA 用例冻结（TC-1）→ 协调派发（AP-2 走 agents dispatch-pack）",
    ],
    warnings,
  );
}
