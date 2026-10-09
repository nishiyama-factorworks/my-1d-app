# アーキテクチャ

> 決定を変えたら更新し、重要な選択は `docs/adr/` に ADR を残す。`<...>` が残っていたら未決。

## 1. システム概要

GitHub のリポジトリをキーワードで検索し、一覧から選んだリポジトリの詳細（言語・Star 数・Watcher 数・Fork 数・Issue 数）を別ページで確認できる Web アプリ。ログイン不要の閲覧者向け。Next.js（App Router）の Server Components が、サーバー側で GitHub REST API を呼び、結果を描画して返す。データベースは持たず、検索条件は URL のクエリで持つ。

## 2. 技術スタック

| 領域           | 採用                                          | 理由/ADR           |
| -------------- | --------------------------------------------- | ------------------ |
| フレームワーク | Next.js（App Router）/ TypeScript strict      | docs/adr/0001 など |
| スタイリング   | Tailwind CSS v4 + shadcn/ui                   | docs/adr/0003      |
| データ保存     | なし（DB を持たない。応答の一時的なキャッシュは 5 節） | 仕様 0001 の 7 節、ADR 0005 |
| 認証           | なし（ログイン不要）                          | 仕様 0001 の 4.2   |
| テスト         | Vitest + Testing Library + jsdom（単体/結合） | 仕様 0002          |
| E2E（任意）    | Playwright（`@playwright/test`）+ 偽の GitHub API | 仕様 0013、ADR 0006 |
| デプロイ先     | 範囲外                                        | 仕様 0001 の 4.2   |

## 3. 構成と責務

```
ブラウザ ──> Next.js (Server Components) ──> GitHub API（`lib/github/` 経由）
```

`src/` は使わず、ルート直下に置く（仕様 0002 で決定）。

- `app/`: ルーティング。薄く保つ
- `features/<名前>/`: 機能単位（UI・ロジック・テストを同居）
  - `features/search/`: 検索フォーム（`components/search-form.tsx`）。URL の `q` を初期値にし、送信で `/?q=…&page=1` へ遷移する
  - 検索結果一覧（`components/search-results.tsx`）。取得は `components/search-content.tsx` の `renderSearchContent` が `searchRepositories` で行う。`app/page.tsx` は `q` があるときだけ、取得を await せず Promise のまま `<Suspense key={buildSearchPath(q, page)} fallback={<LoadingStatus />}>` の中の `SearchContent`（`use` で読む）に渡す。`key` は `q`・`page` だけが変わる遷移でも読み込み中を出すため（どれも Server Component）。各行のリンクは詳細パスに検索条件を付ける（`repoPathFromFullName(fullName, { q, page })` → `buildRepoPathWithSearch`。`/repos/<owner>/<repo>?q=…&page=…`）
  - 0 件の案内（`components/empty-results.tsx`）。`renderSearchContent` が総件数 0 のとき範囲外の判定より先に返す。`GitHubApiError` は `ApiErrorView` を返し、それ以外の例外はそのまま投げる
  - ページネーション（`components/pagination.tsx`。番号の並びは `lib/page-items.ts` の `buildPageItems`）。最大ページ数は `lib/search/` の `calculateMaxPage`。押せない「前へ」「次へ」は `role="link"` と `aria-disabled="true"` の `span`
  - 範囲外ページの案内（`components/out-of-range-notice.tsx`）。範囲外の判定は `renderSearchContent` が 2 段で行う: `page` が `calculateMaxPage(SEARCH_RESULT_LIMIT)`（現在 34）超なら GitHub API を呼ばずに範囲外（422 とレート制限の消費を避ける）、取得後は総件数に対して最終ページ超なら範囲外。総件数 0 は範囲外にしない
  - `features/state-views/`: トップと詳細で共用する状態表示。読み込み中（`components/loading-status.tsx`。`role="status"`）、API エラーの種別ごとの表示（`components/api-error-view.tsx`。`role="alert"`、props は `kind` と `resetAt` だけ）、再試行ボタン（`components/retry-button.tsx`。`router.refresh()`）、リセット時刻の整形（`lib/format-time-in-tokyo.ts`。Asia/Tokyo の `HH:mm`）
  - `features/repo-detail/`: 詳細表示（`components/repo-detail-view.tsx`。見出し・オーナーアイコン・6 項目・GitHub へのリンク・トップへ戻るリンク）。取得は `app/repos/[owner]/[repo]/page.tsx` が `getRepository` で行い、結果を渡す（どちらも Server Component）。数値と言語の整形は `lib/search/format.ts`。「トップへ戻る」は `backHref` を props で受け取って描くだけで、`page.tsx` が `searchParams` から `buildBackPath`（`lib/search/back-path.ts`）で計算して渡す
- `components/ui/`: 再利用 UI（shadcn/ui の部品もここ）
- `lib/`: 横断ユーティリティ
- `lib/github/`: GitHub REST API の呼び出し層。GitHub API は**ここだけ**が呼ぶ。公開面は `lib/github/index.ts`（`searchRepositories` / `getRepository` / `GitHubApiError` と型）
- `tests/`: E2E・結合テストの共有ヘルパ、構成検査テスト
- `e2e/`（0013）: Playwright のシナリオ（`*.spec.ts`）と偽の GitHub API（`e2e/mock-api/server.ts`）。`pnpm test:e2e` で実行する（`bash scripts/verify.sh` には含めない。CI はリポジトリ変数 `RUN_E2E` が `true` のときだけ）。Vitest は `e2e/` を実行しない

## 4. データモデル

データは永続化しない（DB なし）。アプリ内で扱う型は `lib/github/types.ts` の次の 3 つで、GitHub API の応答は `lib/github/` で検証・変換してからこの型で渡す。

- `SearchRepositoriesResult`: 検索結果（総件数 `totalCount` と `RepoSummary` の配列）
- `RepoSummary`: 一覧の 1 件（リポジトリ名、オーナー名、オーナーのアイコン URL）
- `RepoDetail`: 詳細（`RepoSummary` の項目に、言語、Star 数、Watcher 数〈`subscribers_count` から〉、Fork 数、Issue 数、GitHub の URL を加えたもの）

GitHub API の項目との対応は、親仕様 0001 の 7 節にある。

## 5. 境界とルール

- Server / Client の境界: トークン（`GITHUB_TOKEN`）を扱うモジュール（`lib/github/http.ts` `client.ts`）は先頭で `import "server-only"` とし、Client Component から読み込むとビルドで失敗させる。型とエラー定義（`types.ts` `errors.ts`）は Client からも import できる
- Client Component は `features/search/components/search-form.tsx`、`features/state-views/components/retry-button.tsx`、`app/error.tsx` のみ（`"use client"`）。`lib/github/`（server-only）を読み込まない。ページ（`app/page.tsx`）は Server Component のままで、`searchParams` を `parseSearchParams` で解釈して `initialQuery` を渡す
- 画像: オーナーアイコンは `next/image`。外部ホストは `avatars.githubusercontent.com` の `/u/**`（クエリは `?v=4` のみ）だけを `next.config.ts` の `images.remotePatterns` で許可する（ホストは 0003 の `avatar_url` の検証と一致。**パスとクエリは 0003 より狭い**ので、0003 を通っても `/u/` 以外のパスや `?v=4` 以外のクエリのアイコンは `/_next/image` が 400 を返し、画像が壊れる。開発モードではローダーが例外を投げてページが落ちる。GitHub が `?v=4` を変えると全アイコンが壊れる点にも注意）
- 静的ファイル（0017）: `public/` に置くファイルは、名前が `app/` `features/` `lib/` `components/` のコード・CSS、`next.config.ts`、`package.json` のどこかに現れること（雛形の未使用 SVG を置き忘れないため）。現在 `public/` は空で、Git 上は存在しない。動的に組み立てるパスや、外部サイトからの直接リンク用のファイルは、理由つきで検査の許可リストに載せる。`app/favicon.ico` は対象外。検査は `tests/foundation/public-assets-referenced.test.ts`
- ルールとスキルのパス表記（0016）: `.claude/rules/*.md` と `.claude/skills/**/SKILL.md` に、パスとしての `src/`（行頭・空白・引用符・括弧の直後の `src/`。`./src/` は検査の対象外）を書かない（このプロジェクトはルート直下構成）。`.claude/rules/10-nextjs.md` の `paths`（ルールを読み込む対象）は `app/**/*.{ts,tsx}`・`features/**/*.{ts,tsx}`・`next.config.*`・`middleware.ts`・`proxy.ts` の 5 つ（Next.js 16 で `middleware` が `proxy` に改名されたため両方を指定）。検査は `tests/harness/claude-paths-root-layout.test.ts`
- GitHub API のエラー: `GitHubApiError`（`kind`: `RATE_LIMIT` `NOT_FOUND` `VALIDATION` `UPSTREAM` `NETWORK`、`status`、`resetAt`）を throw する。メッセージは種別ごとの固定文言で、トークン・URL・レスポンス本文を含めない
- 状態表示（0010）: 本番の `error.tsx` には Server Component の例外の `message` が届かないため、`GitHubApiError` はページ（トップは `renderSearchContent`、詳細は `page.tsx`）で受け止めて `ApiErrorView` を描画する。想定外の例外は `app/error.tsx`（`retry` で再取得）が受ける。読み込み中は、トップが `<Suspense>`、詳細が `app/repos/[owner]/[repo]/loading.tsx`。ストリーミングで返すため、エラー表示と 404 はどちらも HTTP 200（404 には Next.js が `noindex` を付ける）
- 詳細ページ（`/repos/<owner>/<repo>`）のエラー: `GitHubApiError` の `kind` が `NOT_FOUND` のときだけ `notFound()` を呼び、`app/repos/[owner]/[repo]/not-found.tsx` を出す（ルートの `app/not-found.tsx` は置かない）。それ以外の `GitHubApiError` は `ApiErrorView`、`GitHubApiError` 以外の例外はそのまま投げる。URL の `owner` `repo` は加工せず `getRepository` に渡し、不正な形式は `getRepository` が `fetch` 前に `NOT_FOUND` にする
- 検索条件の持ち回り（0009）: 保存せず、詳細ページの URL のクエリ（`q` `page`）で持ち回る。戻り先は `buildBackPath` が `parseSearchParams`（0004）で検証・正規化し、`buildSearchPath` で作り直す（受け取った文字列をそのまま `href` にしない。`q` が空、または 257 文字以上なら `/`、`page` が不正なら 1）。検索条件は `getRepository` の呼び出しに影響しない。404 の「トップへ戻る」は `searchParams` を受け取れないため `/` 固定
- 定数の一本化（0018）: 1 ページの件数 30（`SEARCH_PER_PAGE`）とキーワードの上限 256（`SEARCH_KEYWORD_MAX_LENGTH`）は `lib/search/constants.ts` だけで定義し、`lib/github/client.ts` が `@/lib/search/constants` から import する。依存の向きは `lib/github/` → `lib/search/constants.ts` のみで、`lib/search/` は `lib/github/` を import しない（`lib/search/` をクライアントで使えるまま保つため）。`MAX_PER_PAGE`（API の上限 100）、`OWNER_PATTERN` `REPO_PATTERN` など GitHub API 固有の制約は `lib/github/` に残す。重複と依存の向きは `tests/foundation/search-constants-single-source.test.ts` が検査する
- 取得のキャッシュ（0011、ADR 0005）: `lib/github/http.ts` の `fetch` に `next: { revalidate }` を渡す（検索 300 秒・詳細 600 秒）。`cache` は指定しない。200 の応答だけが保存され、キーは URL とリクエストヘッダ（トークンを含む）ごと。ディスクのキャッシュ（`.next/cache/fetch-cache/`）には GitHub の生の応答が入る。利用者に返すのは公開リポジトリの情報だけ（非公開と確認できないものは 0003 で返さない）。`GITHUB_TOKEN` は公開リポジトリだけを読める最小権限にする。`searchParams` を読む動的ルートでも効くことを実機で確認済み
- ページタイトル（0011）: ルートレイアウトの `metadata.title` は `{ default: アプリ名, template: "%s | アプリ名" }`、`lang="ja"`。`template` は同じセグメントの `page.tsx`（トップ）には効かないため、トップは `generateMetadata` で `title.absolute` の完成形（`<q> の検索結果 | アプリ名`、`q` なしはアプリ名のみ）を返す。詳細は `generateMetadata` で URL の `params` から `<owner>/<repo>` を返し（API を呼ばない）、`template` が `| アプリ名` を付ける。404 とエラーはルートの `default`（アプリ名）になる
- GitHub API 層の防御策: 宛先オリジンは `api.github.com` に固定（例外: 環境変数 `GITHUB_API_BASE_URL` が `http://127.0.0.1:<ポート>` / `http://localhost:<ポート>` のときだけ、そのオリジンに上書きする。E2E 専用。それ以外の値は `VALIDATION`、上書き中は `Authorization` を付けない。0013、ADR 0006）。公開と確認できないリポジトリは返さない。レスポンスの `avatar_url` / `html_url` は https かつ GitHub のホストのみ許可する
- 外部入力の検証: スキーマ検証のライブラリは使わず、自前のコードでサーバー側で検証する。URL のクエリは `lib/search/`（`parseSearchParams` など）、GitHub API の応答と `owner` `repo` は `lib/github/`（`client.ts` `mappers.ts`）で検証する
- 認証・認可: 利用者の認証・認可は行わない（ログイン不要）。`GITHUB_TOKEN`（任意）はサーバー側だけで使い、`lib/github/http.ts`（先頭が `import "server-only"`）が読む。未設定でも動く

## 6. 環境変数

キー名のみ `.env.example` に記載。値は `.env.local`（Git 管理外）。

- `GITHUB_API_BASE_URL` は E2E 専用（Playwright の `webServer` が設定する）。`.env.example` に書かず、本番の環境に設定しない。

## 7. 非機能要件

- アクセシビリティ（0011）:
  - すべての画面で `lang="ja"`、`h1` がちょうど 1 つ、`main` がちょうど 1 つ、見出しのレベルが飛ばない。ルートレイアウトは `main` と見出しを持たず、各ページが持つ。独立した画面（404、`app/error.tsx`、詳細の API エラー）も自前の `h1` を持つ。確認は `tests/a11y/page-structure.test.tsx`
  - 状態メッセージ: 読み込み中・0件・範囲外は `role="status"`、エラーは `role="alert"`
  - フォーカス表示はブラウザ既定を使い、消さない。`tests/a11y/focus-outline.test.ts` が `app/` `features/` `lib/` `components/` と `app/globals.css` の `outline-none` 等を検出する（shadcn/ui の部品を `components/ui/` に入れたときにこの検査に引っかかったら、AC-26b2 を見直す）
  - 自動のアクセシビリティチェックのツール（jest-axe 等）は導入していない。確認は Testing Library の `role` / ラベルによる検索、`eslint-config-next` 経由の `jsx-a11y`、目視
- レスポンシブ: 幅 320px 程度で横スクロールが出ないことを目視で確認する（長い文字列は `break-all`、ページネーションは `flex-wrap`、入力欄は `w-full min-w-0`）。jsdom では検証できないため、自動検査は 0件の案内の折り返し指定だけ
- 性能: 不要なクライアント JS を増やさない（`"use client"` は `app/error.tsx`、検索フォーム、再試行ボタンの末端のみ）。取得のキャッシュは上の 5 節
