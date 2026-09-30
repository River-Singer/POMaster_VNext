import { describe, expect, it } from "vitest";
import { appendTaskRealityScopeReview, applyTransaction, readTaskRealityScopeReviews } from "@pomaster/kernel";
import { AGENT, gid, makeStore } from "./helpers.js";

const envelope = () => ({
  id: gid("TASK.REALITY"), kind:"task_object", axisProfile:"task_default",
  axes:{lifecycle:"CURRENT",confidence:"PROVISIONAL",evidence:"IMPLEMENTED",change:"STABLE"},
  titleZh:"Reality review", authority:{owner:"BUSINESS_OWNER",delegates:[]}, origin:"natural",
  payload:{intent:"test",class_scan_result:{scope:"tasks/**",hits:0,fixed_count:0,regression_case_ref:"GRN-X"}},
});
const input = () => ({taskRef:"TASK.REALITY",observationRef:"OBS-0001",reportSha256:`sha256:${"1".repeat(64)}`,sourceSha:`sha256:${"2".repeat(64)}`,declaredRoots:["src/root.ts"],candidateUniverse:["src/a.ts","src/b.ts"],decisions:[{path:"src/a.ts",status:"accepted" as const,basis:"direct import"},{path:"src/b.ts",status:"unknown" as const,basis:"not adjudicated"}],truncated:true,unresolvedImports:[{source:"src/a.ts",specifier:"./missing",reason:"not_found"}],reviewedBy:AGENT,reviewSourceRef:"session:test"});

describe("reality scope review task ledger",()=>{
  it("全信封事务追加并保留未知、截断和来源",async()=>{const {store}=await makeStore();await applyTransaction(store,{ops:[{op:"upsert_object",envelope:envelope() as never}]});const result=await appendTaskRealityScopeReview(store,input());expect(result.reviewIndex).toBe(0);const rows=readTaskRealityScopeReviews((await import("@pomaster/kernel")).pathsOf(store),"TASK.REALITY");expect(rows[0]).toMatchObject({observation_ref:"OBS-0001",truncated:true,review_source_ref:"session:test"});expect(rows[0]?.unresolved_imports).toHaveLength(1);});
  it("遗漏、越形、重复 OBS 均零写 fail-closed",async()=>{const {store}=await makeStore();await applyTransaction(store,{ops:[{op:"upsert_object",envelope:envelope() as never}]});await expect(appendTaskRealityScopeReview(store,{...input(),decisions:input().decisions.slice(0,1)})).rejects.toMatchObject({code:"SCHEMA_INVALID"});await appendTaskRealityScopeReview(store,input());await expect(appendTaskRealityScopeReview(store,input())).rejects.toMatchObject({code:"SCHEMA_INVALID"});});
});
