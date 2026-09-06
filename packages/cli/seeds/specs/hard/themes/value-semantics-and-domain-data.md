---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:value-semantics-and-domain-data
criticality: standard # 聚合注记：来源无 criticality 字段，取中性默认；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源无 injection_mode 字段（默认基线 + 任务命中激活模型）；info 性注记非执行语义
stages: [] # 聚合注记：来源无 stages 字段；info 性注记非执行语义
triggers: [] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/12-business-rules-protocol.md
    sha256: dda683a7c907989032c82a2c1c3e552b51226e0e0cd5bdf3b6068cc7f649c525
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/13-monetary-precision-protocol.md
    sha256: 4930246c7dfed2751d3a71d617a21e24b46b376131723451b39152582c7a3d4f
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/14-data-model-protocol.md
    sha256: 7d4e31ef04a1f57d88e982c01dabc22c421bafc850b7295a73d084ec3c6fc838
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/43-time-temporal-protocol.md
    sha256: 4669cc3d927289f99bbd66c3e906f97d548f0cf8ea9e94b66e8b21cb24d00afb
    seed_version: B6B-2
---

# 值语义与领域数据

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 12 业务规则协议（pomaster/components/frontend-hard-spec/assets/universal/12-business-rules-protocol.md）**

P1。定义领域校验、操作许可、状态流转、时间范围、金额规则入口和后端兜底关系。

**源：FE 13 金额精度协议（pomaster/components/frontend-hard-spec/assets/universal/13-monetary-precision-protocol.md）**

P1。定义金额、单价、成本、汇率、比例和汇总的传输、计算、比较、展示与导出精度。

**源：FE 14 数据模型协议（pomaster/components/frontend-hard-spec/assets/universal/14-data-model-protocol.md）**

P1。定义 API DTO、Adapter、Domain Model、ViewModel、FormModel 和 RowModel 的分层。

**源：FE 43 时间、日期与时区协议（pomaster/components/frontend-hard-spec/assets/universal/43-time-temporal-protocol.md）**

P1。定义时间点、日历日期、墙上时间、带时区计划、持续时长、序列化、计算、显示和测试语义。

## Non-Scope

**源：FE 12 业务规则协议**

不定义视觉呈现，不允许前端规则替代后端权威规则。

**源：FE 13 金额精度协议**

不定义业务公式、税务政策、币种范围或最终结算口径。

**源：FE 14 数据模型协议**

不定义接口传输协议或具体业务公式，不允许模型层承担页面布局。

**源：FE 43 时间、日期与时区协议**

不决定项目业务时区、营业日历、节假日或具体日期库，不替代国际化显示协议。

## Terms

**源：FE 12 业务规则协议**

- Domain Rule：不依赖具体页面的业务判断。
- State Machine：合法状态及转换集合。
- Authoritative Validation：决定业务结果的后端校验。

**源：FE 13 金额精度协议**

- Amount：十进制定点值。
- Currency：正式币种标识。
- Scale：小数位数量。
- Rounding Mode/Stage：舍入方式与时点。

**源：FE 14 数据模型协议**

- DTO：接口原始结构。
- Adapter：边界转换函数。
- Domain Model：稳定业务语义模型。
- ViewModel：面向展示或交互的模型。

**源：FE 43 时间、日期与时区协议**

- Instant：全球唯一的精确时间点。
- Local Date：不带时间与时区的日历日期。
- Wall-clock Time：某地日历和时钟上的本地时间，不天然对应唯一 Instant。
- Zoned Schedule：带命名时区和日历规则的计划时间。
- Duration：两个时间点之间的经过量或业务定义时长。

## MUST

**源：FE 12 业务规则协议 · §MUST**

- 规则集中存放、命名、测试并有 Owner。
- 页面和组件调用规则函数，不复制表达式。
- 状态转换声明来源、目标、条件、权限和失败码。
- 金额、比例、日期区间和操作限制有明确契约。
- 后端执行最终一致性和权威校验。

**源：FE 13 金额精度协议 · §MUST**

- 金额声明 amount、currency、scale 和舍入规则。
- 传输使用十进制字符串或无歧义最小单位整数。
- 权威计算使用 Decimal/BigDecimal 等十进制能力。
- 区分原始、计算、展示和导出值。
- 汇总按正式顺序计算和舍入。
- 百分比声明传输倍率。

**源：FE 14 数据模型协议 · §MUST**

- 使用 `DTO -> Adapter -> Domain Model -> View/Form/Row Model` 链路。
- 明确类型命名、位置、Owner 和公开边界。
- 空值、未知枚举、日期、金额和单位在边界统一处理。
- API、浏览器存储、跨窗口消息、运行时配置和第三方 SDK 等外部数据必须在信任边界执行 schema 校验后再转换；失败时保守降级并产生安全监控。
- opaque ID、超出 JavaScript safe integer 的整数和高精度数值必须使用不会静默丢失精度的传输与模型类型。
- 后端字段变化优先只影响契约和 adapter。
- adapter 有正常、空值、未知值和边界测试。

**源：FE 43 时间、日期与时区协议 · §MUST**

- 每个时间字段必须分类为 Instant、Local Date、Wall-clock Time、Zoned Schedule 或 Duration，并在契约中记录精度、时区、日历和空值语义。
- 跨系统传输必须使用无歧义、版本化的机器格式；Instant 携带 UTC 或明确 offset，Zoned Schedule 同时保留命名时区。
- Local Date 不得隐式转换为午夜 Instant；Wall-clock Time 转换为 Instant 时必须提供时区和夏令时歧义策略。
- 解析必须使用明确格式，不依赖浏览器 locale、宿主默认时区或实现相关的字符串猜测。
- 比较、排序、筛选和计算必须使用规范化原始值，不得使用本地化显示文本。
- 时间单位必须显式，秒、毫秒、微秒等不得依靠数值大小猜测。
- 当前时间必须经可替换 Clock 获取；测试必须固定 Clock、时区和 locale，并覆盖月末、闰日、夏令时跳变及重复时刻。
- 经过时长和超时测量必须使用不受系统时钟回拨影响的单调时间来源；业务日历计算使用明确规则。

## MUST NOT

**源：FE 12 业务规则协议 · §MUST NOT**

- MUST NOT 将同一规则散落在组件、文案和 API 回调。
- MUST NOT 以按钮禁用代替后端校验。
- MUST NOT 在无正式来源时发明状态或公式。
- MUST NOT 用展示文案作为规则返回值。

**源：FE 13 金额精度协议 · §MUST NOT**

- MUST NOT 使用二进制浮点执行正式金额累计、乘除和相等比较。
- MUST NOT 用 `toFixed` 代替十进制计算。
- MUST NOT 混合币种直接求和。
- MUST NOT 页面、报表、导出各自决定精度。

**源：FE 14 数据模型协议 · §MUST NOT**

- MUST NOT 让 DTO 穿透公共组件、模板或列定义。
- MUST NOT 在页面重复字段转换和兜底。
- MUST NOT 使用万能对象代替类型。
- MUST NOT 在模型转换中隐藏正式业务计算。
- MUST NOT 用 TypeScript 类型、类型断言或生成类型替代运行时外部数据校验。
- MUST NOT 把 opaque ID 或大整数转成可能丢失精度的 `number`。

**源：FE 43 时间、日期与时区协议 · §MUST NOT**

- MUST NOT 用字符串截断、手工 offset 加减或固定 24 小时替代日历/时区运算。
- MUST NOT 把无时区值静默解释为浏览器本地时区或 UTC。
- MUST NOT 混用秒与毫秒、日期与时间点、经过时长与日历天数。
- MUST NOT 将格式化后的日期时间用于计算、排序、缓存键或接口提交。
- MUST NOT 在业务代码中直接读取不可控的系统当前时间。

## SHOULD

**源：FE 12 业务规则协议 · §SHOULD**

- SHOULD 使用纯函数、schema 和状态机表达可测试规则。
- SHOULD 返回稳定原因码供 UI 映射文案。

**源：FE 13 金额精度协议 · §SHOULD**

- SHOULD 使用统一 Money/Decimal 类型、parser 和 formatter。
- SHOULD 测试负数、极值、尾数 5、汇总和跨币种边界。

**源：FE 14 数据模型协议 · §SHOULD**

- SHOULD 使用 schema 校验外部数据。
- SHOULD 为未知枚举保留安全兜底和监控。

**源：FE 43 时间、日期与时区协议 · §SHOULD**

- SHOULD 使用能区分日期、时间点、带时区时间和 Duration 的标准平台 API 或经评审的时间库。
- SHOULD 在用户界面明确展示与用户预期不同的业务时区。
- SHOULD 在日志和审计中同时记录规范化时间、时区上下文和事件顺序标识。

## Contract

**源：FE 12 业务规则协议 · §Contract**

```text
RuleId, Inputs, Preconditions, Result,
ReasonCodes[], BackendEnforcement, Owner, Version
```

**源：FE 13 金额精度协议 · §Contract**

```text
Money { amount: decimal-string, currency: string, scale: integer }
Rule { calculationScale, displayScale, roundingMode, roundingStage }
```

**源：FE 14 数据模型协议 · §Contract**

```text
SourceDTO, RuntimeSchema, Adapter, DomainModel, ConsumerModel,
NullPolicy, EnumPolicy, IdentifierPolicy, PrecisionPolicy, FormatPolicy, Owner
```

**源：FE 43 时间、日期与时区协议 · §Contract**

```text
Field, TemporalKind, MachineFormat, Precision, TimeZone,
Calendar, AmbiguityPolicy, DisplayZone, ClockSource, TestMatrix
```

## Checklist

**源：FE 12 业务规则协议 · §Checklist**

- [ ] 规则来源和 Owner 明确。
- [ ] 页面未复制规则。
- [ ] 状态与错误码完整。
- [ ] 后端有权威兜底。

**源：FE 13 金额精度协议 · §Checklist**

- [ ] amount/currency/scale/rounding 完整。
- [ ] 未使用浮点做正式计算。
- [ ] 展示、汇总和导出一致。
- [ ] 比例和跨币种语义明确。

**源：FE 14 数据模型协议 · §Checklist**

- [ ] 模型层次明确。
- [ ] 外部数据已校验转换。
- [ ] 组件只消费稳定模型。
- [ ] adapter 测试完整。
- [ ] 外部数据校验失败和大整数/opaque ID 已覆盖。

**源：FE 43 时间、日期与时区协议 · §Checklist**

- [ ] 时间字段类型和单位无歧义。
- [ ] 日期、时间点和带时区计划未混用。
- [ ] 解析、排序和计算不依赖显示文本或宿主默认值。
- [ ] Clock 可替换，边界日期和夏令时已有测试。

## Examples

**源：FE 12 业务规则协议 · §Examples**

### 内容示例，可删除

`canApprove(entity, actor)` 返回允许状态和原因码，页面仅决定如何展示。

**源：FE 13 金额精度协议 · §Examples**

### 内容示例，可删除

保留接口金额字符串，通过统一 formatter 展示，不先转为浮点数。

**源：FE 14 数据模型协议 · §Examples**

### 内容示例，可删除

API 的 snake_case DTO 经 adapter 转成稳定 Domain Model，再生成表格 RowModel。

**源：FE 43 时间、日期与时区协议 · §Examples**

### 内容示例，可删除

审计事件保存为 Instant，生日保存为 Local Date，跨地区会议保存为带命名时区的 Zoned Schedule；三者使用不同类型和 adapter。

## Anti-patterns

**源：FE 12 业务规则协议 · §Anti-patterns**

三个页面分别用不同 if 判断“审批中不可编辑”，导致规则漂移。

**源：FE 13 金额精度协议 · §Anti-patterns**

用 `parseFloat` 累加成本，再 `toFixed(2)` 生成正式报表。

**源：FE 14 数据模型协议 · §Anti-patterns**

模板直接访问后端字段并在多个单元格各自处理 null 和枚举。

**源：FE 43 时间、日期与时区协议 · §Anti-patterns**

把 `YYYY-MM-DD` 直接构造成时间点，再用浏览器默认时区显示，导致部分地区日期前移或后移一天。

## Ownership

**源：FE 12 业务规则协议 · §Ownership**

业务/领域 Owner 定义语义，后端 Owner 保证权威执行，前端负责一致呈现。

**源：FE 13 金额精度协议 · §Ownership**

业务/财务定义口径，后端负责权威计算，前端负责无损传输，QA 验证边界。

**源：FE 14 数据模型协议 · §Ownership**

API Owner 维护 DTO，领域 Owner 维护 Domain Model，前端模块 Owner 维护 adapter/ViewModel。

**源：FE 43 时间、日期与时区协议 · §Ownership**

领域 Owner 定义业务时间语义，接口 Owner 定义传输格式，前端平台 Owner 维护 Clock、解析和格式化能力。

## Change Policy

**源：FE 12 业务规则协议 · §Change Policy**

规则或状态变化必须版本化并同步 API、权限、审计、文案和测试。

**源：FE 13 金额精度协议 · §Change Policy**

精度、币种、舍入或比例语义变化属于破坏性契约变更，必须同步全链路。

**源：FE 14 数据模型协议 · §Change Policy**

模型字段变化必须说明兼容、迁移和受影响消费者；公共模型不得静默改语义。

**源：FE 43 时间、日期与时区协议 · §Change Policy**

改变时间类型、精度、时区或序列化格式属于契约变更，必须迁移数据、缓存、测试和调用方，并同步 `universal:data-model-protocol` 与 `universal:internationalization-protocol`。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
