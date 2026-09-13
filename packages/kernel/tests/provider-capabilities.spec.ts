/**
 * provider-capabilities.spec.ts —— Provider 能力映射（W4-S4 · 战役 W4 R4-3 +
 * 09-10 PRD REQ-11「不支持的 Provider 档位可解释」+ R §5.2 Provider-neutral +
 * reference-patterns 候选降级词形）。
 *
 * 判据锚：
 * - 四维度三值词形（SP 提案待追认）：native_async / native_steering / cancellable /
 *   tool_discovery × native|absent|unknown——**全部由探针结果驱动，零硬编码
 *   Provider 型号断言**（不把某 Provider API 叙述当跨 Provider 保证，R4-3 红线）；
 * - unknown = 探针缺席/报错——禁猜（缺探针 ≠ 不支持；报错 ≠ 支持；两者都不许
 *   洗成任一确定词形）；探针在场返回非布尔 → SCHEMA_INVALID（§58 三探针同款
 *   纪律：静默真值化会把「探测不出」洗成「支持」）；
 * - 降级语义映射（reference-patterns 逐条词形——产品可验证的降级语义，非假定
 *   已有的 API）：native_async.absent→同步步骤+持久记录；
 *   native_steering.absent→下一派发边界应用新约束（W4-S3 载体已就位）；
 *   cancellable.absent→明确状态+隔离冲突结果；tool_discovery.absent→预编译较小
 *   工具集；unknown 与 absent 同走声明式降级（未确证的能力不使用——安全边界）；
 * - 与既有 §58 三探针零破坏：probeRuntimeCapabilities / evaluateCapabilityDegradation /
 *   planRoleExecution 契约面不动（runtime-adapter.spec 回归）；本模块是**平行
 *   扩展面**——不向 AgentRuntime/RuntimeCapabilities 追加任何字段；
 * - 纯函数纪律：全部断言零 store、零 IO、零墙钟（同输入重放 deep equal，A4）。
 */
import { describe, expect, it } from "vitest";
import {
  PROVIDER_CAPABILITY_BASIS_VALUES,
  PROVIDER_CAPABILITY_DEGRADATIONS,
  PROVIDER_CAPABILITY_DIMENSIONS,
  PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE,
  PROVIDER_CAPABILITY_PROBE_METHODS,
  PROVIDER_CAPABILITY_SUPPORT_VALUES,
  probeProviderCapabilities,
  type ProviderCapabilityDimension,
  type ProviderCapabilityProbe,
} from "@pomaster/kernel";

// ============================================================
// fixture 工厂（探针注入面——四维可选方法）
// ============================================================

/** 全探针在场的 fake（每维返回值可指定；缺维传 undefined 即物理删除方法）。 */
function fakeProbe(
  returns: Partial<Record<ProviderCapabilityDimension, boolean>>,
  options: {
    /** 指定维度探针抛错（unknown 的「报错」形态）。 */
    throws?: ProviderCapabilityDimension[];
    /** 探针调用计数（探测 = 每方法恰一次的可测形态）。 */
    calls?: Record<string, number>;
  } = {},
): ProviderCapabilityProbe {
  const probe: Record<string, unknown> = {};
  for (const dimension of PROVIDER_CAPABILITY_DIMENSIONS) {
    const method = PROVIDER_CAPABILITY_PROBE_METHODS[dimension];
    if (returns[dimension] === undefined && !options.throws?.includes(dimension)) {
      continue; // 物理缺席——不定义方法键
    }
    probe[method] = () => {
      options.calls ??= {};
      options.calls[dimension] = (options.calls[dimension] ?? 0) + 1;
      if (options.throws?.includes(dimension)) {
        throw new Error(`探针故障（fake）：${method}`);
      }
      return returns[dimension] as boolean;
    };
  }
  return probe as ProviderCapabilityProbe;
}

// ============================================================
// A 段：三值词形（探针结果驱动——native / absent / unknown 禁猜）
// ============================================================

describe("三值词形（探针结果驱动）", () => {
  it("全探针在场且 true → 全 native + basis=probe_true + degradation=null + degraded=false", () => {
    const report = probeProviderCapabilities(
      fakeProbe({ native_async: true, native_steering: true, cancellable: true, tool_discovery: true }),
    );
    expect(report.rows.map((row) => row.dimension)).toEqual([...PROVIDER_CAPABILITY_DIMENSIONS]);
    expect(report.rows.every((row) => row.support === "native")).toBe(true);
    expect(report.rows.every((row) => row.basis === "probe_true")).toBe(true);
    expect(report.rows.every((row) => row.degradation === null)).toBe(true);
    expect(report.degraded).toBe(false);
    expect(report.all_unknown).toBe(false);
    expect(report.native_count).toBe(4);
  });

  it("全探针在场且 false → 全 absent + basis=probe_false + 逐维降级 id + degraded=true", () => {
    const report = probeProviderCapabilities(
      fakeProbe({ native_async: false, native_steering: false, cancellable: false, tool_discovery: false }),
    );
    expect(report.rows.every((row) => row.support === "absent")).toBe(true);
    expect(report.rows.every((row) => row.basis === "probe_false")).toBe(true);
    expect(report.rows.every((row) => row.degradation !== null)).toBe(true);
    expect(report.degraded).toBe(true);
    expect(report.all_unknown).toBe(false);
    expect(report.native_count).toBe(0);
  });

  it("探针方法缺席 → unknown + basis=probe_absent + 降级 id（缺探针 ≠ 不支持，禁猜）", () => {
    // 一个方法都不给 = 未接入真实 Provider 的诚实缺省形态。
    const report = probeProviderCapabilities(fakeProbe({}));
    expect(report.rows.every((row) => row.support === "unknown")).toBe(true);
    expect(report.rows.every((row) => row.basis === "probe_absent")).toBe(true);
    expect(report.rows.every((row) => row.probe_error === null)).toBe(true);
    expect(report.rows.every((row) => row.degradation !== null)).toBe(true);
    expect(report.degraded).toBe(true);
    expect(report.all_unknown).toBe(true);
    expect(report.native_count).toBe(0);
  });

  it("探针报错 → unknown + basis=probe_threw + probe_error 留痕（报错 ≠ 支持，unknown 有据）", () => {
    const report = probeProviderCapabilities(
      fakeProbe({ native_async: true, cancellable: false }, { throws: ["native_steering", "tool_discovery"] }),
    );
    const threw = report.rows.filter((row) => row.basis === "probe_threw");
    expect(threw.map((row) => row.dimension).sort()).toEqual(["native_steering", "tool_discovery"]);
    for (const row of threw) {
      expect(row.support).toBe("unknown");
      expect(row.probe_error).toContain("探针故障");
      expect(row.degradation).not.toBeNull();
    }
    // 报错不牵连他维：真探针照常出确定词形。
    const native = report.rows.find((row) => row.dimension === "native_async");
    expect(native?.support).toBe("native");
    const absent = report.rows.find((row) => row.dimension === "cancellable");
    expect(absent?.support).toBe("absent");
    expect(report.all_unknown).toBe(false);
    expect(report.degraded).toBe(true);
  });

  it("混合形态逐行独立：native 行零降级、absent/unknown 行各带降级（partial 支持不互相洗白）", () => {
    const report = probeProviderCapabilities(
      fakeProbe({ native_async: true, native_steering: false }),
    );
    const byDim = new Map(report.rows.map((row) => [row.dimension, row]));
    expect(byDim.get("native_async")?.support).toBe("native");
    expect(byDim.get("native_async")?.degradation).toBeNull();
    expect(byDim.get("native_steering")?.support).toBe("absent");
    expect(byDim.get("native_steering")?.degradation).toBe("constraint_at_next_dispatch_boundary");
    expect(byDim.get("cancellable")?.support).toBe("unknown");
    expect(byDim.get("tool_discovery")?.support).toBe("unknown");
    expect(report.native_count).toBe(1);
    expect(report.degraded).toBe(true);
    expect(report.all_unknown).toBe(false);
  });

  it("探针在场返回非布尔 → SCHEMA_INVALID（§58 同款：静默真值化会把「探测不出」洗成「支持」）", () => {
    const broken = {
      supportsNativeAsync: () => "yes" as unknown as boolean,
      supportsNativeSteering: () => true,
      supportsCancellable: () => true,
      supportsToolDiscovery: () => true,
    };
    expect(() => probeProviderCapabilities(broken)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("探测 = 每维探针恰调用一次（不缓存、不重试、不推断——§58 探测纪律同构）", () => {
    const calls: Record<string, number> = {};
    probeProviderCapabilities(
      fakeProbe({ native_async: true, native_steering: false, cancellable: true, tool_discovery: false }, { calls }),
    );
    expect(calls).toEqual({ native_async: 1, native_steering: 1, cancellable: 1, tool_discovery: 1 });
  });
});

// ============================================================
// B 段：降级语义映射（reference-patterns 候选降级词形逐条）
// ============================================================

describe("降级语义映射（reference-patterns 逐条词形）", () => {
  it("四维 absent 降级 id 逐位对齐（映射表与维度轴同键同序）", () => {
    const report = probeProviderCapabilities(
      fakeProbe({ native_async: false, native_steering: false, cancellable: false, tool_discovery: false }),
    );
    expect(report.rows.map((row) => row.degradation)).toEqual([
      PROVIDER_CAPABILITY_DEGRADATIONS.native_async.id,
      PROVIDER_CAPABILITY_DEGRADATIONS.native_steering.id,
      PROVIDER_CAPABILITY_DEGRADATIONS.cancellable.id,
      PROVIDER_CAPABILITY_DEGRADATIONS.tool_discovery.id,
    ]);
  });

  it("native_async：无原生 async → 有持久记录的同步步骤（reference-patterns 词形）", () => {
    const d = PROVIDER_CAPABILITY_DEGRADATIONS.native_async;
    expect(d.id).toBe("sync_steps_with_persistent_record");
    expect(d.behavior).toContain("同步步骤");
    expect(d.behavior).toContain("持久记录");
  });

  it("native_steering：无原生 steering → 下一派发边界应用新约束（锚 = W4-S3 已就位载体，非假定 API）", () => {
    const d = PROVIDER_CAPABILITY_DEGRADATIONS.native_steering;
    expect(d.id).toBe("constraint_at_next_dispatch_boundary");
    expect(d.behavior).toContain("下一派发边界");
    expect(d.anchor).toContain("W4-S3");
    expect(d.anchor).toContain("steering-log");
  });

  it("cancellable：无法立即取消 → 明确状态 + 隔离冲突结果（reference-patterns 词形）", () => {
    const d = PROVIDER_CAPABILITY_DEGRADATIONS.cancellable;
    expect(d.id).toBe("explicit_status_and_conflict_isolation");
    expect(d.behavior).toContain("状态");
    expect(d.behavior).toContain("隔离");
  });

  it("tool_discovery：无运行时工具发现 → 预先编译较小工具集（R Case C 词形）", () => {
    const d = PROVIDER_CAPABILITY_DEGRADATIONS.tool_discovery;
    expect(d.id).toBe("precompiled_smaller_toolset");
    expect(d.behavior).toContain("预");
    expect(d.behavior).toContain("工具集");
  });

  it("unknown 与 absent 同走声明式降级（未确证的能力不使用——安全边界），词形区分留给 support 位", () => {
    const report = probeProviderCapabilities(fakeProbe({}));
    for (const row of report.rows) {
      expect(row.support).toBe("unknown");
      expect(row.degradation).toBe(PROVIDER_CAPABILITY_DEGRADATIONS[row.dimension].id);
    }
  });
});

// ============================================================
// C 段：词形闭包 + 纯函数纪律 + 红线
// ============================================================

describe("词形闭包 / 纯函数 / 红线", () => {
  it("词轴闭包：四维度 / 三值支持词形 / 四值 basis 轴（SP 提案待追认——扩值走词形 PR）", () => {
    expect([...PROVIDER_CAPABILITY_DIMENSIONS]).toEqual([
      "native_async",
      "native_steering",
      "cancellable",
      "tool_discovery",
    ]);
    expect([...PROVIDER_CAPABILITY_SUPPORT_VALUES]).toEqual(["native", "absent", "unknown"]);
    expect([...PROVIDER_CAPABILITY_BASIS_VALUES]).toEqual([
      "probe_true",
      "probe_false",
      "probe_absent",
      "probe_threw",
    ]);
  });

  it("探针方法名轴与维度轴逐位机械映射（§58 snake_case 同法）", () => {
    expect(PROVIDER_CAPABILITY_PROBE_METHODS).toEqual({
      native_async: "supportsNativeAsync",
      native_steering: "supportsNativeSteering",
      cancellable: "supportsCancellable",
      tool_discovery: "supportsToolDiscovery",
    });
  });

  it("确定性：同输入重放 deep equal（纯函数零墙钟零 IO，A4）", () => {
    const probe = fakeProbe({ native_async: true, native_steering: false });
    expect(probeProviderCapabilities(probe)).toEqual(probeProviderCapabilities(probe));
  });

  it("零硬编码 Provider 断言：报告由探针结果唯一决定（不同「型号」fake 同探针结果 → 报告逐字节同形）", () => {
    // 两个名字不同的 fake runtime——报告不携带任何 Provider 身份字段（R4-3 红线：
    // 不把某 Provider API 叙述当跨 Provider 保证；换 Provider 须重新探测）。
    const probeA = fakeProbe({ native_async: true, cancellable: false });
    const probeB = fakeProbe({ native_async: true, cancellable: false });
    expect(probeProviderCapabilities(probeA)).toEqual(probeProviderCapabilities(probeB));
    expect(JSON.stringify(probeProviderCapabilities(probeA))).not.toContain("claude");
    expect(JSON.stringify(probeProviderCapabilities(probeA))).not.toContain("codex");
  });

  it("跨 Provider 红线注记常量在座（R4-3「不把某 Provider API 叙述当跨 Provider 保证」词形）", () => {
    expect(PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE).toContain("跨 Provider");
  });

  it("与既有 §58 三探针零破坏：probeRuntimeCapabilities 契约面不动（平行扩展——RuntimeCapabilities 无新字段）", async () => {
    const { probeRuntimeCapabilities, evaluateCapabilityDegradation } = await import("@pomaster/kernel");
    const legacy = {
      supportsParallel: () => true,
      supportsToolPermissions: () => false,
      supportsContextIsolation: () => true,
    };
    const caps = probeRuntimeCapabilities(legacy);
    expect(caps).toEqual({
      supportsParallel: true,
      supportsToolPermissions: false,
      supportsContextIsolation: true,
    });
    expect(evaluateCapabilityDegradation(caps).multi_agent_capable).toBe(true);
  });
});
