import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectNextActionSnapshot,
  createProgram,
  evaluateNextAction,
  runInit,
  runProjectIdentificationConfirm,
  runProjectIdentificationReport,
} from "@pomaster/cli";

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
