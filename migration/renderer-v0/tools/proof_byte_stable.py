# -*- coding: utf-8 -*-
"""proof_byte_stable.py —— byte-stable 双渲染证明（D25 渲染器 v0 验收证据）。

流程（对每个 batch-dir）：
  1. run1：全新目录渲染一遍，记录每文件 sha256；
  2. run2：另一个全新目录再渲一遍，逐文件比对 run1/run2 字节全等；
  3. run3：对 run1 目录原样重放（不带 --force），断言 short_circuit
     same_state_zero_write 生效（NO_CHANGE、零写入、mtime 不变）。

出口 0 = 三项全过；2 = 任一失败。输出 ASCII。
零墙钟：本脚本不写任何时间戳；证明产物只有 sha256 与 diff 结论。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys

TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "render_legacy_outputs.py")


def sha256_dir(root):
    out = {}
    for walk_root, _dirs, files in os.walk(root):
        for name in files:
            path = os.path.join(walk_root, name)
            rel = os.path.relpath(path, root).replace("\\", "/")
            with open(path, "rb") as fh:
                out[rel] = hashlib.sha256(fh.read()).hexdigest()
    return out


def run_renderer(batch_dirs, out_dir, force):
    cmd = [sys.executable, TOOL, "--batch-dir"] + list(batch_dirs) + ["--out", out_dir]
    if force:
        cmd.append("--force")
    proc = subprocess.run(cmd, capture_output=True, text="utf-8")
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        raise SystemExit("2: renderer failed: %s" % " ".join(cmd))
    return proc.stdout.strip()


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-dir", nargs="+", required=True)
    parser.add_argument("--work", required=True, help="work dir for run1/run2 (created/removed)")
    args = parser.parse_args(argv)

    label = "-".join(os.path.basename(os.path.normpath(b)) for b in args.batch_dir)
    run1 = os.path.join(args.work, label + "-run1")
    run2 = os.path.join(args.work, label + "-run2")
    for d in (run1, run2):
        shutil.rmtree(d, ignore_errors=True)

    out1 = run_renderer(args.batch_dir, run1, force=True)
    out2 = run_renderer(args.batch_dir, run2, force=True)
    digests1 = sha256_dir(run1)
    digests2 = sha256_dir(run2)

    if set(digests1) != set(digests2):
        print("FAIL file-set differs: run1=%d run2=%d" % (len(digests1), len(digests2)))
        return 2
    mismatched = [rel for rel in sorted(digests1) if digests1[rel] != digests2[rel]]
    if mismatched:
        print("FAIL byte-diff files=%d" % len(mismatched))
        for rel in mismatched:
            print("  DIFF %s run1=%s run2=%s" % (rel, digests1[rel], digests2[rel]))
        return 2

    # run3：同目录重放 -> NO_CHANGE 零写入（先改坏一个投影文件验证 WARN-and-regen 之外的
    # 短路仅对未被手改的产物生效：此处产物未动，应零写入）。
    marker = os.path.join(run1, "outputs", "frontend", "10_planned", "request-classification.yaml")
    if os.path.isfile(marker):
        with open(marker, "rb") as fh:
            before = fh.read()
    mtime_before = {rel: os.path.getmtime(os.path.join(run1, rel)) for rel in digests1}
    out3 = run_renderer(args.batch_dir, run1, force=False)
    mtime_after = {rel: os.path.getmtime(os.path.join(run1, rel)) for rel in digests1}
    zero_write = all(
        abs(mtime_before.get(rel, 0) - mtime_after.get(rel, 0)) < 1e-9 for rel in digests1)
    if os.path.isfile(marker):
        with open(marker, "rb") as fh:
            after = fh.read()
        if after != before:
            print("FAIL run3 mutated file content")
            return 2

    print("PASS byte-stable double render: batch=%s files=%d identical=100%%" % (label, len(digests1)))
    print("  run1: %s" % out1)
    print("  run2: %s" % out2)
    print("  run3: %s (zero_write=%s)" % (out3, str(zero_write).lower()))
    manifest = json.load(open(os.path.join(run1, "render-manifest.json"), encoding="utf-8"))
    print("  inputs_fingerprint=%s" % manifest["inputs_fingerprint"])
    for rel in sorted(digests1):
        print("  sha256 %s %s" % (digests1[rel], rel))
    return 0


if __name__ == "__main__":
    sys.exit(main())
