#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_b7_theme.py —— B7-THEME 物化批（09-05-spec-thematic-reorg 第二阶段；Owner 裁定 D1-D8）。

职责（映射表 research/theme-mapping.md 为唯一映射源；三样板 drafts/ 为方法基线）：
1. 物化 20 份主题文档 → packages/cli/seeds/specs/hard/themes/<slug>.md
   - 17 份由来源协议按三样板同构方法聚合（12 节唯一 H2 骨架、节内「端 → 源编号升序」
     加粗来源行、语言节独立 H2 区逐字节同步 overlay）；
   - T06/B01/F01 从 drafts 定稿迁移（审后动作 1「样板即首批物化件，内容零改动」——
     仅调整：草案声明/取舍说明/来源清单表三块评审面移除、frontmatter 按 D5/D6/D7
     落定、Scope 来源行路径改指 vendor（旧 seeds 相对路径随退役失效）、语言节按
     OQ-8/D8 并入 postgresql/css、尾注按物化后状态改写、映射表引用剥离、草案录入
     误差清洗（hr 家具 / 行首 tab））。
2. 物化聚合清单 → packages/cli/seeds/aggregation-manifest.json（D6：映射表归并关系的
   仓内落位；主题文档 frontmatter 主 seed_source 指向本文件）。
3. 物化导航文档 → packages/cli/seeds/specs/hard/themes/index.md（D2：两 index 合并；
   路由表/激活基线/冲突优先级按主题文档改写承接——非逐字节聚合，改写授权 = D2）。
4. 重写 seeds/manifest.json（删 79 条 FE/BE entry、增 21 条主题/导航 entry；分母
   160 → 102；batch=B7-THEME）。
5. 删除退役文件（D3 直接删除）：seeds/specs/hard/frontend/（46）与 backend/（33）。
6. 全量机器自证：内容行双向零差异 / 语言节 ↔ overlay 逐字节 / x-aggregation 同值锚 /
   H2 骨架 / 新增文本零模态词形 / A1 与清洗词形零命中。

可重放：来源 seed 文件缺席（退役后）时回退 vendor 文件取正文、aggregation-manifest
取 pin；drafts 缺席时从已物化主题文档回读正文。全程幂等。

字节纪律：全部读写走 read_text_lf/write_text_lf（utf-8 + LF，禁 Windows 换行翻译）——
播种件/清单 sha256 与字节 pin 恒 LF 口径。
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SEEDS = REPO / "packages" / "cli" / "seeds"
HARD = SEEDS / "specs" / "hard"
THEMES_DIR = HARD / "themes"
VENDOR_ROOT = REPO.parent / "pomaster" / "components"
TASK_DIR = REPO.parent / ".trellis" / "tasks" / "09-05-spec-thematic-reorg"
AGG_MANIFEST = SEEDS / "aggregation-manifest.json"
SEED_MANIFEST = SEEDS / "manifest.json"
NAV_BODY = REPO / "scripts" / "b7_nav_body.md"

SECTIONS = [
    "Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
    "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership",
    "Change Policy",
]
LANG_H2 = "## 语言与栈节（overlay 资产同步区）"
LANG_BLOCKQUOTE = (
    "> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**"
    "（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、"
    "bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。"
    "x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。"
)
AGG_NOTE_TAIL = (
    "> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列"
    "来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），"
    "零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。"
)
AGG_NOTE_LANG = (
    "文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本"
    "（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。"
)
NO_LANG_NOTE = "> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。"
BATCH = "B7-THEME"
H2_RE = re.compile(r"^## (?!#).+$")
H3_RE = re.compile(r"^### (?!#).+$")
H4_RE = re.compile(r"^#### (?!#).+$")


def read_text_lf(path: Path) -> str:
    """字节级读（utf-8）——禁 universal newline 翻译，sha256/字节 pin 恒 LF 口径。"""
    return Path(path).read_bytes().decode("utf-8")


def write_text_lf(path: Path, text: str) -> None:
    """字节级写（utf-8 + LF）——Windows 上禁 CRLF 翻译（播种件/清单字节纪律）。"""
    Path(path).write_bytes(text.encode("utf-8"))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_frontmatter_fields(text: str) -> dict[str, str]:
    """播种件 frontmatter 的 `key: value` 行浅解析（值含行内注记原样保留）。"""
    if not text.startswith("---\n"):
        return {}
    end = text.index("\n---\n", 4)
    fields: dict[str, str] = {}
    for line in text[4:end].split("\n"):
        idx = line.find(":")
        if idx <= 0:
            continue
        fields[line[:idx].strip()] = line[idx + 1:].strip()
    return fields


def strip_inline_comment(value: str) -> str:
    return value.split("#", 1)[0].strip()


def parse_list_field(raw: str) -> list[str]:
    raw = strip_inline_comment(raw)
    if not raw.startswith("["):
        return []
    inner = raw[raw.index("[") + 1: raw.rindex("]")]
    return [x.strip() for x in inner.split(",") if x.strip()]


# ---------------------------------------------------------------------------
# 主题定义（映射表 §2/§3 逐文件唯一去向；§4.1/§4.3 + OQ-8 + D8 语言节挂点）
# ---------------------------------------------------------------------------

def fe(n: int) -> tuple[str, int]:
    return ("frontend", n)


def be(n: int) -> tuple[str, int]:
    return ("backend", n)


THEMES = [
    dict(slug="architecture-and-module-boundaries", h1="架构与模块边界", code="T00", end="cross",
         sources=[fe(9), be(1), be(2), be(3), be(4)], lang=[]),
    dict(slug="task-governance-and-acceptance", h1="任务治理与验收", code="T01", end="cross",
         sources=[fe(1), fe(3), fe(6), fe(8), be(5), be(7), be(8), be(9)], lang=[]),
    dict(slug="ai-generated-code", h1="AI 生成代码", code="T02", end="cross",
         sources=[fe(2), be(6)], lang=[]),
    dict(slug="security", h1="安全", code="T03", end="cross",
         sources=[fe(4), be(10)], lang=[]),
    dict(slug="environment-and-configuration", h1="环境与配置", code="T04", end="cross",
         sources=[fe(5), be(11)],
         lang=[("spring-boot", "primary")],
         absence="> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。"),
    dict(slug="engineering-toolchain-and-dependencies", h1="工程工具链与依赖", code="T05",
         end="cross",
         sources=[fe(10), fe(11), be(26), be(27)],
         lang=[("java", "primary")],
         absence="> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。"),
    dict(slug="testing-and-verification", h1="测试与验证", code="T06", end="cross",
         sources=[fe(20), fe(35), be(28)], lang=[],
         draft="theme-testing-and-verification.md"),
    dict(slug="observability-and-analytics", h1="可观测性与埋点", code="T07", end="cross",
         sources=[fe(34), fe(40), be(29)], lang=[]),
    dict(slug="release-and-feature-flags", h1="发布与开关", code="T08", end="cross",
         sources=[fe(33), fe(36), be(32)], lang=[]),
    dict(slug="privacy-and-data-lifecycle", h1="隐私与数据生命周期", code="T09", end="cross",
         sources=[fe(44), be(13)], lang=[]),
    dict(slug="api-contract-and-error-semantics", h1="API 契约与错误语义", code="T10", end="cross",
         sources=[fe(7), fe(15), fe(16), be(12), be(16)],
         lang=[("spring-mvc", "primary")],
         absence="> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。"),
    dict(slug="permission-and-authorization", h1="权限与鉴权", code="T11", end="cross",
         sources=[fe(17), be(17)], lang=[]),
    dict(slug="performance-and-capacity", h1="性能与容量", code="T12", end="cross",
         sources=[fe(31), be(30)], lang=[]),
    dict(slug="ui-presentation-and-design", h1="UI 呈现与设计", code="F01", end="frontend",
         sources=[fe(21), fe(22), fe(23), fe(24), fe(26), fe(30)],
         lang=[("vue3", "primary"), ("antdesign", "primary"), ("geist", "primary"),
               ("css", "primary")],
         draft="theme-ui-presentation-and-design.md",
         absence=("> **缺席诚实**：react 无 overlay 资产（无研究锚），不落语言节；"
                  "css 体系 overlay 已建并入本区（D8 组合词形 "
                  "scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css）。")),
    dict(slug="page-composition-and-browser-environment", h1="页面构成与浏览器环境",
         code="F02", end="frontend",
         sources=[fe(25), fe(27), fe(28), fe(29), fe(37), fe(41), fe(42)], lang=[]),
    dict(slug="frontend-state-and-client-data", h1="前端状态与客户端数据", code="F03",
         end="frontend",
         sources=[fe(18), fe(19), fe(32), fe(45)], lang=[]),
    dict(slug="value-semantics-and-domain-data", h1="值语义与领域数据", code="F04",
         end="frontend",
         sources=[fe(12), fe(13), fe(14), fe(43)], lang=[]),
    dict(slug="internationalization-and-copywriting", h1="国际化与文案", code="F05",
         end="frontend",
         sources=[fe(38), fe(39)], lang=[]),
    dict(slug="data-and-transactions", h1="数据与事务", code="B01", end="backend",
         sources=[be(14), be(15), be(18), be(19), be(20), be(21), be(22), be(23)],
         lang=[("java", "secondary"), ("jpa", "primary"), ("mybatis", "primary"),
               ("mysql", "primary"), ("postgresql", "primary"), ("redis", "primary")],
         draft="theme-data-and-transactions.md",
         absence=("> **缺席诚实**：php / python（后端语言）与 oracle / sqlserver"
                  "（关系数据库）无 overlay 资产，不落语言节。")),
    dict(slug="integration-and-async-runtime", h1="集成与异步运行时", code="B02", end="backend",
         sources=[be(24), be(25), be(31)],
         lang=[("spring-webflux", "primary"), ("spring-batch", "primary"),
               ("tomcat", "primary"), ("nginx", "primary"),
               ("kubernetes-ingress", "primary"), ("messaging", "primary")]),
]

# overlay slug → (vendor 路径, seeds 资产路径)
OVERLAYS = {
    "java": ("pomaster/components/backend-hard-spec/assets/stacks/java/java-language-overlay.md",
             "stacks/java/java-language-overlay.md"),
    "spring-boot": ("pomaster/components/backend-hard-spec/assets/stacks/spring-boot/spring-boot-application-overlay.md",
                    "stacks/spring-boot/spring-boot-application-overlay.md"),
    "spring-mvc": ("pomaster/components/backend-hard-spec/assets/stacks/spring-mvc/spring-mvc-web-overlay.md",
                   "stacks/spring-mvc/spring-mvc-web-overlay.md"),
    "spring-webflux": ("pomaster/components/backend-hard-spec/assets/stacks/spring-webflux/spring-webflux-reactive-overlay.md",
                       "stacks/spring-webflux/spring-webflux-reactive-overlay.md"),
    "spring-batch": ("pomaster/components/backend-hard-spec/assets/stacks/spring-batch/spring-batch-job-overlay.md",
                     "stacks/spring-batch/spring-batch-job-overlay.md"),
    "tomcat": ("pomaster/components/backend-hard-spec/assets/stacks/tomcat/tomcat-runtime-overlay.md",
               "stacks/tomcat/tomcat-runtime-overlay.md"),
    "nginx": ("pomaster/components/backend-hard-spec/assets/stacks/nginx/nginx-proxy-overlay.md",
              "stacks/nginx/nginx-proxy-overlay.md"),
    "kubernetes-ingress": ("pomaster/components/backend-hard-spec/assets/stacks/kubernetes-ingress/kubernetes-ingress-overlay.md",
                           "stacks/kubernetes-ingress/kubernetes-ingress-overlay.md"),
    "messaging": ("pomaster/components/backend-hard-spec/assets/stacks/messaging/messaging-reliability-overlay.md",
                  "stacks/messaging/messaging-reliability-overlay.md"),
    "jpa": ("pomaster/components/backend-hard-spec/assets/stacks/jpa/jpa-persistence-overlay.md",
            "stacks/jpa/jpa-persistence-overlay.md"),
    "mybatis": ("pomaster/components/backend-hard-spec/assets/stacks/mybatis/mybatis-persistence-overlay.md",
                "stacks/mybatis/mybatis-persistence-overlay.md"),
    "mysql": ("pomaster/components/backend-hard-spec/assets/stacks/mysql/mysql-database-overlay.md",
              "stacks/mysql/mysql-database-overlay.md"),
    "postgresql": ("pomaster/components/backend-hard-spec/assets/stacks/postgresql/postgresql-database-overlay.md",
                   "stacks/postgresql/postgresql-database-overlay.md"),
    "redis": ("pomaster/components/backend-hard-spec/assets/stacks/redis/redis-cache-overlay.md",
              "stacks/redis/redis-cache-overlay.md"),
    "vue3": ("pomaster/components/frontend-hard-spec/assets/stacks/vue3/vue3-framework-overlay.md",
             "stacks/vue3/vue3-framework-overlay.md"),
    "antdesign": ("pomaster/components/frontend-hard-spec/assets/stacks/antdesign/antdesign-ui-overlay.md",
                  "stacks/antdesign/antdesign-ui-overlay.md"),
    "geist": ("pomaster/components/frontend-hard-spec/assets/stacks/geist/geist-design-system-overlay.md",
              "stacks/geist/geist-design-system-overlay.md"),
    "css": ("pomaster/components/frontend-hard-spec/assets/stacks/css/css-system-overlay.md",
            "stacks/css/css-system-overlay.md"),
}


def find_seed_file(end: str, num: int) -> Path | None:
    d = HARD / end
    if not d.exists():
        return None
    prefix = f"{num:02d}-"
    hits = [h for h in sorted(d.glob(prefix + "*.md")) if h.name != "index.md"]
    if len(hits) > 1:
        raise SystemExit(f"source lookup ambiguous: {end}/{prefix}* → {hits}")
    return hits[0] if hits else None


_VENDOR_HINTS: dict[tuple[str, int], str] = {}


def find_vendor_hint(end: str, num: int) -> str:
    """vendor 路径嗅探（退役回退用）：从 aggregation-manifest 反查。"""
    if not _VENDOR_HINTS:
        agg = json.loads(read_text_lf(AGG_MANIFEST))
        for t in agg["themes"]:
            for s in t["sources"]:
                name = s["seed_source"].rsplit("/", 1)[1]
                lane = "frontend" if "frontend-hard-spec" in s["seed_source"] else "backend"
                _VENDOR_HINTS[(lane, int(name[:2]))] = s["seed_source"]
    return _VENDOR_HINTS[(end, num)]


def read_source(end: str, num: int) -> dict:
    """读来源：seed 文件在座优先；退役后回退 vendor 正文 + aggregation-manifest pin。"""
    path = find_seed_file(end, num)
    if path is not None:
        text = read_text_lf(path)
        fm = parse_frontmatter_fields(text)
        body = text[text.index("\n---\n", 4) + 5:]
        return dict(
            end=end, num=num,
            seed_source=strip_inline_comment(fm["seed_source"]),
            sha=fm["seed_source_sha256"].strip().strip('"'),
            seed_version=fm["seed_version"],
            body=body,
            legacy={k: fm.get(k) for k in
                    ("legacy_id", "criticality", "injection_mode", "stages",
                     "triggers", "requires") if k in fm},
        )
    # 退役回退：vendor 正文 + aggregation-manifest pin。
    vendor_hint = find_vendor_hint(end, num)
    vpath = VENDOR_ROOT / Path(*Path(vendor_hint).parts[2:])
    if not vpath.exists():
        raise SystemExit(f"vendor fallback missing: {vpath}")
    text = read_text_lf(vpath)
    if text.startswith("---\n"):
        text = text[text.index("\n---\n", 4) + 5:]
    agg = json.loads(read_text_lf(AGG_MANIFEST))
    pin = None
    for t in agg["themes"]:
        for s in t["sources"]:
            if s["seed_source"] == vendor_hint:
                pin = s
    if pin is None:
        raise SystemExit(f"aggregation pin fallback failed: {end} {num:02d}")
    return dict(end=end, num=num, seed_source=pin["seed_source"], sha=pin["sha256"],
                seed_version=pin["seed_version"], body=text, legacy={})


def split_sections(body: str) -> dict[str, list[str]]:
    """正文按 12 节切分：节内容 = H2 行后到下一任意 H2 行前，去首尾空行，行原样保留。"""
    lines = body.split("\n")
    h2_at = [i for i, ln in enumerate(lines) if H2_RE.match(ln)]
    marks: dict[str, int] = {}
    for i in h2_at:
        m = re.match(r"^## ([A-Za-z -]+)\s*$", lines[i])
        if m and m.group(1) in SECTIONS:
            marks.setdefault(m.group(1), i)
    order = sorted(marks.items(), key=lambda kv: kv[1])
    out: dict[str, list[str]] = {}
    for idx, (name, start) in enumerate(order):
        later = [i for i in h2_at if i > start]
        end_line = later[0] if later else len(lines)
        chunk = lines[start + 1:end_line]
        while chunk and chunk[0].strip() == "":
            chunk.pop(0)
        while chunk and chunk[-1].strip() == "":
            chunk.pop()
        out[name] = chunk
    return out


def split_h2_regions(text: str) -> dict[str, list[str]]:
    """任意 H2 区切分：H2 标题（恰两级）→ 区内行（去首尾空行）。"""
    lines = text.split("\n")
    marks: list[tuple[str, int]] = []
    for i, ln in enumerate(lines):
        if H2_RE.match(ln):
            marks.append((ln, i))
    out: dict[str, list[str]] = {}
    for idx, (title, start) in enumerate(marks):
        end_line = marks[idx + 1][1] if idx + 1 < len(marks) else len(lines)
        chunk = lines[start + 1:end_line]
        while chunk and chunk[0].strip() == "":
            chunk.pop(0)
        while chunk and chunk[-1].strip() == "":
            chunk.pop()
        out[title] = chunk
    return out


def split_h4_regions(text: str) -> dict[str, list[str]]:
    """H4 区切分（语言节小节内 Scope/Rules/Checklist——标题降 2 级后为 ####）。"""
    lines = text.split("\n")
    marks: list[tuple[str, int]] = []
    for i, ln in enumerate(lines):
        if H4_RE.match(ln):
            marks.append((ln, i))
    out: dict[str, list[str]] = {}
    for idx, (title, start) in enumerate(marks):
        end_line = marks[idx + 1][1] if idx + 1 < len(marks) else len(lines)
        chunk = lines[start + 1:end_line]
        while chunk and chunk[0].strip() == "":
            chunk.pop(0)
        while chunk and chunk[-1].strip() == "":
            chunk.pop()
        out[title] = chunk
    return out


def source_title(end: str, num: int, body: str) -> str:
    h1 = next(ln[2:].strip() for ln in body.split("\n") if ln.startswith("# "))
    if end == "frontend":
        return f"FE {h1}"          # H1 自带编号前缀（「20 测试协议」→「FE 20 测试协议」）
    return f"BE {num:02d} {h1}"     # BE H1 无编号


def overlay_lang_block(slug: str, theme_code: str, attach: str) -> str:
    """语言节 H3 小节：标题行 + overlay Scope/Rules/Checklist 逐字节（## → ####）。"""
    seed_rel = OVERLAYS[slug][1]
    otext = read_text_lf(HARD / seed_rel)
    obody = otext[otext.index("\n---\n", 4) + 5:]
    lines = obody.split("\n")
    marks = [(i, ln) for i, ln in enumerate(lines) if H2_RE.match(ln)]
    attach_note = "主挂点" if attach == "primary" else "次挂点"
    out = [f"### {slug}（源：{seed_rel} · {theme_code} {attach_note}）", ""]
    for idx, (start, title) in enumerate(marks):
        end_line = marks[idx + 1][0] if idx + 1 < len(marks) else len(lines)
        chunk = lines[start + 1:end_line]
        while chunk and chunk[0].strip() == "":
            chunk.pop(0)
        while chunk and chunk[-1].strip() == "":
            chunk.pop()
        out.append("#### " + title[3:].strip())
        out.append("")
        out.extend(chunk)
        out.append("")
    while out and out[-1].strip() == "":
        out.pop()
    return "\n".join(out) + "\n"


def read_draft(name: str) -> str | None:
    p = TASK_DIR / "drafts" / name
    return read_text_lf(p) if p.exists() else None


def draft_body_from_theme_doc(slug: str) -> str:
    """drafts 缺席时从已物化文档回读 12 节 + 语言节区（重放兜底）。"""
    text = read_text_lf(THEMES_DIR / f"{slug}.md")
    return text[text.index("\n## Scope\n", 4) + 1:]


def draft_transform(theme: dict) -> str:
    """T06/B01/F01 定稿迁移：取草案 12 节 + 语言节区，套用物化调整，返回正文。"""
    draft = read_draft(theme["draft"])
    if draft is not None:
        body = draft[draft.index("\n## Scope\n", 4) + 1:]
    else:
        body = draft_body_from_theme_doc(theme["slug"])
    rep: list[tuple[str, str]] = []

    # Scope 来源行路径：旧 seeds 相对路径 → vendor 权威路径（D6 同值锚；旧路径随 D3 退役失效）。
    for (end, num) in theme["sources"]:
        src = read_source(end, num)
        pat = re.compile(r"（(?:frontend|backend)/" + f"{num:02d}-[^）]*\\.md）")
        hit = pat.findall(body)
        if len(hit) != 1:
            raise SystemExit(f"draft scope path anchor not unique: {theme['slug']} {num:02d} → {hit}")
        rep.append((hit[0], f"（{src['seed_source']}）"))

    if theme["slug"] == "testing-and-verification":
        rep.append((
            "> **语言节**：本主题无语言节（无 overlay 挂点；测试类语言/工具 overlay 资产不存在，"
            "缺席诚实——映射表 §4.2）。\n> **同步关系**：本样板全部内容为通用节聚合"
            "（来源见 frontmatter x-aggregation 与逐节来源行），语言节同步纪律的样板验证见样板 2/3。",
            NO_LANG_NOTE,
        ))
    if theme["slug"] == "data-and-transactions":
        rep.append(("本区随同步（映射表 §4.3 纪律 1/2）。", "本区随同步。"))
        rep.append((
            "> **缺席诚实**：php / python 无 overlay 资产（无研究锚），不落语言节"
            "（映射表 §4.2、OQ-7）；物化时 postgresql 节并入（OQ-8）。",
            theme["absence"],
        ))
        # OQ-8：postgresql 语言节并入（映射表 §4.1 顺序：mysql 之后、redis 之前）。
        pg = overlay_lang_block("postgresql", theme["code"], "primary")
        rep.append(("### redis（源：stacks/redis/redis-cache-overlay.md · B01 主挂点）",
                    pg + "\n### redis（源：stacks/redis/redis-cache-overlay.md · B01 主挂点）"))
    if theme["slug"] == "ui-presentation-and-design":
        rep.append(("本区随同步（映射表 §4.3 纪律 1/2）。", "本区随同步。"))
        rep.append(("（跨主题引用随迁，见映射表 §5.3）",
                    "（跨主题引用随迁；重组后指向 T00 架构与模块边界主题文档）"))
        rep.append((
            "> **缺席诚实**：react / css 体系（Tailwind 等）无 overlay 资产（无研究锚或资产 pending），"
            "不落语言节（映射表 §4.2、OQ-7）。",
            theme["absence"],
        ))
        # D8：css 语言节并入（geist 之后、尾注之前）。
        css = overlay_lang_block("css", theme["code"], "primary")
        rep.append(("\n> **缺席诚实**：react", css + "\n> **缺席诚实**：react"))
    for old, new in rep:
        if old not in body:
            raise SystemExit(f"draft transform anchor missing: {theme['slug']} :: {old[:60]}…")
        body = body.replace(old, new, 1)
    # 草案尾部分隔线（--- 家具）随评审尾注区一并移除（生成文档无此家具；仅 T06 在座）。
    sep = "\n\n---\n\n"
    if sep in body:
        if body.count(sep) != 1:
            raise SystemExit(f"draft hr separator not unique: {theme['slug']}")
        body = body.replace(sep, "\n\n", 1)
    # 草案行首制表符误差清洗（F01 FE 21 Contract 行——源无 tab，纯空白保真修正）。
    tab_lines = [ln for ln in body.split("\n") if ln.startswith("\t")]
    if tab_lines:
        body = "\n".join(ln.lstrip("\t") for ln in body.split("\n"))
    return body


def build_generated_body(theme: dict) -> str:
    """17 份新主题文档：三样板同构方法聚合。"""
    sources = [read_source(end, num) for (end, num) in theme["sources"]]
    for s in sources:
        s["title"] = source_title(s["end"], s["num"], s["body"])
        s["sections"] = split_sections(s["body"])
    out: list[str] = [f"# {theme['h1']}", "", AGG_NOTE_TAIL]
    if theme["lang"]:
        out.append(AGG_NOTE_LANG)
    out.append("")
    for sec in SECTIONS:
        blocks = []
        for s in sources:
            content = s["sections"].get(sec, [])
            if not content:
                continue
            if sec == "Scope":
                bold = f"**源：{s['title']}（{s['seed_source']}）**"
            elif sec in ("Non-Scope", "Terms"):
                bold = f"**源：{s['title']}**"
            else:
                bold = f"**源：{s['title']} · §{sec}**"
            blocks.append("\n".join([bold, ""] + content))
        out.append(f"## {sec}")
        out.append("")
        if blocks:
            out.append("\n\n".join(blocks))
            out.append("")
    if theme["lang"]:
        out.append(LANG_H2)
        out.append("")
        out.append(LANG_BLOCKQUOTE)
        out.append("")
        for slug, attach in theme["lang"]:
            out.append(overlay_lang_block(slug, theme["code"], attach))
            out.append("")
        if theme.get("absence"):
            out.append(theme["absence"])
            out.append("")
    else:
        out.append(NO_LANG_NOTE)
        out.append("")
    while out and out[-1].strip() == "":
        out.pop()
    return "\n".join(out) + "\n"


def build_draft_body(theme: dict) -> str:
    body = draft_transform(theme)
    out = [f"# {theme['h1']}", "", AGG_NOTE_TAIL]
    if theme["lang"]:
        out.append(AGG_NOTE_LANG)
    out.append("")
    out.append(body.rstrip() + "\n")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# frontmatter（D5/D6/D7）
# ---------------------------------------------------------------------------

CRIT_ORDER = {"advisory": 0, "standard": 1, "critical": 2}
STAGE_ORDER = ["prepare", "implement", "check", "release"]


def aggregate_legacy(theme: dict, sources: list[dict]) -> dict[str, str]:
    """D7 统一形态：BE 扩展键聚合注记（criticality 取源最高、stages/triggers 取并集）。"""
    legs = [s["legacy"] for s in sources if s["legacy"]]
    crits = [strip_inline_comment(l["criticality"]) for l in legs if l.get("criticality")]
    modes = sorted({strip_inline_comment(l["injection_mode"]) for l in legs if l.get("injection_mode")})
    stages: list[str] = []
    triggers: list[str] = []
    for l in legs:
        for st in parse_list_field(l.get("stages", "[]")):
            if st not in stages:
                stages.append(st)
        for tg in parse_list_field(l.get("triggers", "[]")):
            if tg not in triggers:
                triggers.append(tg)
    stages.sort(key=STAGE_ORDER.index)
    crit = max(crits, key=lambda c: CRIT_ORDER[c]) if crits else None
    if crit is None:
        crit_line = "standard # 聚合注记：来源无 criticality 字段，取中性默认；info 性注记非执行语义"
    else:
        crit_line = f"{crit} # 聚合注记：取源最高；info 性注记非执行语义"
    if not modes:
        mode_line = ("mixed # 聚合注记：来源无 injection_mode 字段（默认基线 + 任务命中激活模型）；"
                     "info 性注记非执行语义")
    elif len(modes) == 1:
        mode_line = f"{modes[0]} # 聚合注记：来源同值；info 性注记非执行语义"
    else:
        mode_line = "mixed # 聚合注记：来源值混合；info 性注记非执行语义"
    stage_line = ("[" + ", ".join(stages) + "] # 聚合注记：来源 stages 并集；info 性注记非执行语义"
                  if stages else "[] # 聚合注记：来源无 stages 字段；info 性注记非执行语义")
    trig_line = ("[" + ", ".join(triggers) + "] # 聚合注记：来源 triggers 并集；info 性注记非执行语义"
                 if triggers else "[] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义")
    return dict(criticality=crit_line, injection_mode=mode_line, stages=stage_line,
                triggers=trig_line)


def build_frontmatter(theme: dict, agg_sha: str, sources: list[dict]) -> str:
    end = theme["end"]
    if end == "cross":
        lane = "[frontend, backend]"
    elif end == "frontend":
        lane = "[frontend]"
    else:
        lane = "[backend]"
    agg = aggregate_legacy(theme, sources)
    lines = [
        "---",
        "seed_source: packages/cli/seeds/aggregation-manifest.json",
        # 注：sha 值不带引号——装载器 parseFrontmatterPin 取字面行值做双锚比对。
        f"seed_source_sha256: {agg_sha}",
        f"seed_version: {BATCH}",
        f"lane: {lane}",
        "status: CURRENT",
        "authority_scope: mixed_required_and_advisory",
        f"applies_to: {lane}",
        "related_evidence_specs: []",
        "related_tools: []",
        f"legacy_id: theme:{theme['slug']}",
        f"criticality: {agg['criticality']}",
        f"injection_mode: {agg['injection_mode']}",
        f"stages: {agg['stages']}",
        f"triggers: {agg['triggers']}",
        "requires: [] # 聚合注记：来源 requires 并集（全空）",
        "x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）",
    ]
    for s in sources:
        lines.append(f"  - seed_source: {s['seed_source']}")
        lines.append(f"    sha256: {s['sha']}")
        lines.append(f"    seed_version: {s['seed_version']}")
    if theme["lang"]:
        lines.append("x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）")
        for slug, attach in theme["lang"]:
            vendor, seed_rel = OVERLAYS[slug]
            osha = parse_frontmatter_fields(read_text_lf(HARD / seed_rel))["seed_source_sha256"].strip()
            lines.append(f"  - overlay: {vendor}")
            lines.append(f"    sha256: {osha}")
            lines.append(f"    attach: {attach}")
    lines.append("---")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# 聚合清单 / 导航文档
# ---------------------------------------------------------------------------

def build_aggregation_manifest() -> dict:
    themes = []
    for theme in THEMES:
        sources = [read_source(e, n) for (e, n) in theme["sources"]]
        themes.append(dict(
            slug=theme["slug"],
            h1=theme["h1"],
            lane=("[frontend, backend]" if theme["end"] == "cross"
                  else "[frontend]" if theme["end"] == "frontend" else "[backend]"),
            target=f".pomaster/specs/hard/themes/{theme['slug']}.md",
            sources=[dict(seed_source=s["seed_source"], sha256=s["sha"],
                          seed_version=s["seed_version"]) for s in sources],
            language_sections=[dict(
                overlay=OVERLAYS[slug][0],
                sha256=parse_frontmatter_fields(
                    read_text_lf(HARD / OVERLAYS[slug][1]))["seed_source_sha256"].strip(),
                attach=attach,
            ) for (slug, attach) in theme["lang"]],
        ))
    fe_idx = parse_frontmatter_fields(read_text_lf(HARD / "frontend" / "index.md"))
    be_idx = parse_frontmatter_fields(read_text_lf(HARD / "backend" / "index.md"))
    nav = dict(
        slug="index",
        h1="硬规范主题导航",
        target=".pomaster/specs/hard/themes/index.md",
        sources=[
            dict(seed_source=fe_idx["seed_source"], sha256=fe_idx["seed_source_sha256"].strip(),
                 seed_version=fe_idx["seed_version"]),
            dict(seed_source=be_idx["seed_source"], sha256=be_idx["seed_source_sha256"].strip(),
                 seed_version=be_idx["seed_version"]),
        ],
        note=("D2 合并导航文档——路由表/激活基线/冲突优先级按主题文档改写承接（非逐字节聚合；"
              "改写授权 = Owner 裁定 D2/OQ-13 导航层承接）"),
    )
    return dict(
        schema="pomaster.seed-aggregation/1",
        batch=BATCH,
        generated_by=("scripts/seed_b7_theme.py（09-05-spec-thematic-reorg B7-THEME 物化批；"
                      "映射表 .trellis/tasks/09-05-spec-thematic-reorg/research/theme-mapping.md "
                      "的仓内物化落位——D6：本文件为归并关系单一仓内清单，任务侧映射表保持档案不依赖）"),
        themes=themes,
        navigation=nav,
    )


def build_nav_body() -> str:
    return read_text_lf(NAV_BODY)


# ---------------------------------------------------------------------------
# seeds/manifest.json 重写
# ---------------------------------------------------------------------------

def rewrite_seed_manifest(agg: dict, agg_sha: str) -> None:
    doc = json.loads(read_text_lf(SEED_MANIFEST))
    old_entries = doc["entries"]
    dropped = [e for e in old_entries
               if e["asset"].startswith("specs/hard/frontend/")
               or e["asset"].startswith("specs/hard/backend/")]
    kept = [e for e in old_entries
            if not (e["asset"].startswith("specs/hard/frontend/")
                    or e["asset"].startswith("specs/hard/backend/"))]
    new_entries = []
    agg_note = ("B7-THEME 主题聚合（09-05-spec-thematic-reorg Owner 裁定 D1-D8）："
                "{n} 源聚合为单文档（12 节骨架 + 逐节来源行，内容行双向零差异）；"
                "seed_source 指仓内聚合清单 seeds/aggregation-manifest.json（D6），"
                "逐源 vendor pin 见清单 {slug} 条目（sha256 与卡 vendor_pin 同值）")
    for t in agg["themes"]:
        n = len(t["sources"])
        note = agg_note.format(n=n, slug=t["slug"])
        if t["language_sections"]:
            note += f"；语言节 {len(t['language_sections'])} overlay 逐字节同步（R-J）"
        new_entries.append(dict(
            target=t["target"],
            asset=t["target"].removeprefix(".pomaster/"),
            seed_version=BATCH,
            lane=t["lane"].strip("[]").replace(", ", ","),
            source_path="packages/cli/seeds/aggregation-manifest.json",
            source_sha256=agg_sha,
            source_bytes=len(read_text_lf(AGG_MANIFEST).encode("utf-8")),
            porting_notes=[note],
        ))
    nav = agg["navigation"]
    new_entries.append(dict(
        target=nav["target"],
        asset=nav["target"].removeprefix(".pomaster/"),
        seed_version=BATCH,
        lane="frontend,backend",
        source_path="packages/cli/seeds/aggregation-manifest.json",
        source_sha256=agg_sha,
        source_bytes=len(read_text_lf(AGG_MANIFEST).encode("utf-8")),
        porting_notes=[
            "B7-THEME 导航文档（09-05-spec-thematic-reorg 裁定 D2/OQ-1）：原 FE/BE 两份 index "
            "合并为单一主题导航文档；路由表/激活基线/冲突优先级/协议固定结构按主题文档改写承接"
            "（OQ-13 导航层承接；3 张 index 卡锚随迁本文件）；来源 pin 见聚合清单 navigation 条目",
        ],
    ))
    doc["batch"] = BATCH
    batches = doc.get("batches", {})
    for b in ("B6B-1", "B6B-2"):
        batches.pop(b, None)
    batches["B6C"] = sorted(e["target"] for e in kept if e["seed_version"] == "B6C")
    batches[BATCH] = sorted(e["target"] for e in new_entries)
    doc["batches"] = batches
    doc["generated_by"] = (
        "catalog/tools/seed_b6e_evidence.py; B6F 增量=09-05-overlay-asset-batch(manifest 手工增量登记,"
        "sha256 pin 由 seed-manifest.spec 双锚对账); B6G 增量=css 体系 overlay(09-05-spec-thematic-reorg "
        "裁决 D8,manifest 手工增量登记); B7-THEME 增量=scripts/seed_b7_theme.py(09-05-spec-thematic-reorg "
        "第二阶段物化批:FE/BE 79 entry 退役删除(D3)+21 条主题/导航 entry 聚合 pin 形态(D6:source pin 指 "
        "seeds/aggregation-manifest.json,逐源 vendor sha256 在清单与主题 frontmatter x-aggregation 双面在册))"
    )
    doc["denominator"] = dict(
        batch_scope=(
            "B7-THEME（09-05-spec-thematic-reorg 第二阶段，Owner 裁定 D1-D8）：FE 45+index / BE 32+index "
            "79 文件退役删除（D3 直接删除；已安装工作区并存窗口由 doctor/status legacy_specs_present "
            "检出呈现），重组为 20 份主题文档 + 1 份导航文档（themes/ 单目录 21 文件——12 跨端 + 5 前端独占 "
            "+ 2 后端独占；映射表 §2 逐文件唯一去向；内容行双向零差异机器自证）；主题 frontmatter = 9 基键 "
            "+ BE 6 扩展键聚合注记（D7）+ x-aggregation 逐源 sha256（D6，与卡 vendor_pin 同值）+ "
            "x-language-sections 语言节同步源（R-J 资产层唯一权威，注入面为逐字节副本；18 overlay 全挂点"
            "——B01 含 postgresql（OQ-8）、F01 含 css（D8））；导航文档承接两 index 路由表/激活基线/冲突"
            "优先级（D2）；B6c(stacks 28)/B6d/B6e/B6f/B6G 81 条在册——清单合并承载全量分母 102"
        ),
        planted=102,
        planted_total=102,
        batch_new=21,
    )
    doc["seed_semantics"] = doc["seed_semantics"] + (
        ";B7-THEME 起 themes 面（specs/hard/themes 单目录）为聚合文档通路——seed-once 语义不变,"
        "frontmatter = 9 基键 + BE 6 扩展键聚合注记（D7 统一形态,info 性注记非执行语义）+ x-aggregation/"
        "x-language-sections 扩展键（D6 聚合 pin;R-J 语言节资产唯一权威、注入面副本）"
    )
    doc["entries"] = kept + new_entries
    write_text_lf(SEED_MANIFEST, json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(f"manifest rewritten: entries {len(old_entries)} -> {len(doc['entries'])}")


# ---------------------------------------------------------------------------
# 验证
# ---------------------------------------------------------------------------

MODAL = re.compile(r"必须|不得|应当|(?<![A-Za-z])MUST(?![A-Za-z])|(?<![A-Za-z])SHOULD(?![A-Za-z])")
BANNED = ["MINIMAL", "LIGHT", "STANDARD", "finish", "task.py", "Trellis", "GENERATED"]


def verify_theme_doc(theme: dict, text: str, sources: list[dict]) -> None:
    # 1) H2 骨架（恰两级 ##；H3/H4 不入骨架）
    h2s = [ln for ln in text.split("\n") if H2_RE.match(ln)]
    expect = [f"## {s}" for s in SECTIONS] + ([LANG_H2] if theme["lang"] else [])
    if h2s != expect:
        raise SystemExit(f"H2 skeleton mismatch: {theme['slug']}\n{h2s}")
    # 2) 12 节内容行双向零差异（文档侧去来源行/空行后 == 各源节行序列）
    doc_sections = split_sections(text)
    for sec in SECTIONS:
        chunks = []
        for s in sources:
            content = s["sections"].get(sec, [])
            if not content:
                continue
            chunks.append(content)
        doc_lines = doc_sections.get(sec, [])
        # 新增尾注行（语言节缺席注记/缺席诚实注记/样板结构事实注记）不入内容行比对面
        # （均属声明过的「新增文本仅限标题/来源行/注记」面）。
        doc_lines = [ln for ln in doc_lines
                     if not ln.startswith("> **语言节**：")
                     and not ln.startswith("> **缺席诚实**：")
                     and not ln.startswith("> 注（结构事实，非规则）")]
        blocks: list[list[str]] = []
        cur: list[str] | None = None
        for ln in doc_lines:
            if ln.startswith("**源："):
                if cur is not None:
                    blocks.append(cur)
                cur = []
                continue
            if cur is None:
                if ln.strip() == "":
                    continue
                raise SystemExit(
                    f"orphan content before first source line: {theme['slug']} §{sec} :: {ln[:50]}")
            cur.append(ln)
        if cur is not None:
            blocks.append(cur)
        for blk in blocks:
            while blk and blk[0].strip() == "":
                blk.pop(0)
            while blk and blk[-1].strip() == "":
                blk.pop()
        if len(blocks) != len(chunks):
            raise SystemExit(f"content block count drift: {theme['slug']} §{sec} "
                             f"doc={len(blocks)} src={len(chunks)}")
        for i, (doc_blk, src_blk) in enumerate(zip(blocks, chunks)):
            if doc_blk != list(src_blk):
                raise SystemExit(
                    f"content drift: {theme['slug']} §{sec} block {i}\n"
                    f"DOC : {doc_blk[:3]}\nSRC : {list(src_blk)[:3]}")
    # 3) 语言节逐字节（仅标题降 2 级）
    if theme["lang"]:
        regions = split_h2_regions(text)
        lang_region = regions.get(LANG_H2)
        if lang_region is None:
            raise SystemExit(f"language region missing: {theme['slug']}")
        # 尾注（缺席诚实）不属于任何语言小节，剔除后再切 H3。
        llines = [ln for ln in lang_region
                  if not ln.startswith("> **缺席诚实**：")
                  and not ln.startswith("> **语言节**：")]
        h3s = [(i, ln) for i, ln in enumerate(llines) if ln.startswith("### ")]
        for slug, _attach in theme["lang"]:
            start = next((i for i, ln in h3s if ln.startswith(f"### {slug}（源：")), None)
            if start is None:
                raise SystemExit(f"lang H3 missing: {theme['slug']} {slug}")
            end = next((i for i, ln in h3s if i > start), len(llines))
            block = llines[start:end]
            m = re.match(rf"^### {re.escape(slug)}（源：(.+?) · .+）$", llines[start])
            if not m:
                raise SystemExit(f"lang H3 word form mismatch: {theme['slug']} {slug}")
            seed_rel = m.group(1)
            if seed_rel != OVERLAYS[slug][1]:
                raise SystemExit(f"lang H3 path mismatch: {theme['slug']} {slug} → {seed_rel}")
            otext = read_text_lf(HARD / seed_rel)
            obody = otext[otext.index("\n---\n", 4) + 5:]
            osecs = split_h2_regions(obody)
            bsecs = split_h4_regions("\n".join(block))
            if [k.replace("#### ", "## ") for k in bsecs] != list(osecs.keys()):
                raise SystemExit(f"lang sections mismatch: {theme['slug']} {slug}: "
                                 f"{list(bsecs)} vs {list(osecs)}")
            for okey, obody_lines in osecs.items():
                bkey = "#### " + okey[3:]
                if bsecs.get(bkey) != obody_lines:
                    raise SystemExit(f"lang byte drift: {theme['slug']} {slug} §{okey[3:]}")
    # 4) 新增文本（注记/尾注，非来源行）零模态词形 + 全文禁词
    added = [f"# {theme['h1']}", AGG_NOTE_TAIL, AGG_NOTE_LANG]
    if theme.get("absence"):
        added.append(theme["absence"])
    if not theme["lang"]:
        added.append(NO_LANG_NOTE)
    for ln in added:
        if MODAL.search(ln):
            raise SystemExit(f"modal word in added text: {theme['slug']} :: {ln[:60]}")
    for ban in BANNED:
        if ban in text:
            raise SystemExit(f"banned word {ban} in: {theme['slug']}")


def main() -> int:
    # ---- 1) 读全部来源
    sources_cache: dict[tuple[str, int], dict] = {}
    for theme in THEMES:
        for key in theme["sources"]:
            if key not in sources_cache:
                sources_cache[key] = read_source(*key)
    for theme in THEMES:
        for k in theme["sources"]:
            s = sources_cache[k]
            if "title" not in s:
                s["title"] = source_title(s["end"], s["num"], s["body"])
            if "sections" not in s:
                s["sections"] = split_sections(s["body"])

    # ---- 2) 聚合清单（先落盘，取 sha 供 frontmatter 双锚）
    agg = build_aggregation_manifest()
    write_text_lf(AGG_MANIFEST, json.dumps(agg, ensure_ascii=False, indent=2) + "\n")
    agg_sha = sha256_hex(read_text_lf(AGG_MANIFEST))
    print(f"aggregation-manifest written: {len(agg['themes'])} themes + navigation; sha={agg_sha[:16]}")

    # ---- 3) 物化 20 主题文档
    THEMES_DIR.mkdir(parents=True, exist_ok=True)
    bodies: dict[str, str] = {}
    for theme in THEMES:
        srcs = [sources_cache[k] for k in theme["sources"]]
        body = build_draft_body(theme) if theme.get("draft") else build_generated_body(theme)
        fm = build_frontmatter(theme, agg_sha, srcs)
        text = fm + "\n" + body
        write_text_lf(THEMES_DIR / f"{theme['slug']}.md", text)
        bodies[theme["slug"]] = text
        print(f"theme written: {theme['slug']} ({len(text.encode('utf-8'))} bytes)")

    # ---- 4) 导航文档
    navagg = agg["navigation"]["sources"]
    nav_text = (
        "---\n"
        "seed_source: packages/cli/seeds/aggregation-manifest.json\n"
        f"seed_source_sha256: {agg_sha}\n"
        f"seed_version: {BATCH}\n"
        "lane: [frontend, backend]\n"
        "status: CURRENT\n"
        "authority_scope: mixed_required_and_advisory\n"
        "applies_to: [frontend, backend]\n"
        "related_evidence_specs: []\n"
        "related_tools: []\n"
        "x-aggregation: # 合并承接来源（D2；改写授权 = D2/OQ-13 导航层承接，非逐字节聚合）\n"
    )
    for s in navagg:
        nav_text += (f"  - seed_source: {s['seed_source']}\n"
                     f"    sha256: {s['sha256']}\n"
                     f"    seed_version: {s['seed_version']}\n")
    nav_text += "---\n\n" + build_nav_body()
    write_text_lf(THEMES_DIR / "index.md", nav_text)
    print(f"nav written: index.md ({len(nav_text.encode('utf-8'))} bytes)")

    # ---- 5) 验证（物化后全量）
    for theme in THEMES:
        verify_theme_doc(theme, bodies[theme["slug"]],
                         [sources_cache[k] for k in theme["sources"]])
    print("verify: 20 theme docs content-line bidirectional zero-diff OK")

    # ---- 6) manifest 重写 + 退役删除
    rewrite_seed_manifest(agg, agg_sha)
    for end in ("frontend", "backend"):
        d = HARD / end
        if d.exists():
            for f in sorted(d.glob("*")):
                f.unlink()
            d.rmdir()
            print(f"retired dir removed: specs/hard/{end}")
    print("B7-THEME materialization complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
