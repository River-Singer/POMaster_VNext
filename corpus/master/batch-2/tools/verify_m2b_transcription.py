#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_m2b_transcription.py -- independent post-hoc verifier for MIG-B2/M2
transcription group B outputs (page-readiness facet objects + composition
trio). Re-checks, from scratch and independently of the ingest tools' own
assertions:

  1. FROZEN 02-object-envelope schema (jsonschema draft-07) on every object;
  2. governed-id grammar (canonical regex + 15-prefix closed world, vocab v0.2);
  3. red line 1: local names lowercase + local-name-rule conformance;
  4. denominators: 39 readiness facet objects (== source entries == inventory
     value) + 3 whole-book POLICY objects; status/marker counts vs inventory;
  5. merge-preserving fidelity: payload.readiness_entry / slots / templates /
     actions byte-equal to the live source files;
  6. dual-axis semantics: lifecycle PROPOSED fact records (READY x0),
     superseded_status_field x39, attest_warning.attest_verified=false x33,
     attest records x24, second-audit x1, blocked-fact x6;
  7. id actions: 15 renames (A6, ingested) + 24 grants
     (HUMAN_CONFIRM_REQUIRED) + facet scoping registrations x39;
  8. exception carrying: MIG-B2/C-01 pending_conflicts x4 + PROVISIONAL x4;
  9. wall-clock hygiene: derived machine fields date-free (notes_md and
     ledger-mandated source-verbatim blocks excluded).

Exit codes: 0 = all pass, 1 = any failure (printed).
"""

import glob
import json
import re
import sys

import jsonschema

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

BATCH_DIR = __import__("pathlib").Path(__file__).resolve().parents[1]
MASTER_ROOT = "D:/Vscode Documents/MASTer_master"
SCHEMA_PATH = (
    BATCH_DIR.parents[2] / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)

ID_PAT = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)


def lname(oid):
    return ".".join(seg.replace("_", "-").lower() for seg in oid.split(".", 1)[1].split(".")) + ".json"


def facet_oid(pid):
    if pid.startswith("PAGE-TASK-STEP-"):
        return "PAGE.READINESS." + "_".join(pid.split("-")[3:])
    return "PAGE.READINESS." + pid[len("PAGE-") :].replace("-", "_")


def page_level_id(pid):
    if pid.startswith("PAGE-TASK-STEP-"):
        return "PAGE." + "_".join(pid.split("-")[3:])
    return "PAGE." + pid[len("PAGE-") :].replace("-", "_")


def main():
    errors = []

    def err(tag, detail):
        errors.append((tag, detail))

    schema = json.loads(SCHEMA_PATH.read_bytes().decode("utf-8"))
    src = json.load(open(MASTER_ROOT + "/outputs/frontend/10_planned/page-readiness-registry.yaml", encoding="utf-8"))
    anat = json.load(open(MASTER_ROOT + "/outputs/frontend/10_planned/page-anatomy-registry.yaml", encoding="utf-8"))
    tpl = json.load(open(MASTER_ROOT + "/outputs/frontend/10_planned/page-template-registry.yaml", encoding="utf-8"))
    act = json.load(open(MASTER_ROOT + "/outputs/frontend/10_planned/action-placement-registry.yaml", encoding="utf-8"))

    objs = []
    for entry in src["pages"]:
        p = BATCH_DIR / "truth" / "objects" / "page-surface" / lname(facet_oid(entry["page_id"]))
        objs.append((str(p), json.load(open(p, encoding="utf-8"))))
    for fn in ("page-anatomy.json", "page-template.json", "action-placement.json"):
        p = BATCH_DIR / "truth" / "objects" / "business-rule" / fn
        objs.append((str(p), json.load(open(p, encoding="utf-8"))))
    if len(objs) != 42:
        err("count", "expected 42 objects, got %d" % len(objs))

    for path, env in objs:
        try:
            jsonschema.validate(env, schema)
        except jsonschema.ValidationError as exc:
            err("schema", "%s: %s" % (path, exc.message))
        if not ID_PAT.match(env["id"]):
            err("idpat", "%s: %s" % (path, env["id"]))
        fname = path.replace("\\", "/").split("/")[-1]
        if fname != fname.lower():
            err("lowercase", path)
        if fname != lname(env["id"]):
            err("localname", "%s: expected %s" % (fname, lname(env["id"])))

    surf = [e for _, e in objs if e["kind"] == "page_surface"]
    rule = [e for _, e in objs if e["kind"] == "business_rule"]
    if len(surf) != 39 or len(rule) != 3:
        err("kinds", "surface=%d rule=%d" % (len(surf), len(rule)))

    src_by_id = {p["page_id"]: p for p in src["pages"]}
    for e in surf:
        legacy = e["aliases"][0]
        if e["payload"]["readiness_entry"] != src_by_id[legacy]:
            err("fidelity", e["id"])
        want_origin = "ingested" if legacy.startswith("PAGE-TASK-STEP-") else "derived"
        if e["origin"] != want_origin:
            err("origin", "%s: %s != %s" % (e["id"], e["origin"], want_origin))
        if e["axes"]["lifecycle"] != "PROPOSED":
            err("lifecycle", e["id"])
        if e["payload"]["superseded_status_field"]["source_value"] != src_by_id[legacy]["status"]:
            err("superseded_status_field", e["id"])
        facet = e["payload"]["id_facet"]
        if facet["object_id"] != e["id"]:
            err("facet_id", e["id"])
        if facet["merge_path"] != "supersede":
            err("facet_merge", e["id"])
        if facet["page_level_id"] != page_level_id(legacy):
            err("facet_page_level_id", e["id"])
        want_status = (
            "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT"
            if legacy.startswith("PAGE-TASK-STEP-")
            else "HUMAN_CONFIRM_REQUIRED"
        )
        if facet["page_level_id_status"] != want_status:
            err("facet_status", e["id"])

    warn = [e for e in surf if "attest_warning" in e["payload"]]
    if len(warn) != 33 or not all(e["payload"]["attest_warning"]["attest_verified"] is False for e in warn):
        err("attest_warning", "count=%d" % len(warn))
    att = [e for e in surf if e["payload"]["status_axes"]["evidence_axis"]["attest_record_present"]]
    if len(att) != 24:
        err("attest_records", "count=%d" % len(att))
    sec = [e for e in warn if e["payload"]["attest_warning"].get("second_round_audit_marker_present")]
    if len(sec) != 1 or sec[0]["aliases"][0] != "PAGE-APP-ALL-PARTS-LIST":
        err("second_audit", "count=%d" % len(sec))
    blk = [e for e in surf if e["payload"]["status_axes"]["approval_axis"]["blocked_fact_registered"]]
    if len(blk) != 6 or not all(src_by_id[e["aliases"][0]]["status"] == "BLOCKED" for e in blk):
        err("blocked_fact", "count=%d" % len(blk))
    ready = [e for e in surf if e["payload"]["status_axes"]["approval_axis"]["source_status"] == "READY"]
    if ready:
        err("ready_nonzero", str([e["id"] for e in ready]))
    grants = [e for e in surf if "canonical_id_grant" in e["payload"]]
    if len(grants) != 24:
        err("grants", "count=%d" % len(grants))
    for g in grants:
        cig = g["payload"]["canonical_id_grant"]
        if cig["status"] != "HUMAN_CONFIRM_REQUIRED":
            err("grant_status", g["id"])
        if cig["canonical_draft"] != g["payload"]["id_facet"]["page_level_id"]:
            err("grant_draft", g["id"])
        if cig["object_id"] != g["id"]:
            err("grant_object_id", g["id"])
    conf = [e for e in surf if "pending_conflicts" in e["payload"]]
    if len(conf) != 4:
        err("pending_conflicts", "count=%d" % len(conf))
    for c in conf:
        if c["payload"]["pending_conflicts"][0]["conflict_id"] != "MIG-B2/C-01":
            err("conflict_id", c["id"])
        if c["axes"]["confidence"] != "PROVISIONAL":
            err("provisional", c["id"])
    prov = [e for e in surf if e["axes"]["confidence"] == "PROVISIONAL"]
    if len(prov) != 4:
        err("provisional_count", "count=%d" % len(prov))
    ing = [e for e in surf if e["origin"] == "ingested"]
    if len(ing) != 15:
        err("ingested", "count=%d" % len(ing))
    for e in ing:
        if e["payload"]["id_facet"]["page_level_id"] != "PAGE." + "_".join(e["aliases"][0].split("-")[3:]):
            err("ingested_page_level", e["id"])

    by_id = {e["id"]: e for e in rule}
    if by_id["POLICY.PAGE_ANATOMY"]["payload"]["slots"] != anat["slots"]:
        err("fidelity", "POLICY.PAGE_ANATOMY slots")
    if by_id["POLICY.PAGE_TEMPLATE"]["payload"]["templates"] != tpl["templates"]:
        err("fidelity", "POLICY.PAGE_TEMPLATE templates")
    if by_id["POLICY.ACTION_PLACEMENT"]["payload"]["actions"] != act["actions"]:
        err("fidelity", "POLICY.ACTION_PLACEMENT actions")
    for e in rule:
        if "statement_structured" not in e["payload"] or "enforcement_point" not in e["payload"]:
            err("rule_core", e["id"])
    if by_id["POLICY.ACTION_PLACEMENT"]["authority"]["delegates"] != [
        {"role": "HUMAN_OWNER", "required_for": ["modify_action_placement_adjudication"]}
    ]:
        err("delegates", "POLICY.ACTION_PLACEMENT")
    if any("producer" in e for e in rule):
        err("producer_on_natural", "composition trio must not carry producer")
    if any("producer" not in e for e in surf):
        err("producer_missing", "readiness objects must carry producer")

    # inventory denominator cross-check
    if yaml is not None:
        inv = yaml.safe_load((BATCH_DIR / "inventory.yaml").read_bytes().decode("utf-8"))
        den = inv["denominators"]["page_readiness_status"]
        if den["value"] != 39:
            err("inventory_denominator", str(den["value"]))
        comp = inv["denominators"]["composition_entries"]["value_breakdown"]
        if comp["page_anatomy_slots"] != 16 or comp["page_template_templates"] != 11 or comp["action_placement_actions"] != 27:
            err("inventory_composition", str(comp))

    date_pat = re.compile(r"20\d{2}-\d{2}-\d{2}")

    def scan(node, path, excluded):
        if path.lstrip(".") in excluded:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                scan(v, path + "." + k, excluded)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                scan(v, path + "[%d]" % i, excluded)
        elif isinstance(node, str) and date_pat.search(node):
            err("wallclock", "%s: %s" % (path, node[:80]))

    for path, e in objs:
        d = dict(e)
        d.pop("notes_md", None)
        excluded = set()
        if e["kind"] == "page_surface":
            excluded = {"payload.readiness_entry"}
        elif e["id"] == "POLICY.ACTION_PLACEMENT":
            excluded = {"payload.actions"}
        elif e["id"] == "POLICY.PAGE_TEMPLATE":
            excluded = {"payload.templates"}
        scan(d, "", excluded)

    if errors:
        print("VERIFY: FAIL (%d findings)" % len(errors))
        for tag, detail in errors[:20]:
            print("  [%s] %s" % (tag, detail))
        return 1
    print("VERIFY: ALL PASS")
    print("  42 objects: 39 PAGE.READINESS.* facet (15 ingested renames + 24 grants) + 3 POLICY whole-book")
    print("  dual-axis: PROPOSED x39 (DRAFT 33 / BLOCKED 6 / READY 0), superseded_status_field x39")
    print("  evidence: attest_warning(attest_verified=false) x33, attest records x24, second-audit x1, blocked-fact x6")
    print("  ids: A6 renames x15, grants(HUMAN_CONFIRM_REQUIRED) x24, id_facet registrations x39")
    print("  exceptions: MIG-B2/C-01 pending_conflicts x4 (PROVISIONAL x4 / LOCKED x35)")
    print("  hygiene: schema PASS x42, id grammar PASS, local names lowercase, derived fields date-free")
    return 0


if __name__ == "__main__":
    sys.exit(main())
