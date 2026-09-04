---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/31-performance-protocol.md
seed_source_sha256: 416ff411c75e538feec3aad8be5e733b95913580fd937c0abebd16aa0d21608c
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 31 性能协议

## Scope

P1。定义首屏、包体、请求、列表、表格、图表、长任务和渲染稳定的性能规则。

## Non-Scope

不替代后端容量规划和基础设施性能，不允许只追分数牺牲正确性。

## Terms

- Performance Budget：可验证的时间、大小或资源阈值。
- Core Web Vitals：LCP、INP、CLS 等反映加载、交互响应和视觉稳定性的用户体验指标。
- RUM Distribution：按页面类型、设备、网络、浏览器、版本和采样窗口聚合的真实用户指标分布。
- Virtualization：仅渲染可见窗口数据。
- Stale Response：已被新请求替代的旧响应。

## MUST

- 定义首屏、包体、交互和核心页面预算。
- 路由、图表和重组件按需加载。
- 大列表服务端分页，宽表虚拟化。
- 搜索防抖、旧请求取消、过期响应丢弃。
- 长任务异步执行并可恢复。
- 性能变更用同数据量测量并记录结果。
- 性能预算必须区分实验室数据与真实用户数据，记录设备、网络、浏览器、采样窗口、指标版本和 p75 等统计口径。
- 启用真实用户监测时，核心 Web Vitals 应按当前稳定定义分设备评估；默认参考目标为 p75 的 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1，项目可基于证据收紧或批准例外。
- LCP、INP、CLS、FCP、TTFB、长任务和关键业务交互预算必须声明数据源、指标版本、测量起止点、样本下限、排除规则、聚合窗口和适用页面类型；p75 用于主要放行判断，p95/p99 用于尾部退化诊断。
- RUM 报告必须按页面类型、设备类别、网络类别、浏览器和应用版本切分，实验室结果不得冒充真实用户分布；运行采集与传输韧性引用 `34-monitoring-logging-protocol`。
- 页面隐藏、恢复与离开时必须暂停不必要工作并释放资源，恢复后重新校验数据新鲜度；遵守浏览器运行时生命周期协议。

### 分层性能责任（按目录层级）

性能是架构期约束，按目录层级分担责任；每层有明确的性能检查点与禁止行为。层级划分与 `09-module-boundary-protocol` 一致。

- **app 层 — 应用启动性能**：初始化代码、Provider 数量、全局插件、首屏依赖必须精简。路由必须懒加载（router-level lazy loading）。MUST NOT 在应用入口（如 `main.ts`）直接同步 import 重型编辑器、图表库或大表组件（用户打开登录页即加载整个系统能力 → 首屏变慢）。
- **platform 层 — 状态管理性能**：server state 走 Query Cache，local UI state 走状态库（如 Pinia）。MUST NOT 在全局 store 存储大量业务数据（如 10 万 BOM 节点入 Pinia → reactive 开销、刷新慢、内存增加）。
- **api 层 — 网络性能治理**：页面初始化请求必须并行或由后端聚合。MUST NOT 串行发起可并行的请求（如打开页面串行 GET user/permission/menu/bom/supplier/price/config = N×RTT）。
- **domain 层 — 计算性能**：实时轻计算在前端，重计算后台异步。MUST NOT 前端遍历大数据全集做计算（如改一个零件价格就遍历 10 万 BOM 节点 → CPU 100%、页面冻结）。
- **feature 层 — 页面级性能**：页面进入核心优先、非核心延迟加载（如 BOM 编辑页：核心表格先加载，历史/图表/分析延迟）。MUST NOT 一次加载页面全部重组件。
- **shared 层 — 公共组件性能**：Table / Tree / Select / Form / Modal / Virtual List 面对大数据必须虚拟滚动或分页。MUST NOT 大列表用普通 `v-for` 渲染全量数据（如 10000 行表格普通渲染）。

## MUST NOT

- MUST NOT 一次渲染大数据全部节点。
- MUST NOT 每次按键立即请求。
- MUST NOT 让旧响应覆盖新状态。
- MUST NOT 在 render 中执行复杂计算。
- MUST NOT 为追求性能分数牺牲安全、正确性、可访问性或用户可恢复性。
- MUST NOT 混用不同版本、不同环境或不同统计口径的性能结果作直接回归结论。
- MUST NOT 只报告平均值而省略样本量、分位数、窗口和切分维度。
- MUST NOT 在本协议定义业务行为漏斗或事件用途；这些规则归 `40-analytics-protocol`。
- MUST NOT 在应用入口同步 import 重型编辑器、图表库或大表组件（首屏重依赖）。
- MUST NOT 在全局状态库存储大量业务数据（server state 须走 Query Cache）。
- MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。
- MUST NOT 前端遍历大数据全集做计算（须实时轻计算 + 后台异步重计算）。
- MUST NOT 一次加载页面全部重组件（须核心优先、非核心延迟加载）。
- MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。

## SHOULD

- SHOULD 监控真实用户核心指标和业务交互时间。
- SHOULD 同时观察 p75 与 p95/p99，区分总体回归和长尾退化，并为样本不足标记不可判定而非假定通过。
- SHOULD 保持行高、工具栏和 loading 尺寸稳定。

## Contract

```text
Scenario, DatasetSize, BudgetMetric, Threshold,
MeasurementMethod, DataSource, MetricVersion, SampleWindow, SampleSize,
Percentile, Dimensions, Baseline, Owner
```

分层性能责任契约（按目录层级，与 `09-module-boundary-protocol` 层级一致）：

```text
Layer, Responsibility, CheckPoint, Forbidden
app, 启动性能/路由懒加载, 入口依赖 + Provider/插件数 + 首屏包, 入口同步 import 重型组件
platform, 状态管理性能, server vs local 归属 + store 数据量, 全局 store 存大数据
api, 网络性能, 请求并行/聚合 + 串行风暴, 可并行请求串行发起
domain, 计算性能, 实时轻计算 + 后台异步, 前端遍历大数据全集
feature, 页面级性能, 核心优先 + 非核心延迟, 一次加载全部重组件
shared, 公共组件性能, 虚拟滚动/分页, 大列表普通 v-for
```

## Checklist

- [ ] 预算和数据量明确。
- [ ] 分包、分页、虚拟化合理。
- [ ] 请求并发安全。
- [ ] 有测量证据。
- [ ] 实验室/真实用户口径、指标版本和分位数已记录。
- [ ] LCP/INP/CLS 等预算含数据源、样本下限、窗口、排除规则和页面适用范围。
- [ ] RUM 报告包含 p75 主要口径与 p95/p99 长尾诊断，样本不足不会被提升为通过。
- [ ] 隐藏、恢复与离开场景无无效工作和资源泄漏。
- [ ] 分层性能责任已按 app/platform/api/domain/feature/shared 分担，每层检查点与禁止行为已确认。

## Examples

### 内容示例，可删除

筛选输入防抖并取消旧请求，详情抽屉按需加载，导出创建后台任务。

## Anti-patterns

下载十万行到浏览器假分页，导致内存和交互崩溃。

应用入口同步 import 重型编辑器/图表/大表组件，导致登录页首屏被拖慢。

全局 Pinia store 存储 10 万 BOM 节点，reactive 开销致刷新慢、内存涨。

打开页面串行发起 6 个可并行请求，体验 N×RTT。

修改一个零件价格即遍历 10 万 BOM 节点重新计算，CPU 100%、页面冻结。

10000 行表格用普通 `v-for` 渲染，未虚拟滚动。

## Ownership

前端性能 Owner 维护预算，模块 Owner 修复回归，后端 Owner 配合数据和接口容量。

## Change Policy

预算放宽必须有数据和批准；新增重依赖或核心页面需建立基线。
