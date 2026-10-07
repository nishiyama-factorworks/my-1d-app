---
description: "GitHub Issue を作成する（create）、または承認済みの計画のタスクを子 Issue に分割する（split）"
argument-hint: "create <要望の説明> | split <計画ファイルのパス>"
allowed-tools: Bash(gh issue view *) Bash(gh issue list *) Bash(gh repo view *)
---

引数: $ARGUMENTS

最初の単語でモードを判別する。`gh` が使えない・リモートが未設定の場合は、GitHub へは何も作らず、Issue 本文の下書きだけを提示して終了する。
**Issue の作成・編集（`gh issue create` / `gh issue edit`）は確認が出る。作る前に、本文の全文を人間に提示して承認を得る。**

## `create <要望の説明>`

1. `gh issue list --search "<キーワード>" --state all` で重複する Issue が無いか確認する。あれば人間に伝える。
2. `.github/ISSUE_TEMPLATE/feature.yml`（機能）または `bug.yml`（バグ）の項目に沿って本文を組み立てる。**要望から読み取れない項目は推測で埋めず**「未決」と書く。
3. 本文を提示して承認を得てから、`gh issue create --title ... --body-file <一時ファイル> --label <feature|bug>` で作成する。本文の一時ファイルはリポジトリ外（`${TMPDIR:-/tmp}`）に置く。
4. 作成した Issue の番号と URL を報告する。次の工程は `/feature <番号>`（バグは `/fix <番号>`）。

## `split <計画ファイルのパス>`

1. 計画ファイルを読み、`Issue:` 欄の親 Issue 番号を確認する（無ければ人間に確認する）。
2. 計画のタスク（T1, T2 …）ごとに、子 Issue の下書きを作る。タイトルは `[T<番号>] <タスク名>`、本文は「親 Issue: #N」「対応 AC」「先に書くテスト」「実装対象」「完了条件」（計画の記載をそのまま使う。新しい要件を足さない）。
3. すべての下書きを一覧で提示し、承認を得てから作成する。
4. 作成後、計画ファイルの各タスクに子 Issue 番号を追記する（`- [ ] **T1: …**（#45）`）。親 Issue のタスクリストへの追記は、人間が希望した場合のみ行う。
5. 分割しても、工程（TDD ループ）は `/feature` と同じ。1 子 Issue = 1 ブランチ = 1 PR とするか、親 Issue の 1 PR にまとめるかは人間が決める。
