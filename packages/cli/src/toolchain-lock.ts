/**
 * toolchain-lock.ts —— 全 auto 浏览器工具链的兼容锁（code-spec browser-toolchain §3.1；INIT-C / D-15）。
 *
 * 只锁精确版本，且每个版本在锁定前已发布至少两周：
 * - chrome-devtools-mcp 1.12.0（2026-10-22 发布；打包发布，无运行时依赖）；
 * - @playwright/mcp 0.0.83（2026-09-28 发布）；
 * - playwright / playwright-core / @playwright/test 锁成 @playwright/mcp 0.0.83 自己依赖的那个
 *   Playwright（1.64.0-alpha-1790635538000），MCP 与 runner 共用同一个 Chromium 构建。
 *
 * 换锁 = 改这里 + 新的 lock_id；新锁与旧锁在托管目录里并排安装，旧锁不被改动。
 */
import { createHash } from "node:crypto";

export const TOOLCHAIN_LOCK_SCHEMA = "pomaster.toolchain-lock/v1";

export interface ToolchainServerDef {
  /** 宿主配置里的服务名（带前缀，避免和用户自己的同名服务撞）。 */
  readonly entry: string;
  /** 启动器参数里的短名。 */
  readonly name: "chrome-devtools" | "playwright";
  readonly package: string;
  /** 包 package.json `bin` 里的键；路径在安装后从已装的 package.json 解析（不写死包内布局）。 */
  readonly bin: string;
  /** 固定参数；`{chromium}` 在启动时换成清单里的 Chromium 可执行文件。 */
  readonly args: readonly string[];
  /** tools/list 必须包含的工具。 */
  readonly expectedTools: readonly string[];
}

export const TOOLCHAIN_LOCK = {
  schema: TOOLCHAIN_LOCK_SCHEMA,
  packages: {
    "chrome-devtools-mcp": "1.12.0",
    "@playwright/mcp": "0.0.83",
    playwright: "1.64.0-alpha-1790635538000",
    "playwright-core": "1.64.0-alpha-1790635538000",
    "@playwright/test": "1.64.0-alpha-1790635538000",
  },
  /** 各包 engines 的交集：chrome-devtools-mcp ^20.19.0 || ^22.12.0 || >=23；@playwright/mcp >=18；playwright >=20。 */
  node: "^20.19.0 || ^22.12.0 || >=23",
  browsers: ["chromium"],
  servers: [
    {
      entry: "pomaster-chrome-devtools",
      name: "chrome-devtools",
      package: "chrome-devtools-mcp",
      bin: "chrome-devtools-mcp",
      args: ["--headless", "--isolated", "--executablePath", "{chromium}", "--usageStatistics=false", "--performanceCrux=false"],
      expectedTools: ["new_page", "take_snapshot", "list_pages"],
    },
    {
      entry: "pomaster-playwright",
      name: "playwright",
      package: "@playwright/mcp",
      bin: "playwright-mcp",
      args: ["--headless", "--isolated", "--browser", "chromium"],
      expectedTools: ["browser_navigate", "browser_snapshot", "browser_close"],
    },
  ] as readonly ToolchainServerDef[],
} as const;

export type ToolchainLock = typeof TOOLCHAIN_LOCK;

/** Chrome 在 Linux 上拿不到沙箱时补的参数（只在带沙箱启动失败、去沙箱重试通过后才写进清单）。 */
export const CHROME_NO_SANDBOX_ARG = "--chromeArg=--no-sandbox";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** lock_id = 规范化锁内容 sha256 的前 12 位十六进制。 */
export function lockIdOf(lock: unknown = TOOLCHAIN_LOCK): string {
  return createHash("sha256").update(canonical(lock), "utf8").digest("hex").slice(0, 12);
}

type Version = readonly [number, number, number];

export function parseNodeVersion(raw: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Version, b: Version): number {
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] as number) - (b[index] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * 只认锁里用到的写法：`||` 分隔的若干段，每段是 `^x.y.z`（同主版本、不低于）或 `>=x.y.z` / `>=x`。
 * 认不出的段一律不满足（fail closed）。
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parsed = parseNodeVersion(version);
  if (parsed === null) return false;
  return range.split("||").some((part) => {
    const clause = part.trim();
    const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(clause);
    if (caret !== null) {
      const floor: Version = [Number(caret[1]), Number(caret[2]), Number(caret[3])];
      return parsed[0] === floor[0] && compare(parsed, floor) >= 0;
    }
    const gte = /^>=(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(clause);
    if (gte !== null) {
      const floor: Version = [Number(gte[1]), Number(gte[2] ?? 0), Number(gte[3] ?? 0)];
      return compare(parsed, floor) >= 0;
    }
    return false;
  });
}

/** 托管目录里的 package.json（精确版本；私有；不进业务依赖）。 */
export function managedPackageJson(lock: ToolchainLock = TOOLCHAIN_LOCK): string {
  return `${JSON.stringify({ name: "pomaster-toolchain", private: true, description: `pomaster ${lock.schema} ${lockIdOf(lock)}`, dependencies: { ...lock.packages } }, null, 2)}\n`;
}
