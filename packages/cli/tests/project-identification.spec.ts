import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectNextActionSnapshot,
  createProgram,
  evaluateNextAction,
  LAYOUT_MANIFEST_RELATIVE,
  runCli,
  runInit,
  type CliEnvelope,
  type InitResult,
  runProjectIdentificationConfirm,
  runProjectIdentificationReport,
} from "@pomaster/cli";
import { preflightArchitectureProfile, writeArchitectureProfile } from "../src/architecture-profile.js";
import { runTrustEnroll, runTrustRequest } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig } from "./fixtures/trust/sshsig-signer.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-project-identification-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function hostFile(relative: string, content: string): void {
  const absolute = join(dir, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function truthBodies(): readonly Record<string, unknown>[] {
  const index = JSON.parse(readFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "utf8")) as {
    objects: readonly { id: string; body_ref: string }[];
  };
  return index.objects.map((row) => JSON.parse(readFileSync(join(dir, ".pomaster", ...row.body_ref.split("/")), "utf8")) as Record<string, unknown>);
}

function identificationBodies(): readonly Record<string, unknown>[] {
  return truthBodies().filter((body) => {
    const payload = body.payload as Record<string, unknown> | undefined;
    return payload?.init_task === "project_identification";
  });
}

/** Capture the entire fixture, including absent outputs and directory mtimes. */
function relatedTree(): Record<string, { bytes: string | null; mtime_ns: string }> {
  const tree: Record<string, { bytes: string | null; mtime_ns: string }> = {};
  const walk = (relative: string): void => {
    const absolute = join(dir, relative);
    const stat = lstatSync(absolute, { bigint: true });
    tree[relative || "."] = {
      bytes: stat.isDirectory() ? null : readFileSync(absolute).toString("base64"),
      mtime_ns: stat.mtimeNs.toString(),
    };
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) walk(relative ? `${relative}/${name}` : name);
    }
  };
  walk("");
  return tree;
}

function expectRelatedTreeUnchanged(before: ReturnType<typeof relatedTree>): void {
  const after = relatedTree();
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  expect(paths.filter((path) => before[path]?.bytes !== after[path]?.bytes || before[path]?.mtime_ns !== after[path]?.mtime_ns)).toEqual([]);
}

async function initCli(architecture: "react" | "vue", platforms = "none") {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["--dir", dir, "init", "--architecture", architecture, "--platforms", platforms, "--json"], {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  expect(stderr).toEqual([]);
  expect(stdout).toHaveLength(1);
  return { code, value: JSON.parse(stdout[0]!) as CliEnvelope<InitResult> };
}

function expectProfileConflict(outcome: Awaited<ReturnType<typeof initCli>>): void {
  expect(outcome.code).toBe(1);
  expect(outcome.value.command).toBe("init");
  expect(outcome.value.ok).toBe(false);
  expect(outcome.value.errors[0]?.code).toBe("ARCHITECTURE_PROFILE_CONFLICT");
  expect(outcome.value.result.change).toBe("NO_CHANGE");
  expect(outcome.value.result.files).toEqual([]);
}

const report = {
  taskId: "TASK.INIT_PROJECT_IDENTIFICATION",
  purpose: "面向运营人员的存量 Web 控制台",
  architecture: "vue",
  stack: ["vue@3", "vite", "pinia"],
  directories: ["src/pages: 页面入口", "src/shared: 共享能力"],
  commands: ["pnpm build", "pnpm test"],
  evidence: ["package.json", "src/main.ts"],
  unknowns: ["生产部署拓扑"],
} as const;

describe("DF-INIT-01 public init architecture preflight", () => {
  it.each([
    ["react", "vue"],
    ["vue", "react"],
  ] as const)("rejects %s → %s before changing any related bytes or mtimes", async (first, second) => {
    expect((await initCli(first)).code).toBe(0);
    const before = relatedTree();
    const conflict = await initCli(second, "claude,codex");
    expectRelatedTreeUnchanged(before);
    expectProfileConflict(conflict);
  });

  it("does not repair missing layout or entry outputs before rejecting a profile conflict", async () => {
    expect((await initCli("react")).code).toBe(0);
    rmSync(join(dir, "AGENTS.md"));
    rmSync(join(dir, LAYOUT_MANIFEST_RELATIVE));
    rmSync(join(dir, ".pomaster", "evidence", "runs", "README.md"));
    const before = relatedTree();
    const conflict = await initCli("vue", "claude,codex");
    expectRelatedTreeUnchanged(before);
    expectProfileConflict(conflict);
  });

  it.each([
    [".pomaster/state/architecture-profile.json", "corrupt"],
    [".pomaster/baseline/frontend/architecture-profile.md", "foreign"],
    [".pomaster/state/architecture-profile.json", "unreadable"],
    [".pomaster/baseline/frontend/architecture-profile.md", "unreadable"],
    [".pomaster/state/architecture-profile.json", "invalid_utf8"],
  ] as const)("rejects preexisting %s (%s) without materializing even a partial init", async (relative, kind) => {
    if (kind === "unreadable") {
      // A directory at the file target produces a deterministic read failure on Windows too.
      hostFile(`${relative}/retained.txt`, "foreign directory content\n");
    } else {
      hostFile(relative, kind === "corrupt" ? "{broken\n" : "# Foreign architecture rules\n");
      if (kind === "invalid_utf8") writeFileSync(join(dir, relative), Buffer.from([0xff, 0xfe]));
    }
    const before = relatedTree();
    const conflict = await initCli("react", "claude,codex");
    expectRelatedTreeUnchanged(before);
    expectProfileConflict(conflict);
  });

  it.each([
    ".pomaster/state/architecture-profile.json",
    ".pomaster/baseline/frontend/architecture-profile.md",
  ])("writer rechecks %s after an earlier successful read-only preflight", async (relative) => {
    const empty = relatedTree();
    expect((await preflightArchitectureProfile(dir, "react")).ok).toBe(true);
    expectRelatedTreeUnchanged(empty);
    hostFile(relative, "foreign bytes appearing after preflight\n");
    const before = relatedTree();
    const files: InitResult["files"][number][] = [];
    const write = await writeArchitectureProfile(dir, "react", files);
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.code).toBe("ARCHITECTURE_PROFILE_CONFLICT");
    expect(files).toEqual([]);
    expectRelatedTreeUnchanged(before);
  });

  it.each(["react", "vue"] as const)("identical %s replays remain NO_CHANGE with identical tree bytes and mtimes", async (architecture) => {
    expect((await initCli(architecture)).code).toBe(0);
    const before = relatedTree();
    for (let replay = 0; replay < 2; replay += 1) {
      const outcome = await initCli(architecture);
      expect(outcome.code).toBe(0);
      expect(outcome.value.result.change).toBe("NO_CHANGE");
      expect(outcome.value.result.files.every((file) => ["unchanged", "preserved"].includes(file.action))).toBe(true);
      expectRelatedTreeUnchanged(before);
    }
  });

  it("allows an explicit repair back to approved bytes without migrating the profile", async () => {
    expect((await initCli("react")).code).toBe(0);
    const relative = ".pomaster/baseline/frontend/architecture-profile.md";
    const approved = readFileSync(join(dir, relative));
    hostFile(relative, "# Foreign architecture rules\n");
    const before = relatedTree();
    expectProfileConflict(await initCli("react"));
    expectRelatedTreeUnchanged(before);
    writeFileSync(join(dir, relative), approved);
    const repaired = relatedTree();
    const replay = await initCli("react");
    expect(replay.code).toBe(0);
    expect(replay.value.result.change).toBe("NO_CHANGE");
    expectRelatedTreeUnchanged(repaired);
  });

  it("brownfield --architecture still enters the identification task, not profile generation", async () => {
    hostFile("package.json", '{"dependencies":{"vue":"^3.5.0"}}\n');
    hostFile("src/main.ts", 'import { createApp } from "vue";\n');
    const outcome = await initCli("react");
    expect(outcome.code).toBe(0);
    expect(outcome.value.result.mode?.detection).toBe("brownfield_candidate");
    expect(outcome.value.result.architecture_profile).toBeNull();
    expect(identificationBodies()).toHaveLength(1);
    expect((identificationBodies()[0]?.payload as Record<string, unknown>).identification_status).toBe("pending");
    expect(existsSync(join(dir, ".pomaster", "state", "architecture-profile.json"))).toBe(false);
    expect(existsSync(join(dir, ".pomaster", "baseline", "frontend", "architecture-profile.md"))).toBe(false);
    expect(readFileSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"), "utf8")).toContain("framework: UNKNOWN");
  });
});

describe("brownfield project identification", () => {
  it("公开命令面注册 report/confirm 两步", () => {
    const group = createProgram().commands.find((command) => command.name() === "project-identification");
    expect(group?.commands.map((command) => command.name())).toEqual(["report", "confirm"]);
  });

  it("greenfield 显式架构会同时驱动 stack 与治理 profile", async () => {
    const outcome = await runInit(dir, { architecture: "react" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.architecture_profile?.id).toBe("react");
    expect(outcome.result.baseline).toMatchObject({ asked: 3, answered: 3 });
    const stack = readFileSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"), "utf8");
    expect(stack).toContain("framework: react");
    expect(stack).toContain("router: react-router");
    expect(stack).toContain("state: zustand");
    expect(readFileSync(join(dir, ".pomaster", "baseline", "frontend", "architecture-profile.md"), "utf8")).toContain("React component/tree");
  });

  it("重复 init 只创建一个 TASK，且 first next action 始终优先指向识别报告", async () => {
    hostFile("package.json", '{"dependencies":{"vue":"^3.5.0"}}\n');
    hostFile("src/main.ts", 'import { createApp } from "vue";\n');
    const first = await runInit(dir, { brownfield: { confirmed: false } });
    const second = await runInit(dir);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(identificationBodies()).toHaveLength(1);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const action = evaluateNextAction(await collectNextActionSnapshot(dir, warnings));
    expect(action.route_id).toBe("R_PROJECT_IDENTIFICATION");
    expect(action.command).toContain("project-identification report TASK.INIT_PROJECT_IDENTIFICATION");
  });

  it("report 保留七类识别事实；Owner 确认前零治理，确认后生成 profile，重放幂等", async () => {
    hostFile("package.json", '{"dependencies":{"vue":"^3.5.0"}}\n');
    await runInit(dir, { brownfield: { confirmed: false } });
    const reported = await runProjectIdentificationReport(dir, report);
    expect(reported.ok, JSON.stringify(reported.errors)).toBe(true);
    expect(reported.result.change).toBe("APPLIED");
    expect(existsSync(join(dir, ".pomaster", "state", "architecture-profile.json"))).toBe(false);
    const payload = identificationBodies()[0]?.payload as Record<string, unknown>;
    expect(payload.identification_status).toBe("reported");
    expect(payload.report).toEqual({
      purpose: report.purpose,
      architecture: "vue",
      stack: [...report.stack].sort(),
      directories: [...report.directories].sort(),
      commands: [...report.commands].sort(),
      evidence: [...report.evidence].sort(),
      unknowns: [...report.unknowns].sort(),
    });
    const rejected = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "agent:coder" });
    expect(rejected.ok).toBe(false);
    expect(existsSync(join(dir, ".pomaster", "state", "architecture-profile.json"))).toBe(false);
    const confirmed = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "human:owner" });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.result.architecture_profile?.source).toBe("owner_confirmed_task");
    expect(readFileSync(join(dir, ".pomaster", "baseline", "frontend", "architecture-profile.md"), "utf8")).toContain("Vue SFC");
    const stack = readFileSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"), "utf8");
    expect(stack).toContain("framework: vue3");
    expect(stack).toContain("router: vue-router");
    expect(stack).toContain("state: pinia");
    const replay = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "human:owner" });
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("NO_CHANGE");
  });

  it("治理文件冲突时识别 TASK 保持 reported，避免完成态掩盖未生成治理", async () => {
    hostFile("package.json", '{"dependencies":{"vue":"^3.5.0"}}\n');
    await runInit(dir, { brownfield: { confirmed: false } });
    expect((await runProjectIdentificationReport(dir, report)).ok).toBe(true);
    hostFile(".pomaster/state/architecture-profile.json", '{"manual":true}\n');

    const confirmed = await runProjectIdentificationConfirm(dir, {
      taskId: report.taskId,
      actor: "human:owner",
    });

    expect(confirmed.ok).toBe(false);
    expect(confirmed.errors[0]?.code).toBe("ARCHITECTURE_PROFILE_CONFLICT");
    expect((identificationBodies()[0]?.payload as Record<string, unknown>).identification_status).toBe("reported");
    expect(existsSync(join(dir, ".pomaster", "baseline", "frontend", "architecture-profile.md"))).toBe(false);
  });

  it("Vue 与 React 生成不同的治理内容和指纹", async () => {
    const render = async (architecture: "vue" | "react"): Promise<{ text: string; digest: string }> => {
      const root = mkdtempSync(join(tmpdir(), `pomaster-project-${architecture}-`));
      try {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "package.json"), "{}\n", "utf8");
        await runInit(root, { brownfield: { confirmed: false } });
        const reported = await runProjectIdentificationReport(root, { ...report, architecture });
        expect(reported.ok, JSON.stringify(reported.errors)).toBe(true);
        const outcome = await runProjectIdentificationConfirm(root, { taskId: report.taskId, actor: "human:owner" });
        expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
        return {
          text: readFileSync(join(root, ".pomaster", "baseline", "frontend", "architecture-profile.md"), "utf8"),
          digest: outcome.result.architecture_profile?.source_digest ?? "",
        };
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
    const vue = await render("vue");
    const react = await render("react");
    expect(vue.text).toContain("Vue SFC");
    expect(react.text).toContain("React component/tree");
    expect(vue.digest).not.toBe(react.digest);
  });
});

function enrollAndSigner(root: string) {
  const key = makeKey("ssh-ed25519");
  const keyDir = mkdtempSync(join(tmpdir(), "pomaster-keys-"));
  writeFileSync(join(keyDir, "owner.pub"), `${key.line}\n`);
  writeFileSync(join(keyDir, "owner"), opensshPrivateKeyText("aes256-ctr"));
  expect(runTrustEnroll(root, { key: join(keyDir, "owner.pub"), principal: "owner", private: join(keyDir, "owner") }, { listAgentKeys: () => [] }).ok).toBe(true);
  rmSync(keyDir, { recursive: true, force: true });
  /** 按人工点被拒时的提示建请求并让「人」签名，返回签发编号。 */
  return (hint: string): string => {
    const ref = /--ref "((?:[^"\\]|\\.)*)"/.exec(hint)?.[1]?.replace(/\\"/g, '"') ?? "";
    const sha = /--sha256 ([0-9a-f]{64})/.exec(hint)?.[1] ?? "";
    const kind = /pomaster trust request (\S+)/.exec(hint)?.[1] ?? "";
    const id = (runTrustRequest(root, { kind, ref, sha256: sha }, { listAgentKeys: () => [] }).result as { id: string }).id;
    const path = join(root, ".pomaster", "trust", "requests", `${id}.json`);
    writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
    return id;
  };
}

describe("project-identification confirm · 可信签发（AP-0a / D-2）", () => {
  it("登记签名人后：首次确认要签发（主体写明 TASK 与架构），签发后确认；已完成的重放不再要签", async () => {
    hostFile("package.json", '{"dependencies":{"vue":"^3.5.0"}}\n');
    await runInit(dir, { brownfield: { confirmed: false } });
    expect((await runProjectIdentificationReport(dir, report)).ok).toBe(true);
    const sign = enrollAndSigner(dir);
    const refused = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "human:owner" });
    expect(refused.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    expect(refused.errors[0]?.hint).toContain(`project-identification ${report.taskId} → vue`);
    expect(existsSync(join(dir, ".pomaster", "state", "architecture-profile.json"))).toBe(false);
    const confirmed = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "human:owner", signoff: sign(refused.errors[0]?.hint ?? "") });
    expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
    const payload = identificationBodies()[0]?.payload as { owner_confirmation?: { signoff?: { principal?: string } } };
    expect(payload.owner_confirmation?.signoff?.principal).toBe("owner");
    const replay = await runProjectIdentificationConfirm(dir, { taskId: report.taskId, actor: "human:owner" });
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("NO_CHANGE");
  });
});
