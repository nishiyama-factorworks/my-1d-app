---
description: "検証済みの変更から Draft PR を作成する（push と作成は人間の承認後。マージはしない）"
argument-hint: "[Issue番号]（省略時はブランチ名から判断）"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(bash scripts/verify.sh *) Bash(gh issue view *) Bash(gh pr view *) Bash(gh pr checks *) Bash(gh repo view *)
---

Issue: $ARGUMENTS （空ならブランチ名 `feat/<番号>-…` / `fix/<番号>-…` から判断。無ければ「Issue なし」）

## 事前確認（満たさなければ中断して人間に報告）
1. 現在のブランチが `main` / `master` ではない。
2. `gh repo view` が成功し、リモート `origin` が設定されている（無ければ GitHub 連携が未設定であることを報告して終了）。
3. 未コミットの変更が無い（あればコミットを提案する）。

## 手順
1. **検証**: `bash scripts/verify.sh` を実行し、結果を記録する。FAIL があれば PR を作らず、原因を直す。
2. **本文の組み立て**: `.github/pull_request_template.md` の項目を埋める。
   - 概要、対応する仕様・計画のパス、AC 番号
   - `Closes #<番号>`（Issue が無い場合は `Issue: なし（理由）`）
   - 変更内容、追加したテスト、verify の結果（PASS/FAIL を事実のまま貼る）
   - 依存の追加有無、レビューしてほしい点
   - 本文はリポジトリ外（`${TMPDIR:-/tmp}`）の一時ファイルに書く。シークレット・内部パス・個人情報を含めない。
3. **承認**: タイトル・本文・ベースブランチを人間に提示し、**push と PR 作成の承認を得る**。
4. **作成**: `git push -u origin HEAD` の後、`gh pr create --draft --base main --title "<Conventional Commits 形式>" --body-file <一時ファイル>` を実行する（どちらも確認が出る）。
5. **報告**: PR の URL を報告する。数分後に `gh pr checks` で CI の状況を確認し、失敗があれば原因を調べる（CI の設定やテストを緩めて通さない）。

## 禁止事項
- `gh pr merge`、`gh pr ready` を実行しない（Ready への変更とマージは人間が行う）。
- `--force` push、`main` への直接 push をしない。
