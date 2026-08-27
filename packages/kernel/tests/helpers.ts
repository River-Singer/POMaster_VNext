/**
 * kernel 测试共享工具：临时 store fixture 与常用输入构造器。
 * 词表纪律：一切 id/枚举取自 vocab-lock 闭包；测试不发明词表外值。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, parseGovernedId, type GovernedId, type Store } from "@pomaster/kernel";

export function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "pvnext-kernel-test-"));
}

export async function makeStore(
  owners: readonly string[] = ["BUSINESS_OWNER", "FRONTEND_CONTRACT"],
): Promise<{ store: Store; root: string }> {
  const root = makeRoot();
  const store = await createStore(root);
  registerOwners(root, owners);
  return { store, root };
}

/** BOOTSTRAP：向 state/authority.json 登记 owner（幽灵 owner FATAL 的解析源）。 */
export function registerOwners(root: string, owners: readonly string[]): void {
  const path = join(root, ".pomaster", "state", "authority.json");
  const current = JSON.parse(readFileSync(path, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  for (const owner of owners) {
    current.authorities[owner] = {};
  }
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
}

/** 运行时解析 governed id（bad id 会让测试直接失败而非静默通过）。 */
export function gid(id: string): GovernedId {
  parseGovernedId(id);
  return id as GovernedId;
}

/** 测试用主体（自报 agent）。 */
export const AGENT = {
  actorType: "agent",
  actor: "claude/session-93",
  selfAttested: true,
} as const;

export const HUMAN = {
  actorType: "human",
  actor: "owner",
  selfAttested: false,
} as const;

type EnvelopeOverrides = Record<string, unknown>;

/** 合法 PAGE.* natural 信封基线（覆盖即得非法变体）。 */
export function pageEnvelope(overrides: EnvelopeOverrides = {}): Record<string, unknown> {
  return {
    id: gid("PAGE.DASHBOARD"),
    kind: "page_surface",
    axisProfile: "page_default",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    titleZh: "仪表盘",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
    ...overrides,
  };
}

/** 派生对象信封（origin=derived ⇒ 必带 producer 块，C3）。 */
export function derivedEnvelope(overrides: EnvelopeOverrides = {}): Record<string, unknown> {
  return pageEnvelope({
    id: gid("API_REQ.BIND.CARLINE.1"),
    kind: "contract_operation",
    axisProfile: "contract_default",
    titleZh: "列出项目下车型",
    authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
    origin: "derived",
    producer: {
      producerId: "prod.api_requirement_compiler",
      viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
    },
    payload: { method: "GET", path: "/api/v1/projects/{project_id}/carlines" },
    ...overrides,
  });
}

export function producerRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    producerId: "prod.demo_compiler",
    kind: "project",
    entrypoint: "package://project/demo-compiler",
    objectsClaimed: 1,
    viewsMaintained: ["truth-index.envelope"],
    liveness: { status: "active", runsSinceLastOutput: 0, lastOutputSeq: 0 },
    ...overrides,
  };
}

export function denominatorEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: gid("DENOMINATOR.PAGE.V1_SURFACE"),
    version: 1,
    membersCount: 2,
    memberSelector: {
      viaBindingTable: "KEYBINDING.PAGE.V1",
      filter: { surface: "V1", binding_status: "confirmed" },
    },
    successorOf: [],
    authority: { owner: "BUSINESS_OWNER" },
    status: "CURRENT",
    ...overrides,
  };
}

export function readIndex(root: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
  ) as Record<string, unknown>;
}

export function indexPath(root: string): string {
  return join(root, ".pomaster", "state", "truth-index.json");
}

export function readJournal(root: string): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

export function mkdirp(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
