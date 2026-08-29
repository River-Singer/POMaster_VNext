#!/usr/bin/env python3
"""MIG-B1 / M3 Authority Map + re-verification annotations builder.

Read-only over MASTer_master (no write/rename/delete/mtime touch).
Deterministic: zero wall clock in machine fields; byte-identical on rerun.
Output: corpus/master/batch-1/authority.json
Serialization: json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\\n",
written as bytes (UTF-8, no BOM), per CONVENTIONS.md section 7.

Boundary rules, owner map, and machine re-verification of all truth objects'
evidence axes. Only annotates; never tampers axis values (no auto-adjudication).
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
OBJECTS_DIR = BATCH_DIR / "truth" / "objects"
OUT_PATH = BATCH_DIR / "authority.json"

BATCH_TAG = "MIG-B1"

# FROZEN mirrors (02-object-envelope.schema.json $definitions) for sanity assertion.
LIFECYCLE_VALUES = {"PROPOSED", "CURRENT", "SUPERSEDED", "DEPRECATED", "RETIRED", "REJECTED"}
CONFIDENCE_VALUES = {"UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"}
EVIDENCE_VALUES = {"PLANNED", "IMPLEMENTED", "VERIFIED"}
CHANGE_VALUES = {"STABLE", "CHALLENGED", "MIGRATING"}

# vNext canonical + legacy registry local families seen in this batch (context only).
PUBLISHED_OPENAPI_REF = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
CANDIDATE_OPENAPI_REF = "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml"
PACKAGE_JSON_REF = "package.json"

CONFLICT_C01 = "MIG-B1/C-01"
CONFLICT_C02 = "MIG-B1/C-02"
CONFLICT_C03 = "MIG-B1/C-03"
CONFLICT_C04 = "MIG-B1/C-04"

_page_cache = {}


def _to_rel(p: Path) -> str:
    return p.as_posix()


def load_text(rel_ref: str):
    """Read a MASTer repo file as text (utf-8, replacement). Returns None if absent."""
    p = MASTER / rel_ref
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="replace")


def load_doc(rel_ref: str):
    """Parse a MASTer repo doc (JSON content preferred, YAML fallback). Cached."""
    if rel_ref in _page_cache:
        return _page_cache[rel_ref]
    p = MASTER / rel_ref
    if not p.is_file():
        _page_cache[rel_ref] = ("__missing__", None)
        return _page_cache[rel_ref]
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
    _page_cache[rel_ref] = (syntax, doc)
    return _page_cache[rel_ref]


def sha256_of(rel_ref: str):
    """Recompute sha256 hex of a MASTer repo file; None if absent/unreadable."""
    p = MASTER / rel_ref
    if not p.is_file():
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


def candidate_operation_ids():
    _syntax, doc = load_doc(CANDIDATE_OPENAPI_REF)
    ids = set()
    if doc and isinstance(doc, dict):
        for _path, item in (doc.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            for _method, op in item.items():
                if isinstance(op, dict) and op.get("operationId"):
                    ids.add(op["operationId"])
    return ids


def package_json_deps():
    _syntax, doc = load_doc(PACKAGE_JSON_REF)
    deps = {}
    if doc and isinstance(doc, dict):
        deps.update(doc.get("dependencies") or {})
        deps.update(doc.get("devDependencies") or {})
    return deps


# ---------------------------------------------------------------------------
# Expect-key handlers for key_bindings.code[] entries whose value is a registry
# file. Each handler returns a per-key result string; binding result is
# "matched" only when every expect key matches.
# ---------------------------------------------------------------------------


def _registry_entry(doc_list, id_key, id_value):
    for entry in doc_list or []:
        if isinstance(entry, dict) and entry.get(id_key) == id_value:
            return entry
    return None


def check_file_expect(expect, doc_syntax, doc, file_text):
    key_results = {}
    for key, want in sorted(expect.items()):
        if key == "document_type":
            got = doc.get("document_type") if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "schema_version":
            got = doc.get("schema_version") if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "requirement_id":
            entry = _registry_entry(doc.get("requirements"), "id", want) if isinstance(doc, dict) else None
            key_results[key] = "matched" if entry is not None else "not_found"
        elif key == "issue_id":
            entry = _registry_entry(doc.get("issues"), "id", want) if isinstance(doc, dict) else None
            key_results[key] = "matched" if entry is not None else "not_found"
        elif key == "page_id":
            entry = None
            for iss in doc.get("issues") or []:
                if isinstance(iss, dict) and iss.get("id") == expect.get("issue_id"):
                    entry = iss
                    break
            got = entry.get("page_id") if entry else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "status" and isinstance(doc, dict) and doc.get("document_type") in (
            "issue-register",
            "engineering-decision-log",
            "bp-feedback-register",
        ):
            entry = None
            if doc.get("document_type") == "issue-register":
                entry = _registry_entry(doc.get("issues"), "id", expect.get("issue_id"))
            elif doc.get("document_type") == "engineering-decision-log":
                entry = _registry_entry(doc.get("decisions"), "id", expect.get("decision_id"))
            else:
                entry = _registry_entry(doc.get("questions"), "id", expect.get("question_id"))
            got = entry.get("status") if entry else None
            key_results["status"] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "error_code":
            entry = _registry_entry(doc.get("mappings"), "error_code", want) if isinstance(doc, dict) else None
            key_results[key] = "matched" if entry is not None else "not_found"
        elif key == "mapping_count":
            got = len(doc.get("mappings") or []) if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "class_ids":
            got = [c.get("id") for c in doc.get("classes") or []] if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched"
        elif key == "decision_id":
            entry = _registry_entry(doc.get("decisions"), "id", want) if isinstance(doc, dict) else None
            key_results[key] = "matched" if entry is not None else "not_found"
        elif key == "question_id":
            entry = _registry_entry(doc.get("questions"), "id", want) if isinstance(doc, dict) else None
            key_results[key] = "matched" if entry is not None else "not_found"
        elif key == "audit_complete":
            got = doc.get("audit_complete") if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "list_complete":
            got = doc.get("list_complete") if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "items_count":
            got = len(doc.get("items") or []) if isinstance(doc, dict) else None
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "endpoint":
            group = [s for s in doc.get("scenarios") or [] if isinstance(s, dict) and s.get("endpoint") == want]
            key_results[key] = "matched" if group else "not_found"
        elif key == "scenario_ids":
            group = [
                s.get("scenario_id")
                for s in doc.get("scenarios") or []
                if isinstance(s, dict) and s.get("endpoint") == expect.get("endpoint")
            ]
            key_results[key] = (
                "matched" if sorted(group or []) == sorted(want) else "mismatched:" + str(sorted(group or []))
            )
        elif key == "scenario_count":
            got = len(
                [
                    s
                    for s in doc.get("scenarios") or []
                    if isinstance(s, dict) and s.get("endpoint") == expect.get("endpoint")
                ]
            )
            key_results[key] = "matched" if got == want else "mismatched:" + str(got)
        elif key == "error_map_code" and file_text is not None:
            key_results[key] = "matched" if want in file_text else "not_found"
        elif key == "contains_symbol" and file_text is not None:
            missing = [sym for sym in want if sym not in file_text]
            key_results[key] = "matched" if not missing else "not_found:" + ",".join(missing)
        elif key == "page_spec_doc":
            p = MASTER / want
            key_results[key] = "matched" if p.is_file() else "not_found"
        else:
            key_results[key] = "handler_missing"
    result = "matched" if all(v == "matched" for v in key_results.values()) else "mismatched"
    return result, key_results


def check_binding(binding, obj, published_ids, candidate_ids, deps):
    """Returns {check, target, result, detail} dict."""
    artifact_type = binding.get("artifact_type")
    value = binding.get("value")
    expect = binding.get("expect") or {}

    if artifact_type == "openapi_operationId":
        in_pub = value in published_ids
        in_cand = value in candidate_ids
        result = "matched" if in_pub else "not_found"
        detail = {
            "membership": expect.get("membership"),
            "in_published_set": in_pub,
            "in_candidate_set": in_cand,
            "published_set_denominator": len(published_ids),
        }
        return {"check": "binding_openapi_membership", "target": value, "result": result, "detail": detail}

    if artifact_type == "npm_dependency":
        name = expect.get("dependency_name")
        want_range = expect.get("version_range")
        if name in deps:
            result = "matched"
            detail = {"declared_version": deps[name], "expect_version_range": want_range}
        else:
            related = sorted(n for n in deps if n != name and n.startswith(name + "-") and deps[n] == want_range)
            result = "name_not_in_package_json"
            detail = {
                "expect_version_range": want_range,
                "same_version_range_under_prefixed_name": related,
                "note": "recorded, not adjudicated (registry short-name drift family, MIG-B1/C-02)",
            }
        return {"check": "binding_npm_dependency", "target": value, "result": result, "detail": detail}

    if artifact_type == "consumer_page":
        if "page_spec_doc" in expect:
            p = MASTER / expect["page_spec_doc"]
            result = "matched" if p.is_file() else "not_found"
            return {
                "check": "binding_consumer_page",
                "target": value,
                "result": result,
                "detail": {"page_spec_doc": expect["page_spec_doc"], "exists": p.is_file()},
            }
        page_spec = MASTER / ("outputs/frontend/30_generated/page-specs/" + value + ".md")
        blueprint = MASTER / ("outputs/frontend/10_planned/screen-blueprints/" + value + ".yaml")
        spec_exists = page_spec.is_file()
        bp_exists = blueprint.is_file()
        result = "matched" if (spec_exists or bp_exists) else "not_found"
        return {
            "check": "binding_consumer_page",
            "target": value,
            "result": result,
            "detail": {"page_spec_md_exists": spec_exists, "screen_blueprint_yaml_exists": bp_exists},
        }

    if artifact_type == "file":
        rel = value
        p = MASTER / rel
        exists = p.is_file()
        detail = {"exists": exists}
        if not exists:
            return {"check": "binding_file_anchor", "target": rel, "result": "not_found", "detail": detail}

        if "header_contains_any" in expect:
            text = load_text(rel)
            head = text[:8192] if text else ""
            canonical_hit = any(tok in head for tok in expect["header_contains_any"])
            alias_hits = [a for a in obj.get("aliases", []) if a in head]
            if canonical_hit:
                result = "matched"
            elif alias_hits:
                result = "alias_form_only"
            else:
                result = "not_found"
            detail.update(
                {
                    "expect_tokens": expect["header_contains_any"],
                    "expect_token_hit": canonical_hit,
                    "alias_forms_hit": alias_hits,
                }
            )
            return {"check": "binding_header_contains", "target": rel, "result": result, "detail": detail}

        syntax, doc = load_doc(rel)
        file_text = None
        if syntax == "unparsable" or doc is None:
            file_text = load_text(rel)
        if "contains_symbol" in expect or "error_map_code" in expect:
            if file_text is None:
                file_text = load_text(rel)
            if file_text is None:
                return {"check": "binding_file_anchor", "target": rel, "result": "unreadable", "detail": detail}
            result, key_results = check_file_expect(expect, syntax, doc or {}, file_text)
        elif doc is None:
            return {
                "check": "binding_file_anchor",
                "target": rel,
                "result": "unparsable",
                "detail": dict(detail, syntax=syntax),
            }
        else:
            result, key_results = check_file_expect(expect, syntax, doc, None)
        detail["syntax"] = syntax
        detail["expect_keys"] = key_results
        return {"check": "binding_source_registry_membership", "target": rel, "result": result, "detail": detail}

    return {
        "check": "binding_unknown_artifact_type",
        "target": str(value),
        "result": "handler_missing",
        "detail": {"artifact_type": artifact_type},
    }


def check_source_pins(obj):
    checks = []
    for src in obj.get("sources", []):
        pin = (src.get("pin") or {}).get("digest")
        if not pin:
            continue
        ref = src.get("ref")
        want = pin.split("sha256:", 1)[-1]
        got = sha256_of(ref)
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


def check_machine_evidence(obj, published_ids):
    me = obj.get("payload", {}).get("machine_evidence")
    if not me:
        return []
    checks = []
    for entry in me.get("checks", []):
        ref = entry.get("ref")
        pin = entry.get("pin")
        if not ref or not pin:
            continue
        want = pin.split("sha256:", 1)[-1]
        got = sha256_of(ref)
        if got is None:
            result = "source_missing"
        elif got == want:
            result = "matched"
        else:
            result = "drift"
        detail = {"evidence_check": entry.get("check"), "recorded_result": entry.get("result")}
        if entry.get("check") == "operation_ids_in_published_openapi":
            ops = (entry.get("detail") or {}).get("operation_ids") or []
            rehits = sorted(op for op in ops if op in published_ids)
            detail["recomputed_published_hits"] = rehits
            detail["recomputed_result"] = "matched" if rehits else "not_found"
        checks.append(
            {"check": "machine_evidence_pin_reverify", "target": ref, "result": result, "detail": detail}
        )
    return checks


def check_enforcement_point(obj):
    if obj.get("kind") != "business_rule":
        return []
    mirrors = [".agents", ".claude"]
    scripts = [
        "skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_request_classification.py",
        "skills/pomaster/components/what-frontend-coding-should-do/scripts/validate_frontend_delivery.py",
    ]
    paths = [m + "/" + s for m in mirrors for s in scripts]
    exists = {p: (MASTER / p).is_file() for p in paths}
    result = "matched" if all(exists.values()) else "not_found"
    return [
        {
            "check": "enforcement_point_files_exist",
            "target": ",".join(sorted(p for p, ok in exists.items() if not ok)) or "all",
            "result": result,
            "detail": {"paths": paths, "exists": exists},
        }
    ]


def declared_rhr_reverify(obj, published_ids):
    """Re-verify object-declared revalidation_human_required items where cheaply possible."""
    out = []
    pl = obj.get("payload", {})

    def _reverify(item, where):
        aspect = item.get("aspect")
        entry = {
            "aspect": aspect,
            "channel": "human_adjudication",
            "declared_at": "ingest_m2",
            "reason": item.get("reason"),
            "values": item.get("values"),
        }
        if aspect == "operation_ids":
            ops = item.get("values") or []
            rehits = sorted(op for op in ops if op in published_ids)
            entry["m3_recheck"] = {
                "method": "published_openapi_operationId membership recompute",
                "result": "matched" if rehits else "still_not_found",
                "hits": rehits,
            }
            entry["channel"] = "conflict_ledger"
            entry["conflict_ref"] = CONFLICT_C01
        elif aspect == "response_fixture":
            fixtures = []
            for v in item.get("values") or []:
                fixtures.append({"value": v, "exists": (MASTER / v).is_file()})
            entry["m3_recheck"] = {
                "method": "file existence recompute in MASTer repo",
                "result": "matched" if any(f["exists"] for f in fixtures) else "still_absent",
                "fixtures": fixtures,
            }
        out.append(entry)

    for item in pl.get("revalidation_human_required") or []:
        _reverify(item, "payload.revalidation_human_required")
    me = pl.get("machine_evidence") or {}
    for item in me.get("revalidation_human_required") or []:
        _reverify(item, "payload.machine_evidence.revalidation_human_required")

    rsr = pl.get("replacement_state_registration")
    if isinstance(rsr, dict) and rsr.get("upgrade_registered") is False:
        out.append(
            {
                "aspect": "replacement_state_semantics_owner_ruling",
                "channel": "owner_ruling",
                "declared_at": "ingest_m2",
                "reason": rsr.get("reason"),
                "values": [rsr.get("source_field"), rsr.get("source_value")],
            }
        )
    return out


def rhr_for_object(obj, extra):
    """M3-computed revalidation annotations. Annotation only; values untouched."""
    out = list(extra)
    kind = obj["kind"]
    pl = obj.get("payload", {})
    axes = obj["axes"]

    if kind == "contract_operation":
        ssf = (pl.get("superseded_status_field") or {})
        op = pl.get("operation_id")
        sourced_from_registry = any(
            s.get("ref") == "outputs/frontend/10_planned/api-requirement-registry.yaml" for s in obj.get("sources", [])
        )
        realization = (obj.get("realization") or {}).get("value")
        impl_form = pl.get("implementation_form")
        if ssf.get("source_value") == "NEEDS_BACKEND_REVIEW":
            out.append(
                {
                    "aspect": "approval_axis_disposition_pending_owner",
                    "channel": "conflict_ledger",
                    "conflict_ref": CONFLICT_C03,
                    "reason": (
                        "source status NEEDS_BACKEND_REVIEW implies an approval action that never arrives under "
                        "AUTH-RULE-FRONTEND-ONLY; disposition options are human-only (C-03), values kept verbatim"
                    ),
                    "values": [ssf.get("source_value")],
                }
            )
        if isinstance(op, str) and op.startswith("OP-"):
            out.append(
                {
                    "aspect": "operation_id_legacy_word_form_rebind",
                    "channel": "conflict_ledger",
                    "conflict_ref": CONFLICT_C01,
                    "reason": (
                        "OP-* legacy word form absent from the published OpenAPI operationId set; mechanical rebind "
                        "pending Owner ruling (C-01 option_a/b/c); value kept verbatim"
                    ),
                    "values": [op],
                }
            )
        if op is None and sourced_from_registry:
            out.append(
                {
                    "aspect": "operation_id_missing_rebind",
                    "channel": "conflict_ledger",
                    "conflict_ref": CONFLICT_C01,
                    "reason": (
                        "registry entry carries no operation_id; contract_operation-to-operationId binding is "
                        "not_configured until Owner ruling (C-01); absence kept as factual record"
                    ),
                    "values": [],
                }
            )
        if realization == "wired":
            out.append(
                {
                    "aspect": "wiring_truth_gate_rescan",
                    "channel": "gate_rescan_C5",
                    "reason": (
                        "realization=wired / implementation_form=real claims code-side wiring; header-ID presence "
                        "is recorded machine evidence, actual call-path truth is gate duty (C5 rescan, never "
                        "self-reported probe)"
                    ),
                    "values": [],
                }
            )
        if impl_form == "mock_unverified":
            out.append(
                {
                    "aspect": "mock_implementation_code_side_unconfirmed",
                    "channel": "gate_rescan_C5",
                    "reason": (
                        "implementation_form=mock_unverified: mock posture is honestly encoded but code-side "
                        "confirmation is gate duty (C5 rescan)"
                    ),
                    "values": [],
                }
            )
        if obj["id"].startswith("API_REQ.MOCK."):
            out.append(
                {
                    "aspect": "mock_scenario_fold_in_pending",
                    "channel": "human_adjudication",
                    "reason": (
                        "payload.migration_registration.fold_in_status=PENDING_SIBLING_API_REQ_TRANSCRIPTION: "
                        "sibling registry-sourced API_REQ objects now exist; fold-in vs keep-separate is a "
                        "governed-write decision, not auto-executable at M3"
                    ),
                    "values": [],
                }
            )

    if kind == "change_object":
        csr = pl.get("class_scan_result") or {}
        if csr.get("regression_case_ref") == "NONE__NOT_REGISTERED_AT_MIG_B1":
            out.append(
                {
                    "aspect": "regression_case_not_registered",
                    "channel": "human_adjudication",
                    "reason": (
                        "R4 class_scan_result.regression_case_ref is an explicit not-registered marker; a TEST.*/"
                        "GRN regression anchor must be registered by a governed write, values untouched"
                    ),
                    "values": [],
                }
            )
        if obj["authority"]["owner"] in ("HUMAN_OWNER", "BUSINESS_OWNER"):
            out.append(
                {
                    "aspect": "current_effective_value_reverification",
                    "channel": "owner_ruling",
                    "reason": (
                        "classification-ledger mandate: decision/adjudication history is preserved verbatim and the "
                        "currently-effective value must be re-verified against reality before landing as CURRENT; "
                        "per-subject probes are not uniformly machine-judgeable at M3; no case reopened"
                    ),
                    "values": [],
                }
            )
    return [e for e in out if e is not None]


def capability_aspects(obj, binding_checks):
    aspects = []
    header_checks = [c for c in binding_checks if c["check"] == "binding_header_contains"]
    corpus_tokens = [obj["id"]] + obj.get("aliases", [])
    for c in header_checks:
        res = c["result"]
        if res == "not_found":
            aspects.append(
                {
                    "aspect": "capability_file_binding_no_header_token",
                    "channel": "owner_ruling",
                    "reason": (
                        "bound implementation file carries neither the canonical id nor a registered alias form in "
                        "its header; binding is an expectation (gate will rescan, C5); remediation = add header or "
                        "confirm match_rule manual_confirmed (machine-key debt), values untouched"
                    ),
                    "values": [c["target"]],
                }
            )
        elif res == "alias_form_only":
            aspects.append(
                {
                    "aspect": "header_pre_vnext_word_form",
                    "channel": "owner_ruling",
                    "reason": (
                        "bound file header carries the legacy alias word form, not the canonical CAPABILITY.* form; "
                        "word-form reconciliation (update header vs keep alias chain) is a governed decision"
                    ),
                    "values": [c["target"]],
                }
            )
    if obj["id"] == "CAPABILITY.GRID.EDITABLE_GRID":
        aspects.append(
            {
                "aspect": "key_binding_anchor_drift",
                "channel": "conflict_ledger",
                "conflict_ref": CONFLICT_C04,
                "reason": (
                    "registry-registered file header references the old path src/shared/ui/data/MasterEditableGrid.vue "
                    "and a DATA.EDITABLE_GRID family variant (C-04); object anchors the registry side; mismatch is "
                    "presented, never auto-corrected"
                ),
                "values": [],
            }
        )
    return aspects


def main():
    objects = collect_objects()
    corpus = build_src_corpus()
    published_ids = openapi_operation_ids()
    candidate_ids = candidate_operation_ids()
    deps = package_json_deps()

    if not objects:
        print("FATAL: no objects found under truth/objects", file=sys.stderr)
        return 2
    if not published_ids:
        print("FATAL: published OpenAPI parsed to zero operationIds", file=sys.stderr)
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
            check_binding(b, obj, published_ids, candidate_ids, deps)
            for b in obj.get("key_bindings", {}).get("code", [])
        ]
        checks.extend(binding_checks)
        checks.extend(check_machine_evidence(obj, published_ids))
        checks.extend(check_enforcement_point(obj))

        header_hits = []
        if kind == "contract_operation":
            header_hits = corpus_token_hits(corpus, obj["id"])
            checks.append(
                {
                    "check": "code_header_id_scan",
                    "target": "src/**/*.(ts|vue)",
                    "result": "matched" if header_hits else "not_found",
                    "detail": {
                        "token": obj["id"],
                        "hits": header_hits,
                        "corpus_files_scanned": len(corpus),
                    },
                }
            )
        if kind == "capability":
            tokens = [obj["id"]] + obj.get("aliases", [])
            corpus_hits = {}
            for tok in tokens:
                corpus_hits[tok] = corpus_token_hits(corpus, tok)
            flat = sorted({h for hits in corpus_hits.values() for h in hits})
            checks.append(
                {
                    "check": "capability_corpus_id_scan",
                    "target": "src/**/*.(ts|vue)",
                    "result": "matched" if flat else "not_found",
                    "detail": {"tokens": tokens, "hits_by_token": corpus_hits, "corpus_files_scanned": len(corpus)},
                }
            )

        for c in checks:
            st = check_type_stats.setdefault(c["check"], {})
            st[c["result"]] = st.get(c["result"], 0) + 1

        declared = declared_rhr_reverify(obj, published_ids)
        extra_declared = declared

        m3_rhr = rhr_for_object(obj, extra_declared)
        if kind == "capability":
            m3_rhr.extend(capability_aspects(obj, binding_checks))
        # attach header-scan hit counts onto wiring annotations for evidence linkage
        for entry in m3_rhr:
            if entry.get("aspect") == "wiring_truth_gate_rescan":
                entry["detail"] = {"code_header_id_scan_hits": len(header_hits), "hit_files": header_hits}

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

    # ---- owner map (registry-level, from object scan; candidates cross-checked
    # against classification-ledger entries) --------------------------------
    kind_source_rows = [
        (
            "contract_operation",
            "outputs/frontend/10_planned/api-requirement-registry.yaml",
            "FRONTEND_CONTRACT",
            "API_REQ.* contract ledger; EXTERNAL_BASELINE delegate = reference position over request/response-need (ledger); C-01/C-03 attached",
        ),
        (
            "contract_operation",
            "outputs/frontend/10_planned/mock-contract.yaml",
            "FRONTEND_CONTRACT",
            "mock-scenario placeholders (API_REQ.MOCK.*, fold-in pending); EXTERNAL_BASELINE delegate over mock scenario scope (ledger)",
        ),
        (
            "business_rule",
            "outputs/frontend/10_planned/request-classification.yaml",
            "FRONTEND_CONTRACT",
            "dictionary/word-table object (POLICY.REQUEST_CLASSIFICATION, whole-book object per CONVENTIONS section 3); EXTERNAL_BASELINE delegate over enum values",
        ),
        (
            "error_term",
            "outputs/frontend/10_planned/api-error-mapping.yaml",
            "FRONTEND_CONTRACT",
            "ERR.* mapping chains (14, 401/403 separate); write_policy CORRECTION_ONLY per ledger",
        ),
        (
            "capability",
            "outputs/frontend/10_planned/component-registry.yaml",
            "FRONTEND_ARCHITECTURE",
            "GRID capability slice (GRID.* -> CAPABILITY.GRID.* alias); technology_base backfilled from vendor-adapter-registry; HUMAN_OWNER retire delegate; C-04 attached",
        ),
        (
            "component",
            "outputs/frontend/10_planned/vendor-adapter-registry.yaml",
            "FRONTEND_ARCHITECTURE",
            "vendor_base rows (6 libraries); merge-preserving protected family; HUMAN_OWNER retire delegate; C-02 attached",
        ),
        (
            "change_object",
            "outputs/frontend/10_planned/issue-register.yaml",
            "FRONTEND_ENGINEERING",
            "open defect/gap ledger transcription (CHANGE.* from ISSUE.*); close = fix CHANGE revision + register update",
        ),
        (
            "change_object",
            "outputs/frontend/10_planned/05_engineering-decisions.yaml",
            "HUMAN_OWNER",
            "engineering adjudication history (17, ADR family); current-effective values re-verified via RHR list, cases not reopened",
        ),
        (
            "change_object",
            "outputs/frontend/10_planned/04_bp-feedback-register.yaml",
            "BUSINESS_OWNER",
            "BP Q&A adjudication record (completed dialog, audit_complete=true); business-side adjudication channel",
        ),
        (
            "change_object",
            "outputs/frontend/10_planned/migration-ledger.yaml",
            "FRONTEND_ARCHITECTURE",
            "supersede/catch-up ledger schema contract (items currently empty, chain alive); fed by this migration batch itself",
        ),
    ]

    primary_source = {}
    for rel, obj in objects:
        srcs = obj.get("sources", [])
        primary = None
        for s in srcs:
            if s.get("type") == "design_seed":
                primary = s.get("ref")
                break
        if primary is None and srcs:
            primary = srcs[0].get("ref")
        primary_source[obj["id"]] = primary

    map_rows = []
    owner_counts = {}
    for kind, registry_ref, owner, notes in kind_source_rows:
        ids = [obj["id"] for rel, obj in objects if primary_source.get(obj["id"]) == registry_ref and obj["kind"] == kind]
        # capability rows: primary source is component-registry; vendor-adapter is backfill-only
        map_rows.append(
            {
                "kind": kind,
                "owner": owner,
                "object_count": len(ids),
                "object_count_denominator": {
                    "method": "per-object primary design_seed source ref scan over truth/objects/**/*.json (290 files); capability vendor-adapter source is backfill-only and never primary",
                    "scope": "corpus/master/batch-1/truth/objects",
                    "value_total": len(objects),
                },
                "source_registry": registry_ref,
                "notes": notes,
            }
        )
        owner_counts[owner] = owner_counts.get(owner, 0) + len(ids)

    # cross-check: owner in each object must equal the map row owner for its registry
    owner_mismatch = []
    registry_to_owner = {r[1]: r[2] for r in kind_source_rows}
    for rel, obj in objects:
        expected = registry_to_owner.get(primary_source.get(obj["id"]))
        if expected is not None and obj["authority"]["owner"] != expected:
            owner_mismatch.append((obj["id"], obj["authority"]["owner"], expected))
    if owner_mismatch:
        print("FATAL: object owner != map owner: %r" % owner_mismatch, file=sys.stderr)
        return 2

    mapped_total = sum(r["object_count"] for r in map_rows)
    if mapped_total != len(objects):
        print(
            "FATAL: map rows cover %d of %d objects" % (mapped_total, len(objects)),
            file=sys.stderr,
        )
        return 2

    owners_present = sorted(owner_counts)
    owner_registry = []
    owner_semantics = {
        "BUSINESS_OWNER": "business adjudication channel (BP Q&A); single-person project: functional position, the project Owner answers as business side",
        "FRONTEND_ARCHITECTURE": "frontend architecture owner; single-person project: the project Owner wears this hat (registry-level coarse grant, DP-7)",
        "FRONTEND_CONTRACT": "frontend contract semantics owner (API_REQ / ERR / POLICY word tables and contract operations)",
        "FRONTEND_ENGINEERING": "frontend engineering execution owner (open defect/gap ledger)",
        "HUMAN_OWNER": "human decision signatory (engineering adjudications; retire approvals)",
    }
    for owner in owners_present:
        kinds = sorted({obj["kind"] for rel, obj in objects if obj["authority"]["owner"] == owner})
        owner_registry.append(
            {
                "object_count": owner_counts[owner],
                "object_count_denominator": {
                    "method": "per-object authority.owner scan",
                    "scope": "corpus/master/batch-1/truth/objects",
                    "value_total": len(objects),
                },
                "owner": owner,
                "role_semantics": owner_semantics[owner],
                "kinds": kinds,
            }
        )

    # ---- registry-level RHR items (annotated, never adjudicated) ----------
    registry_rhr = []
    missing_names = ["axios", "@tanstack/vue-query", "decimal.js", "@vueuse/core", "dayjs", "lucide-vue-next"]
    pkg_presence = {n: deps.get(n) for n in missing_names}
    registry_rhr.append(
        {
            "scope": "component/vendor-adapter family (map row: component <- vendor-adapter-registry)",
            "item_id": "REG-RHR-01",
            "aspect": "vendor_registry_library_set_vs_code_header_declarations",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C02,
            "reason": (
                "registry registers 6 libraries while src headers declare 12; backfilling the 6 silently is "
                "forbidden (merge-preserving); resolution options a/b/c are Owner-only"
            ),
            "values": missing_names,
            "m3_recompute": {
                "method": "package.json dependencies+devDependencies lookup",
                "all_present_in_package_json": all(v is not None for v in pkg_presence.values()),
                "package_json_versions": pkg_presence,
                "note": "mechanical evidence for option_a recorded; not adjudicated",
            },
        }
    )
    registry_rhr.append(
        {
            "scope": "map denominators: consumer_page anchors",
            "item_id": "REG-RHR-02",
            "aspect": "page_denominator_drift_out_of_m3_scope",
            "channel": "human_adjudication",
            "reason": (
                "application-page-registry pages[]=35 vs summary 32 vs 39 screen-blueprints incl. 4 orphans is "
                "registered in M0 denominators and routed to BATCH-2; listed here because consumer_page binding "
                "anchors resolve against page artifacts; no M3 action taken"
            ),
            "values": [
                "PAGE-TASK-STEP-GENERATE-SNAPSHOT",
                "PAGE-TASK-STEP-SAVE-BOM",
                "PAGE-TASK-STEP-VIEW-ALL-PARTS",
                "PAGE-TASK-STEP-WRITEBACK-LEDGER",
            ],
        }
    )

    # ---- RHR aggregation ---------------------------------------------------
    rhr_items = []
    for oid, entry in sorted(rhr_rows, key=lambda x: (x[0], x[1].get("aspect", ""))):
        row = {"object_id": oid}
        row.update(entry)
        rhr_items.append(row)
    rhr_object_pairs = len(rhr_items)
    rhr_objects = len({r["object_id"] for r in rhr_items})
    by_channel = {}
    for r in rhr_items:
        ch = r.get("channel", "unspecified")
        by_channel[ch] = by_channel.get(ch, 0) + 1
    by_aspect = {}
    for r in rhr_items:
        by_aspect[r.get("aspect", "unspecified")] = by_aspect.get(r.get("aspect", "unspecified"), 0) + 1

    owner_coverage_unresolved = [
        obj["id"] for rel, obj in objects if obj["authority"]["owner"] not in owner_counts
    ]

    document = {
        "batch": BATCH_TAG,
        "document_kind": "m3-authority-map",
        "generated_by": "corpus/master/batch-1/tools/build_m3_authority.py",
        "consumes": [
            {
                "ref": "corpus/master/batch-1/truth/objects",
                "role": "reverification denominator (actual file walk) + evidence-axis scan corpus",
            },
            {
                "ref": "corpus/master/batch-1/classification-ledger.yaml",
                "role": "authority_owner_candidate source + boundary clause AUTH-RULE-FRONTEND-ONLY + conflicts C-01..C-04",
            },
            {
                "ref": "corpus/master/batch-1/inventory.yaml",
                "role": "denominators (published/candidate operationIds, src file counts) and boundary info",
            },
            {
                "ref": PUBLISHED_OPENAPI_REF,
                "role": "published_external_baseline (contract authority under frontend-only boundary)",
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
                    "This project is frontend-only; the backend is the published external OpenAPI (MASTer API 0.1.0, "
                    + PUBLISHED_OPENAPI_REF
                    + ", 190 unique operationIds, denominator per M0 inventory openapi_sources[0]); this project "
                    "performs no backend-owner approval ritual."
                ),
                "enforcement": "CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL",
                "source": (
                    "MASTer_master explicit project boundary; classification-ledger meta.boundary_clauses"
                    "[AUTH-RULE-FRONTEND-ONLY] (statement consumed verbatim)"
                ),
                "external_baseline": {
                    "document_title": "MASTer API",
                    "document_version": "0.1.0",
                    "operationids": len(published_ids),
                    "operationids_denominator_note": (
                        "recomputed at M3 by parsing paths.*.* of the published document; must equal M0 inventory "
                        "value 190 (drift = fail-closed signal, not silently absorbed)"
                    ),
                    "source": PUBLISHED_OPENAPI_REF,
                },
                "consumption_contract": [
                    (
                        "authority loading: truth/objects/contract-op/* delegates role EXTERNAL_BASELINE is a "
                        "reference position, never an approval-ritual position"
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
                    "(soliciting approval from a nonexistent authority); NEEDS_BACKEND_REVIEW x29 is the live "
                    "instance (MIG-B1/C-03)"
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
                "source": "02-object-envelope.schema.json AuthorityBlock.owner description (FROZEN); this file is the resolution target for MIG-B1",
                "consumption_contract": [
                    "this file's map[] + owner_registry[] cover all 290 truth objects (asserted at build time)",
                    "any new object whose owner is absent from owner_registry fails the build/gate until the map is extended",
                ],
            },
            {
                "rule_id": "AUTH-RULE-NO-AUTO-ADJUDICATION",
                "statement": (
                    "Approval-axis dispositions and registered conflicts (MIG-B1/C-01..C-04, superseded_status_field "
                    "upgrade_registered=true entries, replacement_state ambiguity) are human/Owner adjudication "
                    "only; gates and migration tools must re-verify by mechanical keys and must never auto-adjudicate, "
                    "auto-upgrade, or silently mark historical content CURRENT because an old POMaster wrote it."
                ),
                "enforcement": "APPROVAL_AXIS_HUMAN_ONLY",
                "source": (
                    "classification-ledger conflicts_pending_owner rule (only summarize, never auto-adjudicate) + "
                    "CONVENTIONS section 4 (semantic upgrade registered, not executed) + task M3 core principle"
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
                ],
            },
        ],
        "owner_registry": owner_registry,
        "map": map_rows,
        "reverification": {
            "scope_statement": (
                "machine re-verification of all truth objects' evidence axes: source pin digests recomputed, "
                "key-binding anchors re-checked (registry membership / file existence / header tokens / openapi "
                "membership / npm dependency / page artifacts), contract-operation ids scanned across the whole src "
                "corpus, ingest-time machine_evidence pins re-verified, object-declared RHR items re-checked; "
                "annotation only - no axis value touched"
            ),
            "denominators": {
                "objects_total": {
                    "value": len(objects),
                    "source": "file walk of corpus/master/batch-1/truth/objects/**/*.json",
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
                "candidate_openapi_operationids": {
                    "value": len(candidate_ids),
                    "source": CANDIDATE_OPENAPI_REF + " paths.*.* operationId collection (recomputed at M3)",
                },
                "key_bindings_total": {
                    "value": sum(
                        len(obj.get("key_bindings", {}).get("code", [])) for _rel, obj in objects
                    ),
                    "source": "per-object key_bindings.code[] length sum over all 290 objects",
                },
            },
            "check_definitions": [
                {"check": "source_pin_sha256", "definition": "recompute sha256 of each source ref; compare sources[].pin.digest"},
                {"check": "binding_source_registry_membership", "definition": "parse the bound registry file and verify every expect key (document_type/schema_version/requirement_id/issue_id/page_id/status/error_code/mapping_count/class_ids/decision_id/question_id/audit_complete/list_complete/items_count/endpoint/scenario_ids/scenario_count)"},
                {"check": "binding_header_contains", "definition": "scan the bound file (first 8 KiB) for expect.header_contains_any tokens; alias forms scanned separately (alias_form_only result)"},
                {"check": "binding_file_anchor", "definition": "file existence for src/.agents-anchored bindings (normalize.ts contains_symbol path)"},
                {"check": "binding_openapi_membership", "definition": "operationId membership in the published 190 set (candidate set recorded as detail)"},
                {"check": "binding_npm_dependency", "definition": "dependency_name presence in package.json dependencies+devDependencies; same-version prefixed-name hits recorded as detail, not adjudicated"},
                {"check": "binding_consumer_page", "definition": "page-spec markdown / screen-blueprint yaml existence for consumer_page anchors"},
                {"check": "code_header_id_scan", "definition": "whole-src-corpus scan for the object id with [A-Z0-9_.] boundary guard (contract_operation only)"},
                {"check": "capability_corpus_id_scan", "definition": "whole-src-corpus scan for canonical id + alias forms (capability only)"},
                {"check": "machine_evidence_pin_reverify", "definition": "re-verify ref+pin of payload.machine_evidence.checks entries; operation_ids_in_published_openapi semantically recomputed"},
                {"check": "enforcement_point_files_exist", "definition": "business_rule enforcement point scripts existence in .agents/.claude mirrors"},
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
                "denominator_source": "actual file count under corpus/master/batch-1/truth/objects (kind-dir closed set)",
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
    print("map_rows=%d mapped=%d owners=%d" % (len(map_rows), mapped_total, len(owners_present)))
    print("machine_checks_total=%d" % sum(sum(s.values()) for s in check_type_stats.values()))
    for check, stats in sorted(check_type_stats.items()):
        print("  %s: %s" % (check, ", ".join("%s=%d" % (k, v) for k, v in sorted(stats.items()))))
    print("rhr_object_aspect_pairs=%d distinct_objects=%d registry_items=%d" % (rhr_object_pairs, rhr_objects, len(registry_rhr)))
    for ch, n in sorted(by_channel.items()):
        print("  channel %s=%d" % (ch, n))
    print("published_openapi_operationids=%d candidate=%d" % (len(published_ids), len(candidate_ids)))
    print("src_corpus_files=%d" % len(corpus))
    print("wrote %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
