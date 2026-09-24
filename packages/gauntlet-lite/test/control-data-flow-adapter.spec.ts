import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeControlDataFlow,
  createControlDataFlowAdapter,
  resolveTrustedBindingAdapter,
} from "../src/index.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-cdf-")); roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "cdf-fixture" }));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(root, name, ".."), { recursive: true }); writeFileSync(join(root, name), text); }
  return root;
}

describe("control data flow analyzer", () => {
  it("React TSX 与 Vue SFC 完整结构链判 proven，并保留 runtime confirmation 边界", () => {
    const root = fixture({
      "src/App.tsx": `function App(){ const [result,setResult]=useState(''); async function save(){ const response=await fetch('/api'); setResult(await response.text()); } return <><button onClick={save}>save</button><p>{result}</p></> }`,
      "src/Dialog.vue": `<template><button @click="save">save</button><p>{{ result }}</p></template><script setup lang="ts">import {ref} from 'vue'; const result=ref(''); async function save(){ const response=await fetch('/api'); result.value=await response.text() }</script>`,
    });
    const report = analyzeControlDataFlow(root);
    expect(report.controls_scanned).toBe(2);
    expect(report.controls.map((x) => x.conclusion)).toEqual(["proven", "proven"]);
    expect(report.controls.every((x) => x.runtime_confirmation_required)).toBe(true);
    expect(report.controls.flatMap((x) => x.stages.map((s) => s.kind))).toContain("effect");
  });

  it("稳定检出 handler 缺席、响应未回填与 rendered feedback 缺席", () => {
    const root = fixture({ "src/Broken.tsx": `function App(){ const [result,setResult]=useState(''); function fire(){ fetch('/api') } async function hidden(){ const response=await fetch('/api'); setResult(await response.text()) } async function drift(){ const response=await fetch('/api',{body:JSON.stringify({name:'fixed'})}); setResult(await response.text()) } return <><button onClick>missing</button><button onClick={fire}>fire</button><button onClick={hidden}>hidden</button><button onClick={drift}>drift</button></> }` });
    const rules = analyzeControlDataFlow(root).controls.flatMap((x) => x.issues.map((i) => i.rule));
    expect(rules).toContain("CDF.EVENT_HANDLER_UNRESOLVED");
    expect(rules).toContain("CDF.READBACK_MISSING");
    expect(rules).toContain("CDF.RENDER_FEEDBACK_MISSING");
    expect(rules).toContain("CDF.PAYLOAD_CONTROL_VALUE_MISSING");
  });

  it("识别 React controlled input 与 Vue v-model 的本地状态回显链", () => {
    const root = fixture({
      "src/Input.tsx": `function Input(){ const [name,setName]=useState(''); return <><input value={name} onChange={e=>setName(e.target.value)}/><span>{name}</span></> }`,
      "src/Input.vue": `<template><input v-model="name"/><span>{{name}}</span></template><script setup lang="ts">import {ref} from 'vue'; const name=ref('')</script>`,
    });
    expect(analyzeControlDataFlow(root).controls.map((x) => x.conclusion)).toEqual(["proven", "proven"]);
  });

  it("动态 handler 返回 unknown，绝不假绿或误报确定违规", () => {
    const root = fixture({ "src/Dynamic.tsx": `function App({handlers,keyName}:any){ return <button onClick={handlers[keyName]}>run</button> }` });
    const control = analyzeControlDataFlow(root).controls[0];
    expect(control?.conclusion).toBe("unknown");
    expect(control?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "CDF.AMBIGUOUS_DYNAMIC_EDGE", certainty: "blindspot" })]));
  });

  it("普通 click 不被猜成业务 effect；本地回显可证明，无动作 handler 保持 unknown", () => {
    const root = fixture({
      "src/Local.tsx": `function Local(){ const [open,setOpen]=useState(false); function toggle(){ setOpen(true) } function noop(){ console.log('clicked') } return <><button onClick={toggle}>toggle</button><button onClick={noop}>noop</button>{open && <p>open</p>}</> }`,
    });
    const controls = analyzeControlDataFlow(root).controls;
    expect(controls.map((control) => control.conclusion)).toEqual(["proven", "unknown"]);
    expect(controls.flatMap((control) => control.issues)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "CDF.EFFECT_SINK_MISSING", certainty: "violation" }),
    ]));
  });

  it("只有显式 effect 义务才把缺失 sink 判为确定违规", () => {
    const root = fixture({
      "src/Declared.tsx": `function Declared(){ function save(){ console.log('save') } return <button data-pomaster-cdf-effect="required" onClick={save}>save</button> }`,
    });
    const control = analyzeControlDataFlow(root).controls[0];
    expect(control?.conclusion).toBe("broken");
    expect(control?.issues).toContainEqual(expect.objectContaining({ rule: "CDF.EFFECT_SINK_MISSING", certainty: "violation" }));
  });

  it("Vue inline template expression 使用自己的 synthetic SourceFile，并能进入 script handler", () => {
    const root = fixture({
      "src/Inline.vue": `<template><button @click="() => save()">save</button><p>{{ result }}</p></template><script setup lang="ts">import {ref} from 'vue'; const result=ref(''); async function save(){ const response=await fetch('/api'); result.value=await response.text() }</script>`,
    });
    expect(analyzeControlDataFlow(root).controls[0]?.conclusion).toBe("proven");
  });
});

describe("CONTROL_DATA_FLOW adapter", () => {
  function execute(report: unknown) {
    const root = fixture({});
    const adapter = createControlDataFlowAdapter();
    const plan = adapter.prepare({ projectRoot: root, subjectId: "TEST.CDF" }, { grn: "GRN-0001", ranAtSeq: 1 });
    const raw = adapter.run(plan, () => ({ status: 0, stdout: JSON.stringify(report), stderr: "", error: null, externalMs: 1 }));
    return adapter.normalize(raw, { plan, isFixture: true });
  }
  it("结构闭合才 passed，scope 明确不等于运行成功", () => {
    const root = fixture({ "App.tsx": `function App(){ const [result,setResult]=useState(''); async function save(){ const response=await fetch('/api'); setResult(await response.text()) } return <><button onClick={save}/><p>{result}</p></> }` });
    const report = analyzeControlDataFlow(root);
    const record = execute(report);
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("不证明真实 API");
  });
  it("确定缺口 failed；动态盲区 warning；零分母 not_run", () => {
    const broken = analyzeControlDataFlow(fixture({ "App.tsx": `function App(){ return <button onClick>save</button> }` }));
    expect(execute(broken).verdict).toBe("failed");
    const unknown = analyzeControlDataFlow(fixture({ "App.tsx": `function App({h,k}:any){ return <button onClick={h[k]}/> }` }));
    expect(execute(unknown).verdict).toBe("warning");
    expect(execute({ schema: "pomaster.control-data-flow/v1", source_root: ".", files_scanned: 1, controls_scanned: 0, controls: [], parse_failures: [] }).verdict).toBe("not_run");
  });

  it("parse failure 只能 warning，且受信 registry 声明完整", () => {
    const report = analyzeControlDataFlow(fixture({
      "Good.tsx": `function Good(){ const [open,setOpen]=useState(false); return <><button onClick={()=>setOpen(true)}/>{open && <p>open</p>}</> }`,
      "Bad.vue": `<template><button @click="broken">`,
    }));
    expect(report.parse_failures).toHaveLength(1);
    expect(execute(report).verdict).toBe("warning");
    const trusted = resolveTrustedBindingAdapter("builtin.gauntlet-lite.control-data-flow");
    expect(trusted).toMatchObject({
      capabilities: ["control_data_flow"],
      accepted_tool_ids: ["gauntlet:control-data-flow"],
      accepted_formats: ["pomaster-control-data-flow-json"],
      accepted_parser_refs: ["builtin.gauntlet-lite.control-data-flow/json-v1"],
    });
  });
});
