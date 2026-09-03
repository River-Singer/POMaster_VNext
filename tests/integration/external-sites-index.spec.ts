/**
 * external-sites-index.spec.ts —— 外部参照站点索引守卫（P-v06 收尾批次）。
 *
 * 守卫面（双向钉，防手补假条目）：
 * - schema 形状（document_type/schema_version/usage_note/sites 必备）；
 * - 每条 site 必备七字段（name/url/domains/themes/used_for/verified/source_research）
 *   + verified 日期闭包（2026-09-02 / 2026-09-03 两日实抓锚）+ source_research
 *   闭包（任务 research 四份核实报告之一，在位时实存对账）；
 * - URL 词形卫生（https:// 开头、无绝对盘符、无 file://、无模板占位符——
 *   x-path-ethics 同源纪律）；
 * - 双向钉闭包：index 全部 URL（url + pages）必须真实出现在至少一份 research
 *   文件中（反向——防手编假条目）；research 四文件提取的全部 URL（去 query/锚、
 *   截断 CJK 粘带、滤模板占位符）必须被 index 某条 URL 前缀覆盖（正向——防漏收）。
 *   覆盖判据 = 精确相等或以「URL/」为界前缀命中（站点主入口统辖其页级 URL）。
 *
 * 环境依赖：research 目录在 .trellis 任务空间（POMaster_VNext 仓库外）。
 * 缺席 = skip 语义放行（concept-ledger.spec.ts 读旧体系账本同款先例——CI 快
 * 照自包含，本地/消费方全量环境实钉）。schema/词形/唯一性守卫不依赖外部目录，
 * 任何环境恒执行。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const indexPath = join(repoRoot, "references", "external-sites-index.yaml");
const researchDir = join(
  repoRoot,
  "..",
  ".trellis",
  "tasks",
  "09-02-vnext-prd-v06-governed-substrate",
  "research",
);

const RESEARCH_FILES = [
  "external-design-references.md",
  "frontend-state-references.md",
  "backend-references.md",
  "runtime-references.md",
] as const;

/** js-yaml 时间戳类型归一：裸 YYYY-MM-DD 被解析成 Date → ISO yyyy-mm-dd 词形；string 原样。 */
function normalizeVerified(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

/** 索引本体闭包：verified 只认两日实抓锚（报告 Date 头逐字对齐）。 */
const VERIFIED_DATE_CLOSURE = new Set(["2026-09-02", "2026-09-03"]);

interface SiteEntry {
  readonly name: string;
  readonly url: string;
  readonly pages?: readonly string[];
  readonly domains: readonly string[];
  readonly themes: readonly string[];
  readonly used_for: string;
  /** js-yaml 把裸 YYYY-MM-DD 解析成 Date（YAML 时间戳类型）——装载后归一为 ISO 词形再判。 */
  readonly verified: string | Date;
  readonly source_research: string;
}

interface SitesIndexDocument {
  readonly document_type: string;
  readonly schema_version: number;
  readonly usage_note: string;
  readonly sites: readonly SiteEntry[];
}

/** research 文件内 URL 词元（空格/ASCII 括号引号/表格竖线/全角标点为词界）。 */
const URL_TOKEN_PATTERN = /https?:\/\/[^\s)>"'`，。；：、|]+/g;

/**
 * 词元归一：截断粘带的非 ASCII 可打印词符（全角括号/CJK 注记）→ 去尾标点 →
 * 去 query/锚 → 滤模板占位符（如 repo1.maven.org/maven2/<path>、
 * opentelemetry.io/schemas/<semconv版本>——占位符不是实抓 URL）→ 限 https 词形
 * 且 host 含点。返回 null = 不计入闭包分母。
 */
function normalizeUrlToken(token: string): string | null {
  let end = token.length;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) {
      end = index;
      break;
    }
  }
  let url = token.slice(0, end).replace(/[.,;:]+$/, "");
  if (url.includes("<") || url.includes(">")) return null;
  url = url.split("#")[0].split("?")[0];
  if (!url.startsWith("https://")) return null;
  const host = url.slice("https://".length).split("/")[0] ?? "";
  if (!/^[^/]+\.[^/]+/.test(host)) return null;
  return url;
}

/** 覆盖判据：精确相等，或以「U/」为界前缀命中（U 尾随斜杠时以 U 为界）。 */
function covers(coverUrl: string, candidate: string): boolean {
  if (candidate === coverUrl) return true;
  const boundary = coverUrl.endsWith("/") ? coverUrl : `${coverUrl}/`;
  return candidate.startsWith(boundary);
}

function indexUrls(sites: readonly SiteEntry[]): string[] {
  const urls: string[] = [];
  for (const site of sites) {
    urls.push(site.url);
    for (const page of site.pages ?? []) urls.push(page);
  }
  return urls;
}

function researchFileTexts(): string[] {
  return RESEARCH_FILES.map((file) => readFileSync(join(researchDir, file), "utf8"));
}

describe("外部参照站点索引守卫（references/external-sites-index.yaml）", () => {
  const raw = readFileSync(indexPath, "utf8");
  const index = yaml.load(raw) as SitesIndexDocument;
  const sites = index.sites ?? [];

  it("schema 形状齐备（document_type/schema_version/usage_note/sites）", () => {
    expect(index.document_type).toBe("external-sites-index");
    expect(index.schema_version).toBe(1);
    expect(typeof index.usage_note).toBe("string");
    expect(index.usage_note.length).toBeGreaterThan(0);
    expect(Array.isArray(index.sites)).toBe(true);
    expect(index.usage_note).toContain("禁止凭训练数据推测");
  });

  it("站点规模与唯一性（≥15 站——四份报告穷举分母；name/url 全域唯一）", () => {
    expect(sites.length).toBeGreaterThanOrEqual(15);
    const names = sites.map((site) => site.name);
    expect(new Set(names).size, "site.name 零重复").toBe(names.length);
    const urls = sites.map((site) => site.url);
    expect(new Set(urls).size, "site.url 零重复").toBe(urls.length);
  });

  it("每条 site 七字段必备（name/url/domains/themes/used_for/verified/source_research）", () => {
    for (const site of sites) {
      const label = site.name ?? "<unnamed>";
      expect(typeof site.name, `${label} name`).toBe("string");
      expect(typeof site.url, `${label} url`).toBe("string");
      expect(typeof site.used_for, `${label} used_for`).toBe("string");
      expect(site.used_for.length, `${label} used_for 非空`).toBeGreaterThan(0);
      expect(Array.isArray(site.domains), `${label} domains`).toBe(true);
      expect(site.domains.length, `${label} domains 非空`).toBeGreaterThan(0);
      expect(Array.isArray(site.themes), `${label} themes`).toBe(true);
      expect(site.themes.length, `${label} themes 非空`).toBeGreaterThan(0);
      expect(
        typeof normalizeVerified(site.verified),
        `${label} verified 归一后须 string（${String(site.verified)}）`,
      ).toBe("string");
      expect(typeof site.source_research, `${label} source_research`).toBe("string");
    }
  });

  it("verified 日期闭包（2026-09-02 / 2026-09-03——报告 Date 头逐字对齐，禁未来/陈旧假锚）", () => {
    for (const site of sites) {
      const verified = normalizeVerified(site.verified);
      expect(
        VERIFIED_DATE_CLOSURE.has(verified),
        `${site.name} verified 词形非法：${verified}`,
      ).toBe(true);
    }
  });

  it("source_research 闭包（四份任务核实报告之一；research 目录在位时实存对账）", () => {
    const closed = new Set<string>(RESEARCH_FILES);
    for (const site of sites) {
      expect(
        closed.has(site.source_research),
        `${site.name} source_research 非四份报告之一：${site.source_research}`,
      ).toBe(true);
    }
    if (existsSync(researchDir)) {
      for (const file of RESEARCH_FILES) {
        expect(
          existsSync(join(researchDir, file)),
          `research 文件缺席：${file}`,
        ).toBe(true);
      }
    }
  });

  it("URL 词形卫生（https:// 开头、无绝对盘符、无 file://、无模板占位符——x-path-ethics 同源纪律）", () => {
    for (const url of indexUrls(sites)) {
      expect(url.startsWith("https://"), `须 https:// 词形：${url}`).toBe(true);
      expect(/^[A-Za-z]:[\\/]/.test(url), `禁绝对盘符：${url}`).toBe(false);
      expect(url.includes("file://"), `禁 file:// 词形：${url}`).toBe(false);
      expect(url.includes("<"), `禁模板占位符：${url}`).toBe(false);
      expect(url.includes(" ") || url.includes("）"), `URL 词形禁空白/全角括号粘带：${url}`).toBe(false);
    }
  });

  it("双向钉·反向：index 全部 URL 都真实出现在至少一份 research 文件（防手补假条目）", () => {
    if (!existsSync(researchDir)) return; // skip 语义放行（环境无 .trellis 任务空间）
    const texts = researchFileTexts();
    for (const url of indexUrls(sites)) {
      const hit = texts.some((text) => text.includes(url));
      expect(
        hit,
        `index URL 未见于任何 research 文件（手补假条目嫌疑）：${url}`,
      ).toBe(true);
    }
  });

  it("双向钉·正向：research 四文件全部 URL 都被 index 覆盖（精确或站点前缀——防漏收）", () => {
    if (!existsSync(researchDir)) return; // skip 语义放行（环境无 .trellis 任务空间）
    const coverSet = indexUrls(sites);
    const uncovered: string[] = [];
    for (const file of RESEARCH_FILES) {
      const text = readFileSync(join(researchDir, file), "utf8");
      const tokens = text.match(URL_TOKEN_PATTERN) ?? [];
      const normalized = new Set<string>();
      for (const token of tokens) {
        const url = normalizeUrlToken(token);
        if (url !== null) normalized.add(url);
      }
      for (const url of normalized) {
        if (!coverSet.some((cover) => covers(cover, url))) {
          uncovered.push(`${file}: ${url}`);
        }
      }
    }
    expect(
      uncovered,
      `research URL 未被索引覆盖（漏收站点/页面）：\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });
});
