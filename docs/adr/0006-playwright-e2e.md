# 0006: E2E テストに Playwright を導入し、偽の GitHub API は接続先の上書きとモックサーバーで用意する

- Status: Proposed
- 日付: 2026-10-09
- 決定者: 人間（プロジェクト担当者）。Issue #13 の `/feature` 中に、方式（接続先の環境変数による上書き + Node 標準のモックサーバー）、Playwright の追加、CI（既存の `RUN_E2E` 変数での任意実行のまま）を決定。ADR の承認は PR のレビューで行う

## 背景

- 検索から詳細、戻りまでの流れは、単体・コンポーネントテストでは画面遷移と URL の結合部分を検証しきれない（仕様 0013 の 1 節）。
- GitHub API はサーバー側（Server Component）から呼ぶため、ブラウザ側のリクエストの差し替えでは偽物に切り替えられない（仕様 0013 の 6.2）。
- 実際の GitHub API は、不安定でレート制限があるため、E2E では使わない（仕様 0013 の 2 節・4.2）。
- `package.json` の `test:e2e`（`playwright test`）、CI の `e2e` ジョブ（リポジトリ変数 `RUN_E2E` が `true` のときだけ実行）、`docs/harness/MANUAL.md` は、すでに Playwright を前提にしている。

## 検討した選択肢

### 案A: Playwright（`@playwright/test`）（採用）

- メリット: 既存の `test:e2e` と CI の `e2e` ジョブをそのまま使える。`webServer` で複数のサーバー（アプリとモック）を起動・停止できる。Next.js の公式ドキュメントにも手順がある（`node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`）。
- デメリット: 開発依存が増える。ブラウザ（chromium）の取得が別途必要で、ローカルでは約 300 MiB 超のダウンロードになる（今回の取得: chromium 195.6 MiB、headless shell 114.6 MiB ほか）。

### 案B: Cypress

- メリット: E2E の代表的なツールである。
- デメリット: 既存の `test:e2e`・CI・MANUAL が Playwright 前提で、変更箇所が増える。ライセンスとメンテ状況は本 ADR では調査していない（未確認）。

### 案C: Vitest の browser mode や Testing Library のみ

- メリット: 追加の依存が少ない、またはない。
- デメリット: Next.js のサーバーを通した画面遷移と URL の復元を検証できない。今回の目的（結合部分の確認）を満たさない。

### 案D: 手動確認のみ

- メリット: 実装が要らない。
- デメリット: 変更のたびの回帰を自動で見つけられない。

### 偽の API の方式

#### 方式1: 環境変数 `GITHUB_API_BASE_URL` で接続先を上書き + `node:http` のモックサーバー（採用）

- メリット: 追加の依存が Playwright のみ。ブラウザ側もサーバー側も同じモックにつながる。
- デメリット: 本番コード（`lib/github/http.ts`）に、テストのための上書きの分岐が入る。

#### 方式2: MSW などのモックライブラリ

- メリット: 本番コードの変更が少ない。
- デメリット: Next.js のサーバー側の `fetch` への組み込みが複雑で、依存が増える。

#### 方式3: 実際の GitHub API

- メリット: 偽物を作らなくてよい。
- デメリット: 不安定でレート制限がある。毎回同じ結果にならない。

## 決定

E2E は Playwright で行う。偽の GitHub API は、`GITHUB_API_BASE_URL` による接続先の上書きと、`e2e/` 配下の `node:http` のモックサーバーで用意する。CI は既存の `e2e` ジョブ（`RUN_E2E` 変数での任意実行）のまま、`.github/workflows/` は変更しない。

## 理由

- 既存の `test:e2e`・CI・MANUAL が Playwright を前提にしており、追加の変更が最も少ない。
- `@playwright/test` 1.63.0 を導入した。開発元は Microsoft Corporation。ライセンスは Apache-2.0（`node_modules/@playwright/test/LICENSE` と `package.json` の `license` で確認した）。リリースの頻度は未確認。
- サーバー側から呼ぶ API は、接続先を変えるしか偽物に切り替える手段がない（案を比べた結果、依存が増えず、本番コードの変更が `http.ts` の 1 か所で済む方式1を選んだ）。

### 接続先の上書きの安全策

接続先は仕様 0003 の AC-23e で「`api.github.com` 以外のオリジンへ向けられない（トークンを外部ホストに送らない）」ことを保証している。上書きでこれを弱めないため、次の制限を付ける（仕様 0013 の AC-31c〜AC-31f、仕様 0003 の AC-23f〜AC-23i）。

- 値は `http://127.0.0.1:<ポート>` または `http://localhost:<ポート>` の形（ループバックのオリジンのみ）。パス・クエリ・認証情報を含む値や、ループバック以外は `VALIDATION` で失敗する。上書きを黙って無視して `api.github.com` に送ることはしない。
- 上書き中は `Authorization` ヘッダを付けない（`GITHUB_TOKEN` が設定されていても偽の API に送らない）。
- 未設定または空文字なら `https://api.github.com`。
- `.env.example` には書かない。本番の環境に設定しない（E2E 専用）。

## 影響・トレードオフ

- 良くなること: 検索 → 2 ページ目 → 詳細 → 戻るの流れと 0 件の表示を、実際のブラウザで毎回同じ結果で確認できる。外部サービスに依存しない。
- 悪くなること / 受け入れるリスク:
  - 開発依存が増える（`@playwright/test`）。ブラウザの取得は手作業になる。
  - 本番に `GITHUB_API_BASE_URL` を誤って設定すると、全リクエストが `VALIDATION`（値が不正）または `NETWORK`（ループバックにつながらない）になる。トークンの漏えいではなく、停止の側に倒れる。
  - E2E は `bash scripts/verify.sh` に含めない（任意実行）ため、回帰の検出は実行したときだけになる。
- 追従が必要な更新: `docs/architecture.md`（「宛先は `api.github.com` に固定」の例外と、E2E の構成。計画 0013 の T5）、仕様 0003（AC-23f〜AC-23i。追記済み）。
