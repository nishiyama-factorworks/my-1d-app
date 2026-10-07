#!/usr/bin/env bash
# =============================================================================
# scripts/verify.sh — 品質ゲートの「唯一の入口」（ローカル / /verify / CI で共通）
# =============================================================================
# 使い方:
#   bash scripts/verify.sh            # full: typecheck → lint → test → build
#   bash scripts/verify.sh --quick    # typecheck → lint → test
#   bash scripts/verify.sh --e2e      # full + E2E
# 実行するコマンドは .claude/harness.env の *_CMD を参照する。
# 全ステップを最後まで実行し、結果の一覧を出して、1つでも失敗なら exit 1。
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck disable=SC1091
. "$ROOT/.claude/harness.env"

mode="full"
case "${1:-}" in
  --quick) mode="quick" ;;
  --e2e)   mode="e2e" ;;
  ""|--full) mode="full" ;;
  *) echo "usage: $0 [--quick|--full|--e2e]" >&2; exit 2 ;;
esac

steps=("typecheck:${TYPECHECK_CMD:-}" "lint:${LINT_CMD:-}" "test:${TEST_CMD:-}")
[ "$mode" != "quick" ] && steps+=("build:${BUILD_CMD:-}")
[ "$mode" = "e2e" ]    && steps+=("e2e:${E2E_CMD:-}")

declare -a results=()
failed=0
for s in "${steps[@]}"; do
  name="${s%%:*}"; cmd="${s#*:}"
  if [ -z "$cmd" ]; then results+=("SKIP  $name (コマンド未設定)"); continue; fi
  echo "==> $name: $cmd"
  start=$(date +%s)
  if bash -c "$cmd"; then
    results+=("PASS  $name ($(( $(date +%s) - start ))s)")
  else
    results+=("FAIL  $name ($(( $(date +%s) - start ))s)")
    failed=1
  fi
  echo
done

echo "================ verify ($mode) ================"
printf '%s\n' "${results[@]}"
echo "================================================"
[ "$failed" -eq 0 ] && echo "OK: すべての品質ゲートを通過しました。" || echo "NG: 失敗したステップがあります。"
exit "$failed"
