# docs/ — プロジェクト文書

仕様駆動開発の「正」となる文書を置く。コードと食い違ったら、まず文書とコードのどちらが正しいかを決め、必ず片方を直す。

| 場所 | 内容 | 作り方 |
| --- | --- | --- |
| `specs/` | 機能仕様（受け入れ条件つき） | `/spec <要望>` |
| `plans/` | 実装計画（タスク分解） | `/plan <仕様パス>` |
| `adr/` | アーキテクチャ上の意思決定記録 | `/adr <論点>` |
| `architecture.md` | 全体設計（構成・データ・境界） | 手動で更新 |
| `quality-gates.md` | 完了の定義（品質ゲート） | 手動で更新 |
| `harness/MANUAL.md` | ハーネス（`.claude/` 等）の編集マニュアル | 手動で更新 |

## 流れ

```
Issue（/issue create）→ /spec → specs/NNNN-*.md（承認）→ /plan → plans/NNNN-*.md（承認）
     → /tdd → /implement（タスクごと）→ /review → /verify → /pr（Draft PR）→ 人間がマージ
```
`/feature <Issue番号>` は Issue 取得から Draft PR 作成までを通しで実行する。

## 管理元の分担

| 情報 | 管理元 |
| --- | --- |
| 何をやるか・進捗の状態 | GitHub Issue / Projects |
| どう振る舞うか（受け入れ条件） | `specs/` |
| どう実行するか（タスク分解） | `plans/` |
| なぜそう決めたか | `adr/` |

仕様・計画の冒頭に `Issue: #N` を書き、情報を二重管理しない。GitHub 運用の詳細は `harness/MANUAL.md` の 10 章。
