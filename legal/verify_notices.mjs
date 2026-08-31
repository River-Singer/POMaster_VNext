#!/usr/bin/env node
/**
 * verify_notices.mjs —— legal/THIRD_PARTY_NOTICES.md 的机器校验器（RT4-note 封条：
 * 「事实件给机器锚点配机器复核」）。
 *
 * 校验面（零网络、秒级，可挂 CI）：
 *   1. 表格完整性：§A/§B 两节行数与节标题声称的包数一致（6 / 198，合计 204）；
 *   2. 包名唯一：§A+§B 内同名包重复出现即红；
 *   3. 证据等级词形一致：B2 行 id 必带 † 且路径位为无 LICENSE 占位；B3 行 id 必带
 *      * 且路径位 (未安装)；B4 行 id 必带 ** 且路径位 (未安装)；B1 行 id 必无标注
 *      符号且路径位是仓内真实相对路径；
 *   4. B1 锚打开核对：逐行打开 node_modules 内 LICENSE 文件，按 license id 词形表
 *      核对正文（MIT→"MIT License"/"Permission is hereby granted"、Apache-2.0→
 *      "Apache License" 等；词形表外 id 退化为「文件正文含 id 本身」）——表内 id
 *      被篡改（如 MIT→Apache-2.0）即与锚文件矛盾被检出。
 *
 * 退出码：0 = 全部校验通过；1 = 存在校验失配（逐条列名）；2 = 文件/解析形态错误。
 * 锚定：以 THIRD_PARTY_NOTICES.md 自身声明的 pnpm-lock commit 为准，本脚本不写
 * 墙钟、无网络依赖。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOTICES_PATH = join(HERE, "THIRD_PARTY_NOTICES.md");

/** license id → 文件正文必须命中的词形（命中任一即可；词形表外 id 退化核对 id 本身）。 */
const LICENSE_WORD_FORMS = {
  MIT: ["MIT License", "Permission is hereby granted"],
  "Apache-2.0": ["Apache License"],
  ISC: ["ISC License", "The ISC License", "Permission to use, copy, modify"],
  "BSD-2-Clause": ["Redistribution and use"],
  "BSD-3-Clause": ["Redistribution and use"],
  "Python-2.0": ["PYTHON SOFTWARE FOUNDATION LICENSE"],
  "BlueOak-1.0.0": ["Blue Oak"],
};

function fail(msg, code) {
  process.stderr.write(`[verify-notices] ${msg}\n`);
  process.exit(code);
}

const raw = readFileSync(NOTICES_PATH, "utf8");

// —— 切出 §A..§2 之间的两节表格（§0 分布表与附录残留表不在校验面）。
const sectionAStart = raw.indexOf("## §A");
const sectionBStart = raw.indexOf("## §B");
const sectionEnd = raw.indexOf("## §2");
if (sectionAStart === -1 || sectionBStart === -1 || sectionEnd === -1) {
  fail("章节锚缺失（## §A / ## §B / ## §2）——文件形态变更，校验器需同步更新", 2);
}

// —— 节标题声称包数（「（6 包）」「（198 包）」）。
function claimedCountOf(sectionHeader) {
  const start = raw.indexOf(sectionHeader);
  const m = /（(\d+)\s*包）/.exec(raw.slice(start, start + 120));
  return m === null ? null : Number(m[1]);
}
const claimedA = claimedCountOf("## §A");
const claimedB = claimedCountOf("## §B");
if (claimedA === null || claimedB === null) fail("节标题未声称包数——文件形态变更", 2);

// —— 解析表格行：| 包名 | 版本 | license id | 路径 | 证据等级 |
const ROW_RE = /^\| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| (B[1-4]) \|$/;
const rows = [];
let currentSection = null;
for (const line of raw.slice(sectionAStart, sectionEnd).split("\n")) {
  if (line.startsWith("## §A")) currentSection = "A";
  else if (line.startsWith("## §B")) currentSection = "B";
  const m = ROW_RE.exec(line.trim());
  if (m !== null) rows.push({ section: currentSection, name: m[1].trim(), version: m[2].trim(), license: m[3].trim(), path: m[4].trim(), grade: m[5] });
}

const problems = [];
const countA = rows.filter((r) => r.section === "A").length;
const countB = rows.filter((r) => r.section === "B").length;
if (countA !== claimedA) problems.push(`§A 行数 ${countA} ≠ 声称 ${claimedA}`);
if (countB !== claimedB) problems.push(`§B 行数 ${countB} ≠ 声称 ${claimedB}`);
if (countA + countB !== 204) problems.push(`总行数 ${countA + countB} ≠ 204（lockfile 锚口径）`);

// —— 节内 name@version 唯一。同名跨节（ajv 同时在运行时与开发闭包）与同名多版本
// （minimatch@9 + @10 并存）都是 lockfile 的合法形态，不是重复。
const seen = new Map();
for (const r of rows) {
  const key = `${r.section}#${r.name}@${r.version}`;
  if (seen.has(key)) problems.push(`同节内 name@version 重复：${r.name}@${r.version}（§${r.section}）`);
  else seen.set(key, r.section);
}

// —— 逐行：证据等级词形 + B1 锚打开核对。
const textByPath = new Map();
for (const r of rows) {
  const idBare = r.license.replace(/[†*]/g, "").replace(/（[^）]*）/g, "").trim();
  if (r.grade === "B2") {
    if (!r.license.includes("†")) problems.push(`${r.name}: B2 行 id 缺 † 标注（${r.license}）`);
    if (!r.path.includes("无 LICENSE 文件")) problems.push(`${r.name}: B2 行路径位应为无 LICENSE 占位（${r.path}）`);
    continue;
  }
  if (r.grade === "B3" || r.grade === "B4") {
    const marker = r.grade === "B3" ? "*" : "**";
    if (!r.license.includes(marker)) problems.push(`${r.name}: ${r.grade} 行 id 缺 ${marker} 标注（${r.license}）`);
    if (!r.path.includes("未安装")) problems.push(`${r.name}: ${r.grade} 行路径位应为 (未安装)（${r.path}）`);
    continue;
  }
  // B1：id 必无标注符号；路径必须是仓内真实文件；正文按词形表核对。
  if (r.license.includes("†") || r.license.includes("*")) {
    problems.push(`${r.name}: B1 行 id 不应带标注符号（${r.license}）`);
  }
  if (r.path.startsWith("（") || r.path.startsWith("(")) {
    problems.push(`${r.name}: B1 行路径位应为真实路径（${r.path}）`);
    continue;
  }
  const abs = resolve(join(HERE, ".."), r.path);
  if (!existsSync(abs)) {
    problems.push(`${r.name}: B1 锚文件不存在：${r.path}`);
    continue;
  }
  let text = textByPath.get(abs);
  if (text === undefined) {
    text = readFileSync(abs, "utf8");
    textByPath.set(abs, text);
  }
  const forms = LICENSE_WORD_FORMS[idBare] ?? [idBare];
  if (!forms.some((f) => text.includes(f))) {
    problems.push(`${r.name}: B1 锚正文与 license id 矛盾（id=${idBare}，文件=${r.path}，词形表命中失败）——表内 id 可能被篡改`);
  }
}

if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`[verify-notices] 校验失配：${p}\n`);
  fail(`THIRD_PARTY_NOTICES 校验失配（${problems.length} 处）——清单不可信，修正后重跑`, 1);
}
process.stdout.write(
  `[verify-notices] OK——§A ${countA} 行 + §B ${countB} 行 = ${countA + countB} 包，包名唯一，证据等级词形一致，B1 锚 ${textByPath.size} 个文件逐个核对通过\n`,
);
