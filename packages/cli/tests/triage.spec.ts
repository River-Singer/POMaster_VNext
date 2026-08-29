/**
 * triage.spec.ts —— 规则桶判定边界（C1）与 --json 契约快照。
 */
import { describe, expect, it } from "vitest";
import {
  TRIAGE_ABSENT_SIGNALS,
  TRIAGE_EVIDENCE_GRADES,
  TRIAGE_PROFILES,
  TRIAGE_TTL_HOURS,
  triageRequest,
} from "@pomaster/cli";

describe("triage 规则桶（C1）——升档触发 E_CONTRACT_KEYWORD", () => {
  it("英文 contract 关键词 → STANDARD / INFERRED", () => {
    const r = triageRequest("update the payment contract for checkout api");
    expect(r.profile).toBe("STANDARD");
    expect(r.evidence_grade).toBe("INFERRED");
    expect(r.matched_rule).toBe("E_CONTRACT_KEYWORD");
    expect(r.matched_keywords).toContain("contract");
  });

  it("中文 契约 关键词 → STANDARD", () => {
    const r = triageRequest("调整绑定车型的 API 契约 字段");
    expect(r.profile).toBe("STANDARD");
    expect(r.matched_keywords).toContain("契约");
  });

  it("openapi 关键词 → STANDARD", () => {
    expect(triageRequest("sync openapi spec").profile).toBe("STANDARD");
  });

  it("跨域 关键词 → STANDARD（§27.3 跨 Domain 直接 STANDARD）", () => {
    const r = triageRequest("这个改动涉及跨域 对象引用");
    expect(r.profile).toBe("STANDARD");
    expect(r.evidence_grade).toBe("INFERRED");
  });

  it("global 词形 → STANDARD（T-1，bench-0003 批准：修复 replay-R2-008 全局影响面系统性低判；globally 经子串命中）", () => {
    const r = triageRequest(
      "Disable AG Grid automatic boolean rendering globally",
    );
    expect(r.profile).toBe("STANDARD");
    expect(r.matched_rule).toBe("E_CONTRACT_KEYWORD");
    expect(r.matched_keywords).toContain("global");
    expect(r.evidence_grade).toBe("INFERRED");
  });

  it("global 升档触发优先于文案/样式短路（「全局样式统一」类落 STANDARD 而非 MINIMAL——T-1 risk_notes ① Owner 裁定方向）", () => {
    const r = triageRequest("global 样式统一：调整全站 badge 样式");
    expect(r.profile).toBe("STANDARD");
    expect(r.matched_rule).toBe("E_CONTRACT_KEYWORD");
    expect(r.matched_keywords).toContain("global");
  });

  it("大写 CONTRACT 大小写不敏感命中", () => {
    expect(triageRequest("CONTRACT review").profile).toBe("STANDARD");
  });

  it("STANDARD 判定的缺席信号包含 contract_surface_registry（关键词推断不冒充实测）", () => {
    const r = triageRequest("contract change");
    expect(r.absent_signals).toContain("contract_surface_registry");
  });
});

describe("triage 规则桶——短路快道 F_COPY_STYLE_ONLY", () => {
  it("纯文案 → MINIMAL / MEASURED", () => {
    const r = triageRequest("修改首页标题文案");
    expect(r.profile).toBe("MINIMAL");
    expect(r.evidence_grade).toBe("MEASURED");
    expect(r.matched_rule).toBe("F_COPY_STYLE_ONLY");
  });

  it("纯样式（css）→ MINIMAL", () => {
    expect(triageRequest("tweak button css").profile).toBe("MINIMAL");
  });

  it("typo 关键词 → MINIMAL", () => {
    expect(triageRequest("fix typo in label").profile).toBe("MINIMAL");
  });

  it("文案 + 契约 同时出现 → 升档优先，判 STANDARD", () => {
    const r = triageRequest("调整文案并更新 contract 定义");
    expect(r.profile).toBe("STANDARD");
    expect(r.matched_rule).toBe("E_CONTRACT_KEYWORD");
  });
});

describe("triage 规则桶——兜底缺省 DEFAULT_NO_SIGNAL", () => {
  it("普通请求 → LIGHT / NOT_CONFIGURED", () => {
    const r = triageRequest("为绑定车型页新增批量导入功能");
    expect(r.profile).toBe("LIGHT");
    expect(r.evidence_grade).toBe("NOT_CONFIGURED");
    expect(r.matched_rule).toBe("DEFAULT_NO_SIGNAL");
    expect(r.matched_keywords).toEqual([]);
  });

  it("空请求 → LIGHT / NOT_CONFIGURED（无信号不报绿）", () => {
    const r = triageRequest("");
    expect(r.profile).toBe("LIGHT");
    expect(r.evidence_grade).toBe("NOT_CONFIGURED");
  });
});

describe("triage 输出契约（任务书字段 + 缺席显式）", () => {
  it("三桶 ttl_hours 恒为 168（C9）", () => {
    for (const request of ["contract", "文案", "新增功能"]) {
      expect(triageRequest(request).ttl_hours).toBe(TRIAGE_TTL_HOURS);
      expect(triageRequest(request).ttl_hours).toBe(168);
    }
  });

  it("absent_signals 恒为同一稳定清单（判定必附缺席信号，跨线共识 2）", () => {
    for (const request of ["contract", "文案", "新增功能"]) {
      expect([...triageRequest(request).absent_signals]).toEqual([
        ...TRIAGE_ABSENT_SIGNALS,
      ]);
    }
    expect(TRIAGE_ABSENT_SIGNALS).toContain("diff_stat");
    expect(TRIAGE_ABSENT_SIGNALS).toContain("governed_object_hits");
  });

  it("profile 恒在词表内（MINIMAL|LIGHT|STANDARD；STRICT/CRITICAL 为 prompt_only 不产出）", () => {
    for (const request of ["contract", "文案", "新增功能", "", "openapi 样式"]) {
      expect(TRIAGE_PROFILES).toContain(triageRequest(request).profile);
    }
  });

  it("evidence_grade 恒在三值子集内", () => {
    for (const request of ["contract", "文案", "新增功能"]) {
      expect(TRIAGE_EVIDENCE_GRADES).toContain(
        triageRequest(request).evidence_grade,
      );
    }
  });

  it("同输入重放字节稳定（A4 幂等判定，禁墙钟）", () => {
    const a = JSON.stringify(triageRequest("adjust css 样式"));
    const b = JSON.stringify(triageRequest("adjust css 样式"));
    expect(a).toBe(b);
  });

  it("JSON 形态恰含任务契约四字段 + matched_rule/matched_keywords", () => {
    const parsed = JSON.parse(
      JSON.stringify(triageRequest("contract")),
    ) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "absent_signals",
      "evidence_grade",
      "matched_keywords",
      "matched_rule",
      "profile",
      "ttl_hours",
    ]);
  });
});
