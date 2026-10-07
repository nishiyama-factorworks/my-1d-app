#!/usr/bin/env bash
# =============================================================================
# guard-files.sh — PreToolUse(Edit|Write|MultiEdit): 保護ファイルへの書き込みを制御
# =============================================================================
# 1) 絶対に書かせない  : .env 系（.env.example を除く）、ロックファイル、.git、node_modules、.next
# 2) 人間に確認させる  : ハーネス自身（CLAUDE.md / .claude/ / .github/workflows/ / 検証スクリプト）
#    → エージェントが「自分を縛るルールを黙って緩める」ことを防ぐ。
#      GUARD_HARNESS_FILES=allow（harness.env）で確認を無効化できる。
# 編集方法: 下の case 文のパターンを追加・削除する（MANUAL 4.5 参照）。
# =============================================================================
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_jq_or_block
read_input

fp="$(jq_get '.tool_input.file_path // .tool_input.notebook_path')"
[ -z "$fp" ] && exit 0
rel="$(rel_path "$fp")"

# 例外（編集してよい）
case "$rel" in
  .env.example|.env.sample|.env.template) exit 0 ;;
esac

# 1) 常に拒否
case "$rel" in
  .env|.env.*|*/.env|*/.env.*)
    pretool_deny "[harness] $rel はシークレットを含むため編集できません。環境変数を追加する場合は .env.example にキー名だけを書き、値は人間が設定します。" ;;
  pnpm-lock.yaml|package-lock.json|yarn.lock|bun.lock|bun.lockb)
    pretool_deny "[harness] ロックファイルは手動編集できません。依存関係の変更は $PKG_MANAGER のコマンド経由で行い、事前に人間の承認を得てください。" ;;
  .git/*|node_modules/*|.next/*|*/node_modules/*)
    pretool_deny "[harness] $rel は編集対象外です（生成物/管理領域）。" ;;
esac

# 2) ハーネス自身は確認つき
if [ "${GUARD_HARNESS_FILES:-ask}" = "ask" ]; then
  case "$rel" in
    CLAUDE.md|CLAUDE.local.md|.claude/*|.github/workflows/*|scripts/verify.sh|scripts/harness-doctor.sh)
      pretool_ask "[harness] $rel はハーネス（開発ルール/ガードレール）の一部です。変更内容を確認してください。" ;;
  esac
fi

exit 0
