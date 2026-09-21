/**
 * harness-bootstrap-contract.spec.ts -- R8/M7 fresh external bootstrap contract.
 *
 * This is a deterministic contract test, not a live-model compliance claim. It
 * consumes the generated agent entry, session, doctor, and tools surfaces that a
 * fresh Agent sees after `pomaster init`, then machine-checks that an ordinary
 * request routes into governed POMaster flow before any source edit.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENTS_MD_RELATIVE,
  CLAUDE_EXEC_GUARD_COMMAND,
  CLAUDE_EXEC_GUARD_MATCHER,
  CLAUDE_SETTINGS_RELATIVE,
  runInit,
  probeHeavyEntryInstall,
} from "@pomaster/cli";
import type { CliEnvelope } from "@pomaster/cli";
import { envelopeOf, runJsonStep, type StepRecord } from "./fixture-chain-lib.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster harness external "));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function resultOf(rec: StepRecord): Record<string, unknown> {
  return (envelopeOf(rec).result ?? {}) as Record<string, unknown>;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function generatedAgentEntry(): string {
  return readFileSync(join(root, AGENTS_MD_RELATIVE), "utf8");
}

function writeProjectFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function readProjectFile(relative: string): string {
  return readFileSync(join(root, ...relative.split("/")), "utf8");
}

function seedBrownfieldProject(): Record<string, string> {
  const files = {
    "README.md": "# Legacy app\n\nKeep this human file intact.\n",
    "package.json": `${JSON.stringify({
      name: "legacy-harness-app",
      dependencies: { react: "^18.2.0" },
      devDependencies: { typescript: "^5.0.0", vite: "^5.0.0", vitest: "^1.0.0" },
    })}\n`,
    "src/App.tsx": "export function App() {\n  return <main>Broken count: 0</main>;\n}\n",
    "src/legacy.js": "export const legacyBug = () => 'needs fix';\n",
    "prisma/migrations/20240101120000_init/migration.sql": "-- legacy schema\n",
  };
  for (const [relative, content] of Object.entries(files)) {
    writeProjectFile(relative, content);
  }
  return files;
}

interface AgentDecision {
  readonly request: string;
  readonly consumedSurfaces: readonly string[];
  readonly firstAction: "governed_flow";
  readonly command: string;
  readonly skill: string;
  readonly sourceEditAttempted: boolean;
  readonly toolDiscovery:
    | { readonly status: "available"; readonly count: number; readonly bindingIds: readonly string[] }
    | { readonly status: "tool_gap"; readonly code: string; readonly repairCommand: string };
}

function deterministicUnawareAgentDecision(input: {
  readonly request: string;
  readonly entryText: string;
  readonly session: CliEnvelope<Record<string, unknown>>;
  readonly tools: CliEnvelope<Record<string, unknown>>;
}): AgentDecision {
  const sessionResult = (input.session.result ?? {}) as Record<string, unknown>;
  const nextAction = (sessionResult.next_action ?? {}) as Record<string, unknown>;
  const bootstrap = (sessionResult.bootstrap_harness ?? {}) as Record<string, unknown>;
  const toolsPointer = (bootstrap.tools ?? {}) as Record<string, unknown>;
  const command = typeof nextAction.command === "string" ? nextAction.command : "";

  if (!input.entryText.includes("pomaster session")) {
    throw new Error("agent entry does not expose pomaster session");
  }
  if (!command.includes("pomaster brainstorm start")) {
    throw new Error(`session next_action is not the governed discovery route: ${command}`);
  }

  // Only inspect cards named by the generated entry, never a hidden skill answer.
  const skillRoot = input.entryText.match(/`([^`]+\/skills\/)pomaster\/`/)?.[1];
  if (skillRoot === undefined) throw new Error("agent entry does not expose the skill directory");
  const cardPaths = [...new Set(input.entryText.match(/\bpomaster-[a-z-]+\b/g) ?? [])]
    .map((name) => `${skillRoot}${name}/SKILL.md`)
    .filter((path) => existsSync(join(root, path)));
  const routeCommand = command.replace(/^pomaster\s+/, "");
  const matchingCards = cardPaths.filter((path) => {
    const card = readProjectFile(path);
    const description = card.match(/^description:\s*(.+)$/m)?.[1] ?? "";
    return description.includes(routeCommand) && card.includes(command);
  });
  if (matchingCards.length !== 1) throw new Error("generated cards do not resolve one route skill");
  const skillPath = matchingCards[0]!;
  const skill = readProjectFile(skillPath).match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (!skill) throw new Error("generated route skill has no name");

  const inventory = input.tools.result as {
    counts?: { available?: number };
    bindings?: Array<{ binding_id: string; available: boolean }>;
  } | undefined;
  const available = inventory?.bindings?.filter((row) => row.available === true) ?? [];
  const toolDiscovery =
    input.tools.ok === true && available.length > 0 && inventory?.counts?.available === available.length
      ? {
          status: "available" as const,
          count: available.length,
          bindingIds: available.map((row) => row.binding_id),
        }
      : {
          status: "tool_gap" as const,
          code: String(input.tools.errors[0]?.code ?? "NO_AVAILABLE_BINDING"),
          repairCommand: String(toolsPointer.discovery_command ?? "pomaster tools list --json"),
        };

  return {
    request: input.request,
    consumedSurfaces: [AGENTS_MD_RELATIVE, "pomaster session --json", "pomaster tools list --json", skillPath],
    firstAction: "governed_flow",
    command,
    skill,
    sourceEditAttempted: false,
    toolDiscovery,
  };
}

async function executeDiscoveredRoute(decision: AgentDecision): Promise<void> {
  const args = decision.command.split(/\s+/);
  expect(args.shift()).toBe("pomaster");
  const started = await runJsonStep(root, [...args, "--id", "harness-request", "--title", decision.request, "--ephemeral"]);
  expect(started.code, started.stdout).toBe(0);
  expect(envelopeOf(started).command).toBe(args.join(" "));
  expect(existsSync(join(root, ".pomaster/discovery/scratchpads/harness-request"))).toBe(true);
}

function writeKeybinding(id: string, canonicalId: string, physicalPath: string): void {
  mkdirSync(join(root, ".pomaster", "truth", "keybindings"), { recursive: true });
  writeFileSync(
    join(root, ".pomaster", "truth", "keybindings", `${id.toLowerCase().replaceAll("_", "-")}.json`),
    `${JSON.stringify(
      {
        id,
        binding_class: "capability_to_file",
        legacy_id: null,
        canonical_id: canonicalId,
        physical_path: physicalPath,
        binding_status: "confirmed",
        match_rule: "manual_confirmed",
        probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function installedPreToolUseCommand(): string {
  const settings = JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_RELATIVE), "utf8")) as {
    hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
  };
  const group = settings.hooks?.PreToolUse?.find((entry) => entry.matcher === CLAUDE_EXEC_GUARD_MATCHER);
  const command = group?.hooks?.find((hook) => hook.command === CLAUDE_EXEC_GUARD_COMMAND)?.command;
  expect(command).toBe(CLAUDE_EXEC_GUARD_COMMAND);
  return command ?? "";
}

function runInstalledHook(command: string, filePath: string): { readonly status: number | null; readonly stderr: string } {
  const run = spawnSync(command, {
    cwd: root,
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: filePath },
      cwd: root,
    }),
    encoding: "utf8",
    shell: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return { status: run.status, stderr: run.stderr ?? "" };
}

describe("fresh external project harness bootstrap contract", () => {
  it("deterministic unaware-agent transcript chooses governed flow and explicit tool discovery before source edits", async () => {
    const init = await runJsonStep(root, ["init"]);
    expect(init.code).toBe(0);
    const initResult = resultOf(init);
    expect(initResult.change).toBe("CREATED");
    expect((initResult.bootstrap_harness as { active?: boolean } | undefined)?.active).toBe(true);
    expect((initResult.bootstrap_harness as { entry?: { mode?: string } } | undefined)?.entry?.mode).toBe("heavy");

    const entryText = generatedAgentEntry();
    expect(entryText).toContain("do not crawl .pomaster");
    expect(entryText).toContain("pomaster session");
    expect(entryText).toContain("pomaster tools list");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);

    writeProjectFile(
      "src/App.tsx",
      "export function App() {\n  return <main>Hello</main>;\n}\n",
    );
    const sourcePath = join(root, "src", "App.tsx");
    const beforeSource = sha256File(sourcePath);

    const session = await runJsonStep(root, ["session"]);
    expect(session.code).toBe(0);
    const sessionEnvelope = envelopeOf(session);
    expect(sessionEnvelope.command).toBe("session");
    expect((sessionEnvelope.result as { next_action?: { route_id?: string } }).next_action?.route_id).toBe("R_NO_ACTIVE_TASK");

    const tools = await runJsonStep(root, ["tools", "list"]);
    const toolsEnvelope = envelopeOf(tools);
    expect(tools.code).toBe(1);
    expect(toolsEnvelope.errors[0]?.code).toBe("TOOLBINDING_REGISTRY_ABSENT");

    const decision = deterministicUnawareAgentDecision({
      request: "add a button",
      entryText,
      session: sessionEnvelope,
      tools: toolsEnvelope,
    });
    // A fixed firstAction label alone is not evidence: broken discovery must reject.
    expect(() => deterministicUnawareAgentDecision({
      request: "add a button", entryText: "", session: sessionEnvelope, tools: toolsEnvelope,
    })).toThrow("agent entry does not expose pomaster session");
    expect(() => deterministicUnawareAgentDecision({
      request: "add a button", entryText,
      session: { ...sessionEnvelope, result: { ...sessionEnvelope.result, next_action: { command: "edit src/App.tsx" } } },
      tools: toolsEnvelope,
    })).toThrow("session next_action is not the governed discovery route");
    expect(decision).toMatchObject({
      firstAction: "governed_flow",
      command: expect.stringContaining("pomaster brainstorm start"),
      skill: "pomaster-discovery",
      sourceEditAttempted: false,
      toolDiscovery: {
        status: "tool_gap",
        code: "TOOLBINDING_REGISTRY_ABSENT",
        repairCommand: "pomaster tools list --json",
      },
    });
    expect(decision.consumedSurfaces).toEqual([
      AGENTS_MD_RELATIVE,
      "pomaster session --json",
      "pomaster tools list --json",
      ".agents/skills/pomaster-discovery/SKILL.md",
    ]);
    await executeDiscoveredRoute(decision);
    expect(sha256File(sourcePath)).toBe(beforeSource);

    // A fresh project does not imply a globally installed CLI on the host.
    vi.stubEnv("PATH", root);
    const doctor = await runJsonStep(root, ["doctor"]);
    vi.unstubAllEnvs();
    const doctorEnvelope = envelopeOf(doctor);
    expect(doctorEnvelope.command).toBe("doctor");
    const probes = ((doctorEnvelope.result ?? {}) as { probes?: Array<{ probe?: string; status?: string; detail?: string }> }).probes ?? [];
    const hooksProbe = probes.find((probe) => probe.probe === "heavy_entry_hooks");
    expect(hooksProbe?.status).toBe("MISSING_CONFIGURATION");
    expect(hooksProbe?.detail).toContain("PATH");
    // Assess distributed hook assets separately with an explicit resolver fixture.
    const [installedHooks] = await probeHeavyEntryInstall(root, {
      resolveHookExecutable: () => process.execPath,
    });
    expect(installedHooks.status).toBe("READY");
    expect(installedHooks.detail).toContain("PreToolUse");
    expect(installedHooks.detail).toContain("prevention=prevention-capable");
  });

  it.each(["empty", "unavailable", "available"] as const)(
    "generated discovery surfaces distinguish registry state %s from successful verification",
    async (state) => {
      expect((await runJsonStep(root, ["init"])).code).toBe(0);
      writeProjectFile("src/App.tsx", "export const App = () => null;\n");
      const beforeSource = readProjectFile("src/App.tsx");
      writeProjectFile("package.json", JSON.stringify({
        name: "harness-tool-fixture",
        ...(state === "available" ? { devDependencies: { vitest: "^2.1.8" } } : {}),
      }));
      writeProjectFile(".pomaster/tools/bindings.json", JSON.stringify({
        version: 1,
        bindings: state === "empty" ? [] : [{
          id: "project.harness.behavior",
          source: "built_in", transport: "cli",
          adapter_ref: "builtin.gauntlet-lite.build", tool: "gauntlet:vitest",
          tool_version_anchor: "2.1.8", gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0",
          metric_dialect: "test:assertion_count", capabilities: ["unit_behavior"],
          execution: { command: "node --version", cwd: "." },
          report_contract: {
            format: "vitest-json-stdout", parser_ref: "builtin.gauntlet-lite.build/vitest-json",
            parser_version: "0.1.0",
          },
          evidence_targets: [], environment: { requires: false },
        }],
      }));
      const session = await runJsonStep(root, ["session"]);
      const tools = await runJsonStep(root, ["tools", "list"]);
      expect(session.code).toBe(0);
      expect(tools.code).toBe(0);
      expect(resultOf(tools).counts).toMatchObject({
        available: state === "available" ? 1 : 0, selected: 0, executed: 0,
      });
      const decision = deterministicUnawareAgentDecision({
        request: "add a button", entryText: generatedAgentEntry(),
        session: envelopeOf(session), tools: envelopeOf(tools),
      });
      expect(decision.toolDiscovery).toEqual(state === "available"
        ? { status: "available", count: 1, bindingIds: ["project.harness.behavior"] }
        : { status: "tool_gap", code: "NO_AVAILABLE_BINDING", repairCommand: "pomaster tools list --json" });
      await executeDiscoveredRoute(decision);
      expect(readProjectFile("src/App.tsx")).toBe(beforeSource);
    },
  );

  it("invokes the default installed Claude exec-guard command: out-of-scope deny leaves bytes unchanged and in-scope allow permits host write", async () => {
    const init = await runJsonStep(root, ["init"]);
    expect(init.code).toBe(0);
    const command = installedPreToolUseCommand();

    writeProjectFile("src/Button.tsx", "export const Button = () => null;\n");
    writeProjectFile("src/Outside.tsx", "export const Outside = () => null;\n");
    writeKeybinding("KEYBINDING.HARNESS.IN", "CAPABILITY.HARNESS.IN", "src/Button.tsx");
    writeKeybinding("KEYBINDING.HARNESS.OUT", "CAPABILITY.HARNESS.OUT", "src/Outside.tsx");

    const permit = await runJsonStep(root, [
      "permit",
      "issue",
      "--subject",
      "CAPABILITY.HARNESS.IN",
      "--actor",
      "agent:harness-contract",
      "--change-ref",
      "TASK.HARNESS_CONTRACT",
    ]);
    expect(permit.code).toBe(0);
    const permitRef = ((envelopeOf(permit).result ?? {}) as { permit_ref?: string }).permit_ref;
    expect(permitRef).toMatch(/^PERMIT\./);

    const execution = await runJsonStep(root, [
      "execution",
      "begin",
      "--role",
      "implementer",
      "--runtime",
      "claude-code",
      "--identity-kind",
      "interactive",
      "--permit-id",
      permitRef ?? "",
      "--task-id",
      "TASK.HARNESS_CONTRACT",
    ]);
    expect(execution.code).toBe(0);

    const outPath = join(root, "src", "Outside.tsx");
    const outBefore = readFileSync(outPath, "utf8");
    const denied = runInstalledHook(command, outPath);
    expect(denied.status).toBe(2);
    expect(denied.stderr).toContain("DENY");
    expect(denied.stderr).toContain("PERMIT_SCOPE_DENIED");
    expect(readFileSync(outPath, "utf8")).toBe(outBefore);

    const inPath = join(root, "src", "Button.tsx");
    const allowed = runInstalledHook(command, inPath);
    expect(allowed.status).toBe(0);
    expect(allowed.stderr).toContain("ALLOW");
    expect(allowed.stderr).toContain("CAPABILITY.HARNESS.IN");
    writeFileSync(inPath, "export const Button = () => <button>Save</button>;\n", "utf8");
    expect(readFileSync(inPath, "utf8")).toContain("<button>Save</button>");
  });
});

describe("brownfield external project harness bootstrap contract", () => {
  it("detects confirmed brownfield recon, preserves host files, and routes a bug-fix request into governed flow", async () => {
    const beforeFiles = seedBrownfieldProject();

    const init = await runInit(root, {
      brownfield: { confirmed: true, sbomInject: { executableProbe: () => null } },
    });
    expect(init.ok).toBe(true);
    expect(init.result.mode?.detection).toBe("brownfield_candidate");
    expect(init.result.mode?.brownfield).toBe("ran");
    expect(init.result.mode?.recon?.status).toBe("completed");
    expect(init.result.mode?.recon?.legs?.import_graph.status).toBe("OBSERVED");
    expect(init.result.mode?.recon?.legs?.migrations.status).toBe("OBSERVED");
    expect(init.result.mode?.recon?.legs?.sbom.status).toBe("NOT_INSTALLED");
    expect(init.result.bootstrap_harness?.active).toBe(true);
    expect(init.result.bootstrap_harness?.entry.mode).toBe("heavy");
    expect(init.warnings.some((warning) => warning.code === "RECON_SBOM_NOT_INSTALLED")).toBe(true);

    // Recon may append observations, but only Owner adoption can change baseline truth.
    const control = mkdtempSync(join(tmpdir(), "pomaster harness no recon "));
    try {
      for (const [relative, content] of Object.entries(beforeFiles)) {
        const path = join(control, relative);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, content, "utf8");
      }
      expect((await runInit(control)).ok).toBe(true);
      for (const relative of [
        ".pomaster/baseline/frontend/stack.yaml", ".pomaster/baseline/backend/stack.yaml",
        ".pomaster/baseline/manifest.yaml", ".pomaster/baseline/frontend/design-tokens.yaml",
        ".pomaster/state/truth-index.json",
      ]) {
        expect(readProjectFile(relative), relative).toBe(readFileSync(join(control, relative), "utf8"));
      }
      const observationId = init.result.mode?.recon?.legs?.import_graph.observation_id;
      expect(observationId).toBeTruthy();
      const receipt = JSON.parse(readProjectFile(`.pomaster/evidence/observations/${observationId}.json`));
      expect(receipt.record_type).toBe("observation_receipt");
    } finally {
      rmSync(control, { recursive: true, force: true });
    }

    for (const [relative, content] of Object.entries(beforeFiles)) {
      expect(readProjectFile(relative)).toBe(content);
    }
    expect(existsSync(join(root, AGENTS_MD_RELATIVE))).toBe(true);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);

    const entryText = generatedAgentEntry();
    const session = await runJsonStep(root, ["session"]);
    expect(session.code).toBe(0);
    const tools = await runJsonStep(root, ["tools", "list"]);
    const decision = deterministicUnawareAgentDecision({
      request: "fix the broken count",
      entryText,
      session: envelopeOf(session),
      tools: envelopeOf(tools),
    });

    expect(decision).toMatchObject({
      request: "fix the broken count",
      firstAction: "governed_flow",
      command: expect.stringContaining("pomaster brainstorm start"),
      skill: "pomaster-discovery",
      sourceEditAttempted: false,
      toolDiscovery: {
        status: "tool_gap",
        code: "TOOLBINDING_REGISTRY_ABSENT",
        repairCommand: "pomaster tools list --json",
      },
    });
    await executeDiscoveredRoute(decision);
    expect(readProjectFile("src/App.tsx")).toBe(beforeFiles["src/App.tsx"]);
  });
});
