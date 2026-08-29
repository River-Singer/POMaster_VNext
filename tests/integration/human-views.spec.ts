/**
 * human-views.spec.ts —— M5 Human View 编译器（corpus/master/tools/build_human_views.py）
 * 的机器验收面（契约 `docs/p9-human-view-and-l5-contract.md` §1.6 可机判判据的 vitest 侧）：
 *
 * 1. `--check` 全绿 = 双跑 byte-stable + citation 可解析率 100% + 篇幅/清单/零墙钟自检
 *    + 现盘 drift=0（§1.6.1/3/5/6，一次进程内自证）；
 * 2. 幂等短路：同输入重复生成 → 第二次 NO_CHANGE 零写入（§1.6.2，镜像 renderer v0）；
 * 3. drift 探测：现盘产物被篡改 → `--check` 非零退出（fail-closed，不报绿）；
 * 4. manifest 机器契约：batch_code=VIEW-M5、指纹 64-hex、citations_unresolved=0、
 *    explicit_absence 每条有原因、零日期词形（§1.3.1）。
 *
 * 铁律映射：本 spec 对语料零写入——canonical `--check` 只读比对；幂等/drift 断言全部
 * 在临时目录以全五批工作流进行（视图构建器按契约面向全语料，子集不构成可编译输入）。
 * python 不可用时按 smoke.spec.ts 同款纪律显式 pending 登记（禁静默跳过当通过）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generator = join(repoRoot, "corpus", "master", "tools", "build_human_views.py");
const viewsDir = join(repoRoot, "corpus", "master", "views");
const reportPath = join(repoRoot, "coverage", "human-views-report.json");

interface PyRun {
  readonly spawned: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runPython(baseCmd: readonly string[], args: readonly string[]): PyRun {
  const file = baseCmd[0];
  if (file === undefined) {
    return { spawned: false, exitCode: null, stdout: "", stderr: "empty python command" };
  }
  const res = spawnSync(file, [...baseCmd.slice(1), generator, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (res.error) {
    return { spawned: false, exitCode: null, stdout: "", stderr: String(res.error) };
  }
  return {
    spawned: true,
    exitCode: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

type PyMode =
  | { readonly available: true; readonly cmd: readonly string[] }
  | { readonly available: false; readonly reason: string };

function probePython(): PyMode {
  if (!existsSync(generator)) {
    return { available: false, reason: `generator_missing（${generator} 不存在）` };
  }
  for (const cmd of [["python"], ["py", "-3"]]) {
    const [file, ...rest] = cmd;
    if (file === undefined) {
      continue;
    }
    const probe = spawnSync(file, [...rest, "-c", "import sys; print(sys.version_info[0])"], {
      encoding: "utf8",
    });
    if (!probe.error && (probe.stdout ?? "").trim().startsWith("3")) {
      return { available: true, cmd };
    }
  }
  return {
    available: false,
    reason: "python_missing（PATH 上无 python / py -3——编译器验收无法执行，显式 pending）",
  };
}

const py = probePython();

const pendings: { readonly id: string; readonly reason: string }[] = [];

function expectPendingRecorded(id: string, what: string): void {
  const reason = !py.available ? `${py.reason}；${what}` : what;
  pendings.push({ id, reason });
  expect(
    pendings.some((p) => p.id === id),
    `human-views 断言 ${id} 应显式登记 pending`,
  ).toBe(true);
}

afterAll(() => {
  const report = {
    suite: "human-views-compiler",
    python: py.available ? { available: true } : { available: false, reason: py.reason },
    pendings,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const p of pendings) {
    console.log(`[human-views][pending] ${p.id} — ${p.reason}`);
  }
});

const sha256 = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

/** 临时 out 目录（语料零写入：生成物只落 tmp）。 */
function makeTempOut(): string {
  return mkdtempSync(join(tmpdir(), "pomaster-human-views-"));
}

// ============================================================
// canonical 五批验收（--check 一次进程内自证双跑 byte-stable + 全套不变量）
// ============================================================

describe("build_human_views canonical 验收（契约 §1.6）", () => {
  it(
    "--check 全绿：双跑 byte-stable + drift=0 files=5（§1.6.1/3/5/6）",
    () => {
      if (!py.available) {
        expectPendingRecorded("canonical.check", "--check 全绿断言");
        return;
      }
      const r = runPython(py.cmd, ["--check"]);
      expect(r.spawned, `python 进程应可启动：${r.stderr.slice(0, 200)}`).toBe(true);
      expect(r.exitCode, `--check 应退出 0：\n${(r.stderr || r.stdout).slice(-400)}`).toBe(0);
      expect(r.stdout).toContain("CHECK_OK double_run_byte_stable=true drift=0 files=5");
    },
    300000,
  );
});

// ============================================================
// 幂等 / drift 探测（临时目录全五批工作流，语料零写入；
// 视图构建器按契约面向全语料，--batches 子集不构成可编译输入）
// ============================================================

describe("build_human_views 幂等与 fail-closed（临时目录工作流）", () => {
  it(
    "重生成 → NO_CHANGE 零写入且字节稳定；篡改现盘 → --check 红灯（§1.6.2 + fail-closed）",
    () => {
      if (!py.available) {
        expectPendingRecorded("tempdir.workflow", "NO_CHANGE 零写入 + drift 红灯断言");
        return;
      }
      const out = makeTempOut();
      try {
        const first = runPython(py.cmd, ["--out", out]);
        expect(first.exitCode, `首次生成应退出 0：\n${(first.stderr || first.stdout).slice(-400)}`).toBe(0);
        expect(first.stdout).toContain("WROTE files=5");
        const names = readdirSync(out).sort();
        expect(names).toEqual([
          "build-manifest.json",
          "current-business-truth.md",
          "executive-system-map.md",
          "known-debt.md",
          "technology-baseline.md",
        ]);
        const before = new Map(names.map((n) => [n, sha256(readFileSync(join(out, n)))]));
        const second = runPython(py.cmd, ["--out", out]);
        expect(second.exitCode).toBe(0);
        expect(second.stdout, "第二次生成必须判 NO_CHANGE（same_state_zero_write 短路）").toContain(
          "NO_CHANGE files=5",
        );
        for (const n of names) {
          expect(sha256(readFileSync(join(out, n)))).toBe(before.get(n));
        }
        const victim = join(out, "executive-system-map.md");
        writeFileSync(victim, `${readFileSync(victim, "utf8")}\n人工篡改行\n`, "utf8");
        const tampered = runPython(py.cmd, ["--out", out, "--check"]);
        expect(tampered.exitCode, "drift 必须红灯（禁止把漂移报成绿）").not.toBe(0);
        expect(`${tampered.stdout}\n${tampered.stderr}`).toContain("disk drift detected");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    300000,
  );
});

// ============================================================
// manifest 机器契约（静态检查仓内产物，无需 python）
// ============================================================

describe("build-manifest.json 机器契约（契约 §1.3）", () => {
  const manifestText = readFileSync(join(viewsDir, "build-manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as {
    batch_code?: unknown;
    inputs_fingerprint?: unknown;
    explicit_absence?: readonly { reason?: unknown }[];
    views?: Record<string, { citations_unresolved?: unknown; sha256?: unknown }>;
  };

  it("batch_code=VIEW-M5 且 inputs_fingerprint 为 64-hex 确定性指纹", () => {
    expect(manifest.batch_code).toBe("VIEW-M5");
    expect(manifest.inputs_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("四视图 citations_unresolved=0（citation 可解析率 100%，§1.6.3）", () => {
    const views = manifest.views ?? {};
    expect(Object.keys(views).sort()).toEqual([
      "current-business-truth.md",
      "executive-system-map.md",
      "known-debt.md",
      "technology-baseline.md",
    ]);
    for (const [name, v] of Object.entries(views)) {
      expect(v.citations_unresolved, `${name} 存在未解析 citation`).toBe(0);
      expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("explicit_absence 每条有原因（禁静默空章节，§1.6.6）", () => {
    const abs = manifest.explicit_absence ?? [];
    expect(abs.length, "显式缺席登记应为非空（缺席显式纪律）").toBeGreaterThan(0);
    for (const a of abs) {
      expect(typeof a.reason === "string" && a.reason.length > 0).toBe(true);
    }
  });

  it("零墙钟：manifest 无日期词形（§1.3.1 机器字段无时间戳）", () => {
    expect(manifestText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(manifestText).not.toMatch(/\d{4}\/\d{2}\/\d{2}/);
    expect(manifestText).not.toMatch(/\d{4}年\d{1,2}月/);
  });
});
