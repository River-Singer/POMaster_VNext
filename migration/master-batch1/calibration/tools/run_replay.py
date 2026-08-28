# -*- coding: utf-8 -*-
"""对 samples.json 逐样本回放 POMaster_VNext Router（@pomaster/cli triage），产出 replay-results.json。

- 判定通路与 benchmarks/tiny.mjs、benchmarks/normal.mjs 一致：node packages/cli/dist/bin.js triage <text> --json。
- 幂等：同输入 byte-identical；不采集墙钟（durationMs 禁入），不采集时间戳。
- 只读消费 samples.json 与 MASTer_master（后者本脚本完全不触碰）；唯一产物为 ../replay-results.json。
"""
import io
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
CALIB_DIR = os.path.abspath(os.path.join(HERE, ".."))
SAMPLES_PATH = os.path.join(CALIB_DIR, "samples.json")
OUT_PATH = os.path.join(CALIB_DIR, "replay-results.json")
CLI_BIN = os.path.abspath(
    os.path.join(CALIB_DIR, "..", "..", "..", "packages", "cli", "dist", "bin.js")
)

PROFILES = ("MINIMAL", "LIGHT", "STANDARD")


def run_triage(title: str) -> dict:
    proc = subprocess.run(
        ["node", CLI_BIN, "triage", title, "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    entry = {"cli_returncode": proc.returncode}
    envelope = None
    try:
        envelope = json.loads(proc.stdout)
    except (ValueError, TypeError):
        entry["envelope_ok"] = False
        entry["stderr_snippet"] = (proc.stderr or "")[:500]
        entry["stdout_snippet"] = (proc.stdout or "")[:500]
        return entry
    entry["envelope_ok"] = True
    entry["envelope_command"] = envelope.get("command")
    entry["envelope_ok_flag"] = envelope.get("ok")
    result = envelope.get("result") or {}
    entry["profile"] = result.get("profile")
    entry["evidence_grade"] = result.get("evidence_grade")
    entry["matched_rule"] = result.get("matched_rule")
    entry["matched_keywords"] = list(result.get("matched_keywords") or [])
    entry["absent_signals"] = list(result.get("absent_signals") or [])
    entry["ttl_hours"] = result.get("ttl_hours")
    entry["warnings"] = list(envelope.get("warnings") or [])
    entry["errors"] = list(envelope.get("errors") or [])
    return entry


def main() -> None:
    with io.open(SAMPLES_PATH, encoding="utf-8") as f:
        samples_doc = json.load(f)

    if not os.path.exists(CLI_BIN):
        raise SystemExit("cli-bin-missing: packages/cli/dist/bin.js 不存在，先构建 @pomaster/cli")

    records = []
    n_consistent = 0
    n_deviation = 0
    n_error = 0
    for sample in samples_doc["samples"]:
        actual = run_triage(sample["title"])
        profile = actual.get("profile")
        if profile is None:
            agreement = "error"
            n_error += 1
        elif profile == sample["expected_profile"]:
            agreement = "consistent"
            n_consistent += 1
        else:
            agreement = "deviation"
            n_deviation += 1
        records.append(
            {
                "replay_id": sample["replay_id"],
                "source_task_dir": sample["source_task_dir"],
                "category": sample["category"],
                "title": sample["title"],
                "expected_class": sample["expected_class"],
                "expected_profile": sample["expected_profile"],
                "actual": actual,
                "agreement": agreement,
            }
        )

    doc = {
        "schema": "pomaster.vnext.migration.replay-results/1",
        "batch": "MIG-B1",
        "purpose": "bench-0002 provision 二轮校准：MASTer 语料逐样本 Router 回放实测（期望档预注册于 samples.json）",
        "preregistration_ref": "samples.json（expected_profile 于 Router 运行前落盘）",
        "router_threshold_source": "packages/cli/src/triage.ts（TRIAGE_ESCALATION_KEYWORDS / TRIAGE_COPY_STYLE_KEYWORDS；bench-0002 approved 关键词规则）",
        "wall_clock_note": "墙钟禁入：本文件不采集时间戳与耗时；回放序以 replay_id 标识",
        "summary": {
            "total": len(records),
            "consistent": n_consistent,
            "deviation": n_deviation,
            "error": n_error,
            "denominator_source": "samples.json samples[]（本文件 records 全集）",
        },
        "records": records,
    }

    payload = json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    with io.open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)
    print("written:", OUT_PATH)
    print("summary:", json.dumps(doc["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
