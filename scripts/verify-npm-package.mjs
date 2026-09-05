// npm 单包发布 staging 验证（Owner 裁决 10 配套；`scripts/build-npm-package.mjs` 之后跑）。
//
// 两道验证，全部可复跑：
// 1) `npm pack --dry-run` 断言：bin 在座 / catalog 完整（与仓库 catalog 文件集全等[
//    __pycache__ 排除] + lock 270 entries）/ seeds 完整（与仓库 packages/cli/seeds 文件集
//    全等 + 清单 152 entries）/ 无 node_modules / 无 files 白名单外杂物 / 零 dependencies；
// 2) fresh-install 冒烟：真实 `npm pack` 出 tgz → 系统 temp `pvnext-npm-smoke-<pid>`
//    目录 `npm init -y` + `npm install <tgz>`（零 dependencies，不联网装依赖）→
//    依次实跑 `npx pomaster --help|init|status|catalog status|doctor`，断言退出码与
//    关键词形。关键断言：catalog status 的 catalog_root 命中
//    node_modules/pomaster/catalog（resolveCatalogRoot 候选链的包内资产候选，
//    ok:true 且 270 entries 0 drift）。
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
    if (entry.isDirectory()) {
      // __pycache__ 排除（裁定批 G / D8-1 同款纪律——裁决 12 loadCatalogTools 先例）：
      // Python import 缓存目录属本机运行残留（catalog/tools 下跑种子工具即生成），
      // 非策展物料；不排除会让「仓库 catalog 文件集」混入缓存文件、与打包文件集
      // （npm files 白名单天然不含）假性失配——根除「计数差需人工清理」依赖。
      if (entry.name === "__pycache__") continue;
      out.push(...walkFiles(full, relativeTo));
    } else out.push(full.slice(relativeTo.length + 1).split(sep).join("/"));
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

// 1.2 catalog 完整：打包文件集与仓库 catalog/ 全等（__pycache__ 排除）+ lock 270 entries。
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
assert(stageLock.entries.length === 270, "catalog-lock 270 entries", `实为 ${stageLock.entries.length}`);

// 1.2.1 seeds 完整（B6b 两批 + B6c + B6d + B6e）：打包文件集与仓库 packages/cli/seeds/ 全等 +
//      清单 schema/条目数（播种资产随包分发——装载器 fail-closed，缺 seeds = init 必炸）。
const repoSeedsFiles = walkFiles(p("packages", "cli", "seeds")).map((file) => `seeds/${file}`);
const packedSeedsFiles = packedPaths.filter((file) => file.startsWith("seeds/"));
const repoSeedsSet = new Set(repoSeedsFiles);
const packedSeedsSet = new Set(packedSeedsFiles);
const missingSeeds = [...repoSeedsSet].filter((file) => !packedSeedsSet.has(file));
const extraSeeds = [...packedSeedsSet].filter((file) => !repoSeedsSet.has(file));
assert(
  missingSeeds.length === 0 && extraSeeds.length === 0,
  `seeds 完整（打包 ${packedSeedsFiles.length} == 仓库 ${repoSeedsFiles.length} 文件）`,
  `missing: ${missingSeeds.join(", ")} | extra: ${extraSeeds.join(", ")}`,
);
const stageSeedManifest = JSON.parse(
  readFileSync(join(STAGE_PKG, "seeds", "manifest.json"), "utf8"),
);
assert(
  stageSeedManifest.schema === "pomaster.seed-manifest/1",
  "stage seeds manifest schema = pomaster.seed-manifest/1",
  `实为 ${stageSeedManifest.schema}`,
);
assert(
  stageSeedManifest.entries?.length === 152,
  "stage seeds manifest 152 entries",
  `实为 ${stageSeedManifest.entries?.length}`,
);

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
  (file) =>
    !allowedExact.has(file) &&
    !file.startsWith("catalog/") &&
    !file.startsWith("seeds/"),
);
assert(strays.length === 0, "无白名单外杂物", strays.join(", "));

// 1.4.1 B4 裁定（Owner 2026-09-04）：宪法文档本体不得出现在 tarball——只住开发仓
//      治理档案（stage 白名单本不含；本断言防未来扩清单时回归）。
const constitutionLeak = packedPaths.filter((file) =>
  file.includes("dot-pomaster-directory-constitution"),
);
assert(constitutionLeak.length === 0, "tarball 无宪法文档本体（B4）", constitutionLeak.join(", "));

// 1.5 零 dependencies + 可发布形态（Owner 裁决 10）。
const stageManifest = JSON.parse(readFileSync(join(STAGE_PKG, "package.json"), "utf8"));
const forbiddenFields = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];
const presentForbidden = forbiddenFields.filter((field) => stageManifest[field] !== undefined);
assert(presentForbidden.length === 0, "零 dependencies（四字段全缺席）", presentForbidden.join(", "));
assert(stageManifest.private === undefined, "private 不设（缺省可发布）");
// 版本断言与 build-npm-package.mjs 的 POMASTER_VERSION 单点真源同步维护
// （发布 tag v<version> 以该常量为锚，publish.yml 版本闸强制）。
assert(stageManifest.name === "pomaster" && stageManifest.version === "0.3.0", "name/version = pomaster@0.3.0");
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
// tgz 文件名由 npm pack 依 staging manifest version 机械生成——从 manifest 派生，
// 版本推进时零同步点（manifest version 与 POMASTER_VERSION 一致性已在 1.5 断言钉住）。
const tgzPath = join(SMOKE_DIR, `pomaster-${stageManifest.version}.tgz`);
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

// 2.2 `npx pomaster init`：四产物落盘（truth-index / authority / config.yaml / AGENTS.md）
//     + B6b-B6e 播种件落盘（46 份 FE + 33 份 BE + 28 份 stacks 进 .pomaster/specs/hard/
//     + 25 份 baseline 进 .pomaster/baseline/ + 20 份 evidence 进 .pomaster/specs/evidence/
//     ——包内 seeds 资产位 + 装载器 fail-closed 的端到端实证：缺 seeds 的包 init 即炸）。
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
// FE 面：只数编号协议件（目录另含 init 布局步骤落的 README.md，非播种件）。
const seededFrontendDir = join(SMOKE_DIR, ".pomaster", "specs", "hard", "frontend");
const seededSpecs = existsSync(seededFrontendDir)
  ? readdirSync(seededFrontendDir)
      .filter((name) => /^\d{2}-.*-protocol\.md$/.test(name))
      .sort()
  : [];
assert(
  seededSpecs.length === 45,
  "init 播种件落盘：specs/hard/frontend 45 份编号协议",
  `实为 ${seededSpecs.length}${seededSpecs.length ? `: ${seededSpecs.join(", ")}` : ""}`,
);
assert(
  seededSpecs[0] === "01-development-checklist-protocol.md" &&
    seededSpecs[44] === "45-browser-storage-protocol.md",
  "init 播种件编号连续（01..45）",
  `首末: ${seededSpecs[0]} .. ${seededSpecs[44]}`,
);
assert(
  existsSync(join(seededFrontendDir, "index.md")),
  "init 播种件落盘：specs/hard/frontend/index.md（FE 索引）",
);
// BE 面（B6c）：32 编号协议 + index。
const seededBackendDir = join(SMOKE_DIR, ".pomaster", "specs", "hard", "backend");
const seededBackendProtocols = existsSync(seededBackendDir)
  ? readdirSync(seededBackendDir)
      .filter((name) => /^\d{2}-.*-protocol\.md$/.test(name))
      .sort()
  : [];
assert(
  seededBackendProtocols.length === 32,
  "init 播种件落盘：specs/hard/backend 32 份编号协议（B6c）",
  `实为 ${seededBackendProtocols.length}`,
);
assert(
  seededBackendProtocols[0] === "01-architecture-governance-protocol.md" &&
    seededBackendProtocols[31] === "32-release-versioning-rollback-protocol.md",
  "init 播种件 BE 编号连续（01..32）",
  `首末: ${seededBackendProtocols[0]} .. ${seededBackendProtocols[31]}`,
);
assert(
  existsSync(join(seededBackendDir, "index.md")),
  "init 播种件落盘：specs/hard/backend/index.md（BE 索引）",
);
// stacks 面（B6c）：14 slug 子目录 × (index + overlay)。
const STACK_SLUGS = [
  "java", "jpa", "kubernetes-ingress", "messaging", "mybatis", "mysql",
  "nginx", "postgresql", "redis", "spring-batch", "spring-boot", "spring-mvc",
  "spring-webflux", "tomcat",
];
const seededStacksDir = join(SMOKE_DIR, ".pomaster", "specs", "hard", "stacks");
for (const slug of STACK_SLUGS) {
  const slugDir = join(seededStacksDir, slug);
  const files = existsSync(slugDir) ? readdirSync(slugDir).sort() : [];
  assert(
    files.length === 2 && files[0] === "index.md" && files[1].endsWith("-overlay.md"),
    `init 播种件落盘：specs/hard/stacks/${slug}/（index + overlay）`,
    `实为 ${files.join(", ")}`,
  );
}
// marker-free 抽查 + BE frontmatter legacy 字段抽查（B6c BE frontmatter 兼容 ADR）。
const beSample = readFileSync(
  join(seededBackendDir, "22-idempotency-protocol.md"),
  "utf8",
);
assert(
  beSample.startsWith("---\n") &&
    beSample.includes("legacy_id: backend:idempotency-protocol") &&
    !beSample.includes("\nid: backend:"),
  "BE 播种件 frontmatter 形态（legacy_id 改形 + 统一字段在座）",
);
assert(!beSample.includes("GENERATED"), "播种件 marker-free 抽查（BE 协议件）");

// baseline 面（B6d）：manifest 1 + frontend 7 + backend 8 + data 5 + platform 4 =
// 25 件（UNKNOWN 起步；「待填写」旧词形零残留——R4 红线抽查）。
const seededBaselineDir = join(SMOKE_DIR, ".pomaster", "baseline");
assert(
  existsSync(join(seededBaselineDir, "manifest.yaml")),
  "init 播种件落盘：baseline/manifest.yaml（身份/unknowns 台账）",
);
const BASELINE_LANE_COUNTS = { frontend: 7, backend: 8, data: 5, platform: 4 };
for (const [lane, count] of Object.entries(BASELINE_LANE_COUNTS)) {
  const laneDir = join(seededBaselineDir, lane);
  // 只数播种件（目录另含 init 布局步骤落的 README.md，非播种件——FE 面同款口径）。
  const files = existsSync(laneDir)
    ? readdirSync(laneDir).filter((name) => name !== "README.md").sort()
    : [];
  assert(
    files.length === count,
    `init 播种件落盘：baseline/${lane}/ ${count} 件`,
    `实为 ${files.length}${files.length ? `: ${files.join(", ")}` : ""}`,
  );
}
const feStackSeed = readFileSync(join(seededBaselineDir, "frontend", "stack.yaml"), "utf8");
assert(
  feStackSeed.includes("framework: UNKNOWN") &&
    feStackSeed.includes("testing: UNKNOWN") &&
    !feStackSeed.includes("待填写"),
  "baseline stack.yaml UNKNOWN 起步（零「待填写」词形——R4 红线抽查）",
);
assert(
  !feStackSeed.startsWith("---\n") && !feStackSeed.includes("GENERATED"),
  "baseline 播种件纯正文（无 frontmatter）+ marker-free 抽查",
);

// evidence 面（B6e）：index + 19 spec（十七段结构 + 判卷四值词形锚词形抽查）。
const seededEvidenceDir = join(SMOKE_DIR, ".pomaster", "specs", "evidence");
const seededEvidenceFiles = existsSync(seededEvidenceDir)
  ? readdirSync(seededEvidenceDir)
      .filter((name) => name.endsWith(".md") && name !== "README.md")
      .sort()
  : [];
assert(
  seededEvidenceFiles.length === 20,
  "init 播种件落盘：specs/evidence 20 件（index + 19 spec，B6e）",
  `实为 ${seededEvidenceFiles.length}${seededEvidenceFiles.length ? `: ${seededEvidenceFiles.join(", ")}` : ""}`,
);
assert(
  seededEvidenceFiles.includes("index.md") &&
    seededEvidenceFiles.includes("complexity-crap.md") &&
    seededEvidenceFiles.includes("mutation.md") &&
    seededEvidenceFiles.includes("release.md"),
  "init 播种件落盘：specs/evidence 关键件在座（index/complexity-crap/mutation/release）",
);
const evidenceSample = readFileSync(join(seededEvidenceDir, "complexity-crap.md"), "utf8");
assert(
  evidenceSample.includes("CRAP = Complexity² × (1 - Coverage)³ + Complexity") &&
    evidenceSample.includes("### PASS") &&
    evidenceSample.includes("### NOT_RUN") &&
    !evidenceSample.startsWith("---\n"),
  "evidence 播种件形态抽查（十七段结构 + 四值词位 + 纯正文无 frontmatter）",
);
assert(!evidenceSample.includes("GENERATED"), "播种件 marker-free 抽查（evidence 件）");

// SPEC.* 预植（裁定批 D D2 / Owner 2026-09-05 裁定 (a)：init 预植——init 从此写
// store）：fresh init 后 truth-index 19 个 SPEC.* 对象在册（PROPOSED 起步），
// seq=1（骨架 + 预植单事务）。
const smokeTruthIndex = JSON.parse(
  readFileSync(join(SMOKE_DIR, ".pomaster", "state", "truth-index.json"), "utf8"),
);
const specPreplantRows = (smokeTruthIndex.objects ?? []).filter((row) =>
  String(row.id).startsWith("SPEC."),
);
assert(
  specPreplantRows.length === 19,
  "init 预植对象 19 在册（SPEC.* Evidence Spec——裁定批 D D2）",
  `实为 ${specPreplantRows.length}`,
);
assert(
  specPreplantRows.every((row) => row.kind === "business_rule") &&
    specPreplantRows.every((row) => row.axes?.lifecycle === "PROPOSED"),
  "预植对象形态抽查（kind=business_rule + lifecycle=PROPOSED 起步）",
);
assert(
  smokeTruthIndex.generation?.seq === 1,
  "init 预植事务 seq=1（骨架 + 预植单事务，journal 正常前进）",
  `实为 ${smokeTruthIndex.generation?.seq}`,
);

// 2.3 `npx pomaster status`：播种分面计数呈现（B6e——B6a 未尽事项 1 接线冒烟）+
//     SPEC 预植计数呈现（裁定批 D D2）。
smoke("npx pomaster status", "pomaster status", {
  expectExit: [0],
  expectWords: [
    "status: .pomaster/state/truth-index.json (seq=1)",
    "seeded assets: frontend 46 / backend 33 / stacks 28 / evidence 20 / baseline 25",
    "spec preplant: 19/19 in place",
  ],
});

// 2.4 `npx pomaster catalog status --json`（关键：包内资产候选命中 + 270 entries 0 drift）。
const catalogEnvelope = smoke("npx pomaster catalog status --json", "pomaster catalog status --json", {
  expectExit: [0],
  json: true,
});
assert(catalogEnvelope.ok === true, "catalog status 信封 ok:true");
assert(
  catalogEnvelope.result?.entries_total === 270,
  `catalog entries = 270（实为 ${catalogEnvelope.result?.entries_total}）`,
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
