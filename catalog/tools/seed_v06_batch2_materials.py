# -*- coding: utf-8 -*-
"""P-v06 批次 2：Frontend 模型 archetype 物料落盘（12 份）。

语义全部锚定联网核实报告（.trellis/tasks/09-02-vnext-prd-v06-governed-substrate/
research/frontend-state-references.md，2026-09-03 官网/规范实抓；FORM_EDIT 校验
状态四值沿批次 1 external-design-references.md 2026-09-02 AntD Form 实抓）：
- STATE_ARCHETYPE 八态族（v0.6.1 §16 逐字八值）：词形/默认档/链序均以 TanStack
  Query v5（5.102.8）/nuqs 2.10.1/XState v5（5.32.6）现行文档实抓为准；
  §17 State Ownership 判定表对应行逐条落进各态 when_to_use/when_not_to_use。
- FRONTEND_ARCHETYPE 三型（§18 逐字）：SPA_LAYERED×MODULAR incompatible 双向登记
  （incompatible 槽首个真实用例）；FEATURE_ORIENTED 承载差异表 #4 的 FSD 现行
  6 有效层（Processes deprecated）/无独立 API 层差异声明。
- FRONTEND_ARCHETYPE.ERROR_TAXONOMY（§21 逐字九分型闭包）：每型绑定四列语义位；
  待裁定两项（CANCELED 第十分型/429 归属，差异表 #8）在 x-research-anchors.note
  在场，本物料保持九分型不扩。
- ASYNC_COMMAND 头号注记（差异表 #7）：PRD「Illegal Transition 必须可表达」在
  XState v5 无对应词形（未匹配事件=静默忽略+state.can() 显式守卫）——物料落
  PRD 语义意图（非法组合经 transition contract 显式声明）+实现绑定注记，差异待
  Owner 裁定。
词形纪律：STATE_*/FRONTEND_* 为 catalog 词形空间（批次 2 PRD：不走 governed
前缀 PR）；id 至少两段 SCREAMING_SNAKE（loadCatalogArchetypes 同一闸）。
token 纪律：物料 core 词面（title/id/summary/semantic 三槽）避开既有 repo 级
resolver 断言的 need token（master/data/主数据/按钮/button/资源/create/update/
delete/select/combobox 等）——分母扩容不改变既有判卷（ADR：批次 2 物料半场
不回退既有集成断言，只同步分母钉版）。
幂等：同输入重跑 byte-stable。
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
OUT = os.path.join(ROOT, "archetypes")
FETCH = "2026-09-03"
# FORM_EDIT 校验状态四值的 AntD 实抓出自批次 1 报告（external-design-references.md，
# 2026-09-02 官网实抓）——日期如实记当日，不冒充本批次实抓。
FETCH_ANTD_FORM = "2026-09-02"

RESEARCH_NOTE_PREFIX = ".trellis/tasks/09-02-vnext-prd-v06-governed-substrate/research/frontend-state-references.md"
PRD_DOC_REF = "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md"

materials = {}

# ============================================================
# STATE_ARCHETYPE 八态族（v0.6.1 §16 逐字八值；layer=PATTERN）
# ============================================================

materials["archetype.state.server_query.json"] = {
    "id": "STATE_ARCHETYPE.SERVER_QUERY",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "服务端查询状态",
    "summary_zh": "远端资源的异步取数状态原型（TanStack Query v5 词形锚定）：数据轴 status 与网络轴 fetchStatus 双轴分离，isPending/isFetching/isLoading 三词形语义各司其职，缓存与后台刷新默认档开箱即用。",
    "semantic": {
        "responsibility": "持有远端取数的缓存、去重与刷新生命周期（stale-while-revalidate），把「有没有数据」与「请求是否进行中」表达为两个正交词轴",
        "when_to_use": "状态的所有权在远端：数据持久化在服务端、经异步 API 获取、可能被他人改动而过期（v0.6.1 §17 判定行「远端资源 → SERVER_QUERY」）——列表/详情/报表取数面默认归位",
        "when_not_to_use": "可分享/可收藏筛选（STATE_ARCHETYPE.URL_FILTER）；未保存表单草稿（STATE_ARCHETYPE.FORM_EDIT）；纯本地交互态（STATE_ARCHETYPE.SELECTION）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "word_form_distinction": {
            "isPending": "数据轴 status==='pending'——尚无任何数据（不等于请求进行中）",
            "isFetching": "网络轴 fetchStatus==='fetching'——queryFn 正在抓取（含后台 refetch，任何 status 下可为 true）",
            "isLoading": "isPending && isFetching——仅「无数据且在抓取」的首次加载词形（v4 isInitialLoading 改名，v5 现行口径）",
        },
        "status_axis": ["pending", "error", "success"],
        "fetch_status_axis": ["fetching", "paused", "idle"],
        "staleTime": 0,
        "gcTime": "5min",
        "retry": 3,
        "structural_sharing": True,
    },
    "forbidden": [
        "单一扁平 loading 布尔同时表达数据有无与请求进行中（v5 拆分双轴）",
        "v4 旧词形：status:'loading' / cacheTime / isInitialLoading",
        "把 isPending 当「请求中」用（应表达为尚无数据）",
    ],
    "x-research-anchors": {
        "note": "TanStack Query v5（npm 5.102.8）双轴模型与 Important Defaults（staleTime 0/gcTime 5min/retry 3/structural sharing）为官网 .md 文档实抓；isPending≠isFetching≠isLoading 三词形区分是 v4→v5 breaking 官方口径（2026-09-03 实抓）",
        "sources": [
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/queries.md", "fetched": FETCH},
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults.md", "fetched": FETCH},
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5.md", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.url_filter.json"] = {
    "id": "STATE_ARCHETYPE.URL_FILTER",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "URL 筛选状态",
    "summary_zh": "以 URL 查询串为事实源的筛选状态原型（nuqs 2.10.1：「the URL is the source of truth」）：筛选/分页/排序/tab 定位写入 URL 后天然可分享、可收藏、刷新保留、回退保留。",
    "semantic": {
        "responsibility": "把「可分享/可收藏/刷新保留/回退保留」四触发条件的筛选状态所有权交给 URL，序列化规则单点",
        "when_to_use": "状态需要通过 URL 分享、收藏、刷新后保留或浏览器回退保留时（v0.6.1 §17 判定行「可分享/可收藏的筛选条件 → URL」）——列表筛选、分页、排序、tab 定位是典型",
        "when_not_to_use": "大对象/不可序列化状态；临时展开/选中（STATE_ARCHETYPE.SELECTION）；高维筛选全量入参会参数爆炸（只放分享者视角关键参数）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "source_of_truth": "URL is the source of truth（nuqs 自我定位）",
        "serialization": "search_params_string",
        "read_only_view_client": True,
        "replace_history_for_typed_input": True,
        "push_history_for_discrete_changes": True,
        "dual_surface_note": "Next.js App Router 双端形态：Client 侧 useSearchParams 只读同步（prerendered 路由须包 Suspense 边界）；Server 侧 Page searchParams prop 为 Promise 异步形态（v15 起，同步访问已标记将废弃）",
    },
    "forbidden": [
        "Server Component 直接调 useSearchParams（Next.js 明确不支持）",
        "prerendered 路由无 Suspense 边界使用 client searchParams hook",
        "绕过序列化规则自造查询串格式（有 nuqs/框架 adapter 时应引用）",
    ],
    "x-research-anchors": {
        "note": "nuqs npm latest 2.10.1 与 GitHub README「the URL is the source of truth」实抓；Next.js 16.3.4 文档 useSearchParams 只读 client 形态与 Page searchParams Promise 双端形态实抓（2026-09-03）",
        "sources": [
            {"url": "https://registry.npmjs.org/nuqs", "fetched": FETCH},
            {"url": "https://nextjs.org/docs/app/api-reference/functions/use-search-params.md", "fetched": FETCH},
            {"url": "https://nextjs.org/docs/app/api-reference/file-conventions/page.md", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.form_edit.json"] = {
    "id": "STATE_ARCHETYPE.FORM_EDIT",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "表单编辑草稿状态",
    "summary_zh": "未保存表单草稿的本地编辑状态原型：字段值、校验状态与脏标记归表单容器持有，不进全局 Store 也不写 URL；校验状态词形按 AntD Form validateStatus 四值锚定。",
    "semantic": {
        "responsibility": "持有未提交草稿的字段值/校验结果/脏标记，提交成功后交出所有权",
        "when_to_use": "未保存表单草稿（v0.6.1 §17 判定行「未保存表单草稿 → FORM」）——编辑抽屉/对话框内草稿、多字段录入面",
        "when_not_to_use": "已提交数据的远端缓存（STATE_ARCHETYPE.SERVER_QUERY）；可分享筛选（STATE_ARCHETYPE.URL_FILTER）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "ownership": "form_container_local",
        "validation_status_words": ["success", "warning", "error", "validating"],
        "validation_status_source": "AntD Form validateStatus 官方四值（external-design-references.md 2026-09-02 正文明抓）",
        "dirty_tracking": "pristine/dirty 二态起点",
    },
    "forbidden": [
        "草稿直写全局 Store（v0.6.1 §17「禁止默认全部放全局 Store」的表单形态）",
        "校验状态自造第五词形（success/warning/error/validating 四值闭包外）",
    ],
    "x-research-anchors": {
        "note": "校验状态四值 success/warning/error/validating 为 AntD Form API 正文明抓（external-design-references.md 对应锚，2026-09-02）；§17 判定行与禁全局 Store 语义为 PRD 事实源（2026-09-03 对照 frontend-state-references.md 差异表 #3 无冲突确认）",
        "sources": [
            {"url": "https://ant.design/components/form", "fetched": FETCH_ANTD_FORM},
            {"url": PRD_DOC_REF + " §17", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.selection.json"] = {
    "id": "STATE_ARCHETYPE.SELECTION",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "临时选中状态",
    "summary_zh": "临时展开/选中类本地交互状态原型：生命周期限于当前视图实例，刷新即失、不入 URL、不进全局 Store——最便宜的所有权归最近持有者。",
    "semantic": {
        "responsibility": "持有视图实例私有的瞬时交互态（行选中/展开/焦点/tab 内高亮）",
        "when_to_use": "临时展开/选中（v0.6.1 §17 判定行「临时展开/选中 → LOCAL_UI」）——组件本地 useState 即默认落点",
        "when_not_to_use": "刷新后需保留的状态（升 STATE_ARCHETYPE.URL_FILTER 或 SERVER_QUERY）；跨页面会话（DOMAIN/SESSION 所有权，§17 判定行「跨页面业务 Session」）；「禁止默认全部放全局 Store」对本态最严格",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {"ownership": "component_local", "persist_scope": "none", "restore_on_refresh": False},
    "forbidden": [
        "把临时选中提升进全局 Store（§17 禁默认全部放全局 Store）",
        "把可分享筛选降格为本地位（应升 STATE_ARCHETYPE.URL_FILTER）",
    ],
    "x-research-anchors": {
        "note": "所有权判定锚 PRD §17 State Ownership Resolver 判定表（2026-09-03 对照 frontend-state-references.md 差异表 #2/#3 无冲突确认）",
        "sources": [{"url": PRD_DOC_REF + " §17", "fetched": FETCH}],
    },
}

materials["archetype.state.async_command.json"] = {
    "id": "STATE_ARCHETYPE.ASYNC_COMMAND",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "异步命令状态机",
    "summary_zh": "以 XState v5 六概念（state/event/transition/guard/actor/input/output）承载的异步命令原型：命令参数经 input 进入，状态经 guarded transition 确定性转移，final state 产出 output；非法组合经 transition contract 显式声明（实现侧绑定 state.can() 守卫位）。",
    "semantic": {
        "responsibility": "把一次异步命令（提交/保存/执行）建模为显式状态机：idle/running/done|error 转移全部声明在案，guard 纯同步布尔",
        "when_to_use": "命令的合法状态转移需要显式契约时（非法组合必须可表达为「未声明的 transition 不存在」）；多步骤异步编排（invoke/spawn actor）",
        "when_not_to_use": "远端取数缓存语义（STATE_ARCHETYPE.SERVER_QUERY）；无需显式转移契约的局部加载布尔",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "vocabulary": ["state", "event", "transition", "guard", "actor", "input", "output"],
        "guard_nature": "pure_synchronous_boolean",
        "guard_style": "serialized_named",
        "transition_determinism": True,
        "unmatched_event": "ignored_state_unchanged",
        "output_semantics": "final_state_only",
    },
    "forbidden": [
        "在 output 语义位放中途产物（output 仅到达 final state 时存在）",
        "直接改 context（immutable，仅 assign 更新）",
        "断言未匹配事件会运行时报错（XState v5 现实是静默忽略+state.can() 为 false——非法组合的表达位是 transition contract 声明与 can() 守卫位）",
    ],
    "x-research-anchors": {
        "note": "【待 Owner 裁定·差异表 #7】PRD「Illegal Transition 必须可表达」在 XState v5（npm 5.32.6）无对应词形：未匹配/未启用事件=「no enabled transition → state does not change」静默忽略，state.can() 显式守卫为唯一查询位。本物料落 PRD 语义意图（非法组合经 transition contract 显式声明）+实现绑定注记 can() 守卫位；是否以治理层概念保留 Illegal Transition 词形待裁定。六概念词形与 guard 序列化命名推荐（reusability+visualization）均为 stately.ai 官方文档 2026-09-03 实抓",
        "sources": [
            {"url": "https://stately.ai/docs/transitions", "fetched": FETCH},
            {"url": "https://stately.ai/docs/guards", "fetched": FETCH},
            {"url": "https://stately.ai/docs/input", "fetched": FETCH},
            {"url": "https://stately.ai/docs/output", "fetched": FETCH},
            {"url": "https://registry.npmjs.org/xstate", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.wizard.json"] = {
    "id": "STATE_ARCHETYPE.WIZARD",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "分步向导状态机",
    "summary_zh": "线性/分支多步流向导原型（XState 六概念承载）：步骤推进建模为嵌套 statechart，next/prev 事件经 guard 把关（如 stepValid），targeted self-transition 重置子状态的官方坑位写入已知风险。",
    "semantic": {
        "responsibility": "多步流程的步骤位置、每步合法性与推进事件的单点声明",
        "when_to_use": "线性/分支多步流（分步创建向导类）——步骤间有顺序与守卫依赖（on: {next: {guard: 'stepValid', target: ...}} 模式，XState 六概念承载）",
        "when_not_to_use": "无顺序依赖的自由表单（STATE_ARCHETYPE.FORM_EDIT）；远端取数（STATE_ARCHETYPE.SERVER_QUERY）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "step_transition": "guarded",
        "child_state_reset_on_targeted_self_transition": True,
        "vocabulary": ["state", "event", "transition", "guard", "actor", "input", "output"],
    },
    "known_risks": [
        "targeted self-transition 重置子状态（只想执行动作保留子状态必须用 targetless transition——官方文档实抓坑位）",
    ],
    "x-research-anchors": {
        "note": "XState v5 嵌套态/self-transition 子状态重置/targetless 语义为 stately.ai transitions/states 页 2026-09-03 实抓（差异表 #1 判定：八值词形可承载、无冲突）",
        "sources": [
            {"url": "https://stately.ai/docs/transitions", "fetched": FETCH},
            {"url": "https://stately.ai/docs/states", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.optimistic_mutation.json"] = {
    "id": "STATE_ARCHETYPE.OPTIMISTIC_MUTATION",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "乐观更新 mutation",
    "summary_zh": "写操作的乐观更新原型（TanStack Query v5 官方链序实抓）：onMutate 取消在飞 refetch→快照→乐观写入→返回快照；onError 回滚；onSettled 无条件 invalidate 并保持 pending 至 refetch 完成。",
    "semantic": {
        "responsibility": "把「先显示后确认」的写路径标准化为五步链序，rollback 与补捞（invalidate）不靠手写自觉",
        "when_to_use": "多处联动感知写结果的 cache 路线（§17「远端资源」判定的写侧）；单处展示的临时项走 variables/isPending 的 UI 路线（免 rollback）——官方「When to use what」决策规则",
        "when_not_to_use": "非远端同步的本地草稿（STATE_ARCHETYPE.FORM_EDIT）；无并发覆盖风险的低频写（直接 invalidate 亦可）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "sequence": ["cancel_inflight_refetch", "snapshot", "optimistic_write", "on_error_rollback", "on_settled_invalidate"],
        "sequence_note": "cancelQueries→getQueryData 快照→setQueryData→onError 回滚→onSettled 无条件 invalidateQueries（return promise 保持 pending 至 refetch 完成）——官方链序原样",
        "invalidate_on_settled": True,
        "await_invalidation": True,
        "dual_route_note": "官方两路线：单处展示用 variables/isPending 的 UI 路线（无需 rollback）；多处联动用 cache 路线（本链序）",
    },
    "forbidden": [
        "跳过 cancelQueries 直接写缓存（在飞 refetch 会覆盖乐观值）",
        "只在 onError invalidate 而 onSettled 缺失（成功路径漏 refetch）",
        "rollback 后不 invalidate",
    ],
    "x-research-anchors": {
        "note": "五步链序与「onSettled 无条件 invalidate+return promise 保持 pending」为 TanStack Query v5 optimistic-updates/mutations 官方文档 2026-09-03 实抓（现行回调签名带 context 尾参）",
        "sources": [
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates.md", "fetched": FETCH},
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/mutations.md", "fetched": FETCH},
        ],
    },
}

materials["archetype.state.background_refresh.json"] = {
    "id": "STATE_ARCHETYPE.BACKGROUND_REFRESH",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "后台刷新状态",
    "summary_zh": "stale-while-revalidate 后台刷新原型（TanStack v5 默认档）：staleTime 0 缓存即换，挂载/窗口聚焦/断线重连三触发自动 refetch；invalidateQueries 标 stale 并对渲染中查询后台补捞。",
    "semantic": {
        "responsibility": "远端缓存的过期判定与自动补捞触发面（mount/window_focus/reconnect 三触发+语义化 invalidation）",
        "when_to_use": "STATE_ARCHETYPE.SERVER_QUERY 承载的远端资源的默认保鲜策略——mutation 后语义化 invalidation（前缀匹配 query key）也在本原型表达",
        "when_not_to_use": "永不刷新的静态参照表（staleTime:'static'——invalidateQueries 对其无效）；仅一次性取数",
    },
    "composition": {"requires": [], "optional": ["STATE_ARCHETYPE.SERVER_QUERY"], "incompatible": []},
    "defaults": {
        "refetch_on": ["mount", "window_focus", "reconnect"],
        "refetch_on_window_focus": True,
        "invalidate_overrides_staleTime": True,
        "invalidate_semantics": "标 stale+渲染中才后台 refetch（前缀匹配/exact:true/predicate）",
    },
    "forbidden": [
        "假设 invalidateQueries 必发即时请求（仅标记 stale，正在渲染才后台 refetch）",
    ],
    "x-research-anchors": {
        "note": "三触发默认与 invalidateQueries「覆盖 staleTime+渲染中才 refetch」语义为 TanStack Query v5 important-defaults/query-invalidation 官方文档 2026-09-03 实抓；与 SERVER_QUERY 经 composition.optional 互链（批次 2 组合链边）",
        "sources": [
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults.md", "fetched": FETCH},
            {"url": "https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation.md", "fetched": FETCH},
        ],
    },
}

# ============================================================
# FRONTEND_ARCHETYPE 三型（v0.6.1 §18 逐字；layer=ARCHETYPE）
# ============================================================

materials["archetype.frontend.spa_layered.json"] = {
    "id": "FRONTEND_ARCHETYPE.SPA_LAYERED",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "分层 SPA 架构原型",
    "summary_zh": "按稳定语义分层的单页应用架构原型：Page/Feature/Domain/API/Shared 五层共同稳定语义（PRD §18 逐字），依赖严格向下，层可选不强制齐备。",
    "semantic": {
        "responsibility": "以五层共同稳定语义承载 SPA 横向切分：页面/用例/领域模型/基础设施/共享件各归其位",
        "when_to_use": "团队按层协作、领域模型复杂度需要独立承载的 SPA（v0.6.1 §18 共同稳定语义五层逐字：Page/Feature/Domain/API/Shared）",
        "when_not_to_use": "按业务特性纵向切分优先的工程（FRONTEND_ARCHETYPE.FEATURE_ORIENTED）；小到无需分层的模块化页面集（FRONTEND_ARCHETYPE.MODULAR——本原型与其互斥）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": ["FRONTEND_ARCHETYPE.MODULAR"]},
    "defaults": {
        "layers_prd": ["Page", "Feature", "Domain", "API", "Shared"],
        "dependency_rule": "strictly_downward",
        "layers_optional_note": "项目不一定需要所有层（§18 逐字）",
        "layer_object_example": "§19 Layer Object：Domain 的 allowed_dependencies=[SHARED]/forbidden_dependencies=[PAGE]/public_api_required=true",
    },
    "forbidden": [
        "Domain 依赖 Page（§19 Layer Object forbidden_dependencies 逐字）",
        "下层 import 上层",
    ],
    "x-research-anchors": {
        "note": "「项目不一定需要所有层」为 PRD §18 逐字；与 FSD「You don't have to use every layer」逐字同向（frontend-state-references.md 题 6/差异表 #4，2026-09-03 实抓）",
        "sources": [
            {"url": PRD_DOC_REF + " §18", "fetched": FETCH},
            {"url": "https://feature-sliced.design/docs/reference/layers", "fetched": FETCH},
        ],
    },
}

materials["archetype.frontend.feature_oriented.json"] = {
    "id": "FRONTEND_ARCHETYPE.FEATURE_ORIENTED",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "特性导向架构原型",
    "summary_zh": "按业务特性纵向切分的架构原型（FSD 现行词形锚定）：App/Pages/Widgets/Features/Entities/Shared 六有效层（Processes 已官方 deprecated），PRD 五稳定语义映射其上，slice 内只能 import 严格下层。",
    "semantic": {
        "responsibility": "以业务特性（feature slice）为第一切分轴，公共面下沉 Shared，实体面独立 Entities",
        "when_to_use": "特性可高内聚切分、跨特性复用需要显式公共 API 门禁的工程（FSD import rule：每层只能依赖严格下层；App/Shared 为 layer=slice 例外）",
        "when_not_to_use": "需要独立 Domain 横向层的分层 SPA（FRONTEND_ARCHETYPE.SPA_LAYERED）；无需层约束的小型页面集（FRONTEND_ARCHETYPE.MODULAR）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "fsd_effective_layers": ["App", "Pages", "Widgets", "Features", "Entities", "Shared"],
        "deprecated_layers": ["Processes"],
        "prd_semantic_mapping": {"Page": "Pages", "Feature": "Features", "Domain": "Entities", "Shared": "Shared"},
        "api_layer_note": "PRD 五语义的 API/Infrastructure 在 FSD 参照下无独立层——api 是各层 segment（entities/api、features/api、shared/api）",
        "widgets_note": "FSD widgets 无 PRD 对应层——本原型下作为 optional 位",
        "import_rule": "slice 内模块只能 import 严格下层的 slice；禁同层互引（FSD 的 @x 显式交叉引用机制仅 Entities 层合法）",
        "public_api": "index_reexports_only",
        "custom_layers": "forbidden",
    },
    "forbidden": [
        "wildcard export（export *）",
        "下层 import 上层",
        "自造新层（FSD：层语义已标准化，不推荐新增）",
    ],
    "x-research-anchors": {
        "note": "【差异表 #4 部分差异】FSD 现行 7 层（Processes deprecated→有效 6 层）、无独立 API 层（api 是 segment）、widgets 无 PRD 对应、app 层 PRD 未纳入——四行声明随物料落位；import rule 严格向下与 Public API「contract+gate」定位（与 PRD §19 public_api_required 同构）为 feature-sliced.design 官方文档（v3 站点）2026-09-03 实抓",
        "sources": [
            {"url": "https://feature-sliced.design/docs/reference/layers", "fetched": FETCH},
            {"url": "https://feature-sliced.design/docs/reference/public-api", "fetched": FETCH},
        ],
    },
}

materials["archetype.frontend.modular.json"] = {
    "id": "FRONTEND_ARCHETYPE.MODULAR",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "模块化架构原型",
    "summary_zh": "无强制分层的模块化架构原型：以页面/模块为自足单元，共享代码显式抽层，规模驱动演进——与 SPA_LAYERED 互斥（incompatible 双向登记）。",
    "semantic": {
        "responsibility": "以自足模块为切分单元承载小型/中型应用，不强制五层语义到位",
        "when_to_use": "页面数量少、领域模型尚未复杂到需要独立 Domain/Feature 承载的工程——先模块化，规模触发再演进分层（「项目不一定需要所有层」的另一极端形态）",
        "when_not_to_use": "需要层依赖约束治理的大型工程（SPA_LAYERED/FEATURE_ORIENTED）——本原型与 SPA_LAYERED 互斥",
    },
    "composition": {"requires": [], "optional": [], "incompatible": ["FRONTEND_ARCHETYPE.SPA_LAYERED"]},
    "defaults": {"layering": "none_required", "shared_extraction": "explicit_only", "evolution": "scale_triggered"},
    "x-research-anchors": {
        "note": "互斥语义为本批次裁定（FRONTEND_ARCHETYPE.SPA_LAYERED×MODULAR incompatible 双向登记——incompatible 槽首个真实用例）；「不必使用所有层」与 FSD「You don't have to use every layer」同向佐证模块化形态合法性（2026-09-03 实抓）",
        "sources": [
            {"url": PRD_DOC_REF + " §18", "fetched": FETCH},
            {"url": "https://feature-sliced.design/docs/reference/layers", "fetched": FETCH},
        ],
    },
}

# ============================================================
# FRONTEND_ARCHETYPE.ERROR_TAXONOMY（v0.6.1 §21 逐字九分型；layer=PATTERN）
# ============================================================

materials["archetype.frontend.error_taxonomy.json"] = {
    "id": "FRONTEND_ARCHETYPE.ERROR_TAXONOMY",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "前端错误分类",
    "summary_zh": "前端错误九分型逐字闭包（PRD §21）：每型绑定呈现/重试/遥测/用户话术四语义位；浏览器原生信号只够两分，细分映射责任在 HTTP Client 适配层。",
    "semantic": {
        "responsibility": "把运行时错误归类为九分型闭包，驱动呈现/重试/遥测/话术四列的确定性处置",
        "when_to_use": "任何触发 HTTP/异步调用的页面组契约错误处置面——错误到分型的映射在 HTTP Client 适配层完成（WHATWG fetch 原生只给 TypeError 与 HTTP status 两分，§21 九分型的映射责任不在浏览器）",
        "when_not_to_use": "非错误态的加载/空态呈现；后端错误信封字段结构本身（v0.6.1 §44 Error Archetype 承载 type/title/status/detail/instance 等成员）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "categories": {
        "TRANSPORT": {
            "presentation_pattern": "error_banner_with_retry",
            "retry_behavior": "retryable_exponential_backoff",
            "telemetry": "error_event_with_network_detail",
            "user_message": "网络连接异常，请稍后重试",
        },
        "AUTHENTICATION": {
            "presentation_pattern": "redirect_to_login",
            "retry_behavior": "never_retry_auto",
            "telemetry": "auth_event_401",
            "user_message": "登录已过期，请重新登录",
        },
        "AUTHORIZATION": {
            "presentation_pattern": "forbidden_page",
            "retry_behavior": "never_retry",
            "telemetry": "authz_event_403",
            "user_message": "没有执行该操作的权限",
        },
        "VALIDATION": {
            "presentation_pattern": "inline_field_error",
            "retry_behavior": "no_retry_fix_input",
            "telemetry": "warn_event_400_422",
            "user_message": "表单内容有误，请按提示修正",
        },
        "BUSINESS": {
            "presentation_pattern": "message_toast",
            "retry_behavior": "no_retry_rule_rejected",
            "telemetry": "business_code_event",
            "user_message": "按业务规则返回的提示（RFC 9457 type URI/extension member 承载——detail 不可机器解析）",
        },
        "CONFLICT": {
            "presentation_pattern": "refresh_or_merge_prompt",
            "retry_behavior": "no_auto_retry_reload_first",
            "telemetry": "conflict_event_409",
            "user_message": "数据已被他人修改，请刷新后重试",
        },
        "TIMEOUT": {
            "presentation_pattern": "timeout_toast_with_retry",
            "retry_behavior": "retryable_bounded",
            "telemetry": "timeout_event",
            "user_message": "请求超时，请重试",
        },
        "OFFLINE": {
            "presentation_pattern": "offline_banner_persistent",
            "retry_behavior": "auto_resume_on_reconnect",
            "telemetry": "offline_event",
            "user_message": "当前离线，恢复网络后自动同步",
        },
        "UNKNOWN": {
            "presentation_pattern": "generic_error_page",
            "retry_behavior": "no_auto_retry",
            "telemetry": "unclassified_event",
            "user_message": "出了点问题，请稍后重试",
        },
    },
    "constraints": [
        "浏览器原生信号只够两分：WHATWG fetch 网络失败 reject TypeError、HTTP 错误状态不 reject（查 Response.status）——TIMEOUT/OFFLINE/AUTHENTICATION 等细分全部依赖 client 适配层信号（axios code/AbortSignal/navigator.onLine/status 映射）",
        "九分型映射责任在 HTTP Client Archetype 层而非浏览器",
        "RFC 9457 about:blank（未给出更具体类型时的缺省）与 UNKNOWN 同构",
    ],
    "x-research-anchors": {
        "note": "【待 Owner 裁定·差异表 #8 两项】①是否补 CANCELED 第十分型（axios ERR_CANCELED/fetch AbortError/TanStack cancelQueries 三处业界共识，retry 语义绝不重试——九分型缺位会把取消误归 UNKNOWN/TRANSPORT）②429 归属（ofetch 默认重试列表含 409/429 视作传输层瞬时错误，与 CONFLICT 语义有张力）——本物料保持九分型不扩，待裁定后走词汇表式修订。WHATWG fetch TypeError/RFC 9457 成员空间/axios error codes 全表/ofetch 重试列表为规范与官方文档 2026-09-03 实抓",
        "sources": [
            {"url": "https://fetch.spec.whatwg.org/", "fetched": FETCH},
            {"url": "https://www.rfc-editor.org/rfc/rfc9457.txt", "fetched": FETCH},
            {"url": "https://axios.rest/pages/advanced/error-handling", "fetched": FETCH},
            {"url": "https://github.com/unjs/ofetch", "fetched": FETCH},
        ],
    },
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, body in materials.items():
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", name, "id=", body["id"])


if __name__ == "__main__":
    main()
