# アーキテクチャ

> 導入時に埋める。決定を変えたら更新し、重要な選択は `docs/adr/` に ADR を残す。`<...>` が残っていたら未決。

## 1. システム概要

<1段落で。何を、誰のために、どう提供するか>

## 2. 技術スタック

| 領域           | 採用                                          | 理由/ADR           |
| -------------- | --------------------------------------------- | ------------------ |
| フレームワーク | Next.js（App Router）/ TypeScript strict      | docs/adr/0001 など |
| スタイリング   | Tailwind CSS v4 + shadcn/ui                   | docs/adr/0003      |
| データ保存     | <未定>                                        |                    |
| 認証           | <未定>                                        |                    |
| テスト         | Vitest + Testing Library + jsdom（単体/結合） | 仕様 0002          |
| デプロイ先     | <未定>                                        |                    |

## 3. 構成と責務

```
ブラウザ ──> Next.js (Server Components / Server Actions / Route Handlers) ──> <DB / 外部API>
```

`src/` は使わず、ルート直下に置く（仕様 0002 で決定）。

- `app/`: ルーティング。薄く保つ
- `features/<名前>/`: 機能単位（UI・アクション・ロジック・テストを同居）
  - `features/search/`: 検索フォーム（`components/search-form.tsx`）。URL の `q` を初期値にし、送信で `/?q=…&page=1` へ遷移する
  - 検索結果一覧（`components/search-results.tsx`）。取得は `app/page.tsx` が `q` があるときだけ `searchRepositories` で行い、結果を渡す（一覧は Server Component）
- `components/ui/`: 再利用 UI（shadcn/ui の部品もここ）
- `lib/`: 横断ユーティリティ
- `lib/github/`: GitHub REST API の呼び出し層。GitHub API は**ここだけ**が呼ぶ。公開面は `lib/github/index.ts`（`searchRepositories` / `getRepository` / `GitHubApiError` と型）
- `tests/`: E2E・結合テストの共有ヘルパ、構成検査テスト

## 4. データモデル

<主要なエンティティと関係。未定なら「未定」>

## 5. 境界とルール

- Server / Client の境界: トークン（`GITHUB_TOKEN`）を扱うモジュール（`lib/github/http.ts` `client.ts`）は先頭で `import "server-only"` とし、Client Component から読み込むとビルドで失敗させる。型とエラー定義（`types.ts` `errors.ts`）は Client からも import できる
- Client Component は `features/search/components/search-form.tsx` のみ（`"use client"`）。`lib/github/`（server-only）を読み込まない。ページ（`app/page.tsx`）は Server Component のままで、`searchParams` を `parseSearchParams` で解釈して `initialQuery` を渡す
- 画像: オーナーアイコンは `next/image`。外部ホストは `avatars.githubusercontent.com` の `/u/**`（クエリは `?v=4` のみ）だけを `next.config.ts` の `images.remotePatterns` で許可する（ホストは 0003 の `avatar_url` の検証と一致。**パスとクエリは 0003 より狭い**ので、0003 を通っても `/u/` 以外のパスや `?v=4` 以外のクエリのアイコンは `/_next/image` が 400 を返し、画像が壊れる。開発モードではローダーが例外を投げてページが落ちる。GitHub が `?v=4` を変えると全アイコンが壊れる点にも注意）
- GitHub API のエラー: `GitHubApiError`（`kind`: `RATE_LIMIT` `NOT_FOUND` `VALIDATION` `UPSTREAM` `NETWORK`、`status`、`resetAt`）を throw する。メッセージは種別ごとの固定文言で、トークン・URL・レスポンス本文を含めない
- GitHub API 層の防御策: 宛先オリジンは `api.github.com` に固定。公開と確認できないリポジトリは返さない。レスポンスの `avatar_url` / `html_url` は https かつ GitHub のホストのみ許可する
- 外部入力の検証: サーバ側でスキーマ検証（zod 等）
- 認証・認可: <方針>
- エラー形式（Route Handler の応答）: `{ error: { code, message } }`。GitHub API 層のエラーは上の `GitHubApiError`

## 6. 環境変数

キー名のみ `.env.example` に記載。値は `.env.local`（Git 管理外）。

## 7. 非機能要件

<性能の目安、アクセシビリティ、対応ブラウザ、ログ/監視>
