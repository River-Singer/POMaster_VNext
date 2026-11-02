/**
 * scaffold-surfaces.ts —— 脚手架两个部署面的结构性默认档（surface profile，S1-1）。
 *
 * 管理侧 `admin`（内网 / B 端）与用户侧 `public`（外网 / C 端）是两种信任边界，
 * 生成为两个可独立部署的后端应用，共享领域核心，不共享 Web 入口（D-S4，Owner 11-01）。
 * 领域规格逐实体声明在哪个面暴露哪些操作和字段。
 *
 * 本文件只放**框架层**的约束：授权的结构（权限码 / 访问档）、审计档、页长上限与分页模式、
 * 缓存缺省、运维端点、前端形态。**怎么登录、怎么管口令、会话与令牌用什么形态、合规定级**
 * 不在这里替项目选（D-S5，Owner 11-01：具体问题具体分析）——它们是项目决策位
 * （decision slots），在领域规格 `surfaces.<面>.decisions` 里由项目记录，harness 负责
 * 呈现哪些还没定，而不替项目选实现。研究材料（RFC 10017、NIST SP 800-63B-4、等保 2.0 等）
 * 挂在决策位的 references 上，供做决定时参考。
 *
 * 一条不随面变化的硬纪律：内网不等于可信（NIST SP 800-207）——管理侧同样每个接口认证授权，
 * 没有「内网免登录」这一档。
 */

/** 部署面闭包：领域规格 surfaces / exposure 的键只能取这两个。 */
export const SCAFFOLD_SURFACE_KEYS = ["admin", "public"] as const;
export type ScaffoldSurfaceKey = (typeof SCAFFOLD_SURFACE_KEYS)[number];

/** 用户侧访问档：匿名 / 登录用户 / 仅属主本人（管理侧恒为 RBAC 权限码，不取这些值）。 */
export const PUBLIC_ACCESS_LEVELS = ["anonymous", "authenticated", "owner"] as const;
export type PublicAccessLevel = (typeof PUBLIC_ACCESS_LEVELS)[number];

/** 项目决策位闭包：框架不替项目选，由项目在规格里记录。 */
export const SURFACE_DECISION_SLOTS = ["authentication", "session", "credential_policy", "compliance"] as const;
export type SurfaceDecisionSlot = (typeof SURFACE_DECISION_SLOTS)[number];

export interface SurfaceDecisionSlotSpec {
  readonly key: SurfaceDecisionSlot;
  readonly title_zh: string;
  /** 项目做这个决定时要回答的问题。 */
  readonly question_zh: string;
  /** 参考材料（研究文档的来源），只供参考，不是缺省答案。 */
  readonly references: readonly string[];
}

const RFC_10017 = "https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/";
const NIST_800_63B_4 = "https://pages.nist.gov/800-63-4/sp800-63b.html?locale=en";
const NIST_800_207 = "https://trainingcamp.com/articles/zero-trust-theory-what-nist-800-207-actually-defines/";
const OWASP_API_2023 = "https://apisecurity.io/owasp-api-security-top-10/";
const SPRING_BOOT_MANAGEMENT = "https://docs.spring.io/spring-boot/4.0/reference/actuator/monitoring.html";
const SPRING_SECURITY_CSRF = "https://docs.spring.io/spring-security/reference/7.0.7/servlet/exploits/csrf.html";
const DENGBAO_L3 = "https://ctyun.cn/document/10045750/10300680";
const CYBERSECURITY_LAW = "https://www.cac.gov.cn/2016-11/07/c_1119867116_2.htm";
const PIPL = "https://npcobserver.com/wp-content/uploads/2023/09/2021-Personal-Information-Protection-Law_Gazette.pdf";
const CORE_WEB_VITALS = "https://specification.website/spec/performance/core-web-vitals/";

export const SURFACE_DECISION_SLOT_SPECS: Readonly<Record<SurfaceDecisionSlot, SurfaceDecisionSlotSpec>> = {
  authentication: {
    key: "authentication",
    title_zh: "登录方式与认证强度",
    question_zh: "这个面的用户怎么登录（企业 SSO、短信验证码、社交登录、账号口令……）？要不要多因素？",
    references: [NIST_800_63B_4, DENGBAO_L3],
  },
  session: {
    key: "session",
    title_zh: "会话与令牌形态",
    question_zh: "登录态放在哪里（服务端会话 Cookie / 令牌）？无操作超时与绝对时长多少？CSRF 怎么防？",
    references: [RFC_10017, SPRING_SECURITY_CSRF, NIST_800_63B_4],
  },
  credential_policy: {
    key: "credential_policy",
    title_zh: "口令与凭据管理",
    question_zh: "自建口令还是交给身份提供方？长度、黑名单、失败锁定、更换策略怎么定？",
    references: [NIST_800_63B_4, DENGBAO_L3],
  },
  compliance: {
    key: "compliance",
    title_zh: "合规定级",
    question_zh: "这个系统按什么合规要求建设（等保级别、个人信息影响评估、实名要求……）？",
    references: [DENGBAO_L3, CYBERSECURITY_LAW, PIPL],
  },
};

export interface SurfaceProfileSource {
  readonly url: string;
  /** 这条来源支撑的默认档（一句话）。 */
  readonly supports_zh: string;
}

export interface SurfaceProfile {
  readonly key: ScaffoldSurfaceKey;
  readonly title_zh: string;
  readonly audience_zh: string;
  readonly network_zh: string;
  /** 接口根路径缺省值（规格 surfaces.<key>.base_path 可覆盖）。 */
  readonly default_base_path: string;
  readonly authorization: {
    /** rbac_permission_codes：实体 × 操作权限码；access_levels：匿名 / 登录 / 属主三档。 */
    readonly model: "rbac_permission_codes" | "access_levels";
    readonly data_scope_hook: boolean;
  };
  readonly audit: {
    /** 写操作审计档（ARCHETYPE.BACKEND.AUDIT 基础档 / 严格档）。 */
    readonly writes: "strict" | "basic";
    readonly retention_days_min: number;
  };
  readonly abuse: {
    readonly rate_limit: "per_user" | "per_ip_and_user";
    readonly max_page_size: number;
  };
  readonly pagination: {
    /** ARCHETYPE.API.PAGINATION 三批准模式之一。 */
    readonly mode: "OFFSET" | "KEYSET";
    readonly default_page_size: number;
    /** opt_in：实体可在 exposure 里开启总数；never：不返回总数。 */
    readonly total_count: "opt_in" | "never";
  };
  readonly caching: {
    readonly api_default: "no_store" | "public_max_age_for_anonymous_reads";
  };
  readonly management: {
    /** Actuator 独立管理端口。 */
    readonly port: number;
    /** internal = 绑内网 / 运维网地址；loopback = 只绑 127.0.0.1。 */
    readonly bind: "internal" | "loopback";
  };
  readonly frontend: {
    readonly ui: "ant-design-vue" | "vant";
    readonly form_factor: "desktop_dense" | "mobile_first";
  };
  readonly sources: readonly SurfaceProfileSource[];
}

export const SURFACE_PROFILES: Readonly<Record<ScaffoldSurfaceKey, SurfaceProfile>> = {
  admin: {
    key: "admin",
    title_zh: "管理侧（内网 / B 端）",
    audience_zh: "员工、运营、客服；数十到数千人，长时间在线录入、审核、查询",
    network_zh: "内网或零信任接入代理，独立域名，不对公网暴露；内网只是额外一层，不替代认证授权",
    default_base_path: "/admin/api/v1",
    authorization: { model: "rbac_permission_codes", data_scope_hook: true },
    audit: { writes: "strict", retention_days_min: 180 },
    abuse: { rate_limit: "per_user", max_page_size: 200 },
    pagination: { mode: "OFFSET", default_page_size: 20, total_count: "opt_in" },
    caching: { api_default: "no_store" },
    management: { port: 8081, bind: "internal" },
    frontend: { ui: "ant-design-vue", form_factor: "desktop_dense" },
    sources: [
      { url: NIST_800_207, supports_zh: "不按网络位置授予隐式信任：内网照样每个接口认证授权" },
      { url: OWASP_API_2023, supports_zh: "API5 功能级授权：每个端点生成权限码" },
      { url: CYBERSECURITY_LAW, supports_zh: "网络安全法第二十一条：网络日志留存不少于六个月" },
      { url: SPRING_BOOT_MANAGEMENT, supports_zh: "管理端点独立端口并绑内网 / 运维网地址" },
    ],
  },
  public: {
    key: "public",
    title_zh: "用户侧（外网 / C 端）",
    audience_zh: "公众；可达百万级，大量匿名浏览、碎片化访问",
    network_zh: "公网经 CDN、WAF、API 网关进入；数据库只在私网；管理功能不在本应用里生成",
    default_base_path: "/api/v1",
    authorization: { model: "access_levels", data_scope_hook: false },
    audit: { writes: "basic", retention_days_min: 180 },
    abuse: { rate_limit: "per_ip_and_user", max_page_size: 50 },
    pagination: { mode: "KEYSET", default_page_size: 20, total_count: "never" },
    caching: { api_default: "public_max_age_for_anonymous_reads" },
    management: { port: 8082, bind: "loopback" },
    frontend: { ui: "vant", form_factor: "mobile_first" },
    sources: [
      { url: OWASP_API_2023, supports_zh: "API1 属主过滤、API3 公开字段白名单、API4 限流与页长上限、API5 后台功能不进外网应用" },
      { url: PIPL, supports_zh: "个人信息保护法第二十八、二十九、五十一条：敏感个人信息单独同意、分类、加密、去标识化" },
      { url: CYBERSECURITY_LAW, supports_zh: "网络安全法第二十一条：网络日志留存不少于六个月" },
      { url: CORE_WEB_VITALS, supports_zh: "第 75 百分位 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1" },
      { url: SPRING_BOOT_MANAGEMENT, supports_zh: "管理端点只绑 127.0.0.1，不在公网端口暴露" },
    ],
  },
};

/** 字段分级闭包（缺省 internal）：决定能否上用户侧、是否脱敏 / 加密、审计档位。 */
export const FIELD_CLASSIFICATIONS = ["public", "internal", "pii", "sensitive_pii"] as const;
export type FieldClassification = (typeof FIELD_CLASSIFICATIONS)[number];

/** 分级的处理档（研究文档 §6.3 表）。 */
export interface ClassificationTreatment {
  readonly storage: "plain" | "encrypted";
  readonly admin_display: "plain" | "masked";
  readonly public_exposure: "allowed" | "forbidden" | "owner_only";
  readonly logging: "allowed" | "masked" | "forbidden";
  readonly audit: "basic" | "strict";
}

export const CLASSIFICATION_TREATMENTS: Readonly<Record<FieldClassification, ClassificationTreatment>> = {
  public: { storage: "plain", admin_display: "plain", public_exposure: "allowed", logging: "allowed", audit: "basic" },
  internal: { storage: "plain", admin_display: "plain", public_exposure: "forbidden", logging: "allowed", audit: "basic" },
  pii: { storage: "plain", admin_display: "masked", public_exposure: "owner_only", logging: "masked", audit: "strict" },
  sensitive_pii: {
    storage: "encrypted",
    admin_display: "masked",
    public_exposure: "owner_only",
    logging: "forbidden",
    audit: "strict",
  },
};
