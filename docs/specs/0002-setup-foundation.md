# 0002: プロジェクト基盤

- Status: draft
- 作成日: 2026-10-07
- Issue: なし（リポジトリ作成前。起票後に記入）
- 関連: `0001-github-repo-search.md`（親仕様）、依存なし、`harness/MANUAL.md`

## 1. 背景と目的
以降のタスクが載る土台を作る。Next.js・TypeScript・テスト環境・環境変数の雛形をそろえ、品質ゲート（型チェック・Lint・テスト・ビルド）が最初から通る状態にする。UIの機能は作らない。

## 2. 対象ユーザーと前提
- ロール: 開発者（この課題に取り組む本人とAIエージェント）。
- 前提: Node.js、pnpm、git、jq、Claude Codeが使える。ハーネス（`.claude/` ほか）を導入する。

## 3. ユーザーストーリー
- 開発者として、クリーンな状態から1コマンドで依存を入れて、型チェック・Lint・テスト・ビルドを回せる。それは以降のタスクを同じ品質ゲートで進めるためである。
- 開発者として、必要な環境変数のキー名を `.env.example` で確認できる。それは秘密情報をコミットせずに設定するためである。

## 4. 範囲
### 4.1 やること
- Next.js v16以降 / App Router / TypeScript（strict）のプロジェクト作成
- pnpmでの依存管理
- テスト環境（Vitest、Testing Library、jsdom）と、スモークテスト1件
- package.jsonのscripts（`typecheck` `lint` `test` `build` `format`）。`test` は実行して終了する形（`vitest run`）
- `.env.example`（キー名のみ。`GITHUB_TOKEN`）
- ハーネスの導入と整合（`harness.env` のコマンドとscriptsの一致、`harness-doctor.sh` の確認）
- ディレクトリ構成の決定（`app/` と、API・ユーティリティ・コンポーネントの置き場）
- コンポーネントライブラリとCSS手法の決定（必要ならADR）

### 4.2 やらないこと（Non-goals）
- 検索・詳細などの画面機能
- CI以外のデプロイ設定

## 5. 受け入れ条件（テストに直訳できる粒度で）

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC-21a | 依存をインストールしていないクリーンな状態 | `pnpm install` の後に、`pnpm typecheck` `pnpm lint` `pnpm test` `pnpm build` を順に実行する | すべてのコマンドが終了コード0で終わる |
| AC-21b | プロジェクトのルート | package.json、ディレクトリ構成、tsconfigを確認する | Next.jsのバージョンが16以降で、`app/` ディレクトリ（App Router）があり、tsconfigの `strict` が `true` である。スモークテストが1件以上あり、パスする |
| AC-32a | `.env.example` と `.gitignore` | 内容を確認する | `.env.example` にはキー名（`GITHUB_TOKEN`）のみがあり、値や秘密情報を含まない。`.env*`（`.env.example` を除く）はGit管理外である |
| AC-32b | `harness.env` と package.json | `bash scripts/harness-doctor.sh` を実行する | `harness.env` の `*_CMD` がpackage.jsonのscriptsと一致し、出力に `[FAIL]` が無い |

## 6. 画面・API の契約
### 6.1 画面（該当する場合）
スモークテスト用のプレースホルダーのトップページのみ。具体的な表示要素は0005以降で作る。

### 6.2 API・Server Action（該当する場合）
該当なし。

## 7. データ
該当なし。環境変数のキー名は `GITHUB_TOKEN`（任意。未設定でも動作する）。

## 8. 非機能要件
- `test` は実行して終了する形にする（watchモードにしない）。Stopゲートが固まるのを防ぐため。
- `.env.example` に値を書かない。秘密情報をコミットしない。
- 設定の確認は `scripts/verify.sh` と `scripts/harness-doctor.sh` の実行結果で行う。

## 9. 未決事項
- [ ] コンポーネントライブラリとCSS手法の選定 / 担当: 本タスクの計画 / 期限: 計画承認時（必要ならADRに記録）
- [ ] ディレクトリ構成（`src/` の有無、置き場） / 担当: 本タスクの計画 / 期限: 計画承認時（`harness.env` の `SRC_REGEX` と揃える）

## 10. 変更履歴
| 日付 | 変更 | 理由 |
| --- | --- | --- |
| 2026-10-07 | 初版 | 全体仕様0001から分割 |
