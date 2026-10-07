---
paths:
  - "docs/**/*.md"
---

# ドキュメントルール

## 配置と命名

| 種類 | 場所 | 命名 | テンプレート |
| --- | --- | --- | --- |
| 仕様 | `docs/specs/` | `NNNN-<slug>.md`（4桁連番） | `docs/specs/_template.md` |
| 計画 | `docs/plans/` | 仕様と同じ `NNNN-<slug>.md` | `docs/plans/_template.md` |
| 意思決定(ADR) | `docs/adr/` | `NNNN-<slug>.md` | `docs/adr/0000-template.md` |
| 全体設計 | `docs/architecture.md` | 1 ファイル | — |

## 書き方

- 新規作成時は必ず対応するテンプレートをコピーして使い、セクションを削らない（不要なら「該当なし」と書く）。
- 受け入れ条件は `AC-1`, `AC-2` … と連番を振り、「Given / When / Then」で**テストに直訳できる粒度**で書く。曖昧語（「適切に」「快適に」「など」）を使わない。
- 仕様の変更は仕様ファイルを先に更新し、変更履歴に理由を残す。実装だけが先行しない。
- 計画の `Status:` は `draft` → `in-progress` → `done` のいずれか。SessionStart hook が `in-progress` の計画を拾う。
- アーキテクチャ上の重要な選択（認証方式、状態管理、DB、主要ライブラリ）を行ったら ADR を書く。決定を覆すときは新しい ADR を作り、古い ADR のステータスを `Superseded` にする。
- コードと文書の食い違いに気づいたら、その場で文書を直すか、直せない理由を報告する。
