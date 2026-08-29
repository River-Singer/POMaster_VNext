# -*- coding: utf-8 -*-
"""build_pack.py —— M6 证据包汇编入口（委托实现）。

契约（PACK-CONTRACT §3）钉死的实现文件为同目录 build_m6_evidence.py；
本文件是任务侧交付名 build_pack.py 的薄委托入口：argv 原样转发，行为完全等价。

用法（与 build_m6_evidence.py 相同）：
  python build_pack.py            # 汇编/重汇编（同态零写入；变化则 seq+1 重写）
  python build_pack.py --check    # 双跑 byte-stable + 不变式自检 + 现盘 drift 比对
"""

import os
import runpy
import sys

_IMPLEMENTATION = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "build_m6_evidence.py")

if __name__ == "__main__":
    runpy.run_path(_IMPLEMENTATION, run_name="__main__")
    # runpy 内部已 sys.exit；仅在其直接返回（非 __main__ 语义）时兜底
    sys.exit(0)
