// npm 单包发布 staging 验证（Owner 裁决 10 配套；`scripts/build-npm-package.mjs` 之后跑）。
//
// 两道验证，全部可复跑：
// 1) `npm pack --dry-run` 断言：bin 在座 / catalog 完整（与仓库 catalog 文件集全等 +
//    lock 100 entries）/ 无 node_modules / 无 files 白名单外杂物 / 零 dependencies；
// 2) fresh-install 冒烟：真实 `npm pack` 出 tgz → 系统 temp `pvnext-npm-smoke-<pid>`
//    目录 `npm init -y` + `npm install <tgz>`（零 dependencies，不联网装依赖）→
//    依次实跑 `npx pomaster --help|init|status|catalog status|doctor`，断言退出码与
//    关键词形。关键断言：catalog status 的 catalog_root 命中
//    node_modules/pomaster/catalog（resolveCatalogRoot 候选链的包内资产候选，
//    ok:true 且 100 entries 0 drift）。
//
// 冒烟产物（tgz 与 smoke 目录）留系统 temp 并在末尾打印路径，不进仓库
// （stage/ 已在 .gitignore；temp 目录由操作系统清理策略兜底）。
//
// 纪律：本脚本零发布动作（npm publish 由 Owner 主控执行）；npm install 只装本地 tgz。
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const p = (...parts) => join(repoRoot, ...parts);

const STAGE_PKG = p("stage", "pomaster");
const SMOKE_DIR = join(tmpdir(), `pvnext-npm-smoke-${process.pid}`);

/** 断言收集器：全部跑完一次性裁决（不 fail-fast，问题一次看全）。 */
const failures = [];
function assert(condition, label, detail = "") {
  const status = condition ? "ok" : "FAIL";
  console.log(`  [${status}] ${label}${condition || !detail ? "" : `\n         ${detail}`}`);
  if (!condition) failures.push(label);
}

function run(cmd, options = {}) {
  const res = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return { ...res, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function walkFiles(dir, relativeTo = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, relativeTo));
    else out.push(full.slice(relativeTo.length + 1).split(sep).join("/"));
  }
  return out.sort();
}

// ============================================================
// 前置：staging 在座
// ============================================================

if (!existsSync(join(STAGE_PKG, "dist", "bin.js")) || !existsSync(join(STAGE_PKG, "package.json"))) {
  console.error(`[verify-npm-package] FAIL: staging 不在座（${STAGE_PKG}）；先跑 scripts/build-npm-package.mjs。`);
  process.exit(1);
}

// ============================================================
// 1) npm pack --dry-run（不联网）
// ============================================================

console.log("[verify-npm-package] 1) npm pack --dry-run 断言");
const packDry = run("npm pack --dry-run --json --loglevel=error", { cwd: STAGE_PKG });
if (packDry.status !== 0) {
  console.error(`npm pack --dry-run 失败（exit ${packDry.status}）:\n${packDry.stdout}${packDry.stderr}`);
  process.exit(1);
}
const packReport = JSON.parse(packDry.stdout)[0];
const packedPaths = packReport.files.map((file) => file.path.replace(/\\/g, "/"));

// 1.1 bin 在座。
assert(packedPaths.includes("dist/bin.js"), "bin 在座（dist/bin.js）");

// 1.2 catalog 完整：打包文件集与仓库 catalog/ 全等 + lock 100 entries。
const repoCatalogFiles = walkFiles(p("catalog")).map((file) => `catalog/${file}`);
const packedCatalogFiles = packedPaths.filter((file) => file.startsWith("catalog/"));
const repoSet = new Set(repoCatalogFiles);
const packedSet = new Set(packedCatalogFiles);
const missingInPack = [...repoSet].filter((file) => !packedSet.has(file));
const extraInPack = [...packedSet].filter((file) => !repoSet.has(file));
assert(
  missingInPack.length === 0 && extraInPack.length === 0,
  `catalog 完整（打包 ${packedCatalogFiles.length} == 仓库 ${repoCatalogFiles.length} 文件）`,
  `missing: ${missingInPack.join(", ")} | extra: ${extraInPack.join(", ")}`,
);
const stageLock = JSON.parse(
  readFileSync(join(STAGE_PKG, "catalog", "catalog-lock.draft.json"), "utf8"),
);
assert(stageLock.entries.length === 100, "catalog-lock 100 entries", `实为 ${stageLock.entries.length}`);

// 1.3 无 node_modules。
const nodeModulesLeak = packedPaths.filter((file) => file.split("/").includes("node_modules"));
assert(nodeModulesLeak.length === 0, "tarball 无 node_modules", nodeModulesLeak.join(", "));

// 1.4 无白名单外杂物（npm 恒含 package.json；bin 路径随 files 白名单进包）。
const allowedExact = new Set([
  "package.json",
  "dist/bin.js",
  "README.md",
  "LICENSE",
  "COMMERCIAL_LICENSE.md",
  "TRADEMARKS.md",
  "SECURITY.md",
  "legal/THIRD_PARTY_NOTICES.md",
]);
const strays = packedPaths.filter(
  (file) => !allowedExact.has(file) && !file.startsWith("catalog/"),
);
assert(strays.length === 0, "无白名单外杂物", strays.join(", "));

// 1.5 零 dependencies + 可发布形态（Owner 裁决 10）。
const stageManifest = JSON.parse(readFileSync(join(STAGE_PKG, "package.json"), "utf8"));
const forbiddenFields = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];
const presentForbidden = forbiddenFields.filter((field) => stageManifest[field] !== undefined);
assert(presentForbidden.length === 0, "零 dependencies（四字段全缺席）", presentForbidden.join(", "));
assert(stageManifest.private === undefined, "private 不设（缺省可发布）");
assert(stageManifest.name === "pomaster" && stageManifest.version === "0.1.0", "name/version = pomaster@0.1.0");
assert(stageManifest.license === "PolyForm-Noncommercial-1.0.0", "license = PolyForm-Noncommercial-1.0.0");
assert(stageManifest.bin?.pomaster === "dist/bin.js", "bin.pomaster = dist/bin.js");
assert(stageManifest.engines?.node === ">=22", "engines.node = >=22");

// ============================================================
// 2) fresh-install 冒烟（系统 temp，不进仓库）
// ============================================================

console.log("[verify-npm-package] 2) fresh-install 冒烟");
rmSync(SMOKE_DIR, { recursive: true, force: true });
mkdirSync(SMOKE_DIR, { recursive: true });

const packReal = run(`npm pack --pack-destination "${SMOKE_DIR.split(sep).join("/")}" --loglevel=error`, {
  cwd: STAGE_PKG,
});
if (packReal.status !== 0) {
  console.error(`npm pack 失败（exit ${packReal.status}）:\n${packReal.stdout}${packReal.stderr}`);
  process.exit(1);
}
const tgzPath = join(SMOKE_DIR, "pomaster-0.1.0.tgz");
if (!existsSync(tgzPath)) {
  console.error(`npm pack 未产出预期 tgz: ${tgzPath}`);
  process.exit(1);
}

const initRun = run("npm init -y", { cwd: SMOKE_DIR });
if (initRun.status !== 0) {
  console.error(`npm init -y 失败:\n${initRun.stdout}${initRun.stderr}`);
  process.exit(1);
}
const installRun = run(`npm install "${tgzPath.split(sep).join("/")}" --no-audit --no-fund --loglevel=error`, {
  cwd: SMOKE_DIR,
});
if (installRun.status !== 0) {
  console.error(`npm install tgz 失败:\n${installRun.stdout}${installRun.stderr}`);
  process.exit(1);
}
assert(
  existsSync(join(SMOKE_DIR, "node_modules", "pomaster", "dist", "bin.js")) &&
    existsSync(join(SMOKE_DIR, "node_modules", "pomaster", "catalog", "catalog-lock.draft.json")),
  "安装布局在座（node_modules/pomaster/{dist/bin.js,catalog/}）",
);
const installedPackages = readdirSync(join(SMOKE_DIR, "node_modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== ".bin")
  .map((entry) => entry.name);
assert(
  installedPackages.length === 1 && installedPackages[0] === "pomaster",
  "node_modules 仅含 pomaster 本包（零 dependencies 实证）",
  installedPackages.join(", "),
);

/** 冒烟命令统一跑法 + 退出码/词形断言呈现。 */
function smoke(label, argv, { expectExit, expectWords, json = false } = {}) {
  const res = run(`npx ${argv}`, { cwd: SMOKE_DIR });
  const exitOk = expectExit.includes(res.status);
  assert(exitOk, `${label} → exit ${res.status}（允许 ${expectExit.join("/")}）`);
  if (expectWords !== undefined) {
    assert(
      expectWords.every((word) => res.stdout.includes(word)),
      `${label} 关键词形在座`,
      expectWords.filter((word) => !res.stdout.includes(word)).join(", "),
    );
  }
  return json ? JSON.parse(res.stdout) : res;
}

// 2.1 `npx pomaster --help`。
smoke("npx pomaster --help", "pomaster --help", {
  expectExit: [0],
  expectWords: ["Usage: pomaster"],
});

// 2.2 `npx pomaster init`：四产物落盘（truth-index / authority / config.yaml / AGENTS.md）。
smoke("npx pomaster init", "pomaster init", { expectExit: [0] });
for (const artifact of [
  join(".pomaster", "state", "truth-index.json"),
  join(".pomaster", "state", "authority.json"),
  join(".pomaster", "config.yaml"),
  "AGENTS.md",
  "CLAUDE.md",
]) {
  assert(existsSync(join(SMOKE_DIR, artifact)), `init 产物落盘: ${artifact}`);
}

// 2.3 `npx pomaster status`。
smoke("npx pomaster status", "pomaster status", {
  expectExit: [0],
  expectWords: ["status: .pomaster/state/truth-index.json (seq="],
});

// 2.4 `npx pomaster catalog status --json`（关键：包内资产候选命中 + 100 entries 0 drift）。
const catalogEnvelope = smoke("npx pomaster catalog status --json", "pomaster catalog status --json", {
  expectExit: [0],
  json: true,
});
assert(catalogEnvelope.ok === true, "catalog status 信封 ok:true");
assert(
  catalogEnvelope.result?.entries_total === 100,
  `catalog entries = 100（实为 ${catalogEnvelope.result?.entries_total}）`,
);
assert(
  catalogEnvelope.result?.lock_verification?.ok === true &&
    (catalogEnvelope.result?.lock_verification?.drifts ?? []).length === 0,
  "catalog-lock 校验 ok:true 且 0 drift",
);
const catalogRoot = String(catalogEnvelope.result?.catalog_root ?? "");
assert(
  catalogRoot.includes(`${sep}node_modules${sep}pomaster${sep}catalog`),
  `catalog_root 命中包内资产候选（resolveCatalogRoot 第三候选）: ${catalogRoot}`,
);

// 2.5 `npx pomaster doctor`：四态探针矩阵正常产出（bare temp 环境 fail-closed
//     exit 1 合法——探针非 READY 本来就该 fail-closed；词形断言在四态闭包内）。
const doctorEnvelope = smoke("npx pomaster doctor --json", "pomaster doctor --json", {
  expectExit: [0, 1],
  json: true,
});
const DOCTOR_PROBE_STATUSES = new Set(["READY", "NOT_INSTALLED", "MISSING_CONFIGURATION", "DEFECT"]);
const probes = doctorEnvelope.result?.probes ?? [];
assert(
  probes.length > 0 &&
    probes.every((probe) => DOCTOR_PROBE_STATUSES.has(probe.status)),
  `doctor 四态探针矩阵产出（${probes.length} 探针，状态全在闭包内）`,
);

// ============================================================
// 裁决 + 产物路径
// ============================================================

console.log("");
if (failures.length > 0) {
  console.error(`[verify-npm-package] FAIL: ${failures.length} 项断言未过`);
  for (const label of failures) console.error(`  - ${label}`);
  process.exit(1);
}
console.log("[verify-npm-package] 全部断言通过");
console.log(`  tgz（留系统 temp）:   ${tgzPath}`);
console.log(`  smoke 目录（同上）:   ${SMOKE_DIR} (${statSync(tgzPath).size} bytes tgz)`);
console.log("  publish 不在本脚本职责内——由 Owner 主控执行。");
