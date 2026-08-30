#!/usr/bin/env node
/**
 * eval-trigger.mjs —— §94.3 Behavioral Eval 触发面消费脚本（PRD §94.3；wave3-plan P17）。
 *
 * 语义（如实落地，不发明额外触发源）：五类源升级 → 触发 behavioral eval——
 * Context Compiler / Router / Gate Policy / Catalog Rule / Harness（闭表见
 * TRIGGER_CATEGORIES；Role Prompt 与自身架构演进暂无仓库内载体，manifest 按
 * validateManifest 封死第六类）。触发清单：tests/behavioral/trigger-manifest.json
 * （源路径模式 → suite 映射 + suites 注册表）；执行载体：`pomaster eval --suite behavioral`
 * 同一执行器（@pomaster/cli eval 模块；vitest 入口 = manifest suites[suite].spec）。
 *
 * 用法：
 *   node scripts/eval-trigger.mjs [--base <git-ref>] [--manifest <path>]
 *                                 [--paths <p1,p2,…>] [--run] [--dry-run] [--json]
 * - 触达源检测：--paths 显式给定（逗号分隔或重复旗标；测试/嵌入面）优先；
 *   否则 `git diff --name-only <base>`（缺省 HEAD = 工作树对 HEAD；不含未跟踪新文件
 *   ——新文件随 commit 进入 diff 范围）。PR/CI 用法：--base <PR 基线 ref>。
 * - 提示模式（缺省）：匹配 manifest 输出触发类别/suite 清单，exit 0；
 * - --dry-run：另打印将执行的 vitest 命令，不执行；
 * - --run：逐 suite 执行（vitest run <spec>，ratchet.mjs 同款 process.execPath 直连，
 *   无 shell/PATH 依赖），任一 suite 失败即停并透传其退出码（fail-closed 链）。
 * - --json：机读输出（形态见 README 与 spec；无颜色码）。
 * 退出码：0 = 检测成功（含零触发）；1 = 操作性失败（manifest 缺失/非法、git 不可用、
 * suite 词表未知、--run 执行失败）——检测层 fail-closed，绝不静默放行。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** 缺省触发清单（manifest 位置锚定仓库根：tests/behavioral/ → 仓库根）。 */
export const DEFAULT_MANIFEST_PATH = resolve(
  SCRIPT_DIR,
  "..",
  "tests",
  "behavioral",
  "trigger-manifest.json",
);

/** PRD §94.3 五类闭包（机器封死第六类——不发明额外触发源）。 */
export const TRIGGER_CATEGORIES = [
  "Context Compiler",
  "Router",
  "Gate Policy",
  "Catalog Rule",
  "Harness",
];

function fail(message) {
  console.error(`[eval-trigger] FAIL: ${message}`);
  process.exit(1);
}

function toPosix(p) {
  return p.split("\\").join("/");
}

/**
 * 极简 glob（仅 ** 与 *；语义与 packages/cli/src/triage-rule-v0.ts globMatch 同源——
 * 「** 加斜杠」跨零段及以上，其余「双星」跨任意段，「单星」单段内。JS 镜像由 spec
 * 与 TS 侧做逐例一致性钉住）。
 */
export function pathMatchesPattern(pattern, candidate) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*\//g, "\u0000") // "**/" 跨零段及以上（**/*.md ↔ README.md）
    .replace(/\*\*/g, "\u0001") // 其余 "**" 跨任意段
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${body}$`).test(candidate);
}

/** manifest 结构校验（fail-closed；非法即 throw，消息含修复路标）。 */
export function validateManifest(manifest, repoRoot) {
  if (manifest === null || typeof manifest !== "object") {
    throw new Error("manifest 非法：需对象形态");
  }
  if (manifest.manifest_version !== 1) {
    throw new Error(
      `manifest_version 必须为 1，实际 ${JSON.stringify(manifest.manifest_version)}`,
    );
  }
  if (manifest.suites === null || typeof manifest.suites !== "object" ||
      Object.keys(manifest.suites).length === 0) {
    throw new Error("manifest.suites 非法：需非空对象（suite 名 → {title, spec, eval_command}）");
  }
  for (const [id, def] of Object.entries(manifest.suites)) {
    if (def === null || typeof def !== "object" ||
        typeof def.spec !== "string" || def.spec.length === 0) {
      throw new Error(`manifest.suites.${id} 非法：缺 spec（相对仓库根的 vitest 入口路径）`);
    }
    if (!existsSync(join(repoRoot, def.spec))) {
      throw new Error(
        `manifest.suites.${id}.spec 指向不存在的文件（repoRoot=${repoRoot}）：${def.spec}`,
      );
    }
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("manifest.sources 非法：需非空数组（五类触发源映射）");
  }
  const seenCategories = new Set();
  for (const source of manifest.sources) {
    if (source === null || typeof source !== "object") {
      throw new Error("manifest.sources[] 非法：需对象");
    }
    const category = source.category;
    if (!TRIGGER_CATEGORIES.includes(category)) {
      throw new Error(
        `触发源类别 "${String(category)}" 不在 PRD §94.3 五类闭表（${TRIGGER_CATEGORIES.join(" / ")}）——不发明额外触发源`,
      );
    }
    if (seenCategories.has(category)) {
      throw new Error(`触发源类别重复："${category}"（每类恰一条 manifest 条目）`);
    }
    seenCategories.add(category);
    if (!Array.isArray(source.patterns) || source.patterns.length === 0 ||
        source.patterns.some((p) => typeof p !== "string" || p.length === 0)) {
      throw new Error(`manifest.sources[${category}].patterns 非法：需非空字符串数组`);
    }
    for (const pattern of source.patterns) {
      // 反拼写错误守卫：静态前缀（首个通配符之前的部分）必须在盘上存在。
      const wildcardAt = pattern.search(/[*]/);
      const staticPrefix = wildcardAt >= 0 ? pattern.slice(0, wildcardAt) : pattern;
      const baseDir =
        staticPrefix.includes("/") && wildcardAt >= 0
          ? staticPrefix.slice(0, staticPrefix.lastIndexOf("/"))
          : wildcardAt >= 0
            ? ""
            : staticPrefix;
      if (wildcardAt >= 0) {
        const dir = baseDir === "" ? repoRoot : join(repoRoot, baseDir);
        if (!existsSync(dir)) {
          throw new Error(
            `manifest.sources[${category}] pattern 静态前缀不存在：${pattern}（${dir}）`,
          );
        }
      } else if (!existsSync(join(repoRoot, pattern))) {
        throw new Error(
          `manifest.sources[${category}] pattern 指向不存在的路径：${pattern}（repoRoot=${repoRoot}）`,
        );
      }
    }
    if (!Array.isArray(source.suites) || source.suites.length === 0) {
      throw new Error(`manifest.sources[${category}].suites 非法：需非空数组`);
    }
    for (const suite of source.suites) {
      if (!(suite in manifest.suites)) {
        throw new Error(
          `manifest.sources[${category}] 引用未知 suite "${String(suite)}"（suites 注册表：${Object.keys(manifest.suites).join(" / ")}）`,
        );
      }
    }
  }
  return manifest;
}

/** 读 + 校验 manifest；repoRoot = manifest 所在目录上溯两级（tests/behavioral/ → 仓库根）。 */
export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`触发清单不存在：${manifestPath}（用 --manifest 指定或先落档 trigger-manifest.json）`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`触发清单不可解析（JSON）：${String(error)}`);
  }
  const repoRoot = resolve(dirname(manifestPath), "..", "..");
  return { manifest: validateManifest(parsed, repoRoot), repoRoot };
}

/**
 * 触达源 × manifest 匹配（纯函数）。路径先归一 posix（git 输出恒 posix；--paths 在
 * Windows 可能带反斜杠）。返回逐类别命中（含 path×pattern 证据）与去重后 suite 清单。
 */
export function matchManifest(manifest, touchedPaths) {
  const touched = [...new Set(touchedPaths.map(toPosix))];
  const triggered = [];
  const suites = [];
  for (const source of manifest.sources) {
    const matched = [];
    for (const path of touched) {
      for (const pattern of source.patterns) {
        if (pathMatchesPattern(pattern, path)) {
          matched.push({ path, pattern });
          break;
        }
      }
    }
    if (matched.length > 0) {
      triggered.push({ category: source.category, matched, suites: source.suites });
      for (const suite of source.suites) {
        if (!suites.includes(suite)) suites.push(suite);
      }
    }
  }
  return { triggered, suites };
}

/** vitest 入口定位（ratchet.mjs 同款：require.resolve 优先，node_modules 直连兜底）。 */
function resolveVitestEntry(repoRoot) {
  try {
    const require = createRequire(join(repoRoot, "package.json"));
    const entry = require.resolve("vitest/vitest.mjs");
    if (existsSync(entry)) return entry;
  } catch {
    // 落兜底
  }
  const fallback = join(repoRoot, "node_modules", "vitest", "vitest.mjs");
  return existsSync(fallback) ? fallback : null;
}

/** 单 suite 的执行 argv（process.execPath 直连 vitest.mjs——Windows 无 .cmd/shell 依赖）。 */
export function suiteRunCommand(repoRoot, suiteDef) {
  const vitestEntry = resolveVitestEntry(repoRoot);
  if (vitestEntry === null) {
    throw new Error(
      `找不到 vitest 入口（${join(repoRoot, "node_modules", "vitest", "vitest.mjs")}）——请先 corepack pnpm install`,
    );
  }
  return [process.execPath, vitestEntry, "run", join(repoRoot, suiteDef.spec)];
}

function parseArgs(argv) {
  const opts = {
    base: "HEAD",
    manifest: DEFAULT_MANIFEST_PATH,
    paths: [],
    run: false,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") {
      opts.base = argv[(i += 1)];
      if (opts.base === undefined) fail("--base 需要一个 git ref 参数");
    } else if (arg === "--manifest") {
      opts.manifest = argv[(i += 1)];
      if (opts.manifest === undefined) fail("--manifest 需要一个路径参数");
    } else if (arg === "--paths") {
      const value = argv[(i += 1)];
      if (value === undefined) fail("--paths 需要逗号分隔路径参数");
      opts.paths.push(...value.split(",").filter((p) => p.length > 0));
    } else if (arg === "--run") {
      opts.run = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else {
      fail(`未知参数：${arg}（支持 --base/--manifest/--paths/--run/--dry-run/--json）`);
    }
  }
  return opts;
}

function gitChangedPaths(base) {
  const res = spawnSync("git", ["diff", "--name-only", base], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    const detail = res.error ? res.error.message : `${res.stderr ?? ""}`.trim();
    fail(
      `git diff 不可用（base=${base}）：${detail}\n  hint: 在 git 仓库内运行，或用 --paths 显式给定触达源（CI 场景先 checkout 足够深度取 base ref）。`,
    );
  }
  return `${res.stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let manifest;
  let repoRoot;
  try {
    ({ manifest, repoRoot } = loadManifest(resolve(opts.manifest)));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const detection = opts.paths.length > 0 ? "paths" : "git";
  const touched = opts.paths.length > 0 ? opts.paths.map(toPosix) : gitChangedPaths(opts.base);
  const { triggered, suites } = matchManifest(manifest, touched);

  // --run 前置校验：suite 执行命令可构造（fail-closed，绝不带着坏命令开跑）。
  let commands = null;
  if (opts.run || opts.dryRun) {
    try {
      commands = suites.map((suite) => ({
        suite,
        command: suiteRunCommand(repoRoot, manifest.suites[suite]),
      }));
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  if (opts.json) {
    const payload = {
      ok: true,
      manifest: resolve(opts.manifest),
      detection,
      base: detection === "git" ? opts.base : null,
      touched,
      touched_count: touched.length,
      triggered,
      suites,
    };
    if (commands !== null) {
      payload.run = {
        dry_run: opts.dryRun,
        commands: commands.map((c) => ({ suite: c.suite, argv: c.command })),
      };
    }
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      `[eval-trigger] 触达源 ${touched.length} 个（detection=${detection}${detection === "git" ? `, base=${opts.base}` : ""}）`,
    );
    if (triggered.length === 0) {
      console.log("[eval-trigger] 未触达任何 §94.3 触发源——无需 behavioral eval。");
    } else {
      for (const t of triggered) {
        console.log(
          `[eval-trigger] 触发 ${t.category} → suites [${t.suites.join(", ")}]（${t.matched
            .map((m) => `${m.path} ↔ ${m.pattern}`)
            .join("; ")}）`,
        );
      }
      console.log(`[eval-trigger] 需跑 suite：${suites.join(", ")}`);
      for (const c of commands ?? []) {
        console.log(`[eval-trigger] ${opts.dryRun ? "(dry-run) " : ""}run ${c.suite}: ${c.command.map((a) => a.includes(" ") ? JSON.stringify(a) : a).join(" ")}`);
      }
      if (commands === null) {
        console.log(
          "[eval-trigger] 执行：pomaster eval --suite behavioral（或本脚本 --run）",
        );
      }
    }
  }

  if (opts.run && !opts.dryRun) {
    for (const c of commands) {
      console.log(`[eval-trigger] run ${c.suite} …`);
      const res = spawnSync(c.command[0], c.command.slice(1), {
        cwd: repoRoot,
        stdio: "inherit",
      });
      if (res.error || res.status !== 0) {
        const code = res.status ?? 1;
        console.error(`[eval-trigger] FAIL: suite ${c.suite} 退出码 ${code}（fail-closed 链终止）`);
        process.exit(code);
      }
    }
    console.log(`[eval-trigger] ok: ${suites.length} suite 全绿。`);
  }
}

// 供测试直接导入纯函数；直接执行时跑 main。
const isDirectRun =
  process.argv[1] !== undefined &&
  toPosix(resolve(process.argv[1])) === toPosix(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main();
}
