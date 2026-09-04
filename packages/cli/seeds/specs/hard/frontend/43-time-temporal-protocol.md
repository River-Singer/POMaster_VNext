---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/43-time-temporal-protocol.md
seed_source_sha256: 4669cc3d927289f99bbd66c3e906f97d548f0cf8ea9e94b66e8b21cb24d00afb
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 43 时间、日期与时区协议

## Scope

P1。定义时间点、日历日期、墙上时间、带时区计划、持续时长、序列化、计算、显示和测试语义。

## Non-Scope

不决定项目业务时区、营业日历、节假日或具体日期库，不替代国际化显示协议。

## Terms

- Instant：全球唯一的精确时间点。
- Local Date：不带时间与时区的日历日期。
- Wall-clock Time：某地日历和时钟上的本地时间，不天然对应唯一 Instant。
- Zoned Schedule：带命名时区和日历规则的计划时间。
- Duration：两个时间点之间的经过量或业务定义时长。

## MUST

- 每个时间字段必须分类为 Instant、Local Date、Wall-clock Time、Zoned Schedule 或 Duration，并在契约中记录精度、时区、日历和空值语义。
- 跨系统传输必须使用无歧义、版本化的机器格式；Instant 携带 UTC 或明确 offset，Zoned Schedule 同时保留命名时区。
- Local Date 不得隐式转换为午夜 Instant；Wall-clock Time 转换为 Instant 时必须提供时区和夏令时歧义策略。
- 解析必须使用明确格式，不依赖浏览器 locale、宿主默认时区或实现相关的字符串猜测。
- 比较、排序、筛选和计算必须使用规范化原始值，不得使用本地化显示文本。
- 时间单位必须显式，秒、毫秒、微秒等不得依靠数值大小猜测。
- 当前时间必须经可替换 Clock 获取；测试必须固定 Clock、时区和 locale，并覆盖月末、闰日、夏令时跳变及重复时刻。
- 经过时长和超时测量必须使用不受系统时钟回拨影响的单调时间来源；业务日历计算使用明确规则。

## MUST NOT

- MUST NOT 用字符串截断、手工 offset 加减或固定 24 小时替代日历/时区运算。
- MUST NOT 把无时区值静默解释为浏览器本地时区或 UTC。
- MUST NOT 混用秒与毫秒、日期与时间点、经过时长与日历天数。
- MUST NOT 将格式化后的日期时间用于计算、排序、缓存键或接口提交。
- MUST NOT 在业务代码中直接读取不可控的系统当前时间。

## SHOULD

- SHOULD 使用能区分日期、时间点、带时区时间和 Duration 的标准平台 API 或经评审的时间库。
- SHOULD 在用户界面明确展示与用户预期不同的业务时区。
- SHOULD 在日志和审计中同时记录规范化时间、时区上下文和事件顺序标识。

## Contract

```text
Field, TemporalKind, MachineFormat, Precision, TimeZone,
Calendar, AmbiguityPolicy, DisplayZone, ClockSource, TestMatrix
```

## Checklist

- [ ] 时间字段类型和单位无歧义。
- [ ] 日期、时间点和带时区计划未混用。
- [ ] 解析、排序和计算不依赖显示文本或宿主默认值。
- [ ] Clock 可替换，边界日期和夏令时已有测试。

## Examples

### 内容示例，可删除

审计事件保存为 Instant，生日保存为 Local Date，跨地区会议保存为带命名时区的 Zoned Schedule；三者使用不同类型和 adapter。

## Anti-patterns

把 `YYYY-MM-DD` 直接构造成时间点，再用浏览器默认时区显示，导致部分地区日期前移或后移一天。

## Ownership

领域 Owner 定义业务时间语义，接口 Owner 定义传输格式，前端平台 Owner 维护 Clock、解析和格式化能力。

## Change Policy

改变时间类型、精度、时区或序列化格式属于契约变更，必须迁移数据、缓存、测试和调用方，并同步 `universal:data-model-protocol` 与 `universal:internationalization-protocol`。
