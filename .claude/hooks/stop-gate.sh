#!/usr/bin/env bash
# =============================================================================
# stop-gate.sh — Stop: Claude が「完了」と言う前の品質ゲート
# =============================================================================
# 動作:
#   1. コードに変更が無ければ何もしない（会話だけのターンでは動かない）
#   2. STOP_GATE_STEPS（typecheck / lint / test / build）を実行
#   3. REQUIRE_TESTS_WITH_SRC が有効なら「ソースを変えたのにテストが変わっていない」を検出
#   4. 失敗があれば exit 2 で終了を差し戻し、失敗内容を Claude に返す（自己修復ループ）
#      ただし連続 STOP_GATE_MAX_BLOCKS 回を超えたら警告のみで終了を許可（無限ループ防止）
# 一時的に止めたいとき: 環境変数 HARNESS_STOP_GATE=off、または harness.env で STOP_GATE="off"
# 編集方法: 検証内容は harness.env（MANUAL 4.4）。ロジックを変えるときは本ファイル。
# =============================================================================
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
read_input

[ "${STOP_GATE:-on}" = "off" ] && exit 0
[ "${HARNESS_STOP_GATE:-on}" = "off" ] && exit 0
has_jq || exit 0
cd "$HARNESS_PROJECT_DIR" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -d node_modules ] || exit 0   # 未セットアップのプロジェクトでは動かさない

session="$(jq_get '.session_id')"; session="${session:-nosession}"
state="${TMPDIR:-/tmp}/claude-harness-stop-${session}"

# 既定値（harness.env に無い場合）
CODE_REGEX="${CODE_REGEX:-}";   [ -n "$CODE_REGEX" ]   || CODE_REGEX='\.(ts|tsx|js|jsx|mjs|cjs|css)$|^package\.json$'
SRC_REGEX="${SRC_REGEX:-}";     [ -n "$SRC_REGEX" ]    || SRC_REGEX='^(src|app|lib|components|pages)/.*\.(ts|tsx)$'
TEST_REGEX="${TEST_REGEX:-}";   [ -n "$TEST_REGEX" ]   || TEST_REGEX='\.(test|spec)\.(ts|tsx|js|jsx)$|(^|/)__tests__/|^(tests|e2e)/'
SRC_EXCLUDE_REGEX="${SRC_EXCLUDE_REGEX:-}"; [ -n "$SRC_EXCLUDE_REGEX" ] || SRC_EXCLUDE_REGEX='\.d\.ts$'

# 変更ファイル一覧（比較基準 + 未追跡）
base="${GATE_BASE_REF:-HEAD}"
git rev-parse --verify -q "$base" >/dev/null 2>&1 || base="HEAD"
# ブランチの分岐点と比較する（main 側が進んでいても、自分の変更だけを対象にするため）
if [ "$base" != "HEAD" ]; then
  mb="$(git merge-base "$base" HEAD 2>/dev/null || true)"
  [ -n "$mb" ] && base="$mb" || base="HEAD"
fi
changed="$( { git diff --name-only "$base" 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"

# コード変更が無ければスキップ
if ! printf '%s\n' "$changed" | grep -Eq "$CODE_REGEX"; then
  rm -f "$state"
  exit 0
fi

failures=""
warnings=""

run_step() { # $1=表示名 $2=コマンド
  local name="$1" cmd="$2" out
  [ -n "$cmd" ] || return 0
  if ! out="$(bash -c "$cmd" 2>&1)"; then
    failures+=$'\n'"### ${name} が失敗しました（${cmd}）"$'\n'"$(printf '%s' "$out" | tail -n 40)"$'\n'
  fi
}

for step in ${STOP_GATE_STEPS:-typecheck lint test}; do
  case "$step" in
    typecheck) run_step "型チェック" "${TYPECHECK_CMD:-}" ;;
    lint)      run_step "Lint"       "${LINT_CMD:-}" ;;
    test)      run_step "テスト"     "${TEST_CMD:-}" ;;
    build)     run_step "ビルド"     "${BUILD_CMD:-}" ;;
  esac
done

# テスト同伴チェック（TDD の強制）
if [ "${REQUIRE_TESTS_WITH_SRC:-off}" != "off" ]; then
  src_changed="$(printf '%s\n' "$changed" | grep -E "$SRC_REGEX" | grep -Ev "$TEST_REGEX" | grep -Ev "$SRC_EXCLUDE_REGEX" || true)"
  test_changed="$(printf '%s\n' "$changed" | grep -E "$TEST_REGEX" || true)"
  if [ -n "$src_changed" ] && [ -z "$test_changed" ]; then
    msg="### テストが追加/更新されていません"$'\n'"ソースが変更されていますが、テストファイルの変更がありません。TDD に従い、先に失敗するテストを書いてから実装してください。変更されたソース:"$'\n'"$(printf '%s\n' "$src_changed" | head -n 10)"$'\n'"（テストが本当に不要な変更の場合は、その理由を最終報告に明記してください）"$'\n'
    if [ "$REQUIRE_TESTS_WITH_SRC" = "block" ]; then failures+=$'\n'"$msg"; else warnings+="$msg"; fi
  fi
fi

# 成功
if [ -z "$failures" ]; then
  rm -f "$state"
  if [ -n "$warnings" ]; then
    jq -n --arg m "[harness/stop-gate] 警告: $warnings" '{systemMessage:$m}'
  fi
  exit 0
fi

# 失敗 → 差し戻し（回数制限つき）
count="$(cat "$state" 2>/dev/null || echo 0)"; count=$((count + 1))
max="${STOP_GATE_MAX_BLOCKS:-3}"
if [ "$count" -gt "$max" ]; then
  rm -f "$state"
  jq -n --arg m "[harness/stop-gate] 品質ゲートが ${max} 回連続で未達のため、自動差し戻しを打ち切りました。未解決の問題があります。/verify を実行して状況を確認してください。" '{systemMessage:$m}'
  exit 0
fi
echo "$count" > "$state"

{
  echo "[harness/stop-gate] 品質ゲート未達のため完了できません（試行 ${count}/${max}）。以下を修正し、修正後にもう一度完了してください。"
  printf '%s\n' "$failures"
} >&2
exit 2
