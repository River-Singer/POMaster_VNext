/**
 * crc-lib.ts —— Constitutional Regression Suite 共享 fixture 工具（Batch 5）。
 *
 * 非 spec 文件（vitest include 只收 *.spec.ts；ratchet mapping 分母只对 spec 文件
 * 封闭，本文件不入账——fixture-chain-lib.ts 同款纪律）。
 *
 * 独立性纪律（PRD R4）：全套件零外部依赖（sensor 腿用 fixture/注入形态）、确定性
 * 零墙钟（A4：seq/固定 startedAt，禁 Date.now）、Windows 可跑（临时目录 + path.join）。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStore,
  parseGovernedId,
  type GovernedId,
  type Store,
  type Transaction,
} from "@pomaster/kernel";

/** 临时根目录（各 spec beforeAll 创建、afterAll 自行 rmSync）。 */
export function makeCrcRoot(name: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-crc-${name}-`));
}

/** 临时 store + owner 登记（幽灵 owner FATAL 的解析源；kernel tests/helpers 同款）。 */
export async function makeCrcStore(
  root: string,
  owners: readonly string[] = ["BUSINESS_OWNER", "BOOTSTRAP_OWNER"],
): Promise<Store> {
  const store = await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  for (const owner of owners) auth.authorities[owner] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  return store;
}

/** 运行时解析 governed id（bad id 让测试直接失败而非静默通过）。 */
export function cid(id: string): GovernedId {
  parseGovernedId(id);
  return id as GovernedId;
}

/** Transaction 组装（authorityRef 可选——EVOLUTION_REQUIRED 判定的对照位）。 */
export function txOf(ops: Transaction["ops"], authorityRef?: string): Transaction {
  return { ops, ...(authorityRef !== undefined ? { authorityRef } : {}) };
}

export type EnvelopeOverrides = Record<string, unknown>;

/**
 * 通用 02 信封基线（business_rule 承载治理规范性条款——MIG-B1 §3 先例；
 * change/task 对象才要求 class_scan_result，本基线不预置）。PROPOSED 态基线轴满足
 * 跨轴断言（PROPOSED ⇒ evidence=PLANNED）。
 */
export function proposalEnvelope(overrides: EnvelopeOverrides = {}): Record<string, unknown> {
  return {
    id: cid("POLICY.RISK_SCORE"),
    kind: "business_rule",
    axisProfile: "policy_default",
    axes: {
      lifecycle: "PROPOSED",
      confidence: "UNRESOLVED",
      evidence: "PLANNED",
      change: "STABLE",
    },
    titleZh: "提案对象基线",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {},
    ...overrides,
  };
}

/** 写 sources/index.yaml（kernel createStore 不预铺 sources/——测试自建目录）。 */
export function writeSourcesYaml(root: string, text: string): void {
  mkdirSync(join(root, ".pomaster", "sources"), { recursive: true });
  writeFileSync(join(root, ".pomaster", "sources", "index.yaml"), text, "utf8");
}
