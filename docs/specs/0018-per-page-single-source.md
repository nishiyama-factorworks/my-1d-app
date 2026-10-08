# 0018: `lib/github` の既定値 30 を `SEARCH_PER_PAGE` に一本化する

- Status: draft
- 作成日: 2026-10-08
- Issue: #20
- 関連: `0003-github-api-client.md`、`0004-search-utils.md`、依存: 0003, 0004

> この仕様は、仕様番号を付与するための**下書き**。受け入れ条件は着手時（`/feature 20`）に確定し、人間の承認を得る。

## 1. 背景と目的

1 ページの件数 30 が、`lib/github/client.ts`（非公開の `DEFAULT_PER_PAGE`）と `lib/search/constants.ts`（`SEARCH_PER_PAGE`）の 2 か所にある。一本化して、値のずれを防ぐ。PR #18（0003）と PR #19（0004）での提案 P1。

## 2. 対象ユーザーと前提

- 開発者。画面の挙動は変わらない。
- 着手の前提だった PR #19 はマージ済み。

## 3. ユーザーストーリー

- 開発者として、1 ページの件数の定義を 1 か所にしたい。それは値が食い違う事故を防ぐためである。

## 4. 範囲

### 4.1 やること

- `lib/github/client.ts` の `DEFAULT_PER_PAGE` を、`lib/search/constants.ts` の `SEARCH_PER_PAGE` の import に置き換える。
- import の向きは `lib/github/` → `lib/search/constants.ts` のみ。`lib/search/` は純粋なモジュールなので、`server-only` の `lib/github/` から読み込んでも問題ない。逆向きは、`lib/search/` がクライアントで使えなくなるため不可。

### 4.2 やらないこと（Non-goals）

- 値 30 の変更
- `MAX_PER_PAGE`（API の上限 100）や `MAX_Q_LENGTH` の移動

## 5. 受け入れ条件（案。着手時に確定する）

| ID   | Given                          | When                           | Then                                                                  |
| ---- | ------------------------------ | ------------------------------ | --------------------------------------------------------------------- |
| AC-1 | `lib/github/client.ts` を読む  | 既定の件数の定義を探す         | `DEFAULT_PER_PAGE` が無く、`SEARCH_PER_PAGE` を import している       |
| AC-2 | 既存のテストを実行する         | `pnpm test` を実行する         | 値を変えずに全件通る                                                  |
| AC-3 | `lib/github` を未モックで読む  | `server-only.test.ts` を実行する | 拒否される検査が引き続き通る                                          |
| AC-4 | `lib/search/` を読む           | import を調べる                | `lib/github/` を import していない                                    |

## 6. 画面・API の契約

該当なし（挙動は変えない）。

## 7. データ

該当なし。

## 8. 非機能要件

- `lib/search/` はクライアントで使える純粋なモジュールのまま保つ。

## 9. 未決事項

- なし

## 10. 変更履歴

| 日付       | 変更                                 | 理由                                      |
| ---------- | ------------------------------------ | ----------------------------------------- |
| 2026-10-08 | 下書きを作成（仕様番号 0018 を付与） | Ready の判定の対象にするため（Issue #25） |
