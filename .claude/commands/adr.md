---
description: "アーキテクチャ上の意思決定を ADR（Architecture Decision Record）として記録する"
argument-hint: "<決定したいこと・論点>"
---

論点: $ARGUMENTS

1. `docs/adr/` の既存 ADR を確認して次の連番を決め、`docs/adr/0000-template.md` をコピーして `docs/adr/NNNN-<slug>.md` を作る。
2. 次を埋める: 背景（なぜ決める必要があるか）、検討した選択肢（最低 2 つ。メリット・デメリット）、決定とその理由、結果として生じる影響とトレードオフ。
3. 事実（バージョン、制約、性能など）は実際に調べて根拠を示す。確認できない点は「未確認」と書く。
4. ステータスは `Proposed` で作成し、人間に提示して承認を得たら `Accepted` にする。既存の決定を覆す場合は、古い ADR のステータスを `Superseded by NNNN` に更新する。
5. 決定が `CLAUDE.md` の技術スタック節や `.claude/harness.env` に影響する場合は、その更新も提案する（ハーネスの変更は確認が出る）。
