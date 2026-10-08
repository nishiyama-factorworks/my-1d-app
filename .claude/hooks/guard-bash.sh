#!/usr/bin/env bash
# =============================================================================
# guard-bash.sh — PreToolUse(Bash): 危険なシェルコマンドを実行前にブロック/確認
# =============================================================================
# 位置づけ: permissions(settings.json) の「前」で動く決定論的ガード。
# 編集方法: 下の block_if / ask_if の行を追加・削除する（MANUAL 4.5 参照）。
#   block_if '<拡張正規表現>' '<Claude に返す理由>'   → 実行を拒否
#   ask_if   '<拡張正規表現>' '<ユーザーに見せる理由>' → 人間に確認
# 正規表現は grep -E（大文字小文字を区別しない）。コマンド文字列全体にマッチさせる。
# =============================================================================
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_jq_or_block
read_input

cmd="$(jq_get '.tool_input.command')"
[ -z "$cmd" ] && exit 0

# クォート内の文字列（コミットメッセージ等）を除いた版。誤検知を減らしたい規則で使う。
stripped="$(printf '%s' "$cmd" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")"

m()  { printf '%s' "$cmd"      | grep -Eiq -- "$1"; }
ms() { printf '%s' "$stripped" | grep -Eiq -- "$1"; }
block_if() { if m  "$1"; then pretool_deny "[harness] $2"; fi; }
ask_if()   { if m  "$1"; then pretool_ask  "[harness] $2"; fi; }

# --- 1. 取り返しのつかない削除 ------------------------------------------------
block_if 'rm[[:space:]]+-[a-zA-Z]*[rR][a-zA-Z]*[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*(/|~|\$HOME|\*|\./?\*?|\.\.)/?([[:space:]]|$)' \
  'ルート/ホーム/カレント全体に対する rm -rf は禁止です。削除対象を具体的なパスで指定してください。'

# --- 2. Git の危険操作 --------------------------------------------------------
block_if 'git[[:space:]]+push([[:space:]]+[^;&|]*)?[[:space:]](--force|-f)([[:space:]]|$)' \
  'git push --force は禁止です。必要なら人間が実行します。'
block_if 'git[[:space:]]+push[^;&|]*[[:space:]:](main|master|production)([[:space:]]|$)' \
  'main/master/production への直接 push は禁止です。ブランチを切って PR を作成してください。'
block_if '--no-verify' \
  '--no-verify（hook のスキップ）は禁止です。失敗の原因を直してください。'
ask_if 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f|checkout[[:space:]]+--[[:space:]]|restore[[:space:]]+\.)' \
  '未コミットの変更が失われる可能性のある Git 操作です。'

# 現在ブランチが保護ブランチのとき、引数なし push も止める
if m '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)'; then
  branch="$(git -C "$HARNESS_PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  case "$branch" in
    main|master|production)
      pretool_deny "[harness] 現在 $branch ブランチです。作業ブランチに切り替えてから push してください。" ;;
  esac
fi

# --- 3. 権限昇格・外部スクリプトの直接実行・公開 -----------------------------
block_if '(^|[;&|[:space:]])sudo[[:space:]]' 'sudo は使用できません。'
block_if '(curl|wget)[^|;&]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh' \
  'ダウンロードしたスクリプトの直接実行（curl | sh）は禁止です。内容を確認してから実行してください。'
block_if 'chmod[[:space:]]+(-R[[:space:]]+)?0?777' 'chmod 777 は禁止です。'
block_if '(npm|pnpm|yarn|bun)[[:space:]]+publish' 'パッケージの公開は人間が行います。'

# --- 3b. GitHub CLI（gh）--------------------------------------------------------
# マージ・削除・認証情報・シークレットは人間だけが扱う。作成・コメント系は確認を出す。
# gh はコマンドの先頭（または ; & | ( の直後）にある場合だけ検査する。コミットメッセージや PR 本文に
# 「gh pr merge」と書いただけでは誤検知しないため。permissions の deny も併用している。
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge' \
  'PR のマージは人間が行います。Draft PR の作成までが対象です。'
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+(repo|issue|release)[[:space:]]+delete' \
  'リポジトリ・Issue・リリースの削除は人間が行います。'
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+secret([[:space:]]|$)' \
  'GitHub のシークレット操作は人間が行います。'
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+auth[[:space:]]+(token|login|logout|refresh|setup-git)' \
  'gh の認証情報の取得・変更は人間が行います（gh auth status は使えます）。'
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+[^;&|]*--admin([[:space:]]|$)' \
  '--admin（保護ルールの回避）は使用できません。'
block_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+api[[:space:]]+[^;&|]*(-X|--method)[[:space:]=]*DELETE' \
  'gh api による DELETE は禁止です。'
ask_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+api[[:space:]]+[^;&|]*(-X|--method)[[:space:]=]*(POST|PUT|PATCH)' \
  'gh api による書き込み（POST/PUT/PATCH）です。内容を確認してください。'
ask_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+(issue|pr)[[:space:]]+(create|comment|edit|close|reopen|review|ready)' \
  'GitHub 上に公開される操作（Issue/PR の作成・コメント・変更）です。内容にシークレットや内部情報が含まれていないか確認してください。'
ask_if '(^|[;&|(])[[:space:]]*gh[[:space:]]+(workflow[[:space:]]+run|repo[[:space:]]+(create|edit)|project[[:space:]]+(create|item-add|item-create|item-edit|edit))' \
  'GitHub のリポジトリ設定・ワークフロー・プロジェクトを変更する操作です。'

# --- 4. シークレットの読み取り -------------------------------------------------
if m '(^|[;&|[:space:]])(cat|less|more|head|tail|grep|rg|cp|mv|source|bat|xxd|strings)[[:space:]]+[^;&|]*\.env(\.[A-Za-z0-9._-]+)?([[:space:]]|$)'; then
  if ! m '\.env\.(example|sample|template)'; then
    pretool_deny '[harness] .env 系ファイルをコマンドで読み書きすることは禁止です。必要な環境変数名は .env.example に記載してください。'
  fi
fi

# --- 5. パッケージマネージャの混在防止 -----------------------------------------
if [ -n "${PKG_MANAGER:-}" ]; then
  for other in npm pnpm yarn bun; do
    [ "$other" = "$PKG_MANAGER" ] && continue
    if ms "(^|[;&|[:space:]])${other}[[:space:]]+(install|i|add|remove|rm|run|test|ci|update|up)([[:space:]]|$)"; then
      pretool_deny "[harness] このプロジェクトは ${PKG_MANAGER} を使用します（${other} は不可）。ロックファイルの二重管理を避けるため ${PKG_MANAGER} で実行してください。"
    fi
  done
fi

# --- 6. リポジトリのスクリプトによる GitHub への書き込み ------------------------
# 末尾に置く理由: pretool_ask はその場で終了するため、途中に置くと上の拒否の規則（4, 5）より
# 先に「確認」で抜けてしまう（例: node scripts/ready-issues.mjs --apply; cat .env）。
# scripts/ready-issues.mjs は内部で gh project item-edit を呼ぶため、3 の確認が効かない。
# 行継続（\ と改行）で --apply が次の行に来ても検出できるよう、改行を空白に置き換えてから照合する。
# 引用符の中も照合する（node "scripts/ready-issues.mjs" "--apply" を逃さないため）。
# コミットメッセージに書いただけでも確認になるが、安全側の誤検知として受け入れる。
# さらに、2>&1 や &> のリダイレクト（& が区間の区切りと誤認される）と、引用符・バックスラッシュ
# （--ap''ply のようにシェルが元に戻して node に渡す書き方）を取り除いてから照合する。
flat="$(printf '%s' "$cmd" | tr '\r\n' '  ' | sed -E "s/[0-9]*>&[0-9-]+//g; s/&>>?//g; s/[\"'\\\\]//g")"
if printf '%s' "$flat" | grep -Eiq -- 'ready-issues\.mjs[^;&|]*--apply'; then
  pretool_ask '[harness] Project の Status を更新する操作（ready-issues.mjs --apply）です。表示された候補と更新予定を確認してください。'
fi

exit 0
