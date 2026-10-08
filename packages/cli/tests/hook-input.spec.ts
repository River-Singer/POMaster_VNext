import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachSession, createStore } from "@pomaster/kernel";

let root: string;
let store: Awaited<ReturnType<typeof createStore>>;
const bin = resolve("packages/cli/dist/bin.js");
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster hook space "));
  store = await createStore(root);
  const indexPath = join(root, ".pomaster/state/truth-index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  index.objects = ["A", "B"].map((id) => ({ id: `TASK.${id}`, kind: "task_object", axes: { lifecycle: "CURRENT", evidence: "PLANNED" } }));
  writeFileSync(indexPath, JSON.stringify(index));
  await attachSession(store, { sessionKey: "codex_registered", harness: "codex", currentTask: "TASK.B", platformMeta: { session_id: "native-uuid", cwd: root } });
  mkdirSync(join(root, "nested"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function hook(command: string, input: string) {
  const result = spawnSync(process.execPath, [bin, command, "--hook-input", "--json"], { cwd: root, input, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).result.workflow_route;
}

describe("real hook stdin adapter", () => {
  it("rejects ambiguous registered identities and conflicting stored metadata", async () => {
    await attachSession(store, { sessionKey: "codex_duplicate", harness: "codex", currentTask: "TASK.A", platformMeta: { session_id: "native-uuid", cwd: root } });
    expect(hook("alerts", JSON.stringify({ session_id: "native-uuid", cwd: root }))).toMatchObject({ selected_task: null, route_id: "R_TASK_SELECTION_REQUIRED" });
    const path = join(root, ".pomaster/runtime/sessions/codex_duplicate.json");
    const record = JSON.parse(readFileSync(path, "utf8"));
    record.platform_meta = { session_id: "conflicting-id", sessionId: "other-id", cwd: root };
    writeFileSync(path, JSON.stringify(record));
    expect(hook("alerts", JSON.stringify({ session_id: "conflicting-id", cwd: root }))).toMatchObject({ selected_task: null, route_id: "R_TASK_SELECTION_REQUIRED" });
  });

  it("does not borrow a registered identity from another workspace", async () => {
    const other = join(root, "other-worktree");
    const store = await createStore(other);
    await attachSession(store, { sessionKey: "wrong_workspace", harness: "codex", currentTask: "TASK.A", platformMeta: { session_id: "native-uuid", cwd: root } });
    expect(hook("session", JSON.stringify({ session_id: "native-uuid", cwd: other }))).toMatchObject({ selected_task: null, route_id: "R_TASK_SELECTION_REQUIRED" });
  });

  it.each(["session", "alerts"])("%s maps native metadata and consumes nested cwd with spaces", (command) => {
    const before = readFileSync(join(root, ".pomaster/runtime/sessions/codex_registered.json"), "utf8");
    const route = hook(command, JSON.stringify({ session_id: "native-uuid", cwd: join(root, "nested") }));
    expect(route).toMatchObject({ selected_task: "TASK.B", session_key: "codex_registered", selection_source: "session" });
    expect(readFileSync(join(root, ".pomaster/runtime/sessions/codex_registered.json"), "utf8")).toBe(before);
  });
  it("accepts camelCase native sessionId", () => {
    expect(hook("alerts", JSON.stringify({ sessionId: "native-uuid", cwd: root })).selected_task).toBe("TASK.B");
  });
  it.each(["", "{broken", "[]", "{}"])("blocks malformed/missing identity %s without choosing tasks", (input) => {
    expect(hook("alerts", input)).toMatchObject({ selected_task: null, route_id: "R_TASK_SELECTION_REQUIRED", blockers: [expect.objectContaining({ code: "HOOK_SESSION_UNRESOLVED" })] });
  });
  it("blocks unmapped and conflicting native identities", () => {
    for (const identity of [{ session_id: "unknown" }, { session_id: "native-uuid", sessionId: "other" }]) {
      expect(hook("session", JSON.stringify({ ...identity, cwd: root }))).toMatchObject({ selected_task: null, route_id: "R_TASK_SELECTION_REQUIRED" });
    }
  });
});
