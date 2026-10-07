#!/usr/bin/env bash
# =============================================================================
# scripts/harness-doctor.sh — ハーネスの健全性チェック
# =============================================================================
# 導入直後・設定変更後・「hook が動かない」と感じたときに実行する。
#   bash scripts/harness-doctor.sh
# チェック内容: 必須ツール / 設定ファイルの構文 / hook スクリプト / package.json の scripts
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
ng=0
ok()   { echo "  [ OK ] $1"; }
warn() { echo "  [WARN] $1"; }
bad()  { echo "  [FAIL] $1"; ng=1; }

echo "== 必須ツール =="
for t in bash git jq node; do
  command -v "$t" >/dev/null 2>&1 && ok "$t" || bad "$t が見つかりません（jq が無いとガード系 hook が全ブロックになります）"
done

echo "== harness.env =="
if [ -f .claude/harness.env ]; then
  # shellcheck disable=SC1091
  . .claude/harness.env
  ok ".claude/harness.env を読み込みました（PKG_MANAGER=${PKG_MANAGER:-未設定}）"
  command -v "${PKG_MANAGER:-pnpm}" >/dev/null 2>&1 && ok "${PKG_MANAGER:-pnpm} コマンド" || bad "${PKG_MANAGER:-pnpm} が見つかりません"
else
  bad ".claude/harness.env がありません"
fi

echo "== settings.json =="
if command -v jq >/dev/null 2>&1 && jq empty .claude/settings.json 2>/dev/null; then
  ok ".claude/settings.json は妥当な JSON です"
  # hooks が参照するスクリプトの存在確認
  while IFS= read -r f; do
    [ -f "$f" ] && ok "hook: $f" || bad "hook スクリプトが存在しません: $f"
  done < <(jq -r '.hooks[][].hooks[].command' .claude/settings.json | grep -o '\.claude/hooks/[A-Za-z0-9._-]*\.sh' | sort -u)
else
  bad ".claude/settings.json が不正な JSON、または jq が使えません"
fi

echo "== シェルスクリプトの構文 =="
for f in .claude/hooks/*.sh scripts/*.sh; do
  bash -n "$f" 2>/dev/null && ok "$f" || bad "$f に構文エラーがあります"
done

echo "== package.json の scripts =="
if [ -f package.json ] && command -v jq >/dev/null 2>&1; then
  for pair in "typecheck:${TYPECHECK_CMD:-}" "lint:${LINT_CMD:-}" "test:${TEST_CMD:-}" "build:${BUILD_CMD:-}"; do
    name="${pair%%:*}"; cmd="${pair#*:}"
    script="$(printf '%s' "$cmd" | awk '{print $NF}')"   # 例: "pnpm typecheck" → typecheck
    if jq -e --arg s "$script" '.scripts[$s]' package.json >/dev/null 2>&1; then
      ok "$name → scripts.$script"
    else
      warn "$name 用の scripts.$script が package.json にありません（harness.env の ${name^^}_CMD を確認）"
    fi
  done
else
  warn "package.json がまだありません（create-next-app 後に再実行してください）"
fi

echo "== GitHub 連携（任意。未設定でも FAIL にはしません）=="
if command -v gh >/dev/null 2>&1; then
  ok "gh コマンド"
  if gh auth status >/dev/null 2>&1; then ok "gh は認証済みです"; else warn "gh が未認証です（gh auth login）"; fi
else
  warn "gh が未インストールです（Issue / PR 連携のコマンドは使えません）"
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git remote get-url origin >/dev/null 2>&1; then
    ok "リモート origin: $(git remote get-url origin)"
    git rev-parse --verify -q origin/main >/dev/null 2>&1 \
      && ok "origin/main あり（Stop ゲートはブランチ全体の変更を対象にします）" \
      || warn "origin/main が見つかりません（git fetch、または初回 push 後に再確認）"
  else
    warn "リモート origin が未設定です（リポジトリ作成後に git remote add / push。MANUAL 10章）"
  fi
else
  warn "Git リポジトリではありません"
fi

echo
[ "$ng" -eq 0 ] && echo "doctor: 問題は見つかりませんでした。" || echo "doctor: FAIL の項目を修正してください。"
exit "$ng"
