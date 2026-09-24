import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parse as parseVueTemplate } from "@vue/compiler-dom/dist/compiler-dom.esm-browser.js";
import ts from "typescript";

export type ControlFlowResolution = "resolved" | "ambiguous" | "unresolved" | "runtime_only";
export type ControlFlowConclusion = "proven" | "broken" | "unknown" | "not_applicable";

export interface ControlFlowAnchor { readonly file: string; readonly line: number; readonly column: number }
export interface ControlFlowStage { readonly kind: "control" | "event" | "handler" | "state" | "effect" | "readback" | "feedback"; readonly resolution: ControlFlowResolution; readonly anchor: ControlFlowAnchor; readonly detail: string }
export interface ControlFlowIssue { readonly rule: string; readonly anchor: ControlFlowAnchor; readonly message: string; readonly certainty: "violation" | "blindspot" }
export interface ControlFlowControl { readonly control_ref: string; readonly framework: "react" | "vue"; readonly element: string; readonly event: string; readonly conclusion: ControlFlowConclusion; readonly stages: readonly ControlFlowStage[]; readonly issues: readonly ControlFlowIssue[]; readonly runtime_confirmation_required: true }
export interface ControlDataFlowReport { readonly schema: "pomaster.control-data-flow/v1"; readonly source_root: string; readonly files_scanned: number; readonly controls_scanned: number; readonly controls: readonly ControlFlowControl[]; readonly parse_failures: readonly { file: string; message: string }[] }

const EVENT_NAMES = new Set(["onclick", "onchange", "oninput", "onsubmit", "onblur", "onselect", "onupdate:modelvalue"]);
const IGNORED = new Set([".git", ".pomaster", "node_modules", "dist", "build", "coverage"]);

function slash(value: string): string { return value.replaceAll("\\", "/"); }
function filesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (IGNORED.has(name)) continue;
      const full = resolve(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(?:tsx|vue)$/i.test(name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function anchor(source: ts.SourceFile, node: ts.Node, file: string): ControlFlowAnchor {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file, line: point.line + 1, column: point.character + 1 };
}

interface ScriptFacts {
  readonly source: ts.SourceFile;
  readonly functions: ReadonlyMap<string, ts.Node>;
  readonly renderIdentifiers: ReadonlySet<string>;
}

function scriptFacts(text: string, file: string, extraRender: readonly string[] = []): ScriptFacts {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const functions = new Map<string, ts.Node>();
  const render = new Set(extraRender);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.set(node.name.text, node.initializer);
    if (ts.isJsxExpression(node) && node.expression) collectIdentifiers(node.expression, render);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { source, functions, renderIdentifiers: render };
}

function collectIdentifiers(node: ts.Node, into: Set<string>): void {
  if (ts.isIdentifier(node)) into.add(node.text);
  ts.forEachChild(node, (child) => collectIdentifiers(child, into));
}

/**
 * Template expressions are parsed in a synthetic SourceFile while resolved handler bodies live
 * in the component script SourceFile. Always ask the node for its own source; passing an unrelated
 * SourceFile to getText() can produce wrong text or throw on otherwise valid Vue handlers.
 */
function nodeText(node: ts.Node): string {
  return node.getText(node.getSourceFile());
}

interface Slice { state: Set<string>; effects: ts.CallExpression[]; awaits: number; dynamic: boolean; nodes: ts.Node[] }
function sliceHandler(expr: ts.Node, facts: ScriptFacts): Slice {
  const slice: Slice = { state: new Set(), effects: [], awaits: 0, dynamic: false, nodes: [] };
  const seen = new Set<string>();
  const walk = (node: ts.Node, depth: number): void => {
    if (depth > 12) { slice.dynamic = true; return; }
    slice.nodes.push(node);
    if (ts.isElementAccessExpression(node)) slice.dynamic = true;
    if (ts.isAwaitExpression(node)) slice.awaits++;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (ts.isIdentifier(node.left)) slice.state.add(node.left.text);
      if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === "value" && ts.isIdentifier(node.left.expression)) slice.state.add(node.left.expression.text);
    }
    if (ts.isCallExpression(node)) {
      const callText = nodeText(node.expression);
      if (/^(?:fetch|axios(?:\.|$)|localStorage\.|sessionStorage\.|router\.|emit$|\$emit$)/.test(callText)) slice.effects.push(node);
      if (/^(?:set[A-Z]|dispatch$)/.test(callText)) slice.state.add(callText.replace(/^set/, "").replace(/^./, (c) => c.toLowerCase()));
      if (ts.isIdentifier(node.expression) && facts.functions.has(node.expression.text) && !seen.has(node.expression.text)) {
        seen.add(node.expression.text);
        walk(facts.functions.get(node.expression.text) as ts.Node, depth + 1);
      }
      if (ts.isElementAccessExpression(node.expression)) slice.dynamic = true;
    }
    ts.forEachChild(node, (child) => walk(child, depth));
  };
  if (ts.isIdentifier(expr)) {
    const target = facts.functions.get(expr.text);
    if (target) { seen.add(expr.text); walk(target, 0); } else slice.dynamic = true;
  } else walk(expr, 0);
  return slice;
}

function issue(rule: string, at: ControlFlowAnchor, message: string, certainty: "violation" | "blindspot"): ControlFlowIssue { return { rule, anchor: at, message, certainty }; }
function expressionText(expr: ts.Node): string {
  if (ts.isIdentifier(expr)) return expr.text;
  try { return nodeText(expr); } catch { return "<unprintable expression>"; }
}
function evaluate(framework: "react" | "vue", element: string, event: string, expr: ts.Node | null, at: ControlFlowAnchor, facts: ScriptFacts, ref: string, effectRequired = false): ControlFlowControl {
  const stages: ControlFlowStage[] = [
    { kind: "control", resolution: "resolved", anchor: at, detail: `<${element}>` },
    { kind: "event", resolution: "resolved", anchor: at, detail: event },
  ];
  const issues: ControlFlowIssue[] = [];
  if (expr === null) {
    issues.push(issue("CDF.EVENT_HANDLER_UNRESOLVED", at, "事件绑定缺少可解析 handler", "violation"));
    stages.push({ kind: "handler", resolution: "unresolved", anchor: at, detail: "handler absent" });
    return { control_ref: ref, framework, element, event, conclusion: "broken", stages, issues, runtime_confirmation_required: true };
  }
  if (event === "v-model" && ts.isIdentifier(expr)) {
    stages.push(
      { kind: "handler", resolution: "resolved", anchor: at, detail: "Vue v-model implicit update handler" },
      { kind: "state", resolution: "resolved", anchor: at, detail: expr.text },
      { kind: "feedback", resolution: facts.renderIdentifiers.has(expr.text) ? "resolved" : "unresolved", anchor: at, detail: facts.renderIdentifiers.has(expr.text) ? expr.text : "model state is not rendered" },
    );
    if (!facts.renderIdentifiers.has(expr.text)) issues.push(issue("CDF.RENDER_FEEDBACK_MISSING", at, "v-model 状态未发现 template 消费", "violation"));
    return { control_ref: ref, framework, element, event, conclusion: issues.length === 0 ? "proven" : "broken", stages, issues, runtime_confirmation_required: true };
  }
  const slice = sliceHandler(expr, facts);
  const handlerResolved = !(ts.isIdentifier(expr) && !facts.functions.has(expr.text));
  stages.push({ kind: "handler", resolution: handlerResolved ? "resolved" : "unresolved", anchor: at, detail: expressionText(expr) });
  if (!handlerResolved || slice.dynamic) issues.push(issue("CDF.AMBIGUOUS_DYNAMIC_EDGE", at, "handler 含动态或跨边界目标，静态切片不能唯一解析", "blindspot"));
  if (slice.state.size > 0) stages.push({ kind: "state", resolution: "resolved", anchor: at, detail: [...slice.state].sort().join(", ") });
  if (slice.effects.length > 0) stages.push({ kind: "effect", resolution: "resolved", anchor: at, detail: slice.effects.map((n) => nodeText(n.expression)).join(", ") });
  else if (effectRequired && !slice.dynamic) issues.push(issue("CDF.EFFECT_SINK_MISSING", at, "显式声明需要业务 effect 的交互未发现受信 effect sink", "violation"));
  else if (slice.state.size === 0 && !slice.dynamic) issues.push(issue("CDF.ACTION_CHAIN_UNRESOLVED", at, "handler 已解析，但没有状态写入或受信 effect；缺少显式义务时保持 unknown", "blindspot"));
  const hasNetworkEffect = slice.effects.some((effect) => /^(?:fetch|axios(?:\.|$))/.test(nodeText(effect.expression)));
  const hasAsyncConsumption = slice.awaits > 0 || slice.nodes.some((n) => ts.isPropertyAccessExpression(n) && ["then", "catch", "finally"].includes(n.name.text));
  const hasReadback = !hasNetworkEffect || (hasAsyncConsumption && slice.state.size > 0);
  if (slice.effects.length > 0) stages.push({ kind: "readback", resolution: hasReadback ? "resolved" : "unresolved", anchor: at, detail: hasReadback ? "await/then/catch response path" : "effect result not consumed" });
  if (!hasReadback) issues.push(issue("CDF.READBACK_MISSING", at, "effect 已发出但响应/错误链未被消费", "violation"));
  if (slice.effects.some((effect) => /body\s*:\s*JSON\.stringify\(\s*\{[^}]*:\s*(?:['\"`]|\d)/s.test(nodeText(effect)))) {
    issues.push(issue("CDF.PAYLOAD_CONTROL_VALUE_MISSING", at, "请求载荷为硬编码字面量，未发现控件/状态值进入 payload", "violation"));
  }
  const feedback = [...slice.state].filter((name) => facts.renderIdentifiers.has(name));
  if (slice.state.size > 0) stages.push({ kind: "feedback", resolution: feedback.length > 0 ? "resolved" : "unresolved", anchor: at, detail: feedback.length > 0 ? feedback.join(", ") : "written state is not rendered" });
  if (slice.state.size > 0 && feedback.length === 0) issues.push(issue("CDF.RENDER_FEEDBACK_MISSING", at, "状态写入后未发现 template/JSX 消费", "violation"));
  const conclusion: ControlFlowConclusion = issues.some((x) => x.certainty === "violation") ? "broken" : issues.length > 0 ? "unknown" : "proven";
  return { control_ref: ref, framework, element, event, conclusion, stages, issues, runtime_confirmation_required: true };
}

function reactControls(text: string, file: string): ControlFlowControl[] {
  const facts = scriptFacts(text, file);
  const controls: ControlFlowControl[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const element = node.tagName.getText(facts.source);
      const effectRequired = node.attributes.properties.some((attribute) =>
        ts.isJsxAttribute(attribute)
        && attribute.name.getText(facts.source) === "data-pomaster-cdf-effect"
        && attribute.initializer !== undefined
        && ts.isStringLiteral(attribute.initializer)
        && attribute.initializer.text === "required");
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const event = prop.name.getText(facts.source);
        if (!EVENT_NAMES.has(event.toLowerCase())) continue;
        const at = anchor(facts.source, prop, file);
        const expr = prop.initializer && ts.isJsxExpression(prop.initializer) ? prop.initializer.expression ?? null : null;
        controls.push(evaluate("react", element, event, expr, at, facts, `react:${file}:${at.line}:${at.column}:${event}`, effectRequired));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(facts.source);
  return controls;
}

function templateExpressions(node: unknown, into: string[]): void {
  if (node === null || typeof node !== "object") return;
  const row = node as Record<string, unknown>;
  const content = row["content"];
  if (typeof content === "string") into.push(...(content.match(/[A-Za-z_$][\w$]*/g) ?? []));
  for (const value of Object.values(row)) {
    if (Array.isArray(value)) value.forEach((entry) => templateExpressions(entry, into));
    else if (value && typeof value === "object") templateExpressions(value, into);
  }
}

interface VueSfcParts {
  readonly templateAst: unknown;
  readonly script: string;
  readonly templateLineOffset: number;
  readonly templateColumnOffset: number;
}

function vueSfcParts(text: string): VueSfcParts | null {
  const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template\s*>/i.exec(text);
  if (!template) {
    if (/<template\b/i.test(text)) throw new Error("Vue SFC template block is not closed");
    return null;
  }
  const templateSource = template[1] ?? "";
  const contentOffset = (template.index ?? 0) + template[0].indexOf(templateSource);
  const prefix = text.slice(0, contentOffset);
  const lastNewline = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
  const templateLineOffset = (prefix.match(/\n/g) ?? []).length;
  const templateColumnOffset = contentOffset - lastNewline - 1;
  const errors: string[] = [];
  const templateAst = parseVueTemplate(templateSource, {
    onError(error) { errors.push(error.message); },
  });
  if (errors.length > 0) throw new Error(errors.join("; "));
  const scripts: string[] = [];
  for (const match of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)) {
    scripts.push(match[1] ?? "");
  }
  return { templateAst, script: scripts.join("\n"), templateLineOffset, templateColumnOffset };
}

function vueControls(text: string, file: string): ControlFlowControl[] {
  const parts = vueSfcParts(text);
  if (parts === null) return [];
  const render: string[] = [];
  templateExpressions(parts.templateAst, render);
  const facts = scriptFacts(parts.script, `${file}.ts`, render);
  const controls: ControlFlowControl[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    if (row["type"] === 1 && typeof row["tag"] === "string" && Array.isArray(row["props"])) {
      const effectRequired = (row["props"] as Record<string, unknown>[]).some((candidate) => {
        if (candidate["type"] !== 6 || candidate["name"] !== "data-pomaster-cdf-effect") return false;
        const value = candidate["value"] as Record<string, unknown> | undefined;
        return value?.["content"] === "required";
      });
      for (const prop of row["props"] as Record<string, unknown>[]) {
        if (prop["type"] !== 7) continue;
        const name = prop["name"];
        const arg = prop["arg"] as Record<string, unknown> | undefined;
        const event = name === "model" ? "v-model" : name === "on" && typeof arg?.["content"] === "string" ? `@${String(arg["content"])}` : null;
        if (event === null) continue;
        const loc = prop["loc"] as { start?: { line?: number; column?: number } } | undefined;
        const localLine = loc?.start?.line ?? 1;
        const at = {
          file,
          line: localLine + parts.templateLineOffset,
          column: (loc?.start?.column ?? 1) + (localLine === 1 ? parts.templateColumnOffset : 0),
        };
        const exp = prop["exp"] as Record<string, unknown> | undefined;
        const content = typeof exp?.["content"] === "string" ? exp["content"] : null;
        let expr: ts.Node | null = null;
        if (content) {
          const synthetic = ts.createSourceFile("handler.ts", `(${content})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
          const stmt = synthetic.statements[0];
          if (stmt && ts.isExpressionStatement(stmt)) expr = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression;
        }
        controls.push(evaluate("vue", String(row["tag"]), event, expr, at, facts, `vue:${file}:${at.line}:${at.column}:${event}`, effectRequired));
      }
    }
    for (const value of Object.values(row)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  };
  walk(parts.templateAst);
  return controls;
}

export function analyzeControlDataFlow(projectRoot: string): ControlDataFlowReport {
  const root = resolve(projectRoot);
  const files = filesUnder(root);
  const controls: ControlFlowControl[] = [];
  const failures: { file: string; message: string }[] = [];
  for (const absolute of files) {
    const file = slash(relative(root, absolute));
    try {
      const text = readFileSync(absolute, "utf8");
      controls.push(...(absolute.endsWith(".vue") ? vueControls(text, file) : reactControls(text, file)));
    } catch (error) {
      failures.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }
  controls.sort((a, b) => a.control_ref.localeCompare(b.control_ref));
  failures.sort((a, b) => a.file.localeCompare(b.file));
  return { schema: "pomaster.control-data-flow/v1", source_root: ".", files_scanned: files.length, controls_scanned: controls.length, controls, parse_failures: failures };
}
