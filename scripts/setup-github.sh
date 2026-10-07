#!/usr/bin/env bash
# =============================================================================
# scripts/setup-github.sh — GitHub リポジトリの初期設定（人間が実行する）
# =============================================================================
# リポジトリを作成して初回 push した「後」に 1 回実行する。既定は dry-run（実行内容を表示するだけ）。
#
#   bash scripts/setup-github.sh                       # dry-run（何も変更しない）
#   bash scripts/setup-github.sh --apply               # 実際に適用
#   bash scripts/setup-github.sh --apply --project "<ボード名>"   # Projects ボードも作成してリポジトリに紐づける
#
# オプション:
#   --branch <名前>      保護するブランチ（既定: main）
#   --approvals <N>      必須の承認数（既定: 0。一人で進めるなら 0。承認 1 以上だと自分の PR をマージできない）
#   --checks "a,b"       必須にする CI ジョブ名（既定: verify,harness-lint）
#   --project "<名前>"   Projects(v2) ボードを作成して紐づける
#
# 適用内容: ラベル作成 / マージ方式（squash のみ・マージ後ブランチ削除）/ ブランチ保護 / （任意）Projects ボード
# 前提: gh がインストール済みで、リポジトリの管理者権限で認証済み（gh auth login）。
#       Projects の作成には project スコープが必要（gh auth refresh -s project）。
# 注意: 無料プランの「プライベートリポジトリ」ではブランチ保護の API が使えない（403）。その場合は警告のみで続行する。
# このスクリプトは Claude Code の権限では実行できない設計（gh repo edit / gh api の書き込みは確認が出る）。人間が実行する。
# =============================================================================
set -euo pipefail

APPLY=0
BRANCH="main"
APPROVALS=0
CHECKS="verify,harness-lint"
PROJECT_TITLE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --branch) BRANCH="${2:?--branch の値が必要です}"; shift ;;
    --approvals) APPROVALS="${2:?--approvals の値が必要です}"; shift ;;
    --checks) CHECKS="${2:?--checks の値が必要です}"; shift ;;
    --project) PROJECT_TITLE="${2:?--project の値が必要です}"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
run()  { printf '+ %s\n' "$*"; if [ "$APPLY" -eq 1 ]; then "$@"; fi; }

# --- 事前確認 ----------------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "gh が見つかりません。https://cli.github.com/ からインストールしてください。" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq が見つかりません。" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh が未認証です。先に gh auth login を実行してください。" >&2; exit 1; }

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$repo" ]; then
  echo "リポジトリを特定できません。リポジトリを作成し、origin を設定してから実行してください（MANUAL 10章）。" >&2
  exit 1
fi
owner="${repo%%/*}"

say "対象リポジトリ: $repo"
if [ "$APPLY" -eq 1 ]; then say "モード: 適用（--apply）"; else say "モード: dry-run（--apply を付けると実際に適用します）"; fi
say

# --- 1. ラベル ---------------------------------------------------------------
say "== 1. ラベル =="
labels=(
  "feature|0e8a16|機能追加・改善"
  "bug|d73a4a|不具合"
  "chore|c5def5|保守・設定"
  "docs|0075ca|ドキュメント"
  "blocked|b60205|ブロック中（理由をコメントに書く）"
  "needs-decision|fbca04|人間の判断待ち"
)
for l in "${labels[@]}"; do
  IFS='|' read -r name color desc <<<"$l"
  run gh label create "$name" --color "$color" --description "$desc" --force
done
say

# --- 2. マージ方式 ------------------------------------------------------------
say "== 2. マージ方式（squash のみ・マージ後にブランチ削除）=="
run gh repo edit "$repo" --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
say

# --- 3. ブランチ保護 ----------------------------------------------------------
say "== 3. ブランチ保護（$BRANCH: PR 必須 / CI 必須 / force push・削除の禁止）=="
contexts_json="$(printf '%s' "$CHECKS" | jq -R 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0))')"
protection_json="$(jq -n --argjson ctx "$contexts_json" --argjson n "$APPROVALS" '{
  required_status_checks: {strict: true, contexts: $ctx},
  enforce_admins: false,
  required_pull_request_reviews: {required_approving_review_count: $n, dismiss_stale_reviews: true},
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true
}')"
say "+ gh api -X PUT repos/$repo/branches/$BRANCH/protection --input -   # 内容:"
printf '%s\n' "$protection_json" | sed 's/^/    /'
if [ "$APPLY" -eq 1 ]; then
  if ! gh api "repos/$repo/branches/$BRANCH" >/dev/null 2>&1; then
    warn "ブランチ '$BRANCH' がまだ存在しません。初回 push 後に再実行してください（ブランチ保護をスキップ）。"
  elif ! printf '%s' "$protection_json" | gh api -X PUT "repos/$repo/branches/$BRANCH/protection" --input - >/dev/null; then
    warn "ブランチ保護を適用できませんでした。無料プランのプライベートリポジトリでは利用できません（公開にする、有料プランにする、または GitHub の Settings > Rules で代替してください）。"
  else
    say "ブランチ保護を適用しました。"
  fi
fi
say

# --- 4. Projects ボード（任意）---------------------------------------------------
if [ -n "$PROJECT_TITLE" ]; then
  say "== 4. Projects ボード =="
  if [ "$APPLY" -eq 1 ]; then
    if out="$(gh project create --owner "$owner" --title "$PROJECT_TITLE" --format json 2>&1)"; then
      num="$(printf '%s' "$out" | jq -r '.number')"
      say "+ gh project create → #$num"
      run gh project link "$num" --owner "$owner" --repo "$repo"
    else
      warn "Projects ボードを作成できませんでした。project スコープが必要です: gh auth refresh -s project"
      warn "詳細: $out"
    fi
  else
    say "+ gh project create --owner $owner --title \"$PROJECT_TITLE\" --format json"
    say "+ gh project link <作成された番号> --owner $owner --repo $repo"
  fi
  say
fi

# --- 手動で行う設定 -----------------------------------------------------------
cat <<'EOF'
== 手動で行う設定（GitHub の画面。MANUAL 10.4 参照）==
  1. Projects ボードの Status 列を「Backlog / Ready / In progress / In review / Done」に編集する
  2. Projects の Workflows で次を有効にする
       - Item added to project            → Status = Backlog
       - Item closed / Pull request merged → Status = Done
       - Pull request opened               → Status = In review（任意）
       - Auto-add to project               → このリポジトリの Issue を自動追加（フィルタ: is:issue）
  3. Settings > Code security で Dependabot alerts / Dependabot security updates を有効にする
  4. Settings > Actions > General で「Workflow permissions」を Read repository contents に設定する
  5. 最初の PR で CI（verify / harness-lint）が走ったら、必須チェックの名前が一致しているか確認する
EOF
