// npm 单包发布 staging 构建（Owner 裁决 10：单包 `pomaster`，双许可）。
// 发布版本唯一真源 = 顶部 POMASTER_VERSION 常量（字面量不得散落别处）。
//
// 职责：把 kernel/gauntlet-lite/schemas + CLI esbuild 打成单文件 ESM bundle，
// 连同 catalog/ 资产与法务文档落 `stage/pomaster/`，产出可直接 `npm publish`
// 的 staging 目录。发布动作不在本脚本（由 Owner 主控执行 `npm publish`）。
//
// 用法：`node scripts/build-npm-package.mjs`（幂等：重跑前清 stage/pomaster 重建）。
// 前置：四包 tsc dist 已在座（不重复构建——缺席时提示先 `corepack pnpm -r build`）。
//
// esbuild 实证注记（0.28.2）：
// - schemas 的 18 份 JSON schema 走 `import ... with { type: "json" }`，esbuild 以
//   json loader 内联为 JS 对象，bundle 后 import-attributes 零残留（出口判据 4.2）；
// - commander（CJS）在 `__commonJS` 惰性包装内 `require("node:events")` 等 node 内建
//   模块，`--format=esm` 下 esbuild 无法把这些动态 require 提升为静态 import，运行时
//   触发 "Dynamic require of node:events is not supported"——esbuild 作者推荐解法
//   （github.com/evanw/esbuild/issues/566）是 banner 注入 `createRequire` 互操作垫，
//   让 `__require` 垫片命中真实 require（本脚本 BANNER）。垫下活跃 require 全部
//   node: 前缀（出口判据 4.3——零 dependencies 的包内 require 不得指向裸包名）。
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const p = (...parts) => join(repoRoot, ...parts);

/**
 * 发布版本唯一真源（single source of truth）：git tag `v<version>` 必须与之一致
 * （publish.yml 版本闸强制逐字相等）；verify-npm-package.mjs 的版本断言随本常量
 * 同步维护。改版本只改这一行。
 */
const POMASTER_VERSION = "0.3.0";

const STAGE_PKG = p("stage", "pomaster");
const STAGE_BIN = join(STAGE_PKG, "dist", "bin.js");

/** ESM banner：shebang + CJS 互操作垫（见文件头 esbuild 实证注记）。 */
const BANNER = [
  "#!/usr/bin/env node",
  'import { createRequire as __pomasterCreateRequire } from "node:module";',
  "const require = __pomasterCreateRequire(import.meta.url);",
].join("\n");

function fail(message) {
  console.error(`[build-npm-package] FAIL: ${message}`);
  process.exit(1);
}

// ============================================================
// 1) 前置校验：四包 tsc dist 在座（不重复构建）
// ============================================================

const DIST_REQUIREMENTS = [
  { pkg: "schemas", files: ["dist/src/index.js", "dist/assets/01-truth-index.schema.json"] },
  { pkg: "kernel", files: ["dist/index.js"] },
  { pkg: "gauntlet-lite", files: ["dist/index.js"] },
  { pkg: "cli", files: ["dist/bin.js", "dist/index.js"] },
];

for (const { pkg, files } of DIST_REQUIREMENTS) {
  for (const file of files) {
    const target = p("packages", pkg, file);
    if (!existsSync(target)) {
      fail(
        `packages/${pkg}/${file} 不在座——本脚本不重复构建；先跑 \`corepack pnpm -r build\`。`,
      );
    }
  }
}

// ============================================================
// 2) 幂等清场：stage/pomaster 重建
// ============================================================

rmSync(STAGE_PKG, { recursive: true, force: true });
mkdirSync(join(STAGE_PKG, "dist"), { recursive: true });
mkdirSync(join(STAGE_PKG, "legal"), { recursive: true });

// ============================================================
// 3) esbuild bundle：CLI 单入口 → 单文件 ESM
// ============================================================

esbuild.buildSync({
  entryPoints: [p("packages", "cli", "dist", "bin.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: STAGE_BIN,
  banner: { js: BANNER },
  sourcemap: false,
  logLevel: "warning",
  // F3 bundled --version 修复：发布版本以 define 注入字面量（真源 = 顶部
  // POMASTER_VERSION 单点常量；cli 源 version.ts 以 typeof 守卫读取，dev 形态
  // 回落 cli package.json 的 0.0.0）。此前 bundle 后 `pomaster --version` 恒报
  // cli 包占位版本 0.0.0——发布级缺陷回归锚见出口判据 4.6。
  define: {
    POMASTER_VERSION: JSON.stringify(POMASTER_VERSION),
  },
});

// ============================================================
// 4) bundle 出口判据（机器可断言，禁静默）
// ============================================================

const bundle = readFileSync(STAGE_BIN, "utf8");

// 4.1 shebang 必须是文件首行（npm bin shim 与 Unix 直跑都依赖它）。
if (!bundle.startsWith("#!/usr/bin/env node\n")) {
  fail("bundle 首行不是 shebang `#!/usr/bin/env node`。");
}

// 4.2 JSON import-attributes 零残留：esbuild 应把 `import ... with { type: "json" }`
//     全部内联为 JS 对象；bundle 内 import 语句仍带 with-attributes = 内联失败。
const importAttrResidue =
  /(^|\n)import[^;\n]*\bwith\s*\{\s*type\s*:\s*["']json["']\s*\}/.exec(bundle);
if (importAttrResidue !== null) {
  fail(
    `bundle 内残留 JSON import-attributes（esbuild 未内联 with { type: "json" }）: ` +
      bundle.slice(importAttrResidue.index, importAttrResidue.index + 120),
  );
}

// 4.3 活跃动态 require 全 node: 前缀（CJS 互操作垫下运行时才解析，裸包名 =
//     零 dependencies 包内必然找不到——schemas 的 ajv codegen 字符串模板是死数据，
//     不匹配 `__require("...")` 调用形态，不在本判据面）。
const dynamicRequires = [...bundle.matchAll(/\b__require\("([^"]+)"\)/g)].map((m) => m[1]);
const nonNodeDynamicRequires = dynamicRequires.filter((spec) => !spec.startsWith("node:"));
if (nonNodeDynamicRequires.length > 0) {
  fail(
    `bundle 内 __require 出现非 node: 裸包名（零 dependencies 包内无法解析）: ` +
      [...new Set(nonNodeDynamicRequires)].join(", "),
  );
}

// 4.4 静态 import 全 node: 前缀（workspace 包与 commander 必须已内联）。
// 行首锚定：esbuild 的 import 语句恒在行首；代码内模板串（如 kernel hint
// `from "${String(from)}" 不在 …`）不匹配，避免误伤。
const staticImports = [
  ...bundle.matchAll(/^import\s+[^;]*?\bfrom\s+"([^"]+)"/gm),
  ...bundle.matchAll(/^import\s+"([^"]+)"/gm),
].map((m) => m[1]);
const nonNodeStaticImports = staticImports.filter(
  (spec) => !spec.startsWith("node:") && !spec.startsWith("."),
);
if (nonNodeStaticImports.length > 0) {
  fail(
    `bundle 内静态 import 出现未内联裸包名: ` + [...new Set(nonNodeStaticImports)].join(", "),
  );
}

// 4.5 node 直载冒烟：bundle 可执行且 --help 正常（exit 0 + Usage 行）。
const helpRun = spawnSync(process.execPath, [STAGE_BIN, "--help"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (helpRun.status !== 0 || !helpRun.stdout.includes("Usage: pomaster")) {
  fail(
    `bundle 直载冒烟失败（node dist/bin.js --help → exit ${helpRun.status}）：\n` +
      `${helpRun.stdout}${helpRun.stderr}`,
  );
}

// 4.6 bundled --version：define 注入的发布版本必须生效（F3 回归锚——此前 bundle 后
//     `pomaster --version` 恒报 cli 包占位版本 0.0.0）。
const versionRun = spawnSync(process.execPath, [STAGE_BIN, "--version"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (versionRun.status !== 0 || versionRun.stdout.trim() !== POMASTER_VERSION) {
  fail(
    `bundle --version 应输出 ${POMASTER_VERSION}，实为 exit ${versionRun.status} ` +
      `stdout=${JSON.stringify(versionRun.stdout)} stderr=${JSON.stringify(versionRun.stderr)}`,
  );
}

// ============================================================
// 5) catalog/ 整目录拷贝（含 catalog-lock.draft.json）
// ============================================================

cpSync(p("catalog"), join(STAGE_PKG, "catalog"), { recursive: true });
const stageLock = JSON.parse(
  readFileSync(join(STAGE_PKG, "catalog", "catalog-lock.draft.json"), "utf8"),
);

// ============================================================
// 6) 法务与文档拷贝
// ============================================================

const LEGAL_COPIES = [
  "LICENSE",
  "COMMERCIAL_LICENSE.md",
  "TRADEMARKS.md",
  "SECURITY.md",
  "README.md",
];
for (const file of LEGAL_COPIES) {
  const source = p(file);
  if (!existsSync(source)) fail(`法务/文档源文件缺失: ${file}`);
  copyFileSync(source, join(STAGE_PKG, file));
}
copyFileSync(
  p("legal", "THIRD_PARTY_NOTICES.md"),
  join(STAGE_PKG, "legal", "THIRD_PARTY_NOTICES.md"),
);

// ============================================================
// 7) 生成 staging package.json（零 dependencies——全 bundle）
// ============================================================

const cliPackageJson = JSON.parse(readFileSync(p("packages", "cli", "package.json"), "utf8"));

/**
 * staging manifest（Owner 裁决 10）：name/version/license/bin/files/engines/repository
 * 逐项钉死；version 取自顶部 POMASTER_VERSION 单点常量；`private` 不设（缺省可发布）；
 * 零 dependencies/peerDependencies
 * （kernel/gauntlet-lite/schemas/commander 全部 bundle，ajv 仅测试面不进 bundle）。
 */
const stagePackageJson = {
  name: "pomaster",
  version: POMASTER_VERSION,
  description: cliPackageJson.description,
  license: "PolyForm-Noncommercial-1.0.0",
  type: "module",
  bin: { pomaster: "dist/bin.js" },
  files: [
    "dist",
    "catalog",
    "README.md",
    "LICENSE",
    "COMMERCIAL_LICENSE.md",
    "TRADEMARKS.md",
    "SECURITY.md",
    "legal",
  ],
  engines: { node: ">=22" },
  repository: {
    type: "git",
    url: "git+https://github.com/River-Singer/POMaster_VNext.git",
  },
  keywords: [
    "pomaster",
    "governance",
    "control-plane",
    "cli",
    "ai-coding",
    "agent",
    "spec-driven-development",
  ],
};

writeFileSync(
  join(STAGE_PKG, "package.json"),
  JSON.stringify(stagePackageJson, null, 2) + "\n",
  "utf8",
);

// ============================================================
// 8) staging 摘要（文件数/总字节/bundle 字节）
// ============================================================

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

const stagedFiles = walkFiles(STAGE_PKG);
const totalBytes = stagedFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const bundleBytes = statSync(STAGE_BIN).size;

// B4 裁定（Owner 2026-09-04）stage 守卫：宪法文档本体不随 npm 包分发——目录宪法
// 文档（dot-pomaster-directory-constitution.md）只住开发仓治理档案，npm 包只带
// 运行时产物（dist bundle + catalog 资产 + 法务文档）。stage 是显式白名单制
// （LEGAL_COPIES + catalog/），宪法文档本就不在清单内；本守卫是防未来扩清单时
// 误纳入的回归锚（stage 出现宪法文档词形即 fail，禁静默放行）。
const constitutionStrays = stagedFiles
  .map((file) => file.split("\\").join("/"))
  .filter((file) => file.includes("dot-pomaster-directory-constitution"));
if (constitutionStrays.length > 0) {
  fail(
    `B4 裁定（2026-09-04）违例：宪法文档本体不得随 npm 包分发: ${constitutionStrays.join(", ")}`,
  );
}

console.log("[build-npm-package] staging 构建完成");
console.log(`  stage:            ${STAGE_PKG}`);
console.log(`  files:            ${stagedFiles.length}`);
console.log(`  total bytes:      ${totalBytes}`);
console.log(`  bundle bytes:     ${bundleBytes} (dist/bin.js)`);
console.log(`  catalog entries:  ${stageLock.entries.length} (lock ${stageLock.catalog_version})`);
console.log(`  esbuild:          ${esbuild.version}`);
console.log("  next:             node scripts/verify-npm-package.mjs");
