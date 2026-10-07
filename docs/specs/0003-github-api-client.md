# 0003: GitHub APIクライアント

- Status: draft
- 作成日: 2026-10-07
- Issue: なし（リポジトリ作成前。起票後に記入）
- 関連: `0001-github-repo-search.md`（親仕様）、依存: 0002

## 1. 背景と目的
GitHub REST APIをサーバー側から呼び、アプリ内の型に変換して返す層を作る。以降の画面タスクは、この層だけを通してデータを取得する。トークンの扱いとエラーの分類もここで一元化する。

## 2. 対象ユーザーと前提
- ロール: 開発者（以降のタスクの実装者）。画面からは直接見えない内部モジュール。
- 前提: 0002が完了している。呼び出しはサーバー側（Server Component / Route Handler）だけで行う。

## 3. ユーザーストーリー
- 開発者として、検索と詳細取得を型付きの関数で呼べる。それは画面側にAPIの細部を持ち込まないためである。
- 開発者として、APIの失敗を種別で判別できる。それは画面でエラーごとに適切な表示を出すためである。
- 閲覧者として、トークンなどの秘密情報が画面やブラウザに出ない状態で使える。それは安全に利用するためである。

## 4. 範囲
### 4.1 やること
- `searchRepositories`: `GET /search/repositories` の呼び出しと、一覧用の型への変換
- `getRepository`: `GET /repos/{owner}/{repo}` の呼び出しと、詳細用の型への変換
- 型定義（0001の7節の対応表に従う）
- APIエラーの種別分類
- トークン（環境変数 `GITHUB_TOKEN`）の取り扱い
- サーバー専用であることの保証（クライアントバンドルに含めない）

### 4.2 やらないこと（Non-goals）
- 画面への表示（0006、0008）
- エラーの画面表示（0010）
- キャッシュ方針の確定（0011）

## 5. 受け入れ条件（テストに直訳できる粒度で）

> `fetch` をモックして検証する。実際のGitHub APIは呼ばない。

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC-5a | 検索条件 `q="react"`、`page=2` | `searchRepositories` を呼ぶ | `GET /search/repositories` に `q=react` `page=2` `per_page=30` が付いて呼ばれ、`sort` と `order` は付かない |
| AC-5b | 検索APIが `total_count=1234` と30件の `items` を返す | `searchRepositories` が成功する | `totalCount` が1234、`items` が30件で、各itemが `fullName` `ownerLogin` `ownerAvatarUrl` を持つ |
| AC-13a | 個別APIが `stargazers_count=100` `subscribers_count=7` `forks_count=20` `open_issues_count=5` `language="TypeScript"` を返す | `getRepository` を呼ぶ | Star数100、Watcher数7、Fork数20、Issue数5、言語 `TypeScript` として返る（Star数とWatcher数は別の値） |
| AC-13b | 個別APIが `language: null` を返す | `getRepository` を呼ぶ | 言語が `null` として返り、エラーにならない |
| AC-23a | 環境変数 `GITHUB_TOKEN` が設定されている | いずれかのAPI関数を呼ぶ | `Authorization` ヘッダが付き、`Accept: application/vnd.github+json` と `X-GitHub-Api-Version` ヘッダも付く |
| AC-23b | `GITHUB_TOKEN` が未設定 | いずれかのAPI関数を呼ぶ | `Authorization` ヘッダ無しで呼ばれ、呼び出しは成功する |
| AC-23c | クライアントコンポーネントから本モジュールを読み込もうとする | ビルドまたはテストを実行する | サーバー専用モジュールとして拒否される（`server-only` 等） |
| AC-23d | `GITHUB_TOKEN` が設定され、APIが失敗する | エラーを受け取る | エラーのメッセージ・戻り値・ログにトークンの文字列が含まれない |
| AC-24a | APIが429を返す、または403で `x-ratelimit-remaining: 0` と `x-ratelimit-reset` を返す | API関数を呼ぶ | `RATE_LIMIT` として失敗する。リセット時刻が分かる場合はそれを保持する |
| AC-24b | APIが404を返す | `getRepository` を呼ぶ | `NOT_FOUND` として失敗する |
| AC-24c | APIが422を返す（例: 1,000件を超えるページ指定） | `searchRepositories` を呼ぶ | `VALIDATION` として失敗する |
| AC-24d | APIが500・502・503、またはその他の想定外の応答を返す | API関数を呼ぶ | `UPSTREAM` として失敗する |
| AC-24e | `fetch` が接続失敗またはタイムアウトで失敗する | API関数を呼ぶ | `NETWORK` として失敗する |

## 6. 画面・API の契約
### 6.1 画面（該当する場合）
該当なし。

### 6.2 API・Server Action（該当する場合）
関数名と型名は計画で確定する。契約は次のとおり。

| 関数 | 入力 | 出力 | エラー |
| --- | --- | --- | --- |
| `searchRepositories` | `q`（文字列、必須）、`page`（1以上の整数、既定1）、`perPage`（既定30） | `{ totalCount, items: RepoSummary[] }` | `RATE_LIMIT` `VALIDATION` `UPSTREAM` `NETWORK` |
| `getRepository` | `owner`、`repo`（文字列） | `RepoDetail` | `RATE_LIMIT` `NOT_FOUND` `UPSTREAM` `NETWORK` |

エラーは、種別（`RATE_LIMIT` `NOT_FOUND` `VALIDATION` `UPSTREAM` `NETWORK`）と、必要に応じてリセット時刻を持つ。

## 7. データ
保存はしない。型は次の項目を持つ（0001の7節の対応表に従う）。

| 型 | 項目 |
| --- | --- |
| `RepoSummary` | `fullName`、`ownerLogin`、`ownerAvatarUrl` |
| `RepoDetail` | `fullName`、`ownerLogin`、`ownerAvatarUrl`、`language`（nullあり）、`stargazersCount`、`watchersCount`（`subscribers_count` から）、`forksCount`、`openIssuesCount`、`htmlUrl` |

## 8. 非機能要件
- セキュリティ: トークンはサーバー側のみで扱い、クライアントに露出させない。ログやエラーに含めない。
- 信頼性: 失敗を握りつぶさず、5種別のいずれかに分類して返す。
- 認証なしでは検索APIのレート制限が厳しい（要確認）。トークンが無くても動作するが、制限に達しやすい。

## 9. 未決事項
- [ ] 関数名・型名・エラー型の形 / 担当: 本タスクの計画 / 期限: 計画承認時
- [ ] タイムアウトの秒数 / 担当: 本タスクの計画 / 期限: 計画承認時

## 10. 変更履歴
| 日付 | 変更 | 理由 |
| --- | --- | --- |
| 2026-10-07 | 初版 | 全体仕様0001から分割 |
