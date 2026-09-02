/**
 * version.ts —— CLI 版本单点解析（F3：bundled `--version` 修复）。
 *
 * 双形态：
 * - 发布形态（esbuild bundle）：scripts/build-npm-package.mjs 以
 *   `define: { POMASTER_VERSION: '"x.y.z"' }` 注入版本字面量（真源 = 该脚本顶部
 *   POMASTER_VERSION 常量）——typeof 守卫命中注入分支，零 IO；
 * - dev 形态（tsc dist / vitest 源直连）：define 不存在 → 从上溯目录里的
 *   cli package.json（name = "@pomaster/cli"）读 version（0.0.0）；读取失败回退
 *   CLI_VERSION 常量锚（同值），绝不 throw。
 *
 * 铁律注记：`typeof POMASTER_VERSION` 对未声明标识符运行时安全（不抛 ReferenceError），
 * dev 形态下该全局结构性不存在；bundle 形态下 esbuild define 已把标识符替换为字面量。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_VERSION } from "./cli-info.js";

/** 发布版本注入位（esbuild define；dev 形态下未声明，仅 typeof 守卫访问）。 */
declare const POMASTER_VERSION: string | undefined;

const CLI_PACKAGE_NAME = "@pomaster/cli";

/**
 * dev 形态版本读取：从本模块位置向上找 name = "@pomaster/cli" 的 package.json。
 * 兼容三种在座形态——tsc dist（packages/cli/dist/version.js）、vitest 源直连
 * （packages/cli/src/version.ts）、未来布局变化（逐级上溯 + name 校验，不猜相对深度）。
 */
function readCliPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (manifest.name === CLI_PACKAGE_NAME && typeof manifest.version === "string") {
        return manifest.version;
      }
    } catch {
      // 缺席/不可解析 → 继续上溯（fs 根到底自然终止）。
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return CLI_VERSION;
}

/** CLI 当前版本：bundle = 发布注入值；dev = cli package.json version（0.0.0）。 */
export function resolveCliVersion(): string {
  if (typeof POMASTER_VERSION !== "undefined") {
    return POMASTER_VERSION;
  }
  return readCliPackageVersion();
}
