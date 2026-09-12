#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
exec-guard-hook.py —— PreToolUse 写前拦截（P0-1 Prevention 半边）。

任务锚：.trellis/tasks/09-11-self-hosting-exec-guard/prd.md R2-R4。
本仓自举接线：Claude Code（.claude/settings.json PreToolUse matcher =
Edit|Write|NotebookEdit|Bash）→ 本脚本 → `pomaster exec-guard`（八拍④机器执行点，
packages/cli/src/exec-guard.ts——判卷权威单一实现，本脚本零第二判卷逻辑）→ permit。

三态语义（PRD R2 逐字；全部本地判定、零网络、零交互）：
- (a) 透传放行（exit 0 + stderr 一行注记）：store 未初始化 / 无活跃 execution /
      目标无 KEYBINDING 绑定（unmapped）/ 命令无路径词形。条件激活语义——
      仅在「store 已初始化且存在活跃 execution」时进入判卷，非治理态日常操作不堵。
- (b) DENY（exit 2 + stderr hint 指路正确 permit 面）：活跃 execution 在册 +
      目标经 KEYBINDING 映射到 governed id + exec-guard 判卷非 allow
      （outside_scope / unknown_permit / expired / policy_forbidden），
      或活跃 execution 显式无 permit（permit_ids 空——显式无许可非缺席，
      与 execution audit 空 scope 面同语义：任何映射不可授予 in-scope）。
- (c) fail-open 放行（exit 0 + stderr 显式声明）：判卷器自身故障（CLI 入口缺席 /
      node 缺席 / exec-guard 进程故障 / 判卷系统码 ATTEMPT_MALFORMED·FATAL_*·
      KERNEL_ERROR·NOT_INITIALIZED / store 台账损坏 / 本脚本自身异常）。
      防 hook 把开发流程卡死；放行留下审计线索，由 Detection 半边
      （`pomaster execution audit`，PR #6 ①号切片）兜底复查。
- 合规写入 ALLOW（exit 0 + stderr 注记）：活跃 execution 的任一 permit
  scope.subject_ids 覆盖映射 id（多 execution / 多 permit 取并集——与
  execution audit judgeMutationScope 的「多路径 × 多 permit 并集面」同判据方向）。
  跨目标聚合语义（W1 R1-0）：多目标取全称——任一 mapped 目标越界即 DENY；
  DENY stderr 枚举全部越界目标（denied 列表持有全量）；unmapped / 无 store /
  无活跃 execution 透传面不参与全称（条件激活语义原样）。

边界（PRD Out of Scope，如实标注）：
- Bash matcher 只做路径词形粗筛，不做 shell 语义分析：按空白/引号切词取疑似路径
  token 逐个判卷（op 一律 upsert_object——kernel v0 唯一可放行的写 op，delete 恒
  denied、transition 非文件写语义）；读命令若恰好提及 mapped 路径会误报 DENY，
  属粗筛已知代价；写入语义分析（rm/setter 区分）不做。
- permit 自动签发不做（permit 仍走 Owner / `pomaster permit issue` 既有通路）。
- 活跃 execution 判定 = .pomaster/executions/*.json 中 ended_at 为 null 的档案
  （跨 session 并集；不按 hook session_id 收窄——session_key 绑定是可选字段，
  缺席诚实优先于猜测）。
- KEYBINDING 行镜像 execution-audit.ts 的最小词形（id/binding_class/canonical_id/
  physical_path/binding_status）；malformed 行跳过并 stderr 披露（fail-open 方向，
  结构化披露由 Detection 半边 KEYBINDING_ROW_MALFORMED 承接）。路径段镜像
  cli/execution-audit.ts KEYBINDINGS_DIR_RELATIVE（.pomaster/truth/keybindings）——
  Python 侧无法 import TS 单源，漂移由两端测试钉（execution-audit.spec + 本 spec）。

退出码契约（Claude Code hooks）：0 = 放行（stdout/stderr 不阻断）；2 = 阻断工具
调用（stderr 回喂 agent）；其余非零 = 非阻断错误。本脚本对一切自身异常兜底为
fail-open exit 0——判卷器永不因自身故障阻塞开发流程。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

# Windows 控制台缺省码页（cp936 等）会毁掉 stderr 中文注记——与 session-start.py
# 同款纪律：stderr/stdout 重配置 utf-8（errors=replace 防单字符毁整行）。
if sys.platform.startswith("win"):
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# 常量（镜像面见头注「边界」段）
# ---------------------------------------------------------------------------

STDERR_PREFIX = "[pomaster exec-guard hook]"

STORE_INDEX_RELATIVE = os.path.join(".pomaster", "state", "truth-index.json")
EXECUTIONS_DIR_RELATIVE = os.path.join(".pomaster", "executions")
KEYBINDINGS_DIR_RELATIVE = os.path.join(".pomaster", "truth", "keybindings")

# 八拍④判卷输入 op：kernel WriteAttempt 三值闭包中唯一可被 permit 放行的写语义
# （kernel v0：delete 恒 denied（无 delete 事务通道）；transition_object 是状态
# 迁移语义非文件落笔。Bash 粗筛同用此 op——头注「边界」段）。
WRITE_OP = "upsert_object"

# KEYBINDING binding_class 两类路径锚词形（镜像 @pomaster/schemas 04 schema +
# execution-audit.ts bindingMatchesPath；contract_operation_to_operationId 的
# operationId 锚非文件系统路径，结构性不参与文件映射）。
BINDING_CLASS_FILE_ANCHOR = "capability_to_file"
BINDING_CLASS_DIR_ANCHOR = "page_to_dir"

# governed id 粗文法（SEGMENT.DOT 形态；closed-world 前缀闭包判卷归 exec-guard
# parseGovernedId——此处只拦截明显非 id 的行，不做权威词法）。
GOVERNED_ID_COARSE = re.compile(r"^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$")

# exec-guard 判卷结论码：PERMIT_* 五码 + DENOMINATOR_DELETE_FORBIDDEN 来自
# kernel checkPermit 四态三因（deniedReasonToCode / PERMIT_EXPIRED /
# PERMIT_UNKNOWN）——是真判卷结论，不是判卷器故障。
DENIAL_CODE_PREFIX = "PERMIT_"
DENIAL_CODE_EXTRA = {"DENOMINATOR_DELETE_FORBIDDEN"}

# 单次 exec-guard 子进程超时上界 / 全 hook 预算上界（超时上界 = PRD R2 约束）。
JUDGE_SPAWN_TIMEOUT_SECONDS = 20.0
DEFAULT_DEADLINE_SECONDS = 50.0
DEADLINE_ENV = "POMASTER_HOOK_DEADLINE_SECONDS"
# CLI 入口注入面（默认 = 自举布局 <store_root>/packages/cli/dist/bin.js）。
CLI_ENTRY_ENV = "POMASTER_CLI_ENTRY"

TOOL_PATH_KEYS = ("file_path", "notebook_path")
BASH_TOOL = "Bash"
SUPPORTED_TOOLS = {"Edit", "Write", "NotebookEdit", BASH_TOOL}


# ---------------------------------------------------------------------------
# stderr 注记（一行一注记；审计线索归 Detection 半边兜底复查）
# ---------------------------------------------------------------------------


def note(message: str) -> None:
    print(f"{STDERR_PREFIX} {message}", file=sys.stderr)


def fail_open(reason: str) -> int:
    note(
        f"FAIL-OPEN: {reason}——本次放行不是治理判定；审计兜底 = "
        f"`pomaster execution audit --execution-id <AGX-n> --diff-base <ref>`（Detection 半边）。"
    )
    return 0


def pass_through(reason: str) -> int:
    note(f"pass-through: {reason}（条件激活语义，未进入判卷）")
    return 0


# ---------------------------------------------------------------------------
# 路径解析（跨平台：os.path 为准；比较一律 normcase——Windows 盘面大小写不敏感）
# ---------------------------------------------------------------------------


def find_store_root(start_dir: str) -> str | None:
    """自 start_dir 逐级向上找 .pomaster/state/truth-index.json（最近优先）。"""
    current = os.path.abspath(start_dir)
    while True:
        if os.path.isfile(os.path.join(current, *STORE_INDEX_RELATIVE.split(os.sep))):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def resolve_target(raw: str, cwd: str) -> str | None:
    """工具入参路径词形 → 绝对路径（相对词形锚 payload cwd）。"""
    text = raw.strip()
    if not text:
        return None
    if not os.path.isabs(text) and not re.match(r"^[A-Za-z]:[\\/]", text):
        text = os.path.join(cwd, text)
    return os.path.abspath(text)


def rel_posix(store_root: str, abs_path: str) -> str | None:
    """绝对路径 → store 根相对 posix 词形；不在 store 树内 / 跨盘 → None。"""
    try:
        rel = os.path.relpath(abs_path, store_root)
    except ValueError:
        return None
    if rel.startswith("..") or os.path.isabs(rel):
        return None
    return rel.replace(os.sep, "/")


def bash_path_candidates(command: str) -> list[str]:
    """Bash 命令路径词形粗筛（头注「边界」：只切词不做 shell 语义分析）。"""
    normalized = re.sub(r"[\"'`(){}\[\];|<>&]", " ", command)
    candidates: list[str] = []
    for token in normalized.split():
        token = token.strip(".,:!?")
        if not token or token.startswith("-"):
            continue
        if "://" in token:
            continue
        if "/" in token or "\\" in token or re.search(r"\.[A-Za-z0-9_]+$", token):
            candidates.append(token)
    return candidates


# ---------------------------------------------------------------------------
# store 面：初始化 / 活跃 execution / KEYBINDING 绑定表
# ---------------------------------------------------------------------------


def load_active_executions(store_root: str) -> list[dict] | None:
    """返回 ended_at 为 null 的执行档案列表；台账损坏 → None（判卷器故障信号）。"""
    exec_dir = os.path.join(store_root, *EXECUTIONS_DIR_RELATIVE.split(os.sep))
    try:
        names = sorted(name for name in os.listdir(exec_dir) if name.endswith(".json"))
    except OSError:
        return []  # 目录缺席 = 零档案（无活跃 execution 的合法态）
    active: list[dict] = []
    for name in names:
        path = os.path.join(exec_dir, name)
        try:
            with open(path, encoding="utf-8") as handle:
                record = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            note(f"执行档案不可解析（损坏或手改）：.pomaster/executions/{name}（{exc}）")
            return None
        if not isinstance(record, dict) or not isinstance(record.get("execution_id"), str):
            note(f"执行档案形态非法（execution_id 缺席）：.pomaster/executions/{name}")
            return None
        if record.get("ended_at") is None:
            active.append(record)
    return active


def load_keybinding_rows(store_root: str) -> list[dict]:
    """装载 KEYBINDING 绑定行（最小词形；malformed 行跳过 + stderr 披露）。"""
    kb_dir = os.path.join(store_root, *KEYBINDINGS_DIR_RELATIVE.split(os.sep))
    try:
        names = sorted(name for name in os.listdir(kb_dir) if name.endswith(".json"))
    except OSError:
        return []  # 目录缺席 = 无绑定表（全 unmapped 合法态，与 Detection 半边同语义）
    rows: list[dict] = []
    for name in names:
        path = os.path.join(kb_dir, name)
        try:
            with open(path, encoding="utf-8") as handle:
                parsed = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            note(f"KEYBINDING 行不可解析（跳过该行，fail-open 方向）：{name}（{exc}）")
            continue
        if not isinstance(parsed, dict):
            note(f"KEYBINDING 行非对象（跳过该行）：{name}")
            continue
        row_id = parsed.get("id")
        binding_class = parsed.get("binding_class")
        canonical_id = parsed.get("canonical_id")
        physical_path = parsed.get("physical_path")
        if (
            not isinstance(row_id, str)
            or not isinstance(binding_class, str)
            or not isinstance(canonical_id, str)
            or not isinstance(physical_path, str)
            or binding_class not in (BINDING_CLASS_FILE_ANCHOR, BINDING_CLASS_DIR_ANCHOR)
            or not GOVERNED_ID_COARSE.match(canonical_id)
            or not physical_path
        ):
            note(f"KEYBINDING 行词形不参与文件映射（跳过该行）：{name}")
            continue
        rows.append(
            {
                "file": name,
                "binding_class": binding_class,
                "canonical_id": canonical_id,
                # 物理锚统一 posix 词形再 normcase（Windows 盘面大小写不敏感）。
                "anchor": os.path.normcase(physical_path.replace("\\", "/")),
            }
        )
    return rows


def map_path_to_ids(rel: str, rows: list[dict]) -> list[str]:
    """store 相对 posix 路径 → 映射 governed id 去重清单（execution-audit 同锚语义）。"""
    rel_norm = os.path.normcase(rel)
    ids: list[str] = []
    for row in rows:
        anchor = row["anchor"]
        if row["binding_class"] == BINDING_CLASS_FILE_ANCHOR:
            matched = rel_norm == anchor
        else:  # page_to_dir：路径等于锚或位于锚目录之下
            matched = rel_norm == anchor or rel_norm.startswith(anchor + "/")
        if matched and row["canonical_id"] not in ids:
            ids.append(row["canonical_id"])
    return ids


# ---------------------------------------------------------------------------
# exec-guard 判卷（唯一判卷权威 = CLI exec-guard；本文件零第二判卷逻辑）
# ---------------------------------------------------------------------------


def resolve_cli_entry(store_root: str) -> str | None:
    entry = os.environ.get(CLI_ENTRY_ENV, "").strip()
    if entry:
        return entry if os.path.isfile(entry) else None
    default = os.path.join(store_root, "packages", "cli", "dist", "bin.js")
    return default if os.path.isfile(default) else None


def judge_once(
    store_root: str, permit_ref: str, governed_id: str, raw_target: str, tool: str
) -> dict:
    """单发 exec-guard 判卷。返回 {kind: allowed|denied|fault, ...}。"""
    cli_entry = resolve_cli_entry(store_root)
    if cli_entry is None:
        return {
            "kind": "fault",
            "reason": f"exec-guard CLI 入口缺席（{CLI_ENTRY_ENV} 缺省解析 "
            f"<store_root>/packages/cli/dist/bin.js 均不可用）",
        }
    node = os.environ.get("POMASTER_NODE", "node")
    attempt = {
        "permit_ref": permit_ref,
        "id": governed_id,
        "op": WRITE_OP,
        "context": {"surface": "pretooluse-hook", "tool": tool, "target": raw_target},
    }
    cmd = [node, cli_entry, "--dir", store_root, "exec-guard", "--attempt", "-", "--json"]
    try:
        proc = subprocess.run(
            cmd,
            input=json.dumps(attempt).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=JUDGE_SPAWN_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {"kind": "fault", "reason": f"exec-guard 子进程超时（>{JUDGE_SPAWN_TIMEOUT_SECONDS:.0f}s）"}
    except OSError as exc:
        return {"kind": "fault", "reason": f"exec-guard 子进程无法启动（node/CLI 入口故障）：{exc}"}

    envelope = None
    try:
        envelope = json.loads(proc.stdout.decode("utf-8", errors="replace").strip())
    except json.JSONDecodeError:
        envelope = None
    code = None
    message = None
    hint = None
    if isinstance(envelope, dict) and isinstance(envelope.get("errors"), list) and envelope["errors"]:
        first = envelope["errors"][0]
        if isinstance(first, dict):
            code = first.get("code") if isinstance(first.get("code"), str) else None
            message = first.get("message") if isinstance(first.get("message"), str) else None
            hint = first.get("hint") if isinstance(first.get("hint"), str) else None
    if proc.returncode == 0:
        return {"kind": "allowed", "permit_ref": permit_ref, "id": governed_id}
    if proc.returncode == 1 and code is not None and (
        code.startswith(DENIAL_CODE_PREFIX) or code in DENIAL_CODE_EXTRA
    ):
        return {
            "kind": "denied",
            "permit_ref": permit_ref,
            "id": governed_id,
            "code": code,
            "message": message or "",
            "hint": hint or "",
        }
    return {
        "kind": "fault",
        "reason": f"exec-guard 进程异常（exit={proc.returncode}，code={code}，"
        f"stderr={proc.stderr.decode('utf-8', errors='replace').strip()[:160]}）",
    }


# ---------------------------------------------------------------------------
# 主通路
# ---------------------------------------------------------------------------


def hook_targets(payload: dict) -> tuple[list[str], str | None]:
    """工具入参 → (候选目标原始词形, Bash 命令)。非 Bash = file/notebook_path。"""
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return [], None
    tool = payload.get("tool_name")
    if tool == BASH_TOOL:
        command = tool_input.get("command")
        return (
            bash_path_candidates(command) if isinstance(command, str) else [],
            command if isinstance(command, str) else None,
        )
    for key in TOOL_PATH_KEYS:
        value = tool_input.get(key)
        if isinstance(value, str) and value.strip():
            return [value], None
    return [], None


def main() -> int:
    started = time.monotonic()
    deadline = DEFAULT_DEADLINE_SECONDS
    raw_deadline = os.environ.get(DEADLINE_ENV, "").strip()
    if raw_deadline:
        try:
            deadline = max(1.0, float(raw_deadline))
        except ValueError:
            deadline = DEFAULT_DEADLINE_SECONDS

    payload: dict = {}
    try:
        parsed = json.loads(sys.stdin.read() or "{}")
        if isinstance(parsed, dict):
            payload = parsed
    except json.JSONDecodeError:
        return fail_open("hook 入参 stdin 非 JSON（harness 形态漂移？）——无法定位判卷目标")

    tool = payload.get("tool_name")
    if tool not in SUPPORTED_TOOLS:
        # 非 matcher 工具（防御面）：matcher 与 SUPPORTED_TOOLS 漂移时仍留注记，
        # 禁静默放行（透传态必须有 stderr 注记——审计线索纪律）。
        note(
            f"pass-through: tool={tool} 非 matcher 契约面（settings.json matcher 与 "
            f"SUPPORTED_TOOLS 漂移防御）——未判卷放行"
        )
        return 0
    cwd = payload.get("cwd")
    cwd = cwd if isinstance(cwd, str) and cwd.strip() else os.getcwd()

    raw_targets, bash_command = hook_targets(payload)
    if not raw_targets:
        if tool == BASH_TOOL:
            return pass_through("Bash 命令无路径词形（粗筛零候选）")
        return pass_through("工具入参无路径目标")

    # —— 按 store 根分桶（walk-up 最近优先；无 store 的目标 = 透传面） ——
    buckets: dict[str, list[str]] = {}
    unrooted: list[str] = []
    for raw in raw_targets:
        absolute = resolve_target(raw, cwd)
        if absolute is None:
            continue
        root = find_store_root(os.path.dirname(absolute) or cwd)
        if root is None:
            unrooted.append(raw)
            continue
        buckets.setdefault(root, []).append(absolute)
    if unrooted:
        note(f"pass-through: {len(unrooted)} 个目标不在任何 .pomaster store 树内")

    verdicts: list[dict] = []
    judged_targets = 0
    budget_exceeded = False
    for store_root, targets in buckets.items():
        active = load_active_executions(store_root)
        if active is None:
            return fail_open(f"执行档案台账损坏（{store_root}）——活跃性不可判定")
        if not active:
            note(
                "pass-through: 无活跃 execution（executions/ 档案全封口或缺席）"
                f"——store={store_root}"
            )
            continue
        rows = load_keybinding_rows(store_root)
        budget_exceeded = False
        for raw in targets:
            absolute = resolve_target(raw, cwd)
            if absolute is None:
                continue
            rel = rel_posix(store_root, absolute)
            if rel is None:
                note(f"pass-through: 目标不在 store 树内：{raw}")
                continue
            mapped_ids = map_path_to_ids(rel, rows)
            if not mapped_ids:
                note(
                    f"pass-through: 目标无 KEYBINDING 绑定（unmapped，非违规——审计线索归 "
                    f"execution audit）：{rel}"
                )
                continue
            judged_targets += 1
            permit_refs: list[str] = []
            permitless = False
            for record in active:
                ids = record.get("permit_ids")
                exec_id = record.get("execution_id", "?")
                if not isinstance(ids, list):
                    permitless = True
                    note(f"执行档案 permit_ids 非 list（按显式无 permit 判卷）：{exec_id}")
                    continue
                usable = [ref for ref in ids if isinstance(ref, str) and ref]
                if len(usable) != len(ids):
                    note(
                        f"执行档案 permit_ids 含 {len(ids) - len(usable)} 个非字符串/空条目"
                        f"（不可用条目不构成授权）：{exec_id}"
                    )
                if not usable:
                    permitless = True
                    note(f"活跃 execution 显式无 permit（permit_ids 空或全不可用）：{exec_id}")
                    continue
                for permit_ref in usable:
                    if permit_ref not in permit_refs:
                        permit_refs.append(permit_ref)
            if permitless and not permit_refs:
                verdicts.append(
                    {
                        "kind": "denied",
                        "permit_ref": None,
                        "id": ", ".join(mapped_ids),
                        "code": "EXECUTION_WITHOUT_PERMIT",
                        "message": f"活跃 execution 无在册 permit（permit_ids 空）——显式无许可非缺席：{raw}",
                        "hint": "先 `pomaster permit issue --subject <governed-id> --actor ...` 圈定范围，"
                        "再 `pomaster execution begin --permit-id <PERMIT.*>` 重开执行。",
                    }
                )
                continue
            # 循环不变量：每条 active 档案要么贡献 usable permit_ref，要么置
            # permitless——此处 permit_refs 空必然 permitless，由下方 DENY 支承接。
            for governed_id in mapped_ids:
                for permit_ref in permit_refs:
                    if time.monotonic() - started > deadline:
                        budget_exceeded = True
                        break
                    verdicts.append(
                        judge_once(store_root, permit_ref, governed_id, raw, str(tool))
                    )
                if budget_exceeded:
                    break
            if budget_exceeded:
                break
        if budget_exceeded:
            note(f"判卷预算耗尽（>{deadline:.0f}s）——剩余目标未逐发判卷")
            break

    allowed = [verdict for verdict in verdicts if verdict["kind"] == "allowed"]
    denied = [verdict for verdict in verdicts if verdict["kind"] == "denied"]
    faults = [verdict for verdict in verdicts if verdict["kind"] == "fault"]

    # 目标内 permit 并集归并（W0 裁定 exec-guard-mixed-target.md §3a 精确形态的
    # 前置半）：按 governed id 归并判卷结论——∃ permit 覆盖即该目标 allowed，
    # raw verdict 层的个别 denied 不定罪（钉 allow.multi_permit_union 语义：
    # 全称只作用于目标层，不作用于 raw verdict 层）。
    covered_ids = {verdict["id"] for verdict in allowed}
    # 跨目标聚合 = 全称（后置半）：任一未被任何 permit 覆盖的越界目标 → 整体
    # DENY——同批混合允许/越界命令不得因任一 allowed verdict 提前放行（与
    # execution audit judgeMutationScope 逐路径严格判据对称，消除「judge_once
    # 已返回 denied 又被汇总层丢弃」的语义倒挂）。unmapped / 无 store / 无活跃
    # execution 透传面不产 verdict，天然不参与全称；DENY 优先于 ALLOW 也使混合
    # 批中预算耗尽的部分判卷落 fail-closed 方向。
    out_of_scope = [verdict for verdict in denied if verdict["id"] not in covered_ids]

    if out_of_scope:
        first = out_of_scope[0]
        print(f"{STDERR_PREFIX} DENY: {first['message']}", file=sys.stderr)
        if first.get("code"):
            print(f"  code: {first['code']}", file=sys.stderr)
        if first.get("hint"):
            print(f"  kernel hint: {first['hint']}", file=sys.stderr)
        # 枚举全部越界结论（denied 列表本就持有全量，非仅 denied[0]；同 id 多
        # permit 各自失败的 verdict 逐条呈现——∃permit 覆盖即 allowed 的并集语义
        # 下，在册即该目标对全部 permit 失败的实证）。单 verdict 时 message 已含
        # 目标 id，枚举块免重复。
        if len(out_of_scope) > 1:
            print(
                f"  越界目标枚举（{len(out_of_scope)} 发判卷结论全部越界，跨目标全称聚合）：",
                file=sys.stderr,
            )
            for verdict in out_of_scope:
                print(
                    f"    - id={verdict['id']} code={verdict.get('code') or '-'} "
                    f"permit_ref={verdict.get('permit_ref') or '-'}",
                    file=sys.stderr,
                )
        print(
            "  正确 permit 面：把目标对象纳入范围须回 FRAMEWORK LOCK 重审（D20，不得旁路扩权）——"
            "`pomaster permit issue --subject <governed-id> --actor human:owner` 圈定范围后 "
            "`pomaster execution begin --permit-id <PERMIT.*>` 重开执行；"
            "台账对账：`pomaster permit list --json`。",
            file=sys.stderr,
        )
        print(
            "  事后审计：`pomaster execution audit --execution-id <AGX-n> --diff-base <ref>`。",
            file=sys.stderr,
        )
        return 2
    if allowed:
        hit = allowed[0]
        note(
            f"ALLOW: {hit['id']} op={WRITE_OP} ∈ {hit['permit_ref']}"
            f"（exec-guard allowed；judged={judged_targets} 目标 / {len(verdicts)} 发判卷）"
        )
        return 0
    if faults:
        return fail_open(faults[0]["reason"])
    if budget_exceeded:
        return fail_open("判卷预算耗尽且未取得任何判卷结论")
    return pass_through("全部目标均为透传面（无 store 树内 mapped 目标）")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 —— 自身异常兜底 fail-open（头注三态 (c)）。
        try:
            note(f"FAIL-OPEN: hook 自身异常（{type(exc).__name__}: {exc}）")
        except Exception:
            pass
        sys.exit(0)
