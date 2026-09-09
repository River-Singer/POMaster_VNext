#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# main ruleset 应用脚本（T4 R2 · 09-08-sc-t4）
#
# 定位：AI 不改远端 GitHub 配置——本脚本是 Owner 手工操作的机器形态（纯产出物，
# 不进 CI、不由测试执行）。按 research/github-release-gating.md 方案 D 落地：
# main 分支 ruleset = required status checks（ci.yml 关键 job）+ 禁直推（require
# pull request）+ 防删防强推；与 R1（方案 A workflow_call + needs）正交叠加。
#
# 用法：
#   bash ops/main-ruleset-apply.sh --dry-run   # 默认：只打印将提交的 API 调用与
#                                              # JSON 体（零远端写入）
#   bash ops/main-ruleset-apply.sh --apply     # 实际创建/更新 ruleset（幂等：
#                                              # 同名 ruleset 在座则 PUT 就地更新）
#
# 前置（见 ops/README.md）：
#   gh CLI 已安装（winget install GitHub.cli）且 `gh auth login` 完成；
#   应用前先跑 `bash ops/main-ruleset-verify.sh --list-checks` 核对 REQUIRED_CHECKS
#   与真实 check-run 名逐字一致（GitHub 侧名称若有出入，改下方数组后再 apply）。
#
# 回滚路径（另见 ops/README.md §回滚）：
#   bash ops/main-ruleset-verify.sh --list    # 拿 ruleset id
#   gh api -X DELETE repos/"$REPO"/rulesets/<id>   # 整体删除
#   # 或软回滚：enforcement 置 disabled（规则保留但不生效，见 ops/README.md）
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${POMASTER_REPO:-River-Singer/POMaster_VNext}"
RULESET_NAME="main-protected"

# required status checks（ci.yml 的 job check-run 名；workflow 名 CI 不进 context——
# matrix 腿的 check 名 = "<job>(<matrix 值>)" 词形。应用前必须以
# `ops/main-ruleset-verify.sh --list-checks` 的输出逐字核对；不一致时同步修改
# 本数组与 ops/main-ruleset-verify.sh 中的同名数组）。
REQUIRED_CHECKS=(
  "ci (ubuntu-latest)"
  "ci (windows-latest)"
  "ci (macos-latest)"
  "bootstrap-clean"
)
# GitHub Actions App 的 integration_id（rulesets required_status_checks 的固定锚）。
ACTIONS_INTEGRATION_ID=15368

# bypass actor：空（个人仓库不支持 RepositoryRole bypass actor——API 422 实证
# "Actor base role does not have write permissions"，2026-09-09 发布执行轮）。
# 语义不变：无 bypass 时直推 main 对所有人（含管理员）被规则拦截，Owner 走
# PR 合并快速落变更（个人仓自提自合可行）。
# org 仓迁移时可用：[{"actor_id": 1, "actor_type": "RepositoryRole", "bypass_mode": "pull_request"}]
BYPASS_ACTORS_JSON='[]'

MODE="${1:--dry-run}"
if [ "${MODE}" != "--dry-run" ] && [ "${MODE}" != "--apply" ]; then
  echo "用法: bash ops/main-ruleset-apply.sh [--dry-run|--apply]" >&2
  exit 2
fi

command -v node >/dev/null 2>&1 || {
  echo "::error::node 不在 PATH（拼装 ruleset JSON 需要；本仓即 Node 工作区）。" >&2
  exit 1
}

# checks 数组 → rulesets API 的 required_status_checks 参数 JSON
# （context + integration_id；node 确定性拼装，不经 shell 字符串插值）。
CHECKS_JSON="$(node --input-type=module -e '
  // node -e 形态：process.argv[0] = node 路径，argv[1..] = 透传参数。
  const argv = process.argv.slice(1);
  const integrationId = Number(argv.pop());
  const checks = argv.map((context) => ({ context, integration_id: integrationId }));
  const body = JSON.stringify(checks, null, 2)
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
  process.stdout.write(body);
' "${REQUIRED_CHECKS[@]}" "${ACTIONS_INTEGRATION_ID}")"

RULESET_JSON="{
  \"name\": \"${RULESET_NAME}\",
  \"target\": \"branch\",
  \"enforcement\": \"active\",
  \"conditions\": {
    \"ref_name\": {
      \"include\": [\"~DEFAULT_BRANCH\"],
      \"exclude\": []
    }
  },
  \"bypass_actors\": ${BYPASS_ACTORS_JSON},
  \"rules\": [
    {
      \"type\": \"deletion\"
    },
    {
      \"type\": \"non_fast_forward\"
    },
    {
      \"type\": \"required_status_checks\",
      \"parameters\": {
        \"required_status_checks\": ${CHECKS_JSON},
        \"strict_required_status_checks_policy\": false
      }
    },
    {
      \"type\": \"pull_request\",
      \"parameters\": {
        \"required_approving_review_count\": 0,
        \"dismiss_stale_reviews_on_push\": false,
        \"require_code_owner_review\": false,
        \"require_last_push_approval\": false,
        \"required_review_thread_resolution\": false
      }
    }
  ]
}"

echo "== ruleset 名称: ${RULESET_NAME} / 仓库: ${REPO} =="
echo "== required checks =="
printf '  - %s\n' "${REQUIRED_CHECKS[@]}"

if [ "${MODE}" = "--dry-run" ]; then
  echo "== DRY-RUN：将执行的 API 调用与 JSON 体（零远端写入）=="
  echo "# 同名在座 → PUT /repos/${REPO}/rulesets/<id>（就地更新）；不在座 → POST /repos/${REPO}/rulesets"
  echo "${RULESET_JSON}"
  echo "== 下一步：核对 REQUIRED_CHECKS 后执行 bash ops/main-ruleset-apply.sh --apply =="
  exit 0
fi

# --apply：同名 ruleset 在座则就地更新（de-versioning：不堆并行规则），否则创建。
command -v gh >/dev/null 2>&1 || {
  echo "::error::gh CLI 不在 PATH——先 winget install GitHub.cli && gh auth login（见 ops/README.md）。" >&2
  exit 1
}
EXISTING_ID="$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name == \"${RULESET_NAME}\") | .id" || true)"
if [ -n "${EXISTING_ID}" ]; then
  echo "== 同名 ruleset 在座（id=${EXISTING_ID}）→ PUT 就地更新 =="
  gh api -X PUT "repos/${REPO}/rulesets/${EXISTING_ID}" --input - <<<"${RULESET_JSON}" >/dev/null
  echo "== 完成：ruleset ${RULESET_NAME}（id=${EXISTING_ID}）已更新 =="
else
  CREATED_ID="$(gh api -X POST "repos/${REPO}/rulesets" --input - <<<"${RULESET_JSON}" --jq '.id')"
  echo "== 完成：ruleset ${RULESET_NAME} 已创建（id=${CREATED_ID}）=="
fi

echo "== 立即验证：bash ops/main-ruleset-verify.sh =="
