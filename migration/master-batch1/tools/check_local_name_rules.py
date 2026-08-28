#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_local_name_rules.py -- MIG-B1 one-shot self-check: every file under
migration/master-batch1/truth/objects/<kind-dir>/<name>.json must satisfy the
CONVENTIONS section 1 local-name rule.

Rule (reference implementation examples/tiny-tool/.pomaster/truth/objects/
capability/csv-tool.serialize-rows.json, id=CAPABILITY.CSV_TOOL.SERIALIZE_ROWS;
self-contained example POLICY.REQUEST_CLASSIFICATION -> request-classification.json):
expected local name = object id without its governed prefix -> every remaining
segment: underscores -> hyphens -> whole thing lowercased -> segments joined
with '.' -> + '.json'.

Exit codes: 0 = all filenames conform; 2 = at least one violation (printed).
"""

import json
import sys
from pathlib import Path

BATCH_DIR = Path(__file__).resolve().parents[1]
OBJECTS_DIR = BATCH_DIR / "truth" / "objects"


def expected_local_name(object_id):
    rest = object_id.split(".", 1)[1]
    return ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"


def main():
    checked = 0
    violations = []
    for kind_dir in sorted(p for p in OBJECTS_DIR.iterdir() if p.is_dir()):
        for path in sorted(kind_dir.glob("*.json")):
            obj = json.loads(path.read_bytes().decode("utf-8"))
            object_id = obj["id"]
            want = expected_local_name(object_id)
            checked += 1
            if path.name != want or path.name != path.name.lower():
                violations.append(
                    "%s: id=%s expected=%s" % (path.relative_to(BATCH_DIR).as_posix(), object_id, want)
                )
    print("checked=%d files under truth/objects/" % checked)
    if violations:
        for v in violations:
            print("[violation] %s" % v)
        print("[fail] %d filename rule violations" % len(violations))
        return 2
    print("[ok] all filenames conform to CONVENTIONS section 1 local-name rule")
    return 0


if __name__ == "__main__":
    sys.exit(main())
