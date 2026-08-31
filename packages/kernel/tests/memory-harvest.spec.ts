/**
 * memory-harvest.spec.ts —— Memory Harvest 台账管线内核单元测试（P33a）。
 *
 * 覆盖（对位任务七面）：
 * - 桶提案确定性规则（thread-B §4.1 判别规则列的机械词面镜像：filename/header/
 *   显式 metadata 三源 + 规则序=表序首条命中 + 判不了 UNCLASSIFIED_PENDING 恒
 *   LOW——禁模糊猜测）；
 * - 三分法机械路径（thread-B §4.3：①TRUTH→needs_conflict_check 标记位；②EPISODE
 *   保序=text 逐字节零改写；③expiry 注记位机械搬运）；
 * - 分桶路由 promote（KNOWLEDGE→P28 通路恒 CANDIDATE/ADVISORY 不旁路生命周期；
 *   TRUTH→escalate_owner 且 state/ 全树字节零变；USER→user-scope 台账注入根、
 *   不入项目 Git；PENDING/REJECTED/INVALID_EXPIRED/UNCLASSIFIED/EPISODE/
 *   HARNESS_RUNTIME 各 fail-closed 面）；
 * - audit 分母封闭（total=pending+promoted+rejected 恒等式 + 七桶零填充计数 +
 *   Case N MEMORY_DRIFT 自动进 inbox 且不自动成为 Truth + 幂等去重）；
 * - harness 缺席 not_run（路径缺席/零 md 文件显式 NOT_RUN 不伪造条目；幂等重跑去重）；
 * - 再决 fail-closed（已决条目再决 TRANSITION_ILLEGAL——review 三态封闭）；
 * - AUTHORITY_POLICY 显式升格闸（默认 AUTHORITY_REQUIRED；显式 authorityUpgrade
 *   才路由 escalate_owner upgraded=true）。
 * - 装载面 fail-closed（手改已决痕迹/词表外值 SCHEMA_INVALID）+ 14 schema 逐条
 *   ajv 同构锚 + capture/decide 零改写铁律（text 字节恒等）。
 *
 * 测试卫生：harnessMemoryRoots 一律显式注入（[] 或临时目录——绝不探测真实
 * ~/.claude ~/.codex，P32 同款纪律）；userMemoryRoot 注入临时目录（绝不触碰
 * 真实 home）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Ajv from "ajv";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT,
  HUMAN,
  makeRoot,
  makeStore,
} from "./helpers.js";
import {
  GovernanceError,
  HARVEST_BUCKET_VALUES,
  MEMORY_CLASS_OF_BUCKET,
  MEMORY_CLASS_VALUES,
  REVIEW_STATE_VALUES,
  applyKnowledgeTransition,
  auditMemory,
  buildInboxEntry,
  buildStorePaths,
  captureMemory,
  classifyForHarvest,
  decideInboxEntry,
  harvestHarness,
  inboxEntryIdOf,
  parseFrontmatterMeta,
  promoteMemory,
  readInboxEntries,
  readInboxEntry,
  readKnowledgeLibrary,
  readUserMemoryLedger,
  reviewInbox,
} from "@pomaster/kernel";
import { allSchemas, memoryHarvestSchema } from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}
const validateEntry = ajv.compile(memoryHarvestSchema as object);

let root: string;

beforeEach(() => {
  root = makeRoot();
});

function stateTreeHash(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  const walk = (current: string, rel: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        out.set(
          relName,
          createHash("sha256").update(readFileSync(`${current}/${entry.name}`)).digest("hex"),
        );
      } else {
        walk(`${current}/${entry.name}`, relName);
      }
    }
  };
  walk(dir, "");
  return out;
}

function expectSameTree(before: Map<string, string>, after: Map<string, string>): void {
  const changed = [
    ...[...before.keys()].filter((key) => after.get(key) !== before.get(key)),
    ...[...after.keys()].filter((key) => !before.has(key)),
    ...[...before.keys()].filter((key) => !after.has(key)),
  ];
  expect(changed).toEqual([]);
}

function writeHarnessFile(dir: string, name: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, "utf8");
  return dir;
}

// ============================================================
// 1) 桶提案确定性规则（thread-B §4.1 判别规则的机械词面镜像）
// ============================================================

describe("桶提案确定性规则（classifyForHarvest）", () => {
  it("filename 词面规则：KNOWLEDGE/EPISODE/PREFERENCE/TRUTH 四桶逐桶命中 + 规则序=表序首条命中即止", () => {
    expect(classifyForHarvest("api-failure-lessons.md", "text").bucket).toBe("KNOWLEDGE");
    expect(classifyForHarvest("checkbox-saga.md", "text").bucket).toBe("EPISODE");
    expect(classifyForHarvest("language-preferences.md", "text").bucket).toBe("PREFERENCE");
    expect(classifyForHarvest("env-baseline-notes.md", "text").bucket).toBe("TRUTH");
    // 词面命中恒 MEDIUM（词面证据非内容理解）。
    expect(classifyForHarvest("api-failure-lessons.md", "text").confidence).toBe("MEDIUM");
    // 首条命中即止（表序即优先级）：failure 先于 baseline、saga 先于 baseline。
    expect(classifyForHarvest("failure-baseline.md", "text").bucket).toBe("KNOWLEDGE");
    expect(classifyForHarvest("baseline-saga.md", "text").bucket).toBe("EPISODE");
  });

  it("header 词面规则：文件名无信号时标题行承载判定（frontmatter 剥离后的标题行）", () => {
    expect(classifyForHarvest("notes.md", "# 认证失败模式记录\n正文").bucket).toBe("KNOWLEDGE");
    expect(classifyForHarvest("notes.md", "# 时间线复盘\n正文").bucket).toBe("EPISODE");
    expect(classifyForHarvest("notes.md", "# 个人偏好\n正文").bucket).toBe("PREFERENCE");
    expect(classifyForHarvest("notes.md", "# 技术栈现状\nVue3+element-plus").bucket).toBe("TRUTH");
  });

  it("显式 metadata 声明（frontmatter bucket/memory_class）→ HIGH——机器可读自述是最高置信", () => {
    const declaredBucket = classifyForHarvest(
      "anything.md",
      "---\nbucket: KNOWLEDGE\n---\n\n# 无关标题\n正文",
    );
    expect(declaredBucket.bucket).toBe("KNOWLEDGE");
    expect(declaredBucket.confidence).toBe("HIGH");
    const declaredClass = classifyForHarvest(
      "anything.md",
      "---\nmemory_class: USER\n---\n\n# 无关标题\n正文",
    );
    expect(declaredClass.bucket).toBe("PREFERENCE");
    expect(declaredClass.memoryClass).toBe("USER");
    expect(declaredClass.confidence).toBe("HIGH");
  });

  it("type: feedback → AUTHORITY_POLICY 升格位提案（thread-B §4.1「从 PREFERENCE/TRUTH 中升格」拦截位）", () => {
    const result = classifyForHarvest(
      "misc.md",
      "---\ntype: feedback\n---\n\n# commit 纪律\n只提交 pomaster/",
    );
    expect(result.bucket).toBe("AUTHORITY_POLICY");
    expect(result.memoryClass).toBe(MEMORY_CLASS_OF_BUCKET.AUTHORITY_POLICY);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("obsolete 词面 → INVALID_EXPIRED 特殊出口提案（被后续事实推翻）", () => {
    const byFilename = classifyForHarvest("old-superseded-mechanism.md", "text");
    expect(byFilename.bucket).toBe("INVALID_EXPIRED");
    expect(byFilename.memoryClass).toBeNull();
    const byHeader = classifyForHarvest("notes.md", "# 此方案已废弃\n正文");
    expect(byHeader.bucket).toBe("INVALID_EXPIRED");
  });

  it("判不了 → UNCLASSIFIED_PENDING 恒 LOW + memory_class=null（禁模糊猜测的显式拒绝位）", () => {
    const result = classifyForHarvest("random-notes.md", "正文无任何桶信号词面");
    expect(result.bucket).toBe("UNCLASSIFIED_PENDING");
    expect(result.confidence).toBe("LOW");
    expect(result.memoryClass).toBeNull();
    // 词表外声明不生效不猜测：bucket: GARBAGE 被忽略 → 落拒绝位而非猜测。
    const garbage = classifyForHarvest("anything.md", "---\nbucket: GARBAGE\n---\n\n正文");
    expect(garbage.bucket).toBe("UNCLASSIFIED_PENDING");
    expect(garbage.confidence).toBe("LOW");
  });

  it("确定性：同输入重放同输出（纯函数零墙钟零随机，A4）+ 桶→类映射表闭包", () => {
    const a = classifyForHarvest("x-saga.md", "# 时间线");
    const b = classifyForHarvest("x-saga.md", "# 时间线");
    expect(a).toEqual(b);
    for (const bucket of HARVEST_BUCKET_VALUES) {
      const mapped = MEMORY_CLASS_OF_BUCKET[bucket];
      if (mapped !== null) {
        expect(MEMORY_CLASS_VALUES).toContain(mapped);
      } else {
        expect(["INVALID_EXPIRED", "UNCLASSIFIED_PENDING"]).toContain(bucket);
      }
    }
    expect(MEMORY_CLASS_OF_BUCKET.PREFERENCE).toBe("USER");
    expect(MEMORY_CLASS_OF_BUCKET.AUTHORITY_POLICY).toBe("DECISION");
    expect(MEMORY_CLASS_OF_BUCKET.UNCLASSIFIED_PENDING).toBeNull();
    expect(MEMORY_CLASS_OF_BUCKET.INVALID_EXPIRED).toBeNull();
    // review 三态词形闭包（词轴 re-export 同源）。
    expect(REVIEW_STATE_VALUES).toEqual(["PENDING", "PROMOTED", "REJECTED"]);
  });

  it("frontmatter 机械解析：key:value 行级正则（无 YAML 运行时依赖）+ 无围栏空表", () => {
    expect(parseFrontmatterMeta("---\nexpiry: M6\ntype: feedback\n---\nbody")).toEqual({
      expiry: "M6",
      type: "feedback",
    });
    expect(parseFrontmatterMeta("no frontmatter")).toEqual({});
  });
});

// ============================================================
// 2) 三分法机械路径（thread-B §4.3）
// ============================================================

describe("三分法机械路径", () => {
  it("三分法①：TRUTH 桶 → needs_conflict_check=true 标记位（与 Current Truth 对照留待消费侧）；非 TRUTH 恒 false", async () => {
    const harness = writeHarnessFile(
      join(root, "harness-mem"),
      "env-baseline.md",
      "后端=已发布 178 opIds 的外部契约",
    );
    const report = await harvestHarness(root, harness);
    const truthEntry = report.harvested[0]!;
    expect(truthEntry.proposal.bucket).toBe("TRUTH");
    expect(truthEntry.needs_conflict_check).toBe(true);
    // 落盘重读一致（装载面不改写标记位）。
    expect(readInboxEntry(root, truthEntry.id).needs_conflict_check).toBe(true);
    // 非 TRUTH 桶恒 false（KNOWLEDGE 词面命中对照）。
    expect(classifyForHarvest("x-failure.md", "正文").needsConflictCheck).toBe(false);
    const capture = await captureMemory(root, "记住一个普通偏好");
    expect(capture.needs_conflict_check).toBe(false);
  });

  it("三分法②：EPISODE 保序——text 与源文件逐字节恒等（自我振荡 saga 原文零改写）", async () => {
    const saga = [
      "# checkbox saga 时间线",
      "",
      "2026-08-18 REMOVE 合计栏；2026-08-19 RESTORE 合计栏。",
      "remove↔restore 全过程保序归档，不裁决谁对。",
      "",
    ].join("\n");
    const harness = writeHarnessFile(join(root, "harness-mem"), "checkbox-saga.md", saga);
    const report = await harvestHarness(root, harness);
    const episode = report.harvested[0]!;
    expect(episode.proposal.bucket).toBe("EPISODE");
    expect(episode.text).toBe(saga); // 逐字节恒等——零改写铁律
    expect(episode.id).toBe(inboxEntryIdOf(saga)); // 内容寻址 id 与原文绑定
  });

  it("三分法③：expiry 条件注记机械搬运（OBSOLETE_AFTER_M6 型；KNOWLEDGE 桶 + expiry 注记并存）", async () => {
    const harness = writeHarnessFile(
      join(root, "harness-mem"),
      "sv14-tool-defects.md",
      "---\nexpiry: OBSOLETE_AFTER_M6\n---\n\n# 上游工具缺陷教训\nfailure pattern 正文",
    );
    const report = await harvestHarness(root, harness);
    const entry = report.harvested[0]!;
    expect(entry.proposal.expiry).toBe("OBSOLETE_AFTER_M6");
    expect(entry.proposal.bucket).toBe("KNOWLEDGE");
    expect(entry.proposal.title).toBe("上游工具缺陷教训"); // title 机械搬运（首标题行）
    // 无声明恒 null（禁猜测）。
    const noExpiry = classifyForHarvest("x-failure.md", "正文");
    expect(noExpiry.expiry).toBeNull();
  });
});

// ============================================================
// 3) captureMemory / buildInboxEntry / harvestHarness 落 inbox
// ============================================================

describe("captureMemory 与 buildInboxEntry", () => {
  it("用户「记住」请求 → inbox 条目（PENDING/user_capture/scope 两词形）+ 14 schema 同构锚", async () => {
    const entry = await captureMemory(root, "记住：回复语言偏好是中文", { scope: "user" });
    expect(entry.review_state).toBe("PENDING");
    expect(entry.source).toBe("user_capture");
    expect(entry.scope).toBe("user");
    expect(entry.proposal.bucket).toBe("UNCLASSIFIED_PENDING");
    expect(entry.proposal.memory_class).toBeNull();
    expect(entry.proposal.confidence).toBe("LOW");
    expect(entry.reviewed_by).toBeNull();
    expect(entry.promoted_route).toBeNull();
    const persisted = JSON.parse(
      readFileSync(join(root, ".pomaster/memory/inbox/capture", `${entry.id}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(validateEntry(persisted)).toBe(true);
    const projectEntry = await captureMemory(root, "记住：项目页面分母 39");
    expect(projectEntry.scope).toBe("project");
    expect(validateEntry(projectEntry)).toBe(true);
  });

  it("同文重复捕获显式拒绝（内容寻址 id 撞册——重复请求不静默重复入册）", async () => {
    await captureMemory(root, "同文重复检测样本");
    await expect(captureMemory(root, "同文重复检测样本")).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
  });

  it("buildInboxEntry 构造面无 review_state 键位——结构性写不出已决条目（thread-B §4.2 铁律形态封条）", () => {
    const entry = buildInboxEntry({
      id: inboxEntryIdOf("结构封条样本"),
      batch: "capture",
      source: "user_capture",
      scope: "project",
      text: "结构封条样本",
      proposal: {
        bucket: "TRUTH",
        memory_class: "TRUTH",
        confidence: "HIGH",
        title: null,
        extracted_to: null,
        expiry: null,
      },
      needsConflictCheck: true,
    });
    expect(entry.review_state).toBe("PENDING");
    expect(entry.needs_conflict_check).toBe(true);
    expect(validateEntry(entry)).toBe(true);
    // 词形 fail-closed：词表外 bucket / UNCLASSIFIED 携带分类 / UNCLASSIFIED 非 LOW 全拒。
    expect(() =>
      buildInboxEntry({
        id: inboxEntryIdOf("x1"),
        batch: "capture",
        source: "user_capture",
        scope: "project",
        text: "x1",
        proposal: {
          bucket: "MAYBE_TRUTH" as never,
          memory_class: null,
          confidence: "LOW",
          title: null,
          extracted_to: null,
          expiry: null,
        },
        needsConflictCheck: false,
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      buildInboxEntry({
        id: inboxEntryIdOf("x2"),
        batch: "capture",
        source: "user_capture",
        scope: "project",
        text: "x2",
        proposal: {
          bucket: "UNCLASSIFIED_PENDING",
          memory_class: "TRUTH",
          confidence: "LOW",
          title: null,
          extracted_to: null,
          expiry: null,
        },
        needsConflictCheck: false,
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      buildInboxEntry({
        id: inboxEntryIdOf("x3"),
        batch: "capture",
        source: "user_capture",
        scope: "project",
        text: "x3",
        proposal: {
          bucket: "UNCLASSIFIED_PENDING",
          memory_class: null,
          confidence: "HIGH",
          title: null,
          extracted_to: null,
          expiry: null,
        },
        needsConflictCheck: false,
      }),
    ).toThrow(GovernanceError);
  });
});

describe("harvestHarness（COMPATIBILITY 模式）", () => {
  it("全量读取→逐条提案→落 inbox：batch 目录式 + origin_text_archive 相对引用 + recorded_at_seq 采样", async () => {
    const { root: storeRoot } = await makeStore();
    const harness = writeHarnessFile(
      join(storeRoot, "harness-mem"),
      "grid-failure-lessons.md",
      "# 失败模式\nBatch write pipelines without transactional primitives recur destructive rewrite",
    );
    writeHarnessFile(harness, "env-baseline.md", "# 技术栈\nVue3+element-plus+ag-grid");
    const report = await harvestHarness(storeRoot, harness, { harnessName: "claude" });
    expect(report.status).toBe("HARVESTED");
    expect(report.batch).toBe("harvest-claude");
    expect(report.scanned).toBe(2);
    expect(report.harvested).toHaveLength(2);
    for (const entry of report.harvested) {
      expect(validateEntry(entry)).toBe(true);
      expect(entry.batch).toBe("harvest-claude");
      expect(entry.source).toBe("memory_harvest");
      expect(entry.scope).toBe("project");
      expect(entry.recorded_at_seq).not.toBeNull();
      expect(["claude/env-baseline.md", "claude/grid-failure-lessons.md"]).toContain(
        entry.origin_text_archive,
      );
    }
    // filename 词面预筛跨两桶：failure→KNOWLEDGE（needs_conflict_check=false）、
    // baseline→TRUTH（needs_conflict_check=true——三分法①标记位随桶）。
    const byBucket = new Map(report.harvested.map((entry) => [entry.proposal.bucket, entry]));
    expect(byBucket.get("KNOWLEDGE")?.needs_conflict_check).toBe(false);
    expect(byBucket.get("TRUTH")?.needs_conflict_check).toBe(true);
    const byId = readInboxEntry(storeRoot, report.harvested[0]!.id);
    expect(byId.id).toBe(report.harvested[0]!.id);
  });

  it("harness 路径缺席 / 零 md 文件 = 显式 NOT_RUN，不伪造条目（P32 fail-closed 三态同源）", async () => {
    const missing = await harvestHarness(root, join(root, "no-such-harness"));
    expect(missing.status).toBe("NOT_RUN");
    expect(missing.notRunReason).toBe("HARNESS_PATH_MISSING");
    expect(missing.harvested).toEqual([]);
    expect(existsSync(join(root, ".pomaster/memory/inbox"))).toBe(false);
    const emptyDir = join(root, "empty-harness");
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, "not-markdown.txt"), "ignored", "utf8");
    const empty = await harvestHarness(root, emptyDir);
    expect(empty.status).toBe("NOT_RUN");
    expect(empty.notRunReason).toBe("HARNESS_MEMORY_EMPTY");
    expect(empty.harvested).toEqual([]);
    expect(readInboxEntries(root)).toEqual([]);
  });

  it("幂等重跑：同文跨 batch 去零新增（skippedExisting 显式计数；重跑字节稳定）", async () => {
    const harness = writeHarnessFile(
      join(root, "harness-mem"),
      "saga-timeline.md",
      "# 时间线\n事件史",
    );
    const first = await harvestHarness(root, harness);
    expect(first.harvested).toHaveLength(1);
    const second = await harvestHarness(root, harness);
    expect(second.harvested).toEqual([]);
    expect(second.skippedExisting).toEqual([`harvest-harness-mem/${first.harvested[0]!.id}.json`]);
    expect(readInboxEntries(root)).toHaveLength(1);
  });
});

// ============================================================
// 4) reviewInbox / decideInboxEntry（batch review 只改标签不改原文）
// ============================================================

describe("reviewInbox / decideInboxEntry", () => {
  it("reviewInbox 过滤四面 + 分母封闭计数呈现（counts 恒全量分母）；空 inbox = 空报告合法态", async () => {
    const empty = reviewInbox(root);
    expect(empty.counts).toEqual({ total: 0, pending: 0, promoted: 0, rejected: 0 });
    expect(empty.entries).toEqual([]);
    const a = await captureMemory(root, "filter 样本一");
    await captureMemory(root, "filter 样本二");
    await decideInboxEntry(root, {
      id: a.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "reclassify to TRUTH",
      reclassify: { bucket: "TRUTH", memoryClass: "TRUTH" },
    });
    expect(reviewInbox(root, { state: "PENDING" }).entries).toHaveLength(1);
    expect(reviewInbox(root, { bucket: "TRUTH" }).entries).toHaveLength(1);
    expect(reviewInbox(root, { source: "user_capture" }).entries).toHaveLength(2);
    expect(reviewInbox(root, { batch: "capture" }).entries).toHaveLength(2);
    expect(reviewInbox(root, { source: "memory_drift_audit" }).entries).toEqual([]);
    // 分母封闭呈现：counts 恒全量分母（不受过滤影响）。
    expect(reviewInbox(root, { state: "PENDING" }).counts).toEqual({
      total: 2,
      pending: 1,
      promoted: 1,
      rejected: 0,
    });
  });

  it("decideInboxEntry：PENDING→PROMOTED 只改 review_state+review_notes+reviewed_by，text 字节恒等（零改写铁律）", async () => {
    const entry = await captureMemory(root, "零改写铁律样本原文");
    const decided = await decideInboxEntry(root, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "batch review 2026-08-31： KNOWLEDGE 失败模式",
    });
    expect(decided.review_state).toBe("PROMOTED");
    expect(decided.text).toBe(entry.text); // 逐字节恒等
    expect(decided.reviewed_by).toEqual({ actor_type: "human", actor: "owner", self_attested: false });
    expect(decided.promoted_route).toBeNull(); // decide 不写路由产物（晋升是独立动作）
    expect(decided.needs_conflict_check).toBe(false); // 未 reclassify 不变
    expect(validateEntry(decided)).toBe(true);
  });

  it("reclassify 只改分类标签：bucket/memory_class 修正 + TRUTH 重算 needs_conflict_check + REJECTED 留痕", async () => {
    const entry = await captureMemory(root, "分类标签修正样本");
    const promoted = await decideInboxEntry(root, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "reclassify to TRUTH（现状基线陈述）",
      reclassify: { bucket: "TRUTH", memoryClass: "TRUTH" },
    });
    expect(promoted.proposal.bucket).toBe("TRUTH");
    expect(promoted.proposal.memory_class).toBe("TRUTH");
    expect(promoted.needs_conflict_check).toBe(true); // 机械不变量在唯一标签变更点重算
    expect(promoted.text).toBe(entry.text);
    const rejected = await captureMemory(root, "评审否决样本");
    const rejectedEntry = await decideInboxEntry(root, {
      id: rejected.id,
      outcome: "REJECTED",
      reviewedBy: HUMAN,
      note: "被后续事实推翻——INVALID_EXPIRED 处置",
    });
    expect(rejectedEntry.review_state).toBe("REJECTED");
    expect(rejectedEntry.promoted_route).toBeNull();
    expect(validateEntry(rejectedEntry)).toBe(true);
  });

  it("再决 fail-closed：已决条目再决 TRANSITION_ILLEGAL（review 三态封闭无回退边）", async () => {
    const entry = await captureMemory(root, "再决拒绝样本");
    await decideInboxEntry(root, { id: entry.id, outcome: "PROMOTED", reviewedBy: HUMAN, note: "一次裁决" });
    await expect(
      decideInboxEntry(root, { id: entry.id, outcome: "REJECTED", reviewedBy: HUMAN, note: "翻案尝试" }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
    const rejected = await captureMemory(root, "再决拒绝样本二");
    await decideInboxEntry(root, { id: rejected.id, outcome: "REJECTED", reviewedBy: HUMAN, note: "一次否决" });
    await expect(
      decideInboxEntry(root, { id: rejected.id, outcome: "PROMOTED", reviewedBy: HUMAN, note: "回退尝试" }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
  });

  it("decide 词形与矛盾 fail-closed：UNCLASSIFIED+分类矛盾拒绝、空注记拒绝、缺席 id OBJECT_NOT_FOUND", async () => {
    const entry = await captureMemory(root, "decide 防线样本");
    await expect(
      decideInboxEntry(root, {
        id: entry.id,
        outcome: "PROMOTED",
        reviewedBy: HUMAN,
        note: "x",
        reclassify: { bucket: "UNCLASSIFIED_PENDING", memoryClass: "TRUTH" },
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      decideInboxEntry(root, { id: entry.id, outcome: "PROMOTED", reviewedBy: HUMAN, note: "  " }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      decideInboxEntry(root, { id: "HM-000000000000", outcome: "PROMOTED", reviewedBy: HUMAN, note: "x" }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});

// ============================================================
// 5) promoteMemory 分桶路由
// ============================================================

describe("promoteMemory 分桶路由", () => {
  it("PENDING 不可晋升（batch review 是唯一人工闸——Case N 不得自动成为 Truth 的闸前镜像）", async () => {
    const entry = await captureMemory(root, "未评审不可晋升样本");
    await expect(promoteMemory(root, entry.id, { actor: AGENT })).rejects.toMatchObject({
      code: "TRANSITION_ILLEGAL",
    });
  });

  it("REJECTED 终态不可晋升", async () => {
    const entry = await captureMemory(root, "被拒不可晋升样本");
    await decideInboxEntry(root, { id: entry.id, outcome: "REJECTED", reviewedBy: HUMAN, note: "淘汰" });
    await expect(promoteMemory(root, entry.id, { actor: AGENT })).rejects.toMatchObject({
      code: "TRANSITION_ILLEGAL",
    });
  });

  it("KNOWLEDGE 桶 → P28 record 通路：恒 CANDIDATE 起步 + authority 恒 ADVISORY（不旁路生命周期）+ promoted_route 登记 + source_episodes 谱系", async () => {
    const { root: storeRoot } = await makeStore();
    const entry = await captureMemory(storeRoot, "clobber 教训：批量写入必须带事务原语");
    await decideInboxEntry(storeRoot, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "KNOWLEDGE 失败模式确认",
      reclassify: { bucket: "KNOWLEDGE", memoryClass: "KNOWLEDGE" },
    });
    const truthIndexBefore = readFileSync(join(storeRoot, ".pomaster/state/truth-index.json"), "utf8");
    const result = await promoteMemory(storeRoot, entry.id, {
      actor: AGENT,
      knowledge: {
        id: "KNOWLEDGE.FE.HARVEST.CLOBBER_BATCH_WRITES",
        kind: "FAILURE_PATTERN",
        title: "Batch write pipeline clobbers",
        triggers: ["batch write pipeline"],
      },
    });
    expect(result.outcome).toMatchObject({
      route: "knowledge_library",
      knowledgeId: "KNOWLEDGE.FE.HARVEST.CLOBBER_BATCH_WRITES",
      knowledgeStatus: "CANDIDATE",
      knowledgeAuthority: "ADVISORY",
    });
    expect(result.entry.promoted_route).toEqual({
      kind: "knowledge_library",
      ref: "KNOWLEDGE.FE.HARVEST.CLOBBER_BATCH_WRITES",
      upgraded: false,
    });
    expect(result.entry.text).toBe(entry.text);
    // truth-index 字节零变（knowledge 侧车走 P28 通路，Canonical State 分母不动）。
    expect(readFileSync(join(storeRoot, ".pomaster/state/truth-index.json"), "utf8")).toBe(truthIndexBefore);
    // P28 通路产物同构：source_episodes 带谱系回指 inbox 条目。
    const library = readKnowledgeLibrary(buildStorePaths(storeRoot));
    expect(library.entries).toHaveLength(1);
    expect(library.entries[0]!.source_episodes).toContain(
      `.pomaster/memory/inbox/capture/${entry.id}`,
    );
  });

  it("KNOWLEDGE 桶防线路由：缺 knowledge 申报 / 非 KNOWLEDGE 前缀 id / 词表外 kind 全拒；重复晋升拒", async () => {
    const { root: storeRoot } = await makeStore();
    const entry = await captureMemory(storeRoot, "KNOWLEDGE 防线样本");
    await decideInboxEntry(storeRoot, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "k",
      reclassify: { bucket: "KNOWLEDGE", memoryClass: "KNOWLEDGE" },
    });
    await expect(promoteMemory(storeRoot, entry.id, { actor: AGENT })).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
    await expect(
      promoteMemory(storeRoot, entry.id, {
        actor: AGENT,
        knowledge: { id: "PAGE.DASHBOARD", kind: "FAILURE_PATTERN", title: "x" },
      }),
    ).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
    await expect(
      promoteMemory(storeRoot, entry.id, {
        actor: AGENT,
        knowledge: { id: "KNOWLEDGE.FE.X", kind: "MAYBE_PATTERN", title: "x" },
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    // 申报合法后晋升一次性：重复 promote fail-closed（promoted_route 已登记）。
    await promoteMemory(storeRoot, entry.id, {
      actor: AGENT,
      knowledge: { id: "KNOWLEDGE.FE.HARVEST.DEFENSE_SAMPLE", kind: "FAILURE_PATTERN", title: "防线样本" },
    });
    await expect(
      promoteMemory(storeRoot, entry.id, {
        actor: AGENT,
        knowledge: { id: "KNOWLEDGE.FE.HARVEST.DEFENSE_SAMPLE", kind: "FAILURE_PATTERN", title: "防线样本" },
      }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
  });

  it("TRUTH → escalate_owner：不写 Canonical State（state/ 全树字节零变）+ Case N 正向镜像", async () => {
    const { root: storeRoot } = await makeStore();
    const stateDir = join(storeRoot, ".pomaster/state");
    const entry = await captureMemory(storeRoot, "后端=已发布 178 opIds 的外部契约（TRUTH escalate 样本）");
    await decideInboxEntry(storeRoot, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "现状基线陈述",
      reclassify: { bucket: "TRUTH", memoryClass: "TRUTH" },
    });
    const before = stateTreeHash(stateDir);
    const result = await promoteMemory(storeRoot, entry.id, { actor: HUMAN });
    expect(result.outcome).toMatchObject({ route: "escalate_owner", upgraded: false });
    expect(result.entry.promoted_route).toEqual({ kind: "escalate_owner", ref: null, upgraded: false });
    expect(stateTreeHash(stateDir).size).toBeGreaterThan(0);
    expectSameTree(before, stateTreeHash(stateDir)); // state/ 全树字节零变
    expect(validateEntry(result.entry)).toBe(true);
  });

  it("USER/PREFERENCE → user-scope 台账（注入根落账，不入项目 Git——§48.2 第 6 类）", async () => {
    const { root: storeRoot } = await makeStore();
    const userRoot = makeRoot();
    const entry = await captureMemory(storeRoot, "回复语言偏好是中文（偏好样本）", { scope: "user" });
    await decideInboxEntry(storeRoot, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "真实偏好确认",
      reclassify: { bucket: "PREFERENCE", memoryClass: "USER" },
    });
    const before = stateTreeHash(join(storeRoot, ".pomaster/state"));
    const result = await promoteMemory(storeRoot, entry.id, { actor: HUMAN, userMemoryRoot: userRoot });
    expect(result.outcome).toMatchObject({ route: "user_ledger" });
    const ledger = readUserMemoryLedger(userRoot);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      id: entry.id,
      memory_class: "USER",
      scope: "user",
    });
    expect(ledger.entries[0]!.text).toBe(entry.text);
    // 项目 state/ 零变 + 项目树无台账落点（不入项目 Git）。
    expectSameTree(before, stateTreeHash(join(storeRoot, ".pomaster/state")));
    expect(existsSync(join(storeRoot, ".pomaster/user-memory-ledger.json"))).toBe(false);
    expect(validateEntry(result.entry)).toBe(true);
  });

  it("INVALID_EXPIRED / UNCLASSIFIED_PENDING / EPISODE / HARNESS_RUNTIME promote 全 fail-closed（显式缺席非静默）", async () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly bucket: (typeof HARVEST_BUCKET_VALUES)[number];
      readonly memoryClass: (typeof MEMORY_CLASS_VALUES)[number] | null;
    }> = [
      { name: "INVALID_EXPIRED", bucket: "INVALID_EXPIRED", memoryClass: null },
      { name: "UNCLASSIFIED", bucket: "UNCLASSIFIED_PENDING", memoryClass: null },
      { name: "EPISODE", bucket: "EPISODE", memoryClass: "EPISODE" },
    ];
    let n = 0;
    for (const testCase of cases) {
      n += 1;
      const entry = await captureMemory(root, `路由拒绝样本 ${n}：${testCase.name}`);
      await decideInboxEntry(root, {
        id: entry.id,
        outcome: "PROMOTED",
        reviewedBy: HUMAN,
        note: `reclassify to ${testCase.name}`,
        reclassify: {
          bucket: testCase.bucket,
          memoryClass: testCase.memoryClass === null ? null : testCase.memoryClass,
        },
      });
      await expect(promoteMemory(root, entry.id, { actor: HUMAN })).rejects.toMatchObject({
        code: "SCHEMA_INVALID",
      });
    }
    // HARNESS_RUNTIME 误配（桶 TRUTH 配类 HARNESS_RUNTIME）在 decide 即拒——
    // bucket↔class 一致性不变量（修复轮封条）把拒绝时点提前到 reclassify，
    // 非法组合根本落不了盘（promote 不可达）。
    const hr = await captureMemory(root, "路由拒绝样本 HARNESS_RUNTIME");
    await expect(
      decideInboxEntry(root, {
        id: hr.id,
        outcome: "PROMOTED",
        reviewedBy: HUMAN,
        note: "reclassify to HARNESS_RUNTIME",
        reclassify: { bucket: "TRUTH", memoryClass: "HARNESS_RUNTIME" },
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    const hrReread = readInboxEntry(root, hr.id);
    expect(hrReread.review_state).toBe("PENDING");
  });
});

// ============================================================
// 6) AUTHORITY_POLICY 显式升格闸
// ============================================================

describe("AUTHORITY_POLICY 显式升格闸（thread-B §4.1「从 PREFERENCE/TRUTH 中升格」）", () => {
  it("默认拒绝：无 authorityUpgrade 申报 → AUTHORITY_REQUIRED（用户明令升格不可由机器默认代行）", async () => {
    const entry = await captureMemory(root, "commit 纪律：只提交 pomaster/");
    await decideInboxEntry(root, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "用户明令确认（type=feedback）",
      reclassify: { bucket: "AUTHORITY_POLICY", memoryClass: "DECISION" },
    });
    await expect(promoteMemory(root, entry.id, { actor: HUMAN })).rejects.toMatchObject({
      code: "AUTHORITY_REQUIRED",
    });
  });

  it("显式 authorityUpgrade=true → escalate_owner 路由（upgraded=true 呈报升格申报）", async () => {
    const entry = await captureMemory(root, "vendored 文件不可就地修改（升格样本）");
    await decideInboxEntry(root, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "用户明令确认",
      reclassify: { bucket: "AUTHORITY_POLICY", memoryClass: "DECISION" },
    });
    const result = await promoteMemory(root, entry.id, { actor: HUMAN, authorityUpgrade: true });
    expect(result.outcome).toMatchObject({ route: "escalate_owner", upgraded: true });
    expect(result.entry.promoted_route).toEqual({ kind: "escalate_owner", ref: null, upgraded: true });
    expect(result.entry.text).toBe(entry.text);
  });
});

// ============================================================
// 7) auditMemory：分母封闭 + Case N MEMORY_DRIFT
// ============================================================

describe("auditMemory 分母封闭与 MEMORY_DRIFT", () => {
  it("分母封闭恒等式 total=pending+promoted+rejected + 七桶零填充计数 + batches 清单", async () => {
    const a = await captureMemory(root, "audit 样本一");
    const b = await captureMemory(root, "audit 样本二");
    await captureMemory(root, "audit 样本三（拒）");
    await decideInboxEntry(root, { id: a.id, outcome: "PROMOTED", reviewedBy: HUMAN, note: "ok" });
    await decideInboxEntry(root, { id: b.id, outcome: "REJECTED", reviewedBy: HUMAN, note: "dup" });
    const report = await auditMemory(root, { harnessMemoryRoots: [] });
    expect(report.totals).toEqual({ total: 3, pending: 1, promoted: 1, rejected: 1 });
    expect(report.identityOk).toBe(true);
    expect(report.totals.total).toBe(
      report.totals.pending + report.totals.promoted + report.totals.rejected,
    );
    for (const bucket of HARVEST_BUCKET_VALUES) {
      expect(typeof report.buckets[bucket]).toBe("number");
    }
    expect(report.buckets.UNCLASSIFIED_PENDING).toBe(3);
    expect(report.buckets.TRUTH).toBe(0);
    expect(report.batches).toEqual(["capture"]);
    expect(report.drift.detected).toBe(false);
    expect(report.drift.enteredInbox).toBe(false);
    expect(report.drift.inboxEntryId).toBeNull();
  });

  it("Case N：MEMORY_DRIFT 探测命中 → drift 项自动进 inbox（PENDING/source=memory_drift_audit）且不自动成为 Truth", async () => {
    const { root: storeRoot } = await makeStore();
    const fakeHarnessRoot = makeRoot(); // 存在的 harness 记忆位（仅存在性探测）
    const stateDir = join(storeRoot, ".pomaster/state");
    const before = stateTreeHash(stateDir);
    const report = await auditMemory(storeRoot, { harnessMemoryRoots: [fakeHarnessRoot] });
    expect(report.drift.detected).toBe(true);
    expect(report.drift.finding).toContain("MEMORY_DRIFT"); // 词形复用 P32
    expect(report.drift.enteredInbox).toBe(true);
    const driftEntry = readInboxEntry(storeRoot, report.drift.inboxEntryId!);
    expect(driftEntry.source).toBe("memory_drift_audit");
    expect(driftEntry.review_state).toBe("PENDING");
    expect(driftEntry.proposal.bucket).toBe("UNCLASSIFIED_PENDING");
    expect(driftEntry.proposal.memory_class).toBeNull();
    expect(driftEntry.batch).toBe("audit-drift");
    expect(validateEntry(driftEntry)).toBe(true);
    // 不自动成为 Truth：state/ 全树字节零变（drift 入 inbox 是 memory/ 子树落点）。
    expectSameTree(before, stateTreeHash(stateDir));
    // 幂等：重跑 audit 同文同 id 去重，不重复入册。
    const rerun = await auditMemory(storeRoot, { harnessMemoryRoots: [fakeHarnessRoot] });
    expect(rerun.drift.enteredInbox).toBe(false);
    expect(rerun.drift.inboxEntryId).toBe(report.drift.inboxEntryId);
    expect(readInboxEntries(storeRoot)).toHaveLength(1);
  });

  it("装载面 fail-closed：手改词表外 review_state / PENDING 携带 promoted_route / UNCLASSIFIED 携带分类 全部 SCHEMA_INVALID", async () => {
    const entry = await captureMemory(root, "装载面防线样本");
    const path = join(root, ".pomaster/memory/inbox/capture", `${entry.id}.json`);
    const base = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const write = (mutated: Record<string, unknown>): void =>
      writeFileSync(path, JSON.stringify(mutated, null, 2), "utf8");
    write({ ...base, review_state: "MAYBE_PROMOTED" });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    write({ ...base, promoted_route: { kind: "escalate_owner", ref: null, upgraded: false } });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    write({
      ...base,
      proposal: { ...(base.proposal as Record<string, unknown>), memory_class: "TRUTH" },
    });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    write(base); // 还原后装载恢复合法态
    expect(readInboxEntries(root)).toHaveLength(1);
  });

  it("KNOWLEDGE 通路产物与 P28 生命周期同源：harvest 晋升的 CANDIDATE 可经既有语义入口 VALIDATED（不旁路证据）", async () => {
    const { store, root: storeRoot } = await makeStore();
    const entry = await captureMemory(storeRoot, "同面转移对照样本");
    await decideInboxEntry(storeRoot, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "k",
      reclassify: { bucket: "KNOWLEDGE", memoryClass: "KNOWLEDGE" },
    });
    const promoted = await promoteMemory(storeRoot, entry.id, {
      actor: AGENT,
      knowledge: {
        id: "KNOWLEDGE.FE.HARVEST.TRANSFER_SAMPLE",
        kind: "ENGINEERING_PATTERN",
        title: "同面转移对照",
      },
    });
    expect(promoted.outcome.knowledgeStatus).toBe("CANDIDATE");
    // P28 生命周期照常可用：harvest 产物经既有语义入口走验证边。
    const validated = await applyKnowledgeTransition(store, {
      id: "KNOWLEDGE.FE.HARVEST.TRANSFER_SAMPLE",
      to: "VALIDATED",
      reasonShort: "验证边照常可用（不旁路证据）",
      transitionedBy: HUMAN,
    });
    expect(validated.status).toBe("VALIDATED");
    expect(validated.last_validated_at).not.toBeNull();
    const library = readKnowledgeLibrary(buildStorePaths(storeRoot));
    expect(library.entries.map((e) => e.status)).toEqual(["VALIDATED"]);
    expect(library.entries[0]!.source_episodes).toContain(
      `.pomaster/memory/inbox/capture/${entry.id}`,
    );
  });
});

// ============================================================
// 红队攻击面回归（P33 修复轮封条——双核验红队三个 MAJOR 得手面转回归）
// ============================================================

describe("红队攻击面回归（修复轮封条）", () => {
  it("攻击面2 封条：手改 text 保留旧 id → 装载面内容寻址重算 fail-closed（SCHEMA_INVALID）", async () => {
    const entry = await captureMemory(root, "内容寻址完整性样本");
    const path = join(root, ".pomaster/memory/inbox/capture", `${entry.id}.json`);
    const base = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    // 篡改 text（原文改写）但保留旧 id——红队实测全链放行的形态。
    writeFileSync(
      path,
      JSON.stringify({ ...base, text: `${String(base.text)}（篡改后缀）` }, null, 2),
      "utf8",
    );
    expect(() => readInboxEntries(root)).toThrow(/内容寻址不符/);
    // 还原后装载恢复合法态。
    writeFileSync(path, JSON.stringify(base, null, 2), "utf8");
    expect(readInboxEntries(root)).toHaveLength(1);
  });

  it("攻击面1c 封条：手改 PROMOTED + reviewed_by 空对象/残缺结构 → 装载面拒绝（已决留痕须三字段齐备）", async () => {
    const entry = await captureMemory(root, "已决留痕结构样本");
    const path = join(root, ".pomaster/memory/inbox/capture", `${entry.id}.json`);
    const base = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const write = (mutated: Record<string, unknown>): void =>
      writeFileSync(path, JSON.stringify(mutated, null, 2), "utf8");
    // 红队原形态：review_state=PROMOTED + reviewed_by={} 空对象 + review_notes 伪注记。
    write({
      ...base,
      review_state: "PROMOTED",
      reviewed_by: {},
      review_notes: "伪造评审注记",
    });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    // 残缺变体：actor_type 词表外。
    write({
      ...base,
      review_state: "PROMOTED",
      reviewed_by: { actor_type: "nobody", actor: "x", self_attested: false },
      review_notes: "注记",
    });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    // 残缺变体：actor 空。
    write({
      ...base,
      review_state: "REJECTED",
      reviewed_by: { actor_type: "human", actor: "", self_attested: false },
      review_notes: "注记",
    });
    expect(() => readInboxEntries(root)).toThrow(GovernanceError);
    // 合法三字段齐备（对照：真实 decide 产物可装载）。
    write(base);
    await decideInboxEntry(root, { id: entry.id, outcome: "PROMOTED", reviewedBy: HUMAN, note: "合法评审" });
    expect(readInboxEntries(root)).toHaveLength(1);
  });

  it("攻击面4b 封条：MEMORY_DRIFT 探测 NOT_RUN → audit drift.probeStatus=NOT_RUN 三态透传（不折叠为 not detected）", async () => {
    const { root: storeRoot } = await makeStore();
    // NUL 字节路径 → statSync 非 ENOENT 异常 → unprobeable → P32 层 NOT_RUN（portability.spec 先例构造）。
    const report = await auditMemory(storeRoot, {
      harnessMemoryRoots: [join(storeRoot, "bad\0path")],
    });
    expect(report.drift.probeStatus).toBe("NOT_RUN");
    expect(report.drift.detected).toBe(false);
    expect(report.drift.probeStatusDetail).toContain("不可探测");
    // NOT_RUN 不入 inbox（没有 drift 事实——只有探测命中才入册）。
    expect(report.drift.enteredInbox).toBe(false);
    expect(report.drift.inboxEntryId).toBeNull();
  });

  it("audit 显式空态：零条目 inbox → empty=true（空≠静默健康）+ PASS 探测下 probeStatus=PASS", async () => {
    const { root: storeRoot } = await makeStore();
    const report = await auditMemory(storeRoot, { harnessMemoryRoots: [] });
    expect(report.empty).toBe(true);
    expect(report.totals.total).toBe(0);
    expect(report.drift.probeStatus).toBe("PASS");
    expect(report.drift.detected).toBe(false);
  });

  it("reclassify bucket↔class 一致性：KNOWLEDGE 桶配 USER 类 → SCHEMA_INVALID（MEMORY_CLASS_OF_BUCKET 单值映射封条）", async () => {
    const entry = await captureMemory(root, "一致性封条样本");
    await expect(
      decideInboxEntry(root, {
        id: entry.id,
        outcome: "PROMOTED",
        reviewedBy: HUMAN,
        note: "误配尝试",
        reclassify: { bucket: "KNOWLEDGE", memoryClass: "USER" },
      }),
    ).rejects.toThrow(/MEMORY_CLASS_OF_BUCKET 不符/);
    // 非法组合不落盘（拒绝发生在 persist 之前）。
    const reread = readInboxEntry(root, entry.id);
    expect(reread.review_state).toBe("PENDING");
    // 对照：合法组合（PREFERENCE↔USER）放行。
    const ok = await decideInboxEntry(root, {
      id: entry.id,
      outcome: "PROMOTED",
      reviewedBy: HUMAN,
      note: "合法组合",
      reclassify: { bucket: "PREFERENCE", memoryClass: "USER" },
    });
    expect(ok.proposal.memory_class).toBe("USER");
  });

  it("TRUTH 词面补「规模」：filename/header 规模信号 → TRUTH 桶（thread-B §4.1 判别规则逐字回填）", () => {
    const a = classifyForHarvest("规模报告.md", "任意正文");
    expect(a.bucket).toBe("TRUTH");
    const b = classifyForHarvest("misc.md", "# 规模\n正文");
    expect(b.bucket).toBe("TRUTH");
  });
});
