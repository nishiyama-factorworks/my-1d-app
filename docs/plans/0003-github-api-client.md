# 0003: GitHub APIクライアント 実装計画

Status: in-progress <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #3
- 対応する仕様: docs/specs/0003-github-api-client.md
- ブランチ: feat/3-github-api-client
- 作成日: 2026-10-07

## 1. 方針

- **置き場所（推奨案）: `lib/github/`**。検索（0006）と詳細（0008）の両方の機能から使う横断モジュールなので、`features/<名前>/` ではなく `lib/`（CLAUDE.md 6節「横断ユーティリティ」）に置く。`SRC_REGEX` に `lib` が含まれるため、Stop ゲートでテストの存在が強制される。
- **責務の分割**: 副作用（`fetch`・環境変数・タイマー）を `http.ts` 1か所に寄せ、エラー分類とレスポンス変換は I/O を持たない純粋関数にする（`.claude/rules/20-typescript.md`）。
- **サーバー専用**: トークンを扱う `http.ts` と、公開関数を持つ `client.ts` の先頭で `import "server-only"` を書く。型とエラー定義（`types.ts` `errors.ts`）には付けない。0010 のエラー表示部品が、種別の型やガード関数を Client Component から import できるようにするため。トークンは `http.ts` の外に出さない。
- **外部レスポンスの検証**: zod は未導入のため、依存を足さずに手書きの型ガード（`unknown` から必要な項目だけを検査）で検証する。形が合わなければ `UPSTREAM`（AC-24d「その他の想定外の応答」）。zod を入れる案は「6. ADR が必要な論点」を参照。
- **既存の再利用**: `.env.example` には `GITHUB_TOKEN=` が既にあり（0002 T3）、変更しない。`vitest.config.mts` も変更しない（理由は 4節）。
- **依存順**: 依存追加の承認（server-only）→ 型・エラー分類 → レスポンス変換 → HTTP 層 → 公開関数 → トークン漏えい検査 → サーバー専用の検査 → 文書の更新。

### 1.1 計画で確定する事項（仕様 9節の未決事項）

**ファイル分割**

| ファイル | 内容 | `server-only` |
| --- | --- | --- |
| `lib/github/types.ts` | 公開する型 | なし（型のみ） |
| `lib/github/errors.ts` | `GitHubApiError`、`isGitHubApiError`、`classifyHttpError`（純粋関数） | なし |
| `lib/github/mappers.ts` | API の JSON（`unknown`）を検証してアプリの型へ変換する純粋関数 | なし |
| `lib/github/http.ts` | `githubGet`: URL の組み立て、ヘッダ、トークン、タイムアウト、エラー分類の適用 | あり |
| `lib/github/client.ts` | `searchRepositories`、`getRepository` | あり |
| `lib/github/index.ts` | 公開の窓口（`client.ts` の関数、型、エラー関連の再 export） | `client.ts` 経由で間接的に適用 |

**関数のシグネチャ**（0008 AC-12 が `getRepository("vercel", "next.js")` と位置引数で書いているので、それに合わせる）

```ts
export function searchRepositories(params: SearchRepositoriesParams): Promise<SearchRepositoriesResult>;
export function getRepository(owner: string, repo: string): Promise<RepoDetail>;
```

**型**

```ts
type SearchRepositoriesParams = { q: string; page?: number; perPage?: number }; // page 既定 1、perPage 既定 30
type SearchRepositoriesResult = { totalCount: number; items: RepoSummary[] };
type RepoSummary = { fullName: string; ownerLogin: string; ownerAvatarUrl: string };
type RepoDetail = {
  fullName: string; ownerLogin: string; ownerAvatarUrl: string;
  language: string | null;
  stargazersCount: number;
  watchersCount: number; // subscribers_count から（watchers_count は使わない）
  forksCount: number; openIssuesCount: number; htmlUrl: string;
};
type GitHubErrorKind = "RATE_LIMIT" | "NOT_FOUND" | "VALIDATION" | "UPSTREAM" | "NETWORK";
```

**エラーの形**: 失敗は `throw` で表す（戻り値の Result 型にはしない）。

```ts
class GitHubApiError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number | undefined;   // HTTP ステータス。NETWORK のときは undefined
  readonly resetAt: Date | undefined;    // RATE_LIMIT で x-ratelimit-reset が読めたときだけ
}
function isGitHubApiError(e: unknown): e is GitHubApiError;
```

- `message` は種別ごとの固定文言（例: `"GitHub API rate limit exceeded"`）にし、レスポンス本文・リクエストヘッダ・URL を含めない（AC-23d）。
- `cause` は付けない。元の `fetch` の例外やレスポンスを保持すると、ログ出力時に内部情報が連鎖して出るおそれがあるため。
- 例外を選ぶ理由: 0008 は `NOT_FOUND` を `notFound()` に、それ以外を `error.tsx` 等に振り分ける想定で、Server Component では try/catch で種別を見て分岐するのが素直なため。Result 型は呼び出し側に分岐を強制できる反面、正常系のコードが毎回アンラップを書くことになる。

**HTTP の詳細**

- ベース URL は定数 `https://api.github.com`（環境変数で変えられるようにはしない。SSRF の余地を作らないため）。
- URL は `new URL()` と `URLSearchParams` で組み立て、文字列連結しない（`.claude/rules/40-security.md`）。パスの各セグメントは `encodeURIComponent` する。
- ヘッダ: `Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`。`GITHUB_TOKEN` が空でない文字列のときだけ `Authorization: Bearer <token>`。トークンは**呼び出しのたびに** `process.env` から読む（テストで `vi.stubEnv` を切り替えられるようにするため）。空文字は未設定として扱う。
- タイムアウト: `AbortController` と `setTimeout(10_000)` で中断し、`finally` で `clearTimeout` する。`AbortSignal.timeout()` ではなくこの方式にするのは、Vitest のフェイクタイマーで「10秒で打ち切られる」ことを検証できるようにするため。JSON の読み取り（`res.json()`）までをタイムアウトの対象に含める。
- `fetch` が例外を投げた（接続失敗・中断）場合は `NETWORK`。`res.json()` の失敗、または検証失敗は `UPSTREAM`。
- キャッシュ関連の `fetch` オプション（`cache`、`next.revalidate`）は指定しない（仕様 4.2、0011 で確定）。

**エラー分類（`classifyHttpError(status, headers, endpoint)`）**

| 条件 | 種別 |
| --- | --- |
| 429 | `RATE_LIMIT` |
| 403 かつ `x-ratelimit-remaining: 0` | `RATE_LIMIT` |
| 404 かつ `endpoint === "repo"` | `NOT_FOUND` |
| 422 かつ `endpoint === "search"` | `VALIDATION` |
| 上記以外（500・502・503、401、上記以外の 403、検索での 404、詳細での 422 など） | `UPSTREAM` |

- `resetAt`: `RATE_LIMIT` のとき、`x-ratelimit-reset`（Unix 秒）が整数として読めれば `new Date(秒 * 1000)`、読めなければ `undefined`。
- 「検索での 404 → UPSTREAM」「詳細での 422 → UPSTREAM」は、仕様 6.2 の関数ごとのエラー列（検索に `NOT_FOUND` が、詳細に `VALIDATION` が無い）に合わせた解釈。要確認事項 Q4。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `lib/github/types.ts` | 公開型 |
| 新規 | `lib/github/errors.ts` / `errors.test.ts` | エラー型と分類 |
| 新規 | `lib/github/mappers.ts` / `mappers.test.ts` | レスポンスの検証と変換 |
| 新規 | `lib/github/http.ts` / `http.test.ts` | HTTP 呼び出しの共通部（server-only） |
| 新規 | `lib/github/client.ts` / `client.test.ts` | 公開関数（server-only） |
| 新規 | `lib/github/index.ts` | 公開の窓口 |
| 新規 | `lib/github/token-leak.test.ts` | AC-23d |
| 新規 | `lib/github/server-only.test.ts` | AC-23c |
| 変更 | `package.json` / `pnpm-lock.yaml` | `server-only` の追加（**人間の承認後**に `pnpm add` 経由のみ。手で編集しない） |
| 変更 | `docs/architecture.md` | 5節「Server / Client の境界」と 3節に GitHub API 層の位置づけを追記 |
| 変更なし | `vitest.config.mts`、`.env.example` | 4節参照 |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: 【人間の承認が必要】`server-only` の追加**
  - 対応 AC: AC-23c の前提（仕様 4.1、9節）
  - 先に書くテスト: なし（依存追加のみ。利用は T4、検証は T7）
  - 手順:
    1. 次を示して**人間の個別承認を得る**。承認が出るまで `pnpm add` を実行しない。
       - パッケージ: `server-only`（React チームが公開するマーカーパッケージ。リポジトリ facebook/react）。用途: サーバー専用モジュールを Client Component から import したときにビルドで失敗させる。
       - バージョン・ライセンス: `node_modules/next/dist/compiled/server-only/package.json` に同梱されている版は `0.0.1`、`MIT`。npm 上の最新版・最終公開日・週間ダウンロード数は実施時に `pnpm view server-only` で確認して提示する（推測で書かない）。
       - 中身: `index.js`（例外を投げる）と `empty.js`（空）の 2 ファイルのみ。依存なし。
       - 代替案: (a) 追加しない（Next.js は `server-only` の import を内部で処理するため、ビルド時の拒否はパッケージ無しでも働くと公式ドキュメントにある。ただし Vitest や TypeScript 以外のツールでは解決できずに失敗する）。(b) 自前のチェック（`typeof window` 判定）。ビルド時ではなく実行時の検出になり、仕様 4.1 の決定に反する。
    2. 承認後、`pnpm add server-only`（実行時に import するため `dependencies`）。
    3. `node_modules/server-only/package.json` を読み、`exports` が `"react-server": "./empty.js"`、`"default": "./index.js"` であることを確認して進捗メモに記録する（T7 の検証方法がこれに依存するため）。
  - 実装対象: `package.json`、`pnpm-lock.yaml`（2 ファイル、いずれもコマンド経由）
  - 完了条件: 承認内容（パッケージ名・バージョン・承認日）を進捗メモに記録。`bash scripts/verify.sh --quick` PASS。

- [x] **T2: 型定義とエラー分類**
  - 対応 AC: AC-24a、AC-24b、AC-24c、AC-24d（分類規則の単体部分）
  - 先に書くテスト: `lib/github/errors.test.ts`（`// @vitest-environment node`）
    - `AC-24a: 429 のとき RATE_LIMIT に分類される`
    - `AC-24a: 403 で x-ratelimit-remaining が 0 のとき RATE_LIMIT に分類され、x-ratelimit-reset からリセット時刻を保持する`（例: `1700000000` → `new Date(1700000000000)`）
    - `AC-24a: x-ratelimit-reset が無い、または数値でないときはリセット時刻を持たない`
    - `AC-24b: 詳細 API の 404 は NOT_FOUND に分類される`
    - `AC-24c: 検索 API の 422 は VALIDATION に分類される`
    - `AC-24d: 500・502・503 は UPSTREAM に分類される`（`it.each`）
    - `AC-24d: 403 で x-ratelimit-remaining が 0 でないとき、および 401 は UPSTREAM に分類される`
    - `AC-24d: 検索 API の 404、詳細 API の 422 は UPSTREAM に分類される`（Q4 の解釈。否決なら削る）
    - `isGitHubApiError: GitHubApiError のときだけ true を返す`
  - RED: `classifyHttpError` を常に `UPSTREAM`・`resetAt` なしを返す仮実装で置き、期待値の不一致で失敗することを確認する（インポートエラーでの失敗は RED と認めない）。
  - 実装対象: `lib/github/types.ts`、`lib/github/errors.ts`、`lib/github/errors.test.ts`（3 ファイル）
  - 完了条件: `pnpm test` PASS、`pnpm typecheck` `pnpm lint` PASS。

- [x] **T3: レスポンスの検証と変換**
  - 対応 AC: AC-5b、AC-13a、AC-13b（変換部分）、AC-24d（想定外の形）
  - 先に書くテスト: `lib/github/mappers.test.ts`（`// @vitest-environment node`）
    - `AC-5b: total_count=1234 と 30件の items を totalCount と RepoSummary 30件に変換し、各要素が fullName・ownerLogin・ownerAvatarUrl を持つ`
    - `AC-13a: stargazers_count・subscribers_count・forks_count・open_issues_count・language を RepoDetail に変換し、watchersCount は subscribers_count の値になる`（`watchers_count` に別の値を入れて、そちらが使われないことも確かめる）
    - `AC-13b: language が null のとき language が null になり、例外を投げない`
    - `AC-24d: 必須項目が欠けている・型が違う JSON は UPSTREAM の GitHubApiError になる`（例: `items` が配列でない、`stargazers_count` が文字列、`owner` が無い）
    - 変換結果に、仕様 7節に無い項目（`id` や API の生の値）が含まれないこと
  - RED: 変換関数を空の値を返す仮実装で置き、期待値の不一致で失敗することを確認する。
  - 実装対象: `lib/github/mappers.ts`、`lib/github/mappers.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS。

- [x] **T4: HTTP 層（ヘッダ・トークン・タイムアウト・失敗の分類）**
  - 対応 AC: AC-23a、AC-23b、AC-24e（HTTP 層の単体部分）
  - 先に書くテスト: `lib/github/http.test.ts`（`// @vitest-environment node`、先頭で `vi.mock("server-only", () => ({}))`、`fetch` は `vi.stubGlobal` でモック、環境変数は `vi.stubEnv`、`afterEach` で `vi.unstubAllGlobals()` `vi.unstubAllEnvs()` `vi.useRealTimers()`）
    - `AC-23a: GITHUB_TOKEN があるとき Authorization・Accept・X-GitHub-Api-Version ヘッダを付けて呼ぶ`
    - `AC-23b: GITHUB_TOKEN が未設定のとき Authorization ヘッダ無しで呼び、成功する`
    - `AC-23b: GITHUB_TOKEN が空文字のときも Authorization ヘッダを付けない`
    - `AC-24e: fetch が TypeError で失敗したとき NETWORK になる`
    - `AC-24e: 10秒以内に応答が無いとき中断され NETWORK になる`（フェイクタイマー。`fetch` のモックは受け取った `signal` の `abort` で reject する Promise を返す。9,999ms 進めても未確定、さらに 1ms 進めると `NETWORK` で reject することを確認）
    - `AC-24e: 応答後はタイマーが解除される`（成功後に `vi.getTimerCount()` が 0）
    - `AC-24d: 応答本文が JSON として読めないとき UPSTREAM になる`
    - `HTTP エラー応答のとき classifyHttpError の結果で失敗する`（429 → `RATE_LIMIT` の 1 件だけ。分類の網羅は T2 と T5 で行う）
  - 実装対象: `lib/github/http.ts`（先頭に `import "server-only"`）、`lib/github/http.test.ts`（2 ファイル）
  - 注意: `vi.mock("server-only", ...)` が node_modules のパッケージに効くことをこのタスクで最初に確かめる。効かない場合は止めて、4節の代替案（Vitest の `resolve.alias`）を人間に相談する。
  - 完了条件: `pnpm test` PASS。

- [x] **T5: 公開関数 `searchRepositories` / `getRepository` と窓口**
  - 対応 AC: AC-5a、AC-5b、AC-13a、AC-13b、AC-23a、AC-23b、AC-24a〜AC-24e（公開関数を通した検証）
  - 先に書くテスト: `lib/github/client.test.ts`（`// @vitest-environment node`、`vi.mock("server-only", () => ({}))`、`fetch` のみモック。`@/lib/github`（`index.ts`）から import して公開面を検証する）
    - `AC-5a: q="react" page=2 のとき /search/repositories に q=react・page=2・per_page=30 を付けて呼び、sort と order を付けない`（呼び出し URL を `new URL()` で分解して検証）
    - `AC-5a: page を省略すると page=1 で呼ぶ`
    - `AC-5a（入力のエンコード）: q に & # 空白 を含むとき、1つの q パラメータとしてエンコードされる`（例: `q="a&per_page=1 #x"` → `searchParams.get("q")` が元の文字列、`per_page` は 30 のまま）
    - `AC-5b: 検索 API の total_count=1234 と 30件を totalCount と items 30件として返す`
    - `AC-13a: 詳細 API の各数値と言語を RepoDetail として返し、Star 数と Watcher 数は別の値になる`
    - `AC-13b: 詳細 API の language が null のとき null を返し、失敗しない`
    - `getRepository は /repos/{owner}/{repo} を呼び、各セグメントをエンコードする`（例: `getRepository("vercel", "next.js")` → パスが `/repos/vercel/next.js`）
    - `AC-23a / AC-23b: 両関数とも、トークンの有無に応じて Authorization ヘッダを付け外しする`（`it.each` で 2 関数 × 2 条件）
    - `AC-24a: 429、および 403 + x-ratelimit-remaining: 0 のとき、両関数とも RATE_LIMIT で失敗し、リセット時刻を持つ`
    - `AC-24b: getRepository で 404 のとき NOT_FOUND で失敗する`
    - `AC-24c: searchRepositories で 422 のとき VALIDATION で失敗する`
    - `AC-24d: 500・502・503・想定外の JSON のとき、両関数とも UPSTREAM で失敗する`
    - `AC-24e: fetch が接続失敗したとき、両関数とも NETWORK で失敗する`
  - RED: 公開関数を `throw new Error("not implemented")` の仮実装で置いて、期待値の不一致で失敗することを確認する。
  - 実装対象: `lib/github/client.ts`（先頭に `import "server-only"`）、`lib/github/index.ts`、`lib/github/client.test.ts`（3 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T6: トークンがエラー・戻り値・ログに出ないことの検査（AC-23d）**
  - 対応 AC: AC-23d
  - 先に書くテスト: `lib/github/token-leak.test.ts`（`// @vitest-environment node`、`vi.mock("server-only", () => ({}))`）
    - 準備: `vi.stubEnv("GITHUB_TOKEN", SENTINEL)`。`SENTINEL` は実在しない識別しやすい文字列（例: `"test-token-SENTINEL-0003"`。`ghp_` 形式は使わない。シークレットスキャナの誤検知を避けるため）。`console.log` `info` `warn` `error` `debug` を `vi.spyOn` で差し替える。
    - `AC-23d: 429・403（レート制限）・404・422・500・接続失敗・タイムアウトの各失敗で、エラーにトークンが含まれない`（`it.each`。各ケースで受け取ったエラーについて、`message`、`stack`、`String(e)`、`JSON.stringify(e)`、`util.inspect(e, { depth: null, showHidden: true })` のいずれにも `SENTINEL` が含まれないことを検証。`inspect` を使うのは、独自プロパティや `cause` の連鎖まで含めて調べるため）
    - `AC-23d: 接続失敗の例外メッセージにトークンが含まれていても、受け取るエラーには含まれない`（`fetch` のモックが `SENTINEL` を含むメッセージの `TypeError` を投げる。`cause` を保持しない設計の検証）
    - `AC-23d: 成功時の戻り値にトークンが含まれない`（両関数の戻り値を `JSON.stringify` して検査）
    - `AC-23d: 成功・失敗のどの場合も、console の各メソッドに渡された引数にトークンが含まれない`（全スパイの全呼び出し引数を `util.inspect` で文字列化して検査）
  - RED について: T4・T5 の設計どおりなら最初から PASS する（特性テスト）。**検出力の確認**として、ローカルで一時的に (1) `GitHubApiError` の `message` にリクエストヘッダを含める、(2) `cause` に元の例外を入れる、(3) `http.ts` で `console.error` にヘッダを出す、の 3 通りを試し、それぞれ該当テストが失敗することを確かめてすぐ元に戻す（コミットしない）。結果を進捗メモに記録する。
  - 実装対象: `lib/github/token-leak.test.ts`（1 ファイル。テストが失敗した場合のみ `lib/github/http.ts` `errors.ts` を修正）
  - 完了条件: `pnpm test` PASS、検出力確認の記録。

- [ ] **T7: サーバー専用であることの検査（AC-23c）**
  - 対応 AC: AC-23c
  - 先に書くテスト: `lib/github/server-only.test.ts`（`// @vitest-environment node`。**`vi.mock("server-only")` を書かない**）
    - `AC-23c: react-server 条件なしで server-only を読み込むと、Client Component からは使えない旨のエラーで拒否される`（`await expect(import("server-only")).rejects.toThrow(/cannot be imported from a Client Component/)`）
    - `AC-23c: react-server 条件なしで lib/github を読み込むと拒否される`（`await expect(import("@/lib/github")).rejects.toThrow(...)`、`@/lib/github/http` `@/lib/github/client` も同様。`it.each`）
    - `AC-23c: http.ts と client.ts は最初の import 文が "server-only" である`（ファイルを `fs` で読み、先頭のコメントを除いた最初の文を検査。import の順序が変わって他のモジュールが先に評価される退行を防ぐ）
  - 根拠（Next.js 16.3.8 同梱ドキュメントと同梱パッケージで確認済み）:
    - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`「Preventing environment poisoning」: `import 'server-only'` を書いたモジュールを Client Component に import すると「build-time error」になる。Next.js は `server-only` の import を内部で処理し、npm パッケージの中身は使わない。`noUncheckedSideEffectImports` 用の型宣言も Next.js が提供する。
    - `node_modules/next/dist/compiled/server-only/package.json`（0.0.1）: `exports` が `"react-server": "./empty.js"`（空）、`"default": "./index.js"`。`index.js` は `"This module cannot be imported from a Client Component module. It should only be used from a Server Component."` を投げる。
    - したがって、`react-server` 条件を付けずにモジュールを解決する環境（Vitest。Node の既定の条件は `node` `import` `default` で `react-server` を含まない）では `default` の `index.js` が選ばれ、import した時点で例外になる。これは「クライアント側で読み込んだとき」と同じ解決結果であり、テストで拒否を観測できる。
    - Next.js 公式の Jest ガイド（`02-guides/testing/jest.md`）は `moduleNameMapper` で `server-only` を空ファイルに差し替える例を示している。本計画はこれをテスト全体には適用せず、ファイル単位の `vi.mock` で行う（4節）。
  - jsdom 環境での扱い: 本テストと `lib/github` のテストはすべて `// @vitest-environment node` にする。サーバー専用コードは Node で動くため、jsdom の `AbortController` / `DOMException` 実装に依存させない。`server-only` の解決結果（`default` → 例外）は jsdom 環境でも `react-server` 条件が付かない点で同じだが、jsdom での挙動は本テストの検証対象にしない。
  - Next.js のビルドでの拒否（手動確認。自動テストにはしない。`next build` は数十秒かかり、単体テストに入れると Stop ゲートが遅くなるため）:
    1. 一時的に `app/server-only-check/page.tsx`（Server Component）と、`"use client"` を付けて `@/lib/github` を import する `app/server-only-check/client-probe.tsx` を作る。
    2. `pnpm build` を実行し、ビルドが失敗し、エラーに `server-only` / Client Component に関する文言が出ることを確認する。
    3. 一時ファイルを削除し、`pnpm build` が成功に戻ることを確認する（コミットしない）。出力の要旨を進捗メモに記録する。
  - RED について: T4・T5 で `import "server-only"` を入れ済みのため最初から PASS する。**検出力の確認**として、一時的に `http.ts` と `client.ts` から `import "server-only"` を外し、2 件目と 3 件目のテストが失敗することを確かめて戻す（コミットしない）。
  - 想定と違った場合: 1 件目が拒否されない（`server-only` が `empty.js` に解決される等）なら、検証方法の前提が崩れているので止めて人間に相談する。
  - 実装対象: `lib/github/server-only.test.ts`（1 ファイル）
  - 完了条件: `pnpm test` PASS、手動ビルド確認と検出力確認の記録。

- [ ] **T8: 文書の更新と最終確認**
  - 対応 AC: なし（`.claude/rules/60-docs.md`「コードと文書の食い違いを直す」）
  - 先に書くテスト: なし（文書のみ）
  - 実装対象: `docs/architecture.md`（3節に「GitHub API の呼び出しは `lib/github/` だけが行う」、5節「Server / Client の境界」に「トークンを扱うモジュールは `import "server-only"`。型とエラー定義は Client からも import 可」を追記）、本計画の進捗メモ（2 ファイル）
  - 手順: `bash scripts/verify.sh` を実行し、PASS/FAIL を事実のまま進捗メモに記録。`Status` を更新する。
  - 完了条件: `verify.sh`（full）PASS。

- [ ] **T5b: 入力検証（AC-5c・AC-5d・AC-13c。Q1〜Q3 の採用により追加）**
  - 対応 AC: AC-5c、AC-5d、AC-13c
  - 先に書くテスト: `lib/github/client.test.ts` に追記（`fetch` のモックが**呼ばれない**ことを検証）
    - `AC-5c: q が空文字・空白のみのとき fetch を呼ばずに VALIDATION で失敗する`
    - `AC-5d: page が 0・負数・小数・NaN のとき fetch を呼ばずに VALIDATION で失敗する`
    - `AC-5d: perPage が 0・101・小数のとき fetch を呼ばずに VALIDATION で失敗する`（境界値 1 と 100 は成功する）
    - `AC-13c: owner が不正（空・40文字・記号・スラッシュ）のとき fetch を呼ばずに NOT_FOUND で失敗する`
    - `AC-13c: repo が不正（空・101文字・スラッシュ・"." ・".."）のとき fetch を呼ばずに NOT_FOUND で失敗する`
    - `AC-13c: vercel/next.js のような有効な値は成功する`
  - RED: 検証なしの現状実装で、`fetch` が呼ばれてしまうことによる失敗を確認する（インポートエラーは RED と認めない）。
  - 実装対象: `lib/github/client.ts`、`lib/github/client.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 |
| --- | --- | --- | --- |
| 単体（純粋関数） | エラー分類、レスポンス変換 | `errors.test.ts`、`mappers.test.ts` | node |
| 単体（境界あり） | HTTP 層（ヘッダ・トークン・タイムアウト） | `http.test.ts` | node |
| 結合（公開面） | 公開関数を通した AC 全体 | `client.test.ts` | node |
| セキュリティ | トークン漏えい（AC-23d） | `token-leak.test.ts` | node |
| セキュリティ | サーバー専用（AC-23c） | `server-only.test.ts` + 手動の `pnpm build` 確認 | node |
| E2E | なし（0013） | — | — |

- **モックする境界**: `fetch`（`vi.stubGlobal`）、環境変数（`vi.stubEnv`）、時刻（`vi.useFakeTimers`、T4 のタイムアウトのみ）。自前のモジュール同士はモックしない（`.claude/rules/30-testing.md`）。実際の GitHub API は呼ばない。
- **`server-only` の扱い**: マーカーパッケージで、Vitest では `react-server` 条件が無いため import すると例外になる（T7 の根拠）。そのため `lib/github` を読み込むテストファイルだけ先頭で `vi.mock("server-only", () => ({}))` とする。プロセス境界の外ではないが、実行時の振る舞いを持たない「環境の印」であり、Next.js 公式の Jest ガイドも同様に差し替えている。
  - `vitest.config.mts` の `resolve.alias` で全体を差し替える案は採らない。全テストで拒否が見えなくなり、T7 の検証ができなくなるうえ、将来 Client Component のテストが誤って `lib/github` を import しても気づけなくなるため。
  - 後続タスク（0006・0008）で Server Component のテストが `lib/github` を読み込む場合も、同じくファイル単位で `vi.mock("server-only", ...)` を書くか、0008 の仕様どおり `getRepository` 自体をモックする。
- `fetch` のモックは `new Response(JSON.stringify(body), { status, headers })` で本物の `Response` を返し、ヘッダの大文字小文字の扱いなども実物に任せる。
- テスト名は日本語で `AC-<番号>` を含める。テストデータの 30件は配列生成のヘルパをテストファイル内に置く（共有ヘルパにはしない。使うのは本タスクだけのため）。

AC と検証手段の対応:

| AC | 検証手段 | タスク |
| --- | --- | --- |
| AC-5a | `client.test.ts`（呼び出し URL を分解して `q` `page` `per_page` の値と `sort` `order` が無いことを確認） | T5 |
| AC-5b | `mappers.test.ts`（変換）、`client.test.ts`（公開関数） | T3, T5 |
| AC-13a | `mappers.test.ts`、`client.test.ts`（`watchers_count` に別値を入れて `subscribers_count` が使われることを確認） | T3, T5 |
| AC-13b | `mappers.test.ts`、`client.test.ts` | T3, T5 |
| AC-23a | `http.test.ts`、`client.test.ts`（両関数） | T4, T5 |
| AC-23b | `http.test.ts`、`client.test.ts`（未設定・空文字） | T4, T5 |
| AC-23c | `server-only.test.ts`（未モックの import が拒否される・先頭 import の検査）＋ 手動の `pnpm build` で Client Component からの import が失敗することを確認 | T1, T7 |
| AC-23d | `token-leak.test.ts`（全失敗種別でエラーの各表現・戻り値・console 出力にトークンが無い）＋ 検出力確認 | T6 |
| AC-24a | `errors.test.ts`（429 / 403+remaining 0 / reset の読み取り）、`client.test.ts` | T2, T5 |
| AC-24b | `errors.test.ts`、`client.test.ts` | T2, T5 |
| AC-24c | `errors.test.ts`、`client.test.ts` | T2, T5 |
| AC-24d | `errors.test.ts`、`mappers.test.ts`（想定外の形）、`http.test.ts`（JSON でない本文）、`client.test.ts` | T2〜T5 |
| AC-24e | `http.test.ts`（接続失敗・10秒のタイムアウト）、`client.test.ts` | T4, T5 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| トークンがエラー・ログ・戻り値に混入する | シークレット漏えい（AC-23d 不達） | トークンは `http.ts` 内のヘッダ組み立てでのみ参照。エラーは固定文言・`cause` 無し・レスポンス本文を保持しない。モジュール内で console に出力しない。T6 で全失敗種別を検査し、検出力も確認 |
| `lib/github` が Client Component に読み込まれる | トークン参照コードのクライアント流出 | `import "server-only"` を `http.ts` と `client.ts` の先頭に置き、T7 で未モック時の拒否と先頭 import を検査、`pnpm build` で実地確認 |
| `owner` / `repo` に `..` や `/` を含む値が渡される | `encodeURIComponent` は `.` をエンコードしないため、`new URL()` の正規化で `/repos/../x` が別のパスに解決されうる（同じ `api.github.com` 内だが意図しない API を叩く） | 各セグメントを `encodeURIComponent` したうえで、Q3 の許可リスト検証を推奨。最低限、`.` と `..` のセグメントは `fetch` 前に拒否する案を Q3 で確認 |
| `q` に `&` `#` などが含まれる | クエリの改ざん（`per_page` の上書きなど） | `URLSearchParams` で組み立て、T5 にエンコードのテストを置く |
| `vi.mock("server-only")` が node_modules のパッケージに効かない | T4 以降のテストが import 時に失敗 | T4 の最初に確認。効かなければ止めて、Vitest の `projects` で `lib/github` 用の設定を分ける等の代替案を相談 |
| タイムアウトのテストが実時間に依存して遅い・不安定 | テストの不安定化 | `AbortController` + `setTimeout` 方式にしてフェイクタイマーで検証。`afterEach` で実タイマーに戻す |
| GitHub のレスポンス形式が想定と異なる（項目欠落など） | 実行時エラーの握りつぶし・型の嘘 | `unknown` から型ガードで検証し、不一致は `UPSTREAM` で失敗させる（T3） |
| Next.js の `fetch` 拡張（キャッシュ）の既定値に依存した挙動 | 古いデータが返る等 | 本タスクではオプションを指定しない。キャッシュ方針は 0011。Next 16 の既定値の確認も 0011 で公式ドキュメントに当たる |
| 既存機能への影響 | — | 既存ファイルの変更は `package.json`（依存追加）と `docs/architecture.md` のみ。`vitest.config.mts` を変えないので既存テストへの影響なし |

## 6. ADR が必要な論点

- **`server-only` の採用: ADR 不要と考える。** 決定は仕様 9節に記録済みで、Next.js 公式が案内するマーカーパッケージ（依存なし・2 ファイル）。採用理由は T1 の承認記録と本計画に残す。主要ライブラリの採用とみなすなら ADR を作る（要確認 Q7）。
- **外部 API レスポンスの検証手段（ADR は zod を採る場合のみ必要）**
  - 選択肢 A（推奨）: 手書きの型ガード。依存追加なし。対象は 2 種類のレスポンスの十数項目だけで、保守の負担は小さい。
  - 選択肢 B: zod を追加。`.claude/rules/20-typescript.md` と `docs/architecture.md` 5節が「zod 等」を挙げており、0004（URL クエリの検証）でも使える可能性がある。プロジェクト横断の検証ライブラリ採用になるため、採る場合は依存追加の承認と ADR が必要。
- エラーを例外で返すか Result 型で返すか、ファイル分割は本計画内の設計判断であり、ADR は不要。

## 7. 要確認事項

- [ ] **Q1: `q` が空（空文字・空白のみ）のときの扱い。** 仕様 6.2 は「必須」とだけ書き、AC が無い。推奨: `fetch` を呼ばずに `VALIDATION` で失敗させる（検索のエラー種別に既にあり、0005/0006 の入力チェックをすり抜けた場合の防御）。代替: 検証しない（GitHub が 422 を返し、結局 `VALIDATION` になる。API 呼び出しを 1 回消費する）。
- [ ] **Q2: `page` が 1 未満・整数でない、`perPage` が範囲外（GitHub は 1〜100）のときの扱い。** 推奨: `fetch` を呼ばずに `VALIDATION` で失敗させる（補正は 0004 の責務で、ここでは黙って補正しない）。代替: 検証しない。
- [ ] **Q3: `owner` / `repo` の検証。** 推奨: GitHub の命名規則に沿った許可リスト（`owner`: 英数字とハイフン、1〜39 文字／`repo`: 英数字と `.` `_` `-`、1〜100 文字、`.` と `..` は不可）に合わない値は `fetch` を呼ばずに `NOT_FOUND` で失敗させる（詳細のエラー種別に `VALIDATION` が無いため。0008 では 404 表示になる）。最低限案: `encodeURIComponent` に加え、`.` / `..` のセグメントだけ拒否する。どちらも仕様に無い要件なので、採用する場合は仕様 0003 の 5節に AC を追記するか判断してほしい。
- [ ] **Q4: エンドポイントごとの分類。** 仕様 6.2 のエラー列に合わせて「検索の 404 → `UPSTREAM`」「詳細の 422 → `VALIDATION` ではなく `UPSTREAM`」と解釈した。共通の分類（404 は常に `NOT_FOUND`、422 は常に `VALIDATION`）でよければ `endpoint` 引数を無くせる。
- [ ] **Q5: `429` の `retry-after` ヘッダ。** GitHub の二次レート制限は `retry-after`（秒）を返すことがある。仕様は「リセット時刻が分かる場合は保持」とだけ書いている。本計画では `x-ratelimit-reset` だけを読み、`retry-after` は使わない（現在時刻に依存する計算になるため）。使う場合は T2 に追加する。また、`retry-after` 付きで `x-ratelimit-remaining` が 0 でない 403（二次レート制限）は、AC-24a の条件に当たらないため `UPSTREAM` になる。`RATE_LIMIT` に含めるか。
- [ ] **Q6: 401（トークンが無効）の扱い。** AC-24d の「その他の想定外の応答」として `UPSTREAM` にする。トークン無しで再試行するなどの特別扱いはしない。この解釈でよいか。
- [ ] **Q7: `server-only` 採用の ADR の要否。** 本計画では不要とした（6節）。
- [ ] **Q8: レスポンス検証は手書きの型ガード（選択肢 A）でよいか。** zod（選択肢 B）にする場合は、依存追加の承認と ADR のタスクを T2 の前に追加する。

### 提案（仕様外。本計画のタスクには含めない）

- P1: `RepoSummary` に `name`（`repo` 部分）を足す。0006 で詳細ページへのリンクを作る際、`fullName` を `/` で分割せずに済む。仕様 7節の型定義の変更になるため、必要なら 0006 の計画時に仕様を更新して判断する。
- P2: `User-Agent` ヘッダの明示（GitHub API はリクエストに `User-Agent` を求める。Node の `fetch` は既定値を送るため現状は不要と考える）。
- P3: `.claude/rules/10-nextjs.md` の対象パスに `lib/**` を加え、`lib/github` 編集時にも Next.js ルール（`server-only` の記述）が読み込まれるようにする（`.claude/` は保護ファイル。別 Issue）。

## 8. 進捗メモ

- 2026-10-07: 計画作成（draft）。未着手。人間の承認後に T1（`server-only` 追加の承認）から開始する。要確認事項 Q1〜Q8 の回答を反映してから `Status: in-progress` にする。
- 2026-10-07: 人間が推奨どおりで承認（Status: in-progress）。決定事項: Q1〜Q3 採用（`q` 空・`page`/`perPage` 不正は `VALIDATION`、`owner`/`repo` は許可リスト検証で不正なら `NOT_FOUND`。いずれも `fetch` を呼ばない）→ 仕様 0003 に AC-5c・AC-5d・AC-13c を追加し、タスク T5b を T5 の後に追加／Q4（検索の 404・詳細の 422 は `UPSTREAM`）、Q5（`retry-after` は使わない。二次レート制限は `UPSTREAM`）、Q6（401 は `UPSTREAM`）は計画の解釈どおり／Q7 ADR 不要／Q8 手書きの型ガード／`/issue split` はせず 1 PR。提案 P1 は 0006 の計画時に判断、P2・P3 は本タスクに入れない。
- 2026-10-07: T1 人間承認のうえ追加: server-only 0.0.1（MIT、最終公開 2022-09-03、依存なし）。`node_modules/server-only/package.json` の exports が react-server→./empty.js、default→./index.js であることを確認済み（T7 の前提）。
- 2026-10-07: T4 実装後、本文の読み取り中にタイムアウトすると UPSTREAM になる点が AC-24e（タイムアウトは NETWORK）と食い違うと判明。テストを先に追加して RED（UPSTREAM が返る）を確認し、`controller.signal.aborted` のとき NETWORK にして GREEN。`vi.mock("server-only")` は node_modules のパッケージに効くことを確認済み。
