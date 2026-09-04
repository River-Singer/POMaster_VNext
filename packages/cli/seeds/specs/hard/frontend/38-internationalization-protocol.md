---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/38-internationalization-protocol.md
seed_source_sha256: 68ed4e126042eee191f071786d58983b3b2df94a826a13b50fc52aaa6536c7fa
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 38 国际化协议

## Scope

P2。定义前端多语言机制：locale 标识与切换、文案外置与 key 命名、ICU MessageFormat、日期/时间/时区/相对时间、数字/货币/百分比/单位、列表/排序/搜索、RTL 与双向文本、文本膨胀与排版、图片/图标/颜色文化适配、翻译工作流与字典管理、SSR hydration 一致性、第三方 SDK / 浏览器原生文案 / 后端错误文案的本地化。

## Non-Scope

- 不翻译用户数据、不定义业务文案内容质量（语气/术语/voice）—— 见 `39-copywriting-protocol.md`。
- 不定义金额精度、业务时区、合规区域本身。
- 不替代 CLDR/Intl API 的实现细节，只规定必须使用的决策、契约和证据。

## Terms

- Locale：IETF BCP 47 语言标签（如 `zh-CN`、`en-US`、`ja-JP`、`ar-SA`），决定语言、格式、排序、方向和数字系统。
- Translation Key：稳定文案标识，不随目标语言变化。
- Formatter Registry：日期、时间、数字、金额、百分比、币种、单位、枚举和空值显示的唯一策略源。
- RTL：Right-to-Left 文本方向；LTR：Left-to-Right。
- ICU MessageFormat：Unicode ICU MessageFormat 2.0，用于复数、select、ordinal、offset 和命名占位符。

## MUST

- 明确支持 locale 列表、默认 locale 和完整回退链（如 `zh-CN` → `zh` → `en-US`）。
- 使用 IETF BCP 47 语言标签标识 locale；禁止手写 `zh`、`cn`、`en` 等不精确别名。
- locale 切换后所有已渲染的格式化值同步刷新，不允许旧 locale 残留。
- URL 路径或子域携带 locale（如 `/zh-CN/dashboard`），或提供可书签化的 Cookie/LocalStorage 回退并由服务端首屏读取。
- 切换 locale 时不丢失页面状态（query string、hash、表单草稿）。
- 禁止在模板/组件/脚本中硬编码任何自然语言文本（用户数据除外）。
- key 使用稳定标识，禁止用中文/英文文案本身作为 key。
- key 采用命名空间隔离，如 `module:page.section.element` 或扁平点分 `login.form.submit`。
- 插值占位符使用命名占位符 `{userName}`；禁止用位置占位符 `{0}`。
- 占位符内容在运行时做 HTML 转义；如需输出 HTML，必须显式标记并经安全审查（XSS 边界，见 `04-security-protocol.md`）。
- key 删除/改名必须走废弃别名机制，不能直接删除。
- 复数、性别、状态选择使用 ICU MessageFormat `plural` / `select` / `selectordinal`；禁止用字符串拼接实现。
- `plural` / `select` / `selectordinal` 必须包含 `other` 分支。
- 日期、时间、相对时间通过 Formatter Registry 统一输出；禁止页面本地拼接 `YYYY-MM-DD` 或写死 "2 天前"。
- 存储时间使用 ISO 8601 / UTC；显示时间按用户 locale + 显式时区转换。
- 使用 `Intl.DateTimeFormat` 时显式传入 `timeZone`；禁止依赖系统时区。
- 数字、货币、百分比、单位统一通过 Formatter Registry 输出。
- 货币代码使用 ISO 4217（`CNY`、`USD`、`EUR`）；禁止用 `$`、`￥` 符号硬编码。
- 货币格式化显式指定 `currencyDisplay`（`symbol`/`narrowSymbol`/`code`/`name`）。
- 小数/千分位分隔符由 CLDR 决定；禁止硬编码 `.` 或 `,`。
- 百分比与原始数值分离存储，排序/计算用原始值。
- 列表连接使用 `Intl.ListFormat`；禁止用 `, ` 或 `/` 硬编码。
- locale-aware 排序使用 `Intl.Collator`；禁止用 `Array.prototype.sort()` 默认字节序。
- 大小写折叠、搜索归一化使用 locale 感知方法；禁止 `toLowerCase()` 处理非英语搜索。
- 正则表达式考虑 Unicode 属性（`\p{Letter}`）；禁止只用 `[a-zA-Z]`。
- HTML 根元素 `dir` 与当前 locale 方向一致；RTL locale（ar/he/fa/ur 等）使用 `dir="rtl"`。
- 使用 CSS logical properties（`margin-inline-start`、`border-inline-end` 等）替代物理方向属性。
- 镜像布局要素：导航顺序、按钮组、表单标签位置、图标方向（前进/后退、播放/进度条）。
- 对动态插入的数字/用户生成内容使用 `<bdi>` 或 CSS `unicode-bidi: isolate`。
- 德语、芬兰语等长文本膨胀系数按 1.3–1.5 预留空间；按钮、表头、标签必须支持换行或截断策略。
- 所有文案容器定义 `overflow-wrap` / `word-break` 策略；禁止固定宽度导致文字被截断不可读。
- 图片不得依赖文字传递关键信息；图标必须可本地化或带文本标签。
- 避免文化敏感符号、颜色、手势、宗教/政治隐喻。
- 日期/节假日按 locale 显示；禁止硬编码单一文化节日。
- 度量衡单位按 locale 适配（英里/公里、磅/千克、华氏/摄氏）。
- 明确 source-of-truth 语言；字典文件版本化并与代码同步发布。
- 缺失 key 必须回退到 source 语言并标记告警。
- 翻译平台 API 与 CI 集成；禁止手动复制 JSON 到代码库。
- 字典文件支持命名空间/代码分割；禁止单个巨型 JSON。
- SSR 首屏 locale 由服务端根据 URL/Cookie/Header 确定，并在 HTML 中序列化供 hydration。
- 构建时抽取翻译 key，避免运行时扫描文件系统。
- hydration 前后 locale 和初始字典一致；禁止服务端用默认 locale、客户端切换导致 mismatch。
- 后端错误 message 必须映射为前端翻译 key，禁止直接展示后端原始 message。
- 第三方 SDK/组件的 locale 配置必须显式传入当前 locale，禁止静默使用默认英文。
- 验证第三方组件的 RTL 支持能力；不支持 RTL 的第三方组件必须评估替代方案或包装隔离。

### 分层责任（按目录层级）

国际化是跨层机制，按目录层级分担责任；层级划分与 `09-module-boundary-protocol` 一致。

- **app 层 — locale 入口与切换**：初始化 i18n Provider、默认 locale、回退链、locale 协商策略、URL/Cookie 持久化。MUST NOT 在应用入口硬编码 locale 或把 `navigator.language` 作为唯一业务来源。
- **platform 层 — 全局 formatter 与字典**：维护 Formatter Registry、全局字典加载/分割、伪本地化、翻译平台同步。MUST NOT 让各页面自行格式化数据或复制组件实现多语言。
- **api 层 — 后端契约本地化**：错误码映射为翻译 key、货币/单位/时区字段语义对齐、API 响应不携带未本地化的自然语言。MUST NOT 直接展示后端原始 message。
- **domain 层 — 领域值本地化策略**：金额精度、单位换算、枚举显示、空值/缺省值显示由 domain 决定策略，由 Formatter Registry 执行显示。MUST NOT 在 domain 逻辑中用翻译文本做业务判断。
- **feature 层 — 页面级 i18n 契约**：页面声明支持的 locale、RTL 需求、key namespace、第三方 SDK locale 矩阵。MUST NOT 页面本地拼接日期/货币/列表格式。
- **shared 层 — 组件级 i18n 内置**：公共组件内置文案外置、RTL 兼容、logical properties、图标方向翻转、可本地化空态。MUST NOT 组件内部硬编码自然语言或假设 LTR。

## MUST NOT

- MUST NOT 各页面自行格式化数据。
- MUST NOT 用中文/英文标题作为程序 key。
- MUST NOT 复制组件实现多语言。
- MUST NOT 将格式化字符串用于计算或排序。
- MUST NOT 用浏览器 `navigator.language` 作为唯一来源决定业务权限、价格或合规区域。
- MUST NOT 用中文/英文文案本身作为 key。
- MUST NOT 用位置占位符 `{0}` / `{1}`。
- MUST NOT 在源码中直接写 locale-specific 复数分支。
- MUST NOT 用 `Date.prototype.toLocaleString()` 无参调用。
- MUST NOT 手动拼接币种和单位符号。
- MUST NOT 硬编码小数点/千分位分隔符。
- MUST NOT 用字符串拼接实现复数/选择/序数。
- MUST NOT 用 `Array.prototype.sort()` 默认字节序做业务排序。
- MUST NOT 用 `toLowerCase()` / `toUpperCase()` 处理非英语搜索。
- MUST NOT 用物理方向 CSS（`margin-left/right`）替代 logical properties。
- MUST NOT 硬编码 `dir="ltr"` 包裹整个应用。
- MUST NOT 假设源语言（中文）紧凑即所有语言都紧凑。
- MUST NOT 图片包含不可翻译文字作为关键信息。
- MUST NOT 硬编码单一文化节日、单位换算或数字系统。
- MUST NOT 把 UI 文案 key 用作业务逻辑判断（如 `if (t('status') === '已启用')`）。
- MUST NOT 在源码提交后才发现缺失 key。
- MUST NOT 在服务端 render 中读取 `window.navigator.language`。
- MUST NOT 将未本地化的第三方错误文案直接呈现给用户。

## SHOULD

- SHOULD 支持缺失 key 检测和伪本地化。
- SHOULD 明确存储时区与显示时区。
- SHOULD 提供 locale 协商：URL > 用户显式选择 > Cookie > `Accept-Language` > 默认。
- SHOULD 维护 key 命名约定文档 + 禁用词表。
- SHOULD 提供复数/选择消息的视觉回归测试（阿拉伯语/俄语/波兰语等复杂复数）。
- SHOULD 在关键业务场景（预约/截止时间）显示时区全名。
- SHOULD 支持 accounting 格式（负数括号表示）。
- SHOULD 对关键 UI 文案做 "longest translation" 回归测试。
- SHOULD 建立可本地化素材清单（illustration/color/icon/photo）。
- SHOULD 支持 pseudo-localization（伪本地化：lengthening、accents、fake-RTL）做布局回归。
- SHOULD 在关键错误/空态使用自定义组件替代浏览器原生 `alert()` / `confirm()`。
- SHOULD 维护第三方 SDK locale/RTL 兼容性矩阵。

## Contract

```text
Locale, Fallback, KeyNamespace, DateTimePolicy,
NumberPolicy, CurrencyPolicy, UnitPolicy, EnumPolicy, EmptyPolicy,
RTLPolicy, PluralPolicy, ListFormatPolicy, CollatorPolicy,
TranslationWorkflowPolicy, ThirdPartyLocaleMatrix
```

- `Locale` / `Fallback`：支持的 locale 列表和回退链。
- `KeyNamespace`：文案 key 的命名空间约定。
- `DateTimePolicy` / `NumberPolicy` / `CurrencyPolicy` / `UnitPolicy` / `EnumPolicy` / `EmptyPolicy`：Formatter Registry 策略 ID。
- `RTLPolicy`：RTL locale 列表和布局镜像策略。
- `PluralPolicy`：ICU MessageFormat 版本和复数分支要求。
- `ListFormatPolicy` / `CollatorPolicy`：列表连接与排序策略。
- `TranslationWorkflowPolicy`：source 语言、翻译平台、命名空间拆分、review 策略。
- `ThirdPartyLocaleMatrix`：第三方 SDK/组件的 locale 与 RTL 兼容性矩阵。

### Formatter Registry

`outputs/frontend/10_planned/formatter-registry.yaml` 记录项目级 formatter 策略：

```text
Category, PolicyId, DefaultValue, UnknownValue, DeprecatedValue,
Examples, Owner, Version
```

- Category 至少覆盖 date、time、datetime、number、money、percent、currency、unit、enum、empty。
- 每个页面或组件必须通过 registry 中声明的 formatter 输出值，禁止本地拼接格式。

## Checklist

- [ ] locale 列表、默认 locale、回退链和 locale 协商策略已明确。
- [ ] 文案外置，无硬编码自然语言；key 使用稳定命名空间标识。
- [ ] 插值使用命名占位符，HTML 输出经显式标记和安全审查。
- [ ] ICU MessageFormat 用于复数/性别/状态/序数，且包含 `other` 分支。
- [ ] 日期/时间/相对时间/数字/货币/百分比/单位通过 Formatter Registry 输出。
- [ ] 显式时区，不依赖系统时区；UTC 存储，locale 显示。
- [ ] 列表连接、排序、搜索使用 `Intl.ListFormat` / `Intl.Collator` / locale 感知归一化。
- [ ] RTL locale 已识别，`dir`、`logical properties`、图标翻转和 `<bdi>` 已处理。
- [ ] 文本膨胀系数、换行/截断策略、长文案回归已安排。
- [ ] 图片/图标/颜色/节日/单位/数字系统已做文化适配审查。
- [ ] source-of-truth 语言、翻译平台、命名空间拆分、review 策略已建立。
- [ ] SSR 首屏 locale 由服务端确定并序列化；hydration 前后一致。
- [ ] 后端错误 message 映射为翻译 key；第三方 SDK locale/RTL 矩阵已维护。
- [ ] 分层国际化责任已按 app/platform/api/domain/feature/shared 分担。

## Examples

### locale 切换保留 URL state

```text
切换前: /zh-CN/dashboard?tab=1#section-a
切换后: /en-US/dashboard?tab=1#section-a
```

### 命名占位符与 ICU plural

```text
key: "cart.item_count"
en-US: "You have {itemCount, number} {itemCount, plural, one {item} other {items}}."
ar-SA: "لديك {itemCount, number} {itemCount, plural, zero {} one {عنصر} two {عنصرين} few {عناصر} many {عنصرًا} other {عنصر}}."
```

### Formatter Registry 统一货币显示

```text
原始值: 1234.5
zh-CN 显示: ¥1,234.50
en-US 显示: $1,234.50
de-DE 显示: 1.234,50 EUR
排序/计算仍使用原始数值 1234.5
```

### RTL 使用 logical properties

```css
/* 推荐 */
margin-inline-start: 1rem;
/* 不推荐 */
margin-left: 1rem;
```

### 后端错误映射为翻译 key

```text
后端返回: { "code": "ORDER.OUT_OF_STOCK", "message": "Insufficient inventory" }
前端显示: t('error.ORDER.OUT_OF_STOCK') -> "库存不足，无法完成订单。"
```

## Anti-patterns

- 模板拼接币种和单位，切换语言后顺序、间距和小数规则错误。
- 用 `if (count === 1)` 拼接单复数，阿拉伯语/俄语/波兰语分支错误。
- 用 `{0}` 位置占位符，翻译调整语序后插值错位。
- `Date.prototype.toLocaleString()` 无参调用，依赖用户系统时区导致显示不一致。
- 硬编码 `$` / `￥` 符号，德语、法语显示格式错误。
- 对格式化后的金额字符串做排序，导致 1000 < 99。
- 用 `margin-left/right` 物理方向，RTL 布局破裂。
- 图片包含 "New!" "Sale" 等英文文字，未做本地化即上线。
- 硬编码春节/圣诞作为默认节日，其他 locale 用户困惑。
- 后端错误 message 直接展示给用户，暴露内部术语或英文。
- SSR 服务端用默认 locale 渲染，客户端 hydration 后闪烁切换。

## Ownership

产品/内容 Owner 维护语言范围和文化适配清单，i18n Owner 维护工具、key、Formatter Registry 和翻译工作流，领域 Owner 维护枚举语义和后端错误码映射，前端架构 Owner 维护 locale 切换、SSR hydration 和第三方 SDK 矩阵。

## Change Policy

Key 改名先提供别名或迁移；新增 locale 必须补资源、格式、布局回归和 RTL 测试。Formatter Registry 策略变化须评估所有页面/组件影响；第三方 SDK locale/RTL 兼容性矩阵随 SDK 版本更新而更新。
