/** Approved D-14 sources. Research claims are data, not an upstream audit. */
import { SkillsError, record } from "./skills-local.js";
export interface SkillCard {
  readonly id: string;
  readonly name: string;
  readonly stage: "design" | "implementation" | "review";
  readonly source: string;
  readonly citation: string;
  readonly license: string;
  readonly compatibility: string;
  readonly provenance: string;
  readonly known_revision: null;
  readonly upstream_audit: "not_performed";
}
const vercelCitation = "https://cdn.jsdelivr.net/gh/akikungz/vercel-agent-skills@main/README.md";
export const SKILLS_CATALOG: readonly SkillCard[] = [
  { id: "ui-ux-pro-max", name: "ui-ux-pro-max", stage: "design", source: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", citation: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", license: "MIT (research claim, not verified)", compatibility: "Design candidates before project design confirmation; Python scripts require review, never execute here", provenance: "Research 2026-11-11; design output remains a candidate subordinate to project standards", known_revision: null, upstream_audit: "not_performed" },
  { id: "frontend-design", name: "frontend-design", stage: "implementation", source: "https://github.com/anthropics/claude-plugins-official", citation: "https://www.skills.sh/anthropics/claude-plugins-official/frontend-design", license: "Not specified by research; independently verify exact source license", compatibility: "Frontend implementation discipline; no plugin installer or host compatibility verified", provenance: "Anthropic source identity from research's skills.sh citation", known_revision: null, upstream_audit: "not_performed" },
  { id: "web-design-guidelines", name: "web-design-guidelines", stage: "review", source: "https://github.com/vercel-labs/agent-skills", citation: vercelCitation, license: "MIT (research claim, not verified)", compatibility: "UI review; local lexical audit cannot cover runtime/remote rules", provenance: "Research names vercel-labs/agent-skills but citation points to an akikungz fork at main; exact upstream content unresolved", known_revision: null, upstream_audit: "not_performed" },
  { id: "react-best-practices", name: "react-best-practices", stage: "implementation", source: "https://github.com/vercel-labs/agent-skills", citation: vercelCitation, license: "MIT (research claim, not verified)", compatibility: "React/Next.js only, never Vue", provenance: "Same research upstream/fork discrepancy as web-design-guidelines", known_revision: null, upstream_audit: "not_performed" },
  { id: "taste-skill", name: "design-taste-frontend", stage: "design", source: "https://github.com/leonxlnx/taste-skill", citation: "https://github.com/leonxlnx/taste-skill", license: "MIT (research claim, not verified)", compatibility: "C-marketing only; not B-admin or generic public applications; project design authority wins", provenance: "Research 2026-11-11; excludes classics/other variants", known_revision: null, upstream_audit: "not_performed" },
];
export interface SkillPin { readonly source: string; readonly revision: string; readonly evidence: string }
export function skillCard(id: string): SkillCard {
  const card = SKILLS_CATALOG.find(row => row.id === id);
  if (!card) throw new SkillsError("SKILLS_NOT_IN_CATALOG", `Skill is not in the approved D-14 catalog: ${id}`, "Use skills catalog; this command cannot authorize new sources.");
  return card;
}
export function validatePin(card: SkillCard, value: unknown): SkillPin {
  const pin = record(value);
  if (pin.source !== card.source) throw new SkillsError("SKILLS_SOURCE_CONFLICT", `Exact approved source required for ${card.id}`, "Preserve research provenance; do not substitute a fork or unrelated source.");
  if (typeof pin.revision !== "string" || !/^[0-9a-f]{40}$/.test(pin.revision) || /^0{40}$/.test(pin.revision)) throw new SkillsError("SKILLS_REVISION_UNRESOLVED", "Supply an independently known full Git commit; latest, branches, tags and abbreviated/fake pins are not accepted.", "Obtain an exact upstream revision independently; this command never fetches one.");
  if (typeof pin.evidence !== "string" || !pin.evidence.trim() || pin.evidence.length > 2048 || /[\x00-\x1f\x7f]/.test(pin.evidence) || /(?:SKILL\.md|selected\/|\.agents\/skills\/)/i.test(pin.evidence)) throw new SkillsError("SKILLS_REVISION_UNRESOLVED", "Independent revision evidence is required, not the selected skill's instructions.", "Supply an independent source/revision reference; local skill content cannot authorize its own pin.");
  return { source: card.source, revision: pin.revision, evidence: pin.evidence.trim() };
}
