#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
export-legal-advance-parity.py —— 合法推进判卷核跨语言对拍夹具（VNext 优化 V1-3）。

从 pomaster 的 Python 实现（`scripts/legal_advance.py`，契约
`.trellis/spec/pomaster/legal-advance-contract.md`）逐例算出期望值，写成
`packages/kernel/tests/fixtures/legal-advance-parity.json`；
`packages/kernel/tests/legal-advance.spec.ts` 逐例对拍 TS 移植
（`packages/kernel/src/legal-advance.ts`）——返回值与错误文案逐字一致。

用法：
    python3 scripts/export-legal-advance-parity.py \
        --legal-advance <pomaster>/scripts/legal_advance.py \
        [--source-commit <sha>] [--out packages/kernel/tests/fixtures/legal-advance-parity.json]

夹具只含无浮点、无 BMP 外字符的数据：两种语言在这两处的规范化 JSON 会分叉
（vnext-legal-advance §2 头注）。输出确定（键排序 + LF），重跑零 diff。
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "packages/kernel/tests/fixtures/legal-advance-parity.json"
H = lambda tag: hashlib.sha256(tag.encode("utf-8")).hexdigest()  # noqa: E731 —— 固定 hex 生成器


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location("pomaster_legal_advance", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def value_field(value: Any) -> dict[str, Any]:
    """SAMPLE_DOC 只在夹具顶层 `sample_doc` 出现一次，用例以 `value_ref` 引用（控体积）。"""

    return {"value_ref": "sample_doc"} if value is SAMPLE_DOC else {"value": value}


def outcome(fn: Callable[[], Any]) -> dict[str, Any]:
    try:
        return {"result": fn()}
    except ValueError as exc:  # 契约错误面只有 ValueError
        return {"raises": str(exc)}


# ------------------------------------------------------------------ 样本数据

SAMPLE_DOC = {
    "task_id": "TASK-0001",
    "verified_at": "2026-10-01T00:00:00Z",
    "repository_revision": "abc123",
    "review_range": "a..b",
    "maintained_at": "2026-10-02T00:00:00Z",
    "reconciled_at": "2026-10-03T00:00:00Z",
    "blueprint_sha256": H("bp"),
    "source_digest": H("src"),
    "blueprint": {
        "id": "BP-0001",
        "sha256": H("bp-body"),
        "artifact_state": "published",
        "approval_state": "approved",
        "effective_state": "effective",
        "issued_at": "2026-10-04",
        "title": "订单中心",
    },
    "claims": [
        {"id": "CLM-0001", "approval_state": "approved", "task_id": "TASK-0002", "text": "列表分页"},
        {"id": "CLM-0002", "approval_state": "draft", "nested": {"verified_at": "x", "keep": 1}},
    ],
    "provenance": {"working_sources": ["a.md"], "kept": True},
    "proposal_binding": {"sha256": H("proposal"), "path": "p.md"},
    "candidate_openapi": {"sha256": H("oas"), "path": "openapi.yaml"},
    "responsibility_binding": {"path": "r.md", "artifact_sha256": H("resp"), "role": "owner"},
    "source_bindings": {
        "implementation_plan": {"sha256": H("plan"), "path": "plan.md"},
        "blueprint": {"sha256": H("bp2"), "path": "bp.md"},
        "process": {"sha256": H("proc"), "path": "process.md"},
        "uiux": {"sha256": H("uiux"), "path": "uiux.md"},
        "engineering_decisions": {"sha256": H("ed"), "path": "ed.md"},
        "other": {"sha256": H("other"), "path": "other.md"},
    },
    "readiness_dimensions": ["a"],
    "progress": {"done": 3},
    "generated_at": "2026-10-05",
    "provider_tree_sha256": H("tree"),
    "providers": [{"generated_at": "t", "name": "支付"}],
    "unicode": "中文 line\ttab\"quote\\",
    "empty": {},
    "list_of_lists": [[{"task_id": "x", "y": None}], []],
    "flag": False,
    "count": 0,
    "neg": -7,
}

DIGEST_VALUES = [
    None, True, False, 0, -1, 2 ** 53 - 1, "", "中文", "a\u0000b\nc", [], {}, [1, "2", None],
    {"b": 1, "a": {"d": [], "c": "x"}}, {"键": "值", "a": "z", "Z": "y", "_": 1}, SAMPLE_DOC,
]

STRIP_CASES: list[tuple[Any, list[str]]] = [
    (SAMPLE_DOC, []),
    (SAMPLE_DOC, ["**.task_id"]),
    (SAMPLE_DOC, ["blueprint.approval_state"]),
    (SAMPLE_DOC, ["claims[].approval_state"]),
    (SAMPLE_DOC, ["source_bindings.*.sha256"]),
    (SAMPLE_DOC, ["*"]),
    (SAMPLE_DOC, ["**"]),
    (SAMPLE_DOC, ["list_of_lists[][].task_id"]),
    (SAMPLE_DOC, ["**.nested.verified_at", "provenance"]),
    ({"a": {"b": {"c": 1, "d": 2}}, "c": 3}, ["**.c"]),
    ({"a": [1, {"b": 2}], "b": 3}, ["a[].b"]),
    ({"a": [1, {"b": 2}], "b": 3}, ["*.b"]),
    ("scalar", ["a"]),
    ([{"a": 1}, {"a": 2, "b": 3}], ["a"]),
    ([{"a": 1}, {"a": 2, "b": 3}], ["**.a"]),
    ({}, [""]),
    ({}, ["x[]"]),
    ({}, ["a..b"]),
    ({}, ["[].x"]),
    ({}, ["a.[]"]),
]

PROFILE_ERRORS = [("nope", 1), ("frontend-facts", 9), ("bp-blueprint", 0)]

FP_VERSION_CASES = [
    (None, {}),
    (None, {"authority": 1, "facts": 2, "artifact": 1}),
    ({"facts": 3}, {"facts": 2}),
    ({"facts": 2}, {"facts": 2, "artifact": 0}),
    ({}, {"authority": "2"}),
    ({"authority": 2, "facts": 2, "artifact": 2}, {}),
    ({"authority": "x"}, {"authority": 1}),
    (None, {"facts": None}),
]

BOUNDARY_CASES = [
    {"previous_facts": "a", "disk_facts": "a"},
    {"previous_facts": "a", "disk_facts": "a", "raw_equal": False},
    {"previous_facts": "a", "disk_facts": "b"},
    {"previous_facts": "a", "disk_facts": "b", "recomputed_facts": "b"},
    {"previous_facts": "a", "disk_facts": "b", "recomputed_facts": "c"},
    {"previous_facts": None, "disk_facts": None},
    {"previous_facts": None, "disk_facts": "b", "recomputed_facts": None},
]

CHANGE_CASES = [
    {"anchor_facts": "a", "planned_facts": "a", "evidence_supplied": False, "actor_explicit": False, "reason_explicit": False},
    {"anchor_facts": None, "planned_facts": None, "evidence_supplied": True, "actor_explicit": True, "reason_explicit": True},
    {"anchor_facts": "a", "planned_facts": "b", "evidence_supplied": True, "actor_explicit": True, "reason_explicit": True},
    {"anchor_facts": "a", "planned_facts": "b", "evidence_supplied": True, "actor_explicit": True, "reason_explicit": True, "takeover": True},
    {"anchor_facts": "a", "planned_facts": "a", "evidence_supplied": False, "actor_explicit": False, "reason_explicit": False, "takeover": True},
    {"anchor_facts": "a", "planned_facts": "b", "evidence_supplied": True, "actor_explicit": False, "reason_explicit": True},
    {"anchor_facts": "a", "planned_facts": "b", "evidence_supplied": False, "actor_explicit": True, "reason_explicit": True},
]

ACTORS = [None, "", "  ", "agent", "AGENT", " Codex ", "pomaster", "what-bp-should-do", "trellis-task:10-20",
          "unknown", "human:owner", "agent:claude/session-1", "allen", 3]

REJUDGE_CASES: list[tuple[list[dict[str, Any]], dict[str, Any]]] = [
    ([{"gate": "fe.b"}, {"gate": "fe.a", "triggers": ["z", "a"], "blocking": 2, "inherited": 1}], {}),
    ([{"gate": "g1", "result": "UNDECIDABLE"}, {"gate": "g2", "result": "PASS"}], {"changed_paths": ["b", "a", "b"]}),
    ([{"gate": "g1", "result": "DENY"}, {"gate": "g2", "result": "UNDECIDABLE"}], {"rules_version": "rejudge-rules-v1"}),
    ([{"gate": "g1", "findings": [{"id": "F-1"}]}], {}),
    ([{"gate": "g1", "findings_sha256": H("f")}], {}),
    ([{"gate": "g1", "findings_sha256": "", "findings": ["x"]}], {}),
    ([], {}),
    ([{"gate": "g1", "result": "MAYBE"}], {}),
]

ANCHOR_CASES = [
    (None, None),
    ({"authority_sha256": "a", "facts_sha256": "f", "artifact_sha256": "r", "extra": 1}, None),
    ({"facts_sha256": "f"}, {"facts": 2}),
    ({}, {"authority": 3, "facts": 1, "artifact": 2}),
]


def advance_base(la) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    previous_after = {"authority_sha256": H("auth-1"), "facts_sha256": H("facts-1"), "artifact_sha256": H("art-1")}
    after = {"authority_sha256": H("auth-1"), "facts_sha256": H("facts-2"), "artifact_sha256": H("art-2")}
    event = {"actor": "human:owner", "reason": "补录 P2 字段映射的核验结论", "after": after}
    section = la.build_advance(
        basis="explicit-evidence",
        actor="human:owner",
        reason="补录 P2 字段映射的核验结论",
        evidence_refs=["test:tests/test_p2.py::test_mapping", f"docs/p2.md#sha256={H('p2')}"],
        evidence_sha256=H("evidence"),
        old_anchor=la.anchor_of(previous_after),
        new_anchor=la.anchor_of(after),
        affected_ids=["FACT-0002", "CLM-0001"],
        rejudge=la.build_rejudge([{"gate": "fe.reconcile.explicit-evidence"}, {"gate": "fe.facts.snapshot-digest"}]),
    )
    return section, event, previous_after


def set_path(target: dict[str, Any], path: str, value: Any) -> None:
    keys = path.split(".")
    node = target
    for key in keys[:-1]:
        node = node[key]
    if value is DELETE:
        node.pop(keys[-1], None)
    else:
        node[keys[-1]] = value


DELETE = object()

# (name, section mutations, event mutations, previous_after override, lane, previous_fingerprint_versions)
ADVANCE_MUTATIONS: list[tuple[str, dict[str, Any], dict[str, Any]]] = [
    ("good", {}, {}),
    ("schema", {"schema": "pomaster-advance/v0"}, {}),
    ("basis", {"basis": "vibes"}, {}),
    ("basis-missing", {"basis": DELETE}, {}),
    ("actor-mismatch", {"actor": "human:other"}, {}),
    ("actor-blank", {"actor": "  "}, {}),
    ("actor-default", {"actor": "Codex"}, {"actor": "Codex"}),
    ("actor-default-prefix", {"actor": "trellis-task:10-30"}, {"actor": "trellis-task:10-30"}),
    ("reason-mismatch", {"reason": "别的理由"}, {}),
    ("reason-todo", {"reason": "TODO: fill"}, {"reason": "TODO: fill"}),
    ("reason-todo-word", {"reason": "todos are done"}, {"reason": "todos are done"}),
    ("reason-angle", {"reason": "原因 <填写>"}, {"reason": "原因 <填写>"}),
    ("reason-cn", {"reason": "待补充"}, {"reason": "待补充"}),
    ("refs-not-list", {"evidence_refs": "test:x"}, {}),
    ("refs-non-str", {"evidence_refs": ["test:x", 3]}, {}),
    ("refs-empty", {"evidence_refs": []}, {}),
    ("refs-malformed", {"evidence_refs": ["plain", "a#sha256=xyz", "test:", "test: spaced", "it's#bad", "bad\nref", "证据"]}, {}),
    ("refs-good-forms", {"evidence_refs": ["browser:page/1", "command:pnpm test", "runtime:log#1", f"a b/c.md#sha256={H('x')}"]}, {}),
    ("evidence-sha", {"evidence_sha256": "sha256:" + H("evidence")}, {}),
    ("evidence-sha-missing", {"evidence_sha256": DELETE}, {}),
    ("old-anchor-not-object", {"old_anchor": []}, {}),
    ("old-anchor-missing-key", {"old_anchor.facts_sha256": DELETE}, {}),
    ("old-anchor-extra-layer", {"old_anchor.fingerprint_versions": {"facts": 1, "other": 1}}, {}),
    ("old-anchor-mismatch", {"old_anchor.facts_sha256": H("facts-0")}, {}),
    ("old-anchor-mismatch-transition", {"old_anchor.facts_sha256": H("facts-0"),
                                        "transition": {"layer": "facts", "from": 1, "to": 2, "v1_matched": True},
                                        "new_anchor.fingerprint_versions.facts": 2}, {}),
    ("new-anchor-mismatch", {"new_anchor.artifact_sha256": H("art-9")}, {}),
    ("new-anchor-missing", {"new_anchor": DELETE}, {}),
    ("event-after-missing", {}, {"after": DELETE}),
    ("fp-downgrade", {"old_anchor.fingerprint_versions.facts": 3, "new_anchor.fingerprint_versions.facts": 2}, {}),
    ("fp-non-int", {"new_anchor.fingerprint_versions.artifact": "2"}, {}),
    ("affected-not-list", {"affected_ids": "CLM-0001"}, {}),
    ("affected-unsorted", {"affected_ids": ["FACT-0002", "CLM-0001"]}, {}),
    ("affected-dup", {"affected_ids": ["CLM-0001", "CLM-0001"]}, {}),
    ("affected-empty", {"affected_ids": []}, {}),
    ("affected-bad", {"affected_ids": ["CLM0001", "TASK.T0001", "clm-1"]}, {}),
    ("rejudge-not-object", {"rejudge": []}, {}),
    ("rejudge-deny", {"rejudge.verdict": "DENY"}, {}),
    ("rejudge-empty-gates", {"rejudge.gates_run": []}, {}),
    ("rejudge-row-no-gate", {"rejudge.gates_run": [{"result": "PASS"}, "x"]}, {}),
    ("rejudge-row-deny", {"rejudge.gates_run": [{"gate": "g1", "result": "DENY"}, {"gate": "g2", "result": "PASS"}]}, {}),
    ("rejudge-selection", {"rejudge.selection": {"rules_version": 1}}, {}),
    ("transition-not-object", {"transition": "facts"}, {}),
    ("transition-bad", {"transition": {"layer": "other", "from": 2, "to": 2, "v1_matched": False}}, {}),
    ("transition-good", {"transition": {"layer": "facts", "from": 1, "to": 2, "v1_matched": True},
                         "new_anchor.fingerprint_versions.facts": 2}, {}),
    ("recompute-basis-empty", {"basis": "deterministic-recompute", "evidence_refs": [], "affected_ids": []}, {}),
]


def advance_cases(la) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    base_section, base_event, previous_after = advance_base(la)
    for name, section_mut, event_mut in ADVANCE_MUTATIONS:
        section = copy.deepcopy(base_section)
        event = copy.deepcopy(base_event)
        for path, value in section_mut.items():
            set_path(section, path, value)
        for path, value in event_mut.items():
            set_path(event, path, value)
        for lane in la.LANES:
            if lane != "frontend" and name not in {"good", "old-anchor-mismatch", "affected-bad"}:
                continue
            cases.append({
                "name": f"{name}/{lane}",
                "section": section,
                "lane": lane,
                "event": event,
                "previous_after": previous_after,
                "previous_fingerprint_versions": None,
                **outcome(lambda s=section, e=event, l=lane: la.validate_advance(
                    s, event=e, previous_after=previous_after, lane=l)),
            })
    extra = [
        ("not-object", "nope", "frontend", base_event, previous_after, None),
        ("no-previous", base_section, "backend", base_event, None, None),
        ("previous-fp", base_section, "frontend", base_event, previous_after, {"facts": 1}),
        ("unknown-lane", base_section, "mobile", base_event, previous_after, None),
    ]
    for name, section, lane, event, prev, prev_fp in extra:
        cases.append({
            "name": name, "section": section, "lane": lane, "event": event, "previous_after": prev,
            "previous_fingerprint_versions": prev_fp,
            **outcome(lambda s=section, l=lane, e=event, p=prev, f=prev_fp: la.validate_advance(
                s, event=e, previous_after=p, lane=l, previous_fingerprint_versions=f)),
        })
    return cases


def retirement_cases(la) -> list[dict[str, Any]]:
    good_missing = {
        "id": "FACT-0007", "kind": "missing_retired", "reason": "页面已下线，见 CHANGE-0003", "actor": "human:owner",
        "replacement_id": None,
        "last_anchor": {"category": "page", "file_path": "src/a.vue", "symbol": "A", "last_verified_file_sha256": H("a")},
    }
    candidates = {"FACT-0007": {"file_path": "src/a.vue", "symbol": "A"}, "FACT-0008": {"file_path": "src/b.vue", "symbol": None}}
    delta = {
        "id": "DELTA-0001", "kind": "delta_absorbed", "reason": "决策已并入 BP v3", "actor": "human:owner",
        "replacement_id": "DEC-0004",
        "last_anchor": {"delta_id": "DELTA-0001", "delta_sha256": H("d"), "base_blueprint_sha256": H("bp")},
    }
    receipt = {
        "id": "RCPT-0001", "kind": "receipt_superseded", "reason": "接口回执换新", "actor": "human:owner",
        "replacement_id": f"receipts/r2.json#sha256={H('r2')}",
        "last_anchor": {"path": "receipts/r1.json", "sha256": H("r1")},
    }

    def m(entry: dict[str, Any], **changes: Any) -> dict[str, Any]:
        out = copy.deepcopy(entry)
        for key, value in changes.items():
            if value is DELETE:
                out.pop(key, None)
            else:
                out[key] = value
        return out

    raw: list[tuple[str, Any, str, Any, Any]] = [
        ("none", None, "frontend", "human:owner", None),
        ("not-list", {"id": "x"}, "frontend", "human:owner", None),
        ("empty", [], "bp", None, None),
        ("not-object", ["x", 3], "frontend", "human:owner", None),
        ("missing-good", [good_missing], "frontend", "human:owner", candidates),
        ("missing-no-candidates", [good_missing], "frontend", "human:owner", None),
        ("missing-not-current", [m(good_missing, id="FACT-0099")], "frontend", "human:owner", candidates),
        ("missing-file-differs", [m(good_missing, last_anchor={**good_missing["last_anchor"], "file_path": "src/z.vue"})],
         "frontend", "human:owner", candidates),
        ("missing-replacement-missing", [m(good_missing, replacement_id="FACT-0008")], "frontend", "human:owner", candidates),
        ("missing-replacement-live", [m(good_missing, replacement_id="FACT-0100")], "frontend", "human:owner", candidates),
        ("bad-id", [m(good_missing, id="fact-7"), m(good_missing, id=7)], "frontend", "human:owner", None),
        ("dup-id", [good_missing, good_missing], "frontend", "human:owner", None),
        ("kind-unknown", [m(good_missing, kind="gone")], "frontend", "human:owner", None),
        ("kind-vnext-in-python", [m(good_missing, kind="claim_superseded")], "frontend", "human:owner", None),
        ("kind-other-lane", [m(good_missing, kind="delta_absorbed")], "frontend", "human:owner", None),
        ("reason-todo", [m(good_missing, reason="TBD")], "frontend", "human:owner", None),
        ("reason-missing", [m(good_missing, reason=DELETE)], "frontend", "human:owner", None),
        ("reason-blank", [m(good_missing, reason=" ")], "frontend", "human:owner", None),
        ("actor-missing", [m(good_missing, actor=DELETE)], "frontend", "human:owner", None),
        ("actor-mismatch", [m(good_missing, actor="human:other")], "frontend", "human:owner", None),
        ("actor-unchecked", [m(good_missing, actor="human:other")], "frontend", None, None),
        ("replacement-blank", [m(good_missing, replacement_id=" ")], "frontend", "human:owner", None),
        ("replacement-non-str", [m(good_missing, replacement_id=5)], "frontend", "human:owner", None),
        ("replacement-same", [m(good_missing, replacement_id="FACT-0007")], "frontend", "human:owner", None),
        ("anchor-not-object", [m(good_missing, last_anchor=[])], "frontend", "human:owner", None),
        ("anchor-missing-keys", [m(good_missing, last_anchor={"category": "page"})], "frontend", "human:owner", None),
        ("anchor-unknown-kind", [m(good_missing, kind="gone", last_anchor={})], "frontend", "human:owner", None),
        ("delta-good", [delta], "bp", "human:owner", None),
        ("delta-id-mismatch", [m(delta, last_anchor={**delta["last_anchor"], "delta_id": "DELTA-0002"})], "bp", "human:owner", None),
        ("delta-bad-sha", [m(delta, last_anchor={"delta_id": "DELTA-0001", "delta_sha256": "x", "base_blueprint_sha256": 1})],
         "bp", "human:owner", None),
        ("delta-bad-id", [m(delta, id="d1", last_anchor={"delta_sha256": H("d"), "base_blueprint_sha256": H("bp")})],
         "bp", "human:owner", None),
        ("receipt-good", [receipt], "backend", "human:owner", None),
        ("receipt-bad-replacement", [m(receipt, replacement_id="receipts/r2.json")], "backend", "human:owner", None),
        ("provider", [{"id": "PROV-0001", "kind": "provider_not_applicable", "reason": "供应商退出", "actor": "human:owner",
                       "last_anchor": {"path": "providers/p.yaml", "provider_sha256": H("p")}}], "backend", "human:owner", None),
        ("opt-in", [{"id": "OPT-0001", "kind": "opt_in_retired", "reason": "关闭可选层", "actor": "human:owner",
                     "last_anchor": {"layer": "facts"}}], "frontend", "human:owner", None),
        ("unknown-lane", [], "mobile", None, None),
    ]
    cases = []
    for name, entries, lane, actor, cands in raw:
        cases.append({
            "name": name, "entries": entries, "lane": lane, "actor": actor, "candidates": cands,
            **outcome(lambda e=entries, l=lane, a=actor, c=cands: la.validate_retirements(e, lane=l, actor=a, candidates=c)),
        })
    return cases


def build(la, source: dict[str, Any]) -> dict[str, Any]:
    profile_cases = []
    for profile, versions in sorted(la.PROFILES.items()):
        for version in sorted(versions):
            profile_cases.append({
                "profile": profile, "version": version, **value_field(SAMPLE_DOC),
                **outcome(lambda p=profile, v=version: la.semantic_fingerprint(p, SAMPLE_DOC, version=v)),
            })
    for profile, version in PROFILE_ERRORS:
        profile_cases.append({
            "profile": profile, "version": version, **value_field(SAMPLE_DOC),
            **outcome(lambda p=profile, v=version: la.semantic_fingerprint(p, SAMPLE_DOC, version=v)),
        })
    return {
        "schema": "vnext-legal-advance-parity/v1",
        "source": source,
        "constants": {
            "ADVANCE_SCHEMA": la.ADVANCE_SCHEMA,
            "CHANGE_CLASSES": list(la.CHANGE_CLASSES),
            "ADVANCE_BASES": list(la.ADVANCE_BASES),
            "BOUNDARY_KINDS": list(la.BOUNDARY_KINDS),
            "LANES": list(la.LANES),
            "FINGERPRINT_LAYERS": list(la.FINGERPRINT_LAYERS),
            "RETIREMENT_KINDS": list(la.RETIREMENT_KINDS),
            "LANE_RETIREMENT_KINDS": {lane: sorted(kinds) for lane, kinds in la.LANE_RETIREMENT_KINDS.items()},
            "RETIREMENT_ANCHOR_KEYS": {kind: list(keys) for kind, keys in la.RETIREMENT_ANCHOR_KEYS.items()},
            "PROFILES": {name: {str(v): list(p) for v, p in versions.items()} for name, versions in la.PROFILES.items()},
            "FIXED_MINIMAL_RULES": la.FIXED_MINIMAL_RULES,
            "REJUDGE_VERDICTS": list(la.REJUDGE_VERDICTS),
        },
        "sample_doc": SAMPLE_DOC,
        "digest": [{**value_field(value), "result": la.digest_value(value)} for value in DIGEST_VALUES],
        "strip_paths": [
            {**value_field(value), "patterns": patterns, **outcome(lambda v=value, p=patterns: la.strip_paths(v, p))}
            for value, patterns in STRIP_CASES
        ],
        "semantic_fingerprint": profile_cases,
        "check_fingerprint_versions": [
            {"previous": prev, "current": cur, "result": la.check_fingerprint_versions(prev, cur)}
            for prev, cur in FP_VERSION_CASES
        ],
        "judge_boundary": [{"args": args, "result": la.judge_boundary(**args)} for args in BOUNDARY_CASES],
        "judge_change": [{"args": args, "result": la.judge_change(**args)} for args in CHANGE_CASES],
        "is_default_actor": [{"actor": actor, "result": la.is_default_actor(actor)} for actor in ACTORS],
        "build_rejudge": [
            {"gates_run": gates, "options": options,
             **outcome(lambda g=gates, o=options: la.build_rejudge(copy.deepcopy(g), **o))}
            for gates, options in REJUDGE_CASES
        ],
        "anchor_of": [{"after": after, "fingerprint_versions": fv, "result": la.anchor_of(after, fv)}
                      for after, fv in ANCHOR_CASES],
        "validate_advance": advance_cases(la),
        "validate_retirements": retirement_cases(la),
    }


def render(fixture: dict[str, Any]) -> str:
    """顶层逐键成行、用例一行一例（diff 可读、体积可控）；键排序 + LF，确定输出。"""

    def compact(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

    lines = ["{"]
    keys = sorted(fixture)
    for index, key in enumerate(keys):
        value = fixture[key]
        tail = "," if index < len(keys) - 1 else ""
        if isinstance(value, list):
            lines.append(f"  {compact(key)}: [")
            lines.extend(f"    {compact(item)}{',' if i < len(value) - 1 else ''}" for i, item in enumerate(value))
            lines.append(f"  ]{tail}")
        else:
            lines.append(f"  {compact(key)}: {compact(value)}{tail}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--legal-advance", required=True, type=Path, help="pomaster scripts/legal_advance.py")
    parser.add_argument("--source-commit", default=None, help="pomaster commit（缺省尝试 git rev-parse）")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    path: Path = args.legal_advance.resolve()
    commit = args.source_commit
    if commit is None:
        try:
            commit = subprocess.run(["git", "-C", str(path.parent), "rev-parse", "HEAD"], check=True,
                                    capture_output=True, text=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            commit = "unknown"
    source = {
        "file": "pomaster/scripts/legal_advance.py",
        "commit": commit,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    fixture = build(load_module(path), source)
    text = render(fixture)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    counts = {key: len(value) for key, value in fixture.items() if isinstance(value, list)}
    print(f"wrote {args.out} ({sum(counts.values())} cases: {counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
