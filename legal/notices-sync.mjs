#!/usr/bin/env node
/**
 * notices-sync.mjs —— legal/THIRD_PARTY_NOTICES.md 再生器（09-07 R1：notices 工具化，
 * 根治「lockfile 变更 = 手补 §B」漂移）。
 *
 * 职责分离（本脚本管「写对」，verify_notices.mjs 管「没写错」）：
 *   - 输入 = pnpm-lock.yaml（importers + packages + snapshots 全节）+ node_modules/.pnpm
 *     实际安装态（零网络；B4 走生成前固化的 seed 表，seed 由 `--fetch-b4` 对照
 *     `npm view <pkg>@<ver> license` 刷新——网络只在显式刷新时使用）。
 *   - 每包一行：包名/版本/license id/证据等级（B1 本地打开 LICENSE 词形核对；
 *     B2 无 LICENSE 文件取 package.json license 字段；B3 平台二进制（lockfile
 *     os/cpu 受限包）不设 B1 路径锚、id 按同族锚点外推；B4 未装且无同族锚点取
 *     registry 元数据）/路径。
 *   - 只动标记区间（`<!-- notices-sync:begin:ID -->` … `end:ID`）：§0 锚点/依赖面/
 *     方法/等级定义、license id 分布表、§A/§B 两节。区间外的手写段（状态行、
 *     许可策略声明、§2/§3/§4、附录）逐字保留——幂等可重放，双跑 diff 空。
 *
 * 与 verify_notices.mjs 的单源关系：
 *   - LICENSE_WORD_FORMS 在此定义并导出，verify_notices.mjs import 本表——
 *     词形表双向同步责任 = 只改本文件（verify 侧无副本）。
 *   - enumerateLockfilePackages 在此导出，verify 用它做「清单行数 = lockfile 包数 +
 *     集合相等」交叉校验——包集枚举单一事实源同在此文件。
 *
 * 用法：
 *   node legal/notices-sync.mjs            # 再生 THIRD_PARTY_NOTICES.md（原地写）
 *   node legal/notices-sync.mjs --check    # 只校验不写盘；漂移则 exit 1（可挂 CI）
 *   node legal/notices-sync.mjs --fetch-b4 # 打印缺失 B4 包的 npm view license 结果
 *
 * 退出码：0 = 成功；1 = 校验失配/漂移/待人工介入（未知 B4 包等）；2 = 文件形态错误。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");
const NOTICES_PATH = join(HERE, "THIRD_PARTY_NOTICES.md");
const LOCK_PATH = join(REPO_ROOT, "pnpm-lock.yaml");

const require_ = createRequire(import.meta.url);
const yaml = require_("js-yaml");

function fail(msg, code = 1) {
  process.stderr.write(`[notices-sync] ${msg}\n`);
  process.exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// license id 词形表（单一事实源——verify_notices.mjs import 本导出）。
// 语义：id → 文件正文必须命中的词形（命中任一即可；表外 id 退化核对 id 本身）。
// 新增 id 时：本表加一行即可（检测序按 SPECIFIC_ORDER 语义分组，BSD 系走二分消歧）。
// ─────────────────────────────────────────────────────────────────────────────
export const LICENSE_WORD_FORMS = {
  MIT: ["MIT License", "Permission is hereby granted"],
  "Apache-2.0": ["Apache License"],
  ISC: ["ISC License", "The ISC License", "Permission to use, copy, modify"],
  "0BSD": ["Permission to use, copy, modify"],
  "BSD-2-Clause": ["Redistribution and use"],
  "BSD-3-Clause": ["Redistribution and use"],
  "Python-2.0": ["PYTHON SOFTWARE FOUNDATION LICENSE"],
  "BlueOak-1.0.0": ["Blue Oak"],
  "MPL-2.0": ["Mozilla Public License"],
  "CC0-1.0": ["CC0 1.0", "creativecommons.org/publicdomain"],
  "CC-BY-4.0": ["Attribution 4.0 International"],
};

/** 置换序检测（独特词形优先；BSD-2/3 同词形走第三条款消歧；0BSD/ISC 同词形由
 * manifest 字段优先消歧）。表内顺序即检测序。 */
const DETECT_ORDER = [
  "Python-2.0",
  "BlueOak-1.0.0",
  "MPL-2.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "Apache-2.0",
  "0BSD",
  "ISC",
  "MIT",
  "BSD-3-Clause",
  "BSD-2-Clause",
];

/** 强 copyleft 家族（出现即硬失败——清单语义变更需 Owner 桌面复核，禁静默入表）。 */
const STRONG_COPYLEFT = ["GPL", "LGPL", "AGPL", "SSPL", "EPL"];

/** 文件正文 → 候选 id 集合（BSD-2/3 由背书条款消歧为恰好一个）。 */
export function detectLicenseIds(text) {
  const hits = DETECT_ORDER.filter((id) =>
    (LICENSE_WORD_FORMS[id] ?? [id]).some((f) => text.includes(f)),
  );
  const hasBsd = hits.includes("BSD-2-Clause") || hits.includes("BSD-3-Clause");
  if (!hasBsd) return hits;
  const bsd = /neither the name|endorse or promote/i.test(text)
    ? "BSD-3-Clause"
    : "BSD-2-Clause";
  return [...hits.filter((h) => h !== "BSD-2-Clause" && h !== "BSD-3-Clause"), bsd];
}

/** package.json license 字段 → SPDX 候选数组（兼容 "(A OR B)" 与 {type} 对象形态）。 */
export function manifestLicenseIds(field) {
  if (typeof field === "string") {
    return field
      .trim()
      .replace(/^\((.*)\)$/, "$1")
      .split(/\s+OR\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (field && typeof field === "object" && typeof field.type === "string") {
    return [field.type];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// lockfile 枚举（单一事实源——verify_notices.mjs import 本导出做交叉校验）。
// lockfileVersion 9.0 布局：packages: 键 = name@version（元数据，含 os/cpu）；
// snapshots: 键 = name@version(peer 后缀)（依赖图）。行身份 = name@version 去重。
// ─────────────────────────────────────────────────────────────────────────────
export function parsePkgKey(key) {
  const i = key.lastIndexOf("@");
  if (i <= 0) throw new Error(`无法解析 lockfile 包键：${key}`);
  return { name: key.slice(0, i), version: key.slice(i + 1) };
}

export function loadLockfile(lockPath = LOCK_PATH) {
  const lock = yaml.load(readFileSync(lockPath, "utf8"));
  if (lock?.lockfileVersion !== "9.0") {
    fail(`不支持的 lockfileVersion：${lock?.lockfileVersion}（锚口径 = 9.0，升级需同步本脚本与 verify）`, 2);
  }
  return lock;
}

/** lockfile 全包集（name@version 升序，字节序）——§A+§B 覆盖面的权威分母。 */
export function enumerateLockfilePackages(lock = loadLockfile()) {
  return Object.keys(lock.packages)
    .map(parsePkgKey)
    .sort((a, b) => (a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1));
}

/** workspace 各包 runtime dependencies（非 workspace link）的传递闭包 → name@version 集合。 */
export function runtimeClosure(lock) {
  const roots = [];
  for (const [imp, entry] of Object.entries(lock.importers ?? {})) {
    if (imp === ".") continue;
    for (const [name, spec] of Object.entries(entry.dependencies ?? {})) {
      if (String(spec.version).startsWith("link:")) continue;
      roots.push(`${name}@${spec.version}`);
    }
  }
  const out = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const key = stack.pop();
    const { name, version } = parsePkgKey(key);
    const nv = `${name}@${version}`;
    if (out.has(nv)) continue;
    if (!lock.snapshots[key]) fail(`snapshot 缺席：${key}（lockfile 自身不一致）`, 2);
    out.add(nv);
    for (const section of ["dependencies", "optionalDependencies"]) {
      for (const [n, v] of Object.entries(lock.snapshots[key][section] ?? {})) {
        stack.push(`${n}@${v}`);
      }
    }
  }
  return out;
}

function importerDevRoots(lock, importer) {
  return Object.keys(lock.importers?.[importer]?.devDependencies ?? {}).sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// B3 同族锚点：平台二进制包名前缀 → 同族主包（须在 lockfile 内且已本地核对 B1/B2）。
// 新平台家族出现时：在此加前缀映射；主包缺席则该家族成员全部落 B4（--fetch-b4 刷新）。
// ─────────────────────────────────────────────────────────────────────────────
const FAMILY_MAIN = [
  ["@esbuild/", "esbuild"],
  ["@rollup/rollup-", "rollup"],
  ["lightningcss-", "lightningcss"],
  ["@oxc-parser/binding-", "oxc-parser"],
  ["@oxc-resolver/binding-", "oxc-resolver"],
  ["@rolldown/binding-", "rolldown"],
];

/** B4 seed：未安装且无同族锚点的包 → registry license id。
 * 刷新方式：`node legal/notices-sync.mjs --fetch-b4`（npm view 实抓）后把结果贴回本表。 */
const B4_SEED = {
  "fsevents@2.3.3": "MIT",
  "@napi-rs/lzma-linux-x64-gnu@1.5.1": "MIT",
  "@napi-rs/wasm-runtime@1.2.3": "MIT",
  "@tybys/wasm-util@0.10.3": "MIT",
  "@emnapi/core@1.9.2": "MIT",
  "@emnapi/core@1.11.0": "MIT",
  "@emnapi/runtime@1.9.2": "MIT",
  "@emnapi/runtime@1.11.0": "MIT",
  "@emnapi/wasi-threads@1.2.2": "MIT",
  "@emnapi/wasi-threads@1.2.1": "MIT",
};

const LICENSE_FILE_RE = /^licen[cs]e([.\-_ ]|$)/i;

function locatePnpmDir(name, version, pnpmDirs) {
  const prefix = `${name.replace("/", "+")}@${version}`;
  const matches = pnpmDirs.filter((d) => d === prefix || d.startsWith(`${prefix}_`));
  if (matches.length === 0) return null;
  return matches.sort()[0]; // 多 peer 变体取字典序第一——license 文件同 tarball，任意变体等价
}

/** 单包定级。返回 {name, version, id, grade, path, familyMain?}。 */
function classifyPackage(name, version, lock, pnpmDirs) {
  const meta = lock.packages[`${name}@${version}`] ?? {};
  const platformRestricted = Array.isArray(meta.os) || Array.isArray(meta.cpu);
  const dir = locatePnpmDir(name, version, pnpmDirs);

  if (dir !== null) {
    const pkgDir = join(REPO_ROOT, "node_modules", ".pnpm", dir, "node_modules", name);
    let manifest = {};
    try {
      manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    } catch {
      fail(`package.json 不可读：${name}@${version}（${pkgDir}）`, 2);
    }
    const manifestIds = manifestLicenseIds(manifest.license);
    let licFile = null;
    try {
      const candidates = readdirSync(pkgDir)
        .filter((e) => LICENSE_FILE_RE.test(e))
        .sort();
      licFile = candidates[0] ?? null;
    } catch {
      fail(`包目录不可读：${name}@${version}（${pkgDir}）`, 2);
    }

    if (licFile !== null) {
      const text = readFileSync(join(pkgDir, licFile), "utf8");
      const detected = detectLicenseIds(text);
      const confirmed = manifestIds.filter((x) => detected.includes(x));
      let id;
      if (detected.length === 0) {
        fail(
          `B1 检测失败：${name}@${version} 的 ${licFile} 无词形命中（manifest license=${JSON.stringify(manifest.license)}）——词形表需增补或包需人工核对`,
        );
      }
      if (confirmed.length > 0) id = confirmed[0];
      else if (detected.length === 1) {
        id = detected[0];
        process.stderr.write(
          `[notices-sync] 注意：${name}@${version} 文件判定 ${id} ≠ manifest license=${JSON.stringify(manifest.license)}——按文件正文入表（B1 以文件为准）\n`,
        );
      } else {
        fail(
          `B1 检测歧义：${name}@${version} 命中 ${detected.join(" / ")} 且 manifest（${JSON.stringify(manifest.license)}）无一在列——人工裁定`,
        );
      }
      // 平台受限包不设 B1 路径锚（其他平台 CI 无此文件，verify 跨平台不可移植）——
      // id 已本地核对，按 B3 入表。
      if (platformRestricted) {
        return { name, version, id, grade: "B3", path: "(未安装)", familyMain: `${name}@${version}` };
      }
      const rel = `node_modules/.pnpm/${dir}/node_modules/${name}/${licFile}`.replaceAll("\\", "/");
      return { name, version, id, grade: "B1", path: rel };
    }

    // 无 LICENSE 文件 → B2（id 取 manifest license 字段）。
    if (manifestIds.length === 0 || manifestIds[0] === "UNKNOWN") {
      fail(`B2 检测失败：${name}@${version} 包内无 LICENSE 文件且 manifest license 缺失/非词形`, );
    }
    return { name, version, id: manifestIds[0], grade: "B2", path: "（包内无 LICENSE 文件）" };
  }

  // 未安装：B3（同族锚点）或 B4（registry seed）。
  if (platformRestricted) {
    const family = FAMILY_MAIN.find(([prefix]) => name.startsWith(prefix));
    if (family !== undefined) {
      return { name, version, id: null, grade: "B3-NEEDS-ANCHOR", path: "(未安装)", familyMain: family[1] };
    }
    // 平台受限但无同族映射（如 fsevents / @napi-rs/lzma-*）——落 B4 registry seed。
  }
  const seed = B4_SEED[`${name}@${version}`];
  if (seed === undefined) {
    fail(
      `B4 无 seed：${name}@${version}（未安装且不在同族映射/B4 seed 表）——先跑 \`node legal/notices-sync.mjs --fetch-b4\` 并把结果固化进 B4_SEED`,
    );
  }
  return { name, version, id: seed, grade: "B4", path: "(未安装)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 文档再生
// ─────────────────────────────────────────────────────────────────────────────
const GRADE_ORDER = { B1: 0, B3: 1, B4: 2, B2: 3 };
const GRADE_MARKER = { B1: "", B2: "†", B3: "*", B4: "**" };

function rowLine(r) {
  return `| ${r.name} | ${r.version} | ${r.id}${GRADE_MARKER[r.grade]} | ${r.path} | ${r.grade} |`;
}

function shortName(pkgName, version, allRows) {
  const multi = allRows.filter((r) => r.name === pkgName).length > 1;
  return multi ? `${pkgName}@${version}` : pkgName;
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function buildRegions(lock, rows) {
  const closure = runtimeClosure(lock);
  const secA = rows.filter((r) => closure.has(`${r.name}@${r.version}`));
  const secB = rows.filter((r) => !closure.has(`${r.name}@${r.version}`));
  const sortRows = (list) =>
    [...list].sort((a, b) => (a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1));

  // —— §0 锚点。
  const dirty = git(["status", "--porcelain", "--", "pnpm-lock.yaml"]);
  if (dirty.length > 0) fail("pnpm-lock.yaml 有未提交变更——锚 commit 会立刻失真，先提交 lockfile 再再生清单");
  const lockCommit = git(["log", "-1", "--format=%H", "--", "pnpm-lock.yaml"]);
  const lockSha = createHash("sha256").update(readFileSync(LOCK_PATH)).digest("hex");
  const anchor = [
    `- **版本锚**：本清单以仓库内 \`pnpm-lock.yaml\`（lockfileVersion 9.0）为唯一锚点；该 lockfile 最后变更于 commit \`${lockCommit}\`；lockfile 内容指纹 sha256 = \`${lockSha}\`。本清单不写墙钟生成日期、不写仓库 HEAD（HEAD 随无关提交漂移，不可作锚）——刷新口径 = 「以 pnpm-lock.yaml 对应 commit + 内容指纹为锚」。`,
  ].join("\n");

  // —— §0 依赖面。
  const total = rows.length;
  const depFace = [
    `- **依赖面**：lockfile \`packages:\` 节共 **${total} 个第三方包**（name@version 去重；peer 多变体同包只记一行），按用途拆两节：`,
    `  - **§A 运行时依赖**（workspace 各包 \`dependencies\` 的非 workspace 传递闭包）：**${secA.length} 个**。`,
    `  - **§B 开发工具链依赖**（其余全部：root / studio / studio-react devDependencies 闭包）：**${secB.length} 个**。`,
    `  - **分发口径 pending**：对外分发时 §A 必然构成第三方 notice 义务；§B 是否随分发触发 notice 义务取决于分发形态（源码仓库分发 / 产物分发），归 License Decision Gate 裁定。两节都先列全。`,
  ].join("\n");

  // —— §0 事实源方法。
  const nb34 = rows.filter((r) => r.grade === "B3" || r.grade === "B4").length;
  const method = [
    `- **事实源方法**：对 lockfile 内每个包，在本机 \`node_modules/.pnpm/\` 实际打开其 LICENSE 文件核对 license id（不凭记忆）。未在本机安装的 ${nb34} 个平台二进制/可选包按证据等级 B3/B4 显式标注，绝不混充本地核对。`,
  ].join("\n");

  // —— §0 证据等级定义（B1/B2 行为静态模板；B3/B4 携带本轮实际锚点数据）。
  const familyDescs = [];
  for (const [, mainName] of FAMILY_MAIN) {
    const mainRow = rows.find((r) => r.name === mainName && (r.grade === "B1" || r.grade === "B2"));
    if (mainRow !== undefined) {
      familyDescs.push(`${mainName} 家族锚点 ${mainRow.name}@${mainRow.version}（${mainRow.grade} ${mainRow.id}）`);
    }
  }
  const b4Rows = rows.filter((r) => r.grade === "B4");
  const b4Groups = new Map();
  for (const r of b4Rows) {
    if (!b4Groups.has(r.name)) b4Groups.set(r.name, new Set());
    b4Groups.get(r.name).add(r.version);
  }
  const b4Desc = [...b4Groups.entries()]
    .map(([n, vs]) => `\`${n}@{${[...vs].sort().join(",")}}\``)
    .join("、");
  const b4Id = b4Rows[0]?.id ?? "MIT";
  const grades = [
    "- **证据等级**：",
    "  - **B1** = 本地打开包内 LICENSE 文件，文件正文与 license id 一致。",
    "  - **B2** = 包内无 LICENSE 文件；license id 取自该包 `package.json` 的 `license` 字段（README 佐证逐包注明）。",
    `  - **B3** = 平台二进制包（lockfile \`os\`/\`cpu\` 受限包）不设 B1 路径锚——装与未装都不可跨平台逐包核对；license id 按同族已核对成员/主包 LICENSE 声明外推（本轮回：${familyDescs.join("；")}）。**非 B1 逐包路径锚。**`,
    `  - **B4** = 未安装且无同族锚点；license id 取自 npm registry 元数据（\`npm view <pkg>@<ver> license\`，本轮回 ${b4Desc} 均为 ${b4Id}）。**非本地文件核对。**`,
  ].join("\n");

  // —— license id 分布 + 净事实。
  const groups = new Map(); // key id+grade → {id, grade, rows[]}
  for (const r of rows) {
    const k = `${r.id} ${r.grade}`;
    if (!groups.has(k)) groups.set(k, { id: r.id, grade: r.grade, rows: [] });
    groups.get(k).rows.push(r);
  }
  const idTotals = new Map();
  for (const r of rows) idTotals.set(r.id, (idTotals.get(r.id) ?? 0) + 1);
  const GRADE_LABEL = { B1: "B1 本地核对", B3: "B3", B4: "B4", B2: "B2" };
  const distLines = [...groups.values()]
    .sort((a, b) => {
      const ta = idTotals.get(a.id);
      const tb = idTotals.get(b.id);
      if (tb !== ta) return tb - ta;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
    })
    .map((g) => {
      const suffix = g.grade === "B1" ? "" : g.grade === "B3" ? "（平台包家族外推）" : g.grade === "B4" ? "（registry 元数据）" : "（无 LICENSE 文件）";
      const n = g.rows.length;
      const nameHint = n === 1 ? `（${shortName(g.rows[0].name, g.rows[0].version, rows)}）` : "";
      return `| ${g.id}${suffix}${GRADE_MARKER[g.grade]} | ${n}${nameHint} | ${GRADE_LABEL[g.grade]} |`;
    });

  const strongHits = rows.filter((r) => STRONG_COPYLEFT.some((c) => r.id.toUpperCase().includes(c)));
  if (strongHits.length > 0) {
    fail(`强 copyleft 家族命中（${strongHits.map((r) => `${r.name}@${r.version}:${r.id}`).join("、")}）——清单语义变更，需 Owner 桌面复核后人工处理，禁静默入表`);
  }
  const mplRows = rows.filter((r) => r.id === "MPL-2.0");
  const netFact =
    mplRows.length === 0
      ? `**净事实**：本仓库依赖树（§A+§B）共 ${total} 包，**未检出任何 copyleft 家族许可证**（GPL/LGPL/AGPL/SSPL/EPL/MPL 零命中）；全部为宽松或公共域许可（MIT / ISC / 0BSD / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / CC0-1.0 / CC-BY-4.0 / BlueOak-1.0.0 / Python-2.0）。MIT/ISC/BSD/Apache 均要求保留版权与许可声明——本文件即该 notice 义务的载体。`
      : `**净事实**：本仓库依赖树（§A+§B）共 ${total} 包。**强 copyleft 家族（GPL/LGPL/AGPL/SSPL/EPL）零命中**；copyleft 家族仅命中 **MPL-2.0**（${mplRows.length} 包：${[...new Set(mplRows.map((r) => shortName(r.name, r.version, rows)))].sort().join("、")}——文件级弱 copyleft：以依赖形式原样引用不传染使用方源码；随源码仓库可见/产物分发时须保留 MPL 许可文本与文件级改动声明，收录范围归 §0 分发口径裁定）。其余全部为宽松或公共域许可（MIT / ISC / 0BSD / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / CC0-1.0 / CC-BY-4.0 / BlueOak-1.0.0 / Python-2.0）。MIT/ISC/BSD/Apache 均要求保留版权与许可声明——本文件即该 notice 义务的载体。`;
  const distribution = [
    `### license id 分布（${total} 包）`,
    "",
    "| id | 数量 | 标注 |",
    "|---|---|---|",
    ...distLines,
    "",
    netFact,
  ].join("\n");

  // —— §A。
  const rootDescs = [];
  for (const imp of Object.keys(lock.importers ?? {}).filter((i) => i !== ".").sort()) {
    const deps = Object.entries(lock.importers[imp].dependencies ?? {}).filter(
      ([, v]) => !String(v.version).startsWith("link:"),
    );
    rootDescs.push(
      deps.length === 0
        ? `${imp} →（无第三方运行时依赖）`
        : `${imp} → ${deps.map(([n]) => n).sort().join(" / ")}`,
    );
  }
  const sectionA = [
    `## §A 运行时依赖（${secA.length} 包）`,
    "",
    `构成：workspace 各包 \`dependencies\`（非 dev）的非 workspace 传递闭包——${rootDescs.join("；")}。`,
    "",
    "| 包名 | 版本 | license id | license 源文件路径（本仓库 node_modules 内） | 证据 |",
    "|---|---|---|---|---|",
    ...sortRows(secA).map(rowLine),
  ].join("\n");

  // —— §B。
  const sectionB = [
    `## §B 开发工具链依赖（${secB.length} 包）`,
    "",
    `构成：lockfile 其余全部包——root devDependencies 闭包（${importerDevRoots(lock, ".").join(" / ")}）+ packages/studio devDependencies 闭包（${importerDevRoots(lock, "packages/studio").join(" / ")}）+ packages/studio-react devDependencies 闭包（${importerDevRoots(lock, "packages/studio-react").join(" / ")}）。`,
    "",
    "| 包名 | 版本 | license id | license 源文件路径 | 证据 |",
    "|---|---|---|---|---|",
    ...sortRows(secB).map(rowLine),
  ].join("\n");

  return { anchor, "dep-face": depFace, method, grades, distribution, "section-a": sectionA, "section-b": sectionB };
}

const REGIONS = [
  "anchor",
  "dep-face",
  "method",
  "grades",
  "distribution",
  "section-a",
  "section-b",
];

function spliceRegions(raw, regions) {
  let out = raw;
  for (const id of REGIONS) {
    const re = new RegExp(`<!-- notices-sync:begin:${id} -->[\\s\\S]*?<!-- notices-sync:end:${id} -->`);
    if (!re.test(out)) {
      fail(`标记区间缺失：notices-sync:${id}——THIRD_PARTY_NOTICES.md 形态被破坏，先恢复区间标记`, 2);
    }
    out = out.replace(re, `<!-- notices-sync:begin:${id} -->\n${regions[id]}\n<!-- notices-sync:end:${id} -->`);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check");
  const fetchB4 = argv.includes("--fetch-b4");

  const lock = loadLockfile();
  const packages = enumerateLockfilePackages(lock);
  const pnpmDirs = existsSync(join(REPO_ROOT, "node_modules", ".pnpm"))
    ? readdirSync(join(REPO_ROOT, "node_modules", ".pnpm"))
    : fail("node_modules/.pnpm 缺席——先 pnpm install（B1/B2 事实源 = 本地安装态）", 2);

  const rows = packages.map(({ name, version }) => classifyPackage(name, version, lock, pnpmDirs));

  // —— B3 锚点消解（第二遍：主包行已在 rows 中定级）。
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  for (const r of rows) {
    if (r.grade !== "B3-NEEDS-ANCHOR") continue;
    const siblings = byName.get(r.familyMain ?? "") ?? [];
    const anchorRow = siblings.find((s) => s.grade === "B1" || s.grade === "B2");
    if (anchorRow === undefined) {
      fail(
        `B3 无锚点：${r.name}@${r.version} 的家族主包 ${r.familyMain ?? "?"} 未安装或未本地核对——若该家族确无主包，把它移出 FAMILY_MAIN 走 B4 seed`,
      );
    }
    r.id = anchorRow.id;
    r.grade = "B3";
  }

  if (fetchB4) {
    const missing = rows.filter((r) => r.grade === "B4" || r.grade === "B3-NEEDS-ANCHOR");
    // npm 是 .cmd shim（Windows execFileSync 直呼会 ENOENT）——经 node 直连 npm-cli.js。
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    for (const r of missing) {
      let lic = "?";
      try {
        lic = execFileSync(process.execPath, [npmCli, "view", `${r.name}@${r.version}`, "license"], {
          encoding: "utf8",
        }).trim();
      } catch {
        /* 保持 "?" */
      }
      process.stdout.write(`  "${r.name}@${r.version}": "${lic}",\n`);
    }
    return;
  }

  const regions = buildRegions(lock, rows);
  const raw = readFileSync(NOTICES_PATH, "utf8");
  const next = spliceRegions(raw, regions);
  const closure = runtimeClosure(lock);
  const nA = rows.filter((r) => closure.has(`${r.name}@${r.version}`)).length;
  if (next === raw) {
    process.stdout.write(`[notices-sync] 无变化——THIRD_PARTY_NOTICES.md 已与 lockfile（${rows.length} 包）一致\n`);
    return;
  }
  if (checkOnly) {
    fail(`--check 漂移：THIRD_PARTY_NOTICES.md 与 lockfile 再生结果不一致（${rows.length} 包口径）——运行 \`node legal/notices-sync.mjs\` 再生`, 1);
  }
  writeFileSync(NOTICES_PATH, next);
  process.stdout.write(
    `[notices-sync] 再生完成：§A ${nA} 包 + §B ${rows.length - nA} 包 = ${rows.length} 包（§0 锚点/分布/证据等级定义同步刷新）\n`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
