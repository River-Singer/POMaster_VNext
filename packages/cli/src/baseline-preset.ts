/**
 * baseline-preset.ts —— baseline 栈预置引擎（09-06-gallery-and-baseline-presets
 * Step 1；Owner 2026-09-06 四裁 G-B/G-C/G-D，执行不得翻案）：
 * init 在问卷栈选型完成后（步骤 4.9，播种与 applyStackAnswers 之后）按选型为
 * baseline 播种 md 生成「预置草案」节（PRESET-DRAFT），Owner 读草案→可改→
 * `pomaster baseline confirm` 时 digest 快照烙印整文件。
 *
 * 裁定落位（不得翻案，自由度内决策见 ADR）：
 * - G-B 预设 = 预置草案 + confirm 烙印：草案是**可见草案非静默预填**——显式词形
 *   节头（PRESET-DRAFT）+ 节头「非权威」声明；既有「起步值:UNKNOWN」节与填写指引
 *   零改动（草案为纯加法，append-only）；confirm 语义（R-L）零改动——草案在座的
 *   architecture.md 被 confirm 整文件快照，确认后改动即 BASELINE_DRIFT（既有检出）。
 * - G-C 预置范围全部拉平：22 份 baseline md 全覆盖（G-C 分母 = 播种 md 全集：
 *   frontend 6 + backend 7 + data 5 + platform 4；零半预置状态）。
 * - G-D 业务不预设：业务实体/业务接口/业务数据模型零预置——data/* 五文件的草案
 *   只盖规范/骨架面并带「业务边界注记（G-D）」小节；负面词形（建表/接口定义模板）
 *   由测试钉死（baseline-preset.spec）。
 *
 * ADR（自由度内决策逐项留痕）：
 *
 * - ADR-1 门粒度 = lane 全销账：face 声明归属 lane（frontend 6 面 ← FE 9 键；
 *   backend 7 面 + data 5 面 + platform 4 面 ← BE 5 键——data/platform 的内容源
 *   是后端主题文档集）。lane 键全 resolved 才生成该 lane 覆盖面；部分销账（如
 *   baseline set 逐键补齐中途）整 lane 保持纯 UNKNOWN 骨架（缺席诚实，不生成
 *   半截草案）。全 14 键销账 ⇔ 22 面全覆盖（G-C）。
 * - ADR-2 draft-once + 在座零触碰（沿 seed-once 纪律）：文件含 PRESET-DRAFT 词形
 *   即跳过（Owner 可能已改草案——项目可编辑物，禁覆盖重写）；确认态在座
 *   （manifest confirmed 记录可解析，confirmed/drifted 任一态）整体跳过——确认后
 *   再生成草案 = init 自造 BASELINE_DRIFT，结构性禁断。ADR-13 失效（set --change
 *   移除确认记录）后，缺席草案的 face 可随下次 init 重生成。
 * - ADR-3 内容 = 锚定编排非发明：每条草案逐条标注来源（已播种主题文档/overlay
 *   资产的节词形，.pomaster 盘面路径词形）；来源真实性由测试全量核验
 *   （路径→包内种子文件、节标题逐条在座——强于验收条的「抽 ≥6 份」）。草案文本
 *   是来源规则行的栈化转述，零阈值数字、零墙钟（A4）、零业务词形（G-D）。
 * - ADR-4 栈条件闭包：overlay 条目仅在对应栈键选型命中时纳入（词形边界匹配：
 *   小写化 + 字母数字边界——"spring" 命中 "Spring Boot"/"spring-boot" 不命中
 *   "javascript"；"vue3" 不命中 "vue3x" 以外词形）。overlay 资产缺席的栈
 *   （react/python/php/oracle/sqlserver…）只有主题文档条目——缺席诚实，不发明
 *   overlay 内容。tomcat/nginx/kubernetes-ingress/messaging/spring-webflux/
 *   spring-batch 六 overlay 无对应问卷键，不入条件表（java overlay 明令「不得由
 *   Java 选择推断 Nginx/Tomcat」——推断即违锚）。
 * - ADR-5 生成时机 = init 步骤 4.9（播种与问卷落盘之后、入口渲染之前）：草案是
 *   init 运行时生成物，**不进 seeds/manifest 分母**——播种件字节/清单 pin/分母
 *   计数零变化；幂等铁律不破（草案在座重跑全跳过 = NO_CHANGE）。
 * - ADR-6 报告面：InitResult.presetDraft = { generated, skipped_existing,
 *   skipped_confirmed }（新增字段恒在座，既有字段零改动）；files 报告复用既有
 *   action="updated"（追加草案 = 内容变更，零新动作词形）；人读恒一行（版式锚
 *   baseline 行之后）。
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import type { BaselineLane } from "./baseline.js";
import {
  BASELINE_LANES,
  STACK_KEYS,
  isStackValueResolved,
  loadLaneStackValues,
  readBaselineConfirmationPresentation,
} from "./baseline.js";
import type { InitFileReport } from "./init.js";

// ============================================================
// 词形（草案节头/标记——单一词形源，测试与运行时共用）
// ============================================================

/** 草案在座标记词形（draft-once 判据；init 生成物——seeds 分母零涉）。 */
export const PRESET_DRAFT_MARKER = "PRESET-DRAFT";

/** 草案节头（显式词形——G-B：可见草案，非静默预填）。 */
export const PRESET_DRAFT_HEADING =
  "## 预置草案（PRESET-DRAFT — Owner 确认后成为基线）";

/** 草案节头「非权威」声明（G-B/宪法 §7.1 NON-AUTHORITATIVE——确认前不作判卷基线）。 */
export const PRESET_DRAFT_PREAMBLE =
  "> 预置草案非权威——Owner 确认前不作为判卷基线（NON-AUTHORITATIVE）。" +
  "本节由 pomaster init 依栈选型生成，内容为已播种主题文档与 overlay 资产规则行的栈化编排" +
  "（逐条标注来源，非发明新规范）；Owner 可就地修改；`pomaster baseline confirm` 时本文件" +
  "整体 digest 快照烙印为基线。未列入草案的节保持起步值 UNKNOWN（缺席诚实——预置只覆盖有锚定源的面）。";

/** G-D 业务边界注记小节头（仅 data/* 五面在座——业务实体/接口/数据模型零预置）。 */
export const PRESET_DRAFT_BUSINESS_NOTE_HEADING = "### 业务边界注记（G-D：业务不预设）";

// ============================================================
// 内容源映射表（22 face × 逐条来源；ADR-3 锚定编排）
// ============================================================

/** 主题文档与 overlay 的 .pomaster 盘面路径词形前缀（来源引用与测试核验共用）。 */
const THEMES_DIR = ".pomaster/specs/hard/themes";
const STACKS_DIR = ".pomaster/specs/hard/stacks";

function theme(name: string): string {
  return `${THEMES_DIR}/${name}.md`;
}

function overlay(slug: string, file: string): string {
  return `${STACKS_DIR}/${slug}/${file}.md`;
}

/** 主题文档词形（themes/<name> → 盘面路径）。 */
const T = {
  arch: "architecture-and-module-boundaries",
  api: "api-contract-and-error-semantics",
  dataTx: "data-and-transactions",
  ui: "ui-presentation-and-design",
  state: "frontend-state-and-client-data",
  value: "value-semantics-and-domain-data",
  page: "page-composition-and-browser-environment",
  test: "testing-and-verification",
  obs: "observability-and-analytics",
  sec: "security",
  env: "environment-and-configuration",
  release: "release-and-feature-flags",
  privacy: "privacy-and-data-lifecycle",
  perm: "permission-and-authorization",
  toolchain: "engineering-toolchain-and-dependencies",
  integration: "integration-and-async-runtime",
} as const;

/** overlay 资产词形（slug → 盘面文件名；文件名 = 包内 seeds 实物逐字）。 */
const O = {
  vue3: overlay("vue3", "vue3-framework-overlay"),
  antdesign: overlay("antdesign", "antdesign-ui-overlay"),
  geist: overlay("geist", "geist-design-system-overlay"),
  css: overlay("css", "css-system-overlay"),
  java: overlay("java", "java-language-overlay"),
  springBoot: overlay("spring-boot", "spring-boot-application-overlay"),
  springMvc: overlay("spring-mvc", "spring-mvc-web-overlay"),
  mybatis: overlay("mybatis", "mybatis-persistence-overlay"),
  jpa: overlay("jpa", "jpa-persistence-overlay"),
  mysql: overlay("mysql", "mysql-database-overlay"),
  postgresql: overlay("postgresql", "postgresql-database-overlay"),
  redis: overlay("redis", "redis-cache-overlay"),
} as const;

/** 单条来源引用（ADR-3：路径 + 节词形 + 可选细锚；测试逐条核验标题在座）。 */
export interface PresetSourceRef {
  /** .pomaster 盘面词形（主题文档或 overlay 资产）。 */
  readonly path: string;
  /** H2 节词形（如 MUST / Contract / Rules / 语言与栈节（overlay 资产同步区））。 */
  readonly section: string;
  /** 可选 H3+ 细锚（如「错误结构」；主题文档 Contract 内小节）。 */
  readonly sub?: string;
}

/** 单条草案条目（ADR-3：锚定规则行的栈化转述 + 逐条来源；零发明）。 */
export interface PresetDraftEntry {
  /** 草案针对的既有基线节（## 词形逐字——测试核验节在座）。 */
  readonly section: string;
  /** 草案文本（栈化转述；零阈值数字、零墙钟、零业务词形）。 */
  readonly text: string;
  readonly sources: readonly PresetSourceRef[];
  /**
   * 栈条件（可选，ADR-4）：lane 内栈键选型命中任一词形（字母数字边界匹配）才
   * 纳入本条——overlay 资产条目的承载面；缺席 = 无条件条目（主题文档锚）。
   */
  readonly when?: { readonly key: string; readonly words: readonly string[] };
}

/** 单个覆盖面：一份 baseline 播种 md 的草案规格（G-C 分母成员）。 */
export interface PresetFaceSpec {
  /** 目标文件（rootDir 相对 POSIX 词形；= 播种目标词形）。 */
  readonly file: string;
  /** 门 lane（ADR-1）：该 lane 栈键全销账才生成。 */
  readonly lane: BaselineLane;
  readonly entries: readonly PresetDraftEntry[];
  /**
   * G-D 业务边界注记文本（可选）：在座 = 本文件草案附「业务边界注记（G-D）」
   * 小节，声明业务面不预置（G-D 负面控制的自述面）。
   */
  readonly businessNote?: string;
}

function src(path: string, section: string, sub?: string): PresetSourceRef {
  return sub === undefined ? { path, section } : { path, section, sub };
}

// —— 主题文档路径快捷（含 .md 后缀的完整词形）——
const ARCH = theme(T.arch);
const API = theme(T.api);
const DATA = theme(T.dataTx);
const UI = theme(T.ui);
const STATE = theme(T.state);
const VALUE = theme(T.value);
const PAGE = theme(T.page);
const TEST = theme(T.test);
const OBS = theme(T.obs);
const SEC = theme(T.sec);
const ENV = theme(T.env);
const RELEASE = theme(T.release);
const PRIVACY = theme(T.privacy);
const PERM = theme(T.perm);
const TOOLCHAIN = theme(T.toolchain);
const INTEGRATION = theme(T.integration);

/**
 * 内容源映射全表（G-C 分母 = 22 face；lane 分组内按播种文件序）。
 * 逐条草案的来源映射是本步交付物（任务 research/ 映射表与本表同源——本表是
 * 机器判卷面，research 表是人读镜像）。
 */
export const PRESET_FACE_SPECS: readonly PresetFaceSpec[] = [
  // ============ frontend（门 = FE 9 键全销账）============
  {
    file: ".pomaster/baseline/frontend/architecture.md",
    lane: "frontend",
    entries: [
      {
        section: "Purpose",
        text: "架构面以模块边界为骨架：顶层目录职责、依赖方向、公开入口、shared 下沉与跨模块协作是基线必须显式登记的边界事实。",
        sources: [src(ARCH, "Scope")],
      },
      {
        section: "Layers",
        text: "模块 = 有明确职责、Owner 和公开入口的代码边界；跨模块流程进入明确的 orchestration/feature 层。",
        sources: [src(ARCH, "Terms"), src(ARCH, "MUST")],
      },
      {
        section: "Responsibility",
        text: "每个模块维护 contract、owner 和 index/public exports；依赖方向和禁止方向必须可检查。",
        sources: [src(ARCH, "SHOULD"), src(ARCH, "MUST")],
      },
      {
        section: "Dependencies",
        text: "模块外部只能通过 Public API 引用；循环依赖必须被工具检测并阻止；shared 下沉必须证明稳定复用和低业务耦合。",
        sources: [src(ARCH, "MUST")],
      },
      {
        section: "Layers",
        text: "vue3 选型：组件模型、SFC 与响应式写法以官方文档与风格指南优先级（A/B/C 三档）为基准；版本位（vue/pinia/vue-router/vue-tsc）经实抓核实并记录在项目技术基线。",
        sources: [src(O.vue3, "Rules")],
        when: { key: "framework", words: ["vue3"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/frontend/directory-structure.md",
    lane: "frontend",
    entries: [
      {
        section: "目标目录模板",
        text: "顶层目录和模块职责必须文档化；新目录和模块必须有单一职责、公开入口和明确依赖方向；禁止新建无职责说明的顶层目录。",
        sources: [src(ARCH, "MUST"), src(ARCH, "MUST NOT")],
      },
      {
        section: "职责说明",
        text: "新文件归属可解释；跨域逻辑不塞入共享工具；模块契约词形（Module, Responsibility, Owner, PublicExports, AllowedDependencies, ForbiddenDependencies）作为目录职责的登记骨架。",
        sources: [src(ARCH, "Checklist"), src(ARCH, "MUST NOT"), src(ARCH, "Contract")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/frontend/design-system.md",
    lane: "frontend",
    entries: [
      {
        section: "token strategy",
        text: "定义颜色、字体、间距、圆角、阴影、层级、断点、状态和动效 token；UI 只能从 token 和批准组件取得视觉规则；用语义 token 分离品牌值与组件用途。",
        sources: [src(UI, "MUST"), src(UI, "SHOULD")],
      },
      {
        section: "component source",
        text: "新建前搜索现有组件并记录不能复用的原因；Public Component 有类型化 Props、Events、Slots、状态、文档、测试和公开入口；状态至少考虑 loading、empty、error、disabled、readonly 和 focus。",
        sources: [src(UI, "MUST")],
      },
      {
        section: "reuse rules",
        text: "第二个消费者出现时重新评估组件层级；token 改名/删除先 deprecated 并评估所有组件；公共 API 变化遵循影响评估、兼容、deprecated、迁移和删除周期。",
        sources: [src(UI, "MUST"), src(UI, "Change Policy")],
      },
      {
        section: "token strategy",
        text: "antdesign 选型：主题定制主通路为 v4 CSS-in-JS（ConfigProvider 的 theme prop：Design Token 三层派生 Seed→Map→Alias、default/dark/compact 三算法、组件级 Component Token），运行时消费用 useToken；组件库主题 token 不替代项目 design token 分层协议。",
        sources: [src(O.antdesign, "Rules")],
        when: { key: "ui", words: ["antdesign", "ant-design"] },
      },
      {
        section: "token strategy",
        text: "geist 参照：foundations 词形（colors/typography/materials）以实抓现状为准（现状无 spacing foundation——缺席诚实记录）；geist 为设计体系参照而非实现依赖，不绑定框架、UI 组件库或 CSS 方案选型。",
        sources: [src(O.geist, "Rules")],
        when: { key: "ui", words: ["geist"] },
      },
      {
        section: "token strategy",
        text: "css 组合词形选型：scoped 作用域以 SFC style scoped 为主机制，穿透与例外用官方逃逸词形 :deep()/:slotted()/:global()；antdv 主题 token 消费走 v4 CSS-in-JS 官方通路；全局重置以官方单一来源 reset.css 承载，不引入第二套竞争重置。",
        sources: [src(O.css, "Rules")],
        when: { key: "css", words: ["scoped-sfc"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/frontend/state-and-data.md",
    lane: "frontend",
    entries: [
      {
        section: "state ownership",
        text: "每个状态声明 owner、更新者、存储位置、生命周期和清理策略；可分享和可恢复状态进入 URL；全局 store 只保存稳定跨页面状态；组件状态不入全局 store。",
        sources: [src(STATE, "MUST"), src(STATE, "MUST NOT")],
      },
      {
        section: "server-state",
        text: "server state 由查询缓存层管理，不复制到全局 store 手动同步；已取消请求、旧订阅或旧身份上下文的迟到结果不得写入当前状态。",
        sources: [src(STATE, "MUST"), src(STATE, "MUST NOT")],
      },
      {
        section: "cache",
        text: "每个缓存声明 key、参数、身份/权限隔离、stale、保留和失效规则；Query Key 包含所有影响结果的筛选和上下文；写操作定义依赖失效矩阵。",
        sources: [src(STATE, "MUST")],
      },
      {
        section: "derived",
        text: "模型分层走 DTO→Adapter→Domain Model→View/Form/Row Model 链路；空值、未知枚举、日期、金额和单位在边界统一处理；外部数据必须在信任边界执行 schema 校验后再转换。",
        sources: [src(VALUE, "MUST"), src(VALUE, "Contract")],
      },
      {
        section: "state ownership",
        text: "pinia 选型：Vue 栈状态管理选官方 Pinia（Vuex 已是维护模式），不自造替代；状态库与 server cache 分工——server state 走查询缓存层。",
        sources: [src(O.vue3, "Rules"), src(STATE, "MUST")],
        when: { key: "state", words: ["pinia"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/frontend/api-and-error.md",
    lane: "frontend",
    entries: [
      {
        section: "client hierarchy",
        text: "页面只调用封装的 Domain API；HTTP Client 统一处理 base URL、认证、超时、取消、trace 和 envelope；不在页面直接写 fetch/axios 或拼 endpoint。",
        sources: [src(API, "MUST"), src(API, "MUST NOT")],
      },
      {
        section: "error taxonomy",
        text: "将原始错误归一化为稳定 code、trace、fieldErrors、retryable 和 recoverAction；认证、权限、资源、冲突、校验、限流、服务、网络错误分别处理；传输成功与业务成功分别判断。",
        sources: [src(API, "MUST"), src(API, "Contract", "错误结构")],
      },
      {
        section: "retry",
        text: "重试必须服从幂等性、服务端 Retry-After 或受控退避，并能取消；不对非幂等 mutation 默认自动重试；取消或已被替代的请求不得提示为用户错误。",
        sources: [src(API, "MUST"), src(API, "MUST NOT")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/frontend/quality.md",
    lane: "frontend",
    entries: [
      {
        section: "coverage budget",
        text: "公共函数/组件、复杂表单、关键流程、权限和错误态必须测试；页面覆盖 loading、empty、error、permission、normal 和大数据；测试稳定、可重复并断言用户可观察行为（覆盖率阈值由 Owner 决策）。",
        sources: [src(TEST, "MUST")],
      },
      {
        section: "browser matrix",
        text: "明确浏览器及最低版本、操作系统、设备和输入方式；关键流程在所有支持组合验证；不支持环境提供可操作说明或安全降级；用能力检测而非脆弱 user-agent 业务判断。",
        sources: [src(PAGE, "MUST")],
      },
      {
        section: "a11y",
        text: "默认目标 WCAG 2.2 AA；所有交互元素键盘可达；语义化 HTML 与唯一 main 地标；焦点可见且不被遮挡；未满足项记录适用成功准则、影响、替代路径、Owner 和修复期限。",
        sources: [src(UI, "MUST")],
      },
    ],
  },
  // ============ backend（门 = BE 5 键全销账）============
  {
    file: ".pomaster/baseline/backend/architecture.md",
    lane: "backend",
    entries: [
      {
        section: "System",
        text: "架构选择必须记录候选、取舍、风险、ADR 坐标和复审条件；改变已采用架构必须新增或替代 ADR，不静默改写历史结论。",
        sources: [src(ARCH, "MUST"), src(ARCH, "Change Policy")],
      },
      {
        section: "Layer",
        text: "分层职责：Controller 校验传输格式，应用服务编排用例，领域对象维护不变量，Repository 提供明确持久化语义；业务不变量、事务编排和外部适配位于可解释且可测试的边界。",
        sources: [src(ARCH, "MUST"), src(ARCH, "Examples"), src(ARCH, "Ownership")],
      },
      {
        section: "Module",
        text: "新目录和模块必须有单一职责、公开入口和明确依赖方向；结构变更必须给出目标路径、所有者、入口、消费者和迁移计划。",
        sources: [src(ARCH, "MUST"), src(ARCH, "Contract")],
      },
      {
        section: "Boundary",
        text: "依赖只指向声明的公开入口；越界 = 绕过公开入口依赖其他模块内部实现；权威业务规则不散落在 Controller、ORM Entity 或基础设施适配器中。",
        sources: [src(ARCH, "Terms"), src(ARCH, "MUST NOT")],
      },
      {
        section: "Layer",
        text: "java 选型：必须固定并记录 JDK、编译目标、构建工具和依赖解析来源；语言升级必须验证字节码、运行时、测试与部署环境兼容性。",
        sources: [src(O.java, "Rules")],
        when: { key: "language", words: ["java"] },
      },
      {
        section: "Layer",
        text: "spring 选型：必须记录 Boot 版本、配置来源、自动配置例外和启动验证；配置项和 actuator 暴露必须遵守安全与环境配置协议。",
        sources: [src(O.springBoot, "Rules")],
        when: { key: "framework", words: ["spring"] },
      },
      {
        section: "Boundary",
        text: "spring-mvc 边界：Controller 必须保持传输层职责，业务规则进入明确的应用或领域边界；阻塞调用、上传下载和异步请求必须声明超时、资源与安全约束。",
        sources: [src(O.springMvc, "Rules")],
        when: { key: "framework", words: ["spring"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/directory-structure.md",
    lane: "backend",
    entries: [
      {
        section: "项目后端目录模板",
        text: "后端目录分区、模块入口和结构检查按项目结构治理：新目录和模块有单一职责、公开入口和明确依赖方向；沿用仓库已验证的结构模式并在新增结构前搜索现有实现；不强制所有语言采用同一目录树。",
        sources: [src(ARCH, "Scope"), src(ARCH, "MUST"), src(ARCH, "SHOULD")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/api-contract.md",
    lane: "backend",
    entries: [
      {
        section: "REST style",
        text: "每个 endpoint 定义 URL、Method、参数位置、类型、响应、错误、权限和 owner；分页、筛选、排序、空值、枚举、单位和时间语义必须明确；写操作定义幂等、并发版本和缓存影响。",
        sources: [src(API, "MUST"), src(API, "Contract", "URL 与 Method")],
      },
      {
        section: "error envelope",
        text: "失败必须映射到稳定 code、适当状态、可选字段错误、retryable 与 TraceId；错误信封字段集（httpStatus/code/safeMessage/traceId/fieldErrors/retryable 等）固定；业务 code 稳定且可枚举，message 仅用于展示或诊断、不驱动逻辑。",
        sources: [src(API, "MUST"), src(API, "Contract", "错误结构")],
      },
      {
        section: "auth",
        text: "必须定义 access/refresh token 生命周期、传输位置、刷新、撤销、退出与 CSRF 策略；Token 不得出现在 URL、日志、埋点或业务组件。",
        sources: [src(API, "Contract", "认证与 Token")],
      },
      {
        section: "versioning",
        text: "新增可选字段通常向后兼容；删除、改名、类型、枚举或语义变化属破坏性变更——提供新版本、调用方清单、迁移期、弃用日期和回滚；生成类型、Adapter、Mock 和测试必须随契约同步。",
        sources: [src(API, "Contract", "版本兼容")],
      },
      {
        section: "REST style",
        text: "spring-mvc 选型：API、错误码、权限和测试证据与实现一致；Servlet 请求链、Controller、参数绑定、异常映射和线程模型按 overlay 边界具体化。",
        sources: [src(O.springMvc, "Rules"), src(O.springMvc, "Checklist")],
        when: { key: "framework", words: ["spring"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/data-access.md",
    lane: "backend",
    entries: [
      {
        section: "Repository",
        text: "数据访问的组织形态：应用服务拥有事务编排，Repository 提供明确持久化语义。",
        sources: [src(DATA, "Ownership")],
      },
      {
        section: "SQL",
        text: "SQL 必须参数化，并以真实查询形态验证结果、边界和执行计划；不用字符串拼接构造不可信 SQL 或无界读取大结果集。",
        sources: [src(DATA, "MUST"), src(DATA, "MUST NOT")],
      },
      {
        section: "N+1",
        text: "空结果、重复排序键、深分页、N+1 与慢查询在查询验收时逐项检查。",
        sources: [src(DATA, "Checklist")],
      },
      {
        section: "index",
        text: "索引服务于已知查询，并记录写放大与存储取舍；仅凭列名添加索引而不检查选择性和实际执行计划为反模式。",
        sources: [src(DATA, "SHOULD"), src(DATA, "Anti-patterns")],
      },
      {
        section: "pagination",
        text: "关键查询必须记录输入、排序稳定性、分页语义、索引和验证数据规模；游标分页包含稳定唯一排序键并验证并发写入下的行为。",
        sources: [src(DATA, "Contract"), src(DATA, "Examples")],
      },
      {
        section: "SQL",
        text: "mybatis 选型：SQL 必须参数化并绑定可复核的 Mapper 与测试坐标；动态条件、分页、批处理和结果映射必须覆盖空值与类型边界。",
        sources: [src(O.mybatis, "Rules")],
        when: { key: "persistence", words: ["mybatis"] },
      },
      {
        section: "N+1",
        text: "jpa/hibernate 选型：必须验证关联加载、N+1、脏检查、批处理和事务边界；Entity 不得直接替代 API DTO 或领域契约。",
        sources: [src(O.jpa, "Rules")],
        when: { key: "persistence", words: ["jpa", "hibernate"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/transaction-concurrency.md",
    lane: "backend",
    entries: [
      {
        section: "TX boundary",
        text: "写流程必须明确事务入口、隔离、传播、失败、重试和提交后动作；不在长事务中执行无界网络调用、用户等待或不可控批处理；缩短锁持有时间并将外部副作用设计为可重试或可补偿。",
        sources: [src(DATA, "MUST"), src(DATA, "MUST NOT"), src(DATA, "SHOULD")],
      },
      {
        section: "lock",
        text: "并发写必须明确竞争对象、原子条件、冲突结果、重试与最终一致性；锁设计必须记录粒度、顺序、超时、续租、释放、失败和可观测性；进程内锁不用于跨实例互斥。",
        sources: [src(DATA, "MUST"), src(DATA, "Contract"), src(DATA, "MUST NOT")],
      },
      {
        section: "optimistic",
        text: "优先使用数据库约束或带版本条件的原子更新保护不变量；以版本号条件更新并将零行更新映射为稳定冲突错误。",
        sources: [src(DATA, "SHOULD"), src(DATA, "Examples")],
      },
      {
        section: "idempotency",
        text: "可重试写操作必须定义 key 范围、请求指纹、保留期、并发和响应重放；相同 key 不同 payload 返回稳定冲突而非重复执行；不仅依赖客户端防抖、按钮禁用或短时进程内缓存。",
        sources: [src(DATA, "MUST"), src(DATA, "SHOULD"), src(DATA, "MUST NOT")],
      },
      {
        section: "lock",
        text: "mysql 选型：隔离级别、锁行为和执行计划必须以实际版本证据为准；与其他数据库并存时声明数据源与数据所有权。",
        sources: [src(O.mysql, "Rules")],
        when: { key: "database", words: ["mysql"] },
      },
      {
        section: "lock",
        text: "postgresql 选型：锁、隔离、执行计划和 vacuum 相关判断必须绑定实际版本证据；与其他数据库并存时声明数据源与数据所有权。",
        sources: [src(O.postgresql, "Rules")],
        when: { key: "database", words: ["postgresql", "postgres"] },
      },
      {
        section: "lock",
        text: "redis 选型：key namespace、租户范围、序列化版本和 TTL 必须显式定义；Redis 不得成为未声明的数据权威来源；分布式锁、缓存失效和降级必须有失败语义与测试证据。",
        sources: [src(O.redis, "Rules")],
        when: { key: "cache", words: ["redis"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/integration-runtime.md",
    lane: "backend",
    entries: [
      {
        section: "external integration",
        text: "每个外部调用必须定义超时、重试条件、幂等、失败映射和恢复路径；不无限重试、不重试非幂等操作、不在事务内执行无界调用；集成契约必须记录版本、认证、请求响应、错误、限额、追踪与所有者。",
        sources: [src(INTEGRATION, "MUST"), src(INTEGRATION, "MUST NOT"), src(INTEGRATION, "Contract")],
      },
      {
        section: "resilience",
        text: "采用隔离、熔断、限流、降级与对账控制故障扩散；任务必须定义身份、状态、幂等、重试、取消、超时和结果访问。",
        sources: [src(INTEGRATION, "SHOULD"), src(INTEGRATION, "MUST")],
      },
      {
        section: "deployment",
        text: "必须记录真实打包、启动、端口、协议、实例、状态依赖和配置来源；支持优雅启动停止、健康检查、滚动发布、最小权限和故障隔离；不把开发机拓扑、默认端口或未验证容器行为当作生产事实。",
        sources: [src(INTEGRATION, "MUST"), src(INTEGRATION, "SHOULD"), src(INTEGRATION, "MUST NOT")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/backend/quality.md",
    lane: "backend",
    entries: [
      {
        section: "coverage",
        text: "测试计划必须覆盖变更行为、边界、失败、兼容和高风险交互；控制时间、随机、网络和外部依赖，并保留失败诊断信息（覆盖率阈值由 Owner 决策）。",
        sources: [src(TEST, "MUST"), src(TEST, "SHOULD")],
      },
      {
        section: "architecture",
        text: "依赖方向与分层约定以工具核查：用依赖图和 lint 自动执行边界；写集、入口、依赖方向和受影响消费者在变更前复核。",
        sources: [src(ARCH, "SHOULD"), src(ARCH, "Checklist")],
      },
      {
        section: "contract",
        text: "契约一致性：Mock schema 必须与正式契约保持一致，漂移必须被 CI 检测并阻断；契约、实现、生成客户端、测试和 handoff 已同步。",
        sources: [src(TEST, "MUST"), src(API, "Checklist")],
      },
    ],
  },
  // ============ data（门 = BE 5 键全销账；G-D 业务面零预置）============
  {
    file: ".pomaster/baseline/data/model.md",
    lane: "backend",
    entries: [
      {
        section: "Table",
        text: "物理表与实体的映射规则面：API DTO、ORM Entity 与领域模型不得无条件共用同一类型；模型转换只在边界发生一次，并经契约或 round-trip 测试验证；每次转换必须明确字段来源、空值、默认值、精度、时间和枚举语义。",
        sources: [src(DATA, "MUST"), src(DATA, "SHOULD"), src(DATA, "MUST NOT")],
      },
    ],
    businessNote:
      "本文件的 Entity（实体清单）、Identifier（标识符策略）、Relation（关系与基数）、lifecycle（对象生命周期）为业务数据模型面——零预置，保持起步值 UNKNOWN，经 New Entity Gate 通路登记（G-D 裁定：业务不预设；主题文档 Non-Scope 同锚：数据模型协议不定义具体项目字段、表或业务枚举）。",
  },
  {
    file: ".pomaster/baseline/data/precision-units.md",
    lane: "backend",
    entries: [
      {
        section: "Money",
        text: "金额声明 amount、currency、scale 和舍入规则；权威计算使用 Decimal/BigDecimal 等十进制能力；不用二进制浮点执行正式金额累计、乘除和相等比较。",
        sources: [src(VALUE, "MUST"), src(VALUE, "MUST NOT"), src(DATA, "MUST")],
      },
      {
        section: "Currency",
        text: "币种处理：Currency 为正式币种标识；混合币种不直接求和；百分比声明传输倍率。",
        sources: [src(VALUE, "Terms"), src(VALUE, "MUST NOT"), src(VALUE, "MUST")],
      },
      {
        section: "Scale",
        text: "区分原始、计算、展示和导出值；汇总按正式顺序计算和舍入；页面、报表、导出不各自决定精度。",
        sources: [src(VALUE, "MUST"), src(VALUE, "MUST NOT")],
      },
      {
        section: "Rounding",
        text: "舍入方式与时点（Rounding Mode/Stage）逐场景声明；精度、币种、舍入或比例语义变化属破坏性契约变更，必须同步全链路。",
        sources: [src(VALUE, "Terms"), src(VALUE, "Change Policy")],
      },
    ],
    businessNote:
      "本文件的 Quantity（逐量纲登记）与各节的逐字段/逐场景取值清单为业务数据面——零预置，保持起步值 UNKNOWN，经 New Entity Gate 通路登记（G-D：业务不预设）。",
  },
  {
    file: ".pomaster/baseline/data/migration.md",
    lane: "backend",
    entries: [
      {
        section: "迁移策略(expand / migrate / contract / rollback)",
        text: "每次 schema 变化必须有前向迁移、兼容分析、验证和回退或 roll-forward 路径；采用 expand/migrate/contract，避免应用与数据库无法并行部署；不依赖 ORM 自动改表、手工生产操作或无记录脚本作为正式迁移；已执行 migration 不得原地改写，修正必须追加新 migration。",
        sources: [src(DATA, "MUST"), src(DATA, "SHOULD"), src(DATA, "MUST NOT"), src(DATA, "Change Policy")],
      },
      {
        section: "迁移策略(expand / migrate / contract / rollback)",
        text: "mysql 选型：字符集、排序规则、类型、约束和索引必须由 migration 明确表达；migration、rollback 或 roll-forward 路径可验证；生产兼容性不依赖本地默认值。",
        sources: [src(O.mysql, "Rules"), src(O.mysql, "Checklist")],
        when: { key: "database", words: ["mysql"] },
      },
      {
        section: "迁移策略(expand / migrate / contract / rollback)",
        text: "postgresql 选型：schema、extension、类型、约束和索引必须由受控 migration 表达；migration 与兼容窗口可复核。",
        sources: [src(O.postgresql, "Rules"), src(O.postgresql, "Checklist")],
        when: { key: "database", words: ["postgresql", "postgres"] },
      },
    ],
    businessNote:
      "本文件的逐次迁移审批面与验证要求取值由 Owner 决策；本草案只盖迁移策略规范面（G-D：业务表结构演进事实不预设）。",
  },
  {
    file: ".pomaster/baseline/data/lineage.md",
    lane: "backend",
    entries: [
      {
        section: "数据链路(Source → Transform → Target)",
        text: "链路登记的规范要素：敏感数据必须有目的、来源、接收方、保留期、删除触发与访问控制；数据设计必须记录分类、处理目的、存储位置、流向、保留与删除证据。",
        sources: [src(PRIVACY, "MUST"), src(PRIVACY, "Contract")],
      },
    ],
    businessNote:
      "本文件的业务链路清单（来源 → 变换 → 目标逐条）为业务数据面——零预置，保持起步值 UNKNOWN，随项目生长（G-D：不预建业务图）。",
  },
  {
    file: ".pomaster/baseline/data/quality.md",
    lane: "backend",
    entries: [
      {
        section: "null",
        text: "空值语义在边界声明：每次转换明确字段来源、空值、默认值、精度、时间和枚举语义（逐字段清单由 Owner 登记）。",
        sources: [src(DATA, "MUST")],
      },
      {
        section: "uniqueness",
        text: "唯一性以数据库约束或带版本条件的原子更新保护不变量；并发写必须明确竞争对象、原子条件与冲突结果。",
        sources: [src(DATA, "SHOULD"), src(DATA, "MUST")],
      },
      {
        section: "stale",
        text: "缓存数据必须定义 key 维度、权限隔离、TTL、更新失效、故障和恢复行为；权威数据源是在冲突时决定业务事实的持久来源。",
        sources: [src(DATA, "MUST"), src(DATA, "Terms")],
        when: { key: "cache", words: ["redis", "memcached"] },
      },
    ],
    businessNote:
      "本文件的逐字段空值清单、逐条唯一性约束、逐类时效与对账口径为业务数据面——零预置，保持起步值 UNKNOWN（G-D：业务不预设）。",
  },
  // ============ platform（门 = BE 5 键全销账）============
  {
    file: ".pomaster/baseline/platform/security.md",
    lane: "backend",
    entries: [
      {
        section: "auth",
        text: "统一定义 token、cookie、CSRF、退出和刷新策略；每个受保护操作必须在服务端验证主体、操作、租户、数据范围和资源归属；前端仅做 UI 呈现，最终授权由后端执行。",
        sources: [src(SEC, "MUST"), src(PERM, "MUST")],
      },
      {
        section: "secret",
        text: "secret 不写入仓库、日志、示例、命令行历史或生成文档；配置必须有类型、来源、默认行为、敏感级别、验证与变更路径。",
        sources: [src(ENV, "MUST NOT"), src(ENV, "MUST")],
      },
      {
        section: "sensitive data",
        text: "敏感数据必须有目的、来源、接收方、保留期、删除触发与访问控制；字段脱敏、复制、导出和日志必须遵守数据权限。",
        sources: [src(PRIVACY, "MUST"), src(SEC, "MUST")],
      },
      {
        section: "trust zone",
        text: "所有输入、URL、文件名、消息和 HTML 默认不可信；不可信数据进入系统时校验、输出到不同上下文时使用对应编码或净化；上传和下载必须由服务端再次校验权限、类型和范围。",
        sources: [src(SEC, "MUST")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/platform/environment.md",
    lane: "backend",
    entries: [
      {
        section: "环境差异规则(local / dev / test / stage / prod)",
        text: "配置必须有 schema、类型、默认值、必填校验和环境矩阵；API、Mock、日志和环境标识从统一配置模块读取；生产默认关闭 Mock、调试日志和开发工具；缺少必填配置时启动失败或安全降级，不猜值。",
        sources: [src(ENV, "MUST")],
      },
      {
        section: "环境差异规则(local / dev / test / stage / prod)",
        text: "spring 选型：必须记录 Boot 版本、配置来源、自动配置例外和启动验证；配置项和 actuator 暴露必须遵守安全与环境配置协议。",
        sources: [src(O.springBoot, "Rules")],
        when: { key: "framework", words: ["spring"] },
      },
    ],
  },
  {
    file: ".pomaster/baseline/platform/observability.md",
    lane: "backend",
    entries: [
      {
        section: "log",
        text: "结构化日志包含时间、级别、稳定 message_id、版本、环境、trace-id 与安全上下文摘要；日志字段脱敏；不记录 token、密码、secret、完整敏感 payload 或无界高基数值。",
        sources: [src(OBS, "MUST"), src(OBS, "MUST NOT")],
      },
      {
        section: "metric",
        text: "HTTP client 与关键异步任务聚合 RED 指标；指标名称、单位、维度和版本稳定；完整 URL、DOM 文本、用户输入等高基数字段不作维度。",
        sources: [src(OBS, "MUST"), src(OBS, "MUST NOT")],
      },
      {
        section: "trace",
        text: "关键操作必须可关联版本、环境、主体、操作结果与 TraceId；Span 记录父子关系、耗时、结果和受控元数据；关键 API 调用必须生成或传播 trace-id。",
        sources: [src(OBS, "MUST")],
      },
      {
        section: "audit",
        text: "审计事件逐条登记：关键操作关联主体、操作结果与 TraceId；埋点不替代审计。",
        sources: [src(OBS, "MUST"), src(OBS, "MUST NOT")],
      },
      {
        section: "correlation",
        text: "TraceId 贯穿客户端操作、HTTP 请求、异步任务、后端日志和用户可见错误；TraceId 不携带敏感信息，并在跨服务时保持或建立明确父子关系。",
        sources: [src(API, "Contract", "TraceId")],
      },
    ],
  },
  {
    file: ".pomaster/baseline/platform/delivery.md",
    lane: "backend",
    entries: [
      {
        section: "build",
        text: "本地与 CI 使用相同标准命令；运行时、包管理器和关键构建工具版本必须被仓库内机器可读配置固定并由 CI 校验；固定包管理器、锁文件和受信 registry。",
        sources: [src(TOOLCHAIN, "MUST")],
      },
      {
        section: "CI",
        text: "工具违规必须产生明确失败而非仅提示；CI 使用 frozen/immutable 安装并在 manifest 与锁文件漂移时失败。",
        sources: [src(TOOLCHAIN, "MUST"), src(TOOLCHAIN, "MUST NOT")],
      },
      {
        section: "release",
        text: "发布前必须确认版本、依赖顺序、兼容、观测、停止条件和恢复路径；发布前契约、测试、安全、配置、监控和回滚满足门禁；高风险变更定义灰度和停止条件。",
        sources: [src(RELEASE, "MUST")],
      },
      {
        section: "version",
        text: "每个构建有可观测版本和来源；公共 breaking change 先 deprecated 并提供迁移期；不做无版本标识发布。",
        sources: [src(RELEASE, "MUST"), src(RELEASE, "MUST NOT")],
      },
      {
        section: "rollback",
        text: "回滚同时考虑前端资源、接口、缓存、任务和数据兼容；不在无法恢复数据或无监控信号时进行不可逆全量发布；采用小批量灰度、可撤回开关和前后版本并行兼容。",
        sources: [src(RELEASE, "MUST"), src(RELEASE, "MUST NOT"), src(RELEASE, "SHOULD")],
      },
      {
        section: "artifact",
        text: "发布记录必须包含变更范围、产物 hash、步骤、门禁、指标、Owner 与结果。",
        sources: [src(RELEASE, "Contract")],
      },
    ],
  },
];

// ============================================================
// 栈值读取与条件匹配（ADR-1/ADR-4）
// ============================================================

/** 栈词形边界匹配（ADR-4）：小写化 + 字母数字边界（防 "javascript" 命中 "java"）。 */
export function matchStackValue(value: string, word: string): boolean {
  const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(value.toLowerCase());
}

/** lane 栈键是否全销账（ADR-1 门判据）。 */
function laneFullyResolved(values: ReadonlyMap<string, string>, lane: BaselineLane): boolean {
  return STACK_KEYS[lane].every((key) => isStackValueResolved(values.get(key) ?? ""));
}

// ============================================================
// 草案节渲染（确定性：静态表 + 现盘栈值 → 字节稳定，A4 零墙钟）
// ============================================================

/** 选型基面行（生成时点栈值呈现——改动走 baseline set/治理通路的显式留痕）。 */
function renderSelectionsLine(lane: BaselineLane, values: ReadonlyMap<string, string>): string {
  const pairs = STACK_KEYS[lane].map((key) => `${lane}.${key}=${values.get(key) ?? "UNKNOWN"}`);
  return `- 选型基面（生成时点栈值；改型走 baseline set/治理通路）：${pairs.join("；")}`;
}

function renderSource(source: PresetSourceRef): string {
  const sub = source.sub === undefined ? "" : `［${source.sub}］`;
  return `  - 源:${source.path} §${source.section}${sub}`;
}

/** 草案节全文（append-only 追加到播种 md 尾部；既有字节零改动）。 */
export function renderPresetDraftSection(
  face: PresetFaceSpec,
  laneValues: ReadonlyMap<string, string>,
): string {
  const lines: string[] = [
    PRESET_DRAFT_HEADING,
    "",
    PRESET_DRAFT_PREAMBLE,
    "",
    renderSelectionsLine(face.lane, laneValues),
  ];
  const resolved = new Map<string, string>(
    STACK_KEYS[face.lane].map((key) => [key, laneValues.get(key) ?? "UNKNOWN"]),
  );
  for (const entry of face.entries) {
    if (entry.when !== undefined) {
      const value = resolved.get(entry.when.key) ?? "";
      if (!entry.when.words.some((word) => matchStackValue(value, word))) continue;
    }
    lines.push("", `### ${entry.section}`, "", `- 草案:${entry.text}`);
    lines.push(...entry.sources.map(renderSource));
  }
  if (face.businessNote !== undefined) {
    lines.push("", PRESET_DRAFT_BUSINESS_NOTE_HEADING, "", `- ${face.businessNote}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ============================================================
// 生成入口（init 步骤 4.9）
// ============================================================

/** 生成报告（InitResult.presetDraft 信封面；ADR-6）。 */
export interface BaselinePresetDraftReport {
  /** 本次追加草案节的文件数（files 报告 action=updated 同数）。 */
  readonly generated: number;
  /** 门开但 PRESET-DRAFT 已在座而跳过的文件数（draft-once；Owner 改动零触碰）。 */
  readonly skipped_existing: number;
  /** baseline 确认态在座（confirmed/drifted）→ 整体跳过（ADR-2：禁 init 自造漂移）。 */
  readonly skipped_confirmed: boolean;
}

/** 草案人读行（恒一行；init 版式锚 = baseline 行之后）。 */
export function renderBaselinePresetHumanLine(report: BaselinePresetDraftReport): string {
  if (report.skipped_confirmed) {
    return "  baseline preset: 预置草案跳过（baseline 已确认——烙印态不再生成草案；缺席草案重生成先走治理通路使确认失效）";
  }
  if (report.generated === 0 && report.skipped_existing === 0) {
    return "  baseline preset: 预置草案未生成（栈选型键未全销账——UNKNOWN 保持；TTY 问卷或 baseline set 补齐后重跑 init 生成）";
  }
  return (
    `  baseline preset: 预置草案 ${report.generated} 份生成、${report.skipped_existing} 份已在座跳过` +
    "（PRESET-DRAFT 非权威——Owner 确认前可自由修改；baseline confirm 烙印基线）"
  );
}

async function readPomasterTextFile(absolutePath: string): Promise<string | null> {
  try {
    await stat(absolutePath);
  } catch {
    return null;
  }
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * baseline 栈预置草案生成（init 步骤 4.9；G-B/G-C/G-D）：
 * 确认态在座 → 整体跳过（ADR-2）；逐 face 判门（lane 栈键全销账）→ 文件在座且
 * 无 PRESET-DRAFT 词形 → 追加草案节（纯加法，既有字节零改动，files 报告
 * action=updated）。草案在座 = 零触碰（draft-once）。缺席文件防御性跳过
 * （播种步骤 4.6 保证在座；缺席 = 结构漂移，不静默重建）。
 */
export async function appendPresetDrafts(
  rootDir: string,
  files: InitFileReport[],
): Promise<BaselinePresetDraftReport> {
  const presentation = await readBaselineConfirmationPresentation(rootDir);
  const skippedConfirmed = presentation !== null && presentation.state !== "unconfirmed";
  let generated = 0;
  let skippedExisting = 0;
  if (!skippedConfirmed) {
    const laneValuesByLane = new Map<BaselineLane, ReadonlyMap<string, string>>();
    for (const lane of BASELINE_LANES) {
      const loaded = await loadLaneStackValues(rootDir, lane);
      if (loaded.ok && laneFullyResolved(loaded.values, lane)) {
        laneValuesByLane.set(lane, loaded.values);
      }
    }
    for (const face of PRESET_FACE_SPECS) {
      const laneValues = laneValuesByLane.get(face.lane);
      if (laneValues === undefined) continue; // 门未开——纯 UNKNOWN 骨架保持（缺席诚实）
      const absolute = `${rootDir}/${face.file}`;
      const existing = await readPomasterTextFile(absolute);
      if (existing === null) continue; // 防御性跳过（播种保证在座；不静默重建）
      if (existing.includes(PRESET_DRAFT_MARKER)) {
        skippedExisting += 1; // draft-once：在座零触碰（Owner 可改，禁覆盖）
        continue;
      }
      const separator = existing.endsWith("\n") ? "\n" : "\n\n";
      await writeFile(absolute, `${existing}${separator}${renderPresetDraftSection(face, laneValues)}`, "utf8");
      files.push({ file: face.file, action: "updated" });
      generated += 1;
    }
  }
  return { generated, skipped_existing: skippedExisting, skipped_confirmed: skippedConfirmed };
}
