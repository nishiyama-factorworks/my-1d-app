# my-1d-app

## 概要

キーワードで GitHub のリポジトリを検索し、一覧から選んだリポジトリの詳細を表示する Web アプリです。Next.js（App Router）と TypeScript で作っています。

- トップページ（`/`）でキーワードを入力して検索すると、リポジトリの一覧が表示されます。ページネーションで先のページへ進めます。
- 一覧の 1 件を選ぶと、詳細ページ（`/repos/[owner]/[repo]`）に、オーナーのアイコン、リポジトリ名、言語、Star 数、Watcher 数、Fork 数、Issue 数が表示されます。「トップへ戻る」を押すと、検索したキーワードと同じページの一覧に戻ります。

仕様の全体は [docs/specs/0001-github-repo-search.md](docs/specs/0001-github-repo-search.md)、課題文は [docs/specs/\_assignment.md](docs/specs/_assignment.md) にあります。

## セットアップ

**前提**

- Node.js: CI は 22 を使っています（`.github/workflows/ci.yml`）。手元の動作確認は v24.21.0 です。リポジトリでは `engines` による固定をしていません。
- パッケージマネージャ: pnpm（`package.json` の `packageManager` は `pnpm@12.9.1`）。`npm` / `yarn` は使いません。

**手順**

```bash
pnpm install
pnpm dev
```

`pnpm dev` で開発サーバーが起動します（既定は http://localhost:3000）。本番ビルドで動かすときは次のとおりです。

```bash
pnpm build
pnpm start
```

**テスト**

```bash
pnpm test                  # 単体・結合テスト（Vitest）
bash scripts/verify.sh     # 型チェック・Lint・テスト・ビルドをまとめて実行（CI と同じ）
```

E2E テスト（Playwright）は任意で、先にブラウザの取得が必要です。実際の GitHub API には接続せず、偽の API（`e2e/mock-api/server.ts`）に差し替えて実行します（[仕様 0013](docs/specs/0013-e2e-optional.md)、[ADR 0006](docs/adr/0006-playwright-e2e.md)）。

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

**環境変数**

`GITHUB_TOKEN`（GitHub API の個人アクセストークン）は**任意**です。未設定でも動作します。設定するとレート制限が緩和されます。使うときは `.env.example` を参考に、`.env.local` に設定してください（`.env.local` は Git の管理外です）。このアプリには利用者の認証が無く、トークンの権限は閲覧者に貸し出されるため、権限は公開リポジトリの読み取りだけにしてください。

## 構成と判断

### 画面構成とルーティング

| パス                    | 内容                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | 検索フォームと、検索結果の一覧・ページネーション。クエリ `q`（キーワード）と `page`（ページ番号）で状態を表します。1 ページ 30 件です。                                            |
| `/repos/[owner]/[repo]` | リポジトリの詳細。一覧から遷移するときに `q` と `page` をクエリで引き継ぎ、「トップへ戻る」で同じ検索結果に戻します。存在しないリポジトリは、このパス専用の 404 の画面になります。 |

どちらの画面も、読み込み中（`role="status"`）、GitHub API のエラー（`role="alert"`。レート制限・通信失敗など種別ごとの文言と再試行ボタン）、0 件、範囲外のページの案内を、状態として表示します。API のエラーを握りつぶさず、利用者に見える形で扱う方針です（[仕様 0010](docs/specs/0010-state-views.md)）。

### ディレクトリ構成

`src/` は使わず、ルート直下に置いています（[仕様 0002](docs/specs/0002-setup-foundation.md)）。

- `app/`: ルーティング。ページは薄く保ち、組み立てだけを行います。
- `features/`: 機能単位のコード（検索、詳細表示、状態表示）。UI・ロジック・テストを同じ場所に置きます。
- `lib/`: 横断のコード。`lib/github/` が GitHub API の呼び出し層で、GitHub API を呼ぶのはここだけです。`lib/search/` はキーワード・ページ・URL を扱う純粋な関数です。
- `components/`: 再利用 UI の置き場（shadcn/ui の部品用）として `CLAUDE.md` の構成に予約されていますが、現在は未作成です。
- `tests/`: 構成検査、アクセシビリティ、ハーネス、README の検査など、機能の外側のテスト。
- `e2e/`: Playwright のシナリオと、偽の GitHub API。
- `docs/`: 仕様（`docs/specs/`）、計画（`docs/plans/`）、意思決定の記録（`docs/adr/`）、設計（`docs/architecture.md`）。
- `.claude/`、`scripts/`: AI を使った開発の仕組み（ルール・サブエージェント・コマンド）と、品質ゲートの実行スクリプト（`scripts/verify.sh`）。

### 工夫した点と理由

- **Watcher 数は `subscribers_count` から取る。** 検索 API と個別 API の `watchers_count` は Star 数と同じ値で、Watcher 数ではありません。本当の Watcher 数は個別 API の `subscribers_count` にあるため、詳細ページでだけ個別 API を呼び、一覧では Watcher 数を使いません（[仕様 0001](docs/specs/0001-github-repo-search.md) の 7 節、[仕様 0003](docs/specs/0003-github-api-client.md)）。テストでは Star 数と Watcher 数に違う値を入れて、取り違えを検出できるようにしています。
- **GitHub API の呼び出しはサーバー側だけで行う。** トークンをブラウザに出さないためです。呼び出し層（`lib/github/`）の先頭に `import "server-only"` を置き、クライアントのコードから読み込むとビルドで失敗します。接続先も `api.github.com` に固定し、別のホストへ向けられないようにしています（[仕様 0003](docs/specs/0003-github-api-client.md)）。例外は E2E テスト専用で、ループバックのアドレスに限り、そのときはトークンを送りません（[ADR 0006](docs/adr/0006-playwright-e2e.md)）。
- **検索条件は URL で持つ。** キーワードとページ番号を `?q=…&page=…` に入れ、サーバー側に状態を保存しません。再読み込み、URL の共有、ブラウザの戻る・進むで同じ画面を復元できます。詳細ページからの「トップへ戻る」も、URL のクエリを検証・正規化して作り直すので、受け取った文字列をそのままリンクにしません（[仕様 0009](docs/specs/0009-back-navigation.md)）。
- **1,000 件の上限を前提に作る。** GitHub の検索 API は、先頭から 1,000 件より先を返しません。一覧には「上位1,000件まで表示します」と出し、最大ページ数（1 ページ 30 件で 34 ページ）を超えるページは、GitHub API を呼ばずに範囲外の案内を出します。呼ぶだけでレート制限を消費し、エラーになるためです（[仕様 0007](docs/specs/0007-pagination.md)）。
- **取得結果はキャッシュする。** `fetch` の `next.revalidate` で、検索は 300 秒、詳細は 600 秒キャッシュします。再読み込みや一覧と詳細の往復で、同じ取得を繰り返してレート制限（認証なしの検索 API は 1 分 10 回）を使い切らないためです。検索は結果が変わりやすいので短く、詳細は変わりにくいので長くしています。保存されるのは公開リポジトリの情報だけです（[ADR 0005](docs/adr/0005-github-fetch-revalidate.md)）。

## 範囲と制約

### プロダクション想定の範囲

### 対応しなかった事項

### 既知の制約

## AI利用レポート

### 使ったツール

### 進め方

### 人間が判断・修正した点

### AIの出力で注意した点
