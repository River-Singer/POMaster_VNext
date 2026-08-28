#!/usr/bin/env python3
"""MIG-B2 / M3 Authority Map + re-verification annotations builder.

Batch2 counterpart of migration/master-batch1/tools/build_m3_authority.py
(form reference; batch1 file untouched, batch2 output standalone).

Read-only over MASTer_master (no write/rename/delete/mtime touch).
Deterministic: zero wall clock in machine fields; byte-identical on rerun.
Output: migration/master-batch2/authority.json
Serialization: json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\\n",
written as bytes (UTF-8, no BOM), per batch1 CONVENTIONS.md section 7 +
batch2 CONVENTIONS.md hard rule 3.

Contents: coarse owner map over ALL batch2 truth objects (blueprint family /
page_surface family / composition-governance family, each with its owner),
boundary clauses carried forward (frontend-only), machine re-verification of
evidence axes (pins recomputed, binding anchors re-checked, alias word forms
scanned across the src corpus, C-01/C-02 denominators recomputed), and
REVALIDATION_HUMAN_REQUIRED annotations for everything not machine-judgeable.
Annotation only; never tampers axis values (no auto-adjudication).

Exit codes: 0 = success; 2 = fail-closed (structure/denominator assertion failed).
"""

import hashlib
import json
import os
import re
import sys
from pathlib import Path

BATCH_DIR = Path(__file__).resolve().parent.parent
MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT_ROOT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
OBJECTS_DIR = BATCH_DIR / "truth" / "objects"
OUT_PATH = BATCH_DIR / "authority.json"

BATCH_TAG = "MIG-B2"

# FROZEN mirrors (02-object-envelope.schema.json $definitions) for sanity assertion.
LIFECYCLE_VALUES = {"PROPOSED", "CURRENT", "SUPERSEDED", "DEPRECATED", "RETIRED", "REJECTED"}
CONFIDENCE_VALUES = {"UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"}
EVIDENCE_VALUES = {"PLANNED", "IMPLEMENTED", "VERIFIED"}
CHANGE_VALUES = {"STABLE", "CHALLENGED", "MIGRATING"}

PUBLISHED_OPENAPI_REF = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
EXPECTED_PUBLISHED_OPERATIONIDS = 190  # M0 inventory openapi_sources[0]; drift = fail-closed

# vocab v0.2 (FROZEN packages/schemas/src/vocab.ts, PR-0001 append-only): active
# alias families = 8. Context registration only; not recomputed here.
ALIAS_FAMILIES_V0_2 = [
    "KB-*",
    "GRID.*",
    "PAGE-TASK-STEP-*",
    "TASK-*",
    "CHANGE-*",
    "ISSUE.*",
    "FTA-*",
    "FB-*",
]

PAGE_SPEC_DIR = "outputs/frontend/30_generated/page-specs"
ROUTES_TS_REF = "src/app/router/routes.ts"
SHELL_VUE_REF = "src/app/shell/MasterApplicationShell.vue"
PROTOTYPE_HTML_REF = "doc/last_project/doc/MASTer-prototype-20260722.html"
BLUEPRINTS_DIR_REF = "outputs/frontend/10_planned/screen-blueprints"
PAGES_REGISTRY_REF = "outputs/frontend/10_planned/application-page-registry.yaml"
READINESS_REGISTRY_REF = "outputs/frontend/10_planned/page-readiness-registry.yaml"
NAV_STRUCTURE_REF = "outputs/frontend/10_planned/navigation-structure.yaml"
SHELL_REGISTRY_REF = "outputs/frontend/10_planned/application-shell-registry.yaml"
KEYBINDING_MAP_REF = "migration/master-batch2/key-binding-map.batch2.draft.yaml"

CONFLICT_C01 = "MIG-B2/C-01"
CONFLICT_C02 = "MIG-B2/C-02"

_page_cache = {}


# ---------------------------------------------------------------------------
# IO helpers
# ---------------------------------------------------------------------------


def resolve_ref(ref: str):
    """Resolve a source/binding ref: MASTer-relative first, vNext fallback
    (batch2 sources include migration/master-batch2/* refs that live in the
    POMaster_VNext tree, not MASTer). Returns a Path or None."""
    p = MASTER / ref
    if p.is_file() or p.is_dir():
        return p
    p = VNEXT_ROOT / ref
    if p.is_file() or p.is_dir():
        return p
    return None


def load_text(ref: str):
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="replace")


def load_doc(ref: str):
    """Parse a repo doc (JSON content preferred, YAML fallback). Cached."""
    if ref in _page_cache:
        return _page_cache[ref]
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        _page_cache[ref] = ("__missing__", None)
        return _page_cache[ref]
    raw = p.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    doc = None
    try:
        doc = json.loads(text)
        syntax = "json"
    except (ValueError, TypeError):
        try:
            import yaml  # PyYAML available per CONVENTIONS hard rule 12
            doc = yaml.safe_load(text)
            syntax = "yaml"
        except Exception:
            doc = None
            syntax = "unparsable"
    _page_cache[ref] = (syntax, doc)
    return _page_cache[ref]


def sha256_of_ref(ref: str):
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        return None
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_objects():
    objs = []
    for kind_dir in sorted(OBJECTS_DIR.iterdir()):
        if not kind_dir.is_dir():
            continue
        for fn in sorted(kind_dir.glob("*.json")):
            raw = fn.read_bytes()
            obj = json.loads(raw.decode("utf-8"))
            rel = "truth/objects/" + kind_dir.name + "/" + fn.name
            objs.append((rel, obj))
    objs.sort(key=lambda x: x[0])
    return objs


def build_src_corpus():
    corpus = {}
    src_root = MASTER / "src"
    for dirpath, _dirnames, filenames in os.walk(src_root):
        for fn in sorted(filenames):
            if not fn.endswith((".ts", ".vue")):
                continue
            p = Path(dirpath) / fn
            rel = p.relative_to(MASTER).as_posix()
            corpus[rel] = p.read_text(encoding="utf-8", errors="replace")
    return corpus


def corpus_token_hits(corpus, token):
    """Files whose text contains `token` not followed by [A-Z0-9_.] (boundary-safe)."""
    if not token:
        return []
    pat = re.compile(re.escape(token) + r"(?![A-Z0-9_.])")
    hits = []
    for rel in sorted(corpus):
        if token in corpus[rel] and pat.search(corpus[rel]):
            hits.append(rel)
    return hits


def openapi_operation_ids():
    _syntax, doc = load_doc(PUBLISHED_OPENAPI_REF)
    ids = set()
    if doc and isinstance(doc, dict):
        for _path, item in (doc.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            for _method, op in item.items():
                if isinstance(op, dict) and op.get("operationId"):
                    ids.add(op["operationId"])
    return ids


# ---------------------------------------------------------------------------
# Machine checks
# ---------------------------------------------------------------------------


def check_source_pins(obj):
    checks = []
    for src in obj.get("sources", []):
        pin = (src.get("pin") or {}).get("digest")
        if not pin:
            continue
        ref = src.get("ref")
        want = pin.split("sha256:", 1)[-1]
        got = sha256_of_ref(ref)
        if got is None:
            result = "source_missing"
        elif got == want:
            result = "matched"
        else:
            result = "drift"
        checks.append(
            {
                "check": "source_pin_sha256",
                "target": ref,
                "result": result,
                "detail": {"type": src.get("type"), "pin": pin},
            }
        )
    return checks


def _token_scan(text, token):
    """Boundary-safe token presence in file text."""
    if text is None or not token:
        return False
    return re.search(re.escape(token) + r"(?![A-Z0-9_.])", text) is not None


def check_binding(binding):
    """Re-check one key_bindings.code[] entry against the live repo.

    Returns {check, target, result, detail}. Batch2 binding shapes:
      file + {document_type,schema_version,action_ids|slot_ids|template_ids}
          -> binding_source_registry_membership (JSON parse + id-list text scan)
      file + {prototype_fn}                  -> binding_prototype_token
      file + {page_id}    (page-spec md)     -> binding_page_spec_doc
      file + {route_name_exact} (routes.ts)  -> binding_route_name
      file + {slot_id,shell_name} (shell vue)-> binding_shell_slot
      source_dir + {page_id}                 -> binding_page_dir
    Existence failure first -> binding_file_anchor not_found.
    """
    artifact_type = binding.get("artifact_type")
    value = binding.get("value")
    expect = binding.get("expect") or {}

    if artifact_type == "source_dir":
        p = resolve_ref(value)
        exists = p is not None and p.is_dir()
        return {
            "check": "binding_page_dir",
            "target": value,
            "result": "matched" if exists else "not_found",
            "detail": {"exists": exists, "expect": {"page_id": expect.get("page_id")}},
        }

    if artifact_type != "file":
        return {
            "check": "binding_unknown_artifact_type",
            "target": str(value),
            "result": "handler_missing",
            "detail": {"artifact_type": artifact_type},
        }

    p = resolve_ref(value)
    exists = p is not None and p.is_file()
    if not exists:
        return {
            "check": "binding_file_anchor",
            "target": value,
            "result": "not_found",
            "detail": {"exists": False},
        }

    text = load_text(value)

    if "route_name_exact" in expect:
        want = expect["route_name_exact"]
        hit = _token_scan(text, want)
        return {
            "check": "binding_route_name",
            "target": value,
            "result": "matched" if hit else "not_found",
            "detail": {"expect_token": want, "found": hit},
        }

    if "slot_id" in expect or "shell_name" in expect:
        key_results = {}
        for key in ("slot_id", "shell_name"):
            if key in expect:
                key_results[key] = {
                    "token": expect[key],
                    "found": _token_scan(text, expect[key]),
                }
        ok = all(v["found"] for v in key_results.values())
        return {
            "check": "binding_shell_slot",
            "target": value,
            "result": "matched" if ok else "not_found",
            "detail": {"expect_tokens": key_results},
        }

    if "prototype_fn" in expect:
        want = expect["prototype_fn"]
        hit = _token_scan(text, want)
        return {
            "check": "binding_prototype_token",
            "target": value,
            "result": "matched" if hit else "not_found",
            "detail": {"expect_token": want, "found": hit},
        }

    if "page_id" in expect and value.startswith(PAGE_SPEC_DIR + "/"):
        want = expect["page_id"]
        hit = _token_scan(text, want)
        return {
            "check": "binding_page_spec_doc",
            "target": value,
            "result": "matched" if hit else "not_found",
            "detail": {"expect_page_id": want, "found": hit},
        }

    if "document_type" in expect or "schema_version" in expect:
        syntax, doc = load_doc(value)
        key_results = {}
        if isinstance(doc, dict):
            if "document_type" in expect:
                got = doc.get("document_type")
                key_results["document_type"] = (
                    "matched" if got == expect["document_type"] else "mismatched:" + str(got)
                )
            if "schema_version" in expect:
                got = doc.get("schema_version")
                key_results["schema_version"] = (
                    "matched" if got == expect["schema_version"] else "mismatched:" + str(got)
                )
        else:
            key_results["parse"] = "unparsable:" + syntax
        # id-list expectations: every listed governed word form must appear in
        # the bound file text (values are referenced by word form, not by key).
        for list_key in ("action_ids", "slot_ids", "template_ids"):
            if list_key in expect:
                missing = [t for t in expect[list_key] if not _token_scan(text, t)]
                key_results[list_key] = (
                    "matched" if not missing else "not_found:" + ",".join(missing)
                )
        ok = all(v == "matched" for v in key_results.values())
        return {
            "check": "binding_source_registry_membership",
            "target": value,
            "result": "matched" if ok else "mismatched",
            "detail": {"syntax": syntax, "expect_keys": key_results},
        }

    return {
        "check": "binding_unknown_expect_shape",
        "target": value,
        "result": "handler_missing",
        "detail": {"expect_keys": sorted(expect)},
    }


def check_alias_corpus(obj, corpus):
    """Scan the whole src corpus for canonical id + alias word forms.

    Machine evidence for/against the object's word forms being present in code
    (route names / header tokens). matched = at least one token found.
    """
    tokens = [obj["id"]] + list(obj.get("aliases", []))
    hits_by_token = {}
    for tok in tokens:
        hits_by_token[tok] = corpus_token_hits(corpus, tok)
    flat = sorted({h for hits in hits_by_token.values() for h in hits})
    return {
        "check": "alias_corpus_scan",
        "target": "src/**/*.(ts|vue)",
        "result": "matched" if flat else "not_found",
        "detail": {
            "tokens": tokens,
            "hits_by_token": hits_by_token,
            "corpus_files_scanned": len(corpus),
        },
    }


# ---------------------------------------------------------------------------
# REVALIDATION_HUMAN_REQUIRED (annotation only; values untouched)
# ---------------------------------------------------------------------------


def rhr_for_object(obj, binding_checks):
    out = []
    pl = obj.get("payload", {})

    # 1. registered conflicts carried on the object (data-driven; C-01 x12 /
    #    C-02 x2 at build time) -> conflict_ledger channel.
    for pc in pl.get("pending_conflicts") or []:
        cid = pc.get("conflict_id", "unregistered")
        if cid == CONFLICT_C01:
            aspect = "page_denominator_pending_owner"
            reason = (
                "payload.pending_conflicts registers MIG-B2/C-01 (page denominator three-source "
                "drift: registry summary self-report 32 vs pages[] actual 35 vs screen-blueprints "
                "39 incl. 4 orphans); resolution options a/b/c are Owner-only, this batch never "
                "auto-adjudicates, values kept verbatim"
            )
        elif cid == CONFLICT_C02:
            aspect = "shell_width_dual_value_pending_owner"
            reason = (
                "payload.pending_conflicts registers MIG-B2/C-02 (shell_overrides vs SHELL.SIDE_NAV "
                "width two-source drift: override note cites stale 220px; collapsed 64px vs 48px "
                "coexist); resolution options a/b/c are Owner-only, dual values kept verbatim"
            )
        else:
            aspect = "registered_conflict_pending_owner"
            reason = (
                "payload.pending_conflicts registers "
                + cid
                + " (report only, never auto-adjudicate per classification-ledger rule)"
            )
        out.append(
            {
                "aspect": aspect,
                "channel": "conflict_ledger",
                "conflict_ref": cid,
                "reason": reason,
                "values": [
                    v.get("source")
                    for v in (pc.get("values_in_conflict") or [])
                    if isinstance(v, dict) and v.get("source")
                ],
            }
        )

    # 2. canonical id fitted word forms granted HUMAN_CONFIRM_REQUIRED.
    grant = pl.get("canonical_id_grant")
    if isinstance(grant, dict) and grant.get("status") == "HUMAN_CONFIRM_REQUIRED":
        out.append(
            {
                "aspect": "canonical_id_fitted_form_human_confirm",
                "channel": "owner_ruling",
                "reason": (
                    "payload.canonical_id_grant: fitted canonical word form has no ALIASES_V0 "
                    "registered rule (v0.2 active families: KB-*/GRID.*/PAGE-TASK-STEP-*/TASK-*/"
                    "CHANGE-*/ISSUE.*/FTA-*/FB-*); grant is registration-only, rename-on-ingest "
                    "forbidden until vocab PR / Owner adjudication"
                ),
                "values": [grant.get("legacy_word_form"), grant.get("canonical_draft")],
            }
        )

    # 3. readiness semantic upgrade registered but not executed (39 objects).
    ssf = pl.get("superseded_status_field")
    if isinstance(ssf, dict) and ssf.get("upgrade_registered") is True:
        out.append(
            {
                "aspect": "readiness_semantic_upgrade_registered_not_executed",
                "channel": "owner_ruling",
                "reason": (
                    "payload.superseded_status_field.upgrade_registered=true: dual-axis split "
                    "records PROPOSED as a fact record (DRAFT=33/BLOCKED=6/READY=0, values not "
                    "tampered); the semantic upgrade to CURRENT is registered only and awaits "
                    "Owner adjudication"
                ),
                "values": [ssf.get("source_field"), ssf.get("source_value")],
            }
        )

    # 4. page<->dir / route_name anchors quoted from the KEYBINDING draft table.
    kbs = obj.get("key_bindings", {}).get("code", [])
    needs_kb = any(
        b.get("artifact_type") == "source_dir" or "route_name_exact" in (b.get("expect") or {})
        for b in kbs
    )
    if needs_kb:
        out.append(
            {
                "aspect": "keybinding_table_pending_human_adjudication",
                "channel": "human_adjudication",
                "reason": (
                    "key_bindings quoted verbatim from key-binding-map.batch2.draft.yaml (draft "
                    "table, MECHANICAL_ROUTE_NAME_MATCH rows); the governed KEYBINDING.* table "
                    "object itself awaits human adjudication; M3 re-verified the anchors "
                    "mechanically (see machine_checks) but the table landing is a governed write"
                ),
                "values": [KEYBINDING_MAP_REF],
            }
        )

    # 5. machine-judged binding failures stay human: missing anchor files and
    #    absent word forms are recorded evidence, remediation is a governed
    #    decision (batch1 capability no-header-token precedent).
    for c in binding_checks:
        if c["check"] == "binding_shell_slot" and c["result"] == "not_found":
            missing = [
                k
                for k, v in sorted((c["detail"].get("expect_tokens") or {}).items())
                if isinstance(v, dict) and not v.get("found")
            ]
            out.append(
                {
                    "aspect": "shell_slot_word_form_absent_in_implementation",
                    "channel": "owner_ruling",
                    "reason": (
                        "bound implementation file does not carry the SHELL.* word form for this slot "
                        "(file header comment lists slot names without the SHELL. prefix); binding is an "
                        "expectation, machine evidence recorded not_found; remediation = add word form to "
                        "the file or confirm match_rule manual_confirmed (machine-key debt), values untouched"
                    ),
                    "values": [c["target"]] + missing,
                }
            )
        elif c["check"] == "binding_prototype_token" and c["result"] == "not_found":
            out.append(
                {
                    "aspect": "prototype_anchor_file_absent",
                    "channel": "owner_ruling",
                    "reason": (
                        "bound prototype html (path declared verbatim by the source registry "
                        "prototype_ref) is absent from the MASTer repo, so the prototype_fn word form "
                        "cannot be re-verified against the declared snapshot; registry-side remediation "
                        "(fix prototype_ref path or re-pin the live mockups file) is Owner duty, "
                        "binding value kept verbatim"
                    ),
                    "values": [c["target"]],
                }
            )
        elif c["check"] == "binding_file_anchor" and c["result"] == "not_found":
            out.append(
                {
                    "aspect": "binding_anchor_file_absent",
                    "channel": "gate_rescan_C5",
                    "reason": (
                        "bound anchor file does not exist at the referenced path; recorded as machine "
                        "evidence, not adjudicated here (gate rescans, C5)"
                    ),
                    "values": [c["target"]],
                }
            )

    return out


# ---------------------------------------------------------------------------
# Registry-level recomputes (m3_recompute evidence for registry RHR items)
# ---------------------------------------------------------------------------


def recompute_c01_denominators():
    """Live re-parse of the three conflicting C-01 sources."""
    _s, pages_doc = load_doc(PAGES_REGISTRY_REF)
    pages = pages_doc.get("pages") or [] if isinstance(pages_doc, dict) else []
    page_ids = [p.get("id") for p in pages if isinstance(p, dict)]
    summary_total = None
    if isinstance(pages_doc, dict):
        summary_total = (pages_doc.get("summary") or {}).get("total_prototype_pages")

    bp_dir = resolve_ref(BLUEPRINTS_DIR_REF)
    blueprint_files = sorted(
        f.name for f in bp_dir.glob("*.yaml")
    ) if bp_dir is not None and bp_dir.is_dir() else []
    blueprint_ids = [f[:-5] for f in blueprint_files]

    _s, readiness_doc = load_doc(READINESS_REGISTRY_REF)
    readiness = (
        readiness_doc.get("readiness") or readiness_doc.get("pages") or []
        if isinstance(readiness_doc, dict)
        else []
    )
    readiness_ids = [r.get("page_id") for r in readiness if isinstance(r, dict)]

    orphan_ids = sorted(set(blueprint_ids) - set(page_ids))
    reverse_gap = sorted(set(page_ids) - set(blueprint_ids))
    return {
        "method": "live re-parse at M3: json.load pages[]/readiness[] + screen-blueprints dir walk",
        "pages_registry_actual": {"value": len(page_ids), "breakdown_note": "M1: 24 new-application + 11 existing-task-step"},
        "registry_summary_selfreport": {"value": summary_total},
        "screen_blueprints": {"value": len(blueprint_ids)},
        "readiness_entries": {"value": len(readiness_ids)},
        "orphan_blueprints_not_in_pages": {"value": len(orphan_ids), "values": orphan_ids},
        "registry_pages_without_blueprint": {"value": len(reverse_gap), "values": reverse_gap},
        "readiness_set_equals_blueprints_set": sorted(readiness_ids) == sorted(blueprint_ids),
    }


def recompute_c02_shell_widths():
    """Live re-parse of both C-02 sides."""
    _s, nav_doc = load_doc(NAV_STRUCTURE_REF)
    overrides = (nav_doc or {}).get("shell_overrides") if isinstance(nav_doc, dict) else None
    _s, shell_doc = load_doc(SHELL_REGISTRY_REF)
    side_nav_layout = None
    if isinstance(shell_doc, dict):
        for slot in shell_doc.get("slots") or []:
            if isinstance(slot, dict) and slot.get("id") == "SHELL.SIDE_NAV":
                side_nav_layout = slot.get("layout")
                break
    shell_vue_text = load_text(SHELL_VUE_REF)
    return {
        "method": "live re-parse at M3 of both conflict sides + implementation file probe-scope note",
        "shell_overrides_side": {
            "ref": NAV_STRUCTURE_REF,
            "sidebar_collapsed_width": (overrides or {}).get("sidebar_collapsed_width"),
            "sidebar_width": (overrides or {}).get("sidebar_width"),
        },
        "shell_registry_side": {
            "ref": SHELL_REGISTRY_REF,
            "side_nav_layout": side_nav_layout,
        },
        "implementation_file": {
            "ref": SHELL_VUE_REF,
            "exists": shell_vue_text is not None,
            "note": (
                "actual rendered value not probed at M3 (option_c needs a rendering probe = gate "
                "duty C5, never a self-reported probe); file existence only"
            ),
        },
    }


def recompute_blueprint_objectification_coverage(objects):
    """bp_blueprint-bearing objects on disk vs the objectification plan (39)."""
    bp_primary = 0
    for _rel, obj in objects:
        for s in obj.get("sources", []):
            if s.get("type") == "bp_blueprint":
                bp_primary += 1
                break
    bp_dir = resolve_ref(BLUEPRINTS_DIR_REF)
    blueprint_files = len(list(bp_dir.glob("*.yaml"))) if bp_dir is not None and bp_dir.is_dir() else 0
    return {
        "method": "per-object primary-source type scan (bp_blueprint) over truth/objects + screen-blueprints dir walk",
        "blueprint_files_source_denominator": blueprint_files,
        "bp_blueprint_bearing_objects_on_disk": bp_primary,
        "delta": blueprint_files - bp_primary,
    }


def recompute_keybinding_map_summary():
    _s, kb_doc = load_doc(KEYBINDING_MAP_REF)
    if not isinstance(kb_doc, dict):
        return {"parsed": False}
    sc = kb_doc.get("summary_counts") or {}
    return {
        "parsed": True,
        "bindings_total": sc.get("bindings_total"),
        "bindings_by_status": sc.get("bindings_by_status"),
        "denominator_union_page_ids": sc.get("denominator_union_page_ids"),
    }


def recompute_prototype_anchor_search():
    """Deterministic repo-wide search for the prototype snapshot file declared
    by application-page-registry prototype_ref (absent at M3 time)."""
    declared = "doc/last_project/doc/MASTer-prototype-20260722.html"
    candidates = []
    for start in (MASTER, VNEXT_ROOT):
        for dirpath, dirnames, filenames in os.walk(start):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
            for fn in filenames:
                if fn.lower().startswith("master-prototype") and fn.lower().endswith(".html"):
                    p = Path(dirpath) / fn
                    try:
                        rel = p.relative_to(start).as_posix()
                    except ValueError:
                        continue
                    repo = "MASTer_master" if start == MASTER else "POMaster_VNext"
                    candidates.append(repo + ":" + rel)
    candidates.sort()
    return {
        "method": "deterministic os.walk over MASTer_master + POMaster_VNext (skip .git/node_modules) for MASTer-prototype*.html",
        "declared_ref": declared,
        "declared_ref_exists": resolve_ref(declared) is not None,
        "found_candidates": candidates,
        "note": "recorded, not adjudicated: fixing prototype_ref or re-pinning the live mockups file is registry-side Owner duty",
    }


# ---------------------------------------------------------------------------
# Owner map
# ---------------------------------------------------------------------------

# (family, kind, source match rule, owner, notes). source match: exact ref for
# design_seed-primary rows; prefix rule for the bp_blueprint-primary row.
MAP_ROWS = [
    (
        "composition_governance",
        "business_rule",
        ("design_seed", "outputs/frontend/10_planned/action-placement-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "ACTION.* placement word table (whole-book object, 27 actions, batch1 CONVENTIONS section 3 precedent); "
        "HUMAN_OWNER delegate modify_action_placement_adjudication per ledger; multi-round user adjudication notes preserved verbatim",
    ),
    (
        "composition_governance",
        "business_rule",
        ("design_seed", "outputs/frontend/10_planned/page-anatomy-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "PAGE_SLOT.* slot word table (whole-book object, 16 slots); blueprints reference slots by value, no per-slot governed-id retrieval path",
    ),
    (
        "composition_governance",
        "business_rule",
        ("design_seed", "outputs/frontend/10_planned/page-template-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "PAGE.* template word table (whole-book object, 11 templates); blueprints reference page.template.id by value",
    ),
    (
        "composition_governance",
        "component",
        ("design_seed", "outputs/frontend/10_planned/application-shell-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "application shell slots (7 SHELL.* local-family word forms -> COMPONENT.SHELL.* canonical grant, non-A6, origin stays derived); "
        "SHELL.SIDE_NAV confidence=PROVISIONAL under C-02; slot-by-slot objects per batch2 CONVENTIONS section 5 granularity ruling",
    ),
    (
        "blueprint",
        "page_surface",
        ("bp_blueprint_prefix", "outputs/frontend/10_planned/screen-blueprints/"),
        "FRONTEND_ARCHITECTURE",
        "blueprint-objectified PAGE.* surface main objects (primary source type bp_blueprint, one blueprint one surface object); "
        "design-approval axis fact (page.status) with HUMAN_OWNER approve_page_blueprint delegate; C-01 attached on the 4 orphan pages; "
        "PAGE-TASK-STEP-* aliases are ALIASES_V0-registered (origin ingested), PAGE-APP-* fitted forms HUMAN_CONFIRM_REQUIRED",
    ),
    (
        "page_surface",
        "page_surface",
        ("design_seed", "outputs/frontend/10_planned/application-page-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "page registration identity layer (35 pages[] entries as facet objects); denominator under C-01 (summary 32 vs 35 vs 39)",
    ),
    (
        "page_surface",
        "page_surface",
        ("design_seed", "outputs/frontend/10_planned/navigation-structure.yaml"),
        "FRONTEND_ARCHITECTURE",
        "navigation tree layer (leaves -> PAGE.NAV.* facet objects; 28 leaves / 24 unique page ids; shared-leaf fidelity kept); "
        "physical route strings withheld (route authority = pending KEYBINDING.* table); C-02 attached on the shell-override carrier object",
    ),
    (
        "page_surface",
        "page_surface",
        ("design_seed", "outputs/frontend/10_planned/navigation-transition-registry.yaml"),
        "FRONTEND_ARCHITECTURE",
        "page transition layer (21 TRANSITION-* hang on from/to PAGE.NAV.* objects; no separate TRANSITION object family per ledger)",
    ),
    (
        "page_surface",
        "page_surface",
        ("design_seed", "outputs/frontend/10_planned/page-readiness-registry.yaml"),
        "FRONTEND_ENGINEERING",
        "readiness progression layer (39 facet objects; DRAFT=33/BLOCKED=6/READY=0 fact records, semantic upgrade registered not executed); "
        "execution-readiness axis separate from the blueprint design-approval axis (dual-axis rule, batch2 CONVENTIONS section 4); "
        "C-01 attached on the 4 orphan readiness objects",
    ),
]

OWNER_SEMANTICS = {
    "FRONTEND_ARCHITECTURE": "frontend architecture owner; single-person project: the project Owner wears this hat (registry-level coarse grant, DP-7)",
    "FRONTEND_ENGINEERING": "frontend engineering execution owner (page-readiness progression baseline)",
}


def primary_source_ref(obj):
    """Batch2 primary-source rule: first bp_blueprint source if any, else first
    design_seed source, else first source."""
    srcs = obj.get("sources", [])
    for want_type in ("bp_blueprint", "design_seed"):
        for s in srcs:
            if s.get("type") == want_type:
                return s.get("ref")
    return srcs[0].get("ref") if srcs else None


def match_map_row(kind, primary_ref):
    for family, row_kind, (rule, ref), owner, notes in MAP_ROWS:
        if row_kind != kind:
            continue
        if rule == "design_seed" and primary_ref == ref:
            return family, owner, notes
        if rule == "bp_blueprint_prefix" and isinstance(primary_ref, str) and primary_ref.startswith(ref):
            return family, owner, notes
    return None, None, None


# ---------------------------------------------------------------------------


def main():
    objects = collect_objects()
    corpus = build_src_corpus()
    published_ids = openapi_operation_ids()

    if not objects:
        print("FATAL: no objects found under truth/objects", file=sys.stderr)
        return 2
    if len(published_ids) != EXPECTED_PUBLISHED_OPERATIONIDS:
        print(
            "FATAL: published OpenAPI recomputed to %d operationIds, expected %d "
            "(drift = fail-closed signal, not silently absorbed)"
            % (len(published_ids), EXPECTED_PUBLISHED_OPERATIONIDS),
            file=sys.stderr,
        )
        return 2

    # ---- per-object machine re-verification -------------------------------
    per_object = []
    rhr_rows = []  # (object_id, aspect_entry)
    check_type_stats = {}
    axes_sanity_fail = []

    for rel, obj in objects:
        kind = obj["kind"]
        axes = obj["axes"]
        for axis_name, allowed in (
            ("lifecycle", LIFECYCLE_VALUES),
            ("confidence", CONFIDENCE_VALUES),
            ("evidence", EVIDENCE_VALUES),
            ("change", CHANGE_VALUES),
        ):
            if axes.get(axis_name) not in allowed:
                axes_sanity_fail.append((obj["id"], axis_name, axes.get(axis_name)))

        checks = []
        checks.extend(check_source_pins(obj))
        binding_checks = [
            check_binding(b) for b in obj.get("key_bindings", {}).get("code", [])
        ]
        checks.extend(binding_checks)
        if obj.get("aliases") or kind != "business_rule":
            # business-rule whole-book objects carry no alias word forms; the
            # scan is meaningful for PAGE.*/COMPONENT.* families (131 objects).
            checks.append(check_alias_corpus(obj, corpus))

        for c in checks:
            st = check_type_stats.setdefault(c["check"], {})
            st[c["result"]] = st.get(c["result"], 0) + 1

        m3_rhr = rhr_for_object(obj, binding_checks)
        for entry in m3_rhr:
            rhr_rows.append((obj["id"], entry))

        summary = {}
        for c in checks:
            summary[c["result"]] = summary.get(c["result"], 0) + 1

        per_object.append(
            {
                "file": rel,
                "id": obj["id"],
                "kind": kind,
                "owner": obj["authority"]["owner"],
                "axes": axes,
                "machine_checks": checks,
                "machine_summary": summary,
                "revalidation_human_required": m3_rhr,
            }
        )

    if axes_sanity_fail:
        print("FATAL: axes values outside FROZEN vocab: %r" % axes_sanity_fail, file=sys.stderr)
        return 2

    # ---- owner map (registry-level, from object scan; ledger candidates
    #      cross-checked at build time) --------------------------------------
    map_rows = []
    owner_counts = {}
    family_counts = {}
    owner_mismatch = []
    unmapped = []
    for rel, obj in objects:
        primary_ref = primary_source_ref(obj)
        family, expected_owner, notes = match_map_row(obj["kind"], primary_ref)
        if family is None:
            unmapped.append((obj["id"], primary_ref))
            continue
        if obj["authority"]["owner"] != expected_owner:
            owner_mismatch.append((obj["id"], obj["authority"]["owner"], expected_owner))
    if unmapped:
        print("FATAL: objects not covered by any map row: %r" % unmapped, file=sys.stderr)
        return 2
    if owner_mismatch:
        print("FATAL: object owner != map row owner: %r" % owner_mismatch, file=sys.stderr)
        return 2

    for family, row_kind, (rule, ref), owner, notes in MAP_ROWS:
        if rule == "design_seed":
            ids = [
                obj["id"]
                for _rel, obj in objects
                if obj["kind"] == row_kind and primary_source_ref(obj) == ref
            ]
            match_desc = "primary design_seed source == " + ref
        else:
            ids = [
                obj["id"]
                for _rel, obj in objects
                if obj["kind"] == row_kind
                and (primary_source_ref(obj) or "").startswith(ref)
            ]
            match_desc = "primary bp_blueprint source under " + ref
        map_rows.append(
            {
                "family": family,
                "kind": row_kind,
                "owner": owner,
                "object_count": len(ids),
                "object_count_denominator": {
                    "method": "per-object primary-source scan (bp_blueprint first, else design_seed) over truth/objects/**/*.json (%d files); match: %s"
                    % (len(objects), match_desc),
                    "scope": "migration/master-batch2/truth/objects",
                    "value_total": len(objects),
                },
                "source_ref": ref,
                "notes": notes,
            }
        )
        owner_counts[owner] = owner_counts.get(owner, 0) + len(ids)
        family_counts[family] = family_counts.get(family, 0) + len(ids)

    mapped_total = sum(r["object_count"] for r in map_rows)
    if mapped_total != len(objects):
        print(
            "FATAL: map rows cover %d of %d objects" % (mapped_total, len(objects)),
            file=sys.stderr,
        )
        return 2

    owners_present = sorted(owner_counts)
    owner_registry = []
    for owner in owners_present:
        kinds = sorted({obj["kind"] for _rel, obj in objects if obj["authority"]["owner"] == owner})
        owner_registry.append(
            {
                "kinds": kinds,
                "object_count": owner_counts[owner],
                "object_count_denominator": {
                    "method": "per-object authority.owner scan",
                    "scope": "migration/master-batch2/truth/objects",
                    "value_total": len(objects),
                },
                "owner": owner,
                "role_semantics": OWNER_SEMANTICS[owner],
            }
        )

    owner_coverage_unresolved = [
        obj["id"] for _rel, obj in objects if obj["authority"]["owner"] not in owner_counts
    ]

    # ---- registry-level RHR items (annotated, never adjudicated) ----------
    c01_recompute = recompute_c01_denominators()
    c02_recompute = recompute_c02_shell_widths()
    kb_summary = recompute_keybinding_map_summary()
    bp_coverage = recompute_blueprint_objectification_coverage(objects)
    proto_search = recompute_prototype_anchor_search()

    registry_rhr = [
        {
            "scope": "page-surface registration/blueprint/readiness denominators (map rows: page_surface + blueprint families)",
            "item_id": "REG-RHR-B2-01",
            "aspect": "page_denominator_drift",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C01,
            "reason": (
                "application-page-registry pages[] 35 vs registry summary self-report 32 vs "
                "screen-blueprints 39 incl. 4 orphans; page-readiness 39 entries = pages[] 35 + "
                "orphan 4; page denominator for PAGE.* surface coverage gates cannot be mechanically "
                "fixed at 35 or 39 until Owner rules (options a/b/c in classification-ledger "
                "conflicts_pending_owner[MIG-B2/C-01]); inherited from batch1 REG-RHR-02 routing"
            ),
            "values": c01_recompute["orphan_blueprints_not_in_pages"]["values"],
            "m3_recompute": c01_recompute,
        },
        {
            "scope": "composition_governance family: shell slot objects + shell-override carrier nav object",
            "item_id": "REG-RHR-B2-02",
            "aspect": "shell_width_dual_value",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C02,
            "reason": (
                "navigation-structure.shell_overrides vs application-shell-registry SHELL.SIDE_NAV "
                "width two-source drift; both sides re-parsed live at M3 and recorded verbatim; "
                "option_c (render-truth adjudication) needs a rendering probe = gate duty, never a "
                "self-reported probe"
            ),
            "values": ["collapsed 64px (shell_overrides)", "collapsed:48px (shell registry slot layout)"],
            "m3_recompute": c02_recompute,
        },
        {
            "scope": "all PAGE.* objects carrying payload.canonical_id_grant",
            "item_id": "REG-RHR-B2-03",
            "aspect": "canonical_id_fitted_word_forms",
            "channel": "owner_ruling",
            "conflict_ref": None,
            "reason": (
                "PAGE-APP-* fitted canonical forms (and their NAV./READINESS./REGISTRY. facet "
                "derivatives) have no ALIASES_V0 registered rule; per-object grants are "
                "HUMAN_CONFIRM_REQUIRED; formal alias-family registration awaits vocab PR / Owner "
                "adjudication; rename-on-ingest was NOT executed (origins stay source-side)"
            ),
            "values": [
                "PAGE-APP-* -> PAGE.APP_*",
                "PAGE-TASK-STEP-* -> PAGE.* (ALIASES_V0 registered, origin ingested)",
            ],
            "m3_recompute": {
                "method": "per-object payload.canonical_id_grant scan + key-binding-map draft parse",
                "grants_human_confirm_required": sum(
                    1
                    for _rel, obj in objects
                    if (obj.get("payload", {}).get("canonical_id_grant") or {}).get("status")
                    == "HUMAN_CONFIRM_REQUIRED"
                ),
                "alias_families_registered_vocab_v0_2": ALIAS_FAMILIES_V0_2,
                "key_binding_map_proposed_needs_human": kb_summary,
            },
        },
        {
            "scope": "map rows with page<->dir / route_name binding anchors (blueprint family)",
            "item_id": "REG-RHR-B2-04",
            "aspect": "keybinding_table_object_pending",
            "channel": "human_adjudication",
            "conflict_ref": None,
            "reason": (
                "page<->dir and route_name anchors are A7 P0 key-binding class; values were quoted "
                "verbatim from key-binding-map.batch2.draft.yaml and re-verified mechanically per "
                "object (binding_page_dir / binding_route_name checks); the governed KEYBINDING.* "
                "table object itself remains pending human adjudication (landing it is a governed "
                "write, out of M3 scope)"
            ),
            "values": [KEYBINDING_MAP_REF],
            "m3_recompute": kb_summary,
        },
        {
            "scope": "blueprint family denominator vs disk state",
            "item_id": "REG-RHR-B2-05",
            "aspect": "blueprint_objectification_coverage_delta",
            "channel": "human_adjudication",
            "conflict_ref": None,
            "reason": (
                "ledger meta.blueprint_objectification_strategy plans one surface object per "
                "blueprint (39); the on-disk bp_blueprint primary-source count and the delta vs "
                "the 39 source files are recomputed LIVE in m3_recompute below (historical M3 "
                "snapshot: 19 back-half objects on disk, front half absent). Recorded, not "
                "adjudicated and not auto-ingested (M3 only annotates; ingesting is M2 duty) - "
                "coverage claims for the blueprint family must use the on-disk denominator until "
                "the live delta is resolved"
            ),
            "values": [],
            "m3_recompute": bp_coverage,
        },
        {
            "scope": "page_surface registration family: prototype_fn binding anchors (registry.page_entry prototype_fn bindings)",
            "item_id": "REG-RHR-B2-06",
            "aspect": "prototype_anchor_snapshot_absent",
            "channel": "owner_ruling",
            "conflict_ref": None,
            "reason": (
                "application-page-registry declares prototype_ref "
                "'doc/last_project/doc/MASTer-prototype-20260722.html' and the registry facet objects "
                "quote it verbatim as their binding anchor; the declared snapshot file is absent from "
                "the MASTer repo, so all prototype_fn token re-checks return not_found at M3 (machine "
                "evidence recorded per object). Remediation (fix the registry prototype_ref path or "
                "re-pin the live mockups file) is registry-side Owner duty; values kept verbatim"
            ),
            "values": ["doc/last_project/doc/MASTer-prototype-20260722.html"],
            "m3_recompute": proto_search,
        },
    ]

    # ---- RHR aggregation ---------------------------------------------------
    rhr_items = []
    for oid, entry in sorted(rhr_rows, key=lambda x: (x[0], x[1].get("aspect", ""))):
        row = {"object_id": oid}
        row.update(entry)
        rhr_items.append(row)
    rhr_object_pairs = len(rhr_items)
    rhr_objects = len({r["object_id"] for r in rhr_items})
    by_channel = {}
    by_aspect = {}
    for r in rhr_items:
        by_channel[r.get("channel", "unspecified")] = by_channel.get(r.get("channel", "unspecified"), 0) + 1
        by_aspect[r.get("aspect", "unspecified")] = by_aspect.get(r.get("aspect", "unspecified"), 0) + 1

    document = {
        "batch": BATCH_TAG,
        "document_kind": "m3-authority-map",
        "generated_by": "migration/master-batch2/tools/build_m3_authority.py",
        "consumes": [
            {
                "ref": "migration/master-batch2/truth/objects",
                "role": "reverification denominator (actual file walk) + evidence-axis scan corpus",
            },
            {
                "ref": "migration/master-batch2/classification-ledger.yaml",
                "role": "authority_owner_candidate source + boundary clause AUTH-RULE-FRONTEND-ONLY (carried from batch1) + conflicts C-01/C-02",
            },
            {
                "ref": "migration/master-batch2/inventory.yaml",
                "role": "M0 denominators (blueprints 39, application_pages, composition_entries, navigation_entries, page_readiness_status) and boundary info",
            },
            {
                "ref": "migration/master-batch2/key-binding-map.batch2.draft.yaml",
                "role": "page-anchor three-way alignment draft table (page<->dir / route_name anchors; alias registrations proposed_needs_human)",
            },
            {
                "ref": "migration/master-batch1/authority.json",
                "role": "batch1 M3 form reference + boundary-clause carrier (batch1 file untouched; batch2 output standalone)",
            },
            {
                "ref": PUBLISHED_OPENAPI_REF,
                "role": "published external baseline recomputed for the frontend-only boundary clause (batch2 objects carry no openapi bindings)",
            },
        ],
        "idempotency": {
            "machine_fields_wall_clock": "none",
            "note": (
                "machine-consumed fields carry zero timestamps/dates; batch tag fixed "
                + BATCH_TAG
                + "; per-object rows and RHR items are deterministically sorted; rerun on same inputs is byte-identical"
            ),
            "serialization": (
                "json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + trailing newline; bytes write; "
                "UTF-8 no BOM"
            ),
        },
        "boundary_rules": [
            {
                "rule_id": "AUTH-RULE-FRONTEND-ONLY",
                "statement": (
                    "This project is frontend-only; the backend is the published external OpenAPI "
                    "(MASTer API 0.1.0, " + PUBLISHED_OPENAPI_REF + ", 190 unique operationIds); this project "
                    "performs no backend-owner approval ritual."
                ),
                "statement_verbatim": (
                    "本项目 frontend-only；backend = 已发布外部 OpenAPI 承担，无 backend-owner 审批仪式——MASTer_master 显式项目边界"
                ),
                "enforcement": "CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL",
                "source": (
                    "MASTer_master explicit project boundary; batch2 classification-ledger meta.boundary_clauses"
                    "[AUTH-RULE-FRONTEND-ONLY] (carried from batch1, statement consumed verbatim)"
                ),
                "external_baseline": {
                    "document_title": "MASTer API",
                    "document_version": "0.1.0",
                    "operationids": len(published_ids),
                    "operationids_denominator_note": (
                        "recomputed at M3 by parsing paths.*.* of the published document; must equal M0 inventory "
                        "value 190 (drift = fail-closed signal, not silently absorbed; build-time assert in tool)"
                    ),
                    "source": PUBLISHED_OPENAPI_REF,
                },
                "batch2_note": (
                    "batch2's 48 ledger assets include no EXTERNAL_BASELINE delegate consumers (no contract-op "
                    "objects and no openapi bindings in this batch); the clause is carried as the L0 project "
                    "boundary for downstream batches, per ledger meta.boundary_clauses note"
                ),
                "consumption_contract": [
                    (
                        "authority loading: any delegates role EXTERNAL_BASELINE is a reference position, never an "
                        "approval-ritual position"
                    ),
                    (
                        "contract gate: never solicit approval from a backend owner that does not exist; judge by "
                        "mechanical keys (operationId membership in the published baseline), verdict vocabulary "
                        "per FROZEN 03-gate-result (e.g. not_configured when the key is absent, never silent pass)"
                    ),
                    (
                        "migration tools: registration of approval-axis dispositions (superseded_status_field) is "
                        "the only permitted transcription act; executing a semantic upgrade is forbidden"
                    ),
                ],
                "historical_precedent": (
                    "without this rule the contract gate re-creates the 26 dependency-not-approved deadlock "
                    "(soliciting approval from a nonexistent authority); batch1 live instance NEEDS_BACKEND_REVIEW "
                    "x29 (MIG-B1/C-03)"
                ),
            },
            {
                "rule_id": "AUTH-RULE-OWNER-RESOLVABILITY",
                "statement": (
                    "Every truth object's authority.owner MUST resolve against this file's owner_registry/map; "
                    "resolution failure is FATAL, not WARNING (ghost owner left 26 dependency-not-approved findings "
                    "with nowhere to appeal)."
                ),
                "enforcement": "OWNER_RESOLUTION_FATAL_ON_MISS",
                "source": "02-object-envelope.schema.json AuthorityBlock.owner description (FROZEN); this file is the resolution target for MIG-B2",
                "consumption_contract": [
                    (
                        "this file's map[] + owner_registry[] cover all %d batch2 truth objects (asserted at build "
                        "time: unmapped objects and owner mismatches both fail the build)" % len(objects)
                    ),
                    "any new object whose owner is absent from owner_registry fails the build/gate until the map is extended",
                ],
            },
            {
                "rule_id": "AUTH-RULE-NO-AUTO-ADJUDICATION",
                "statement": (
                    "Approval-axis dispositions and registered conflicts (MIG-B2/C-01, MIG-B2/C-02, canonical_id "
                    "grants HUMAN_CONFIRM_REQUIRED, superseded_status_field upgrade_registered=true entries, "
                    "KEYBINDING.* draft table) are human/Owner adjudication only; gates and migration tools must "
                    "re-verify by mechanical keys and must never auto-adjudicate, auto-upgrade, or silently mark "
                    "historical content CURRENT because an old POMaster wrote it."
                ),
                "enforcement": "APPROVAL_AXIS_HUMAN_ONLY",
                "source": (
                    "batch2 classification-ledger conflicts_pending_owner rule (only summarize, never "
                    "auto-adjudicate) + batch1 CONVENTIONS section 4 (semantic upgrade registered, not executed) + "
                    "task M3 core principle"
                ),
                "consumption_contract": [
                    (
                        "M3 output shape: machine-judged items carry result + evidence; un-machine-judgeable items "
                        "land in revalidation_human_required with a resolution channel (conflict_ledger / owner_ruling / "
                        "human_adjudication / gate_rescan_C5); object axis values are never rewritten by this batch"
                    ),
                    (
                        "lifecycle CURRENT on migrated objects is the transcription posture recorded by M2 with "
                        "per-object rationale, not an M3 certification; M3 records machine evidence for/against and "
                        "annotates the remainder"
                    ),
                    (
                        "dual-axis separation is preserved: screen-blueprint page.status (APPROVED/DRAFT/BLOCKED) is "
                        "the design-approval axis fact with an in-place authorization chain (HUMAN_OWNER "
                        "approve_page_blueprint delegate); page-readiness status is the execution-readiness axis "
                        "(PROPOSED fact records); neither axis is certified by this file"
                    ),
                ],
            },
        ],
        "owner_registry": owner_registry,
        "map": map_rows,
        "reverification": {
            "scope_statement": (
                "machine re-verification of all batch2 truth objects' evidence axes: source pin digests recomputed "
                "(MASTer refs and migration-internal refs), key-binding anchors re-checked (file/dir existence, "
                "registry membership, prototype/page-spec/route-name/shell-slot token scans), canonical+alias word "
                "forms scanned across the whole src corpus, C-01/C-02 denominators re-parsed live from both conflict "
                "sides, frontend-only baseline operationId count recomputed; annotation only - no axis value touched"
            ),
            "denominators": {
                "objects_total": {
                    "value": len(objects),
                    "source": "file walk of migration/master-batch2/truth/objects/**/*.json",
                },
                "objects_by_kind": {
                    k: sum(1 for _rel, obj in objects if obj["kind"] == k)
                    for k in sorted({obj["kind"] for _rel, obj in objects})
                },
                "src_corpus_files": {
                    "value": len(corpus),
                    "source": "os.walk of MASTer_master/src with .ts/.vue whitelist (M0 denominators src_files_vue_ts cross-check)",
                },
                "published_openapi_operationids": {
                    "value": len(published_ids),
                    "source": PUBLISHED_OPENAPI_REF + " paths.*.* operationId collection (recomputed at M3)",
                },
                "key_bindings_total": {
                    "value": sum(len(obj.get("key_bindings", {}).get("code", [])) for _rel, obj in objects),
                    "source": "per-object key_bindings.code[] length sum over all %d objects" % len(objects),
                },
                "source_pins_total": {
                    "value": sum(
                        1
                        for _rel, obj in objects
                        for s in obj.get("sources", [])
                        if (s.get("pin") or {}).get("digest")
                    ),
                    "source": "per-object sources[].pin count over all %d objects" % len(objects),
                },
                "c01_conflict_denominators": c01_recompute,
                "registered_conflicts_on_objects": {
                    "source": "per-object payload.pending_conflicts scan (build-time)",
                    "value_total": sum(
                        len(obj.get("payload", {}).get("pending_conflicts") or []) for _rel, obj in objects
                    ),
                },
            },
            "check_definitions": [
                {
                    "check": "source_pin_sha256",
                    "definition": "recompute sha256 of each sources[].ref (MASTer-relative first, po-master fallback for migration/* refs); compare sources[].pin.digest",
                },
                {
                    "check": "binding_source_registry_membership",
                    "definition": "parse the bound registry file (JSON content) and verify document_type/schema_version; id-list expectations (action_ids/slot_ids/template_ids) verified as word-form presence in the file text",
                },
                {
                    "check": "binding_prototype_token",
                    "definition": "prototype_fn token presence in the bound prototype html",
                },
                {
                    "check": "binding_page_spec_doc",
                    "definition": "page-spec markdown existence + page_id token presence for readiness-facet consumer anchors",
                },
                {
                    "check": "binding_route_name",
                    "definition": "route_name_exact token presence in src/app/router/routes.ts",
                },
                {
                    "check": "binding_shell_slot",
                    "definition": "slot_id + shell_name token presence in src/app/shell/MasterApplicationShell.vue",
                },
                {
                    "check": "binding_page_dir",
                    "definition": "source_dir directory existence under MASTer_master for page<->dir anchors",
                },
                {
                    "check": "binding_file_anchor",
                    "definition": "bare file existence when a bound file cannot be opened (fail row; expected zero)",
                },
                {
                    "check": "alias_corpus_scan",
                    "definition": "whole-src-corpus scan for the object canonical id + alias word forms with [A-Z0-9_.] boundary guard (PAGE.*/COMPONENT.* families)",
                },
            ],
            "machine_result_distribution": {
                check: {k: v for k, v in sorted(stats.items())}
                for check, stats in sorted(check_type_stats.items())
            },
            "per_object": per_object,
            "revalidation_human_required": {
                "count_object_aspect_pairs": rhr_object_pairs,
                "count_distinct_objects": rhr_objects,
                "by_channel": {k: v for k, v in sorted(by_channel.items())},
                "by_aspect": {k: v for k, v in sorted(by_aspect.items())},
                "items": rhr_items,
                "registry_level_items": registry_rhr,
            },
        },
        "statistics": {
            "object_total": {
                "value": len(objects),
                "denominator_source": "actual file count under migration/master-batch2/truth/objects (kind-dir closed set)",
            },
            "owner_coverage": {
                "covered": len(objects) - len(owner_coverage_unresolved),
                "denominator": len(objects),
                "ratio": "100%% (%d/%d)" % (len(objects) - len(owner_coverage_unresolved), len(objects)),
                "unresolved_objects": owner_coverage_unresolved,
                "source": "per-object authority.owner resolution against owner_registry/map (build-time asserted)",
            },
            "map_coverage": {
                "mapped": mapped_total,
                "denominator": len(objects),
                "rows": len(map_rows),
                "distinct_owners": len(owners_present),
                "families": {
                    family: {
                        "objects": family_counts[family],
                        "owners": sorted(
                            {row["owner"] for row in map_rows if row["family"] == family}
                        ),
                    }
                    for family in sorted(family_counts)
                },
            },
            "machine_verification": {
                "checks_total": sum(sum(s.values()) for s in check_type_stats.values()),
                "result_distribution": {
                    check: {k: v for k, v in sorted(stats.items())}
                    for check, stats in sorted(check_type_stats.items())
                },
            },
            "revalidation_human_required": {
                "object_aspect_pairs": rhr_object_pairs,
                "distinct_objects": rhr_objects,
                "registry_level_items": len(registry_rhr),
                "list_ref": "reverification.revalidation_human_required",
            },
        },
    }

    payload = json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    OUT_PATH.write_bytes(payload.encode("utf-8"))

    # explicit denominators, ASCII console output per CONVENTIONS 12
    print("objects_total=%d denominator=truth/objects file walk" % len(objects))
    print("owner_coverage=%d/%d" % (len(objects) - len(owner_coverage_unresolved), len(objects)))
    print("map_rows=%d mapped=%d owners=%d families=%d" % (len(map_rows), mapped_total, len(owners_present), len(family_counts)))
    for family in sorted(family_counts):
        print("  family %s=%d" % (family, family_counts[family]))
    print("machine_checks_total=%d" % sum(sum(s.values()) for s in check_type_stats.values()))
    for check, stats in sorted(check_type_stats.items()):
        print("  %s: %s" % (check, ", ".join("%s=%d" % (k, v) for k, v in sorted(stats.items()))))
    print("rhr_object_aspect_pairs=%d distinct_objects=%d registry_items=%d" % (rhr_object_pairs, rhr_objects, len(registry_rhr)))
    for ch, n in sorted(by_channel.items()):
        print("  channel %s=%d" % (ch, n))
    for asp, n in sorted(by_aspect.items()):
        print("  aspect %s=%d" % (asp, n))
    print("published_openapi_operationids=%d" % len(published_ids))
    print("src_corpus_files=%d" % len(corpus))
    print("wrote %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
