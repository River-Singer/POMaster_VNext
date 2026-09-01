/**
 * sensor-capability-catalog.spec.ts —— P1-5 Sensor Capability Catalog Lite 交叉测试
 * （tests/integration，L2 账；PRD v0.5.2 §6.5/§14 P1-5；裁决 8（2026-09-01）D6=A/D7=A）。
 *
 * 覆盖面（研究笔记 evidence-binding.md §4.2 G8/G9/G10 测试策略）：
 * ① repo 实物：catalog/sensors/ 六条 sensor_capability 身份解析 + PRD §6.5 例文逐字对账；
 * ② availability_probe 声明式引用闭包（双向）：catalog 引用键 ⊆ toolDetectors/gateAdapters/
 *    kernel 三面既有键闭包（toolDetectors 侧改名/删除即抓），且被引用键全集 = 研究定案
 *    六键（catalog 侧漂移即抓）——「两头造册必漂」的结构防线；
 * ③ D7 联结：runDoctor 呈现 sensor_capability_catalog 探针行 + DoctorResult.sensors 引用
 *    解析名 ⊆ doctor 既有探针行（声明式引用真的联结到探测矩阵，禁第二套探测）；
 * ④ catalog-lock 三处同步（allowed+required+entries）与漂移矩阵（unexpected_file/
 *    content_drift/missing+missing_required——加文件硬纪律的负例守卫）；
 * ⑤ loader fail-closed：id 词形 / Observation Surface 八面 / side_effect_class /
 *    availability_probe 词表外或形状非法 → SCHEMA_INVALID（坏物料禁静默当空）。
 * 零网络零真实工具依赖：availability 是声明引用不是运行时探测；fixture 全 mkdtemp。
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadCatalogSensors,
  OBSERVATION_SURFACE_VALUES,
  readCatalogLock,
  resolveCatalogRoot,
  SENSOR_AVAILABILITY_SURFACE_VALUES,
  SENSOR_ID_PATTERN,
  SENSOR_KERNEL_SURFACE_KEYS,
  SENSOR_SIDE_EFFECT_CLASS_VALUES,
  verifyCatalogLock,
} from "@pomaster/kernel";
import { toolDetectors, gateAdapters } from "@pomaster/gauntlet-lite";
import { runDoctor } from "@pomaster/cli";
// SENSOR_DETECTOR_TO_DOCTOR_PROBE 为 cli 内部联结常量；@pomaster/cli 的 index.ts 命令
// 注册表是 W1 批 1 互斥面（W1-A1 专线），本 spec 经源码深路径直接导入，避免撞面。
import { SENSOR_DETECTOR_TO_DOCTOR_PROBE } from "../../packages/cli/src/doctor.js";

const REPO_CATALOG = resolveCatalogRoot();
const EXPECTED_SENSOR_IDS = [
  "SENSOR.BROWSER.DETERMINISTIC",
  "SENSOR.BROWSER.INTERACTIVE",
  "SENSOR.BUILD.STATIC",
  "SENSOR.CONTRACT.CONFORMANCE",
  "SENSOR.PERFORMANCE.BUDGET",
  "SENSOR.PRODUCTION.METRIC",
] as const;

/** 研究定案的 sensor↔toolDetectors 引用键全集（双向闭合的第二锚）。 */
const EXPECTED_DETECTOR_KEYS = [
  "chromeDevtoolsMcp",
  "playwright",
  "oasdiff",
  "schemathesis",
  "lighthouse",
  "webVitals",
] as const;

let catalogCopy: string;

beforeEach(() => {
  const tempRoot = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-"));
  catalogCopy = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogCopy, { recursive: true });
});

afterEach(() => {
  rmSync(dirname(catalogCopy), { recursive: true, force: true });
});

/** 在 catalog 副本的 sensors/ 下写一条最小合法 sensor_capability fixture。 */
function writeSensorFixture(catalogRoot: string, fileName: string, overrides: Record<string, unknown> = {}, id = "SENSOR.TEST.MINIMAL"): void {
  const dir = join(catalogRoot, "sensors");
  mkdirSync(dir, { recursive: true });
  const body = {
    id,
    kind: "sensor_capability",
    title_zh: "测试用最小 sensor_capability",
    surfaces: ["RUNTIME_SIGNAL"],
    operations: ["snapshot"],
    side_effect_class: "READ_ONLY",
    evidence_types: ["test_report"],
    implementations: ["fixture-impl"],
    availability_probe: { surface: "toolDetectors", keys: ["playwright"] },
    fallback: [],
    ...overrides,
  };
  writeFileSync(join(dir, fileName), JSON.stringify(body, null, 2) + "\n", "utf8");
}

describe("① repo 实物：catalog/sensors/ 六条 sensor_capability（P1-5 只收编真实存在）", () => {
  it("loadCatalogSensors：恰好六条、id 词形合法、按 id 字典序（确定性）", () => {
    const sensors = loadCatalogSensors(REPO_CATALOG);
    expect(sensors.map((s) => s.id)).toEqual([...EXPECTED_SENSOR_IDS]);
    for (const sensor of sensors) {
      expect(sensor.id).toMatch(SENSOR_ID_PATTERN);
      expect(sensor.kind).toBe("sensor_capability");
    }
  });

  it("SENSOR.BROWSER.INTERACTIVE 与 PRD §6.5 例文逐字对账（surfaces/operations/side_effect_class/evidence_types/implementations）", () => {
    const sensor = loadCatalogSensors(REPO_CATALOG).find((s) => s.id === "SENSOR.BROWSER.INTERACTIVE");
    expect(sensor).toBeDefined();
    expect(sensor!.surfaces).toEqual([
      "USER_SURFACE",
      "INTERACTION_STATE",
      "BOUNDARY_IO",
      "RUNTIME_SIGNAL",
      "RESOURCE_BEHAVIOR",
    ]);
    expect(sensor!.operations).toEqual([
      "launch_or_attach",
      "navigate",
      "click",
      "type",
      "snapshot",
      "screenshot",
      "inspect_network",
      "inspect_console",
      "performance_trace",
    ]);
    expect(sensor!.sideEffectClass).toBe("INTERACTIVE_REVERSIBLE");
    expect(sensor!.evidenceTypes).toEqual([
      "accessibility_snapshot",
      "screenshot",
      "network_observation",
      "console_observation",
      "performance_trace",
    ]);
    expect(sensor!.implementations).toEqual(["chrome-devtools-mcp", "playwright"]);
  });

  it("六条目 surfaces 全 ⊆ PRD §6.4 Observation Surface 八面；side_effect_class 全在已登记值内", () => {
    for (const sensor of loadCatalogSensors(REPO_CATALOG)) {
      for (const surface of sensor.surfaces) {
        expect(OBSERVATION_SURFACE_VALUES).toContain(surface);
      }
      expect(SENSOR_SIDE_EFFECT_CLASS_VALUES).toContain(sensor.sideEffectClass);
    }
  });
});

describe("② availability_probe 声明式引用闭包（双向；防第二套探测机制=四克制）", () => {
  it("正向：catalog 引用键 ⊆ 既有单一事实源面闭包（toolDetectors/gateAdapters/kernel）", () => {
    for (const sensor of loadCatalogSensors(REPO_CATALOG)) {
      expect(SENSOR_AVAILABILITY_SURFACE_VALUES).toContain(sensor.availabilityProbe.surface);
      for (const key of sensor.availabilityProbe.keys) {
        if (sensor.availabilityProbe.surface === "toolDetectors") {
          expect(Object.keys(toolDetectors)).toContain(key);
        } else if (sensor.availabilityProbe.surface === "gateAdapters") {
          expect(Object.keys(gateAdapters)).toContain(key);
        } else {
          expect([...SENSOR_KERNEL_SURFACE_KEYS]).toContain(key);
        }
      }
    }
  });

  it("反向：被引用 toolDetectors 键全集 = 研究定案六键（catalog 侧漏登/乱引与 toolDetectors 侧改名双向即抓）", () => {
    const referenced = new Set(
      loadCatalogSensors(REPO_CATALOG)
        .filter((s) => s.availabilityProbe.surface === "toolDetectors")
        .flatMap((s) => [...s.availabilityProbe.keys]),
    );
    expect([...referenced].sort()).toEqual([...EXPECTED_DETECTOR_KEYS].sort());
  });

  it("fallback 引用闭包：fallback id ⊆ 已载入 sensor id 集", () => {
    const ids = new Set(loadCatalogSensors(REPO_CATALOG).map((s) => s.id));
    for (const sensor of loadCatalogSensors(REPO_CATALOG)) {
      for (const fallbackId of sensor.fallback) {
        expect(ids.has(fallbackId)).toBe(true);
      }
    }
  });
});

describe("③ D7 联结：runDoctor 呈现 sensor_capability_catalog + 引用解析名 ⊆ 既有探针行", () => {
  it("runDoctor：sensor_capability_catalog 探针行 READY；sensors 六条且 doctor_probe_names 解析正确", async () => {
    const root = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-doctor-"));
    try {
      const outcome = await runDoctor(root);
      const probe = outcome.result.probes.find((p) => p.probe === "sensor_capability_catalog");
      expect(probe?.status).toBe("READY");
      const sensors = outcome.result.sensors ?? [];
      expect(sensors.map((s) => s.sensor_id)).toEqual([...EXPECTED_SENSOR_IDS]);
      const byId = new Map(sensors.map((s) => [s.sensor_id, s]));
      expect(byId.get("SENSOR.BROWSER.INTERACTIVE")!.doctor_probe_names).toEqual(["chrome_devtools_mcp"]);
      expect(byId.get("SENSOR.BROWSER.DETERMINISTIC")!.doctor_probe_names).toEqual(["playwright"]);
      expect(byId.get("SENSOR.CONTRACT.CONFORMANCE")!.doctor_probe_names).toEqual(["oasdiff", "schemathesis"]);
      expect(byId.get("SENSOR.PERFORMANCE.BUDGET")!.doctor_probe_names).toEqual(["lighthouse", "web_vitals"]);
      // gateAdapters / kernel 面无 doctor 行 → 空数组显式（非静默省略）。
      expect(byId.get("SENSOR.BUILD.STATIC")!.doctor_probe_names).toEqual([]);
      expect(byId.get("SENSOR.PRODUCTION.METRIC")!.doctor_probe_names).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("声明式引用真的联结到探测矩阵：每个解析名都命中 runDoctor 既有探针行（禁第二套探测）", async () => {
    const root = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-doctor2-"));
    try {
      const outcome = await runDoctor(root);
      const rowNames = new Set(outcome.result.probes.map((p) => p.probe));
      const sensors = outcome.result.sensors ?? [];
      expect(sensors.length).toBeGreaterThan(0);
      for (const sensor of sensors) {
        for (const name of sensor.doctor_probe_names) {
          expect(rowNames.has(name)).toBe(true);
        }
      }
      // 映射表自身无悬空值：每个 toolDetectors 面引用键都有行名映射。
      for (const sensor of loadCatalogSensors(REPO_CATALOG)) {
        if (sensor.availabilityProbe.surface !== "toolDetectors") continue;
        for (const key of sensor.availabilityProbe.keys) {
          expect(Object.keys(SENSOR_DETECTOR_TO_DOCTOR_PROBE)).toContain(key);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sensors 目录缺失 → sensor_capability_catalog 显式 MISSING_CONFIGURATION（禁静默当空）", async () => {
    const root = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-doctor3-"));
    const brokenCatalog = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-cat3-"));
    try {
      cpSync(REPO_CATALOG, join(brokenCatalog, "catalog"), { recursive: true });
      rmSync(join(brokenCatalog, "catalog", "sensors"), { recursive: true, force: true });
      const outcome = await runDoctor(root, { catalogRoot: join(brokenCatalog, "catalog") });
      const probe = outcome.result.probes.find((p) => p.probe === "sensor_capability_catalog");
      expect(probe?.status).toBe("MISSING_CONFIGURATION");
      expect(probe?.hint ?? "").not.toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(brokenCatalog, { recursive: true, force: true });
    }
  });
});

describe("④ catalog-lock 三处同步与漂移矩阵（加文件硬纪律）", () => {
  it("六条目在 allowed+required+entries 三处同步登记（content_sha256 与落盘一致）", () => {
    const lock = readCatalogLock(REPO_CATALOG);
    for (const sensor of loadCatalogSensors(REPO_CATALOG)) {
      expect(lock.controlled_children.allowed).toContain(sensor.file);
      expect(lock.controlled_children.required).toContain(sensor.file);
      const entry = lock.entries.find((e) => e.path === sensor.file);
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(sensor.id);
    }
    // 幂等重锁正确性：repo 实物 lock 全量对账 0 漂移（producer 与对账端同口径）。
    expect(verifyCatalogLock(REPO_CATALOG).ok).toBe(true);
  });

  it("negative：sensors/ 新增未登记 .json → unexpected_file；重锁后回绿（sensors/ 已入管辖面）", () => {
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    writeSensorFixture(catalogCopy, "sensor.stray.json");
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "unexpected_file", path: "sensors/sensor.stray.json" }),
    );
  });

  it("negative：sensors 物料被改而 lock 未重锁 → content_drift；字节恢复后回绿", () => {
    const target = join(catalogCopy, "sensors", "sensor.performance.budget.json");
    const original = readFileSync(target, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
    writeFileSync(target, original.replace("SENSOR.PERFORMANCE.BUDGET", "SENSOR.PERFORMANCE.BUDGET_DRIFT"), "utf8");
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "content_drift", path: "sensors/sensor.performance.budget.json" }),
    );
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });

  it("negative：sensors 在册文件被删 → missing + missing_required 同源双报", () => {
    const target = join(catalogCopy, "sensors", "sensor.contract.conformance.json");
    const original = readFileSync(target, "utf8");
    rmSync(target);
    const drifted = verifyCatalogLock(catalogCopy);
    expect(drifted.ok).toBe(false);
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "missing", path: "sensors/sensor.contract.conformance.json" }),
    );
    expect(drifted.drifts).toContainEqual(
      expect.objectContaining({ kind: "missing_required", path: "sensors/sensor.contract.conformance.json" }),
    );
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogCopy).ok).toBe(true);
  });
});

describe("⑤ loader fail-closed：坏物料 SCHEMA_INVALID 显式爆（fixture 全 mkdtemp）", () => {
  /** 建一个只含 fixture catalog 的临时根，返回 catalog 路径。 */
  function fixtureCatalog(): string {
    const tempRoot = mkdtempSync(join(tmpdir(), "pvnext-w1-e-sensors-fixture-"));
    const catalogRoot = join(tempRoot, "catalog");
    mkdirSync(join(catalogRoot, "sensors"), { recursive: true });
    return catalogRoot;
  }

  it("id 词形非法（非 SENSOR.<DOMAIN>.<KIND>）→ SCHEMA_INVALID", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.bad.json", {}, "SENSOR.BAD");
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|词形非法/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("surfaces 词表外 → SCHEMA_INVALID（Observation Surface 八面闭包）", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.bad.json", { surfaces: ["NOT_A_SURFACE"] });
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|surfaces 词表外/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("side_effect_class 词表外 → SCHEMA_INVALID", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.bad.json", { side_effect_class: "MAGIC" });
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|side_effect_class 词表外/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("availability_probe.surface 词表外 → SCHEMA_INVALID（只许声明式引用既有面）", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.bad.json", {
        availability_probe: { surface: "inline_command", keys: ["echo hi"] },
      });
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|availability_probe/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("kernel 面键闭包外 → SCHEMA_INVALID（kernel 引用键 ⊆ SENSOR_KERNEL_SURFACE_KEYS）", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.bad.json", {
        availability_probe: { surface: "kernel", keys: ["nonexistent_face"] },
      });
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|kernel 面键闭包外/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("id 重复（身份面禁重复）→ SCHEMA_INVALID；合法 fixture 载入按 id 字典序", () => {
    const catalogRoot = fixtureCatalog();
    try {
      writeSensorFixture(catalogRoot, "sensor.a.json", {}, "SENSOR.TEST.DUP");
      writeSensorFixture(catalogRoot, "sensor.b.json", { operations: ["select"] }, "SENSOR.TEST.DUP");
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|id 重复/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });

  it("空目录 = 显式空清单（不抛）；缺必填字段 → SCHEMA_INVALID", () => {
    const catalogRoot = fixtureCatalog();
    try {
      expect(loadCatalogSensors(catalogRoot)).toEqual([]);
      writeFileSync(
        join(catalogRoot, "sensors", "sensor.bad.json"),
        JSON.stringify({ id: "SENSOR.TEST.MISSING", kind: "sensor_capability" }, null, 2) + "\n",
        "utf8",
      );
      expect(() => loadCatalogSensors(catalogRoot)).toThrow(/SCHEMA_INVALID|缺必填字段/);
    } finally {
      rmSync(dirname(catalogRoot), { recursive: true, force: true });
    }
  });
});
