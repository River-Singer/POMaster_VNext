/**
 * scaffold-surfaces.ts —— 脚手架两个部署面的默认档（surface profile，S1-1）。
 *
 * 管理侧 `admin`（内网 / B 端）与用户侧 `public`（外网 / C 端）是两种信任边界，
 * 不是同一套代码换个域名。领域规格逐实体声明在哪个面暴露哪些操作和字段；生成器
 * （S1-2 起）按这里的默认档出地基（安全过滤链、会话、限流、审计、管理端口）与砖。
 *
 * 默认档的每一条都来自研究文档 `.trellis/tasks/11-01-storybook-scaffold/research/
 * surface-profiles.md`，来源锚随档带出（sources），模板不得另立规则。
 *
 * 两条不随面变化的硬纪律：
 * - 浏览器不持有令牌：两侧都是会话 Cookie + CSRF（RFC 10017 推荐的 BFF 形态）；
 * - 内网不等于可信：管理侧照样完整认证、授权、TLS、审计（NIST SP 800-207），
 *   没有「内网免登录」这一档。
 */

/** 部署面闭包：领域规格 surfaces / exposure 的键只能取这两个。 */
export const SCAFFOLD_SURFACE_KEYS = ["admin", "public"] as const;
export type ScaffoldSurfaceKey = (typeof SCAFFOLD_SURFACE_KEYS)[number];

/** 用户侧访问档：匿名 / 登录用户 / 仅属主本人（管理侧恒为 RBAC 权限码，不取这些值）。 */
export const PUBLIC_ACCESS_LEVELS = ["anonymous", "authenticated", "owner"] as const;
export type PublicAccessLevel = (typeof PUBLIC_ACCESS_LEVELS)[number];

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
  readonly authentication: {
    readonly source: "enterprise_oidc" | "customer_identity";
    /** NIST SP 800-63B-4 认证保障级别（默认档）。 */
    readonly assurance: "AAL1" | "AAL2";
    /** required = 每次登录多因素；step_up = 敏感操作时升级。 */
    readonly mfa: "required" | "step_up";
    /** 是否必须提供抗钓鱼认证选项（通行密钥 / WebAuthn）。 */
    readonly phishing_resistant_option: boolean;
  };
  readonly session: {
    /** 无操作超时（分钟）；null = 不强制（「记住我」）。 */
    readonly idle_timeout_minutes: number | null;
    /** 绝对时长（小时）。 */
    readonly absolute_timeout_hours: number;
    readonly cookie_name: string;
    readonly cookie_same_site: "Strict";
    readonly csrf: "spring_security_spa";
  };
  readonly authorization: {
    /** rbac_permission_codes：实体 × 操作权限码；access_levels：匿名 / 登录 / 属主三档。 */
    readonly model: "rbac_permission_codes" | "access_levels";
    readonly data_scope_hook: boolean;
  };
  readonly audit: {
    /** 写操作审计档（ARCHETYPE.BACKEND.AUDIT 基础档 / 严格档）。 */
    readonly writes: "strict" | "basic";
    readonly security_events: true;
    readonly retention_days_min: number;
  };
  readonly abuse: {
    readonly rate_limit: "per_user" | "per_ip_and_user";
    readonly max_page_size: number;
    readonly human_verification_flows: boolean;
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

export const SURFACE_PROFILES: Readonly<Record<ScaffoldSurfaceKey, SurfaceProfile>> = {
  admin: {
    key: "admin",
    title_zh: "管理侧（内网 / B 端）",
    audience_zh: "员工、运营、客服；数十到数千人，长时间在线录入、审核、查询",
    network_zh: "内网或零信任接入代理，独立域名，不对公网暴露；内网只是额外一层，不替代认证授权",
    default_base_path: "/admin/api/v1",
    authentication: {
      source: "enterprise_oidc",
      assurance: "AAL2",
      mfa: "required",
      phishing_resistant_option: true,
    },
    session: {
      idle_timeout_minutes: 30,
      absolute_timeout_hours: 12,
      cookie_name: "__Host-ADMIN_SID",
      cookie_same_site: "Strict",
      csrf: "spring_security_spa",
    },
    authorization: { model: "rbac_permission_codes", data_scope_hook: true },
    audit: { writes: "strict", security_events: true, retention_days_min: 180 },
    abuse: { rate_limit: "per_user", max_page_size: 200, human_verification_flows: false },
    pagination: { mode: "OFFSET", default_page_size: 20, total_count: "opt_in" },
    caching: { api_default: "no_store" },
    management: { port: 8081, bind: "internal" },
    frontend: { ui: "ant-design-vue", form_factor: "desktop_dense" },
    sources: [
      { url: NIST_800_207, supports_zh: "不按网络位置授予隐式信任：内网照样完整认证授权" },
      { url: NIST_800_63B_4, supports_zh: "AAL2 多因素且须提供抗钓鱼选项；AAL2 无操作 ≤ 1 小时、AAL3 绝对 ≤ 12 小时" },
      { url: RFC_10017, supports_zh: "BFF 会话 Cookie：Secure、HttpOnly、SameSite=Strict、__Host- 前缀，必须防 CSRF" },
      { url: SPRING_SECURITY_CSRF, supports_zh: "csrf.spa()：XSRF-TOKEN Cookie / X-XSRF-TOKEN 请求头" },
      { url: DENGBAO_L3, supports_zh: "等保三级：组合鉴别、登录失败处理、超时退出、最小权限与权限分离、审计覆盖每个用户" },
      { url: CYBERSECURITY_LAW, supports_zh: "网络安全法第二十一条：网络日志留存不少于六个月" },
      { url: OWASP_API_2023, supports_zh: "API5 功能级授权：每个端点生成权限码" },
      { url: SPRING_BOOT_MANAGEMENT, supports_zh: "管理端点独立端口并绑内网 / 运维网地址" },
    ],
  },
  public: {
    key: "public",
    title_zh: "用户侧（外网 / C 端）",
    audience_zh: "公众；可达百万级，大量匿名浏览、碎片化访问",
    network_zh: "公网经 CDN、WAF、API 网关进入；数据库只在私网；管理功能不在本应用里生成",
    default_base_path: "/api/v1",
    authentication: {
      source: "customer_identity",
      assurance: "AAL1",
      mfa: "step_up",
      phishing_resistant_option: false,
    },
    session: {
      idle_timeout_minutes: null,
      absolute_timeout_hours: 24 * 30,
      cookie_name: "__Host-PORTAL_SID",
      cookie_same_site: "Strict",
      csrf: "spring_security_spa",
    },
    authorization: { model: "access_levels", data_scope_hook: false },
    audit: { writes: "basic", security_events: true, retention_days_min: 180 },
    abuse: { rate_limit: "per_ip_and_user", max_page_size: 50, human_verification_flows: true },
    pagination: { mode: "KEYSET", default_page_size: 20, total_count: "never" },
    caching: { api_default: "public_max_age_for_anonymous_reads" },
    management: { port: 8082, bind: "loopback" },
    frontend: { ui: "vant", form_factor: "mobile_first" },
    sources: [
      { url: NIST_800_63B_4, supports_zh: "AAL1 绝对时长 ≤ 30 天；敏感操作升级到 AAL2" },
      { url: RFC_10017, supports_zh: "处理个人数据的浏览器应用强烈推荐 BFF，令牌不进浏览器" },
      { url: SPRING_SECURITY_CSRF, supports_zh: "csrf.spa()：XSRF-TOKEN Cookie / X-XSRF-TOKEN 请求头" },
      { url: OWASP_API_2023, supports_zh: "API1 属主过滤、API3 公开字段白名单、API4 限流与页长上限、API6 敏感流程防自动化" },
      { url: PIPL, supports_zh: "个人信息保护法第二十八、二十九、五十一条：敏感个人信息单独同意、分类、加密、去标识化" },
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
