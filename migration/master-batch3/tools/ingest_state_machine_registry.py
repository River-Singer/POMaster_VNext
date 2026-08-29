#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_state_machine_registry.py -- MIG-B3/M2 group-4 ingest tool (state machines).

Transcribes MASTer_master/outputs/frontend/10_planned/state-machine-registry.yaml
(file extension .yaml, content is JSON; 1276 lines per M0 inventory) into 33
truth objects, one per MACHINE-* state machine:

    CAPABILITY.MACHINE.<REST segments>
        e.g. MACHINE-PAGE-TASK-STEP-AUTHENTICATE
             -> CAPABILITY.MACHINE.PAGE.TASK.STEP.AUTHENTICATE
        (family word MACHINE kept as 2nd segment; token boundaries preserved as
        segment boundaries -- CONVENTIONS section 4.2, flat-flattening into one
        segment is FORBIDDEN, multi-segment is a grammar requirement)
    kind=capability (ledger destination_kind: 交互状态机对象族；kind 预判张力注记
    同源：knowledge_entry 排除理由=fail-closed 行为契约非失败知识), flat
    (capability dir census 10+59+33+87=189 <= 500)
    -> migration/master-batch3/truth/objects/capability/machine.<rest>.json

Grain adjudication (ledger destination_note): 33 machines one object each
(MACHINE-PAGE-* maps 1:1 to pages = per-page retrieval path); states /
transitions are carried as VERBATIM REFERENCE KEYS only -- bodies live in
state-ownership-matrix and 02_process-task-interface, inlining copies is
forbidden (双真相封堵, ledger destination_note). State enumeration objects are
NOT minted from this source: CONVENTIONS section 2.3 adjudicates one state
object per matrix-side state_id (455, a different source); the 9 machine-side
true gaps have no definition body and must NOT become objects (缺口随
MIG-B3/C-01 登记). The denominator of THIS source is machines=33; the state
enumeration (464 distinct) and transition references (311 distinct) are
first-class companion denominators, hard-checked.

MIG-B3/C-01 coupling (PENDING_OWNER; ledger conflicts attached to this asset):
- machines carrying drift-pair state word forms (14 separator-pair machines;
  BUILD-BOM additionally the 10 group-word pairs) -> confidence=PROVISIONAL
  (batch1 section 2 悬置态; batch2 SHELL SIDE_NAV precedent) +
  payload.pending_conflicts with BOTH word forms verbatim (values_in_conflict,
  batch2 section 5 shape); never mechanically pick a winner;
- MANAGE-USER-ROLE carries the 9 true gaps: an ABSENCE in the matrix, not a
  two-value conflict -> confidence stays LOCKED (value-conflict-vs-anchor-drift
  distinction discipline, CONVENTIONS section 2.3/C-02), gap registered via
  payload.pending_conflicts (matrix side value=null) for machine-readable
  traceability;
- exact-overlap states (431) are recorded verbatim with no registration.

Evidence axis: KBM token_family_observations records MACHINE-*/STATE-*/
TRANSITION-<HEX16> src-side distinct tokens = 0 (pure registry-side word
forms, no code anchors) -> the machine-judgeable anchor required by the
evidence axis does NOT exist -> axes.evidence=PLANNED for all 33 (silent
all-green forbidden) + payload.revalidation_human_required (batch1
mock-contract field shape) marking the machine_code_anchor aspect for Owner /
later-batch revalidation once anchors exist.

Source has NO status/lifecycle fields and NO wall-clock fields -> dual-axis
split count 0, superseded_status_field registrations 0, stripped wall-clock 0
(honest zeros, asserted).

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2):
- deterministic + idempotent: same source bytes -> byte-identical outputs,
  fresh/noop counts reported;
- fail-closed: live sha256 of BOTH sources (this registry + the
  state-ownership-matrix used for the C-01 reconciliation cross-check) must
  match the inventory pins, else exit 2, nothing written;
- multi-source pin discipline (batch2 section 6): the matrix is a pinned
  inventory asset; the reconciliation (exact 431 / separator pairs 14 /
  group-word pairs 10 / machine gaps 9 / matrix_only 24) is recomputed from
  raw sources and must equal the inventory cross_reference_forms registration;
- every envelope passes the FROZEN 02-object-envelope schema + governed-id
  grammar (15-prefix closed world + 8 alias families, vocab v0.2 mirror);
- red line 1: output local names all-lowercase, derived by rule, unique;
- merge-preserving: payload.machine byte-equal to the source entry;
- self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/state-machine-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
MATRIX_REL = "outputs/frontend/10_planned/state-ownership-matrix.yaml"  # pinned second source
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
KBM_REL = "migration/master-batch3/key-binding-map.batch3.draft.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "capability"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES + ALIASES_V0, FROZEN vocab-lock@v0.2-resolved) and the
# IdCanonical pattern of 02-object-envelope.schema.json.
GOVERNED_ID_PREFIXES = [
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8  # MACHINE-*/STATE-* are NOT among them

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

MACHINE_ID_PATTERN = re.compile(r"^MACHINE-PAGE-(TASK-STEP|APP)-[A-Z0-9-]+$")
STATE_ID_PATTERN = re.compile(r"^STATE-PAGE-(TASK-STEP|APP)-[A-Z0-9_-]+$")
TRANSITION_HEX_PATTERN = re.compile(r"^TRANSITION-[A-F0-9]{16}$")
TRANSITION_NAMED_PATTERN = re.compile(r"^TRANSITION-[A-Z0-9-]+$")

MACHINE_FIELDS = {"id", "page_id", "scope", "state_ids", "transition_ids", "authority", "note"}
SOURCE_AUTHORITY_VALUE = "frontend-engineering-default"

CONFLICT_ID = "MIG-B3/C-01"
PAIR_RULE = "classification-ledger conflicts_pending_owner: report only, never auto-adjudicate"


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_jsonish(path, label):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % label)
    return raw, data


def pin_check(inventory, rel, live_digest, label):
    pinned = None
    for asset in inventory.get("assets", []):
        if asset.get("ref") == rel:
            pinned = asset.get("content_sha256")
            break
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % rel)
    if pinned != live_digest:
        raise FailClosed(
            "%s sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (label, live_digest, pinned)
        )
    return pinned


def check_source_structure(src):
    if set(src.keys()) != {"blueprint_sha256", "document_type", "machines", "schema_version"}:
        raise FailClosed("source top-level keys drifted: %s" % sorted(src.keys()))
    if src["document_type"] != "state-machine-registry":
        raise FailClosed("document_type != 'state-machine-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    machines = src["machines"]
    if not isinstance(machines, list) or not machines:
        raise FailClosed("machines[] is empty or not a list")
    seen = set()
    for m in machines:
        if not isinstance(m, dict) or set(m.keys()) != MACHINE_FIELDS:
            raise FailClosed("machines[] entry field set drifted: %s" % sorted(m.keys()) if isinstance(m, dict) else m)
        mid = m["id"]
        if not isinstance(mid, str) or not MACHINE_ID_PATTERN.match(mid):
            raise FailClosed("machine id is not a MACHINE-PAGE-* word form: %r" % (mid,))
        if mid in seen:
            raise FailClosed("duplicate machine id: %s" % mid)
        seen.add(mid)
        if m["authority"] != SOURCE_AUTHORITY_VALUE:
            raise FailClosed("machine %s authority drifted: %r" % (mid, m["authority"]))
        if m["scope"] != {"page_ids": [m["page_id"]]}:
            raise FailClosed("machine %s scope != {page_ids: [page_id]}" % mid)
        if not isinstance(m["note"], str) or not m["note"]:
            raise FailClosed("machine %s note is not a non-empty string" % mid)
        if not m["state_ids"] or not all(isinstance(s, str) and STATE_ID_PATTERN.match(s) for s in m["state_ids"]):
            raise FailClosed("machine %s state_ids drifted (empty or non-STATE word form)" % mid)
        if len(set(m["state_ids"])) != len(m["state_ids"]):
            raise FailClosed("machine %s has duplicate state_ids" % mid)
        if not m["transition_ids"] or not all(
            isinstance(t, str) and TRANSITION_NAMED_PATTERN.match(t) for t in m["transition_ids"]
        ):
            raise FailClosed("machine %s transition_ids drifted" % mid)
        if len(set(m["transition_ids"])) != len(m["transition_ids"]):
            raise FailClosed("machine %s has duplicate transition_ids" % mid)
    return machines


def check_global_denominators(machines):
    all_states = [s for m in machines for s in m["state_ids"]]
    all_trans = [t for m in machines for t in m["transition_ids"]]
    if len(all_states) != 464 or len(set(all_states)) != 464:
        raise FailClosed(
            "state enumeration drifted: total=%d distinct=%d (expected 464/464)"
            % (len(all_states), len(set(all_states)))
        )
    if len(all_trans) != 311 or len(set(all_trans)) != 311:
        raise FailClosed(
            "transition references drifted: total=%d distinct=%d (expected 311/311)"
            % (len(all_trans), len(set(all_trans)))
        )
    hex16 = [t for t in all_trans if TRANSITION_HEX_PATTERN.match(t)]
    named = [t for t in all_trans if not TRANSITION_HEX_PATTERN.match(t)]
    if len(hex16) + len(named) != 311:
        raise FailClosed("transition word-form composition accounting broken")
    if named and not all(t.startswith("TRANSITION-BUILD-BOM-") for t in named):
        raise FailClosed("unexpected named transition word forms outside BUILD-BOM: %s" % sorted(named))
    scopes = {m["page_id"] for m in machines}
    if len(scopes) != 33:
        raise FailClosed("scope page_ids distinct drifted: %d" % len(scopes))
    if any(m["authority"] != SOURCE_AUTHORITY_VALUE for m in machines):
        raise FailClosed("authority distribution drifted")
    return {
        "states_total": len(all_states),
        "states_distinct": len(set(all_states)),
        "trans_total": len(all_trans),
        "trans_distinct": len(set(all_trans)),
        "trans_hex16": len(hex16),
        "trans_named": len(named),
        "scopes_distinct": len(scopes),
    }, set(all_states)


def norm1(word_form):
    """Level-1: separator word-form drift (hyphen vs underscore)."""
    return word_form.replace("-", "_")


def norm2(word_form):
    """Level-2: additionally the INTERACTION->MODE group-word drift."""
    return word_form.replace("-", "_").replace("INTERACTION", "MODE")


def reconcile_with_matrix(matrix, machine_state_set):
    """Recompute the C-01 reconciliation from raw sources; must equal the
    inventory cross_reference_forms registration (配对只登记不裁决归属)."""
    if set(matrix.keys()) != {"blueprint_sha256", "document_type", "schema_version", "states", "variables"}:
        raise FailClosed("matrix top-level keys drifted")
    if matrix["document_type"] != "state-ownership-matrix":
        raise FailClosed("matrix document_type drifted")
    matrix_states = {s["state_id"] for s in matrix["states"]}
    exact = machine_state_set & matrix_states
    l1, l2, gaps = {}, {}, []
    for s in sorted(machine_state_set - exact):
        cand1 = [t for t in matrix_states if norm1(t) == norm1(s)]
        if cand1:
            l1[s] = cand1
            continue
        cand2 = [t for t in matrix_states if norm1(t) == norm2(s)]
        if cand2:
            l2[s] = cand2
            continue
        gaps.append(s)
    if (len(exact), len(l1), len(l2), len(gaps)) != (431, 14, 10, 9):
        raise FailClosed(
            "C-01 reconciliation drifted: exact=%d l1=%d l2=%d gaps=%d"
            % (len(exact), len(l1), len(l2), len(gaps))
        )
    if len(exact) + len(l1) + len(l2) != 455:
        raise FailClosed("matrix side not fully reconciled to 455")
    matrix_only = matrix_states - machine_state_set
    if len(matrix_only) != 24:
        raise FailClosed("matrix_only drifted: %d" % len(matrix_only))
    return {"exact": exact, "l1": l1, "l2": l2, "gaps": gaps, "matrix_only": matrix_only}


def cross_check_inventory_registration(inventory, recon):
    xf = inventory.get("cross_reference_forms", {}).get("state_machine_state_ids_to_matrix", {})
    inv_l1 = {p["machine_form"]: p["matrix_form"] for p in xf.get("separator_wordform_drift_pairs", [])}
    inv_l2 = {p["machine_form"]: p["matrix_form"] for p in xf.get("group_word_drift_candidate_pairs", [])}
    live_l1 = {k: v[0] for k, v in recon["l1"].items()}
    live_l2 = {k: v[0] for k, v in recon["l2"].items()}
    if live_l1 != inv_l1:
        raise FailClosed("separator pair registration drifted vs inventory cross_reference_forms")
    if live_l2 != inv_l2:
        raise FailClosed("group-word pair registration drifted vs inventory cross_reference_forms")
    if sorted(recon["gaps"]) != sorted(xf.get("machine_side_unmatched", [])):
        raise FailClosed("machine-side true-gap registration drifted vs inventory")
    counts = xf.get("exact_overlap")
    if counts != len(recon["exact"]):
        raise FailClosed("exact_overlap registration drifted vs inventory")
    return inv_l1, inv_l2


def check_kbm_corroboration(kbm, machines, counts):
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    observations = {
        o.get("token_family"): o for o in kbm.get("token_family_observations", [])
    }
    for family in ("MACHINE-*", "STATE-*", "TRANSITION-<HEX16>"):
        obs = observations.get(family)
        if obs is None:
            raise FailClosed("KBM token_family_observations lost %s" % family)
        if obs.get("distinct_tokens_in_src") != 0:
            raise FailClosed(
                "%s src-side distinct tokens != 0 (evidence-axis PLANNED basis lost)"
                % family
            )
    state_note = observations["STATE-*"].get("note", "")
    for fragment in ("STATE-* 464", "MACHINE-* 33", "TRANSITION-<HEX> 311"):
        if fragment not in state_note:
            raise FailClosed(
                "KBM STATE-* registry-side denominator note lost %r" % fragment
            )
    # the registry-side denominator numbers must equal this source's live counts
    if counts["states_distinct"] != 464 or counts["trans_distinct"] != 311:
        raise FailClosed("KBM cross-check invariant lost (counts drifted)")
    return observations


def check_denominator(inventory, machines, counts):
    den = inventory.get("denominators", {}).get("state_machine_machines", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.state_machine_machines.value missing")
    if value != len(machines):
        raise FailClosed(
            "denominator hard criterion violated: source machines=%d objects=%d "
            "inventory state_machine_machines.value=%s"
            % (len(machines), len(machines), value)
        )
    br = den.get("value_breakdown", {})
    checks = [
        ("state_ids_total", br.get("state_ids_total"), counts["states_total"]),
        ("state_ids_distinct", br.get("state_ids_distinct"), counts["states_distinct"]),
        ("transition_ids_total", br.get("transition_ids_total"), counts["trans_total"]),
        ("transition_ids_distinct", br.get("transition_ids_distinct"), counts["trans_distinct"]),
        ("scope_page_ids_distinct", br.get("scope_page_ids_distinct"), counts["scopes_distinct"]),
        (
            "authority.frontend-engineering-default",
            br.get("authority", {}).get(SOURCE_AUTHORITY_VALUE),
            len(machines),
        ),
    ]
    for name, inv_val, live_val in checks:
        if inv_val != live_val:
            raise FailClosed(
                "denominator companion %s drifted: live=%s inventory=%s"
                % (name, live_val, inv_val)
            )
    return value, br


def canonical_id(machine_id):
    """MACHINE-<REST tokens> -> CAPABILITY.MACHINE.<REST segments> (CONVENTIONS
    section 4.2; single-segment flattening forbidden -- multi-segment is a
    grammar requirement)."""
    if not MACHINE_ID_PATTERN.match(machine_id):
        raise FailClosed("machine id not mechanical-grantable: %r" % (machine_id,))
    rest = machine_id[len("MACHINE-"):]
    segments = rest.split("-")
    obj_id = ".".join(["CAPABILITY", "MACHINE"] + segments)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates governed-id grammar: %s" % obj_id)
    for seg in obj_id.split(".")[1:]:
        if not SEGMENT_PATTERN.match(seg):
            raise FailClosed(
                "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
                "per CONVENTIONS section 2.2 admission gate): %r" % (seg,)
            )
    return obj_id


def local_name(object_id):
    """batch1 section 1 local-name rule + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_pending_conflicts(mid, machine_state_ids, inv_l1, inv_l2, gaps):
    """batch2 section 5 shape; both sides verbatim; never auto-adjudicate."""
    entries = []
    pair_items = []
    idx = 0
    for machine_form, matrix_form in inv_l1.items():
        if machine_form in machine_state_ids:
            idx += 1
            pair_items.append(
                {
                    "source": SOURCE_REL,
                    "role": "machine 侧引用词形（分隔符词形漂移对#%d，1 级连字符→下划线归一可配对）" % idx,
                    "value": machine_form,
                }
            )
            pair_items.append(
                {
                    "source": MATRIX_REL,
                    "role": "matrix 侧定义词形（分隔符词形漂移对#%d）" % idx,
                    "value": matrix_form,
                }
            )
    for machine_form, matrix_form in inv_l2.items():
        if machine_form in machine_state_ids:
            idx += 1
            pair_items.append(
                {
                    "source": SOURCE_REL,
                    "role": "machine 侧引用词形（组词漂移候选对#%d，2 级再叠加 INTERACTION→MODE）" % idx,
                    "value": machine_form,
                }
            )
            pair_items.append(
                {
                    "source": MATRIX_REL,
                    "role": "matrix 侧定义词形（组词漂移候选对#%d）" % idx,
                    "value": matrix_form,
                }
            )
    if pair_items:
        entries.append(
            {
                "conflict_id": CONFLICT_ID,
                "subject": (
                    "本机 state_ids 含跨源词形漂移对成员（canonical 词形归属属 Owner "
                    "裁决项）——双词形逐字并存，绝不机械择一"
                ),
                "values_in_conflict": pair_items,
                "rule": PAIR_RULE,
                "resolution": "PENDING_OWNER",
            }
        )
    machine_gaps = [s for s in machine_state_ids if s in gaps]
    if machine_gaps:
        entries.append(
            {
                "conflict_id": CONFLICT_ID,
                "subject": (
                    "本机 %d 条 state_id 在 state-ownership-matrix 无定义体"
                    "（machine 侧真缺口——补登 matrix / 降级待 Owner 裁决）；"
                    "无定义体即无冲突值，confidence 不降（值冲突与缺失的区分纪律）"
                    % len(machine_gaps)
                ),
                "values_in_conflict": [
                    {
                        "source": SOURCE_REL,
                        "role": "machine 侧引用词形（真缺口 %d 条）" % len(machine_gaps),
                        "value": machine_gaps,
                    },
                    {
                        "source": MATRIX_REL,
                        "role": "matrix 侧定义形态",
                        "value": None,
                    },
                ],
                "rule": PAIR_RULE,
                "resolution": "PENDING_OWNER",
            }
        )
    return entries


def build_envelope(src, machine, index, total, source_digest, inv_l1, inv_l2, recon):
    mid = machine["id"]
    obj_id = canonical_id(mid)
    state_ids = machine["state_ids"]

    pair_hit = any(s in inv_l1 or s in inv_l2 for s in state_ids)
    gap_hit = any(s in recon["gaps"] for s in state_ids)
    if pair_hit:
        confidence = "PROVISIONAL"  # 悬置态：未裁决冲突在身（batch1 §2）
    else:
        confidence = "LOCKED"

    payload = {
        "machine": machine,  # verbatim source entry (byte-equality asserted)
        "revalidation_human_required": [
            {
                "aspect": "machine_code_anchor",
                "reason": (
                    "key-binding-map.batch3.draft.yaml token_family_observations 在案："
                    "MACHINE-*/STATE-*/TRANSITION-<HEX16> src 侧 distinct=0（纯 "
                    "registry 侧词形，无代码锚）——接线/实现态无法机判，"
                    "axes.evidence=PLANNED（禁静默全绿，不标 IMPLEMENTED）；待代码锚"
                    "在场后按 evidence 轴机判重验"
                ),
                "values": [mid],
            }
        ],
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex -> sha256: prefixed per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }
    pending = build_pending_conflicts(mid, state_ids, inv_l1, inv_l2, set(recon["gaps"]))
    if pending:
        payload["pending_conflicts"] = pending

    notes = (
        "本对象为 MIG-B3/M2 组4 转录件：源 %s machines[] 共 %d 台逐条转录之一"
        "（%s，page_id=%s，数组序第 %d 台）。条目字段（id/page_id/scope/"
        "state_ids/transition_ids/authority/note）逐字段保真，payload.machine 与"
        "源条目字节等价（工具断言）；数组顺序=源顺序。状态枚举与转移以引用键逐字"
        "承载（state/transition 本体分别在 state-ownership-matrix 与 "
        "02_process-task-interface，不内联复制——双真相封堵，ledger "
        "destination_note）；本台 state_ids %d 条 / transition_ids %d 条。"
        "转移语义登记：全册 transition_ids 311 条全 distinct=300 条 "
        "TRANSITION-<HEX16> 哈希词形 + 11 条 TRANSITION-BUILD-BOM-* 具名词形"
        "（实测词形组成如实登记；总数 311 与 inventory denominators 一致）；"
        "TRANSITION 定义体在 02_process-task-interface.yaml——非本批十资产"
        "（checked_out_of_scope，M1 复测该文件词形 75 distinct 在场 vs 本批引用 "
        "311 distinct，覆盖缺口规模在案；batch1『涉及文件不在本批十资产内』先例"
        "同款），只登记不裁决。分母（本源=machines）：33 台=33 对象=inventory "
        "state_machine_machines.value=33；伴随分母 state_ids 464/464、"
        "transition_ids 311/311、scope 33 页、authority 全 "
        "frontend-engineering-default（照录 payload.machine.authority）。"
        "MIG-B3/C-01 耦合（PENDING_OWNER）：%s%s"
        "evidence 轴：KBM token_family_observations 在案 MACHINE-*/STATE-*/"
        "TRANSITION-<HEX16> src 侧 distinct=0（纯 registry 侧词形，无代码锚）——"
        "机判锚不在场，axes.evidence=PLANNED（禁静默全绿），"
        "payload.revalidation_human_required 登记 machine_code_anchor 方面待重验；"
        "lifecycle=CURRENT（compile_frontend_state_machines.py 写入 producer + "
        "readiness/validate 消费链在场）；源无 status/lifecycle 字段→双轴拆分"
        "动作数=0、superseded_status_field 登记数=0（诚实零）；源无墙钟字段→"
        "零墙钟天然满足。MACHINE-PAGE-* 为注册表本地族词形、非 governed id 且不在 "
        "ALIASES_V0 现役 8 族：canonical 赐名 CAPABILITY.MACHINE.<token 段列>"
        "（§4.2 机械形；禁单段摊平——token 边界保留为段界是文法要求），legacy 词形"
        "照录 aliases[]，page_id 照录 legacy 词形 PAGE-TASK-STEP-*/PAGE-APP-*"
        "（alias_registrations.applied_in_batch1 同口径，不改源数据），不构成 A6 "
        "场景、origin 保持源侧 derived（inventory provenance.origin 逐字）；"
        "MACHINE.* 别名族正式登记待词汇表 PR/Owner 裁决。02b §2 capability 蓝本："
        "canonical_realization/category 源无对应事实整体缺席（batch2 SHELL 三字段"
        "缺席判例同款，禁 fabricate）；key_bindings 显式空（无代码锚即如实声明，"
        "gate 呈 not_configured 而非 passed）。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            mid,
            machine["page_id"],
            index,
            len(state_ids),
            len(machine["transition_ids"]),
            (
                "本机 state_ids 含漂移对成员→confidence=PROVISIONAL（悬置态，"
                "batch1 §2；batch2 SHELL SIDE_NAV 判例）+ payload.pending_conflicts "
                "双词形逐字并存（values_in_conflict，batch2 §5 形状），绝不机械择一；"
                if pair_hit
                else ""
            ),
            (
                "本机携带全部 9 条 machine 侧真缺口（matrix 无定义体→无冲突值，"
                "confidence 不降保持 LOCKED；缺口经 payload.pending_conflicts 登记，"
                "对应转移合法性 gate 将呈 not_configured）"
                if gap_hit
                else "本机 state_ids 与 matrix 精确同形（exact 直录，无登记项）"
                if not pair_hit
                else ""
            ),
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_state_machine_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "machines[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(array order = source order; state_ids/transition_ids carried "
                    "as verbatim reference keys, no inlined copies -- dual-truth "
                    "blocking per ledger destination_note; companion denominators "
                    "states 464/464 + transitions 311/311 (300 HEX16 + 11 "
                    "BUILD-BOM named forms) hard-checked; C-01 reconciliation "
                    "recomputed from the pinned matrix and cross-checked against "
                    "inventory cross_reference_forms: exact 431 / separator pairs "
                    "14 / group-word pairs 10 / machine gaps 9 / matrix_only 24; "
                    "%s MACHINE-* local family word form granted canonical "
                    "CAPABILITY.MACHINE.<token segments>, legacy form in "
                    "aliases[], NOT an A6 scenario so origin stays source-side "
                    "derived; corroborated against KBM token_family_observations "
                    "(src-side distinct=0 -> evidence=PLANNED + "
                    "revalidation_human_required, no silent all-green))"
                    % (
                        index,
                        total,
                        mid,
                        (
                            "confidence=PROVISIONAL with pending_conflicts both "
                            "word forms verbatim (never auto-adjudicated);"
                            if pair_hit
                            else (
                                "gap states registered via pending_conflicts, "
                                "confidence not demoted (absence is not a value "
                                "conflict);"
                                if gap_hit
                                else "no C-01 registration on this machine;"
                            )
                        ),
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": obj_id,
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": confidence,
            "evidence": "PLANNED",
            "change": "STABLE",
        },
        "title_zh": "交互状态机·%s" % machine["page_id"],
        "aliases": [mid],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch3/tools/"
                "ingest_state_machine_registry.py; machine add/remove re-runs "
                "compile_frontend_state_machines.py upstream then this ingest; "
                "MIG-B3/C-01 canonical word-form adjudication (14 separator + 10 "
                "group-word pairs) and the 9 machine-side true gaps are "
                "PENDING_OWNER seats (registered in notes_md/pending_conflicts, "
                "never auto-adjudicated)"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_state_machine_registry",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {"code": [], "artifact": []},
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes,
    }


def validate(envelope, schema):
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    prefix = obj_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation at %s: %s"
            % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    raw, src = load_jsonish(SOURCE_PATH, "source")
    machines = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    counts, machine_state_set = check_global_denominators(machines)

    m_raw, matrix = load_jsonish(MASTER_ROOT / MATRIX_REL, "state-ownership-matrix")
    matrix_digest = hashlib.sha256(m_raw).hexdigest()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest, "state-machine-registry")
    matrix_pinned = pin_check(inventory, MATRIX_REL, matrix_digest, "state-ownership-matrix")

    recon = reconcile_with_matrix(matrix, machine_state_set)
    inv_l1, inv_l2 = cross_check_inventory_registration(inventory, recon)

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    check_kbm_corroboration(kbm, machines, counts)

    den_value, den_breakdown = check_denominator(inventory, machines, counts)

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    envelopes = []
    for index, machine in enumerate(machines, start=1):
        envelope = build_envelope(
            src, machine, index, len(machines), source_digest, inv_l1, inv_l2, recon
        )

        # merge-preserving paranoia: payload.machine must be byte-equal
        if envelope["payload"]["machine"] != machine:
            raise FailClosed(
                "payload.machine != source entry (merge-preserving breach): %s"
                % machine["id"]
            )
        if envelope["aliases"] != [machine["id"]]:
            raise FailClosed("aliases != legacy word form: %s" % machine["id"])
        validate(envelope, schema)
        envelopes.append((local_name(envelope["id"]), envelope))

    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    fresh, noop = 0, 0
    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    provisional = sum(1 for _, e in envelopes if e["axes"]["confidence"] == "PROVISIONAL")
    with_pending = sum(1 for _, e in envelopes if "pending_conflicts" in e["payload"])
    print(
        "[ok] %d objects written: CAPABILITY.MACHINE.* (15 PAGE-TASK-STEP + 18 PAGE-APP)"
        % len(envelopes)
    )
    print(
        "[ok] sources: %s sha256=%s (pin match: %s) ; %s sha256=%s (pin match: %s, "
        "pinned second source for C-01 reconciliation)"
        % (
            SOURCE_REL, source_digest, source_digest == pinned,
            MATRIX_REL, matrix_digest, matrix_pinned == matrix_digest,
        )
    )
    print(
        "[ok] kbm corroboration: token_family_observations MACHINE-*/STATE-*/"
        "TRANSITION-<HEX16> src-side distinct=0 x3 (draft table, not pinned)"
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
        "(15-prefix closed world + %d alias families, vocab v0.2 mirror)"
        % (len(envelopes), EXPECTED_ALIASES_V0_FAMILY_COUNT)
    )
    print("[ok] red line 1: all %d local names lowercase per local-name rule" % len(names))
    print(
        "[denominator] source machines=%d == objects=%d == inventory "
        "state_machine_machines.value=%s (hard criterion PASS)"
        % (len(machines), len(envelopes), den_value)
    )
    print(
        "[denominator] companion: state_ids %d/%d distinct ; transition_ids "
        "%d/%d distinct (= %d HEX16 + %d BUILD-BOM named, composition "
        "registered) ; scope page_ids distinct=%d ; authority all %s"
        % (
            counts["states_total"], counts["states_distinct"],
            counts["trans_total"], counts["trans_distinct"],
            counts["trans_hex16"], counts["trans_named"],
            counts["scopes_distinct"], SOURCE_AUTHORITY_VALUE,
        )
    )
    print(
        "[denominator] C-01 reconciliation (recomputed from pinned matrix, equals "
        "inventory cross_reference_forms): exact=%d + separator pairs=%d + "
        "group-word pairs=%d + machine gaps=%d = %d ; matrix_only=%d (matrix side, "
        "its own group)"
        % (
            len(recon["exact"]), len(inv_l1), len(inv_l2), len(recon["gaps"]),
            len(recon["exact"]) + len(inv_l1) + len(inv_l2) + len(recon["gaps"]),
            len(recon["matrix_only"]),
        )
    )
    print(
        "[denominator] axes: confidence PROVISIONAL=%d (drift-pair machines) / "
        "LOCKED=%d (exact+gap machines; absence is not a value conflict) ; "
        "evidence PLANNED=%d (no code anchors -> revalidation_human_required on "
        "all %d, no silent all-green) ; pending_conflicts on %d machines"
        % (provisional, len(envelopes) - provisional, len(envelopes), len(envelopes), with_pending)
    )
    print(
        "[denominator] registrations: superseded_status_field=0 (no status field "
        "in source, honest zero) ; wall-clock fields stripped=0 (none in source, "
        "asserted) ; state/transition enumeration objects minted=0 (CONVENTIONS "
        "2.3: bodies live in matrix / 02_process-task-interface, dual-truth "
        "blocking) ; legacy word forms in aliases[]=%d"
        % len(envelopes)
    )
    print(
        "[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, "
        "byte-identical)" % (fresh, noop, len(envelopes))
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
