# 品質ゲート（完了の定義 / Definition of Done）

「完了」と言えるのは、以下がすべて満たされたとき。上から順に、**自動で機械的に判定できるもの**を先に並べている。

## 自動ゲート（`bash scripts/verify.sh` が判定。CI も同じ）

| # | ゲート | 実体（`.claude/harness.env`） | 実行タイミング |
| --- | --- | --- | --- |
| G1 | 型チェック | `TYPECHECK_CMD` | 編集のたび（一部）/ Stop / CI |
| G2 | Lint | `LINT_CMD` | 編集直後（ファイル単位）/ Stop / CI |
| G3 | テスト | `TEST_CMD` | Stop / CI |
| G4 | テスト同伴 | Stop hook（`REQUIRE_TESTS_WITH_SRC`） | Stop |
| G5 | ビルド | `BUILD_CMD` | `/verify`（full）/ CI |
| G6 | E2E（任意） | `E2E_CMD` | `--e2e` / CI（`RUN_E2E=true` のとき） |

## 人間/レビューで判定するゲート

| # | ゲート | 判定者 |
| --- | --- | --- |
| H1 | 全 AC が実装され、対応するテストがある | `reviewer` + 人間 |
| H2 | Critical / Major の指摘が残っていない | `reviewer` / `security-reviewer` |
| H3 | 仕様・計画・ADR・アーキテクチャ文書が実装と一致している | 人間 |
| H4 | 依存の追加は承認済み、シークレットは含まれていない | 人間 |
| H5 | PR が Issue にひも付いている（`Closes #N` / `Refs #N` / `Issue: なし（理由）`） | `pr-links` ワークフロー + 人間 |

## リポジトリ側の強制（GitHub のブランチ保護）

`scripts/setup-github.sh` で設定する。hooks はローカルでの安全装置、これは**リポジトリ側の最終防衛線**。

| # | 設定 | 内容 |
| --- | --- | --- |
| R1 | PR 必須 | `main` への直接 push を禁止 |
| R2 | CI 必須 | `verify` と `harness-lint` が成功しないとマージできない |
| R3 | force push・ブランチ削除の禁止 | 履歴の保護 |
| R4 | マージは squash のみ・マージ後にブランチ削除 | 履歴を 1 PR = 1 コミットに保つ |
| R5 | マージは人間のみ | `gh pr merge` は hook と permissions で拒否される |

## 運用ルール

- 完了報告には `verify.sh` の結果（PASS/FAIL）を**事実のまま**添える。
- ゲートを緩める変更（Lint ルールの無効化、テストの `skip`、CI の条件緩和）は、理由を PR に明記して人間の承認を得る。
- 新しい失敗パターンが見つかったら、**ゲートか rules に追加して再発を防ぐ**（MANUAL 7章「改善ループ」）。
