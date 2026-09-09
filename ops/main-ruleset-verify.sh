#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# main ruleset 验证脚本（T4 R2 · 09-08-sc-t4；配套 ops/main-ruleset-apply.sh）
#
# 用法：
#   bash ops/main-ruleset-verify.sh                # 全量验证（逐项 PASS/FAIL，
#                                                  # 任一 FAIL 退出码 1）
#   bash ops/main-ruleset-verify.sh --list         # 列出仓库全部 rulesets
#                                                  # （id/name/enforcement——回滚取 id）
#   bash ops/main-ruleset-verify.sh --list-checks  # 列出 main 最新 commit 的真实
#                                                  # check-run 名（填 apply 脚本
#                                                  # REQUIRED_CHECKS 前的核对步）
#
# 验证项（全量模式）：
#   1. ruleset main-protected 在座且 enforcement=active；
#   2. target=branch，conditions 含 ~DEFAULT_BRANCH；
#   3. required_status_checks 含 REQUIRED_CHECKS 全部 context（integration_id=15368）；
#   4. pull_request 规则在座（禁直推 main 的机器形态）；
#   5. deletion + non_fast_forward 规则在座（防删防强推）；
#   6. bypass：Repository admin 仅 pull_request 通道旁路。
#
# 直推被拒的实弹演练（人工步骤，见 ops/README.md §演练）：本脚本验证配置在座；
# 「push 真被拒」是行为断言，按 runbook 的 drill 流程实弹验证一次。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${POMASTER_REPO:-River-Singer/POMaster_VNext}"
RULESET_NAME="main-protected"
ACTIONS_INTEGRATION_ID=15368

# 与 ops/main-ruleset-apply.sh 中 REQUIRED_CHECKS 保持同词形（两处同步修改）。
REQUIRED_CHECKS=(
  "ci (ubuntu-latest)"
  "ci (windows-latest)"
  "ci (macos-latest)"
  "bootstrap-clean"
)

command -v gh >/dev/null 2>&1 || {
  echo "::error::gh CLI 不在 PATH——先 winget install GitHub.cli && gh auth login（见 ops/README.md）。" >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "::error::node 不在 PATH（判卷解析需要）。" >&2
  exit 1
}

MODE="${1:---all}"

# --list：列出全部 rulesets（回滚取 id 用）。
if [ "${MODE}" = "--list" ]; then
  echo "== ${REPO} 全部 rulesets =="
  gh api "repos/${REPO}/rulesets" \
    --jq '.[] | "\(.id)\t\(.name)\t\(.target)\t\(.enforcement)"'
  exit 0
fi

# --list-checks：列出 main 最新 commit 的 check-run 名（核对 REQUIRED_CHECKS 词形）。
if [ "${MODE}" = "--list-checks" ]; then
  SHA="$(gh api "repos/${REPO}/commits/main" --jq '.sha')"
  echo "== main HEAD ${SHA:0:12} 的 check-run 名 =="
  gh api "repos/${REPO}/commits/${SHA}/check-runs" --paginate \
    --jq '.check_runs[] | "\(.name)\t\(.app.slug // "?")\t\(.status)\t\(.conclusion // "-")"' \
    | sort -u
  echo "== 核对：以上名称与 ops/main-ruleset-apply.sh 的 REQUIRED_CHECKS 逐字一致后，"
  echo "   再执行 bash ops/main-ruleset-apply.sh --apply（check 名以 main 最近一次绿 CI run 为准）。"
  exit 0
fi

if [ "${MODE}" != "--all" ]; then
  echo "用法: bash ops/main-ruleset-verify.sh [--all|--list|--list-checks]" >&2
  exit 2
fi

echo "== 验证 ${REPO} 的 ruleset「${RULESET_NAME}」=="

# ① ruleset 在座性（列表按名检索；详情 rules/bypass_actors 只在单体端点）。
RULESET_ID="$(gh api "repos/${REPO}/rulesets" | node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const list = JSON.parse(readFileSync(0, "utf8"));
  const found = list.find((r) => r.name === process.argv[1]);
  process.stdout.write(found === undefined ? "" : String(found.id));
' "${RULESET_NAME}")"

if [ -z "${RULESET_ID}" ]; then
  echo "  [FAIL] ruleset「${RULESET_NAME}」不在座——先跑 ops/main-ruleset-apply.sh --apply"
  echo "== 结果：FAIL =="
  exit 1
fi
echo "  [PASS] ruleset「${RULESET_NAME}」在座（id=${RULESET_ID}）"

# ② 详情判卷（node 单点判卷：任一 FAIL → 退出码 1；结构化输出逐项 PASS/FAIL）。
gh api "repos/${REPO}/rulesets/${RULESET_ID}" | node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const detail = JSON.parse(readFileSync(0, "utf8"));
  // node -e 形态：argv[1..] = required checks 词形数组，末位 = integration id。
  const argv = process.argv.slice(1);
  const integrationId = Number(argv.pop());
  const requiredChecks = argv;
  let failCount = 0;

  const push = (pass, message) => {
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${message}`);
    if (!pass) failCount += 1;
  };

  push(detail.enforcement === "active", `enforcement=active（实际 ${detail.enforcement}）`);
  push(detail.target === "branch", `target=branch（实际 ${detail.target}）`);
  const include = detail.conditions?.ref_name?.include ?? [];
  push(
    include.includes("~DEFAULT_BRANCH"),
    `conditions 含 ~DEFAULT_BRANCH（实际 ${JSON.stringify(include)}）`,
  );

  const rules = detail.rules ?? [];
  const byType = Object.fromEntries(rules.map((r) => [r.type, r]));
  push("required_status_checks" in byType, "required_status_checks 规则在座");
  push("pull_request" in byType, "pull_request 规则在座（禁直推 main 的机器形态）");
  push("deletion" in byType, "deletion 规则在座（防删）");
  push("non_fast_forward" in byType, "non_fast_forward 规则在座（防强推）");

  const actualChecks =
    byType.required_status_checks?.parameters?.required_status_checks ?? [];
  for (const context of requiredChecks) {
    const hit = actualChecks.find((c) => c.context === context);
    push(
      hit !== undefined && hit.integration_id === integrationId,
      `required check「${context}」在座（integration_id=${integrationId}）`,
    );
  }
  const extra = actualChecks
    .map((c) => c.context)
    .filter((c) => !requiredChecks.includes(c));
  if (extra.length > 0) {
    console.log(
      `  [NOTE] 另有未预期的 required checks：${extra.join("；")}（如非有意配置请人工复核）`,
    );
  }

  const bypass = detail.bypass_actors ?? [];
  const adminPr = bypass.find(
    (b) =>
      b.actor_type === "RepositoryRole" &&
      b.actor_id === 1 &&
      b.bypass_mode === "pull_request",
  );
  push(adminPr !== undefined, "bypass：Repository admin 仅 pull_request 通道旁路（直推不豁免）");

  if (failCount > 0) {
    console.log(`== 结果：FAIL（${failCount} 项未过）==`);
    process.exit(1);
  }
  console.log("== 结果：全部 PASS ==");
' "${REQUIRED_CHECKS[@]}" "${ACTIONS_INTEGRATION_ID}"
