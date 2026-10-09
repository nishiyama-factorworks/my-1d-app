# セットアップ

## 前提

- Node.js: CI は 22 を使っています（`.github/workflows/ci.yml`）。手元の動作確認は v24.21.0 です。リポジトリでは `engines` による固定をしていません。
- パッケージマネージャ: pnpm（`package.json` の `packageManager` は `pnpm@12.9.1`）。`npm` / `yarn` は使いません。

## 手順

```bash
pnpm install
pnpm dev
```

`pnpm dev` で開発サーバーが起動します（既定は http://localhost:3000）。本番ビルドで動かすときは次のとおりです。

```bash
pnpm build
pnpm start
```

## テスト

```bash
pnpm test                  # 単体・結合テスト（Vitest）
bash scripts/verify.sh     # 型チェック・Lint・テスト・ビルドをまとめて実行（CI も同じスクリプトを使います）
```

E2E テスト（Playwright）は任意で、先にブラウザの取得が必要です。実際の GitHub API には接続せず、偽の API（`e2e/mock-api/server.ts`）に差し替えて実行します（[仕様 0013](specs/0013-e2e-optional.md)、[ADR 0006](adr/0006-playwright-e2e.md)）。

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## 環境変数

`GITHUB_TOKEN`（GitHub API の個人アクセストークン）は**任意**です。未設定でも動作します。設定するとレート制限が緩和されます。使うときは `.env.example` を参考に、`.env.local` に設定してください（`.env.local` は Git の管理外です）。このアプリには利用者の認証が無く、トークンの権限は閲覧者に貸し出されるため、権限は公開リポジトリの読み取りだけにしてください（classic トークンなら scope を一切付けず、fine-grained トークンなら Public Repositories (read-only) に限り、非公開リポジトリへの権限は与えないでください）。
