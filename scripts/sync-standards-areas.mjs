#!/usr/bin/env node
// sync-standards-areas.mjs —— 把规范空间与测试类型写成设计规范的领域，Storybook「规范」分区与 AI 孪生随之可见。
//
// 数据源：packages/cli/seeds/standards/spaces.json（CLI 的 pomaster standards 读同一份）。
// 产物：skeleton.yaml / antd.yaml / geist.yaml 末尾标记行之后的领域块（两套体系内容相同）。
// 改空间或抽屉：改 spaces.json → node scripts/sync-standards-areas.mjs → pomaster design validate。
// 测试 standards-areas 钉住产物与数据源一致。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEEDS = join(REPO, "packages", "cli", "seeds");
export const SPACES_PATH = join(SEEDS, "standards", "spaces.json");
export const STANDARDS_AREA_FILES = {
  skeleton: join(SEEDS, "design-standards", "skeleton.yaml"),
  antd: join(SEEDS, "design-standards", "antd.yaml"),
  geist: join(SEEDS, "design-standards", "geist.yaml"),
};
export const STANDARDS_AREAS_MARKER =
  "  # ═════════════════════════════ 规范空间与测试（由 scripts/sync-standards-areas.mjs 从 seeds/standards/spaces.json 生成，不要手改） ═════════════════════════════";

const KIND_TITLES = { architecture: "架构形态", language: "语言", framework: "框架与运行时", persistence: "持久层", product: "产品" };
const STATUS_TITLES = { available: "已有", reserved: "预留" };

function scalar(value) {
  const text = String(value);
  const plain =
    text.length > 0 &&
    !text.includes("\n") &&
    !"-?:,[]{}#&*!|>'\"%@`".includes(text[0]) &&
    text.trim() === text &&
    !/^(true|false|null|yes|no|on|off|~)$/i.test(text) &&
    !/^[-+]?(\d[\d_]*)?(\.\d+)?([eE][-+]?\d+)?$/.test(text) &&
    !/: | #|:$/.test(text) &&
    !/[,[\]{}]/.test(text);
  return plain ? text : JSON.stringify(text);
}

const upper = (key) => key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** 一个空间 → 领域：管什么、通用规范、抽屉（测试空间是测试类型）。 */
function spaceArea(space, data) {
  const prefix = `SPACE.${upper(space.key)}`;
  const themes = space.themes.map((slug) => data.theme_titles[slug] ?? slug);
  const rules = [
    {
      id: `${prefix}.SCOPE`,
      title_zh: "管什么",
      statement_zh: space.summary_zh,
      rationale_zh: "规范按系统的层组织，每一层的规则写在这一层；读的人和 AI 按层找，不在一份大文档里翻。",
      scope_zh: `${space.title_zh}这一层的全部代码与配置`,
      check_zh: `pomaster standards ${space.key} 看本空间的通用规范与抽屉`,
    },
    {
      id: `${prefix}.GENERIC`,
      title_zh: "通用规范",
      statement_zh: `这一层的通用规范对所有项目生效，不分语言、框架与架构形态：${themes.join("、")}。`,
      rationale_zh: "通用规范说的是这一层无论用什么技术都成立的规则，换技术栈不用重写。",
      scope_zh: `${space.title_zh}这一层的全部代码与配置`,
      check_zh: "评审时逐份对照；pomaster standards 列出每份文档在项目里的位置",
    },
  ];
  const lines = [];
  if (space.drawers.length > 0) {
    const kinds = [...new Set(space.drawers.map((drawer) => drawer.kind))];
    const summary = kinds
      .map((kind) => `${KIND_TITLES[kind]}——${space.drawers.filter((drawer) => drawer.kind === kind).map((drawer) => drawer.title_zh).join("、")}`)
      .join("；");
    rules.push({
      id: `${prefix}.DRAWERS`,
      title_zh: "抽屉",
      statement_zh: `只对某种技术成立的规则放进抽屉：${summary}。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。`,
      rationale_zh: "语言、框架与产品的差异单独成册，项目换掉一种技术时只换对应的抽屉，通用规范不动。",
      scope_zh: `${space.title_zh}这一层用到的语言、框架、架构形态与产品`,
      check_zh: "pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>",
      specimen: {
        title_zh: "抽屉一览",
        description_zh: "已有 = 有现成规范文档；预留 = 项目用到时第一次写入建文档。",
        name_label_zh: "抽屉",
        rows: space.drawers.map((drawer) => ({
          name: `${drawer.title_zh}（${drawer.id}）`,
          usage_zh: `${KIND_TITLES[drawer.kind]}：${drawer.summary_zh}`,
          sample_zh: STATUS_TITLES[drawer.doc === null ? "reserved" : "available"],
        })),
      },
    });
  }
  if (space.tests !== undefined) {
    rules.push({
      id: `${prefix}.TYPES`,
      title_zh: "测试类型",
      statement_zh: `测试按要证明的事情分类：${space.tests.map((test) => test.title_zh).join("、")}；每一类对应证据规范，结果按证据入账。`,
      rationale_zh: "按证明的事情分类，缺哪一类一眼可见；同一种工具可以服务多类测试。",
      scope_zh: "所有空间的验证工作",
      check_zh: "pomaster plan run 与 record gate-run 的结果；没跑的记 NOT_RUN",
      specimen: {
        title_zh: "测试类型与证据",
        description_zh: "每一类测试证明什么、用哪些证据规范入账。",
        name_label_zh: "测试类型",
        rows: space.tests.map((test) => ({
          name: test.title_zh,
          usage_zh: test.proves_zh,
          sample_zh: test.evidence.map((slug) => data.evidence_titles[slug] ?? slug).join("、"),
        })),
      },
    });
  }
  return { key: `space_${space.key}`, title_zh: space.title_zh, group: "standards", prefix, summary_zh: space.summary_zh, rules };
}

/** 一个测试类型 → 领域：证明什么、证据怎么入账。 */
function testArea(test, data) {
  const prefix = `TEST.${upper(test.id)}`;
  const evidence = test.evidence.map((slug) => data.evidence_titles[slug] ?? slug);
  return {
    key: `test_${test.id.replace(/-/g, "_")}`,
    title_zh: test.title_zh,
    group: "testing",
    prefix,
    summary_zh: test.proves_zh,
    rules: [
      {
        id: `${prefix}.PROVES`,
        title_zh: "证明什么",
        statement_zh: test.proves_zh,
        rationale_zh: "先说清这一类测试要证明的事，才知道它缺席时少了哪一块把握。",
        scope_zh: "所有空间的代码与配置",
        check_zh: "verify 时对照验收条目判读",
      },
      {
        id: `${prefix}.EVIDENCE`,
        title_zh: "证据怎么入账",
        statement_zh: `结果按证据规范入账：${evidence.join("、")}。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。`,
        rationale_zh: "测试做没做、结果如何，要能从证据里查到，而不是靠实现者自己说。",
        scope_zh: "所有空间的验证工作",
        check_zh: "pomaster plan run 与 record gate-run 的入账结果",
      },
      // 这一类测试特有的规则（如白盒的写测试纪律），写在 spaces.json 的 tests[].rules。
      ...(test.rules ?? []).map((rule) => ({
        id: `${prefix}.${upper(rule.key)}`,
        title_zh: rule.title_zh,
        statement_zh: rule.statement_zh,
        rationale_zh: rule.rationale_zh,
        scope_zh: rule.scope_zh,
        check_zh: rule.check_zh,
      })),
    ],
  };
}

function ruleYaml(rule) {
  const out = [
    `      - id: ${rule.id}`,
    `        title_zh: ${scalar(rule.title_zh)}`,
    `        statement_zh: ${scalar(rule.statement_zh)}`,
    `        rationale_zh: ${scalar(rule.rationale_zh)}`,
    `        scope_zh: ${scalar(rule.scope_zh)}`,
    `        check_zh: ${scalar(rule.check_zh)}`,
    "        enforcement: { kind: review }",
  ];
  if (rule.specimen !== undefined) {
    out.push(
      "        showcase:",
      "          - kind: specimen",
      `            title_zh: ${scalar(rule.specimen.title_zh)}`,
      `            description_zh: ${scalar(rule.specimen.description_zh)}`,
      `            name_label_zh: ${scalar(rule.specimen.name_label_zh)}`,
      "            rows:",
      ...rule.specimen.rows.flatMap((row) => [
        `              - name: ${scalar(row.name)}`,
        `                usage_zh: ${scalar(row.usage_zh)}`,
        `                sample_zh: ${scalar(row.sample_zh)}`,
      ]),
    );
  }
  return out;
}

function areaHead(area) {
  return [`  - key: ${area.key}`, `    title_zh: ${scalar(area.title_zh)}`, `    group: ${area.group}`, `    prefix: ${area.prefix}`, `    summary_zh: ${scalar(area.summary_zh)}`];
}

export function standardsAreas(data = JSON.parse(readFileSync(SPACES_PATH, "utf8"))) {
  const testing = data.spaces.find((space) => space.key === "testing");
  return [...data.spaces.map((space) => spaceArea(space, data)), ...(testing?.tests ?? []).map((test) => testArea(test, data))];
}

/** 渲染领域块（标记行起到文件末尾）。kind = skeleton 写条目目录，standard 写规则正文。 */
export function renderStandardsAreasBlock(kind, data) {
  const areas = standardsAreas(data);
  const lines = [STANDARDS_AREAS_MARKER];
  for (const area of areas) {
    lines.push(...areaHead(area));
    if (kind === "skeleton") {
      lines.push("    topics:", ...area.rules.map((rule) => `      - { id: ${rule.id}, title_zh: ${scalar(rule.title_zh)} }`));
    } else {
      lines.push("    rules:");
      area.rules.forEach((rule, index) => {
        if (index > 0) lines.push("");
        lines.push(...ruleYaml(rule));
      });
    }
  }
  return `${lines.join("\n")}\n`;
}

/** 文件里标记行之前的部分 + 新渲染的块。没有标记行就接在末尾。 */
export function spliceStandardsAreas(text, block) {
  const at = text.indexOf(`${STANDARDS_AREAS_MARKER}\n`);
  const head = at === -1 ? (text.endsWith("\n") ? text : `${text}\n`) : text.slice(0, at);
  return `${head}${block}`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("sync-standards-areas.mjs")) {
  const data = JSON.parse(readFileSync(SPACES_PATH, "utf8"));
  for (const [name, path] of Object.entries(STANDARDS_AREA_FILES)) {
    const block = renderStandardsAreasBlock(name === "skeleton" ? "skeleton" : "standard", data);
    const next = spliceStandardsAreas(readFileSync(path, "utf8"), block);
    writeFileSync(path, next);
    console.log(`sync-standards-areas: ${name} ← ${standardsAreas(data).length} 个领域`);
  }
}
