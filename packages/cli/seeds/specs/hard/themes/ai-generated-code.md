---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend, backend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend, backend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:ai-generated-code
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: always # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/02-ai-generated-code-protocol.md
    sha256: a80ea1c51c9afc0b96001cfffa0675edafb1572563652840bcf88770d81203c8
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/06-ai-generated-code-protocol.md
    sha256: a88614806137f33161b741d2a9fbc6ee310fa4f0cbf6acd222de07c14aee3d75
    seed_version: B6C
---

# AI 生成代码

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 02 AI 生成代码协议（pomaster/components/frontend-hard-spec/assets/universal/02-ai-generated-code-protocol.md）**

P0。约束 AI 分析、生成、修改、评审和验证代码时的行为。

**源：BE 06 AI 生成代码协议（pomaster/components/backend-hard-spec/assets/universal/06-ai-generated-code-protocol.md）**

约束 Agent 的前置检查、事实边界、复用搜索、实现与验证声明。

## Non-Scope

**源：FE 02 AI 生成代码协议**

不替代人工需求决策、代码所有权、测试、合规审批或上线责任。

**源：BE 06 AI 生成代码协议**

不授权 Agent 自行决定业务事实或扩大写集。

## Terms

**源：FE 02 AI 生成代码协议**

- AI Change Plan：写代码前声明的协议、事实、范围和验证计划。
- Invented Contract：无正式来源而猜测的字段、状态、权限、API 或规则。
- Unrelated Change：当前目标不需要的修改。

**源：BE 06 AI 生成代码协议**

权威事实包括已确认的 PRD、契约、schema、配置来源和仓库证据。

## MUST

**源：FE 02 AI 生成代码协议 · §MUST**

- AI 写代码前读取适用协议并输出 Change Plan。
- AI 必须先搜索已有组件、抽象、契约、工具和同类实现。
- AI 必须区分事实、推断和待确认项。
- AI 必须说明为什么修改这些文件、为什么不修改其他层。
- AI 必须运行可用检查并如实报告未验证项。
- AI 必须保留与任务无关的用户现有改动。

**源：BE 06 AI 生成代码协议 · §MUST**

- 写入前必须读取规范、搜索复用点，并按风险运行可复核检查。

## MUST NOT

**源：FE 02 AI 生成代码协议 · §MUST NOT**

- MUST NOT 发明正式字段、枚举、公式、权限码、接口、路由或配置。
- MUST NOT 重复创建已有能力。
- MUST NOT 删除测试、降低断言、关闭规则或用类型逃逸掩盖问题。
- MUST NOT 声称执行了实际未运行的验证。

**源：BE 06 AI 生成代码协议 · §MUST NOT**

- 不得发明字段、接口、错误码、迁移、锁、Redis key、topic、secret 或环境阈值。

## SHOULD

**源：FE 02 AI 生成代码协议 · §SHOULD**

- SHOULD 把重复决策沉淀为协议、contract 或自动检查。
- SHOULD 为高风险公共变更提供迁移和回滚。

**源：BE 06 AI 生成代码协议 · §SHOULD**

- 应显式标记假设、未知项和需要升级确认的决策。

## Contract

**源：FE 02 AI 生成代码协议 · §Contract**

```text
Goal, Protocols, Facts, Assumptions, TODO_CONFIRM,
ReuseSearch, FilesToChange, FilesNotToChange,
Validation, ResidualRisk
```

**源：BE 06 AI 生成代码协议 · §Contract**

生成内容必须绑定输入来源、目标写集和验证结果。

## Checklist

**源：FE 02 AI 生成代码协议 · §Checklist**

- [ ] 已读协议和正式契约。
- [ ] 已证明新建必要性。
- [ ] 未猜测业务和接口事实。
- [ ] 修改与同步范围明确。
- [ ] 验证结果真实可复核。

**源：BE 06 AI 生成代码协议 · §Checklist**

- [ ] 已检查既有实现、镜像路径、未提交改动和任务边界。

## Examples

**源：FE 02 AI 生成代码协议 · §Examples**

### 内容示例，可删除

AI 修复报表列宽前识别列 schema 所属层级，验证相同表格类型，再修改领域 preset。

**源：BE 06 AI 生成代码协议 · §Examples**

- 缺少隔离级别事实时记录待确认项，而不是选择一个默认值。

## Anti-patterns

**源：FE 02 AI 生成代码协议 · §Anti-patterns**

未搜索组件库便新建相似组件，并顺手重构 store、API 和全局样式。

**源：BE 06 AI 生成代码协议 · §Anti-patterns**

- 用聊天记忆替代仓库、契约、测试或运行证据。

## Ownership

**源：FE 02 AI 生成代码协议 · §Ownership**

AI 仅为 Contributor；任务、代码、评审和上线分别由对应人类 Owner 负责。

**源：BE 06 AI 生成代码协议 · §Ownership**

Agent 对变更与声明负责，用户拥有超出既定范围的决策权。

## Change Policy

**源：FE 02 AI 生成代码协议 · §Change Policy**

放宽 AI 禁止规则必须由工程治理和领域 Owner 批准；新型 AI 错误应转为协议或门禁。

**源：BE 06 AI 生成代码协议 · §Change Policy**

新增高频误改模式时应追加明确禁止项和回归测试。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
