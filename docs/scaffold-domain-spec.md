# 脚手架领域规格 `pomaster.domain-spec/v1`

领域规格是脚手架的单一事实源：字段只定义一次，数据库、后端、接口、前端四层由它同源生成。需求阶段就可以写规格并校验，不要求项目已 `pomaster init`：

```bash
pomaster scaffold validate packages/cli/scaffold/examples/fleet.domain-spec.yaml
pomaster scaffold validate spec.yaml --json   # 机读信封；通过时 result.normalized 是生成器输入
```

本页对应切片 S1-1（规格、校验、归一化）与 S1-2（规格进治理）。生成命令 `scaffold plan / generate` 在后续切片提供。

## 规格进治理

项目里的领域规格放在 `.pomaster/scaffold/domain-spec.yaml`。它是生成的单一事实源，必须经 Owner 确认才约束开发：

```bash
pomaster scaffold status                                   # 治理态 + closeout 会给的阻断码
pomaster scaffold confirm --by human:<owner>               # 首次确认
pomaster scaffold confirm --change CHANGE.C0042 --by human:<owner>   # 确认后改了规格
```

* 确认记录 `.pomaster/scaffold/confirmation.json` 存归一化规格的语义摘要与文件原始字节摘要，history 只追加；journal 追加 `SCAFFOLD_SPEC_CONFIRMED`。
* 只认语义：改注释、缩进、键序、换行不算漂移；加字段、改暴露、把待定决策位定下来都是语义变化。
* 确认后语义变化，重确认只能挂一个活性 `CHANGE.*`（在册、change_object、PROPOSED 或 CURRENT），没有手改声明通道。
* 确认记录与 journal 对账：手改记录冒充确认会对不上，按未确认处理。
* closeout 阻断码：`SCAFFOLD_SPEC_INVALID`（不通过校验）、`SCAFFOLD_SPEC_NOT_CONFIRMED`（未确认或记录不可信）、`SCAFFOLD_SPEC_DRIFT`（确认后语义变化）。没有规格文件的项目不受影响。

## 两个部署面

| | `admin` 管理侧（内网 / B 端） | `public` 用户侧（外网 / C 端） |
|---|---|---|
| 缺省根路径 | `/admin/api/v1` | `/api/v1` |
| 授权 | 每个操作一个权限码 `<app>:<entity>:<op>` | 访问档：`anonymous` / `authenticated` / `owner` |
| 分页 | OFFSET，总数按实体开启（`count_total`） | KEYSET（排序键 + 主键），不返回总数 |
| 审计 | 写操作严格档 | 写操作基础档 |
| 防滥用 | 按用户限流，页长 ≤ 200 | 按 IP + 用户限流，页长 ≤ 50 |
| 缓存 | 不缓存 | 匿名公开读可缓存 |
| 运维端点 | 独立管理端口，绑内网地址 | 独立管理端口，只绑本机 |

两个面生成为两个可独立部署的后端应用，管理功能不在用户侧应用里出现；内网不等于可信，管理侧同样每个接口认证授权。完整默认档与来源见 `packages/cli/src/scaffold-surfaces.ts`。

### 项目决策位

默认档只放框架层约束。下面四件事框架不替项目选，具体问题具体分析，定了写进规格 `surfaces.<面>.decisions`；没写的在 `scaffold validate` 摘要里列为「待项目决定」：

| 决策位 | 要回答的问题 |
|---|---|
| `authentication` | 用户怎么登录（企业 SSO、短信验证码、社交登录、账号口令……）？要不要多因素？ |
| `session` | 登录态放在哪里（服务端会话 Cookie / 令牌）？超时多少？CSRF 怎么防？ |
| `credential_policy` | 自建口令还是交给身份提供方？长度、黑名单、失败锁定、更换策略？ |
| `compliance` | 按什么合规要求建设（等保级别、个人信息影响评估、实名要求……）？ |

```yaml
surfaces:
  admin:
    decisions:
      authentication: { choice: 企业 SSO（OIDC）, ref: ADR-0007 }   # ref 可选：决策依据
      compliance: { choice: 等保三级 }
```

每个决策位都挂了参考材料（`SURFACE_DECISION_SLOT_SPECS[*].references`），只供参考，不是缺省答案。

## 结构

```yaml
schema: pomaster.domain-spec/v1
app:
  key: fleet                      # 小写 kebab-case，≤ 30；Maven 模块名与权限码前缀
  name_zh: 车队管理
  java_package: com.example.fleet # 点分小写，段名不能是 Java 保留字
surfaces:                         # 至少一个；只有 admin / public
  admin: {}                       # 可选 base_path、decisions（见上节）
  public: { base_path: /api/v1 }  # 可选覆盖根路径
entities:
  - key: vehicle_model            # 小写 snake_case，≤ 40；即表名
    name_zh: 车型
    resource: vehicle-models      # 可选；缺省 kebab-case + 复数
    ownership: user               # 可选；属主实体，隐式追加 owner_id 列
    archetypes:
      data: DATA_ARCHETYPE.MASTER_DATA
      backend: ARCHETYPE.BACKEND.CRUD_RESOURCE
      page: PAGE_ARCHETYPE.MASTER_DATA   # 可选；管理侧页面
    default_sort: { field: business_code, direction: asc }   # 可选；缺省 id desc
    fields: [ ... ]
    exposure:
      admin: { operations: [...], fields: [...], count_total: true }
      public: { operations: [...], access: anonymous, fields: [...], visible_when: { field: status, in: [ENABLED] } }
```

未知键一律报错（闭世界）。系统列 `id`、`created_at`、`created_by`、`updated_at`、`updated_by`、`version`（属主实体再加 `owner_id`）由数据原型隐式提供，不能在 `fields` 里声明。

### 字段

| 键 | 说明 |
|---|---|
| `key` / `name_zh` | 必填。`key` 小写 snake_case，转成 camelCase 后不能是 Java 保留字 |
| `type` | `string` / `text` / `int` / `long` / `decimal` / `bool` / `date` / `datetime` / `enum` |
| `required` / `unique` / `searchable` | 布尔 |
| `length` | `string` 必填，1–2000；唯一字段 ≤ 768（utf8mb4 唯一索引上限） |
| `precision` / `scale` | `decimal` 必填；precision 1–65，scale 0–30 且 ≤ precision |
| `range` | `{ min, max }`，只用于 `int` / `long` / `decimal` |
| `values` | `enum` 必填：`[{ key: ENABLED, name_zh: 启用 }]`，key 大写 SCREAMING_SNAKE |
| `classification` | `public` / `internal`（缺省）/ `pii` / `sensitive_pii` |

约束只能用在适用的类型上：`unique` 不用于 `text` / `bool` / `decimal` / `enum`，`searchable` 不用于 `text` / `decimal`。写了不适用的约束会报错，不会被静默忽略。

### 字段分级

| 分级 | 用户侧 | 管理侧显示 | 存储 | 日志 | 审计 |
|---|---|---|---|---|---|
| `public` | 可暴露 | 明文 | 明文 | 可记 | 基础 |
| `internal` | 禁止 | 明文 | 明文 | 可记 | 基础 |
| `pii` | 仅 `access: owner` 给本人 | 脱敏 | 明文 | 脱敏 | 严格 |
| `sensitive_pii` | 仅 `access: owner` 给本人 | 脱敏 | 加密 | 禁止 | 严格 |

`sensitive_pii` 加密存储，所以不能 `unique` / `searchable`，不能作默认排序或可见性条件。含 `sensitive_pii` 字段时给出警告：处理敏感个人信息前要做个人信息保护影响评估并取得单独同意。

### 暴露规则

* 操作必须在后端原型的操作清单里（CRUD：`create` / `get` / `list` / `update` / `delete`），清单取自 catalog 原型卡本身。
* 管理侧 `fields` 缺省为全部业务字段；用户侧 `fields` 必须显式列出（不默认全量暴露）。
* 用户侧：`access` 必填；写操作只允许 `owner`；`owner` 要求实体 `ownership: user`；`anonymous` 只能 `get` / `list`。
* 能 `create` 的面，必填字段都要在该面的 `fields` 里。
* `visible_when` 只支持枚举字段，生成器把它写进用户侧每条查询。
* `page` 原型要求实体在管理侧暴露（用户侧 H5 页面在后续切片提供）。

### 原型

槽位与 ID 前缀对应：`data` → `DATA_ARCHETYPE.*`，`backend` → `ARCHETYPE.BACKEND.*`，`page` → `PAGE_ARCHETYPE.*`。原型不在 catalog 里会报错并提示走 New Entity；在册但还没有模板集的原型给警告（当前模板集覆盖 `DATA_ARCHETYPE.MASTER_DATA`、`ARCHETYPE.BACKEND.CRUD_RESOURCE`、`PAGE_ARCHETYPE.MASTER_DATA`）。

## 错误码

| 码 | 含义 |
|---|---|
| `SPEC_UNREADABLE` | 文件不存在或不是合法 YAML |
| `SPEC_SCHEMA_UNSUPPORTED` | `schema` 不是 `pomaster.domain-spec/v1` |
| `SPEC_SHAPE` / `SPEC_UNKNOWN_KEY` | 缺必填项、类型不对、未知键 |
| `SPEC_IDENTIFIER` | 键名不合规或是 Java 保留字 |
| `SPEC_DUPLICATE` | 实体键、字段键、资源路径或 Java 字段名重复 |
| `SPEC_RESERVED_FIELD` | 声明了系统列 |
| `SPEC_FIELD_TYPE` / `SPEC_CONSTRAINT` | 类型不在闭包内；约束缺失、越界或不适用 |
| `SPEC_ARCHETYPE_UNKNOWN` / `SPEC_ARCHETYPE_SLOT` | 原型不在 catalog；放错槽位 |
| `SPEC_SURFACE` | 未知部署面、未声明的面、根路径冲突 |
| `SPEC_OPERATION` | 操作不在后端原型清单里或重复 |
| `SPEC_EXPOSURE_FIELD` | 暴露了不存在的字段、用户侧未列字段、能新建但隐藏了必填字段 |
| `SPEC_PUBLIC_ACCESS` | 用户侧缺访问档、匿名写、非属主写、属主档缺 ownership |
| `SPEC_PUBLIC_FIELD_FORBIDDEN` | 内部字段上用户侧，或个人信息未在属主档下暴露 |
| `SPEC_VISIBILITY` | 可见性条件不是枚举字段或值不在枚举里 |
| `SPEC_ENTITY_UNEXPOSED` / `SPEC_PAGE_WITHOUT_ADMIN` | 实体没在任何面暴露；有页面原型但没在管理侧暴露 |
| `SPEC_CATALOG_UNAVAILABLE` | catalog 原型目录为空 |

警告：`SPEC_RECOMMENDED_FIELD_MISSING`（主数据缺业务码 / 名称 / 状态）、`SPEC_TEMPLATE_UNAVAILABLE`、`SPEC_PIPIA_REQUIRED`、`SPEC_SURFACE_UNUSED`。

所有问题一次报全，每条带规格内路径（如 `entities[0].fields[2].length`）和修复路标。
