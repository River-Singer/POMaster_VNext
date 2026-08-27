/**
 * context.spec.ts —— 八拍③命令面：kernel 转调、三分区 markdown、缺席显式。
 *
 * TODO(integration-2026-08-28)：kernel 模块已由 kernel 建造者落地。原「kernel
 * scaffold（not-implemented）→ KERNEL_NOT_INSTALLED」真实 kernel 场景已不存在
 * （CLI 设计即"kernel 落地后本命令自动升级，无需改动"），该用例更新为真实 kernel
 * 集成断言；scaffold 时代的错误分类路径由注入式用例（本文件"注入形态"用例）继续覆盖。
 */
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Projection, Store } from "@pomaster/kernel";
import { runInit, runContextCompile } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-context-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeProjection(overrides?: Partial<Projection>): Projection {
  return {
    manifest: {
      mustEntries: [{ ref: "POLICY.PAGE.TTL", reason: "本任务触碰 PAGE.* 分母" }],
      advisoryEntries: [
        { ref: "KNOWLEDGE.KB_GRID", reason: "触发条件：任务涉及表格" },
      ],
      lazyTools: ["playwright"],
    },
    inputsFingerprint: "sha256:" + "a".repeat(64),
    ...overrides,
  };
}

function fakeKernel(projection: Projection) {
  const compileProjection = vi.fn(async () => projection);
  const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
  return { createStore, compileProjection };
}

describe("context compile 缺席显式", () => {
  it("未初始化 → NOT_INITIALIZED（禁静默投影）", async () => {
    const outcome = await runContextCompile(dir, "frontend");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("init 后（真实 kernel 已落地）→ 编译成功：三分区标题在场、空区显式缺席", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend");
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain(
      "# Context Projection — role: frontend",
    );
    expect(outcome.result.markdown).toContain("## MUST（gate 判卷输入）");
    expect(outcome.result.markdown).toContain("无 MUST 注入项");
    expect(outcome.errors).toEqual([]);
  });
});

describe("context compile 转调 kernel（注入 fake）", () => {
  it("三分区 markdown：MUST / ADVISORY / LAZY TOOLS 标题与条目（含注入理由）", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const outcome = await runContextCompile(dir, "frontend", kernel);
    expect(outcome.ok).toBe(true);
    expect(kernel.compileProjection).toHaveBeenCalledOnce();
    expect(outcome.result.markdown).toContain("## MUST（gate 判卷输入）");
    expect(outcome.result.markdown).toContain("## ADVISORY");
    expect(outcome.result.markdown).toContain("## LAZY TOOLS");
    expect(outcome.result.markdown).toContain("`POLICY.PAGE.TTL` — 本任务触碰 PAGE.* 分母");
    expect(outcome.result.markdown).toContain("- playwright");
  });

  it("role 透传 kernel；inputs_fingerprint 原样回显", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const outcome = await runContextCompile(dir, "architect", kernel);
    expect(kernel.compileProjection.mock.calls[0]?.[1]).toEqual({
      role: "architect",
    });
    expect(outcome.result.role).toBe("architect");
    expect(outcome.result.inputs_fingerprint).toBe("sha256:" + "a".repeat(64));
  });

  it("manifest 字段机读映射（must_entries/advisory_entries/lazy_tools）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", fakeKernel(fakeProjection()));
    expect(outcome.result.manifest.must_entries).toEqual([
      { ref: "POLICY.PAGE.TTL", reason: "本任务触碰 PAGE.* 分母" },
    ]);
    expect(outcome.result.manifest.lazy_tools).toEqual(["playwright"]);
  });

  it("空 manifest → markdown 显式标注空区（缺席显式，不渲染成有内容）", async () => {
    await runInit(dir);
    const empty = fakeProjection({
      manifest: {
        mustEntries: [],
        advisoryEntries: [],
        lazyTools: [],
      },
    });
    const outcome = await runContextCompile(dir, "designer", fakeKernel(empty));
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain("无 MUST 注入项");
    expect(outcome.result.markdown).toContain("无触发条件命中");
  });

  it("kernel 抛非 not-implemented 错误 → KERNEL_ERROR（带原消息）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", {
      createStore: async () => {
        throw new Error("disk exploded");
      },
      compileProjection: async () => {
        throw new Error("unreachable");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("KERNEL_ERROR");
    expect(outcome.errors[0]?.message).toContain("disk exploded");
  });

  it("kernel 抛 not-implemented（注入形态）→ KERNEL_NOT_INSTALLED", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", {
      createStore: async () => {
        throw new Error("not-implemented");
      },
      compileProjection: async () => {
        throw new Error("not-implemented");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("KERNEL_NOT_INSTALLED");
  });
});
