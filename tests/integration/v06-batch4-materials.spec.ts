/**
 * v06-batch4-materials.spec.ts —— P-v06 批次 4 catalog 物料半场验收
 * （RUNTIME 两条目：ENVIRONMENT_PARITY + OBSERVABILITY_BINDING；研究锚纪律 +
 * 诚实缺席裁定词形闸）。
 *
 * 判据锚（研究唯一事实源 = runtime-references.md，2026-09-03 opentelemetry.io 官方
 * 文档/GitHub API/12factor/Spring/kustomize/kubectl/Argo CD/OpenFeature/Liquibase
 * 实抓；PRD v0.6 §85/§86/§102/§103/§215 逐字）：
 * - 两 id 全集在场 + layer 分档（ENVIRONMENT_PARITY=ARCHETYPE——§215 域形状定义；
 *   OBSERVABILITY_BINDING=PATTERN——§85 Binding 语义跨信号域复用的机制模式）；
 * - ENVIRONMENT_PARITY：六维闭包（Runtime Version/Config/Feature Flag/DB Schema/
 *   Dependency/External Integration——§215 逐字）+ Dependency/External Integration
 *   两维如实标注 self-defined（研究差异表 §215 行：无单点主流工具，禁伪造业界
 *   标准引用）+ ENVIRONMENT_DRIFT 产出结构内置 severity + ignore_rules（研究题 2
 *   关键结论：漂移噪声治理是 Argo CD 实证必要组成）+ deployment.environment.name
 *   新词形与 well-known 四值（旧词形只允许出现在 deprecated 差异注记——正则闸
 *   deployment\.environment(?!\.name)，负向先行排除新词形）；
 * - OBSERVABILITY_BINDING：OTLP 四信号含 profiles（研究题 1 差异表：PRD §85 漏
 *   profiles——差异注记在场）+ 按域 Status（HTTP/DB=Mixed、RPC=Release Candidate、
 *   Messaging=Development——禁把六域当统一标准）+ resource 词形 service.name 等
 *   + 「OTel 是 Provider 不复制 APM」绑定语义（§85 逐字）+ defaults 零硬编码
 *   版本号（semconv 月级发版——版本位只在锚位注记/Collector 现状字段）；
 * - 每份 x-research-anchors.sources 非空且带 2026-09-03 日期锚 + URL 非空 + 锚
 *   runtime-references.md（防「无锚物料」回潮——批次 1/2/3 纪律延续）。
 * 深层字段经原样 JSON 直读（batch2/batch3 spec 同法）；id/layer/composition 经
 * kernel loadCatalogArchetypes 消费面（单一读取面纪律）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";

const CATALOG = resolveCatalogRoot();
const materials = loadCatalogArchetypes(CATALOG);
const byId = new Map(materials.map((entry) => [entry.id, entry]));

/** 原样 JSON 直读（深层字段判卷面）。 */
function rawMaterial(id: string): Record<string, unknown> {
  const entry = byId.get(id);
  expect(entry, `物料在册: ${id}`).toBeDefined();
  return JSON.parse(readFileSync(join(CATALOG, entry!.file), "utf8")) as Record<string, unknown>;
}

/** 物料文件原文（词形闸判卷面——整文件字节级扫描）。 */
function rawText(id: string): string {
  const entry = byId.get(id);
  expect(entry, `物料在册: ${id}`).toBeDefined();
  return readFileSync(join(CATALOG, entry!.file), "utf8");
}

const BATCH4_IDS = [
  "RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY",
  "RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING",
] as const;

/** 旧词形正则（负向先行排除新词形 deployment.environment.name）。 */
const DEPRECATED_ENV_PATTERN = /deployment\.environment(?!\.name)/;

/** defaults 版本号禁词（semconv 月级发版——版本位只在锚位注记/provenance）。 */
const DEFAULTS_VERSION_PATTERN = /1\.44|1\.60|v1\.66|v0\.160|1\.10\.0/;

describe("批次 4 两物料全集（layer 分档：域形状=ARCHETYPE / 机制模式=PATTERN）", () => {
  it("两 id 全集在场 + kind=archetype + layer 分档（ENVIRONMENT_PARITY=ARCHETYPE / OBSERVABILITY_BINDING=PATTERN）+ semantic 三槽落位", () => {
    expect(BATCH4_IDS.length).toBe(2);
    const layers: Record<string, string> = {
      "RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY": "ARCHETYPE",
      "RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING": "PATTERN",
    };
    for (const id of BATCH4_IDS) {
      const entry = byId.get(id);
      expect(entry, `在册: ${id}`).toBeDefined();
      expect(entry!.kind).toBe("archetype");
      expect(entry!.layer, `${id} layer 分档`).toBe(layers[id]!);
      expect(entry!.semantic.whenToUse, `${id} when_to_use 落位`).toBeTruthy();
      expect(entry!.semantic.whenNotToUse, `${id} when_not_to_use 落位`).toBeTruthy();
    }
  });

  it("批次 4 物料分母：repo archetypes 39→41（+2）", () => {
    expect(materials.length).toBe(41);
  });

  it("刻意缺席裁定在场：OBSERVABILITY_BINDING 不登记 sensor 本体（无既有探测器/probe 键可引，登记即假绿——禁止空壳仪式）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING") as {
      constraints: string[];
    };
    const joined = body.constraints.join("\n");
    expect(joined).toContain("SENSOR.OTEL.TRACE");
    expect(joined).toContain("登记即假绿");
    // RUNTIME 家族零 sensor 物料（sensors/ 目录无 OTEL 登记位——loadCatalogSensors
    // 分母在 kernel sensor-capability-catalog spec 守门，此处只钉物料侧缺席语义）。
    expect(rawText("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING")).toContain("availability_probe");
  });
});

describe("ENVIRONMENT_PARITY（PRD §215 六维 + 研究题 2：Environment Parity 现行实践）", () => {
  it("六维闭包逐维在场（§215 逐字：Runtime Version/Config/Feature Flag/DB Schema/Dependency/External Integration）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY") as {
      defaults: { comparison_dimensions: Record<string, unknown>; drift_output: { name: string } };
    };
    expect(Object.keys(body.defaults.comparison_dimensions).sort()).toEqual([
      "config",
      "db_schema",
      "dependency",
      "external_integration",
      "feature_flag",
      "runtime_version",
    ]);
    expect(body.defaults.drift_output.name).toBe("ENVIRONMENT_DRIFT");
  });

  it("Dependency/External Integration 两维如实标注 self-defined（禁伪造业界标准引用）；其余四维 verified 且实锚词形在场", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY") as {
      defaults: {
        comparison_dimensions: Record<
          string,
          { source: string; status: string; wording_anchors: string[] }
        >;
      };
    };
    const dims = body.defaults.comparison_dimensions;
    // 两维 self-defined（研究差异表 §215 行裁定如实落位）。
    expect(dims["dependency"]!.status).toBe("self-defined");
    expect(dims["dependency"]!.source).toContain("无单点主流工具");
    expect(dims["dependency"]!.source).toContain("resist the urge to use different backing services");
    expect(dims["external_integration"]!.status).toBe("self-defined");
    // 四维 verified + 实锚词形抽查（研究题 2 核实清单）。
    expect(dims["config"]!.status).toBe("verified");
    expect(dims["config"]!.wording_anchors).toContain("kubectl diff");
    expect(dims["config"]!.source).toContain("spring.profiles.active");
    expect(dims["config"]!.source).toContain("base/overlays");
    expect(dims["feature_flag"]!.status).toBe("verified");
    expect(dims["feature_flag"]!.source).toContain("incubating");
    expect(dims["feature_flag"]!.wording_anchors).toContain("feature_flag.key");
    expect(dims["db_schema"]!.status).toBe("verified");
    expect(dims["db_schema"]!.wording_anchors).toEqual(["diff", "diff-changelog", "Drift Report"]);
    expect(dims["db_schema"]!.note).toContain("Flyway 侧未核实");
  });

  it("ENVIRONMENT_DRIFT 产出结构内置 severity + ignore_rules（Argo CD 噪声治理实证——研究题 2 关键结论）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY") as {
      defaults: {
        drift_output: {
          fields: string[];
          shape: string;
          severity: { levels: string[]; rule: string };
          ignore_rules: { forms: string[]; noise_sources: string[]; rule: string };
        };
      };
    };
    expect(body.defaults.drift_output.fields).toEqual([
      "dimension",
      "expected",
      "actual",
      "severity",
      "ignore_rules",
    ]);
    // 期望态 vs 实际态 + 结构化差异（kubectl diff 退出码/Argo CD OutOfSync/Liquibase Drift Report 同构）。
    expect(body.defaults.drift_output.shape).toContain("期望态");
    expect(body.defaults.drift_output.shape).toContain("实际态");
    expect(body.defaults.drift_output.shape).toContain("OutOfSync");
    expect(body.defaults.drift_output.severity.levels).toEqual(["CRITICAL", "MAJOR", "MINOR"]);
    expect(body.defaults.drift_output.severity.rule).toContain("不得静默入账");
    expect(body.defaults.drift_output.ignore_rules.forms.length).toBe(3);
    expect(body.defaults.drift_output.ignore_rules.noise_sources).toContain(
      "controller/mutating webhook 改写对象",
    );
    expect(body.defaults.drift_output.ignore_rules.rule).toContain("门禁因误报被关掉");
  });

  it("deployment.environment.name 新词形 + well-known 四值 + PRD 五环境映射；旧词形只允许出现在 deprecated 差异注记（正则闸）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY") as {
      defaults: {
        environment_name: {
          wording: string;
          well_known_values: string[];
          prd_environment_mapping: Record<string, string>;
        };
      };
      deprecated_wording_note: string;
    };
    expect(body.defaults.environment_name.wording).toBe("deployment.environment.name");
    expect(body.defaults.environment_name.well_known_values).toEqual([
      "development",
      "production",
      "staging",
      "test",
    ]);
    expect(body.defaults.environment_name.prd_environment_mapping).toEqual({
      LOCAL: "development",
      DEV: "development",
      TEST: "test",
      STAGING: "staging",
      PRODUCTION: "production",
    });
    // 旧词形只出现在 deprecated 注记（剔除该字段后全文零旧词形——负向先行正则）。
    const rest = { ...body } as Record<string, unknown>;
    delete rest["deprecated_wording_note"];
    expect(DEPRECATED_ENV_PATTERN.test(JSON.stringify(rest)), "旧词形泄漏到注记之外").toBe(false);
    expect(body.deprecated_wording_note).toContain("deployment.environment");
    expect(body.deprecated_wording_note).toContain("Deprecated");
    expect(body.deprecated_wording_note).toContain("deployment.environment.name");
  });
});

describe("OBSERVABILITY_BINDING（PRD §85-86/§102-§103 + 研究题 1：OTel 现行语义）", () => {
  it("OTLP 四信号含 profiles + PRD §85 漏 profiles 差异注记在场（研究题 1 差异表）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING") as {
      defaults: { signals: { bound: string[]; gap_note: string } };
    };
    expect(body.defaults.signals.bound).toEqual(["traces", "metrics", "logs", "profiles"]);
    expect(body.defaults.signals.gap_note).toContain("漏 profiles");
    expect(body.defaults.signals.gap_note).toContain("§85");
  });

  it("按域 Status 逐域附档禁当统一标准：http/database=Mixed、rpc=Release Candidate、messaging=Development、service 系经实体族 Stable", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING") as {
      defaults: { domain_status: Record<string, string> };
    };
    const status = body.defaults.domain_status;
    expect(status["http"]).toBe("Mixed");
    expect(status["database"]).toBe("Mixed");
    expect(status["rpc"]).toBe("Release Candidate");
    expect(status["messaging"]).toBe("Development");
    expect(status["service"]).toContain("Stable");
    expect(status["service_instance"]).toContain("Stable");
    expect(status["rule"]).toContain("禁当统一标准");
  });

  it("resource 词形 service.name/service.version/deployment.environment.name 在场 + 「OTel 是 Provider 不复制 APM」绑定语义（§85 逐字）", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING") as {
      defaults: { resource_identity: Record<string, string> };
      binding_rule: string;
      deprecated_wording_note: string;
    };
    const identity = body.defaults.resource_identity;
    expect(Object.keys(identity)).toEqual([
      "service.name",
      "service.version",
      "deployment.environment.name",
      "service.namespace",
      "service.instance.id",
    ]);
    expect(identity["service.name"]).toContain("Stable");
    expect(identity["service.version"]).toContain("Stable");
    expect(identity["deployment.environment.name"]).toContain("Stable");
    expect(body.binding_rule).toContain("不替代 APM");
    expect(body.binding_rule).toContain("只建立语义 Binding");
    // 旧词形纪律同 ENVIRONMENT_PARITY：只允许出现在 deprecated 注记。
    const rest = { ...body } as Record<string, unknown>;
    delete rest["deprecated_wording_note"];
    expect(DEPRECATED_ENV_PATTERN.test(JSON.stringify(rest)), "旧词形泄漏到注记之外").toBe(false);
    expect(body.deprecated_wording_note).toContain("Deprecated");
  });

  it("defaults 零硬编码版本号（semconv 月级发版——版本位只在锚位注记/Collector 现状字段）；Collector 双版本线现状在场", () => {
    const body = rawMaterial("RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING") as {
      defaults: Record<string, unknown>;
      collector_status: string;
      "x-research-anchors": { note: string };
    };
    expect(DEFAULTS_VERSION_PATTERN.test(JSON.stringify(body.defaults)), "defaults 疑似硬编码版本号").toBe(false);
    // Collector 双版本线 v1.66.0/v0.160.0 现状（defaults 之外字段）+ 1.x 稳定性纪律。
    expect(body.collector_status).toContain("v1.66.0/v0.160.0");
    expect(body.collector_status).toContain("至少一个 signal stable");
    // semconv 版本位只在锚位注记（provenance 位）。
    expect(body["x-research-anchors"].note).toContain("1.44.0");
    // 成熟度锚用「≥ 现行版语义」词形（禁硬编码）。
    const maturity = (body.defaults as { maturity_anchor: string }).maturity_anchor;
    expect(maturity).toContain("≥ 现行版语义");
    expect(maturity).toContain("禁硬编码版本号");
  });
});

describe("研究锚纪律（防「无锚物料」回潮；批次 1/2/3 纪律延续）", () => {
  it("每份批次 4 物料 x-research-anchors.sources 非空 + URL 非空 + 带 2026-09-03 日期锚", () => {
    for (const id of BATCH4_IDS) {
      const body = rawMaterial(id) as {
        "x-research-anchors": { note?: string; sources: { url: string; fetched: string }[] };
      };
      const anchors = body["x-research-anchors"];
      expect(anchors, `${id} 锚位在场`).toBeDefined();
      expect(anchors.sources.length, `${id} sources 非空`).toBeGreaterThan(0);
      expect(
        anchors.sources.some((source) => source.fetched === "2026-09-03"),
        `${id} 带 2026-09-03 日期锚`,
      ).toBe(true);
      for (const source of anchors.sources) {
        expect(source.url.length, `${id} source url 非空`).toBeGreaterThan(0);
      }
    }
  });

  it("研究事实源锚在后：每份物料至少一锚指向 runtime-references.md（2026-09-03）", () => {
    for (const id of BATCH4_IDS) {
      const body = rawMaterial(id) as {
        "x-research-anchors": { sources: { url: string }[] };
      };
      expect(
        body["x-research-anchors"].sources.some((source) =>
          source.url.includes("runtime-references.md"),
        ),
        `${id} 锚 runtime-references.md`,
      ).toBe(true);
    }
  });
});
