---
description: "失敗しているテストを通す実装（GREEN → REFACTOR）を行い、quick 検証する"
argument-hint: "<計画ファイルのパス> [タスク番号]"
allowed-tools: Bash(bash scripts/verify.sh *) Bash(git status *) Bash(git diff *) Bash(git add *) Bash(git commit *)
---

引数: $ARGUMENTS

1. 先にテストを実行し、対象タスクのテストが**失敗している**ことを確認する。テストが存在しない場合は実装せず、`/tdd` を先に実行するよう案内する。
2. `implementer` サブエージェントに、計画ファイル・対象タスク・失敗しているテストを渡して実装させる。
3. 返答を鵜呑みにせず、自分で `bash scripts/verify.sh --quick` を実行して結果を確認する。
4. PASS なら、計画のタスクのチェックボックスを更新し、Conventional Commits 形式でコミットする。FAIL なら原因を直して 2 に戻る（同じ原因で 3 回失敗したら人間に報告する）。
5. テストが仕様と矛盾している疑いが `implementer` から報告された場合は、人間に判断を仰ぐ。テストを勝手に変更しない。
