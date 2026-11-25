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
- (c) 运行故障：追加 state/guard-faults.jsonl 的 GUARD_FAULT_OBSERVED。
      治理控制面 / confirmed physical roots 故障 exit 2；其他目标计数并 fail-open。
      unknown protected-root metadata 同样 fail-closed，不把损坏当无绑定。
- 合规写入 ALLOW（exit 0 + stderr 注记）：活跃 execution 的任一 permit
  scope.subject_ids 覆盖映射 id（多 execution / 多 permit 取并集——与
  execution audit judgeMutationScope 的「多路径 × 多 permit 并集面」同判据方向）。
  跨目标聚合语义（W1 R1-0）：多目标取全称——任一 mapped 目标越界即 DENY；
  DENY stderr 枚举全部越界目标（denied 列表持有全量）；unmapped / 无 store /
  无活跃 execution 透传面不参与全称（条件激活语义原样）。

常开控制平面防线（不看有没有活跃 execution，store 在座即生效）：
- 治理控制平面只经 pomaster 命令写：.pomaster/ 下的 state、truth、evidence、executions、runtime、
  traces、production、sources、memory、生成清单 scaffold/generation-manifest.json、讨论的
  state.json / meta.json / decision-graph.json。Edit / Write / MultiEdit / NotebookEdit / apply_patch
  直接写，或 Bash 命令有写意图（重定向、rm / mv / cp 目标、tee、sed -i、truncate、git checkout -- 等）
  落到这些路径 → DENY（exit 2），指路对应命令。读（cat / grep / jq …）照常放行。
- 无活跃 execution 的 source 写入（含脚手架）仅 advisory；不伪造 permit 判卷。

工具面：Claude Code 的 Edit / Write / MultiEdit / NotebookEdit / Bash；Codex 的 apply_patch
（补丁在 tool_input.command，按 *** Add / Update / Delete File 与 *** Move to 行取全部目标）
与 Bash（Codex 的 shell / exec_command 都以 Bash 名义进 hook）。

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
  physical_path/binding_status）；只消费 confirmed 并重探现实，malformed root 元数据
  产生可见故障；derived/stale 不作保护范围授权。路径段镜像
  cli/execution-audit.ts KEYBINDINGS_DIR_RELATIVE（.pomaster/truth/keybindings）——
  Python 侧无法 import TS 单源，漂移由两端测试钉（execution-audit.spec + 本 spec）。

退出码契约（Claude Code hooks）：0 = 放行（stdout/stderr 不阻断）；2 = 阻断工具
调用（stderr 回喂 agent）；其余非零 = 非阻断错误。launcher 仅取 trusted runtime
相邻包 / 外部 PATH，拒绝 target-contained 可执行件和环境入口注入；保护根故障关闭。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import shutil
from datetime import datetime, timezone

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
_fault_root: str | None = None
_fault_target = "<unknown>"

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

# 脚手架受管文件的治理 id 前缀（镜像 packages/cli/src/scaffold-generate.ts
# SCAFFOLD_CANONICAL_PREFIX）。只影响 DENY 的指路呈现，不参与判卷。
SCAFFOLD_CANONICAL_PREFIX = "CAPABILITY.SCAFFOLD."

TOOL_PATH_KEYS = ("file_path", "notebook_path")
BASH_TOOL = "Bash"
PATCH_TOOL = "apply_patch"
SUPPORTED_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit", BASH_TOOL, PATCH_TOOL}

# 治理控制平面（store 根相对 posix 前缀 / 精确路径）：只经 pomaster 命令写，代理不直接编辑。
CONTROL_PLANE_PREFIXES = (
    ".pomaster/state/",
    ".pomaster/truth/",
    ".pomaster/evidence/",
    ".pomaster/executions/",
    ".pomaster/runtime/",
    ".pomaster/traces/",
    ".pomaster/production/",
    ".pomaster/sources/",
    ".pomaster/memory/",
)
CONTROL_PLANE_FILES = (".pomaster/scaffold/generation-manifest.json",)
DISCOVERY_MACHINE_FILES = ("state.json", "meta.json", "decision-graph.json")
DISCOVERY_PREFIX = ".pomaster/discovery/scratchpads/"

# 控制平面各区该用的命令（DENY 指路）。
CONTROL_PLANE_HINTS = (
    (".pomaster/state/authority.json", "授权只由 Owner 经既有治理通路授予，代理不改"),
    (".pomaster/state/permits.json", "`pomaster permit issue / renew / widen`"),
    (".pomaster/state/", "`pomaster maintain <task> --ops <tx>`（治理对象事务）或对应命令"),
    (".pomaster/truth/", "`pomaster maintain <task> --ops <tx>`"),
    (".pomaster/evidence/", "`pomaster record gate-run / claim / verification`、`pomaster plan run`"),
    (".pomaster/executions/", "`pomaster execution begin / attach-permit / handoff / end`"),
    (".pomaster/runtime/", "`pomaster session attach`、`pomaster lock acquire / release`"),
    (".pomaster/scaffold/", "`pomaster scaffold generate`（生成清单只由生成器写）"),
    (DISCOVERY_PREFIX, "`pomaster brainstorm decide / promote`、`pomaster research request / handoff`"),
)

# Bash 写意图：命令词 → 哪些参数是写目标（all = 全部路径参数；last = 最后一个路径参数）。
BASH_WRITE_ALL = {"rm", "rmdir", "unlink", "truncate", "touch", "tee", "shred", "mv", "chmod", "chown"}
BASH_WRITE_LAST = {"cp", "install", "ln", "rsync"}
BASH_INPLACE = {"sed", "perl", "gsed"}
BASH_SCRIPT = {"python", "python3", "node", "ruby", "perl", "deno", "bun"}
BASH_PREFIX_WORDS = {"sudo", "env", "command", "nohup", "time", "xargs"}


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


def patch_targets(patch: str) -> list[str]:
    """apply_patch 补丁正文 → 全部目标路径（Add / Update / Delete File 与 Move to 的目的地）。"""
    targets: list[str] = []
    for line in patch.splitlines():
        match = re.match(r"^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$", line) or re.match(
            r"^\*\*\* Move to: (.+?)\s*$", line
        )
        if match and match.group(1) not in targets:
            targets.append(match.group(1))
    return targets


def _shell_words(segment: str) -> list[str]:
    try:
        import shlex

        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def bash_write_targets(command: str) -> list[str]:
    """Bash 命令里有写意图的目标（重定向目标 + 写类命令的路径参数）。读命令不产目标。"""
    targets: list[str] = []

    def add(raw: str) -> None:
        token = raw.strip().strip("\"'")
        if token and not token.startswith("-") and token not in ("/dev/null", "/dev/stdout", "/dev/stderr") and token not in targets:
            targets.append(token)

    for segment in re.split(r"\|\||&&|;|\n|(?<![>&])\|(?!\|)", command):
        for match in re.finditer(r"(?:^|[^0-9<>&])(?:&>|\d?>>?|>\|)\s*([^\s;&|<>]+)", segment):
            add(match.group(1))
        words = _shell_words(segment)
        while words and (words[0] in BASH_PREFIX_WORDS or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0])):
            words = words[1:]
        if not words:
            continue
        head = os.path.basename(words[0])
        args = [word for word in words[1:] if not word.startswith("-")]
        if head in BASH_WRITE_ALL:
            for word in args:
                add(word)
        elif head in BASH_WRITE_LAST and args:
            add(args[-1])
        elif head in BASH_INPLACE and any(re.match(r"^-[A-Za-z]*i", word) or word.startswith("--in-place") for word in words[1:]):
            for word in args[1:] if head != "perl" else args:
                add(word)
        elif head == "dd":
            for word in words[1:]:
                if word.startswith("of="):
                    add(word[3:])
        elif head == "git" and len(words) > 1 and words[1] in ("checkout", "restore", "rm", "mv", "clean", "apply"):
            for word in args[1:]:
                add(word)
        elif head in BASH_SCRIPT:
            code = " ".join(words[1:])
            if re.search(r"open\([^)]*['\"][wax+]|write_text|write_bytes|writeFileSync|writeFile|appendFile|unlink|rmSync|rename|remove\(|truncate", code):
                for token in re.findall(r"[\w./\\-]*\.pomaster[\w./\\-]*|[\w./\\-]+\.[A-Za-z0-9]+", code):
                    add(token)
    return targets


def control_plane_hint(rel: str) -> str | None:
    """store 相对路径落在治理控制平面 → 指路说明；否则 None。"""
    norm = rel.replace("\\", "/")
    protected = norm.startswith(CONTROL_PLANE_PREFIXES) or norm in CONTROL_PLANE_FILES
    if not protected and norm.startswith(DISCOVERY_PREFIX):
        protected = os.path.basename(norm) in DISCOVERY_MACHINE_FILES
    if not protected:
        return None
    for prefix, hint in CONTROL_PLANE_HINTS:
        if norm == prefix or norm.startswith(prefix):
            return hint
    return "对应的 pomaster 命令"


def bash_path_candidates(command: str) -> list[str]:
    """Bash 命令路径词形粗筛（头注「边界」：只切词不做 shell 语义分析）。"""
    normalized = re.sub(r"[\"'`(){}\[\];|<>&]", " ", command)
    candidates: list[str] = []
    for token in normalized.split():
        token = token.rstrip(".,:!?")
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
    except FileNotFoundError:
        return []  # Missing execution ledger means no active execution.
    except OSError:
        return None  # Unreadable is a fault, not advisory absence.
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
    """Read confirmed physical roots, re-probe reality, and expose malformed metadata."""
    kb_dir = os.path.join(store_root, *KEYBINDINGS_DIR_RELATIVE.split(os.sep))
    try:
        names = sorted(name for name in os.listdir(kb_dir) if name.endswith(".json"))
    except FileNotFoundError:
        return []  # No binding table is honest unmapped state.
    rows: list[dict] = []
    for name in names:
        path = os.path.join(kb_dir, name)
        try:
            with open(path, encoding="utf-8") as handle:
                parsed = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"KEYBINDING row unreadable: {name}: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError(f"KEYBINDING row is not an object: {name}")
        row_id = parsed.get("id")
        binding_class = parsed.get("binding_class")
        canonical_id = parsed.get("canonical_id")
        physical_path = parsed.get("physical_path")
        if binding_class == "contract_operation_to_operationId":
            continue  # operationId is not a physical root.
        if (
            not isinstance(row_id, str)
            or not isinstance(binding_class, str)
            or not isinstance(canonical_id, str)
            or not isinstance(physical_path, str)
            or binding_class not in (BINDING_CLASS_FILE_ANCHOR, BINDING_CLASS_DIR_ANCHOR)
            or not GOVERNED_ID_COARSE.match(canonical_id)
            or not physical_path
        ):
            raise ValueError(f"Malformed KEYBINDING root declaration: {name}")
        if parsed.get("binding_status") != "confirmed":
            continue  # Derived/stale observations cannot establish a protected root.
        probe = parsed.get("probe")
        if not isinstance(probe, dict) or probe.get("result") not in ("matched", "not_probed") or (probe.get("result") == "not_probed" and parsed.get("match_rule") != "manual_confirmed"):
            raise ValueError(f"Invalid confirmed KEYBINDING probe: {name}")
        if os.path.isabs(physical_path) or "\\" in physical_path or ".." in physical_path.split("/"):
            raise ValueError(f"Invalid KEYBINDING root: {name}")
        anchor_path = os.path.join(store_root, physical_path)
        if not path_within(anchor_path, store_root):
            raise ValueError(f"KEYBINDING symlink escapes project: {name}")
        if not (os.path.isdir(anchor_path) if binding_class == BINDING_CLASS_DIR_ANCHOR else os.path.isfile(anchor_path)):
            continue  # Physical reality is re-probed, not inferred from a saved result.
        rows.append(
            {
                "file": name,
                "binding_class": binding_class,
                "canonical_id": canonical_id,
                # 物理锚统一 posix 词形再 normcase（Windows 盘面大小写不敏感）。
                "anchor": os.path.normcase(physical_path).replace("\\", "/"),
            }
        )
    return rows


def map_path_to_ids(rel: str, rows: list[dict]) -> list[str]:
    """store 相对 posix 路径 → 映射 governed id 去重清单（execution-audit 同锚语义）。"""
    rel_norm = os.path.normcase(rel).replace("\\", "/")
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


def path_within(path: str, root: str) -> bool:
    try:
        return os.path.normcase(os.path.commonpath([os.path.realpath(path), os.path.realpath(root)])) == os.path.normcase(os.path.realpath(root))
    except ValueError:
        return False


def resolve_cli_entry(store_root: str) -> str | None:
    """Only trusted runtime-adjacent package assets, then external PATH installations.

    Neither environment overrides nor the candidate store can supply executable code.
    """
    runtime = os.path.dirname(os.path.realpath(__file__))
    package_roots = [os.path.realpath(os.path.join(runtime, "../..")),
                     os.path.realpath(os.path.join(runtime, "../../../")),
                     os.path.realpath(os.path.join(runtime, "../packages/cli"))]
    for package in package_roots:
        if path_within(package, store_root):
            continue
        try:
            with open(os.path.join(package, "package.json"), encoding="utf-8") as handle:
                if json.load(handle).get("name") != "@pomaster/cli":
                    continue
        except (OSError, ValueError, AttributeError):
            continue
        for entry in [os.path.join(package, "dist/bin.js"), os.path.join(package, "bin.js")]:
            if os.path.isfile(entry) and not path_within(entry, store_root):
                return os.path.realpath(entry)
    # Search each external directory independently; a poisoned first PATH entry must not hide a later installation.
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if not directory or path_within(directory, store_root):
            continue
        entry = shutil.which("pomaster", path=directory)
        if entry and not path_within(entry, store_root):
            return os.path.realpath(entry)
    return None


def observe_fault(store_root: str, target: str, reason: str, protected: bool) -> int:
    disposition = "fail_closed" if protected else "fail_open"
    event = {"type": "GUARD_FAULT_OBSERVED", "observed_at": datetime.now(timezone.utc).isoformat(),
             "target": target, "reason": reason, "protected": protected, "disposition": disposition}
    file = os.path.join(store_root, ".pomaster/state/guard-faults.jsonl")
    try:
        if not path_within(file, store_root):
            raise OSError("fault log escapes store")
        with open(file, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError as exc:
        note(f"GUARD_FAULT_LOG_INVALID: cannot persist fault ({exc})")
    note(f"GUARD_FAULT_OBSERVED {disposition}: {target}: {reason}")
    return 2 if protected else 0


def judge_once(
    store_root: str, permit_ref: str, governed_id: str, raw_target: str, tool: str
) -> dict:
    """单发 exec-guard 判卷。返回 {kind: allowed|denied|fault, ...}。"""
    cli_entry = resolve_cli_entry(store_root)
    if cli_entry is None:
        return {
            "kind": "fault",
            "reason": "Trusted package-local/PATH exec-guard launcher unavailable; target artifacts are never executed",
        }
    node = None
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if directory and not path_within(directory, store_root):
            candidate = shutil.which("node", path=directory)
            if candidate and not path_within(candidate, store_root):
                node = candidate
                break
    attempt = {
        "permit_ref": permit_ref,
        "id": governed_id,
        "op": WRITE_OP,
        "context": {"surface": "pretooluse-hook", "tool": tool, "target": raw_target},
    }
    if cli_entry.endswith(".js") and node is None:
        return {"kind": "fault", "reason": "Trusted external node runtime unavailable"}
    cmd = ([node, cli_entry] if cli_entry.endswith(".js") else [cli_entry]) + ["--dir", store_root, "exec-guard", "--attempt", "-", "--json"]
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
    result = envelope.get("result") if isinstance(envelope, dict) else None
    if proc.returncode == 0 and isinstance(result, dict) and envelope.get("ok") is True and result.get("outcome") == "allowed" and result.get("permit_ref") == permit_ref and result.get("attempt") == {"id": governed_id, "op": WRITE_OP}:
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
    """工具入参 → (候选目标原始词形, Bash 命令)。非 Bash = file/notebook_path / 补丁目标。"""
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
    # Codex apply_patch（也可能以 Edit / Write 别名进来）：补丁正文在 tool_input.command。
    for key in ("command", "patch", "input"):
        value = tool_input.get(key)
        if isinstance(value, str) and "*** Begin Patch" in value:
            return patch_targets(value), None
    if tool == PATCH_TOOL:
        return [], None
    for key in TOOL_PATH_KEYS:
        value = tool_input.get(key)
        if isinstance(value, str) and value.strip():
            return [value], None
    return [], None


def write_targets(tool: str, raw_targets: list[str], bash_command: str | None) -> list[str]:
    """确定有写意图的目标：文件工具与补丁 = 全部目标；Bash = 写意图分析出的目标。"""
    if tool == BASH_TOOL:
        if bash_command is None:
            return []
        targets = bash_write_targets(bash_command)
        if "*** Begin Patch" in bash_command:  # 经 shell 调 apply_patch 的老形态
            targets += [target for target in patch_targets(bash_command) if target not in targets]
        return targets
    return list(raw_targets)


def deny_always_on(tool: str, cwd: str, targets: list[str]) -> int | None:
    """常开控制平面写保护；source 写入是否治理仅由下游 execution 判定。"""
    control: list[tuple[str, str]] = []
    for raw in targets:
        absolute = resolve_target(raw, cwd)
        if absolute is None:
            continue
        root = find_store_root(os.path.dirname(absolute) or cwd)
        if root is None:
            continue
        rel = rel_posix(root, absolute)
        if rel is None:
            continue
        hint = control_plane_hint(rel)
        if hint is not None:
            control.append((rel, hint))
            continue
        # Source files, including scaffold files, are advisory when no execution is active.
        # Active execution scope is judged below, never inferred here.
    if control:
        print(f"{STDERR_PREFIX} DENY: 治理控制平面不直接编辑（tool={tool}）", file=sys.stderr)
        for rel, hint in control:
            print(f"  - {rel}：改用 {hint}", file=sys.stderr)
        print(
            "  这些文件是治理事实的单一来源，直接改会绕过判卷与审计。读可以（cat / grep / jq），写只经 pomaster 命令；"
            "确需人工修复请交给 Owner 手动处理。",
            file=sys.stderr,
        )
        return 2
    return None


def main() -> int:
    global _fault_root, _fault_target
    _fault_root = find_store_root(os.getcwd())
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
        if _fault_root:
            return observe_fault(_fault_root, "<unknown>", "Hook input is not JSON; protected target cannot be excluded", True)
        return fail_open("Hook input is not JSON; no initialized store found for fault telemetry")

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
    always_on = deny_always_on(str(tool), cwd, write_targets(str(tool), raw_targets, bash_command))
    if always_on is not None:
        return always_on
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
        _fault_root = store_root
        _fault_target = targets[0] if targets else "<unknown>"
        active = load_active_executions(store_root)
        if active is None:
            try:
                known_rows = load_keybinding_rows(store_root)
                decisions = [observe_fault(store_root, raw, "Execution ledger unreadable", bool(map_path_to_ids(rel_posix(store_root, raw) or "", known_rows)) or (rel_posix(store_root, raw) or "").startswith(".pomaster/")) for raw in targets]
            except Exception as exc:
                decisions = [observe_fault(store_root, raw, f"Execution and binding metadata unreadable: {exc}", True) for raw in targets]
            if 2 in decisions:
                return 2
            continue
        if not active:
            note(
                "ADVISORY: 无活跃 execution（executions/ 档案全封口或缺席）；source edits allowed"
                f"——store={store_root}"
            )
            continue
        try:
            rows = load_keybinding_rows(store_root)
        except Exception as exc:
            for raw in targets:
                observe_fault(store_root, raw, f"Protected root metadata unreadable: {exc}", True)
            return 2
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
                        "store_root": store_root,
                        "target": raw,
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
                    try:
                        verdict = judge_once(store_root, permit_ref, governed_id, raw, str(tool))
                    except Exception as exc:
                        verdict = {"kind": "fault", "reason": f"Guard runtime exception: {exc}"}
                    verdict.update({"store_root": store_root, "target": raw, "protected": True})
                    verdicts.append(verdict)
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
    covered_ids = {(verdict["store_root"], verdict["target"], verdict["id"]) for verdict in allowed}
    # 跨目标聚合 = 全称（后置半）：任一未被任何 permit 覆盖的越界目标 → 整体
    # DENY——同批混合允许/越界命令不得因任一 allowed verdict 提前放行（与
    # execution audit judgeMutationScope 逐路径严格判据对称，消除「judge_once
    # 已返回 denied 又被汇总层丢弃」的语义倒挂）。unmapped / 无 store / 无活跃
    # execution 透传面不产 verdict，天然不参与全称；DENY 优先于 ALLOW 也使混合
    # 批中预算耗尽的部分判卷落 fail-closed 方向。
    out_of_scope = [verdict for verdict in denied if (verdict["store_root"], verdict["target"], verdict["id"]) not in covered_ids]
    # Every fault is disclosed, including mixed allow/fault batches and alternate permits.
    fault_closed = False
    for fault in faults:
        fault_closed = observe_fault(fault["store_root"], fault["target"], fault["reason"], fault["protected"]) == 2 or fault_closed
    if budget_exceeded:
        for root, targets in buckets.items():
            for target in targets:
                fault_closed = observe_fault(root, target, "Guard judgement budget exhausted; batch incompletely assessed", True) == 2 or fault_closed

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
        scaffold_ids = sorted(
            {
                part.strip()
                for verdict in out_of_scope
                for part in str(verdict.get("id") or "").split(",")
                if part.strip().startswith(SCAFFOLD_CANONICAL_PREFIX)
            }
        )
        if scaffold_ids:
            print(
                f"  脚手架生成文件（{', '.join(scaffold_ids)}）：不手改。要改就改 "
                "`.pomaster/scaffold/domain-spec.yaml` → `pomaster scaffold confirm --change <CHANGE-id> "
                "--by human:<owner>` → `pomaster scaffold generate`；业务扩展写在生成器留出的扩展点里。",
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
    if fault_closed:
        return 2
    if allowed:
        hit = allowed[0]
        note(
            f"ALLOW: {hit['id']} op={WRITE_OP} ∈ {hit['permit_ref']}"
            f"（exec-guard allowed；judged={judged_targets} 目标 / {len(verdicts)} 发判卷）"
        )
        return 0
    if faults:
        return 0  # Counted unprotected fault only; protected faults already closed.
    return pass_through("全部目标均为透传面（无 store 树内 mapped 目标）")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # Last-resort fault boundary: never silently allow an unknown protected target.
        if _fault_root:
            sys.exit(observe_fault(_fault_root, _fault_target, f"Hook runtime exception: {type(exc).__name__}: {exc}", True))
        note(f"FAIL-OPEN: no initialized store for runtime fault telemetry: {type(exc).__name__}: {exc}")
        sys.exit(0)
