/** SK-1: read-only, project-aware recommendations. Required route skills are unaffected. */
import { load as loadYaml } from "js-yaml";
import { sha256OfBytes } from "@pomaster/kernel";
import { readBaselineConfirmation } from "./baseline.js";
import { assessScaffoldSpec } from "./scaffold-governance.js";
import { verifySignoff } from "./trust.js";
import { failOutcome, okOutcome, type CliWarning, type CommandOutcome } from "./envelope.js";
import { hasLocal, readLocal, record, SkillsError, skillsError } from "./skills-local.js";
import { SKILLS_CATALOG, skillCard, validatePin, type SkillCard, type SkillPin } from "./skills-catalog.js";
export { runSkillsAudit, runSkillsLock, runSkillsCheck } from "./skill-integrity.js";
export type { SkillPin, SkillCard } from "./skills-catalog.js";

export function runSkillsCatalog(): CommandOutcome<{ readonly skills: readonly SkillCard[] }> {
  return okOutcome("skills catalog", { skills: SKILLS_CATALOG }, SKILLS_CATALOG.map(s => `${s.id} [${s.stage}] ${s.source} — exact revision unresolved; upstream audit not performed`));
}
export interface SkillsRecommendInput { readonly pins?: Readonly<Record<string, SkillPin>>; readonly agent?: "claude-code" | "codex" }
export interface SkillProjectContext {
  readonly framework: string | null;
  readonly surfaces: readonly string[];
  readonly c_marketing: boolean;
  readonly design_authority: "confirmed_project_metadata" | "not_confirmed";
  readonly design_standard_present: boolean;
  readonly sources: readonly string[];
  readonly defaults: readonly string[];
}
export interface SkillRecommendation extends SkillCard {
  readonly reason: string;
  readonly revision_status: "unresolved" | "independently_supplied";
  readonly pin: SkillPin | null;
  readonly install_command: string | null;
  readonly upstream_verification: "not_performed";
  readonly installer_compatibility: "not_verified";
}
export interface SkillsRecommendResult {
  readonly context: SkillProjectContext;
  readonly recommendations: readonly SkillRecommendation[];
  readonly required_route_skills: "unchanged";
  readonly policy: readonly string[];
}
const POLICY = ["Recommendations only; never install, fetch, execute or update", "Project design standards and required route skills remain authoritative", "Exact supplied revisions are not verified upstream here; local bytes are not proof of upstream origin", "Installation requires separate authority, local review, and an already installed compatible skills CLI"];
function usable(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !/^(UNKNOWN|undetermined|未定|未确定)$/i.test(text) ? text : null;
}
const warning = (warnings: CliWarning[], code: string, message: string) => warnings.push({ code, message, hint: "Review existing confirmation/sign-off metadata; recommendations do not change authority." });

async function projectContext(root: string, warnings: CliWarning[]): Promise<SkillProjectContext> {
  const frameworks: { value: string; source: string }[] = [];
  const sources: string[] = [];
  const defaults: string[] = [];
  const surfaces: string[] = [];
  let design = false;
  let marketing = false;
  const standard = ".pomaster/baseline/frontend/design-standard.yaml";
  const designStandardPresent = hasLocal(root, standard);
  if (designStandardPresent) readLocal(root, standard); // presence is not confirmation
  const stackPath = ".pomaster/baseline/frontend/stack.yaml";
  if (hasLocal(root, stackPath)) {
    const stackBytes = readLocal(root, stackPath).bytes;
    const stack = record(loadYaml(stackBytes.toString("utf8")));
    const baseline = await readBaselineConfirmation(root);
    if (baseline.kind === "record-valid" && baseline.state === "confirmed" && !baseline.retired.includes("frontend/stack.yaml") && readLocal(root, stackPath).bytes.equals(stackBytes)) {
      const framework = usable(stack.framework);
      if (framework) frameworks.push({ value: framework, source: "confirmed baseline/frontend/stack.yaml" });
      design = true; // confirmed baseline design faces, not mere design-standard presence
      sources.push("baseline/manifest.yaml#confirmed: confirmed stack and design faces");
    } else warning(warnings, "SKILLS_METADATA_UNCONFIRMED", "Existing baseline stack/design metadata is unconfirmed or changed; not used as confirmed input.");
  }
  if (hasLocal(root, ".pomaster/scaffold/domain-spec.yaml")) {
    readLocal(root, ".pomaster/scaffold/domain-spec.yaml");
    const scaffold = await assessScaffoldSpec(root);
    if ("state" in scaffold && scaffold.state === "confirmed" && scaffold.normalized) {
      surfaces.push(...Object.keys(scaffold.normalized.surfaces).sort());
      sources.push("scaffold domain spec: confirmed semantic digest and journal");
    } else warning(warnings, "SKILLS_METADATA_UNCONFIRMED", "Scaffold surfaces are not confirmed; no B/C inference is made.");
  }
  if (hasLocal(root, ".pomaster/kickoff/current.json")) {
    try {
      const pointerBytes = readLocal(root, ".pomaster/kickoff/current.json").bytes;
      const current = record(JSON.parse(pointerBytes.toString("utf8")));
      if (current.schema !== "pomaster.kickoff-current/v1" || typeof current.sheet !== "string" || !/^KO-[A-Za-z0-9_-]+$/.test(current.sheet) || typeof current.valid_until !== "string" || !Number.isFinite(Date.parse(current.valid_until)) || Date.parse(current.valid_until) <= Date.now() || typeof current.signoff !== "string") throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff pointer is invalid or expired.");
      const ref = `.pomaster/kickoff/${current.sheet}/sheet.json`;
      const bytes = readLocal(root, ref).bytes;
      const digest = sha256OfBytes(bytes).slice(7); // trust's existing raw-hex contract
      if (current.sheet_sha256 !== digest) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff sheet changed after confirmation.");
      const proof = verifySignoff(root, current.signoff, { kind: "kickoff", ref, sha256: digest }, { consume: false, requireConsumed: true, env: { listAgentKeys: () => [] } });
      if (!proof.ok) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff consumed content-bound sign-off does not verify.");
      const sheet = record(JSON.parse(bytes.toString("utf8")));
      if (sheet.schema !== "pomaster.kickoff-sheet/v1" || sheet.id !== current.sheet) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff sheet identity differs from pointer.");
      const budget = record(sheet.budget);
      const appliedAt = typeof current.applied_at === "string" ? Date.parse(current.applied_at) : NaN;
      if (!Number.isSafeInteger(budget.valid_days) || (budget.valid_days as number) <= 0 || !Number.isFinite(appliedAt) || appliedAt > Date.now() || Date.parse(current.valid_until as string) !== appliedAt + (budget.valid_days as number) * 86400000) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff pointer validity differs from the signed budget/application timestamp.");
      const stack = record(record(sheet.stack).frontend);
      if (!Array.isArray(stack.recommended) || (stack.decision !== null && stack.decision !== "material" && stack.decision !== "scaffold" && stack.decision !== "required")) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff frontend recommendation/decision is malformed.");
      const kickoffFrameworks: { value: string; source: string }[] = [];
      for (const entry of stack.recommended) {
        const row = record(entry);
        const value = usable(row.value);
        if (stack.decision !== "required" && row.key === "framework" && value) kickoffFrameworks.push({ value, source: `kickoff ${current.sheet}` });
      }
      if (!Array.isArray(sheet.business)) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff business purposes are malformed.");
      const scope = record(sheet.scope);
      if (!Array.isArray(scope.in) || scope.in.some(key => typeof key !== "string" || !key) || !Array.isArray(scope.out)) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff signed scope is malformed.");
      const included = new Set(scope.in);
      const excluded = new Set(scope.out.map(entry => {
        const row = record(entry);
        if (typeof row.key !== "string" || !row.key) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff exclusions are malformed.");
        return row.key;
      }));
      if ([...included].some(key => excluded.has(key))) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff included and excluded scopes conflict.");
      const purposes = sheet.business.map(b => {
        const row = record(b);
        if (typeof row.key !== "string" || !Array.isArray(row.purpose) || row.purpose.some(p => typeof p !== "string")) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff business key/purpose must be valid.");
        return included.has(row.key) && !excluded.has(row.key) ? row.purpose.join(" ") : "";
      });
      // Both indicators must belong to the same confirmed business module, not unrelated B/C modules.
      const kickoffMarketing = purposes.some(p => /(?:C\s*端|consumer|customer-facing|public|用户侧|用户端)/i.test(p) && /(?:营销|landing[ -]page|marketing|公司官网|品牌官网)/i.test(p));
      const kickoffDesign = Boolean(sheet.style && usable(record(sheet.style).design_system));
      if (!readLocal(root, ref).bytes.equals(bytes) || !readLocal(root, ".pomaster/kickoff/current.json").bytes.equals(pointerBytes)) throw new SkillsError("SKILLS_METADATA_UNCONFIRMED", "Kickoff content changed during recommendation.");
      // Publish no partial metadata if any relevant field or endpoint check fails.
      frameworks.push(...kickoffFrameworks);
      marketing = kickoffMarketing;
      design = design || kickoffDesign;
      sources.push(`kickoff ${current.sheet}: consumed signature and current content digest`);
    } catch (e) { warning(warnings, "SKILLS_METADATA_UNCONFIRMED", skillsError(e).message); }
  }
  const distinct = [...new Set(frameworks.map(f => f.value.toLowerCase()))];
  let framework = frameworks[0]?.value ?? null;
  if (distinct.length > 1) {
    framework = null;
    warning(warnings, "SKILLS_METADATA_CONFLICT", `Confirmed framework inputs disagree: ${frameworks.map(f => `${f.source}=${f.value}`).join("; ")}`);
  }
  if (!framework) defaults.push("No unambiguous confirmed frontend framework: generic frontend skills are conditional, React additions omitted.");
  if (!design) defaults.push("No confirmed project design authority: UI UX Pro Max may produce candidates only, not adopted standards.");
  if (!marketing) defaults.push("No positive confirmed C-marketing purpose: taste-skill omitted; public deployment alone is insufficient.");
  return { framework, surfaces, c_marketing: marketing, design_authority: design ? "confirmed_project_metadata" : "not_confirmed", design_standard_present: designStandardPresent, sources, defaults };
}
export async function runSkillsRecommend(root: string, input: SkillsRecommendInput = {}): Promise<CommandOutcome<SkillsRecommendResult | null>> {
  const warnings: CliWarning[] = [];
  try {
    const agent = input.agent ?? "claude-code";
    if (agent !== "claude-code" && agent !== "codex") throw new SkillsError("SCHEMA_INVALID", "Supported recommendation targets are claude-code and codex; no host settings are changed.");
    const pins = new Map<string, SkillPin>();
    for (const [id, value] of Object.entries(input.pins ?? {})) pins.set(id, validatePin(skillCard(id), value));
    const context = await projectContext(root, warnings);
    const reasons = new Map<string, string>();
    if (context.design_authority === "not_confirmed") reasons.set("ui-ux-pro-max", "Design candidate generation only; Owner confirmation required before adoption.");
    reasons.set("frontend-design", context.framework ? `Implementation discipline for confirmed ${context.framework}; project standard wins.` : "Conditional frontend implementation discipline; framework not confirmed.");
    reasons.set("web-design-guidelines", "UI review evidence, not completion, human trust or replacement of required route skills.");
    if (context.framework && /(^|[^a-z0-9])(?:react|next(?:\.js)?)(?:[^a-z]|$)/i.test(context.framework)) reasons.set("react-best-practices", "Confirmed React/Next.js framework only.");
    if (context.c_marketing) reasons.set("taste-skill", "Confirmed C-marketing purpose; never overrides project design standards.");
    const recommendations = SKILLS_CATALOG.filter(s => reasons.has(s.id)).map((s): SkillRecommendation => {
      const pin = pins.get(s.id) ?? null;
      return { ...s, reason: reasons.get(s.id)!, pin, revision_status: pin ? "independently_supplied" : "unresolved", install_command: pin ? `skills add ${s.source}/tree/${pin.revision} --skill ${s.name} --agent ${agent} --copy` : null, upstream_verification: "not_performed", installer_compatibility: "not_verified" };
    });
    return okOutcome("skills recommend", { context, recommendations, required_route_skills: "unchanged", policy: POLICY }, [...POLICY, ...context.defaults, ...recommendations.map(r => `${r.id}: ${r.reason} Revision ${r.pin?.revision ?? "unresolved"}. ${r.install_command ?? "No installation command: obtain an independent exact revision first."}`)], warnings);
  } catch (e) { return failOutcome("skills recommend", null, [skillsError(e)], ["Recommendations unavailable; nothing installed or changed."], warnings); }
}
