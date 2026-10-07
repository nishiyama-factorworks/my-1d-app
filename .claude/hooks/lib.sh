#!/usr/bin/env bash
# =============================================================================
# lib.sh — 全 hook 共通ヘルパ（各 hook から `. lib.sh` で読み込む）
# =============================================================================
# 提供するもの:
#   HARNESS_PROJECT_DIR   プロジェクトルート
#   harness.env の全変数
#   read_input            stdin の JSON を HOOK_INPUT に読み込む
#   jq_get '<jq式>'       HOOK_INPUT から値を取り出す（無ければ空文字）
#   pretool_deny/ask      PreToolUse で拒否/確認を返して終了
#   require_jq_or_block   jq が無ければ「安全側（ブロック）」に倒す
# =============================================================================
set -u

HARNESS_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HARNESS_ENV_FILE="$HARNESS_PROJECT_DIR/.claude/harness.env"
if [ -f "$HARNESS_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$HARNESS_ENV_FILE"
fi

HOOK_INPUT=""
read_input() { HOOK_INPUT="$(cat)"; }

has_jq() { command -v jq >/dev/null 2>&1; }

jq_get() {
  has_jq || return 0
  printf '%s' "$HOOK_INPUT" | jq -r "($1) // empty" 2>/dev/null
}

# ガード系 hook は jq が無いと入力を解釈できない。素通しにせず、明示的にブロックして知らせる。
require_jq_or_block() {
  if ! has_jq; then
    echo "[harness] jq が見つからないため、安全のためこの操作をブロックしました。jq をインストールしてください（macOS: brew install jq / Debian系: apt install jq）。" >&2
    exit 2
  fi
}

# PreToolUse の判定を返す。decision は deny | ask
_pretool() {
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}
pretool_deny() { _pretool deny "$1"; }
pretool_ask()  { _pretool ask  "$1"; }

# 絶対パス → プロジェクト相対パス
rel_path() {
  local p="$1"
  printf '%s' "${p#"$HARNESS_PROJECT_DIR"/}"
}
