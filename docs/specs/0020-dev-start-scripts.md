# 0020: `dev` / `start` スクリプトの追加

- Status: approved
- 作成日: 2026-10-09
- Issue: #35
- 関連: `0002-setup-foundation.md`（土台）、`0012` の README（起動手順を書く前提）

## 1. 背景と目的

`package.json` の `scripts` に `dev` と `start` が無く、開発サーバーの起動に `pnpm exec next dev` を直接使っている。README（#12）で起動手順を書く前に、`pnpm dev`（開発サーバー）と `pnpm start`（`pnpm build` 後の本番起動）で起動できるようにする。

## 2. 対象ユーザーと前提

- 開発者と、README を読んで手元で起動する人。
- Next.js 16.3.8。ポートは Next.js の既定（3000）のまま。

## 3. ユーザーストーリー

- 開発者として、`pnpm dev` と `pnpm start` でアプリを起動できる。それは README の手順を単純にし、起動方法を迷わないようにするためである。

## 4. 範囲

### 4.1 やること

- `package.json` の `scripts` に `"dev": "next dev"` と `"start": "next start"` を追加する。
- 上記を検査する構成検査テスト（`tests/foundation/`）を追加する。

### 4.2 やらないこと（Non-goals）

- 依存パッケージの追加・更新
- ポートやオプション（`-p`、`--turbopack` など）の固定
- 既存スクリプト（`typecheck` / `lint` / `test` / `test:e2e` / `build` / `format`）の変更
- README の更新（#12 で扱う）

## 5. 受け入れ条件（テストに直訳できる粒度で）

| ID   | Given          | When                   | Then                                                                                     |
| ---- | -------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| AC-1 | `package.json` | `scripts.dev` を読む   | `next dev` と完全に一致する                                                              |
| AC-2 | `package.json` | `scripts.start` を読む | `next start` と完全に一致する                                                            |
| AC-3 | `package.json` | 既存の 6 つのスクリプトを読む | `typecheck` は `next typegen && tsc --noEmit`、`lint` は `eslint .`、`test` は `vitest run`、`test:e2e` は `playwright test`、`build` は `next build`、`format` は `prettier --write .` と完全に一致する |
| AC-4 | `package.json` | `dependencies` と `devDependencies` を確認する | この変更で追加・更新された依存が無い（`git diff` で人間が確認。自動検査はしない）       |

## 6. 画面・API の契約

該当なし。

## 7. データ

該当なし。

## 8. 非機能要件

- `pnpm start` は事前に `pnpm build` が必要（Next.js の仕様）。README で案内する（#12）。
- `.env*` と依存パッケージには触れない。

## 9. 未決事項

- なし

## 10. 変更履歴

| 日付       | 変更         | 理由                                  |
| ---------- | ------------ | ------------------------------------- |
| 2026-10-09 | 下書きを作成 | Issue #35（README 作成前の準備）のため |
| 2026-10-09 | 人間が承認（Status: approved） | 承認ゲート① |
