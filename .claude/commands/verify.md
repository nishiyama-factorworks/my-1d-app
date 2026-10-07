---
description: "全品質ゲート（型チェック・Lint・テスト・ビルド）を実行し、結果を事実のまま報告する"
argument-hint: "[--quick | --full | --e2e]（省略時は --full）"
allowed-tools: Bash(bash scripts/verify.sh *)
---

`bash scripts/verify.sh $ARGUMENTS` を実行してください。

- 出力の末尾の一覧を読み、各ステップの PASS / FAIL / SKIP を**そのまま**報告する。
- FAIL があれば、失敗したステップのエラーを要約し、原因の仮説と修正方針を示す。修正が小さく明確なら修正して再実行する。
- SKIP（コマンド未設定）があれば、`.claude/harness.env` の設定漏れとして指摘する。
- 実行しないまま「通るはず」と報告しない。実行できなかった場合は、その理由を報告する。
