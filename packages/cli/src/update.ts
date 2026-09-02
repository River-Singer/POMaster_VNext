/**
 * update.ts —— `pomaster update`：CLI 自更新检查/执行（F2）。
 *
 * 语义：帮助用户更新 CLI 版本。
 * - 缺省 = --check：读本机版本（F3 注入的 POMASTER_VERSION；dev 形态回落 cli
 *   package.json，见 version.ts）→ `npm view pomaster version`（timeout 15s）→
 *   纯函数 semver 比较（compareSemver，零依赖）→ 三态显式呈现：更新可用 / 已是最新 /
 *   registry 不可达。
 * - --yes：检查通过且更新可用 → `npm install -g pomaster@latest`（stdio inherit，
 *   timeout 300s）→ 转述 npm 结果 + 指路重新 `pomaster init`（幂等）刷新轻入口；
 *   npm 失败透传 exit 1 + errors；已是最新 → 显式说明 exit 0；
 *   registry 不可达 + --yes → 拒绝执行（fail-closed，禁盲装）。
 *
 * fail-closed 铁律：registry 不可达/超时/输出不可解析 → check="registry_unreachable"、
 * updateAvailable=null、ok=false exit 1——绝不假报「已是最新」（假绿比红更危险）。
 *
 * §45 单信封：--json result = {current, latest, updateAvailable, check[, install]}；
 * npm 执行器可注入（UpdateDeps.runNpm），测试零网络。
 * 零依赖纪律：npm 调用走 spawnSync + node 内建，semver 比较手写 ~20 行纯函数。
 */

import { spawnSync } from "node:child_process";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { resolveCliVersion } from "./version.js";

/** 更新目标包名（发布单包，Owner 裁决 10）。 */
export const UPDATE_PACKAGE_NAME = "pomaster" as const;

/** npm view 超时（任务规格：15s）。 */
const NPM_VIEW_TIMEOUT_MS = 15_000;
/** npm install 超时（任务规格：300s）。 */
const NPM_INSTALL_TIMEOUT_MS = 300_000;

/** check 腿词形：ok = registry 应答可解析；registry_unreachable = 不可达/超时/畸形（显式呈现，禁假绿）。 */
export type UpdateCheckStatus = "ok" | "registry_unreachable";

export interface UpdateInstallReport {
  readonly command: string;
  readonly exit_code: number | null;
  readonly ok: boolean;
}

export interface UpdateResult {
  readonly current: string;
  /** registry 最新版本；registry 不可达 → null（显式缺席，非空串冒充）。 */
  readonly latest: string | null;
  /** true=更新可用 / false=已是最新 / null=检查未完成（fail-closed 第三态）。 */
  readonly updateAvailable: boolean | null;
  readonly check: UpdateCheckStatus;
  /** 仅 --yes 且检查通过时在场。 */
  readonly install?: UpdateInstallReport;
}

/** npm 执行结果（与 spawnSync 相关字段的最小镜像，stdout 恒 string——inherit 模式为空串）。 */
export interface NpmRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type NpmRunner = (
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly inheritStdio: boolean },
) => NpmRunResult;

export interface UpdateDeps {
  /** 本机版本注入（缺省 resolveCliVersion()）。 */
  readonly currentVersion?: string;
  /** npm 执行器注入（缺省 spawnSync npm；测试注入 fake 零网络）。 */
  readonly runNpm?: NpmRunner;
}

/** 缺省 npm 执行器：spawnSync（Windows 下 npm 是 npm.cmd，须 shell 解析）。 */
function defaultNpmRunner(
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly inheritStdio: boolean },
): NpmRunResult {
  const res = spawnSync("npm", [...args], {
    encoding: "utf8",
    timeout: options.timeoutMs,
    shell: process.platform === "win32",
    ...(options.inheritStdio ? { stdio: "inherit" as const } : {}),
  });
  return {
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
  };
}

/**
 * 三段 semver 比较（~20 行纯函数，零依赖）：返回负/零/正 = a 小于/等于/大于 b。
 * 容 v 前缀；不可解析段按 0 计（宁不误报更新，不假红）。
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.trim().replace(/^v/i, "").split(".");
  const pb = b.trim().replace(/^v/i, "").split(".");
  for (let i = 0; i < 3; i += 1) {
    const na = Number.parseInt(pa[i] ?? "0", 10) || 0;
    const nb = Number.parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** registry 应答 → 版本词形判定（`npm view <pkg> version` 恒输出单行 semver）。 */
function parseLatestVersion(stdout: string): string | null {
  const value = stdout.trim();
  return /^v?\d+\.\d+\.\d+/.test(value) ? value.replace(/^v/, "") : null;
}

/**
 * 运行 update 命令。缺省 = --check；--yes 时检查通过才执行全局安装。
 * 判卷纯本地（版本比较），写入面只有 npm 全局安装（stdio inherit 透传 npm 输出）。
 */
export function runUpdate(
  options: { readonly yes?: boolean } = {},
  deps: UpdateDeps = {},
): CommandOutcome<UpdateResult> {
  const yes = options.yes === true;
  const current = deps.currentVersion ?? resolveCliVersion();
  const runNpm = deps.runNpm ?? defaultNpmRunner;

  // ① registry 检查（--check 缺省腿；--yes 的前置闸）。
  const npmView = runNpm(["view", UPDATE_PACKAGE_NAME, "version"], {
    timeoutMs: NPM_VIEW_TIMEOUT_MS,
    inheritStdio: false,
  });
  const latest = npmView.status === 0 ? parseLatestVersion(npmView.stdout) : null;

  if (latest === null) {
    // fail-closed：不可达/超时/输出畸形 → 显式呈现；--yes 拒绝执行（禁盲装，禁假绿）。
    const stderrExcerpt = npmView.stderr.trim().slice(0, 200);
    const result: UpdateResult = {
      current,
      latest: null,
      updateAvailable: null,
      check: "registry_unreachable",
    };
    return failOutcome(
      "update",
      result,
      [
        {
          code: "REGISTRY_UNREACHABLE",
          message: `npm view ${UPDATE_PACKAGE_NAME} version 未返回可解析版本（exit ${npmView.status}${stderrExcerpt ? `；stderr: ${stderrExcerpt}` : ""}）`,
          hint: "检查网络或 npm registry 配置；也可直接运行 npm i -g pomaster。",
        },
      ],
      [
        `update: current ${current}`,
        "registry 不可达，无法检查更新",
        ...(yes ? ["--yes 已拒绝执行：检查未完成，不做盲装（fail-closed）。"] : []),
      ],
    );
  }

  const updateAvailable = compareSemver(latest, current) > 0;

  // ② --yes + 已是最新：显式说明，零安装，exit 0。
  if (yes && !updateAvailable) {
    return okOutcome(
      "update",
      { current, latest, updateAvailable, check: "ok" },
      [`update: current ${current} / latest ${latest}`, "已是最新"],
    );
  }

  // ③ --yes + 更新可用：全局安装（stdio inherit 透传 npm 输出）→ 转述结果 + 指路。
  if (yes) {
    const installArgs = ["install", "-g", `${UPDATE_PACKAGE_NAME}@latest`];
    const npmInstall = runNpm(installArgs, {
      timeoutMs: NPM_INSTALL_TIMEOUT_MS,
      inheritStdio: true,
    });
    const install: UpdateInstallReport = {
      command: `npm ${installArgs.join(" ")}`,
      exit_code: npmInstall.status,
      ok: npmInstall.status === 0,
    };
    const human = [
      `update: current ${current} / latest ${latest} → ${install.command}`,
      install.ok ? "npm install 完成" : "npm install 失败（详见上方 npm 透传输出）",
      ...(install.ok ? ["重新运行 pomaster init（幂等）刷新轻入口。"] : []),
    ];
    const result: UpdateResult = { current, latest, updateAvailable, check: "ok", install };
    if (install.ok) {
      return okOutcome("update", result, human);
    }
    const installError: CliError = {
      code: "NPM_INSTALL_FAILED",
      message: `${install.command} 失败（exit ${npmInstall.status}）`,
      hint: "npm 的错误输出已透传到终端；可手动运行 npm i -g pomaster 后重试。",
    };
    return failOutcome("update", result, [installError], human);
  }

  // ④ 缺省 --check：三态人读呈现（更新可用 / 已是最新；不可达已在 ① fail-closed 出口）。
  const human = [
    `update: current ${current} / latest ${latest}`,
    updateAvailable
      ? `更新可用：运行 pomaster update --yes 或 npm i -g ${UPDATE_PACKAGE_NAME}`
      : "已是最新",
  ];
  return okOutcome("update", { current, latest, updateAvailable, check: "ok" }, human);
}
