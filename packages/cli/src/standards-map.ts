/**
 * standards-map.ts —— 规范的空间与抽屉：项目规范按哪些层组织、每层有哪些抽屉、哪些抽屉对当前项目生效。
 *
 * 空间是系统里的一层：前端、前端服务器、后端、数据库、缓存、消息与异步、平台与运维、安全、测试。
 * 每个空间有一组通用规范（主题文档，跨语言、跨框架都成立），再按需要挂抽屉：
 * - 架构形态（模块化单体、微服务、Serverless）、语言（Java、PHP、Python、Go……）、框架（Spring、Laravel、Django……）、
 *   产品（MySQL、Redis、Nginx……）；
 * - 抽屉有现成规范文档的是「已有」；还没有的是「预留」——项目用到时由 `update spec --drawer` 建项目抽屉文档并写入。
 *
 * 生效判定只读不写：技术基线的选型（baseline/<lane>/stack.yaml）与仓库信号（构建与依赖清单、配置文件名）
 * 任一命中即生效，命中原因逐条列出。通用规范对所有项目生效，不需要判定。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

export type StandardsLane = "frontend" | "backend" | "data" | "platform";
export type DrawerKind = "architecture" | "language" | "framework" | "persistence" | "product";

export const DRAWER_KIND_TITLES: Readonly<Record<DrawerKind, string>> = {
  architecture: "架构形态",
  language: "语言",
  framework: "框架与运行时",
  persistence: "持久层",
  product: "产品",
};

export interface StandardsDrawer {
  readonly id: string;
  readonly title_zh: string;
  readonly kind: DrawerKind;
  /** 现成规范文档（相对 specs/hard/）；null = 预留抽屉。 */
  readonly doc: string | null;
  readonly summary_zh: string;
  /** 技术基线选型：lane 的 stack.yaml 里这个键的取值命中任一词（字母数字边界、不分大小写）。 */
  readonly stack?: { readonly lane: StandardsLane; readonly keys: readonly string[]; readonly words: readonly string[] };
  /** 仓库信号：根目录或一级子目录里出现这些文件名。 */
  readonly files?: readonly string[];
  /** 仓库信号：依赖与构建清单里出现这些依赖名。 */
  readonly deps?: readonly string[];
}

export interface StandardsTestType {
  readonly id: string;
  readonly title_zh: string;
  readonly proves_zh: string;
  /** 对应的证据规范（specs/evidence/<slug>.md）。 */
  readonly evidence: readonly string[];
}

export interface StandardsSpace {
  readonly key: string;
  readonly title_zh: string;
  readonly summary_zh: string;
  /** 通用规范：主题文档（specs/hard/themes/<slug>.md），所有项目生效。 */
  readonly themes: readonly string[];
  readonly drawers: readonly StandardsDrawer[];
  /** 只有测试空间有：测试类型与证据规范的对应。 */
  readonly tests?: readonly StandardsTestType[];
}

const reserved = (
  id: string,
  title_zh: string,
  kind: DrawerKind,
  summary_zh: string,
  signals: Pick<StandardsDrawer, "stack" | "files" | "deps"> = {},
): StandardsDrawer => ({ id, title_zh, kind, doc: null, summary_zh, ...signals });

export const STANDARDS_SPACES: readonly StandardsSpace[] = [
  {
    key: "frontend",
    title_zh: "前端",
    summary_zh: "浏览器里运行的部分：界面呈现、页面组成、状态与数据、文案与国际化；界面怎么呈现以项目设计规范为准。",
    themes: ["ui-presentation-and-design", "page-composition-and-browser-environment", "frontend-state-and-client-data", "internationalization-and-copywriting"],
    drawers: [
      { id: "vue3", title_zh: "Vue", kind: "framework", doc: "stacks/vue3/vue3-framework-overlay.md", summary_zh: "组合式写法、响应式、路由与状态库的用法。", stack: { lane: "frontend", keys: ["framework"], words: ["vue"] }, deps: ["vue"] },
      { id: "react", title_zh: "React", kind: "framework", doc: "stacks/react/react-framework-overlay.md", summary_zh: "Hooks 规则、纯渲染、副作用与懒加载。", stack: { lane: "frontend", keys: ["framework"], words: ["react"] }, deps: ["react"] },
      { id: "h5", title_zh: "H5 / 移动端", kind: "framework", doc: "stacks/h5/h5-mobile-overlay.md", summary_zh: "移动端视口、触控目标、弱网与安全区。", stack: { lane: "frontend", keys: ["ui", "framework"], words: ["vant", "h5", "mobile"] }, deps: ["vant"] },
      reserved("mini-program", "小程序", "framework", "小程序与跨端框架的生命周期、包体与审核约束。", { deps: ["@tarojs/taro", "@dcloudio/uni-app"], files: ["project.config.json"] }),
      reserved("angular", "Angular", "framework", "模块、依赖注入与变更检测。", { stack: { lane: "frontend", keys: ["framework"], words: ["angular"] }, deps: ["@angular/core"] }),
      reserved("svelte", "Svelte", "framework", "组件与响应式声明。", { stack: { lane: "frontend", keys: ["framework"], words: ["svelte"] }, deps: ["svelte"] }),
      { id: "antdesign", title_zh: "Ant Design", kind: "product", doc: "stacks/antdesign/antdesign-ui-overlay.md", summary_zh: "组件库的按需引入、主题 token 与组件用法。", stack: { lane: "frontend", keys: ["ui"], words: ["ant", "antd", "antdv"] }, deps: ["ant-design-vue", "antd"] },
      { id: "geist", title_zh: "Geist", kind: "product", doc: "stacks/geist/geist-design-system-overlay.md", summary_zh: "Geist 设计体系的组件与变体词表。", stack: { lane: "frontend", keys: ["ui"], words: ["geist"] }, deps: ["geist"] },
      { id: "css", title_zh: "CSS 体系", kind: "product", doc: "stacks/css/css-system-overlay.md", summary_zh: "样式作用域、token 与重置。", stack: { lane: "frontend", keys: ["css"], words: ["scoped", "css", "less", "sass", "scss"] } },
      { id: "tailwind", title_zh: "Tailwind CSS", kind: "product", doc: "stacks/tailwind/tailwind-css-overlay.md", summary_zh: "工具类、主题配置与设计 token 对齐。", stack: { lane: "frontend", keys: ["css"], words: ["tailwind"] }, deps: ["tailwindcss"] },
    ],
  },
  {
    key: "frontend_server",
    title_zh: "前端服务器",
    summary_zh: "浏览器与后端之间的一层：托管静态资源、反向代理与路由转发、HTTPS 与安全响应头、压缩与缓存头、单页应用的路由回退、BFF 与服务端渲染、CDN。前端项目上线都会经过它，规范要显式写出来，不靠默认配置。",
    themes: ["security", "performance-and-capacity", "environment-and-configuration"],
    drawers: [
      { id: "nginx", title_zh: "Nginx", kind: "product", doc: "stacks/nginx/nginx-proxy-overlay.md", summary_zh: "反向代理、静态托管、安全头、缓存头与超时。", files: ["nginx.conf", "nginx"] },
      { id: "kubernetes-ingress", title_zh: "Kubernetes Ingress", kind: "product", doc: "stacks/kubernetes-ingress/kubernetes-ingress-overlay.md", summary_zh: "入口路由、TLS 终止与注解约定。", files: ["ingress.yaml", "ingress.yml"] },
      reserved("bff", "BFF（面向前端的后端）", "architecture", "聚合接口、裁剪字段、转发鉴权的那一层服务。"),
      reserved("ssr", "服务端渲染", "framework", "Nuxt / Next 这类服务端渲染：渲染边界、数据预取、缓存与水合。", { deps: ["nuxt", "next"] }),
      reserved("cdn", "CDN", "product", "静态资源上 CDN：缓存键、回源、版本化文件名与失效。"),
      reserved("apache-httpd", "Apache HTTP Server", "product", "虚拟主机、重写规则与安全头。", { files: ["httpd.conf", ".htaccess"] }),
      reserved("caddy", "Caddy", "product", "自动 HTTPS、反向代理与静态托管。", { files: ["Caddyfile"] }),
    ],
  },
  {
    key: "backend",
    title_zh: "后端",
    summary_zh: "服务端的业务与接口。通用规范对任何语言、任何架构都成立：接口契约与错误语义、分层与模块边界、鉴权、领域数据、集成与异步、可观测、环境与配置；语言、框架与架构形态的差异放进抽屉。",
    themes: ["api-contract-and-error-semantics", "architecture-and-module-boundaries", "permission-and-authorization", "value-semantics-and-domain-data", "integration-and-async-runtime", "observability-and-analytics", "environment-and-configuration"],
    drawers: [
      reserved("modular-monolith", "模块化单体", "architecture", "一个部署单元里按业务模块划边界：模块只经公开接口互相调用，数据按模块归属。"),
      reserved("microservices", "微服务", "architecture", "按业务能力拆服务：服务边界、服务间契约、分布式事务、服务发现、熔断与限流、链路追踪。", { deps: ["spring-cloud", "@nestjs/microservices", "dubbo"] }),
      reserved("serverless", "Serverless", "architecture", "函数粒度、冷启动、无状态与事件触发。", { files: ["serverless.yml", "serverless.yaml"] }),
      { id: "java", title_zh: "Java", kind: "language", doc: "stacks/java/java-language-overlay.md", summary_zh: "语言习惯、空值、异常、并发与集合。", stack: { lane: "backend", keys: ["language"], words: ["java"] }, files: ["pom.xml", "build.gradle", "build.gradle.kts"] },
      reserved("kotlin", "Kotlin", "language", "空安全、协程与数据类。", { stack: { lane: "backend", keys: ["language"], words: ["kotlin"] }, deps: ["kotlin-stdlib"] }),
      reserved("php", "PHP", "language", "类型声明、依赖管理与请求生命周期。", { stack: { lane: "backend", keys: ["language"], words: ["php"] }, files: ["composer.json"] }),
      reserved("python", "Python", "language", "类型标注、依赖与虚拟环境、异步。", { stack: { lane: "backend", keys: ["language"], words: ["python"] }, files: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"] }),
      reserved("go", "Go", "language", "错误处理、并发与 context 传递。", { stack: { lane: "backend", keys: ["language"], words: ["go", "golang"] }, files: ["go.mod"] }),
      reserved("nodejs", "Node.js", "language", "事件循环、异步错误、依赖与进程管理。", { stack: { lane: "backend", keys: ["language"], words: ["node", "nodejs", "typescript"] } }),
      reserved("csharp", "C#", "language", "异步、空引用与依赖注入。", { stack: { lane: "backend", keys: ["language"], words: ["csharp", "dotnet", "net"] } }),
      { id: "spring-boot", title_zh: "Spring Boot", kind: "framework", doc: "stacks/spring-boot/spring-boot-application-overlay.md", summary_zh: "自动配置、配置绑定、启动与健康检查。", stack: { lane: "backend", keys: ["framework"], words: ["spring"] }, deps: ["spring-boot"] },
      { id: "spring-mvc", title_zh: "Spring MVC", kind: "framework", doc: "stacks/spring-mvc/spring-mvc-web-overlay.md", summary_zh: "控制器、校验、异常映射与过滤器。", deps: ["spring-boot-starter-web", "spring-webmvc"] },
      { id: "spring-webflux", title_zh: "Spring WebFlux", kind: "framework", doc: "stacks/spring-webflux/spring-webflux-reactive-overlay.md", summary_zh: "响应式链路、背压与阻塞隔离。", deps: ["spring-boot-starter-webflux", "spring-webflux"] },
      { id: "spring-batch", title_zh: "Spring Batch", kind: "framework", doc: "stacks/spring-batch/spring-batch-job-overlay.md", summary_zh: "作业、步骤、重启与幂等。", deps: ["spring-batch", "spring-boot-starter-batch"] },
      reserved("spring-cloud", "Spring Cloud", "framework", "配置中心、注册发现、网关与熔断。", { deps: ["spring-cloud"] }),
      { id: "tomcat", title_zh: "Tomcat", kind: "framework", doc: "stacks/tomcat/tomcat-runtime-overlay.md", summary_zh: "Servlet 容器的线程、连接与超时配置。", deps: ["tomcat-embed-core", "spring-boot-starter-tomcat"] },
      reserved("laravel", "Laravel", "framework", "路由、Eloquent、队列与中间件。", { stack: { lane: "backend", keys: ["framework"], words: ["laravel"] }, deps: ["laravel/framework"] }),
      reserved("symfony", "Symfony", "framework", "Bundle、依赖注入与 Doctrine。", { stack: { lane: "backend", keys: ["framework"], words: ["symfony"] }, deps: ["symfony/framework-bundle"] }),
      reserved("django", "Django", "framework", "应用划分、ORM、迁移与中间件。", { stack: { lane: "backend", keys: ["framework"], words: ["django"] }, deps: ["django"] }),
      reserved("fastapi", "FastAPI", "framework", "路由、依赖注入、模型校验与异步。", { stack: { lane: "backend", keys: ["framework"], words: ["fastapi"] }, deps: ["fastapi"] }),
      reserved("flask", "Flask", "framework", "蓝图、请求上下文与扩展。", { stack: { lane: "backend", keys: ["framework"], words: ["flask"] }, deps: ["flask"] }),
      reserved("gin", "Gin", "framework", "路由组、中间件与绑定校验。", { stack: { lane: "backend", keys: ["framework"], words: ["gin"] }, deps: ["github.com/gin-gonic/gin"] }),
      reserved("nestjs", "NestJS", "framework", "模块、提供者、守卫与管道。", { stack: { lane: "backend", keys: ["framework"], words: ["nest", "nestjs"] }, deps: ["@nestjs/core"] }),
      reserved("express", "Express", "framework", "路由、中间件顺序与错误中间件。", { stack: { lane: "backend", keys: ["framework"], words: ["express"] } }),
      reserved("aspnet-core", "ASP.NET Core", "framework", "中间件管线、依赖注入与配置。", { stack: { lane: "backend", keys: ["framework"], words: ["aspnet", "asp"] } }),
      { id: "mybatis", title_zh: "MyBatis", kind: "persistence", doc: "stacks/mybatis/mybatis-persistence-overlay.md", summary_zh: "Mapper、动态 SQL、分页与批量。", stack: { lane: "backend", keys: ["persistence"], words: ["mybatis"] }, deps: ["mybatis"] },
      { id: "jpa", title_zh: "JPA / Hibernate", kind: "persistence", doc: "stacks/jpa/jpa-persistence-overlay.md", summary_zh: "实体映射、懒加载、N+1 与事务边界。", stack: { lane: "backend", keys: ["persistence"], words: ["jpa", "hibernate"] }, deps: ["spring-boot-starter-data-jpa", "hibernate-core"] },
      reserved("orm-other", "其他 ORM", "persistence", "Eloquent、Django ORM、SQLAlchemy、Prisma、GORM 一类 ORM 的查询与迁移约定。", { deps: ["sqlalchemy", "prisma", "@prisma/client", "gorm.io/gorm", "typeorm"] }),
    ],
  },
  {
    key: "database",
    title_zh: "数据库",
    summary_zh: "持久化数据：模型、迁移、索引与查询、事务与并发、数据生命周期与隐私。",
    themes: ["data-and-transactions", "privacy-and-data-lifecycle"],
    drawers: [
      { id: "mysql", title_zh: "MySQL", kind: "product", doc: "stacks/mysql/mysql-database-overlay.md", summary_zh: "字符集、索引、锁与迁移账号。", stack: { lane: "backend", keys: ["database"], words: ["mysql", "mariadb"] }, deps: ["mysql-connector", "mysql2", "pymysql"] },
      { id: "postgresql", title_zh: "PostgreSQL", kind: "product", doc: "stacks/postgresql/postgresql-database-overlay.md", summary_zh: "类型、索引、锁与扩展。", stack: { lane: "backend", keys: ["database"], words: ["postgres", "postgresql", "pg"] }, deps: ["postgresql", "psycopg", "pg"] },
      reserved("oracle", "Oracle", "product", "序列、分区与 PL/SQL 边界。", { stack: { lane: "backend", keys: ["database"], words: ["oracle"] }, deps: ["ojdbc"] }),
      reserved("sqlserver", "SQL Server", "product", "排序规则、隔离级别与索引。", { stack: { lane: "backend", keys: ["database"], words: ["sqlserver", "mssql"] }, deps: ["mssql-jdbc", "mssql"] }),
      reserved("mongodb", "MongoDB", "product", "文档建模、索引与一致性级别。", { stack: { lane: "backend", keys: ["database"], words: ["mongo", "mongodb"] }, deps: ["mongodb", "mongoose"] }),
      reserved("sqlite", "SQLite", "product", "单文件库的并发与迁移。", { stack: { lane: "backend", keys: ["database"], words: ["sqlite"] }, deps: ["sqlite3", "better-sqlite3"] }),
      reserved("search-engine", "搜索引擎", "product", "Elasticsearch / OpenSearch 的索引设计、同步与查询。", { deps: ["elasticsearch", "opensearch"] }),
    ],
  },
  {
    key: "cache",
    title_zh: "缓存",
    summary_zh: "为了快而存的副本：缓存什么、放哪一层、键怎么设计、何时失效、穿透击穿雪崩怎么防、与数据库如何保持一致。",
    themes: ["performance-and-capacity", "data-and-transactions"],
    drawers: [
      { id: "redis", title_zh: "Redis", kind: "product", doc: "stacks/redis/redis-cache-overlay.md", summary_zh: "键设计、过期、序列化与一致性。", stack: { lane: "backend", keys: ["cache"], words: ["redis"] }, deps: ["redis", "ioredis", "jedis", "lettuce", "spring-boot-starter-data-redis"] },
      reserved("local-cache", "本地缓存", "product", "进程内缓存（Caffeine 一类）的容量、过期与多实例一致。", { stack: { lane: "backend", keys: ["cache"], words: ["caffeine", "local"] }, deps: ["caffeine"] }),
      reserved("memcached", "Memcached", "product", "键空间、过期与分片。", { stack: { lane: "backend", keys: ["cache"], words: ["memcached"] }, deps: ["memcached"] }),
    ],
  },
  {
    key: "messaging",
    title_zh: "消息与异步",
    summary_zh: "不在请求里同步完成的工作：消息投递、重试与幂等、顺序、死信、定时任务与后台作业。",
    themes: ["integration-and-async-runtime"],
    drawers: [
      { id: "messaging", title_zh: "可靠投递（通用）", kind: "product", doc: "stacks/messaging/messaging-reliability-overlay.md", summary_zh: "至少一次投递下的幂等消费、重试、死信与顺序。", deps: ["kafka", "amqp", "rabbitmq", "rocketmq", "bullmq", "celery"] },
      reserved("kafka", "Kafka", "product", "分区、消费组、位点提交与重平衡。", { deps: ["kafka"] }),
      reserved("rabbitmq", "RabbitMQ", "product", "交换机、确认、预取与死信。", { deps: ["amqp", "rabbitmq"] }),
      reserved("rocketmq", "RocketMQ", "product", "事务消息、顺序消息与重试。", { deps: ["rocketmq"] }),
    ],
  },
  {
    key: "platform",
    title_zh: "平台与运维",
    summary_zh: "让代码变成在线服务的一切：环境与配置、构建与发布、特性开关、可观测、工具链与依赖、AI 生成代码的约束。",
    themes: ["release-and-feature-flags", "environment-and-configuration", "observability-and-analytics", "engineering-toolchain-and-dependencies", "ai-generated-code"],
    drawers: [
      reserved("docker", "Docker", "product", "镜像分层、非 root、健康检查与体积。", { files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml"] }),
      reserved("kubernetes", "Kubernetes", "product", "资源配额、探针、滚动发布与配置挂载。", { files: ["Chart.yaml", "k8s", "kustomization.yaml"] }),
      reserved("github-actions", "GitHub Actions", "product", "工作流权限、缓存、矩阵与密钥。", { files: [".github"] }),
      reserved("gitlab-ci", "GitLab CI", "product", "流水线阶段、缓存与变量保护。", { files: [".gitlab-ci.yml"] }),
    ],
  },
  {
    key: "security",
    title_zh: "安全",
    summary_zh: "横贯每一层的防线：输入与输出、认证与会话、授权、敏感数据、依赖与供应链。主动找漏洞的渗透测试放在测试空间。",
    themes: ["security", "permission-and-authorization", "privacy-and-data-lifecycle"],
    drawers: [],
  },
  {
    key: "testing",
    title_zh: "测试",
    summary_zh: "证明代码做对了的方法。每一类测试对应证据规范：冒烟、单元与集成、回归、白盒、黑盒、渗透与安全、性能、发布与数据迁移；结果按证据入账，没跑的记 NOT_RUN。",
    themes: ["testing-and-verification", "task-governance-and-acceptance"],
    drawers: [],
    tests: [
      { id: "smoke", title_zh: "冒烟测试", proves_zh: "构建通过、应用能起来、主路径走得通——更深的测试之前先过这一关。", evidence: ["build", "browser-e2e"] },
      { id: "unit-integration", title_zh: "单元 / 组件 / 集成测试", proves_zh: "单个函数、组件与模块组合按约定工作。", evidence: ["unit-component-integration"] },
      { id: "regression", title_zh: "回归测试", proves_zh: "改动之后，原有行为与界面没有被改坏。", evidence: ["unit-component-integration", "browser-e2e", "visual-regression"] },
      { id: "white-box", title_zh: "白盒测试", proves_zh: "看着代码测：覆盖率、复杂度（CRAP）、变异测试、死代码与重复、类型与静态检查、架构约定。", evidence: ["coverage", "complexity-crap", "mutation", "dead-code-duplicate", "typecheck-lint", "architecture"] },
      { id: "black-box", title_zh: "黑盒测试", proves_zh: "只看外部行为：端到端、接口契约、业务验收、视觉、可访问性。", evidence: ["browser-e2e", "contract", "business-acceptance", "visual-regression", "accessibility"] },
      { id: "penetration", title_zh: "渗透与安全测试", proves_zh: "主动找漏洞：注入、越权、敏感信息暴露、依赖漏洞与供应链风险。", evidence: ["security", "dependency-supply-chain"] },
      { id: "performance", title_zh: "性能与容量测试", proves_zh: "在约定的负载下响应时间、吞吐与资源占用达标。", evidence: ["performance"] },
      { id: "release", title_zh: "发布与数据迁移验证", proves_zh: "迁移可执行可回退、发布可观测可回滚。", evidence: ["data-migration", "release", "runtime-observability"] },
    ],
  },
];

export function allDrawers(): Array<StandardsDrawer & { readonly space: string }> {
  return STANDARDS_SPACES.flatMap((space) => space.drawers.map((drawer) => ({ ...drawer, space: space.key })));
}

export function findDrawer(id: string): (StandardsDrawer & { readonly space: string }) | undefined {
  return allDrawers().find((drawer) => drawer.id === id);
}

/** 预留抽屉在项目里落成的文档（相对 specs/hard/）。 */
export function projectDrawerDoc(id: string): string {
  return `stacks/${id}/${id}-project-overlay.md`;
}

/** 预留抽屉第一次写入时建的项目抽屉文档：只有标题、适用说明与三个语气章节，条文由 update spec 写入。 */
export function renderProjectDrawerDoc(drawer: StandardsDrawer, spaceTitle: string): string {
  return [
    `# ${drawer.title_zh} 规范（项目抽屉）`,
    "",
    `${spaceTitle} / ${DRAWER_KIND_TITLES[drawer.kind]}：${drawer.summary_zh}`,
    "",
    "本文件由 pomaster update spec --drawer 建立并维护；条文按规范写入契约写入。",
    "",
    "## MUST",
    "",
    "## MUST NOT",
    "",
    "## SHOULD",
    "",
  ].join("\n");
}

// ============================================================
// 生效判定
// ============================================================

export interface DrawerState {
  readonly id: string;
  readonly space: string;
  readonly title_zh: string;
  readonly kind: DrawerKind;
  /** available = 有现成规范文档；project = 预留抽屉已在项目里建了文档；reserved = 预留。 */
  readonly status: "available" | "project" | "reserved";
  readonly doc: string | null;
  readonly active: boolean;
  readonly reasons: readonly string[];
}

export interface StandardsResult {
  readonly spaces: ReadonlyArray<{
    readonly key: string;
    readonly title_zh: string;
    readonly summary_zh: string;
    readonly themes: readonly string[];
    readonly drawers: readonly DrawerState[];
    readonly tests?: readonly StandardsTestType[];
  }>;
  readonly active: readonly string[];
}

function readStack(dir: string, lane: StandardsLane): Map<string, string> {
  const out = new Map<string, string>();
  const path = join(dir, ".pomaster", "baseline", lane, "stack.yaml");
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([a-z_]+):\s*(.+?)\s*$/.exec(line);
    if (match === null) continue;
    const value = (match[2] ?? "").replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (value !== "" && value !== "UNKNOWN") out.set(match[1] ?? "", value);
  }
  return out;
}

const SKIP_DIRS = new Set(["node_modules", ".pomaster", ".git", "dist", "build", "target", "vendor", ".venv", "venv"]);
const MANIFESTS = ["package.json", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "pyproject.toml", "requirements.txt", "Pipfile", "go.mod"];

interface RepoSignals {
  readonly names: Set<string>;
  readonly manifests: string;
}

/** 根目录与一级子目录的文件名，以及依赖与构建清单的文本（小写）。 */
function readRepoSignals(dir: string): RepoSignals {
  const names = new Set<string>();
  const texts: string[] = [];
  const visit = (base: string, depth: number): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(base);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      names.add(name);
      const absolute = join(base, name);
      let isDir = false;
      try {
        isDir = statSync(absolute).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (depth === 0) visit(absolute, 1);
      } else if (MANIFESTS.includes(name)) {
        try {
          texts.push(readFileSync(absolute, "utf8").toLowerCase());
        } catch {
          // 读不到的清单不参与判定
        }
      }
    }
  };
  visit(dir, 0);
  return { names, manifests: texts.join("\n") };
}

function wordHit(value: string, word: string): boolean {
  const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(value.toLowerCase());
}

/** 依赖名命中：前面是边界，后面可以接 `-` 延伸出同族包（spring-boot → spring-boot-starter-web），不接字母数字。 */
function depHit(manifests: string, dep: string): boolean {
  const escaped = dep.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9@/_.-])${escaped}(?=[^a-z0-9_]|$)`).test(manifests);
}

export function resolveStandards(dir: string): StandardsResult {
  const stacks = new Map<StandardsLane, Map<string, string>>(
    (["frontend", "backend", "data", "platform"] as const).map((lane) => [lane, readStack(dir, lane)]),
  );
  const repo = readRepoSignals(dir);
  const hardRoot = join(dir, ".pomaster", "specs", "hard");
  const active: string[] = [];
  const spaces = STANDARDS_SPACES.map((space) => ({
    key: space.key,
    title_zh: space.title_zh,
    summary_zh: space.summary_zh,
    themes: space.themes,
    ...(space.tests === undefined ? {} : { tests: space.tests }),
    drawers: space.drawers.map((drawer): DrawerState => {
      const reasons: string[] = [];
      if (drawer.stack !== undefined) {
        const values = stacks.get(drawer.stack.lane) ?? new Map<string, string>();
        for (const key of drawer.stack.keys) {
          const value = values.get(key);
          if (value !== undefined && drawer.stack.words.some((word) => wordHit(value, word))) {
            reasons.push(`技术基线 ${drawer.stack.lane}.${key}=${value}`);
          }
        }
      }
      for (const file of drawer.files ?? []) if (repo.names.has(file)) reasons.push(`仓库里有 ${file}`);
      for (const dep of drawer.deps ?? []) if (depHit(repo.manifests, dep)) reasons.push(`依赖里有 ${dep}`);
      const projectDoc = projectDrawerDoc(drawer.id);
      const status: DrawerState["status"] = drawer.doc !== null ? "available" : existsSync(join(hardRoot, projectDoc)) ? "project" : "reserved";
      const doc = drawer.doc ?? (status === "project" ? projectDoc : null);
      if (reasons.length > 0) active.push(drawer.id);
      return { id: drawer.id, space: space.key, title_zh: drawer.title_zh, kind: drawer.kind, status, doc, active: reasons.length > 0, reasons };
    }),
  }));
  return { spaces, active };
}

// ============================================================
// pomaster standards
// ============================================================

const STATUS_TITLES: Readonly<Record<DrawerState["status"], string>> = { available: "已有", project: "项目抽屉", reserved: "预留" };

export function runStandards(dir: string, options: { readonly show?: string } = {}): CommandOutcome<StandardsResult | null> {
  const result = resolveStandards(dir);
  if (options.show !== undefined) {
    const space = result.spaces.find((item) => item.key === options.show);
    const drawer = result.spaces.flatMap((item) => item.drawers).find((item) => item.id === options.show);
    if (space === undefined && drawer === undefined) {
      return failOutcome("standards", null, [{ code: "STANDARDS_UNKNOWN", message: `没有空间或抽屉 ${options.show}`, hint: "pomaster standards 列出全部空间与抽屉的编号" }], [`standards: FAILED — STANDARDS_UNKNOWN`]);
    }
    if (space !== undefined) {
      const lines = [
        `standards: ${space.title_zh}（${space.key}）`,
        `  ${space.summary_zh}`,
        "  通用规范（所有项目生效）：",
        ...space.themes.map((theme) => `    .pomaster/specs/hard/themes/${theme}.md`),
        ...(space.tests ?? []).map((test) => `  ${test.title_zh}（${test.id}）：${test.proves_zh} 证据规范：${test.evidence.map((slug) => `specs/evidence/${slug}.md`).join("、")}`),
        ...space.drawers.map((item) => `  [${item.active ? "生效" : "  "}] ${item.id} ${item.title_zh}（${DRAWER_KIND_TITLES[item.kind]}，${STATUS_TITLES[item.status]}）${item.reasons.length > 0 ? `——${item.reasons.join("；")}` : ""}`),
      ];
      return okOutcome("standards", result, lines);
    }
    const found = drawer!;
    const definition = findDrawer(found.id)!;
    return okOutcome("standards", result, [
      `standards: ${found.title_zh}（${found.id}）——${DRAWER_KIND_TITLES[found.kind]}，${STATUS_TITLES[found.status]}，${found.active ? "对本项目生效" : "本项目未用到"}`,
      `  ${definition.summary_zh}`,
      found.doc === null ? `  还没有规范文档；第一次写入时建 .pomaster/specs/hard/${projectDrawerDoc(found.id)}` : `  规范文档：.pomaster/specs/hard/${found.doc}`,
      ...(found.reasons.length > 0 ? [`  生效原因：${found.reasons.join("；")}`] : []),
      `  写入：pomaster update spec "<规则>" --drawer ${found.id} --scope … --why … --check-by … --do … --dont … --by <actor>`,
    ]);
  }
  const lines = ["standards: 规范的空间与抽屉（[生效] = 技术基线或仓库信号命中；通用规范对所有项目生效）"];
  for (const space of result.spaces) {
    lines.push(`  ${space.title_zh}（${space.key}）：通用 ${space.themes.length} 份主题文档${space.tests === undefined ? "" : `，${space.tests.length} 类测试`}`);
    for (const item of space.drawers) {
      lines.push(`    [${item.active ? "生效" : "  "}] ${item.id} ${item.title_zh}（${DRAWER_KIND_TITLES[item.kind]}，${STATUS_TITLES[item.status]}）${item.reasons.length > 0 ? `——${item.reasons.join("；")}` : ""}`);
    }
  }
  lines.push(`  生效抽屉：${result.active.length === 0 ? "（无；先回填技术基线，或在项目根目录运行）" : result.active.join("、")}`);
  return okOutcome("standards", result, lines);
}
