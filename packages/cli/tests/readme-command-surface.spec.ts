/**
 * readme-command-surface.spec.ts —— B1 golden：README 命令面与 CLI --help 零漂移。
 *
 * 缺陷史：README:91 曾广告 `pomaster maintain …` 而 CLI 零实现（幽灵命令——文档
 * 比现实超前；gaps 研究 §1.1 实测登记，P11 落地后归零）。本测试把「README 广告的
 * 命令面 == CLI 实际命令面」钉成 golden，双向封死漂移：
 * - README → CLI：广告的每个顶层命令/子命令必须在程序注册表中存在（幽灵命令必红）；
 * - CLI → README：程序注册表中每个顶层命令（help 除外）必须被 README 广告（文档滞后必红）；
 * - --help 输出：每个广告命令的名字必须出现在真实 `--help` 文本里（出口判据逐字锚）。
 *
 * 解析纪律：只解析「## 快速上手」下第一个围栏代码块的 `pomaster …` 行——正文散文里
 * 的 `pomaster` 字样不进分母；解析结果为空 = 测试自身假绿，显式失败。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createProgram, runCli } from "@pomaster/cli";

const README_PATH = fileURLToPath(new URL("../../../README.md", import.meta.url));

/** README 广告面解析结果：顶层命令 → 子命令清单（空数组 = 无子命令广告）。 */
function parseAdvertisedSurface(readme: string): Map<string, string[]> {
  const anchor = readme.indexOf("## 快速上手");
  if (anchor < 0) throw new Error("README 必须含「## 快速上手」节");
  const lines = readme.slice(anchor).split("\n");
  const fenceOpen = lines.findIndex((line) => line.trimStart().startsWith("```"));
  if (fenceOpen < 0) throw new Error("快速上手节必须带代码块");
  const block: string[] = [];
  for (let i = fenceOpen + 1; i < lines.length; i += 1) {
    if (lines[i]?.trimStart().startsWith("```")) break;
    block.push(lines[i] ?? "");
  }

  const surface = new Map<string, string[]>();
  for (const line of block) {
    const withoutComment = line.split("#")[0]?.trim() ?? "";
    if (!withoutComment.startsWith("pomaster ")) continue;
    const tokens = withoutComment.slice("pomaster ".length).trim().split(/\s+/);
    const head = tokens[0];
    if (head === undefined || head.length === 0) continue;
    // 第二个 token 是子命令清单词形（issue/check/steal/list、gate-run|claim）时展开；
    // 位置参数 <…>、选项 --…、省略号 … 都不是子命令。
    const second = tokens[1];
    let subs: string[] = [];
    if (second !== undefined && /^[a-z][a-z0-9-]*([/|][a-z][a-z0-9-]*)*$/.test(second)) {
      subs = second.split(/[|/]/);
    }
    surface.set(head, subs);
  }
  return surface;
}

/** 程序注册表实际命令面（顶层 → 子命令；commander 隐式 help 命令排除）。 */
function actualSurface(): Map<string, string[]> {
  const program = createProgram();
  const surface = new Map<string, string[]>();
  for (const command of program.commands) {
    if (command.name() === "help") continue;
    surface.set(
      command.name(),
      command.commands.map((sub) => sub.name()),
    );
  }
  return surface;
}

/** 通过真实 runCli 渲染 --help 文本（信息性退出 → exit 0）。 */
async function helpText(argv: readonly string[]): Promise<string> {
  const lines: string[] = [];
  const code = await runCli([...argv], {
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  });
  expect(code, `${argv.join(" ")} 是信息性帮助请求，必须 exit 0`).toBe(0);
  return lines.join("\n");
}

describe("B1 golden：README 命令面与 CLI --help 零漂移", () => {
  let advertised: Map<string, string[]>;
  let actual: Map<string, string[]>;

  beforeAll(() => {
    advertised = parseAdvertisedSurface(readFileSync(README_PATH, "utf8"));
    actual = actualSurface();
  });

  it("解析分母自检：README 快速上手块至少广告 8 个顶层命令（空解析 = 假绿，显式失败）", () => {
    expect(advertised.size).toBeGreaterThanOrEqual(8);
  });

  it("README → CLI：广告的每个顶层命令必须真实注册（幽灵命令必红——maintain 缺陷史回归）", () => {
    const ghosts = [...advertised.keys()].filter((top) => !actual.has(top));
    expect(ghosts, `README 广告了不存在的命令：${ghosts.join(", ")}`).toEqual([]);
  });

  it("README → CLI：广告的子命令必须真实注册且逐字一致", () => {
    for (const [top, subs] of advertised) {
      const registered = actual.get(top);
      expect(registered, `顶层命令 ${top} 必须存在`).toBeDefined();
      expect([...subs].sort(), `${top} 子命令面`).toEqual([...(registered ?? [])].sort());
    }
  });

  it("CLI → README：注册表中每个顶层命令（help 除外）必须被 README 广告（文档滞后必红）", () => {
    const undocumented = [...actual.keys()].filter((top) => !advertised.has(top));
    expect(undocumented, `CLI 存在但 README 未广告的命令：${undocumented.join(", ")}`).toEqual([]);
  });

  it("README 广告面逐字出现在真实 --help 输出（顶层 + 有子命令的组各自 --help）", async () => {
    const topLevelHelp = await helpText(["--help"]);
    for (const top of advertised.keys()) {
      expect(topLevelHelp).toContain(top);
    }
    for (const [top, subs] of advertised) {
      if (subs.length === 0) continue;
      const subHelp = await helpText([top, "--help"]);
      for (const sub of subs) {
        expect(subHelp, `${top} --help 必须呈现子命令 ${sub}`).toContain(sub);
      }
    }
  });
});
