# 0018: `lib/github` の既定値 30 と上限 256 を `lib/search/constants.ts` に一本化する

- Status: approved
- 作成日: 2026-10-08
- Issue: #20
- 関連: `0003-github-api-client.md`、`0004-search-utils.md`、`0009-back-navigation.md`、`0011-nonfunctional-polish.md`、依存: 0003, 0004

## 1. 背景と目的

次の 2 つの値が、`lib/github/client.ts`（非公開の定数）と `lib/search/constants.ts` の 2 か所にある。一本化して、値のずれを防ぐ。

- 1 ページの件数 30: `lib/github/client.ts` の `DEFAULT_PER_PAGE` と、`lib/search/constants.ts` の `SEARCH_PER_PAGE`。PR #18（0003）と PR #19（0004）での提案 P1。
- キーワードの上限 256 文字: `lib/github/client.ts` の `MAX_Q_LENGTH` と、`lib/search/constants.ts` の `SEARCH_KEYWORD_MAX_LENGTH`。0009 で `SEARCH_KEYWORD_MAX_LENGTH` を足したため二重になった（0009・0011 の申し送り）。

## 2. 対象ユーザーと前提

- 開発者。画面とAPI呼び出しの挙動は変わらない。
- 着手の前提だった PR #19 はマージ済み。

## 3. ユーザーストーリー

- 開発者として、1 ページの件数とキーワードの上限の定義を 1 か所にしたい。それは値が食い違う事故を防ぐためである。

## 4. 範囲

### 4.1 やること

- `lib/github/client.ts` の `DEFAULT_PER_PAGE` と `MAX_Q_LENGTH` を削除し、`lib/search/constants.ts` の `SEARCH_PER_PAGE` と `SEARCH_KEYWORD_MAX_LENGTH` を import して使う。
- import の向きは `lib/github/` → `lib/search/constants.ts` のみ。`lib/search/` は純粋なモジュールなので、`server-only` の `lib/github/` から読み込んでも問題ない。逆向き（`lib/search/` → `lib/github/`）は、`lib/search/` がクライアントで使えなくなるため不可。
- 重複を残すコメントの更新: `lib/search/constants.ts` の「`MAX_Q_LENGTH` と同じ値。一本化は Issue #20」というコメント、`lib/github/types.ts` の `perPage?: number; // 既定 30`、`docs/architecture.md` の「キーワードの上限 256 は … 重複している」という記述。
- 一本化を保つための構成検査テスト（`tests/foundation/`）の追加。

### 4.2 やらないこと（Non-goals）

- 値 30・256 の変更
- `MAX_PER_PAGE`（GitHub API の `per_page` の上限 100）、`OWNER_PATTERN` `REPO_PATTERN`（GitHub の名前の規則）、`DEFAULT_PAGE`（1）の移動。これらは GitHub API 固有の制約で、`lib/github/` に残す
- `lib/search/` の他の定数（`SEARCH_RESULT_LIMIT` など）の変更

## 5. 受け入れ条件（テストに直訳できる粒度で）

> 画面とAPI呼び出しの挙動は変えないため、AC-3・AC-4 は既存のテストが期待値を変えずに通ることで確かめる。AC-1・AC-2・AC-5 は、ソースを読む構成検査テスト（`tests/foundation/`）で確かめる。

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC-1 | `lib/github/client.ts`（テストを除く）のソース | 定数の定義と import を調べる | `DEFAULT_PER_PAGE` と `MAX_Q_LENGTH` という名前の宣言が無い。`SEARCH_PER_PAGE` と `SEARCH_KEYWORD_MAX_LENGTH` を `@/lib/search/constants` から import している |
| AC-2 | `lib/github/` のテストを除く `.ts` のソース | 数値リテラルを調べる | 1 ページの件数 `30` とキーワードの上限 `256` の数値リテラルが無い（コメントは対象外。`100`（`MAX_PER_PAGE` と `REPO_PATTERN` の長さ）は GitHub 固有の制約なので対象外） |
| AC-3 | 既存のテストを実行する | `pnpm test` を実行する | `lib/github/client.test.ts` の `per_page` の既定値 30、`q` が 256 文字で成功・257 文字で `VALIDATION`、`perPage` の境界（1〜100）を含め、既存のテストが期待値を変えずに全件通る |
| AC-4 | `lib/github` を未モックで読む | `lib/github/server-only.test.ts` を実行する | 拒否される検査が引き続き通る |
| AC-5 | `lib/search/` のテストを除くソース | import を調べる | `lib/github/` を import していない（`@/lib/github`、`../github`、`../../lib/github` のいずれも無い） |

## 6. 画面・API の契約

該当なし（挙動は変えない）。

## 7. データ

該当なし。

## 8. 非機能要件

- `lib/search/` はクライアントで使える純粋なモジュールのまま保つ（AC-5）。
- `lib/github/` は `server-only` のまま保つ（AC-4）。

## 9. 未決事項

- なし（2026-10-08: 範囲を件数 30 と上限 256 の両方にする、構成検査テストを足す、を人間が決定）

## 10. 変更履歴

| 日付 | 変更 | 理由 |
| --- | --- | --- |
| 2026-10-08 | 下書きを作成（仕様番号 0018 を付与） | Ready の判定の対象にするため（Issue #25） |
| 2026-10-08 | 範囲を件数 30 に加えて上限 256（`MAX_Q_LENGTH` → `SEARCH_KEYWORD_MAX_LENGTH`）まで広げ、Non-goals の「`MAX_Q_LENGTH` の移動」を外した。AC を具体化し（AC-1 に `MAX_Q_LENGTH`、AC-2 リテラルの検査、AC-5 依存の向きの検査）、構成検査テストの追加を 4.1 に追記。Non-goals に、GitHub API 固有の制約（`MAX_PER_PAGE` など）は移さないことを明記 | `/feature 20` の仕様確認で、0009 により 256 が既に二重になっていることと、挙動が変わらないため既存のテストだけでは RED を作れないことが分かり、人間が決定 |
| 2026-10-08 | AC-5 の例示 `../../github` を `../../lib/github` に直した | `lib/search/x.ts` から見て `../../github` は `<root>/github` を指し `lib/github` ではない。レビューで指摘（実装の検出器は `../../lib/github` を正しく陽性にしていた） |
