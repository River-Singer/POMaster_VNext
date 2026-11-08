# 脚手架领域规格 `pomaster.domain-spec/v1`

领域规格是脚手架的单一事实源：字段只定义一次，数据库、后端、接口、前端四层由它同源生成。需求阶段就可以写规格并校验，不要求项目已 `pomaster init`：

```bash
pomaster scaffold validate packages/cli/scaffold/examples/fleet.domain-spec.yaml
pomaster scaffold validate spec.yaml --json   # 机读信封；通过时 result.normalized 是生成器输入
```

本页对应切片 S1-1（规格、校验、归一化）、S1-2（规格进治理）、S1-3（生成记账与写入约束，第一块砖是数据库层）、S1-4（一致性门禁）、S1-5（接口层：每个面一份 OpenAPI 3.1）、S1-6（后端层）与 S1-7（管理侧前端）。

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

## 生成：记账与写入约束

```bash
pomaster scaffold plan       # 只读：会新建 / 更新哪些文件、哪些变化被拒绝、哪些受管文件被手改
pomaster scaffold generate   # 只按已确认、无漂移的规格生成
```

* **只认已确认规格**：未确认 / 漂移 / 不通过一律拒绝（`SCAFFOLD_SPEC_NOT_CONFIRMED` / `SCAFFOLD_SPEC_DRIFT` / `SCAFFOLD_SPEC_INVALID`）。
* **数据库层（模板集 `mysql-flyway@1`）**：迁移写到 `backend/<app>-core/src/main/resources/db/migration/`，账号授权脚本写到 `backend/db/grants.sql`（不进 Flyway，DBA 按环境执行；口令与来源主机是占位符）。标识符一律反引号引用；敏感个人信息存密文列。
* **接口层（模板集 `openapi-3.1@1`）**：每个部署面一份文档，`api/openapi/admin.openapi.json` 与 `api/openapi/public.openapi.json`（JSON，确定性键序）。形态取自原型卡：管理侧 OFFSET（`page` / `size`，实体开 `count_total` 时带 `total`）、每个操作标权限码 `x-pomaster-permission`、响应 `Cache-Control: no-store`；用户侧 KEYSET（`after` / `limit`，不返回总数）、每个操作标访问档 `x-pomaster-access`、匿名读带 `Cache-Control` 与 `ETag`、只出现对用户侧暴露的字段。两侧错误都是 RFC 9457 `application/problem+json`（扩展成员 `code` / `trace_id` / `field_errors`），都有 429。修改带 `version` 做乐观锁（冲突 409）。DTO 属性 camelCase；decimal 用带精度 pattern 的字符串；可空字段用 3.1 的 type 数组。认证方式是项目决策位，文档不声明 `securitySchemes`。去掉某个面的全部暴露后，该面文档在下次生成时退役（未被手改时删除文件与 KEYBINDING 行）。
* **后端按技术基线选模板集（`spring-mybatis-plus@1`）**：读 `.pomaster/baseline/backend/stack.yaml`。`persistence` 是 MyBatis / MyBatis-Plus 才生成；`language`、`framework`、`database` 已定且不是 Java / Spring / MySQL，或 `persistence` 没定、是 JPA 等 → 不生成后端文件并警告 `SCAFFOLD_BACKEND_SKIPPED`（提示先 `pomaster baseline set backend persistence mybatis-plus`）。生成 Maven 多模块（Java 21、Spring Boot 4.1、MyBatis-Plus 3.5，版本随模板集锁定）：
  * `backend/pom.xml` 父工程；`<app>-core` 领域核心——实体（业务列反引号引用，修改时可空字段能清空）、Mapper（只用参数化的条件构造器，没有拼接的 SQL）、用例服务（一次写一个库事务；修改、删除带 version，不一致 409；唯一值先查再写，并发撞上唯一键同样转成字段级 409；写操作按面审计）、分页（OFFSET 多取一条判断下一页；KEYSET 游标不透明，可空排序键按 MySQL 空值顺序接续）、扩展点接口；
  * `<app>-admin-api` 管理侧应用：每个接口声明规格里的权限码，没声明的一律 403；页长 ≤ 200；响应 `no-store`；写操作严格审计（前后值，个人信息脱敏，敏感个人信息不记值）；数据范围交给项目的 `DataScopePolicy`；
  * `<app>-public-api` 用户侧应用：每个接口声明访问档，没声明的一律拒绝；可见性条件与属主过滤写进每条查询（不满足按 404）；只出现对用户侧暴露的字段；匿名读 `Cache-Control: public, max-age` 加 ETag（`If-None-Match` 命中 304），其余 `private, no-store`；
  * 两侧错误都是 `application/problem+json`，成员与接口文档的 Problem 同形（`field_errors[{detail, pointer}]`），意外异常只回 trace_id 不回内部细节；先限流（429 带 `Retry-After`）再鉴权；管理端点独立端口（管理侧绑内网地址、用户侧只绑本机）；
  * 字段分级落到代码：个人信息管理侧脱敏回显（修改时提交脱敏值视为没改）；敏感个人信息 AES-256-GCM 加密存储（与密文列同一格式），密钥从 `pomaster.field-encryption.key` 注入，没配启动即失败。日期、数字型个人信息管理侧不脱敏（保持类型），日志与审计照样按分级处理；
  * 应用账号只有 `grants.sql` 授的数据权限，应用不跑迁移；迁移用迁移账号 `mvn -pl <app>-core flyway:migrate`。表级授权要在迁移建表之后执行。
* **项目自有模块是种子**：`<app>-support`（pom、扩展点说明、两份配置覆盖文件 `support-admin.yml` / `support-public.yml`）只在目标位置没有文件时写一次，不进生成清单、不登记 KEYBINDING，之后归项目所有——认证（`ActorProvider`，没有实现时需要登录的接口一律 401）、数据范围、共享限流、审计落点在这里实现，项目选的依赖加在这里。被删了下次生成会补回。
* **管理侧前端按技术基线选模板集**：读 `.pomaster/baseline/frontend/stack.yaml` 的 `framework`（与 `ui`）。Vue → `vue-antd-admin@1`；React → `react-geist-admin@1`；`ui` 已选但不配套（如 React + Ant Design）、别的框架、或技术栈还没定 → 不生成前端文件并警告 `SCAFFOLD_FRONTEND_SKIPPED`（提示先 `pomaster baseline set frontend framework …`）。框架不替项目选技术栈。生成清单只记这次用到的模板集；技术栈从 Vue 改成 React 后再生成，Vue 文件退役、React 文件新建，迁移与接口文档不动。
* **Vue 3 + ant-design-vue（`vue-antd-admin@1`）**：写到 `frontend/admin/src/`。每个管理侧实体一份接口客户端（`api/<实体>.ts`，类型与管理侧 OpenAPI 同源，decimal 是字符串）、列表页（`views/<实体>/<类名>List.vue`：可检索的字符串与枚举字段进查询区，表格数字右对齐、操作列在最右，筛选、页码与每页条数进 URL，切换时取消上一次请求，删除走气泡确认并带 version）、编辑抽屉（`<类名>Form.vue`：有新建或修改时生成，宽 378，校验规则取必填 / 长度 / 范围，带 version 提交，409 提示刷新）、路由（`router/<实体>.ts`：按需加载，meta 声明登录与权限码，权限码与接口文档的 `x-pomaster-permission` 同源）与 zh-CN 文案（`locales/zh-CN/<实体>.ts`）。公共文件：请求封装 `api/http.ts`（会话走 HttpOnly Cookie，不碰浏览器存储；失败归一成 RFC 9457 problem）、格式化注册表 `utils/format.ts`、权限判断 `auth/permission.ts`，以及文案与路由的汇总入口。生成物照设计规范写——界面文字只在文案字典、日期数字只经格式化注册表、组件不直接发请求——项目采用 Ant Design 规范后 `pomaster design check` 零违规。用户侧（Vant）前端在后续切片。
* **React + shadcn/ui（`react-geist-admin@1`）**：同样写到 `frontend/admin/src/`，按 React 栈的前端架构分目录（规范 ARCH.*）。`api/<实体>.ts` 是接口客户端加 TanStack Query 的查询与变更 hooks（翻页保留上一页数据，写后按 key 失效）；`routes/<实体>/list.tsx` 是列表页（筛选、页码、每页条数进地址栏，枚举筛选只认规格里的取值，删除走气泡确认并带 version）；`features/<实体>/<类名>EditDialog.tsx` 是编辑对话框（react-hook-form + zod，规则取必填 / 长度 / 范围 / decimal 精度，带 version 提交，409 提示刷新，接口回的字段错误按 `field_errors` 的 pointer 挂回字段），`features/<实体>/index.ts` 是模块公开入口；`routes/<实体>/route.ts` 与 `routes/scaffold.ts` 是与路由库无关的路由描述（懒加载 + `handle` 声明登录、权限码、标题、布局），按基线选定的路由库接入。公共文件：请求封装 `api/http.ts`（与 Vue 模板同一份）、`lib/format.ts`、`lib/permission.ts`、`lib/i18n.ts`（文案取值）、`lib/url-state.ts`（地址栏搜索参数）与文案、路由汇总。组件从项目的 `components/ui` 引入（shadcn/ui 源码进项目），依赖 @tanstack/react-query、react-hook-form、zod、@hookform/resolvers、sonner、lucide-react。项目采用 Geist 规范后 `pomaster design check` 零违规。
* **迁移只追加**：生成过的迁移永不重写（Flyway 校验和）。规格变化时按「上次生成时的规格快照 → 现规格」求差，追加新迁移；版本号从盘上已有迁移（含手工迁移）的最大值往上加。只自动生成加法变化（新实体、新可空字段、加长、放宽必填、decimal 只加整数位、加唯一 / 检索索引、枚举加值、用户侧列表索引重建）。删实体、删字段、改类型、收窄、新增必填字段、去唯一、枚举去值、属主增删等需要数据迁移的变化拒绝（`SCAFFOLD_MIGRATION_NOT_ADDITIVE`），逐条列出。
* **生成清单** `.pomaster/scaffold/generation-manifest.json`：每个受管文件的路径、sha256、模板、覆盖实体、是否不可变、对应 KEYBINDING 与治理 id；上次生成的规格快照；模板集版本；history 只追加。journal 追加 `SCAFFOLD_GENERATED`。已最新 → `NO_CHANGE` 零写入。
* **不覆盖手改**：受管文件被手改或删除、或目标位置已有内容不同的不受管文件 → 拒绝生成且零写入（`SCAFFOLD_GENERATED_FILE_MODIFIED`）。内容相同的同名文件直接纳管（中断后恢复）。
* **写入约束**：每个受管文件登记一行 KEYBINDING（`.pomaster/truth/keybindings/`，`capability_to_file` → `CAPABILITY.SCAFFOLD.<APP>.ENTITY.<ENTITY>` 或 `CAPABILITY.SCAFFOLD.<APP>.DATABASE`）。活跃执行期内，exec-guard hook 把对这些文件的 Edit / Write 交给 `pomaster exec-guard` 判卷，业务任务的 permit 不含这些 id 就 DENY，并指路「改规格 → `scaffold confirm --change` → `scaffold generate`」。执行期外的手改由 `execution audit` 与一致性门禁检出。

## 一致性门禁

```bash
pomaster scaffold check          # 只读；不一致 exit 1
pomaster check --gates           # 其中 GATE.SCAFFOLD.CONSISTENCY 同一判卷，结果作为 GRN 入账
```

六项检查，`scaffold check`、closeout、`check --gates` 三处用同一个判卷：

| 检查 | 失败码 | 说明 |
|---|---|---|
| 规格治理 | `SCAFFOLD_SPEC_INVALID` / `SCAFFOLD_SPEC_NOT_CONFIRMED` / `SCAFFOLD_SPEC_DRIFT` | 规格要通过校验、经确认、确认后无语义漂移 |
| 清单 ↔ 文件 | `SCAFFOLD_GENERATED_FILE_MODIFIED` / `SCAFFOLD_MANIFEST_MALFORMED` / `SCAFFOLD_TEMPLATE_SET_CHANGED` | 受管文件现盘 sha256 与清单一致，没被手改或删除 |
| 生成新鲜度 | `SCAFFOLD_GENERATION_STALE` | 规格改了、确认了，就要重新生成（与已确认摘要比；现盘漂移由规格治理那一项报，不重复） |
| KEYBINDING 在册 | `SCAFFOLD_KEYBINDING_MISSING` | 每个受管文件都有绑定行且锚对得上——写入约束的前提；`scaffold generate` 会补回 |
| 接口 ↔ 规格 | `SCAFFOLD_CONTRACT_DRIFT` | 不依赖生成器自证，从规格独立推出约束逐条对照：接口文档与规格暴露的操作一一对应、用户侧不出现未暴露的字段、每个操作都标了授权结构；缺某个面的文档也算。生成了后端时，每个控制器的接口数、权限码 / 访问档与规格对照，用户侧控制器的可见性条件与属主过滤在场，用户侧视图不出现未暴露字段，整个用户侧应用（含手加的文件）里不出现管理侧的权限码注解 |
| 手工迁移 | （警告 `SCAFFOLD_UNMANAGED_MIGRATION`） | 迁移目录里不在清单的迁移逐个列出，不阻断 |

规格缺席 = 项目没用脚手架，门不适用（`check --gates` 记 `not_configured`，closeout 不阻断）。规格已确认但从未生成只警告（`SCAFFOLD_NOT_GENERATED`）。closeout 对上表的失败码阻断。

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
