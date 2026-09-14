/**
 * bootstrap-harness.ts -- read-only Bootstrap Harness projection.
 *
 * This CLI read model deliberately owns no canonical state. It composes the
 * existing sources used by init/status/session/doctor: heavy-entry constants,
 * generated entry files, seed manifest, baseline/spec presentations,
 * ToolBinding registry, and next-action.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAPABILITY_OVERVIEW,
  CLAUDE_EXEC_GUARD_COMMAND,
  CLAUDE_EXEC_GUARD_HOOK_RELATIVE,
  CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE,
  CLAUDE_SETTINGS_RELATIVE,
  ENTRY_MODE_HEAVY_MARKER,
  POMASTER_HOOK_EVENT_COMMANDS,
  SKILL_MANIFEST,
  SKILL_MIRROR_DIRS,
  looksLikePomasterExecGuardHook,
} from "./heavy-entry.js";
import type { CapabilityEntry } from "./heavy-entry.js";
import {
  baselineConfirmationHumanLine,
  readBaselineConfirmationPresentation,
  type BaselineConfirmationPresentation,
} from "./baseline.js";
import type { CliWarning } from "./envelope.js";
import {
  collectNextActionSnapshot,
  evaluateNextAction,
  type NextAction,
} from "./next-action.js";
import { loadSeedManifestEntries } from "./seed-manifest.js";
import {
  SEEDED_ASSET_FACETS,
  type SeededAssetFacet,
} from "./seeds.js";
import {
  readSpecPreplantPresentation,
  specPreplantHumanLine,
  type SpecPreplantPresentation,
} from "./spec-preplant.js";
import {
  AGENTS_MD_RELATIVE,
  CLAUDE_MD_RELATIVE,
  GENERATED_MARKER,
  TOOLS_BINDINGS_RELATIVE,
  toPosix,
  toolsBindingsPath,
} from "./store-layout.js";
import {
  computeBindingStates,
  loadToolBindingRegistry,
  type BindingStateRow,
} from "./tools.js";

export type BootstrapReadiness = "ready" | "partial" | "missing" | "invalid";

export interface BootstrapEntryFileStatus {
  readonly file: string;
  readonly status: "installed" | "covered" | "missing" | "foreign";
}

export interface BootstrapEntryStatus {
  readonly active: boolean;
  readonly mode: "heavy" | "minimal" | "missing" | "foreign";
  readonly files: readonly BootstrapEntryFileStatus[];
  readonly protocol: readonly string[];
}

export interface BootstrapCapabilityStatus {
  readonly producer: "heavy-entry.CAPABILITY_OVERVIEW";
  readonly total: number;
  readonly commands: readonly string[];
}

export interface BootstrapSkillMirrorStatus {
  readonly root: string;
  readonly expected: number;
  readonly installed: number;
  readonly missing: readonly string[];
}

export interface BootstrapSkillStatus {
  readonly expected: number;
  readonly mirrors_expected: number;
  readonly installed: number;
  readonly mirrors: readonly BootstrapSkillMirrorStatus[];
  readonly drifted: readonly string[];
}

export interface BootstrapHookEntryStatus {
  readonly event: string;
  readonly matcher: string | null;
  readonly command: string;
  readonly defined: boolean;
  readonly distributed: boolean;
  readonly installed: boolean;
  readonly runnable: "ready" | "missing" | "unknown";
  readonly gaps: readonly string[];
}

export interface BootstrapHookStatus {
  readonly adapter: "claude";
  readonly readiness: BootstrapReadiness;
  readonly defined: number;
  readonly distributed: number;
  readonly installed: number;
  readonly runnable_known: boolean;
  readonly runnable_ready: number;
  readonly prevention: "prevention-capable" | "detection-only" | "unselected" | "unknown";
  readonly entries: readonly BootstrapHookEntryStatus[];
  readonly repair: string | null;
}

export interface BootstrapAssetStatus {
  readonly seed_manifest: {
    readonly expected: Record<SeededAssetFacet, number>;
    readonly installed: Record<SeededAssetFacet, number>;
    readonly missing: readonly string[];
  };
  readonly spec_preplant: SpecPreplantPresentation | null;
  readonly baseline: BaselineConfirmationPresentation | null;
}

export interface BootstrapToolStatus {
  readonly registry_path: string;
  readonly status: "ready" | "absent" | "invalid";
  readonly counts: {
    readonly total: number;
    readonly registered: number;
    readonly validated: number;
    readonly available: number;
    readonly selected: number;
    readonly executed: number;
    readonly gapped: number;
  };
  readonly gaps: readonly string[];
  readonly bindings: readonly BindingStateRow[];
}

export interface BootstrapHarnessPointer {
  readonly readiness: BootstrapReadiness;
  readonly capabilities: number;
  readonly tools: {
    readonly status: BootstrapToolStatus["status"];
    readonly available: number;
    readonly gaps: number;
    readonly discovery_command: "pomaster tools list --json";
  };
  readonly audit_command: "pomaster doctor --json";
}

export interface BootstrapHarnessSnapshot {
  readonly active: boolean;
  readonly readiness: BootstrapReadiness;
  readonly capability_overview: readonly CapabilityEntry[];
  readonly capabilities: BootstrapCapabilityStatus;
  readonly entry: BootstrapEntryStatus;
  readonly skills: BootstrapSkillStatus;
  readonly hooks: BootstrapHookStatus;
  readonly assets: BootstrapAssetStatus;
  readonly tools: BootstrapToolStatus;
  readonly pointer: BootstrapHarnessPointer;
  readonly next_action: NextAction;
}

export interface BootstrapHarnessOptions {
  readonly claudeSelected?: boolean;
  readonly resolveHookExecutable?: (command: string) => string | null;
}

function pathFor(rootDir: string, relative: string): string {
  return join(rootDir, ...relative.split("/"));
}

function exists(rootDir: string, relative: string): boolean {
  return existsSync(pathFor(rootDir, relative));
}

function readText(rootDir: string, relative: string): string | null {
  try {
    return readFileSync(pathFor(rootDir, relative), "utf8");
  } catch {
    return null;
  }
}

function hasGeneratedMarker(text: string | null): boolean {
  return text !== null && text.includes(GENERATED_MARKER);
}

function zeroFacetCounts(): Record<SeededAssetFacet, number> {
  return Object.fromEntries(SEEDED_ASSET_FACETS.map((facet) => [facet, 0])) as Record<
    SeededAssetFacet,
    number
  >;
}

function seedFacetOf(path: string): SeededAssetFacet | null {
  const storeRelative = path.startsWith(".pomaster/") ? path.slice(".pomaster/".length) : path;
  if (storeRelative.startsWith("baseline/")) return "baseline";
  if (storeRelative.startsWith("specs/hard/themes/")) return "specs_hard_themes";
  if (storeRelative.startsWith("specs/hard/stacks/")) return "specs_hard_stacks";
  if (storeRelative.startsWith("specs/evidence/")) return "specs_evidence";
  return null;
}

function readSettingsHooks(settingsText: string | null): Record<string, unknown> | null {
  if (settingsText === null) return null;
  try {
    const parsed: unknown = JSON.parse(settingsText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const hooks = (parsed as Record<string, unknown>).hooks;
    if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) return null;
    return hooks as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hookInstalled(
  hooks: Record<string, unknown> | null,
  event: string,
  command: string,
  matcher: string | undefined,
): boolean {
  const groups = hooks?.[event];
  return (
    Array.isArray(groups) &&
    groups.some((group) => {
      if (group === null || typeof group !== "object" || Array.isArray(group)) return false;
      const record = group as Record<string, unknown>;
      if (matcher !== undefined && record.matcher !== matcher) return false;
      if (matcher === undefined && record.matcher !== undefined) return false;
      return (
        Array.isArray(record.hooks) &&
        record.hooks.some(
          (handler) =>
            handler !== null &&
            typeof handler === "object" &&
            (handler as Record<string, unknown>).command === command,
        )
      );
    })
  );
}

function hookCommandProjectPath(command: string): string | null {
  const normalized = command.replace(/\\/g, "/");
  const quoted = /["']([^"']*\.claude\/hooks\/[^"']+)["']/.exec(normalized);
  if (quoted?.[1] !== undefined) return quoted[1];
  const bare = /(^|\s)(\.claude\/hooks\/\S+)/.exec(normalized);
  return bare?.[2] ?? null;
}

function hookDistributed(rootDir: string, command: string, heavyEntry: boolean): boolean {
  const hookPath = hookCommandProjectPath(command);
  if (command === CLAUDE_EXEC_GUARD_COMMAND) {
    return (
      exists(rootDir, CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE) &&
      exists(rootDir, CLAUDE_EXEC_GUARD_HOOK_RELATIVE)
    );
  }
  if (hookPath !== null) return exists(rootDir, hookPath);
  return heavyEntry;
}

function pointerFor(snapshot: Omit<BootstrapHarnessSnapshot, "pointer">): BootstrapHarnessPointer {
  return {
    readiness: snapshot.readiness,
    capabilities: snapshot.capabilities.total,
    tools: {
      status: snapshot.tools.status,
      available: snapshot.tools.counts.available,
      gaps: snapshot.tools.gaps.length,
      discovery_command: "pomaster tools list --json",
    },
    audit_command: "pomaster doctor --json",
  };
}

export async function collectBootstrapHarnessSnapshot(
  rootDir: string,
  options: BootstrapHarnessOptions = {},
): Promise<BootstrapHarnessSnapshot> {
  const agentsText = readText(rootDir, AGENTS_MD_RELATIVE);
  const generatedAgents = hasGeneratedMarker(agentsText);
  const heavyEntry = generatedAgents && agentsText!.includes(ENTRY_MODE_HEAVY_MARKER);
  const claudeEntryGenerated = hasGeneratedMarker(readText(rootDir, CLAUDE_MD_RELATIVE));

  const entry: BootstrapEntryStatus = {
    active: generatedAgents,
    mode: generatedAgents
      ? heavyEntry
        ? "heavy"
        : "minimal"
      : agentsText === null
        ? "missing"
        : "foreign",
    files: [
      {
        file: AGENTS_MD_RELATIVE,
        status: generatedAgents ? "installed" : agentsText === null ? "missing" : "foreign",
      },
      {
        file: CLAUDE_MD_RELATIVE,
        status:
          options.claudeSelected === false
            ? "covered"
            : claudeEntryGenerated
              ? "installed"
              : exists(rootDir, CLAUDE_MD_RELATIVE)
                ? "foreign"
                : "missing",
      },
    ],
    protocol: [
      "Treat POMaster as active when the generated AGENTS.md entry exists.",
      "Start with pomaster session; do not crawl .pomaster by default.",
      "Follow next_action and require Task/Permit/Context before governed writes.",
      "Use pomaster tools list --json for capability/tool gaps instead of silently skipping.",
      "Finish through Verification, Evidence, Audit, and Closeout.",
    ],
  };

  const capabilities: BootstrapCapabilityStatus = {
    producer: "heavy-entry.CAPABILITY_OVERVIEW",
    total: CAPABILITY_OVERVIEW.length,
    commands: CAPABILITY_OVERVIEW.map((entry) => entry.command),
  };

  const mirrorStatuses: BootstrapSkillMirrorStatus[] = [];
  const mirrorTextsBySkill = new Map<string, string[]>();
  for (const mirrorRoot of SKILL_MIRROR_DIRS) {
    const missing: string[] = [];
    let installed = 0;
    for (const spec of SKILL_MANIFEST) {
      const relative = `${mirrorRoot}/${spec.name}/SKILL.md`;
      const text = readText(rootDir, relative);
      if (text === null) {
        missing.push(relative);
      } else {
        installed += 1;
        const texts = mirrorTextsBySkill.get(spec.name) ?? [];
        texts.push(text);
        mirrorTextsBySkill.set(spec.name, texts);
      }
    }
    mirrorStatuses.push({
      root: mirrorRoot,
      expected: SKILL_MANIFEST.length,
      installed,
      missing: missing.slice(0, 12),
    });
  }
  const drifted = [...mirrorTextsBySkill.entries()]
    .filter(([, texts]) => texts.length === SKILL_MIRROR_DIRS.length && new Set(texts).size > 1)
    .map(([name]) => name);
  const skillInstalled = mirrorStatuses.reduce((total, mirror) => total + mirror.installed, 0);
  const skillMissing = mirrorStatuses.reduce((total, mirror) => total + mirror.missing.length, 0);

  const settingsText = readText(rootDir, CLAUDE_SETTINGS_RELATIVE);
  const settingsHooks = readSettingsHooks(settingsText);
  const hookEntries = POMASTER_HOOK_EVENT_COMMANDS.map((spec) => {
    const matcher = spec.matcher ?? null;
    const installed = hookInstalled(settingsHooks, spec.event, spec.command, spec.matcher);
    const commandDistributed = hookDistributed(rootDir, spec.command, heavyEntry);
    const guardText =
      spec.event === "PreToolUse" ? readText(rootDir, CLAUDE_EXEC_GUARD_HOOK_RELATIVE) : null;
    const guardDistributed =
      spec.event !== "PreToolUse" ||
      (exists(rootDir, CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE) &&
        guardText !== null &&
        looksLikePomasterExecGuardHook(guardText));
    const distributed = commandDistributed && guardDistributed;
    const resolved =
      options.resolveHookExecutable === undefined
        ? "unknown"
        : options.resolveHookExecutable(spec.command) === null
          ? "missing"
          : "ready";
    const gaps = [
      ...(installed ? [] : [`${spec.event} hook is not installed with the expected command/matcher`]),
      ...(distributed ? [] : [`${spec.event} hook command target is not distributed in this project`]),
      ...(spec.event === "PreToolUse" && !guardDistributed
        ? [`${CLAUDE_EXEC_GUARD_HOOK_RELATIVE} canonical guard is missing or foreign`]
        : []),
      ...(resolved === "missing" ? [`${spec.event} hook command runtime is not resolvable`] : []),
    ];
    return {
      event: spec.event,
      matcher,
      command: spec.command,
      defined: true,
      distributed,
      installed,
      runnable: resolved,
      gaps,
    } satisfies BootstrapHookEntryStatus;
  });
  const runnableKnown = options.resolveHookExecutable !== undefined;
  const hookInstallReady = hookEntries.every((entry) => entry.distributed && entry.installed);
  const hookRunnableReady =
    !runnableKnown || hookEntries.every((entry) => entry.runnable === "ready");
  const preTool = hookEntries.find((entry) => entry.event === "PreToolUse");
  const hooks: BootstrapHookStatus = {
    adapter: "claude",
    readiness:
      options.claudeSelected === false
        ? "missing"
        : hookInstallReady && hookRunnableReady
          ? "ready"
          : settingsText !== null || heavyEntry
            ? "partial"
            : "missing",
    defined: hookEntries.length,
    distributed: hookEntries.filter((entry) => entry.distributed).length,
    installed: hookEntries.filter((entry) => entry.installed).length,
    runnable_known: runnableKnown,
    runnable_ready: hookEntries.filter((entry) => entry.runnable === "ready").length,
    prevention:
      options.claudeSelected === false
        ? "unselected"
        : preTool === undefined
          ? "detection-only"
          : preTool.distributed && preTool.installed && preTool.runnable !== "missing"
            ? "prevention-capable"
            : "unknown",
    entries: hookEntries,
    repair:
      hookInstallReady && hookRunnableReady
        ? null
        : `run: pomaster init; inspect ${toPosix(CLAUDE_SETTINGS_RELATIVE)} and ${toPosix(AGENTS_MD_RELATIVE)}; detailed audit: pomaster doctor --json`,
  };

  const expected = zeroFacetCounts();
  const installed = zeroFacetCounts();
  const missingAssets: string[] = [];
  try {
    for (const seed of loadSeedManifestEntries()) {
      const facet = seedFacetOf(seed.path);
      if (facet === null) continue;
      expected[facet] += 1;
      if (exists(rootDir, seed.path)) installed[facet] += 1;
      else missingAssets.push(seed.path);
    }
  } catch {
    // The seed loader remains the authority. This projection keeps the missing
    // denominator visible by leaving counts at zero rather than inventing facts.
  }

  let baseline: BaselineConfirmationPresentation | null = null;
  try {
    baseline = await readBaselineConfirmationPresentation(rootDir);
  } catch {
    baseline = null;
  }
  let specPreplant: SpecPreplantPresentation | null = null;
  try {
    specPreplant = await readSpecPreplantPresentation(rootDir);
  } catch {
    specPreplant = null;
  }

  let tools: BootstrapToolStatus;
  try {
    const loaded = loadToolBindingRegistry(rootDir);
    const rows = loaded.ok ? computeBindingStates(rootDir, loaded.registry.bindings) : [];
    const gaps = loaded.ok
      ? rows.flatMap((row) => row.gaps.map((gap) => `${row.binding_id}: ${gap}`))
      : [loaded.error.message];
    tools = {
      registry_path: loaded.ok ? loaded.registry.path : toolsBindingsPath(rootDir),
      status: loaded.ok
        ? "ready"
        : loaded.error.code === "TOOLBINDING_REGISTRY_ABSENT"
          ? "absent"
          : "invalid",
      counts: {
        total: rows.length,
        registered: rows.filter((row) => row.registered).length,
        validated: rows.filter((row) => row.validated).length,
        available: rows.filter((row) => row.available).length,
        selected: rows.filter((row) => row.selected).length,
        executed: rows.filter((row) => row.executed).length,
        gapped: rows.filter((row) => row.gaps.length > 0).length,
      },
      gaps: gaps.slice(0, 8),
      bindings: rows,
    };
  } catch (err) {
    tools = {
      registry_path: toolsBindingsPath(rootDir),
      status: "invalid",
      counts: {
        total: 0,
        registered: 0,
        validated: 0,
        available: 0,
        selected: 0,
        executed: 0,
        gapped: 0,
      },
      gaps: [
        `${toPosix(TOOLS_BINDINGS_RELATIVE)} projection failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
      bindings: [],
    };
  }

  const warnings: CliWarning[] = [];
  const nextAction = evaluateNextAction(await collectNextActionSnapshot(rootDir, warnings));
  const seedExpectedTotal = Object.values(expected).reduce((sum, value) => sum + value, 0);
  const seedInstalledTotal = Object.values(installed).reduce((sum, value) => sum + value, 0);
  const readiness: BootstrapReadiness = !entry.active
    ? "missing"
    : skillMissing === 0 &&
        drifted.length === 0 &&
        hooks.readiness === "ready" &&
        seedExpectedTotal === seedInstalledTotal
      ? "ready"
      : "partial";

  const withoutPointer: Omit<BootstrapHarnessSnapshot, "pointer"> = {
    active: entry.active,
    readiness,
    capability_overview: CAPABILITY_OVERVIEW,
    capabilities,
    entry,
    skills: {
      expected: SKILL_MANIFEST.length,
      mirrors_expected: SKILL_MANIFEST.length * SKILL_MIRROR_DIRS.length,
      installed: skillInstalled,
      mirrors: mirrorStatuses,
      drifted,
    },
    hooks,
    assets: {
      seed_manifest: { expected, installed, missing: missingAssets.slice(0, 12) },
      spec_preplant: specPreplant,
      baseline,
    },
    tools,
    next_action: nextAction,
  };
  return { ...withoutPointer, pointer: pointerFor(withoutPointer) };
}

export function renderBootstrapHarnessSummary(snapshot: BootstrapHarnessSnapshot): string[] {
  const seedExpected = Object.values(snapshot.assets.seed_manifest.expected).reduce((a, b) => a + b, 0);
  const seedInstalled = Object.values(snapshot.assets.seed_manifest.installed).reduce((a, b) => a + b, 0);
  return [
    "  bootstrap harness:",
    `    readiness: ${snapshot.readiness}（active=${snapshot.active ? "yes" : "no"}; entry=${snapshot.entry.mode}; capabilities=${snapshot.capabilities.total} from ${snapshot.capabilities.producer}）`,
    `    hooks: ${snapshot.hooks.readiness}（defined ${snapshot.hooks.defined} / installed ${snapshot.hooks.installed} / distributed ${snapshot.hooks.distributed}; prevention=${snapshot.hooks.prevention}）`,
    `    skills: ${snapshot.skills.installed}/${snapshot.skills.mirrors_expected} installed${snapshot.skills.drifted.length > 0 ? `; drifted ${snapshot.skills.drifted.length}` : ""}`,
    `    assets: seeds ${seedInstalled}/${seedExpected}; tools ${snapshot.tools.status} available=${snapshot.tools.counts.available} gaps=${snapshot.tools.gaps.length}`,
    ...(snapshot.assets.baseline !== null ? [`    ${baselineConfirmationHumanLine(snapshot.assets.baseline).trim()}`] : []),
    ...(snapshot.assets.spec_preplant !== null ? [`    ${specPreplantHumanLine(snapshot.assets.spec_preplant).trim()}`] : []),
    snapshot.next_action.command === null
      ? `    next: ${snapshot.next_action.reason}`
      : `    next: ${snapshot.next_action.command}（八拍${snapshot.next_action.beat}——${snapshot.next_action.reason}）`,
  ];
}

export function renderBootstrapHarnessPointerLine(pointer: BootstrapHarnessPointer): string {
  return `capability/tool discovery: ${pointer.capabilities} capabilities; tools ${pointer.tools.status} available=${pointer.tools.available} gaps=${pointer.tools.gaps}（${pointer.tools.discovery_command}; audit ${pointer.audit_command}）`;
}
