# 0013: E2Eテスト（任意） 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #13
- 対応する仕様: docs/specs/0013-e2e-optional.md（あわせて docs/specs/0003-github-api-client.md の AC-23f〜AC-23i）
- ブランチ: feat/13-e2e-optional
- 作成日: 2026-10-09

## 1. 方針

### 1.1 全体像

- `lib/github/http.ts` に、環境変数 `GITHUB_API_BASE_URL` による接続先の上書きを入れる（AC-31c〜AC-31f / 0003 AC-23f〜AC-23i）。Vitest で検証する。
- `e2e/` 配下に、Node 標準（`node:http`）のモックサーバー（固定データ）と Playwright のシナリオ 2 本（AC-31a・AC-31b）を置く。モックサーバーとアプリは `playwright.config.ts` の `webServer`（配列）で起動し、アプリの起動時の環境変数で接続先をモックに向ける。
- `vitest.config.mts` の `exclude` に `e2e/` を加え、`pnpm test` が Playwright のシナリオを拾わないようにする（AC-31g）。
- `@playwright/test` の追加とブラウザ（chromium）の取得は**人間が行う**（T0。ロックファイルが保護対象のため）。依存追加の理由は ADR 0006 に残す（T1）。
- 変更しないもの: `.github/workflows/`、`.claude/`（`harness.env` を含む）、`scripts/verify.sh`、`package.json` の `scripts`（`test:e2e` は既に `playwright test`。`tests/foundation/package-scripts.test.ts` の AC-3 が固定している）、`.env.example`（`GITHUB_API_BASE_URL` は書かない。仕様 8 節。`tests/foundation/env-files.test.ts` の AC-32a も `GITHUB_TOKEN` 以外のキーを拒否する）。

### 1.2 接続先の上書きの実装の形（想定）

`http.ts` の現状（2026-10-09 に確認）: `BASE_URL = "https://api.github.com"` 固定、`new URL(path, BASE_URL)` の後に `url.origin !== BASE_URL` なら `VALIDATION`（AC-23e）、`buildHeaders()` が `GITHUB_TOKEN` を呼び出しごとに読んで `Authorization` を付ける。

- 呼び出しごとに `process.env.GITHUB_API_BASE_URL` を読む（`GITHUB_TOKEN` と同じ方針。モジュール読み込み時に固定しない。テストの `vi.stubEnv` が効く形）。
- 接続先の決定（純粋な関数に切り出す。名前は実装時に決める。例: `resolveBaseOrigin(raw: string | undefined)`）:
  - `undefined` または `""` → `https://api.github.com`（上書きなし）。
  - それ以外 → `new URL(raw)` を試み、次のすべてを満たすときだけ、そのオリジンを使う。満たさなければ `GitHubApiError("VALIDATION")` を投げる（`fetch` は呼ばない。上書きを黙って無視して `api.github.com` に送らない）。
    - `protocol === "http:"`（仕様 6.2 の「`http://127.0.0.1:<ポート>` または `http://localhost:<ポート>` の形」。`https:` のループバックは Q8）
    - `hostname` が `127.0.0.1` または `localhost` の完全一致（`URL` が小文字化する。`[::1]`・`127.0.0.2`・`localhost.example.com` などは拒否。Q8）
    - `port !== ""`（ポートの明示が必要。Q8）
    - `username === ""`・`password === ""`（認証情報を含まない）
    - `pathname === "/"`・`search === ""`・`hash === ""`（パス・クエリ・フラグメントを含まない。末尾の `/` だけは `URL` の正規化で `"/"` になるため許す）
  - `new URL` の例外は値を含みうるため、`cause` を残さず `VALIDATION` に統一する（`mappers.ts` の `parseHttpsUrl` と同じ扱い。エラーのメッセージは種別ごとの固定文言のまま）。
- 既存のオリジン検査（AC-23e）は、決定したオリジンに対して同じ形で行う（`new URL(path, base)` → `url.origin !== base` なら `VALIDATION`）。検査を弱めたり、上書き中だけ省いたりしない。
- ヘッダ: 上書き中は `Authorization` を付けない（`buildHeaders` に「トークンを付けてよいか」を渡す。`Accept`・`X-GitHub-Api-Version` は従来どおり付ける）。トークンの値を読む位置は `buildHeaders` の中のまま。
- `next.revalidate`（ADR 0005）・タイムアウト・エラー分類は変えない。

### 1.3 モックサーバーとデータの契約（E2E の期待値と一致させる）

- ファイル: `e2e/mock-api/server.ts`（1 ファイル。Q4）。`127.0.0.1` だけで待ち受ける（`0.0.0.0` にしない）。ポートは 4010（Q2）。
- 応答するのは仕様 6.2 の 2 つだけ（GET のみ）。それ以外は 404（JSON の `{"message":"Not Found"}`）。
  - `GET /search/repositories?q=…&page=…&per_page=…`
    - `q === "react"` → `total_count: 45`、`incomplete_results: false`、`items` は `page`・`per_page` で切り出した要素（1 ページ目 30 件、2 ページ目 15 件）。45 件は「31 以上で 2 ページ以上」（AC-31a）かつ 1,000 件以下（「上位1,000件まで表示します」を出さない）。
    - それ以外の `q` → `total_count: 0`、`items: []`（AC-31b）。
  - `GET /repos/{owner}/{repo}` → 一覧に含まれるリポジトリなら詳細、それ以外は 404。
- 固定データ（コード中の決定的な生成。乱数・時刻を使わない）:
  - 要素 n（1〜45、2 桁ゼロ埋め）: `full_name` = `e2e-owner-NN/react-sample-NN`、`owner.login` = `e2e-owner-NN`、`owner.avatar_url` = `https://avatars.githubusercontent.com/u/NN?v=4`（`mappers.ts` の AC-5g の検証と `next.config.ts` の `remotePatterns`（`/u/**`・`?v=4`）を両方満たす）、`private: false`、`visibility: "public"`。
  - 詳細（全要素共通の形で、項目ごとに**異なる値**にする。Star 数と Watcher 数の取り違えを検出できるように）: `language: "TypeScript"`、`stargazers_count: 12345`（表示 `12,345`）、`subscribers_count: 678`、`watchers_count: 99999`（使われないことの確認用。表示されたら誤り）、`forks_count: 910`、`open_issues_count: 11`、`html_url: https://github.com/<full_name>`。
- E2E のシナリオは、この契約の値を**リテラルで**持つ（モックのコードを import しない。T3 の時点ではモックが無く、import すると RED が import エラーになるため。また、期待値をモックから読むとモックの誤りを検出できない）。

### 1.4 Playwright の設定（想定。値は Q1〜Q3・Q6 の推奨どおりの場合）

- `testDir: "e2e"`、ブラウザは chromium のみ（CI の `playwright install --with-deps chromium` と一致）。`forbidOnly: !!process.env.CI`、`retries: 0`（再試行で不安定さを隠さない）。`use.baseURL: "http://127.0.0.1:3100"`、`trace: "retain-on-failure"`。
- `webServer`（配列）:
  1. モック API: `node --experimental-strip-types e2e/mock-api/server.ts`、待ち合わせ URL は `http://127.0.0.1:4010/search/repositories?q=react`（専用のヘルスチェックの経路を増やさない。仕様 6.2「2つだけ」）。
  2. アプリ: fetch キャッシュの削除（Q3）→ `pnpm build` → `pnpm start`（ポート 3100）。`env` に `GITHUB_API_BASE_URL=http://127.0.0.1:4010` と `GITHUB_TOKEN=""`（多層防御。Q11）。`timeout` はビルドを含むため 180 秒程度。
  - どちらも `reuseExistingServer: false`（開発中の `pnpm dev`（上書きなし）を誤って再利用すると、実際の GitHub API を呼んでしまうため。ポートが使用中なら起動時に失敗させる）。
- オーナーアイコン: `next/image` は `/_next/image` 経由でアプリのサーバーが `avatars.githubusercontent.com` から取得する。外部への接続を避けるため、各シナリオでブラウザの `**/_next/image**` へのリクエストを `page.route` で止める（Q6）。表示の検証は文字だけで行う。

### 1.5 RED の考え方（E2E）

- E2E の RED は「**上書きの実装（T2）はあるが、モックサーバー（T4）が無い**」状態で取る（T3）。アプリは `127.0.0.1:4010` に接続できず `NETWORK` のエラー表示になり、一覧・詳細・0 件の案内が出ないため、シナリオが期待値の不一致（要素が見つからずタイムアウト）で失敗する。
- 「上書きの実装が無い」状態で E2E を流すことはしない。`GITHUB_API_BASE_URL` が無視され、**実際の GitHub API に接続してしまう**ため（仕様 2 節・4.2 に反する）。上書きの実装が無いことによる失敗は、T2 の Vitest の RED で確認する（Q10）。
- 前提: T0 で人間が `@playwright/test` とブラウザを入れていること。ブラウザが無い環境では、Playwright は「実行ファイルが無い（`playwright install` を実行せよ）」で失敗する。これは**環境の不備であって RED ではない**。その場合は E2E を「未実行（ブラウザ未取得）」として進捗メモに記録し、人間に `! pnpm exec playwright install chromium` を依頼する（Claude は代わりに実行しない）。Vitest 側（T2・T3 の AC-31c〜AC-31g）はブラウザ無しで進められる。
- webServer の起動失敗（ポート使用中、ビルド失敗、モックの起動失敗）も RED と認めない。失敗の出力で「アプリが起動し、エラー表示が出たうえで期待値が不一致」であることを確かめる（トレースやスクリーンショット、エラー文中の要素の待ち合わせ）。

### 1.6 品質ゲートとの関係

- `bash scripts/verify.sh`（`--quick` / `--full`）は E2E を含まない（`verify.sh` の `steps` は `--e2e` のときだけ `E2E_CMD` を足す）。E2E は任意実行のまま（仕様 4.1・8 節、`docs/quality-gates.md` G6）。
- E2E の実行確認は、`pnpm test:e2e`（または `bash scripts/verify.sh --e2e`）を**別途実行**し、結果（PASS/FAIL、件数、所要時間）を進捗メモと PR 本文に記録する。実行していないものを「通った」と書かない。
- Stop ゲート（typecheck・lint・test）は `e2e/` と `playwright.config.ts` も型チェック・Lint の対象になる（`tsconfig.json` の `include` は `**/*.ts`、`eslint .`）。そのため T0 で `@playwright/test` が入るまで、`e2e/` 配下と `playwright.config.ts` は作らない。

### 1.7 既存の設定ファイルが `e2e/` を扱えるか（2026-10-09 に確認）

| 設定 | 現状 | 対応 |
| --- | --- | --- |
| `tsconfig.json` | `include` に `**/*.ts`・`**/*.mts`、`exclude` は `node_modules` だけ | 変更不要。`e2e/**/*.ts` と `playwright.config.ts` は型チェックされる（`@playwright/test` の型は T0 後に解決）。`.ts` 同士の import に拡張子を付けると `allowImportingTsExtensions` が要るため、モックは 1 ファイルにする（Q4） |
| `eslint.config.mjs` | `eslint-config-next`（core-web-vitals・typescript）、無視は `.next/` `out/` `build/` `next-env.d.ts` だけ。flat config は `.gitignore` を読まない | **変更する**: `test-results/**`・`playwright-report/**` を `globalIgnores` に足す（レポートに JS が出力され、`eslint .` が拾うため）。Playwright の独自フィクスチャ（`use` 引数）は `react-hooks/rules-of-hooks` に誤検出されうるので作らない |
| Prettier | `.prettierignore` は `docs/` など。Prettier 3 は既定で `.gitignore` も読む | `.prettierignore` は変更不要（`.gitignore` に足す 2 つは自動で除外される） |
| `.gitignore` | `/coverage` `/.next/` など | **変更する**: `/test-results/`・`/playwright-report/` を足す |
| `vitest.config.mts` | `test.include`・`exclude` の指定なし（Vitest 既定の `**/*.{test,spec}.?(c|m)[jt]s?(x)` で `e2e/*.spec.ts` も拾う） | **変更する**: `exclude: [...configDefaults.exclude, "e2e/**"]`（AC-31g） |
| `harness.env` | `TEST_REGEX` は `^(tests|e2e)/` を含む。`SRC_REGEX` は `lib/` を含む | 変更不要（`e2e/` はテストとして扱われる。`http.ts` の変更には `http.test.ts` の変更が伴う） |
| CI（`ci.yml`） | `e2e` ジョブは `RUN_E2E == 'true'` のとき `pnpm install` → `playwright install --with-deps chromium` → `pnpm test:e2e` | 変更しない。ビルドは webServer のコマンドに含めるので、ジョブ側にビルドの手順は要らない |
| `AGENTS.md` | `next dev` が自動で書き戻すブロックがある | 変更しない。E2E は `next start` で起動する想定（Q1）だが、E2E や `pnpm dev` を実行した後は毎回 `git status` で `AGENTS.md`・`next-env.d.ts` などに意図しない差分が無いか確認する（差分が出たらコミットせず人間に報告） |

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 変更（人間） | `package.json`・`pnpm-lock.yaml` | `@playwright/test` を devDependencies に追加（T0。人間が `pnpm add -D` で実行） |
| 新規 | `docs/adr/0006-playwright-e2e.md` | Playwright の導入と、E2E のための接続先の上書き（Q9）（T1） |
| 変更 | `.gitignore` | `/test-results/`・`/playwright-report/`（T1） |
| 変更 | `eslint.config.mjs` | `globalIgnores` に `test-results/**`・`playwright-report/**`（T1） |
| 変更 | `lib/github/http.ts` | `GITHUB_API_BASE_URL` による接続先の上書き（T2） |
| 変更 | `lib/github/http.test.ts` | AC-31c〜AC-31f のテストを追加（既存テストは変更しない）（T2） |
| 変更 | `vitest.config.mts` | `exclude` に `e2e/**`（T3） |
| 新規 | `tests/foundation/vitest-excludes-e2e.test.ts` | AC-31g の構成検査（T3） |
| 新規 | `playwright.config.ts` | testDir・baseURL・webServer（T3 はアプリだけ、T4 でモックを追加） |
| 新規 | `e2e/search-to-detail.spec.ts` | AC-31a（T3） |
| 新規 | `e2e/search-empty.spec.ts` | AC-31b（T3） |
| 新規 | `e2e/mock-api/server.ts` | `node:http` のモックサーバーと固定データ（T4） |
| 変更 | `docs/architecture.md` | テストの表に Playwright、`lib/github/` の宛先の記述（「`api.github.com` に固定」→ ループバックへの上書きの例外）、環境変数の節に `GITHUB_API_BASE_URL`（E2E 専用・`.env.example` に書かない）、`e2e/` の置き場所（T5） |
| 変更 | `docs/specs/0013-e2e-optional.md` | 9 節の未決事項（ポート・起動方法・キャッシュ）を決定済みにし、変更履歴に追記（T5） |
| 変更 | `docs/plans/0013-e2e-optional.md` | 進捗メモ（各タスク） |
| 変更なし | `.github/workflows/`、`.claude/`、`scripts/verify.sh`、`package.json` の `scripts`、`.env.example`、`tsconfig.json`、`.prettierignore`、`next.config.ts`、`AGENTS.md`、アプリの画面のコード | 1.1・1.7 |

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `verify.sh --quick` の PASS が必要（E2E は含まない）。Vitest の RED はコミットしない（テストと実装を同じコミットにする）。E2E は `test:` → `feat:` の連続コミット（`.claude/rules/50-git-and-pr.md`）にし、T3 で RED のシナリオをコミットして T4 で GREEN にする（Q10）。各タスクの変更は 5 ファイル・300 行以内に収める。

- [x] **T0: 【人間への依頼】`@playwright/test` の追加とブラウザの取得**（Claude は実行しない）
  - 対応 AC: なし（AC-31a・AC-31b の前提）
  - 人間が実行するコマンド（Claude Code のプロンプトで `!` を付けて実行）:
    1. `! pnpm add -D @playwright/test`（`package.json` と `pnpm-lock.yaml` が更新される）
    2. `! pnpm exec playwright install chromium`（ブラウザはユーザーのキャッシュに入り、リポジトリは変わらない）
  - Claude の確認（読み取りのみ）: `pnpm exec playwright --version` が表示されること、`package.json` の devDependencies に `@playwright/test` が 1 行増えただけであること（`git diff package.json`）、`pnpm typecheck`・`pnpm lint`・`pnpm test` が従来どおり PASS すること。導入されたバージョンを T1 の ADR に転記する。
  - 完了条件: 上の確認がすべて取れる。ブラウザの取得ができない環境なら、その旨を進捗メモに書き、T1・T2・T3 の Vitest 部分まで進める（1.5）。

- [x] **T1: ADR 0006 と、Playwright の出力の除外**（`chore`。依存追加のコミットを兼ねる）
  - 対応 AC: なし（仕様 4.1「依存の追加の理由を ADR 0006 に残す」）
  - 先に書くテスト: なし（文書と設定のみ。`.gitignore` の確認は下の完了条件の `git check-ignore` で行う）
  - 実装対象（5 ファイル）: `docs/adr/0006-playwright-e2e.md`（新規。`docs/adr/0000-template.md` に沿う）、`.gitignore`、`eslint.config.mjs`、`package.json`・`pnpm-lock.yaml`（T0 で人間が更新した内容をコミットに含めるだけ。Claude は編集しない。Q12）
  - ADR 0006 に書くこと:
    - 背景: 単体・結合では画面遷移と URL の結合部分を検証しきれない（仕様 1 節）。GitHub API はサーバー側で呼ぶため、ブラウザ側の差し替えでは偽物に切り替えられない（仕様 6.2）。
    - 選択肢: 案A Playwright（`@playwright/test`）／案B Cypress／案C Vitest の browser mode や Testing Library のみ（Next.js のサーバーを通した遷移を検証できない）／案D 手動確認のみ。各案のメリット・デメリット。
    - 決定と理由: 案A。`package.json` の `test:e2e` と CI の `e2e` ジョブ、`docs/harness/MANUAL.md` が既に Playwright を前提にしている。Next.js 公式ドキュメント（`node_modules/next/dist/docs` のテストのガイド）も扱う。`webServer` で複数のサーバーを起動・停止できる。
    - メンテ状況・ライセンス: 導入したバージョン（T0 で確認）、開発元（Microsoft）、ライセンス（Apache-2.0 の想定。`node_modules/@playwright/test/LICENSE` で確認し、確認できなければ「未確認」と書く）、リリースの頻度。確認していない数値は書かない。
    - 偽の API の方式（Q9 の推奨どおりならこの ADR に含める）: 環境変数 `GITHUB_API_BASE_URL` + `node:http` のモックサーバー。代替案（MSW などのサーバー側の差し替え＝依存が増える／`fetch` の差し替えをアプリに入れる＝本番コードにテスト用の分岐が増える／実 API＝不安定でレート制限）。安全策（ループバック限定・パス等の拒否・上書き中はトークンを送らない・`.env.example` に書かない）と、受け入れるリスク（本番に誤って設定すると全リクエストが `VALIDATION` または `NETWORK` になる＝漏えいではなく停止の側に倒れる）。
    - 影響: `pnpm build` と CI の `e2e` ジョブの時間、ブラウザの取得が人間の手作業であること、`docs/architecture.md` の追従（T5）。
  - `.gitignore`: `# testing` の節に `/test-results/`・`/playwright-report/` を足す。
  - `eslint.config.mjs`: `globalIgnores` に `"test-results/**"`・`"playwright-report/**"` を足す（既存の 4 つは消さない）。
  - 完了条件: `git check-ignore -q test-results/x playwright-report/index.html` が 0 を返す。`bash scripts/verify.sh --quick` PASS。ADR の `Status: Proposed`（承認は PR のレビューで行う。ADR 0005 と同じ運用）。

- [ ] **T2: 接続先の上書き（`GITHUB_API_BASE_URL`）**（`feat(github)`）
  - 対応 AC: AC-31c、AC-31d、AC-31e、AC-31f（= 0003 の AC-23f、AC-23g、AC-23h、AC-23i）
  - 先に書くテスト: `lib/github/http.test.ts` に `describe("githubGet: 接続先の上書き（GITHUB_API_BASE_URL）")` を追加する。既存の `stubFetch`・`calledUrl`・`calledHeaders`・`catchError` と `afterEach` の `vi.unstubAllEnvs()` を使う。テスト名には `AC-31x（AC-23y）` の形で両方の番号を書く（Q13）。
    - `it.each(["http://127.0.0.1:4010", "http://localhost:4010"])`: `AC-31c（AC-23f）: %s のとき、そのオリジンに従来どおりのパスとクエリで fetch する`（`githubGet("search", "/search/repositories", { q: "react", page: "2" })` → `origin` が上書きの値、`pathname` が `/search/repositories`、`q`・`page` がそのまま）。末尾に `/` を付けた `http://127.0.0.1:4010/` も成功する行を足す（URL の正規化で `/` になるため。Q8）。
    - `it.each`（`{ label, value }`）: `AC-31d（AC-23g）: $label のとき fetch を呼ばずに VALIDATION で失敗する`
      - 仕様の例: `https://example.com`、`http://192.168.0.1:4010`、`abc`（URL として不正）、`http://127.0.0.1:4010/x`（パス）
      - 仕様 6.2 の「パス・クエリ・認証情報を含まない」「`http://…:<ポート>` の形」から追加する行（Q8）: `http://127.0.0.1:4010?x=1`（クエリ）、`http://user:pass@127.0.0.1:4010`（認証情報）、`http://127.0.0.1:4010#x`（フラグメント）、`https://127.0.0.1:4010`（http 以外）、`http://127.0.0.1`（ポートなし）、`http://localhost.example.com:4010`（似たホスト）、`http://[::1]:4010`（仕様に無いループバック表記）
      - 各行で `GITHUB_TOKEN` も設定しておき、`fetch` が一度も呼ばれないこと、エラーの `kind` が `VALIDATION` であること、エラーの `message` に上書きの値が含まれないことを確かめる。
    - `AC-31d（AC-23e の維持）: 上書き中に //evil.example/x や https://api.github.com/x を path に渡すと fetch を呼ばず VALIDATION で失敗する`（オリジン検査が上書き後のオリジンに対して働くこと。仕様 6.2 最後の項目）
    - `AC-31e（AC-23h）: 上書き中は GITHUB_TOKEN があっても Authorization を付けない`（`Accept`・`X-GitHub-Api-Version` は付く）
    - `it.each([undefined, ""])`: `AC-31f（AC-23i）: GITHUB_API_BASE_URL が %s のとき https://api.github.com を使い、GITHUB_TOKEN があれば Authorization を付ける`
    - 既存の AC-23a〜AC-23e・AC-24・AC-29 のテストは**変更しない**（AC-31f の後段。`git diff` で既存行の変更が 0 件であることを確認）。
  - RED（実装前に実行し、失敗が未実装による期待値の不一致であることを確認する）:
    - 失敗するもの: AC-31c（`api.github.com` に送られる）、AC-31d の全行（上書きが無視され `fetch` が呼ばれて成功する）、AC-31d の AC-23e 維持の `https://api.github.com/x` の行（現状は同一オリジンなので通る）、AC-31e（`Authorization` が付く）。
    - 最初から緑のもの: AC-31f（現状の振る舞いの固定）と既存テスト。下の変異 6 で検出力を確かめる。
  - 実装対象（2 ファイル）: `lib/github/http.ts`、`lib/github/http.test.ts`
  - GREEN: 1.2 の形で実装する。
  - 検出力の確認（GREEN 後に一時的に変異を入れ、失敗を確かめてから戻す。本番コードに差分を残さない）:
    1. ホスト名の許可を外す（任意のホストを許す）→ AC-31d の `example.com`・`192.168.0.1`・似たホストの行が失敗する。
    2. パスの検査を外す → `/x` の行が失敗する。クエリ・フラグメント・認証情報・ポート・プロトコルの検査をそれぞれ外す → 対応する行が失敗する。
    3. `new URL` の例外を握りつぶして `api.github.com` に戻す → `abc` の行が失敗する（`fetch` が呼ばれる）。
    4. 上書き中も `Authorization` を付ける → AC-31e が失敗する。
    5. オリジン検査を、上書き後のオリジンではなく固定の `https://api.github.com` と比べる → AC-31c が失敗する。オリジン検査を上書き中だけ省く → AC-23e 維持の行が失敗する。
    6. 空文字を「上書きあり」として扱う（`new URL("")` が失敗して `VALIDATION`）→ AC-31f の `""` の行が失敗する。
    7. 環境変数をモジュールの読み込み時に 1 回だけ読む → `vi.stubEnv` を使う AC-31c・AC-31e が失敗する（呼び出しごとに読むことの固定）。
  - 完了条件: 追加・既存のテストがすべて通る。既存テストの期待値の変更 0 件。`bash scripts/verify.sh --quick` PASS。`token-leak.test.ts`（AC-23d）も無変更で通る。

- [ ] **T3: Playwright の設定・シナリオ 2 本（RED）と、Vitest からの除外**（`test(e2e)`）
  - 対応 AC: AC-31a・AC-31b（RED まで）、AC-31g（GREEN まで）
  - 先に書くテスト:
    - `e2e/search-to-detail.spec.ts`（AC-31a）: `test("AC-31a: react で検索し、2 ページ目から詳細へ進み、トップへ戻ると 2 ページ目の一覧が復元される")`
      1. `/` を開き、ラベル「キーワード」の入力に `react` を入れ、ボタン「検索」を押す → URL が `/?q=react&page=1`、`総ヒット件数: 45 件`、リンク `e2e-owner-01/react-sample-01` が見える（1 ページ目）。
      2. `nav`「ページネーション」のリンク「2」を押す → URL が `/?q=react&page=2`、リンク `e2e-owner-31/react-sample-31` が見え、`e2e-owner-01/react-sample-01` が見えない、リンク「2」が `aria-current="page"`（2 ページ目）。
      3. リンク `e2e-owner-31/react-sample-31` を押す → URL が `/repos/e2e-owner-31/react-sample-31?q=react&page=2`、見出し（h1）`e2e-owner-31/react-sample-31`、`オーナー` `e2e-owner-31`、`言語` `TypeScript`、`Star数` `12,345`、`Watcher数` `678`、`Fork数` `910`、`Issue数` `11` が表示される（`dt` と `dd` の組で確認する。`99,999` が表示されないこと）。
      4. リンク「トップへ戻る」を押す → URL のパスとクエリが `/?q=react&page=2` と完全一致、入力欄の値が `react`、リンク `e2e-owner-31/react-sample-31` が見え、リンク「2」が `aria-current="page"`。
    - `e2e/search-empty.spec.ts`（AC-31b）: `test("AC-31b: 一致しないキーワードで検索すると 0 件の案内が出る")`。キーワードは `e2e-no-such-repository`（AC-31a の `react` と URL が重ならない。Q3）。`「e2e-no-such-repository」に一致するリポジトリは見つかりませんでした。` が表示される（`role="status"`）。
    - 両方のシナリオの `beforeEach` で `page.route("**/_next/image**", …)` によりアイコンの取得を止める（Q6）。
    - `tests/foundation/vitest-excludes-e2e.test.ts`（AC-31g。Q7）: `// @vitest-environment node`。Vitest の対象ファイルの一覧を、子プロセスで `node <vitest の bin> list --filesOnly --json` として取得する（`pnpm` の `.cmd` を避けるため `process.execPath` で起動。オプション名は実装時に `vitest list --help` で確認する）。
      - `AC-31g: e2e/ 配下に *.spec.ts が 1 件以上ある`（Given の確認。空のまま緑にならないようにする）
      - `AC-31g: Vitest の対象ファイルに e2e/ 配下のファイルが含まれない`
      - `AC-31g（対照）: Vitest の対象ファイルに lib/github/http.test.ts が含まれる`（一覧の取得自体が壊れて空になったときに誤って緑にならないようにする）
  - 実装対象（5 ファイル）: `playwright.config.ts`（新規。1.4 のうちアプリの webServer だけ。モックの webServer は T4 で足す）、`e2e/search-to-detail.spec.ts`、`e2e/search-empty.spec.ts`、`tests/foundation/vitest-excludes-e2e.test.ts`、`vitest.config.mts`
  - 手順と RED:
    1. シナリオ 2 本と AC-31g のテストを書き、`pnpm test` を実行する → AC-31g の「含まれない」が失敗する（`e2e/*.spec.ts` が一覧に出る）。あわせて Vitest が `e2e/*.spec.ts` を実行しようとして失敗することも確認する（これが AC-31g で防ぐ現象）。
    2. `vitest.config.mts` に `exclude: [...configDefaults.exclude, "e2e/**"]` を足す → AC-31g が緑、`pnpm test` 全体が緑。
    3. `pnpm test:e2e` を実行する → AC-31a・AC-31b が失敗する。失敗の理由が「アプリは起動し、モックが無いため `NETWORK` のエラー表示になり、期待した一覧・0 件の案内が見つからない」ことを出力（エラー文・スクリーンショット・トレース）で確認する。webServer の起動失敗やブラウザ未取得による失敗は RED と認めない（1.5）。実際の GitHub API に接続していないこと（アプリの環境変数で `GITHUB_API_BASE_URL` が設定されていること）を設定で確認する。
  - AC-31g の検出力の確認: `exclude` から `e2e/**` を外す → AC-31g が失敗する。`exclude` を `configDefaults.exclude` を含まない形（`["e2e/**"]` だけ）にしても `node_modules` 配下が一覧に出ないかを確認し、出るなら `configDefaults.exclude` の展開を残す理由をコメントに書く。
  - 完了条件: `bash scripts/verify.sh --quick` PASS（E2E は含まない）。`pnpm test:e2e` は**RED のまま**で、その結果（2 件失敗と理由）を進捗メモに記録する。コミットは `test(e2e): …` とし、本文に「E2E は T4 で GREEN にする」と書く。実行後に `git status` で `AGENTS.md`・`next-env.d.ts` などに差分が無いことを確認する。

- [ ] **T4: モックサーバー（GREEN）**（`feat(e2e)`）
  - 対応 AC: AC-31a、AC-31b
  - 先に書くテスト: なし（T3 のシナリオが RED のまま。シナリオは変更しない）
  - 実装対象（2 ファイル）: `e2e/mock-api/server.ts`（新規。1.3 の契約どおり）、`playwright.config.ts`（モックの webServer を配列の先頭に足す）
  - モックの実装上の注意: `127.0.0.1` で待ち受ける。受け取ったリクエストのヘッダや本文をログに出さない。`SIGTERM`/`SIGINT` で閉じる（Playwright が webServer を止めるため）。データは決定的に作る（乱数・現在時刻を使わない）。
  - GREEN: `pnpm test:e2e` で AC-31a・AC-31b が通る。続けて 2 回目を実行しても通る（キャッシュが残った状態でも結果が変わらないこと）。
  - 検出力の確認（E2E。1 つずつ入れて `pnpm test:e2e` を実行し、失敗を確かめてから戻す。webServer が毎回ビルドするので、アプリ側の変異も反映される。モック側の変異は Q3 のキャッシュ削除が効いていることが前提）:
    1. 戻り先から `page` を落とす（`lib/search/back-path.ts` の `buildBackPath` が `buildSearchPath(q, 1)` を返す）→ AC-31a の手順 4（URL・2 ページ目の一覧）が失敗する。
    2. 戻り先を常に `/` にする → AC-31a の手順 4 が失敗する。
    3. 一覧の行リンクから検索条件を落とす（`repoPathFromFullName` に `{ q, page }` を渡さない）→ AC-31a の手順 3 の URL と手順 4 が失敗する。
    4. 入力欄の初期値を使わない（`search-form.tsx` の `defaultValue` を空にする）→ AC-31a の手順 4（入力欄の値）が失敗する。
    5. 詳細の Star 数と Watcher 数を入れ替える（`repo-detail-view.tsx`）→ AC-31a の手順 3 が失敗する。
    6. 0 件の案内の文言を変える（`empty-results.tsx`）→ AC-31b が失敗する。
    7. モックが `page` を無視して常に 1 ページ目を返す → AC-31a の手順 2 が失敗する（モック側の変異。前の実行のキャッシュに 2 ページ目の正しい応答が残っていても、キャッシュ削除により検出されることの確認を兼ねる）。
    - 行わない変異: 「上書きの実装を外す」は、アプリが実際の GitHub API を呼ぶため E2E では行わない（T2 の Vitest の変異 5・7 で代える）。
    - 変異を戻した後に `git status` と `git diff` で、`lib/`・`features/`・`e2e/` に差分が残っていないこと、`AGENTS.md`・`next-env.d.ts` に差分が無いことを確認する。
  - 完了条件: `pnpm test:e2e` が 2 件 PASS（2 回連続）。`bash scripts/verify.sh --quick` PASS。変異 1〜7 の結果を進捗メモに記録する。

- [ ] **T5: 文書の追従、全体の検証とレビュー**（`docs`）
  - 対応 AC: なし（AC-31a〜AC-31g の総合確認）
  - 先に書くテスト: なし
  - 実装対象（3 ファイル）: `docs/architecture.md`（2 節の表のテストの行に Playwright（E2E・任意、ADR 0006）、3 節に `e2e/`、5 節「宛先オリジンは `api.github.com` に固定」に「`GITHUB_API_BASE_URL` によるループバックへの上書き（E2E 専用。上書き中はトークンを送らない）」を追記、6 節に `GITHUB_API_BASE_URL` は E2E 専用で `.env.example` に書かないこと）、`docs/specs/0013-e2e-optional.md`（9 節の未決事項を決定内容で埋めてチェック、変更履歴）、本計画（進捗メモ・Status）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま記録する。
    - `pnpm test:e2e`（または `bash scripts/verify.sh --e2e`）を別途実行し、結果を記録する（1.6）。
    - `git status` で `AGENTS.md`・生成物・`test-results/`・`playwright-report/` がコミット対象に出ていないことを確認する。
    - `reviewer` と `security-reviewer` で差分を点検する（トークンの送り先を変える変更のため `security-reviewer` は省かない。Q14）。
  - 完了条件: `verify.sh`（full）PASS、E2E の実行結果の記録、レビューの Critical/Major の解消、計画の `Status` の更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: モックサーバーが `Authorization` ヘッダ付きのリクエストを 400 で拒否する（AC-31e を E2E でも確かめる。現状は Vitest だけで固定）。仕様 6.2 の「固定のデータで返す」から外れるため、採るなら仕様に追記する。
- P2: `CLAUDE.md` 6 節のディレクトリ構成に `e2e/` を追記する（`.claude/rules/30-testing.md` は `e2e/` を挙げているが、`CLAUDE.md` の一覧には無い）。`CLAUDE.md` の変更は確認が必要なため別の判断にする。
- P3: E2E の追加シナリオ（エラー表示、範囲外ページ、詳細の 404 など）。仕様 4.2 の Non-goals のため、採るなら別の仕様にする。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体 | 接続先の上書き（AC-31c〜AC-31f）と既存の AC-23a〜AC-23e | `lib/github/http.test.ts` | node | `fetch`（`vi.stubGlobal`）、環境変数（`vi.stubEnv`） |
| 構成検査 | Vitest が `e2e/` を対象にしない（AC-31g） | `tests/foundation/vitest-excludes-e2e.test.ts` | node | なし（`vitest list` を子プロセスで実行） |
| E2E | 検索 → 2 ページ目 → 詳細 → 戻る（AC-31a）、0 件（AC-31b） | `e2e/search-to-detail.spec.ts`、`e2e/search-empty.spec.ts` | Playwright（chromium）+ `next build` / `next start` | GitHub API は `e2e/mock-api/server.ts`（プロセス境界の外）。オーナーアイコンの取得はブラウザ側で止める |

- E2E は主要シナリオ 2 本だけ（`.claude/rules/30-testing.md`、仕様 4.2）。シナリオは互いに独立させる（別の検索語を使い、順序に依存しない）。
- E2E は文字・ロール・ラベルで要素を探す（`getByRole`・`getByLabel`・`getByText`）。`data-testid` は使わない。
- 単体テストの名前は `AC-31x（AC-23y）` の形で、0013 と 0003 の両方の番号を書く（Q13）。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-31a | react で検索 → 2 ページ目 → 詳細 → 戻ると `/?q=react&page=2` で 2 ページ目が復元 | `e2e/search-to-detail.spec.ts` | T3（RED）・T4（GREEN） |
| AC-31b | 0 件の案内 | `e2e/search-empty.spec.ts` | T3（RED）・T4（GREEN） |
| AC-31c（0003 AC-23f） | ループバックの上書き先に従来のパス・クエリで送る | `lib/github/http.test.ts` | T2（RED あり） |
| AC-31d（0003 AC-23g） | ループバック以外・不正・パス等は `fetch` 前に `VALIDATION` | `lib/github/http.test.ts` | T2（RED あり） |
| AC-31e（0003 AC-23h） | 上書き中は `Authorization` を付けない | `lib/github/http.test.ts` | T2（RED あり） |
| AC-31f（0003 AC-23i） | 未設定・空文字は `api.github.com`、既存テストは無変更 | `lib/github/http.test.ts`（追加分＋既存） | T2（最初から緑） |
| AC-31g | `pnpm test` が `e2e/` を実行しない | `tests/foundation/vitest-excludes-e2e.test.ts` | T3（RED あり） |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 上書きの仕組みでトークンが外部に送られる | トークンの漏えい（0003 AC-23e の後退） | ループバックの完全一致・http・ポート必須・パス等の拒否（AC-31d）、上書き中は `Authorization` を付けない（AC-31e）、オリジン検査は上書き後も維持。T2 の変異 1〜5・7。`security-reviewer` を通す |
| 本番に `GITHUB_API_BASE_URL` を誤って設定する | ループバックなら `NETWORK`、それ以外は `VALIDATION` で全リクエストが失敗する（漏えいではなく停止の側に倒れる） | `.env.example` に書かない（AC-32a のテストも他のキーを拒否）。ADR 0006 と `docs/architecture.md` に E2E 専用と明記 |
| E2E が実際の GitHub API に接続する | 不安定・レート制限の消費（仕様 2 節に反する） | 上書きの実装が無い状態で E2E を流さない（1.5）。`reuseExistingServer: false` で上書きなしの開発サーバーを再利用しない。アイコンの取得はブラウザ側で止める（Q6） |
| fetch キャッシュ（ADR 0005）による結果の固定 | モックやデータを変えても古い応答が返り、変異が検出されない・データ変更後に誤って失敗する | シナリオごとに別の URL（検索語）を使う。モックのデータは決定的。アプリの起動前に `.next/cache/fetch-cache` を消す（Q3）。上書き中はキャッシュのキー（URL）がモックのオリジンになり、本物の応答のエントリとは混ざらない |
| `pnpm test` が Playwright のシナリオを実行して失敗する | Stop ゲートと CI の `verify` が落ちる | AC-31g（T3 で `exclude` を入れるまで `e2e/` を作らない順序にする） |
| `@playwright/test` が無い状態で `e2e/` や `playwright.config.ts` を作る | `pnpm typecheck`・Stop ゲートが型エラーで落ちる | T0 を先に終える（1.6） |
| Playwright の出力（`playwright-report/`・`test-results/`）を Lint・コミットしてしまう | `eslint .` の失敗、生成物のコミット | T1 で `.gitignore` と `eslint.config.mjs` の無視に追加 |
| `next dev` が `AGENTS.md` を書き戻す | 意図しない差分のコミット | E2E は `next start` で起動（Q1）。実行後は毎回 `git status` を確認し、差分が出たらコミットせず報告 |
| E2E の実行時間（毎回 `next build`） | ローカルと CI の待ち時間 | 任意実行のまま（`RUN_E2E`）。webServer の `timeout` を十分にとる。シナリオは 2 本に絞る |
| Node のバージョン差（型の除去） | モックが起動しない | Q4（ローカルの Node のバージョンを確認。CI は Node 22） |
| 既存の `http.test.ts` が、開発者の環境変数 `GITHUB_API_BASE_URL` の影響を受ける | 既存テストが環境依存で落ちる | `GITHUB_API_BASE_URL` は Playwright の webServer の `env` でだけ設定し、シェルや `.env*` に置かない運用にする（Q15） |

## 6. ADR が必要な論点

- **必要**: `@playwright/test` の導入（依存の追加。仕様 4.1 が ADR 0006 を求めている）。T1 で `docs/adr/0006-playwright-e2e.md` を作る。
- 同じ ADR に、E2E のための接続先の上書き（`GITHUB_API_BASE_URL` + `node:http` のモックサーバー、安全策）を含めるか（Q9）。トークンの送り先に関わる設計の変更で、`docs/architecture.md` の「宛先オリジンは `api.github.com` に固定」の例外になるため、記録は必要。
- E2E のアプリの起動方法（Q1）とキャッシュの扱い（Q3）は、計画と ADR 0006 の「影響」に書けば足り、別の ADR は不要と考える。

## 7. 要確認事項

- [ ] Q1: E2E のアプリの起動方法。**推奨: `pnpm build` → `pnpm start`（webServer のコマンドに含める）。** 理由: 本番に近い挙動（ADR 0005 の実機確認と同じ `next start`）、`next dev` が `AGENTS.md` を書き戻さない、開発時オーバーレイや HMR キャッシュ（`fetch.md` のトラブルシューティング）の影響を受けない、開発モードの `next/image` のローダーの例外（`docs/architecture.md` 5 節）を避けられる、CI の `e2e` ジョブにビルドの手順を足さずに済む（`ci.yml` を変えない）。欠点: 毎回ビルドするため遅い（1〜2 分程度の想定。実測は T3 で記録）。別案: `next dev`（起動は速いが、初回の各ページのコンパイルで遅くなり、上の影響を受ける）。
- [ ] Q2: ポート。**推奨: モックは `127.0.0.1:4010`（仕様の AC-31c の例と同じ）、アプリは `127.0.0.1:3100`（`pnpm dev` の 3000 と重ならない）、両方 `reuseExistingServer: false`。** ポートは `playwright.config.ts` の定数 1 か所で持ち、モックへは環境変数（例: `MOCK_API_PORT`）で渡すか、モック側にも 4010 を書くかは実装時に決める（重複が気になるなら環境変数）。別案: 空いているポートを動的に選ぶ（設定が複雑になる）。
- [ ] Q3: Next.js の fetch キャッシュ（ADR 0005: 検索 300 秒・詳細 600 秒）の扱い。**推奨: 本番コードは変えず（キャッシュ無効化の分岐を `http.ts` に入れない。AC-29 と ADR 0005 を保つ）、(a) シナリオごとに別の検索語を使い同じ URL を共有しない、(b) モックのデータを決定的にする、(c) アプリの webServer のコマンドで起動前に `.next/cache/fetch-cache` を削除する（Node の `fs.rmSync(…, { recursive: true, force: true })` を使う小さなスクリプトか 1 行の `node -e`。どちらにするかは実装時に決める）。** (c) が要る理由: 前回の実行（変異の確認中や、データを変える前）で保存された 200 の応答が残ると、次の実行でモックの変更が反映されず、T4 の変異 7 が検出できない。削除の対象には、開発中に保存された `api.github.com` の応答も含まれる（失うのはキャッシュだけで、次回の取得でレート制限を少し使う）。別案: 上書き中は `revalidate: 0` にする（本番コードにテスト用の分岐が増え、仕様に無い）／削除しない（データ変更時に手で消す運用）。なお `webServer` と `globalSetup` の起動順（webServer が先に起動する想定）は未確認のため、削除は `globalSetup` ではなくアプリの起動コマンドの先頭で行う。
- [ ] Q4: モックサーバーの書き方。**推奨: `e2e/mock-api/server.ts` の 1 ファイル（固定データの生成を含む）を `node --experimental-strip-types` で起動する。** 型チェックと Lint が効き、依存も増えない。型の除去は Node 22.6 以降が必要（CI は Node 22。ローカルの Node のバージョンを人間に確認したい）。型注釈だけを使い、`enum` など除去できない構文は使わない。ファイルを分けると `.ts` の拡張子付き import のために `tsconfig.json` の変更（`allowImportingTsExtensions`）が要るため、1 ファイルにする。別案: `e2e/mock-api/server.mjs`（Node のバージョンに依存しないが、`tsconfig.json` の `include` に `.mjs` が無く型チェックされない）。
- [ ] Q5: 固定データの中身（1.3）。**推奨: 1.3 のとおり（`react` は 45 件で 30 + 15、名前は `e2e-owner-NN/react-sample-NN`、詳細の数値は項目ごとに異なる値）。** 実在のリポジトリ名を使わないので、実際の GitHub API の応答と取り違えにくい。
- [ ] Q6: オーナーアイコン（`next/image`）の外部取得。**推奨: 各シナリオで `page.route("**/_next/image**", route => route.abort())` によりブラウザからの取得を止める。** アプリのサーバーが `avatars.githubusercontent.com` に接続しなくなり、外部サービスに依存しない（仕様 8 節「外部サービスに依存せず」）。検証は文字だけで行う。別案: 止めない（アイコンの取得は API ではなくレート制限にも関係しないが、オフラインでは画像が壊れる。テストの合否には影響しない）。
- [ ] Q7: AC-31g の検証方法と置き場所。**推奨: `tests/foundation/vitest-excludes-e2e.test.ts` で、子プロセスの `vitest list --filesOnly --json` の結果を検査する（実際の挙動を見る）。Given の確認（`e2e/` に spec がある）と対照（`lib/github/http.test.ts` が含まれる）も入れる。** 別案: `vitest.config.mts` を import して `test.exclude` に `"e2e/**"` があるかだけを見る（速いが、glob の意味までは確かめられない）。子プロセスのため数秒かかる。
- [ ] Q8: AC-31d の追加の行と境界。**推奨: 仕様 6.2 の「オリジンのみ。パス・クエリ・認証情報を含まない」「`http://127.0.0.1:<ポート>` または `http://localhost:<ポート>` の形」に従い、クエリ・認証情報・フラグメント・`https`・ポートなし・似たホスト・`[::1]` を `VALIDATION` にする行を足す。末尾の `/` だけ（`http://127.0.0.1:4010/`）は許す。** 注意: `http://localhost:80` は `URL` がポートを `""` に正規化するため「ポートなし」として拒否される（実害は無いと考える）。別案: 仕様の例 4 つだけにする（クエリや認証情報を通す誤りを検出できない）。
- [ ] Q9: ADR 0006 の範囲。**推奨: Playwright の導入と、接続先の上書き（方式・安全策）を 1 つの ADR にまとめる**（同じ文脈で決めたことで、`docs/architecture.md` の「宛先固定」の例外になるため記録が要る）。別案: 上書きを ADR 0007 に分ける。
- [ ] Q10: E2E の RED の取り方。**推奨: 1.5 のとおり、上書きの実装（T2）の後、モックサーバー（T4）の前に RED を取る。** 依頼文の「モックサーバー・上書き実装が無い状態」のうち、「上書きが無い状態」で E2E を流すと実際の GitHub API に接続してしまうため行わない（上書きが無いことの失敗は T2 の Vitest の RED で確かめる）。あわせて、RED のシナリオを T3 で `test:` コミットし、T4 の `feat:` で GREEN にする（E2E は `verify.sh --quick` に含まれないので、コミット前のゲートは通る）。別案: T3 ではコミットせず、T4 とまとめて 1 コミットにする（7 ファイルになり目安の 5 を超える）。
- [ ] Q11: アプリの webServer の `env` で `GITHUB_TOKEN` を空文字にするか。**推奨: する（多層防御）。** `.env.local` にトークンがあっても、上書き中は AC-31e で付かないが、そもそも読み込ませない。Next.js が既に存在する空文字の環境変数を `.env.local` の値で上書きしないかは未確認のため、T3 で `next start` の挙動として確認し、確認できなければ「AC-31e だけに頼る」と記録する。
- [ ] Q12: T0 の `package.json`・`pnpm-lock.yaml` の変更のコミット。**推奨: Claude が T1 のコミットに含める（Claude はファイルを編集せず、人間が更新した内容をステージするだけ）。** hook がロックファイルのステージを止めた場合は、人間にコミットを依頼する。
- [ ] Q13: テスト名の AC 番号。**推奨: `AC-31c（AC-23f）` のように 0013 と 0003 の両方を書く**（`http.test.ts` の既存のテストは 0003 の番号で書かれており、両方から追える）。別案: 0013 の番号だけ。
- [ ] Q14: レビューの範囲。**推奨: `reviewer` と `security-reviewer` の両方。** トークンの送り先（`Authorization` の付与条件）と宛先の検査を変えるため。
- [ ] Q15: 既存の `http.test.ts` に、`GITHUB_API_BASE_URL` を未設定にする `beforeEach` を足すか。**推奨: 足さない**（AC-31f の「既存テストが変更なしで通る」を文字どおり守る。`GITHUB_API_BASE_URL` は Playwright の webServer の `env` だけで設定し、シェルや `.env*` に置かない運用にする）。別案: 足す（開発者の環境変数に左右されなくなるが、既存テストのファイルに手を入れることになる）。

## 8. 進捗メモ

- 2026-10-09: 計画作成（draft）。未着手。人間の承認（特に Q1・Q3・Q4・Q10）と、T0（`@playwright/test` の追加とブラウザの取得）の実施を待つ。`/issue split` はせず 1 PR で進める想定（T0 + 5 タスク）。
- 事前調査の結果（2026-10-09）:
  - `lib/github/http.ts` は `BASE_URL` 固定、オリジン検査（AC-23e）と `Authorization` の付与は `githubGet` と `buildHeaders` にある。呼び出し元は `client.ts` の `searchRepositories`・`getRepository` だけ。
  - `vitest.config.mts` に `include`・`exclude` の指定は無い。`e2e/` はまだ無い。`playwright.config.*` も無い。
  - `scripts/verify.sh` は `--e2e` のときだけ `E2E_CMD`（`pnpm test:e2e`）を実行する。CI の `e2e` ジョブは `RUN_E2E == 'true'` のときだけ、`playwright install --with-deps chromium` → `pnpm test:e2e`。
  - `eslint.config.mjs` の無視は `.next/` `out/` `build/` `next-env.d.ts` だけ。`.gitignore` に Playwright の出力は無い。
  - 画面の文言（シナリオで使う）: 入力のラベル「キーワード」・ボタン「検索」（`search-form.tsx`）、`総ヒット件数: N 件`（`search-results.tsx`）、`nav`「ページネーション」と現在ページの `aria-current="page"`（`pagination.tsx`）、詳細の `dt`「オーナー」「言語」「Star数」「Watcher数」「Fork数」「Issue数」とリンク「トップへ戻る」（`repo-detail-view.tsx`）、0 件の案内 `「<q>」に一致するリポジトリは見つかりませんでした。`（`empty-results.tsx`、`role="status"`）。
  - 検索の URL は `/?q=react&page=1`（`buildSearchPath` は `page=1` も省略しない）。詳細へのリンクは `/repos/<owner>/<repo>?q=…&page=…`。
  - `mappers.ts` は `avatar_url` を `https://avatars.githubusercontent.com` に、`html_url` を `https://github.com` に限り、`next.config.ts` は `/u/**` と `?v=4` だけを許す（固定データはこれに合わせる）。

- 2026-10-09: 人間が計画を承認（Q1〜Q15 すべて推奨どおり。Q10 の E2E の RED の取り方の変更を含む）。Status: in-progress。T0（人間による @playwright/test の追加とブラウザの取得）の完了待ち。

- 2026-10-09: T0 完了（人間が実行）。`@playwright/test` 1.63.0 を追加、chromium（Chrome for Testing 153.0.8010.12）を取得。`package.json` の差分は `@playwright/test` の 1 行のみ。`pnpm-lock.yaml` の `-1` 行は、`next` の依存キーに任意の peer 依存 `@playwright/test@1.63.0` が加わっただけでパッケージの削除ではない。`verify.sh --quick` PASS。
- 2026-10-09: T1 完了。ADR 0006（Status: Proposed。ライセンス Apache-2.0 を `node_modules/@playwright/test/LICENSE` と `package.json` で確認、開発元 Microsoft Corporation。リリース頻度と Cypress の詳細は未確認と明記）。`.gitignore` に `/test-results/`・`/playwright-report/`、`eslint.config.mjs` の `globalIgnores` に同じ 2 つを追加。`git check-ignore` は両方 0。`package.json`・`pnpm-lock.yaml` のステージは Claude で通った（Q12。hook に止められなかった）。`verify.sh --quick` PASS。
