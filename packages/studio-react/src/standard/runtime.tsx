// 规范页运行时（React 画廊「规范」分区，Geist 预设）：与 Vue 画廊的 src/standard/runtime.ts 同一套
// 页面结构与 std- 样式类（.storybook/preview.css），呈现规则条文、参数表、执行方式、硬规范依据、
// 「这样做 / 别这样做」实时示例与源码、编辑入口。实时示例由生成器把规范源里的 JSX 编译成组件传进来，
// 渲染在 .geist-root 容器里（Geist 主题与局部 preflight 只在这里生效）。
import { Component, type ComponentType, type ReactNode } from "react";

export interface StdParam {
  readonly key: string;
  readonly label_zh: string | null;
  readonly kind: "token" | "value" | "decision";
  readonly token: string | null;
  readonly value: unknown;
  readonly unit: string;
  readonly source: string | null;
  readonly decision_zh: string | null;
  readonly candidates: readonly unknown[] | null;
  readonly note_zh: string | null;
  readonly pending: boolean;
}

export interface StdExample {
  readonly kind: "do" | "dont";
  readonly title_zh: string;
  readonly note_zh: string | null;
  readonly template: string | null;
  readonly jsx: string | null;
  readonly code: string | null;
  readonly lang: string | null;
}

export interface StdRule {
  readonly id: string;
  readonly title_zh: string;
  readonly statement_zh: string;
  readonly rationale_zh: string | null;
  readonly surfaces: readonly string[];
  readonly params: readonly StdParam[];
  readonly anchors: ReadonlyArray<{ readonly spec: string; readonly doc: string; readonly quote: string }>;
  readonly enforcement: { readonly kind: "gate" | "review"; readonly check?: string; readonly active?: boolean };
  readonly examples: readonly StdExample[];
  readonly storybook: { readonly id: string };
}

export interface StdArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group_title_zh: string;
  readonly summary_zh: string;
  readonly rules: readonly StdRule[];
  readonly storybook: { readonly title: string; readonly id: string };
}

export interface StdContext {
  readonly fingerprint: string;
  readonly meta: { readonly design_system_title_zh: string; readonly origin: string; readonly ui_library: string };
  readonly edit_file: string;
  readonly twin_files: readonly string[];
  readonly sources: Readonly<Record<string, { readonly title_zh: string; readonly url: string }>>;
}

export interface StdOverviewArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group_title_zh: string;
  readonly summary_zh: string;
  readonly rules: number;
  readonly gate: number;
  readonly pending: number;
  readonly storybook_id: string;
}

/** 规则编号 → 各示例对应的实时组件（code 示例为 null）。 */
export type StdExamples = Readonly<Record<string, ReadonlyArray<ComponentType | null>>>;

const SURFACE_ZH: Record<string, string> = { admin: "管理侧", public: "用户侧" };
const ORIGIN_ZH: Record<string, string> = { preset: "预设，项目尚未确认", customized: "在预设上定制", owner: "项目自著" };
const UNIT_SUFFIX: Record<string, string> = { px: "px", em: "em", percent: "%", ratio: ":1", count: " 个", chars: " 字", ms: "ms", none: "" };

function scalar(value: unknown, unit: string): string {
  return typeof value === "number" ? `${value}${UNIT_SUFFIX[unit] ?? ""}` : String(value);
}

export function formatParamValue(param: StdParam): string {
  if (Array.isArray(param.value)) return param.value.map((item) => scalar(item, param.unit)).join(" / ");
  return scalar(param.value, param.unit);
}

function storyHref(id: string): string {
  if (typeof window === "undefined") return `?path=/story/${id}`;
  try {
    return new URL(`./?path=/story/${id}`, window.location.href).toString();
  } catch {
    return `?path=/story/${id}`;
  }
}

class ExampleBoundary extends Component<{ readonly children: ReactNode }, { readonly failure: string | null }> {
  override state = { failure: null as string | null };

  static getDerivedStateFromError(error: unknown): { failure: string } {
    return { failure: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.failure !== null) {
      return (
        <div className="std-example-error" role="alert">
          示例渲染失败：{this.state.failure}
        </div>
      );
    }
    return this.props.children;
  }
}

function Badge({ kind, children }: { readonly kind: string; readonly children: ReactNode }) {
  return <span className={`std-badge std-badge--${kind}`}>{children}</span>;
}

function Badges({ rule }: { readonly rule: StdRule }) {
  return (
    <div className="std-badges">
      {rule.enforcement.kind === "review" ? (
        <Badge kind="review">人工评审</Badge>
      ) : (
        <>
          <Badge kind="gate">机器门禁</Badge>
          <code className="std-check">{rule.enforcement.check}</code>
          {rule.enforcement.active === true ? null : <span className="std-muted">检查待接入，接入前按评审执行</span>}
        </>
      )}
      {rule.surfaces.length === 2 ? (
        <Badge kind="surface">两个面都适用</Badge>
      ) : (
        rule.surfaces.map((surface) => (
          <Badge key={surface} kind="surface">
            仅{SURFACE_ZH[surface] ?? surface}
          </Badge>
        ))
      )}
    </div>
  );
}

function SourceLink({ ctx, id }: { readonly ctx: StdContext; readonly id: string | null }) {
  if (id === null) return null;
  const source = ctx.sources[id];
  if (source === undefined) return <>{id}</>;
  if (source.url.startsWith("repo:")) return <span title={source.url.slice(5)}>{source.title_zh}</span>;
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.title_zh}
    </a>
  );
}

function ParamValue({ param }: { readonly param: StdParam }) {
  if (param.pending) {
    const text = param.kind === "decision" ? `待项目决定：${param.decision_zh ?? ""}` : `待定：token ${param.token ?? ""} 仍为 UNKNOWN`;
    return (
      <td className="std-pending-cell">
        <span className="std-pending">{text}</span>
        {param.candidates === null ? null : (
          <div className="std-muted">候选：{param.candidates.map((c) => scalar(c, param.unit)).join(" / ")}</div>
        )}
      </td>
    );
  }
  if (typeof param.value === "object" && param.value !== null && !Array.isArray(param.value)) {
    return (
      <td>
        <dl className="std-map">
          {Object.entries(param.value as Record<string, unknown>).map(([key, value]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{key}</dt>
              <dd>
                <code>{String(value)}</code>
              </dd>
            </div>
          ))}
        </dl>
      </td>
    );
  }
  return (
    <td>
      <code className="std-value">{formatParamValue(param)}</code>
      {param.note_zh === null ? null : <div className="std-muted">{param.note_zh}</div>}
    </td>
  );
}

function ParamsTable({ rule, ctx }: { readonly rule: StdRule; readonly ctx: StdContext }) {
  if (rule.params.length === 0) return null;
  return (
    <table className="std-table">
      <thead>
        <tr>
          <th>参数</th>
          <th>值</th>
          <th>来源</th>
        </tr>
      </thead>
      <tbody>
        {rule.params.map((param) => (
          <tr key={param.key} data-param={param.key} data-pending={param.pending ? "true" : "false"}>
            <td>
              <div>{param.label_zh ?? param.key}</div>
              <code className="std-muted">p.{param.key}</code>
            </td>
            <ParamValue param={param} />
            <td>
              {param.kind === "token" ? (
                <>
                  <span className="std-muted">token </span>
                  <code>{param.token}</code>
                </>
              ) : param.kind === "decision" && param.source === null ? (
                <span className="std-muted">项目决策位</span>
              ) : (
                <SourceLink ctx={ctx} id={param.source} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamplePanel({ example, Live }: { readonly example: StdExample; readonly Live: ComponentType | null }) {
  return (
    <figure className={`std-example std-example--${example.kind}`} data-example-kind={example.kind}>
      <div className="std-example-head">
        <span className="std-example-label">{example.kind === "do" ? "这样做" : "别这样做"}</span>
        <span className="std-example-title">{example.title_zh}</span>
      </div>
      {example.jsx !== null && Live !== null ? (
        <>
          <div className="std-stage" data-live-example="true">
            <div className="geist-root">
              <ExampleBoundary>
                <Live />
              </ExampleBoundary>
            </div>
          </div>
          <details className="std-source">
            <summary>JSX 源码</summary>
            <pre className="std-code">
              <code>{example.jsx}</code>
            </pre>
          </details>
        </>
      ) : (
        <pre className="std-code std-code--static" data-lang={example.lang ?? ""}>
          <code>{example.code ?? ""}</code>
        </pre>
      )}
      {example.note_zh === null ? null : <p className="std-example-note">{example.note_zh}</p>}
    </figure>
  );
}

function RuleSection({
  rule,
  ctx,
  examples,
  level,
}: {
  readonly rule: StdRule;
  readonly ctx: StdContext;
  readonly examples: StdExamples;
  readonly level: 1 | 2;
}) {
  const Title = level === 1 ? "h1" : "h2";
  const Sub = level === 1 ? "h2" : "h3";
  const live = examples[rule.id] ?? [];
  return (
    <section className="std-rule" id={rule.id} data-rule={rule.id}>
      <div className="std-rule-id">{rule.id}</div>
      <Title className={level === 1 ? "std-title-1" : "std-title-2"}>{rule.title_zh}</Title>
      <Badges rule={rule} />
      <p className="std-statement">{rule.statement_zh}</p>
      {rule.rationale_zh === null ? null : <p className="std-muted std-prose">{rule.rationale_zh}</p>}
      {rule.params.length === 0 ? null : (
        <>
          <Sub className="std-title-3">参数</Sub>
          <ParamsTable rule={rule} ctx={ctx} />
        </>
      )}
      {rule.examples.length === 0 ? null : (
        <>
          <Sub className="std-title-3">示例</Sub>
          <div className="std-examples">
            {rule.examples.map((example, index) => (
              <ExamplePanel key={index} example={example} Live={live[index] ?? null} />
            ))}
          </div>
        </>
      )}
      {rule.anchors.length === 0 ? null : (
        <>
          <Sub className="std-title-3">硬规范依据</Sub>
          <ul className="std-anchors">
            {rule.anchors.map((anchor) => (
              <li key={anchor.quote}>
                <blockquote>{anchor.quote}</blockquote>
                <code className="std-muted">specs/hard/{anchor.doc}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="std-edit">
        修改这条规则：编辑 <code>{ctx.edit_file}</code> 里 id 为 {rule.id} 的条目，<code>pomaster design validate --system geist</code>{" "}
        校验后重新生成。
      </p>
    </section>
  );
}

function Header({ ctx, crumb }: { readonly ctx: StdContext; readonly crumb: string }) {
  return (
    <div className="std-crumb">
      <span>{crumb}</span>
      <Badge kind="origin">
        {ctx.meta.design_system_title_zh}（{ctx.meta.ui_library}）
      </Badge>
      <Badge kind="origin">{ORIGIN_ZH[ctx.meta.origin] ?? ctx.meta.origin}</Badge>
    </div>
  );
}

function Footer({ ctx }: { readonly ctx: StdContext }) {
  return (
    <footer className="std-footer">
      规范指纹 <code>{ctx.fingerprint}</code>。AI 读 {ctx.twin_files.map((file, index) => (
        <span key={file}>
          {index > 0 ? "、" : ""}
          <code>{file}</code>
        </span>
      ))}
      ，或运行 <code>pomaster design show --system geist --json</code>。
    </footer>
  );
}

export function AreaPage({ area, ctx, examples }: { readonly area: StdArea; readonly ctx: StdContext; readonly examples: StdExamples }) {
  const gate = area.rules.filter((rule) => rule.enforcement.kind === "gate").length;
  const pending = area.rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0);
  return (
    <article className="std-page" data-area={area.key}>
      <Header ctx={ctx} crumb={`规范 / ${area.group_title_zh}`} />
      <h1 className="std-title-1">{area.title_zh}</h1>
      <p className="std-lead">{area.summary_zh}</p>
      <div className="std-badges">
        <Badge kind="surface">{area.rules.length} 条规则</Badge>
        <Badge kind="gate">门禁 {gate}</Badge>
        <Badge kind="review">评审 {area.rules.length - gate}</Badge>
        {pending > 0 ? <Badge kind="pending">{pending} 个参数待定</Badge> : null}
      </div>
      <nav className="std-index" aria-label="本页规则">
        <table className="std-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>规则</th>
              <th>执行</th>
            </tr>
          </thead>
          <tbody>
            {area.rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <a href={`#${rule.id}`}>
                    <code>{rule.id}</code>
                  </a>
                </td>
                <td>{rule.title_zh}</td>
                <td>{rule.enforcement.kind === "gate" ? "机器门禁" : "人工评审"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </nav>
      {area.rules.map((rule) => (
        <RuleSection key={rule.id} rule={rule} ctx={ctx} examples={examples} level={2} />
      ))}
      <Footer ctx={ctx} />
    </article>
  );
}

export function RulePage({
  rule,
  area,
  ctx,
  examples,
}: {
  readonly rule: StdRule;
  readonly area: StdArea;
  readonly ctx: StdContext;
  readonly examples: StdExamples;
}) {
  return (
    <article className="std-page std-page--rule" data-area={area.key}>
      <Header ctx={ctx} crumb={`规范 / ${area.group_title_zh} / ${area.title_zh}`} />
      <RuleSection rule={rule} ctx={ctx} examples={examples} level={1} />
      <p className="std-edit">
        同领域的其他规则见{" "}
        <a href={storyHref(area.storybook.id)} target="_top">
          {area.title_zh}概览
        </a>
        。
      </p>
    </article>
  );
}

export function OverviewPage({ ctx, areas }: { readonly ctx: StdContext; readonly areas: readonly StdOverviewArea[] }) {
  const total = areas.reduce((sum, area) => sum + area.rules, 0);
  const gate = areas.reduce((sum, area) => sum + area.gate, 0);
  const pending = areas.reduce((sum, area) => sum + area.pending, 0);
  return (
    <article className="std-page" data-overview="true">
      <Header ctx={ctx} crumb="规范" />
      <h1 className="std-title-1">前端设计规范（React · Geist）</h1>
      <p className="std-lead">
        这里的每一页都是 React 栈开发必须遵守的规范，不是参考。页面、AI 孪生和 pomaster design show --system geist
        从同一份规范源生成；机器能查的规则由门禁直接拦截，其余在评审时逐条核对。
      </p>
      <div className="std-badges">
        <Badge kind="surface">{areas.length} 个领域</Badge>
        <Badge kind="surface">{total} 条规则</Badge>
        <Badge kind="gate">门禁 {gate}</Badge>
        <Badge kind="review">评审 {total - gate}</Badge>
        {pending > 0 ? <Badge kind="pending">{pending} 个参数待项目决定</Badge> : null}
      </div>
      <h2 className="std-title-2">怎么改规范</h2>
      <ol className="std-steps">
        <li>
          编辑规范源 <code>{ctx.edit_file}</code>：改条文、改数值、补示例。定值要登记出处，没定的写成项目决策位。
        </li>
        <li>
          运行 <code>pomaster design validate --system geist</code>：所有问题一次报全。
        </li>
        <li>
          运行 <code>node packages/studio-react/run.mjs generate</code>：页面和 AI 孪生一起更新，孪生不新鲜时 CI 会失败。
        </li>
      </ol>
      <h2 className="std-title-2">领域</h2>
      <ul className="std-area-list">
        {areas.map((area) => (
          <li key={area.key} data-area-link={area.key}>
            <a href={storyHref(area.storybook_id)} target="_top">
              {area.title_zh}
            </a>
            <span className="std-muted">
              {area.rules} 条，门禁 {area.gate}
              {area.pending > 0 ? `，${area.pending} 个参数待定` : ""}
            </span>
            <p className="std-prose">{area.summary_zh}</p>
          </li>
        ))}
      </ul>
      <Footer ctx={ctx} />
    </article>
  );
}
