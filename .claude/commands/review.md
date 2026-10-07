---
description: "現在の差分を reviewer / security-reviewer で並列レビューし、重大な指摘を修正する"
argument-hint: "[比較基準ブランチ 例: main]（省略時は HEAD）"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(bash scripts/verify.sh *) Bash(gh pr view *) Bash(gh pr diff *)
---

比較基準の指定: $ARGUMENTS （空なら HEAD を基準にする）

## 現在の状況（HEAD 基準）
- 変更ファイル:
!`git status --short 2>&1 | head -n 40`
- 差分の概要:
!`git diff --stat HEAD 2>&1 | tail -n 40`

## 手順
1. 比較基準が指定されている場合は、`git diff <基準>...HEAD` と未コミットの変更の両方を対象にする。上の概要は HEAD 基準なので、必要なら自分で `git diff --stat <基準>` を実行して把握する。基準が空で、現在のブランチに PR がある場合は、`gh pr view --json baseRefName` で PR のベースブランチを調べ、それを基準にする（`gh` が使えなければ HEAD 基準のまま）。
2. 差分に対応する仕様ファイル・計画ファイルを特定する（不明なら `docs/specs/` `docs/plans/` から最も関連するものを選び、報告に明記する）。
3. `reviewer` サブエージェントを起動する。認証・入力処理・外部連携・依存追加・環境変数に触れる差分がある場合は、`security-reviewer` も**同時（並列）**に起動する。それぞれに、比較基準、仕様ファイル、計画ファイルを渡す。
4. 結果を統合し、Critical → Major → Minor の順に整理して提示する。
5. Critical と Major は修正する。修正は `/implement` と同じ手順（テストを先に追加 → 実装 → quick 検証）で行う。指摘が誤りだと判断した場合は、根拠を示して人間に報告する。
6. 修正後、必要なら再レビューする。最終的な判定（Approve / Request changes）と未対応の指摘を報告する。
7. 人間が希望した場合に限り、レビュー結果の要約を PR コメントとして投稿する（`gh pr comment`。確認が出る。シークレット・内部パスを含めない）。
