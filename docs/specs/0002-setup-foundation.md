# 0002: プロジェクト基盤

- Status: approved
- 作成日: 2026-10-07
- Issue: #2
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
- ディレクトリ構成の決定: `src/` は使わず、ルート直下に `app/`（ルーティング）・`features/<名前>/`（機能単位）・`components/ui/`（再利用UI）・`lib/`（横断ユーティリティ）を置く。CLAUDE.md 6節は実態に合わせる。`.claude/harness.env` の `SRC_REGEX` はルート直下を許容済みだが `features/` が含まれていないため、`features` を追加する
- CSS手法・UIライブラリ: Tailwind CSS v4（導入済み）+ shadcn/ui。本タスクでは shadcn/ui の初期化（`components.json`、`lib/utils.ts` の `cn`）までとし、個別コンポーネントは必要になったタスクで追加する。決定は ADR に記録する
- `.gitignore` の整備（`.env*` を除外し `.env.example` のみ追跡）と、プレースホルダーのトップページ（Create Next App の雛形を置き換える）

### 4.2 やらないこと（Non-goals）

- 検索・詳細などの画面機能
- CI以外のデプロイ設定

## 5. 受け入れ条件（テストに直訳できる粒度で）

| ID     | Given                                      | When                                                                                        | Then                                                                                                                                                |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-21a | 依存をインストールしていないクリーンな状態 | `pnpm install` の後に、`pnpm typecheck` `pnpm lint` `pnpm test` `pnpm build` を順に実行する | すべてのコマンドが終了コード0で終わる                                                                                                               |
| AC-21b | プロジェクトのルート                       | package.json、ディレクトリ構成、tsconfigを確認する                                          | Next.jsのバージョンが16以降で、`app/` ディレクトリ（App Router）があり、tsconfigの `strict` が `true` である。スモークテストが1件以上あり、パスする |
| AC-32a | `.env.example` と `.gitignore`             | 内容を確認する                                                                              | `.env.example` にはキー名（`GITHUB_TOKEN`）のみがあり、値や秘密情報を含まない。`.env*`（`.env.example` を除く）はGit管理外である                    |
| AC-32b | `harness.env` と package.json              | `bash scripts/harness-doctor.sh` を実行する                                                 | `harness.env` の `*_CMD` がpackage.jsonのscriptsと一致し、出力に `[FAIL]` が無い                                                                    |

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

- [x] コンポーネントライブラリとCSS手法の選定 → Tailwind CSS v4 + shadcn/ui（2026-10-07 人間が決定。ADR に記録する）
- [x] ディレクトリ構成 → `src/` を使わずルート直下（2026-10-07 人間が決定）
- [x] shadcn/ui 関連の依存は導入時に人間へ個別承認を取る（CLAUDE.md 5節）。本タスクでは `clsx` と `tailwind-merge` のみ承認済み・追加済み。`class-variance-authority` `lucide-react` `tw-animate-css` は最初のコンポーネントを追加するタスクで改めて承認を取る

## 10. 変更履歴

| 日付       | 変更 | 理由                 |
| ---------- | ---- | -------------------- |
| 2026-10-07 | 初版 | 全体仕様0001から分割 |
| 2026-10-07 | 未決事項の決定を反映（ルート直下構成、Tailwind + shadcn/ui、依存は clsx/tailwind-merge のみ）。`SRC_REGEX` へ `features` を追加する旨を4.1に明記。Status を approved に、Issue を #2 に | `/feature #2` での人間の決定・承認 |
