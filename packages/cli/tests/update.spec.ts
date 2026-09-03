/**
 * update.spec.ts —— `pomaster update`（F2）：--check 三态（更新可用 / 已是最新 /
 * registry 不可达）、--yes 执行与拒绝路径、semver 纯函数、§45 --json 信封词形。
 *
 * 零网络纪律：npm 执行器经 UpdateDeps.runNpm 注入 fake（记录调用参数并回放受控输出），
 * 测试不触网、不依赖本机 npm 形态。
 */
import { describe, expect, it } from "vitest";
import {
  compareSemver,
  runUpdate,
  toEnvelope,
  type NpmRunResult,
  type NpmRunner,
  type UpdateResult,
} from "@pomaster/cli";

/** 可编排 fake npm：按调用序回放脚本；记录每次调用的 args 与 inheritStdio。 */
function fakeNpm(script: readonly NpmRunResult[]): {
  calls: { args: string[]; inheritStdio: boolean }[];
  runner: NpmRunner;
} {
  const calls: { args: string[]; inheritStdio: boolean }[] = [];
  return {
    calls,
    runner: (args, options) => {
      calls.push({ args: [...args], inheritStdio: options.inheritStdio });
      return script[calls.length - 1] ?? { status: 1, stdout: "", stderr: "" };
    },
  };
}

describe("update --check 三态（F2 fail-closed）", () => {
  it("更新可用：latest > current → updateAvailable=true，人读含 npm i -g 指路", async () => {
    const { calls, runner } = fakeNpm([{ status: 0, stdout: "9.9.9\n", stderr: "" }]);
    const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as UpdateResult;
    expect(result).toEqual({
      current: "0.1.1",
      latest: "9.9.9",
      updateAvailable: true,
      check: "ok",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["view", "pomaster", "version"]);
    expect(outcome.human.join("\n")).toContain("current 0.1.1 / latest 9.9.9");
    expect(outcome.human.join("\n")).toContain("pomaster update --yes");
    expect(outcome.human.join("\n")).toContain("npm i -g pomaster");
  });

  it("已是最新：latest == current → updateAvailable=false，人读「已是最新」", async () => {
    const { runner } = fakeNpm([{ status: 0, stdout: "0.1.1", stderr: "" }]);
    const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.updateAvailable).toBe(false);
    expect(outcome.human.join("\n")).toContain("已是最新");
  });

  it("registry 不可达（非零退出）→ REGISTRY_UNREACHABLE、updateAvailable=null，禁假报「已是最新」", async () => {
    const { runner } = fakeNpm([
      { status: 1, stdout: "", stderr: "npm ERR! network ECONNREFUSED" },
    ]);
    const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("REGISTRY_UNREACHABLE");
    expect(outcome.result.check).toBe("registry_unreachable");
    expect(outcome.result.updateAvailable).toBeNull();
    expect(outcome.result.latest).toBeNull();
    expect(outcome.result.current).toBe("0.1.1");
    expect(outcome.human.join("\n")).toContain("registry 不可达，无法检查更新");
    expect(outcome.human.join("\n")).not.toContain("已是最新");
  });

  it("registry 不可达（超时形态 status=null）与畸形 stdout 同走 fail-closed", () => {
    for (const fake of [
      { status: null, stdout: "", stderr: "" }, // spawnSync timeout / ENOENT
      { status: 0, stdout: "npm ERR! gibberish", stderr: "" }, // 非版本词形
    ]) {
      const { runner } = fakeNpm([fake]);
      const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("REGISTRY_UNREACHABLE");
      expect(outcome.result.check).toBe("registry_unreachable");
      expect(outcome.result.updateAvailable).toBeNull();
    }
  });
});

describe("update --yes 执行与拒绝路径（F2）", () => {
  it("更新可用 + --yes → npm install -g pomaster@latest（stdio inherit），完成后指路重新 init", () => {
    const { calls, runner } = fakeNpm([
      { status: 0, stdout: "9.9.9\n", stderr: "" },
      { status: 0, stdout: "", stderr: "" }, // install（inherit → stdout 空）
    ]);
    const outcome = runUpdate({ yes: true }, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toEqual(["install", "-g", "pomaster@latest"]);
    expect(calls[1]?.inheritStdio).toBe(true);
    expect(outcome.result.install).toEqual({
      command: "npm install -g pomaster@latest",
      exit_code: 0,
      ok: true,
    });
    const human = outcome.human.join("\n");
    expect(human).toContain("npm install -g pomaster@latest");
    expect(human).toContain("重新运行 pomaster init（幂等）刷新入口（含重入口安装物）。");
  });

  it("--yes + npm install 失败 → NPM_INSTALL_FAILED 透传 exit 1 + errors", () => {
    const { runner } = fakeNpm([
      { status: 0, stdout: "9.9.9\n", stderr: "" },
      { status: 37, stdout: "", stderr: "npm ERR! EACCES" },
    ]);
    const outcome = runUpdate({ yes: true }, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NPM_INSTALL_FAILED");
    expect(outcome.errors[0]?.message).toContain("37");
    expect(outcome.result.install?.exit_code).toBe(37);
    expect(outcome.result.install?.ok).toBe(false);
  });

  it("--yes + 已是最新 → 显式说明 exit 0，零安装调用", () => {
    const { calls, runner } = fakeNpm([{ status: 0, stdout: "0.1.1", stderr: "" }]);
    const outcome = runUpdate({ yes: true }, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(true);
    expect(outcome.human.join("\n")).toContain("已是最新");
    expect(outcome.result.install).toBeUndefined();
    expect(calls).toHaveLength(1); // 只有 view，没有 install
  });

  it("--yes + registry 不可达 → 拒绝执行（REGISTRY_UNREACHABLE，不做盲装）", () => {
    const { calls, runner } = fakeNpm([{ status: 1, stdout: "", stderr: "ECONNREFUSED" }]);
    const outcome = runUpdate({ yes: true }, { currentVersion: "0.1.1", runNpm: runner });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("REGISTRY_UNREACHABLE");
    expect(outcome.human.join("\n")).toContain("拒绝执行");
    expect(calls).toHaveLength(1); // install 从未被调用
  });
});

describe("compareSemver 纯函数（零依赖 semver 比较）", () => {
  it("三段逐位比较 + v 前缀容差 + 相等为零", () => {
    expect(compareSemver("9.9.9", "0.1.1")).toBeGreaterThan(0);
    expect(compareSemver("0.1.1", "0.1.1")).toBe(0);
    expect(compareSemver("0.1.0", "0.1.1")).toBeLessThan(0);
    expect(compareSemver("v2.0.0", "1.9.9")).toBeGreaterThan(0);
    // 数值比较而非字典序（2 < 10）。
    expect(compareSemver("10.0.0", "2.0.0")).toBeGreaterThan(0);
  });

  it("缺段/不可解析段按 0 计（宁不误报更新）", () => {
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
    expect(compareSemver("next", "0.0.0")).toBe(0);
  });
});

describe("update --json 信封词形（§45；经 toEnvelope 组装）", () => {
  it("ok 路径：{command:'update', ok:true, result:{current, latest, updateAvailable, check:'ok'}}", () => {
    const { runner } = fakeNpm([{ status: 0, stdout: "9.9.9\n", stderr: "" }]);
    const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
    const envelope = toEnvelope("update", outcome);
    expect(Object.keys(envelope).sort()).toEqual([
      "command",
      "errors",
      "ok",
      "result",
      "warnings",
    ]);
    expect(envelope.command).toBe("update");
    expect(envelope.ok).toBe(true);
    expect(envelope.result).toEqual({
      current: "0.1.1",
      latest: "9.9.9",
      updateAvailable: true,
      check: "ok",
    });
  });

  it("registry 不可达路径：check='registry_unreachable'、updateAvailable=null、errors 带路标", () => {
    const { runner } = fakeNpm([{ status: null, stdout: "", stderr: "" }]);
    const outcome = runUpdate({}, { currentVersion: "0.1.1", runNpm: runner });
    const envelope = toEnvelope("update", outcome);
    expect(envelope.ok).toBe(false);
    expect(envelope.result).toEqual({
      current: "0.1.1",
      latest: null,
      updateAvailable: null,
      check: "registry_unreachable",
    });
    expect(envelope.errors[0]?.hint).toContain("npm i -g pomaster");
  });
});
