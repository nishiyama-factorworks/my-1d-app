#!/usr/bin/env bash
# =============================================================================
# post-edit.sh — PostToolUse(Edit|Write|MultiEdit): 編集直後に整形 + Lint
# =============================================================================
# 動作:
#   1. FORMAT_TARGET_REGEX に合うファイルを FORMAT_FILE_CMD で整形（失敗しても無視）
#   2. LINT_TARGET_REGEX に合うファイルを LINT_FILE_CMD で検査
#      → エラーがあれば exit 2 でエラー内容を Claude に返し、その場で修正させる
# 方針: node_modules が無い（未セットアップ）ときは何もしない。フックの不具合で作業を止めない。
# 編集方法: 対象の拡張子や使用コマンドは harness.env を編集（MANUAL 4.4 / 4.5 参照）。
# =============================================================================
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
read_input
has_jq || exit 0

fp="$(jq_get '.tool_input.file_path')"
[ -n "$fp" ] && [ -f "$fp" ] || exit 0
[ -d "$HARNESS_PROJECT_DIR/node_modules" ] || exit 0
cd "$HARNESS_PROJECT_DIR" || exit 0

rel="$(rel_path "$fp")"
case "$rel" in node_modules/*|.next/*|.git/*) exit 0 ;; esac

# 1) 整形（word splitting を意図している）
if [ -n "${FORMAT_FILE_CMD:-}" ] && printf '%s' "$rel" | grep -Eq "${FORMAT_TARGET_REGEX:-\.(ts|tsx)$}"; then
  # shellcheck disable=SC2086
  $FORMAT_FILE_CMD "$rel" >/dev/null 2>&1 || true
fi

# 2) Lint
if [ -n "${LINT_FILE_CMD:-}" ] && printf '%s' "$rel" | grep -Eq "${LINT_TARGET_REGEX:-\.(ts|tsx)$}"; then
  # shellcheck disable=SC2086
  if ! out="$($LINT_FILE_CMD "$rel" 2>&1)"; then
    {
      echo "[harness/post-edit] $rel に Lint エラーがあります。修正してください:"
      printf '%s\n' "$out" | head -n 40
    } >&2
    exit 2
  fi
fi

exit 0
