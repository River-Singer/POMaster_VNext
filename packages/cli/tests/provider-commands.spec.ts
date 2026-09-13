/**
 * provider-commands.spec.ts —— `pomaster provider` 命令面（W4-S4 · 战役 W4 R4-3 +
 * 09-10 PRD REQ-11/R §5.2 Provider-neutral）。
 *
 * 判据锚：
 * - capabilities = 四维能力（native_async/native_steering/cancellable/tool_discovery）
 *   三值词形（native|absent|unknown——探针结果驱动禁猜）× 声明式降级语义矩阵；
 * - CLI 无真实 Provider SDK（R P5 红线）：缺省注入探针 = null → 全 unknown 诚实
 *   缺省 + 注记（report_source=declarative_default 显式标注，不冒充实测）；
 *   deps.resolveProbe 注入位承载真实探针（injected_probe）与违例探针
 *   （SCHEMA_INVALID fail-closed）的测试面；
 * - 纯报告零 store 依赖：不 createStore / 不 requireInitialized / 零读写
 *   .pomaster（未初始化目录可跑，零落盘字节快照钉）；
 * - ok 语义 = 报告成功产出（degraded 不是失败——如实报告正是交付物）；
 * - --runtime 过 EXECUTION_RUNTIME_VALUES 闭包（D 线 §2.1 必填枚举）。
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE,
  PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE,
  PROVIDER_CAPABILITY_PROBE_METHODS,
  type ProviderCapabilityProbe,
} from "@pomaster/kernel";
import { runCli, runProviderCapabilities, type ProviderCapabilitiesResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-provider-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 注入探针工厂（kernel spec 同构 fake；指定维返回值，缺席维物理缺方法）。 */
function fakeProbe(
  returns: Partial<Record<"native_async" | "native_steering" | "cancellable" | "tool_discovery", boolean>>,
  throws: string[] = [],
): ProviderCapabilityProbe {
  const probe: Record<string, unknown> = {};
  for (const [dimension, method] of Object.entries(PROVIDER_CAPABILITY_PROBE_METHODS)) {
    if (throws.includes(dimension)) {
      probe[method] = () => {
        throw new Error(`探针故障（fake）：${method}`);
      };
      continue;
    }
    const value = returns[dimension as keyof typeof returns];
    if (value === undefined) continue;
    probe[method] = () => value;
  }
  return probe as ProviderCapabilityProbe;
}

// ============================================================
// A 段：声明式缺省报告（未注入探针 = 全 unknown 诚实缺省）
// ============================================================

describe("provider capabilities（声明式缺省——CLI 无真实 Provider SDK）", () => {
  it("缺省注入 = 全维度 unknown/probe_absent + all_unknown + 诚实缺省注记 + report_source=declarative_default", () => {
    const outcome = runProviderCapabilities({ runtime: "claude-code" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ProviderCapabilitiesResult;
    expect(result.runtime).toBe("claude-code");
    expect(result.report_source).toBe("declarative_default");
    expect(result.all_unknown).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.native_count).toBe(0);
    expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      expect(row.support).toBe("unknown");
      expect(row.basis).toBe("probe_absent");
      expect(row.probe_error).toBeNull();
      expect(row.degradation).not.toBeNull();
      expect(row.degradation_behavior).not.toBeNull();
      expect(row.degradation_anchor).not.toBeNull();
    }
    expect(result.notes).toContain(PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE);
    expect(result.notes).toContain(PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE);
  });

  it("人读矩阵：四维词形 + 降级 id/行为/锚 + 注记行逐条在座（机器+人读一份）", () => {
    const outcome = runProviderCapabilities({ runtime: "codex" });
    const text = outcome.human.join("\n");
    for (const dimension of ["native_async", "native_steering", "cancellable", "tool_discovery"]) {
      expect(text).toContain(dimension);
    }
    expect(text).toContain("sync_steps_with_persistent_record");
    expect(text).toContain("constraint_at_next_dispatch_boundary");
    expect(text).toContain("explicit_status_and_conflict_isolation");
    expect(text).toContain("precompiled_smaller_toolset");
    expect(text).toContain("下一派发边界");
    expect(text).toContain("W4-S3");
    expect(text).toContain(`注记: ${PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE}`);
    expect(text).toContain(`注记: ${PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE}`);
    expect(text).toContain("declarative_default");
  });

  it("--runtime 词表外 → VOCAB_INVALID_VALUE fail-closed（EXECUTION_RUNTIME_VALUES 闭包；扩值走词汇表 PR）", () => {
    const outcome = runProviderCapabilities({ runtime: "gpt-9" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
    expect(outcome.errors[0]?.message).toContain("gpt-9");
    expect(outcome.errors[0]?.hint).toContain("claude-code");
  });
});

// ============================================================
// B 段：注入探针面（injected_probe 实测形态 + 违例 fail-closed）
// ============================================================

describe("provider capabilities（注入探针——真实 Runtime Adapter 落地前的接缝）", () => {
  it("注入探针 → report_source=injected_probe + 逐维词形照实呈现（native 行零降级不伪造）", () => {
    const outcome = runProviderCapabilities(
      { runtime: "claude-code" },
      {
        resolveProbe: () =>
          fakeProbe({ native_async: true, native_steering: false, cancellable: false, tool_discovery: true }),
      },
    );
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ProviderCapabilitiesResult;
    expect(result.report_source).toBe("injected_probe");
    expect(result.all_unknown).toBe(false);
    expect(result.native_count).toBe(2);
    const rows = new Map(result.rows.map((row) => [row.dimension, row]));
    expect(rows.get("native_async")?.support).toBe("native");
    expect(rows.get("native_async")?.degradation).toBeNull();
    expect(rows.get("native_steering")?.support).toBe("absent");
    expect(rows.get("native_steering")?.degradation).toBe("constraint_at_next_dispatch_boundary");
    const text = outcome.human.join("\n");
    expect(text).toContain("无（native 不伪造降级）");
    expect(text).toContain("下一派发边界");
    expect(text).not.toContain(PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE);
  });

  it("注入报错探针 → unknown/probe_threw + probe_error 人读留痕（报错 ≠ 支持）", () => {
    const outcome = runProviderCapabilities(
      { runtime: "script" },
      { resolveProbe: () => fakeProbe({ native_async: true }, ["native_steering"]) },
    );
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ProviderCapabilitiesResult;
    const rows = new Map(result.rows.map((row) => [row.dimension, row]));
    expect(rows.get("native_steering")?.support).toBe("unknown");
    expect(rows.get("native_steering")?.basis).toBe("probe_threw");
    expect(rows.get("native_steering")?.probe_error).toContain("探针故障");
    expect(outcome.human.join("\n")).toContain("探针故障（fake）：supportsNativeSteering");
  });

  it("注入违例探针（非布尔返回）→ SCHEMA_INVALID fail-closed（静默真值化禁）", () => {
    const outcome = runProviderCapabilities(
      { runtime: "claude-code" },
      {
        resolveProbe: () =>
          ({
            supportsNativeAsync: () => "yes" as unknown as boolean,
          }) as ProviderCapabilityProbe,
      },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("supportsNativeAsync");
  });
});

// ============================================================
// C 段：runCli 程序面（注册表/退出码/信封/零 store 依赖字节快照）
// ============================================================

describe("provider capabilities（runCli 程序面）", () => {
  it("注册表 + --json 信封：ok=true 五键信封、result 形态完整、exit 0", async () => {
    const lines: string[] = [];
    const code = await runCli(["provider", "capabilities", "--runtime", "codex", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as {
      command: string;
      ok: boolean;
      result: ProviderCapabilitiesResult;
      warnings: unknown[];
      errors: unknown[];
    };
    expect(envelope.command).toBe("provider capabilities");
    expect(envelope.ok).toBe(true);
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.runtime).toBe("codex");
    expect(envelope.result.report_source).toBe("declarative_default");
    expect(envelope.result.rows).toHaveLength(4);
  });

  it("缺 --runtime → exit 1（requiredOption 闸；无静默缺省——申报面纪律）", async () => {
    const code = await runCli(["provider", "capabilities", "--json"], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(1);
  });

  it("--runtime 词表外 → exit 1 + VOCAB_INVALID_VALUE", async () => {
    const lines: string[] = [];
    const code = await runCli(["provider", "capabilities", "--runtime", "nope", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as {
      ok: boolean;
      errors: { code: string }[];
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
  });

  it("纯报告零 store 依赖：未初始化目录可跑 + 零 .pomaster 落盘（零写入字节快照钉）", async () => {
    // --dir 显式指向未初始化临时目录（recon.spec 同款）：若命令存在任何 store 写
    // 路径，落盘只会发生在 root 下——断言 root 无 .pomaster 才真正钉住零写入；
    // 不传 --dir 时命令 cwd 是仓库根，断言临时目录将失去钉住力（且可能污染真实盘面）。
    const code = await runCli(["--dir", root, "provider", "capabilities", "--runtime", "claude-code"], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });
});
