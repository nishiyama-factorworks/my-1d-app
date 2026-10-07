# 0006: 検索結果一覧 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #6
- 対応する仕様: docs/specs/0006-search-results-list.md
- ブランチ: feat/6-search-results-list
- 作成日: 2026-10-08

## 1. 方針

- トップページ（`app/page.tsx`）は **Server Component のまま**にする。`searchParams` を await して 0004 の `parseSearchParams` で解釈し、`q` があるときだけ 0003 の `searchRepositories` を**ページ関数の中で** await する。取得した結果を、同期の表示用コンポーネント `SearchResults` に渡す（1.2 (a)）。
- `SearchResults` は `features/search/components/search-results.tsx` に置く。`"use client"` は付けない（Server Component）。フックも状態も持たない、props を描くだけの部品にする。
- 0004 の関数（`parseSearchParams` `buildRepoPath` `formatNumber` `SEARCH_PER_PAGE`）をそのまま使い、正規化・符号化・桁区切りを新たに書かない。
- オーナーアイコンは `next/image`、行のリンクは `next/link` を使う（仕様 9節の決定と `.claude/rules/10-nextjs.md` の UI 規約）。`next.config.ts` の `images.remotePatterns` に `avatars.githubusercontent.com` だけを許可する（1.2 (c)）。
- 例外は握りつぶさない。`searchRepositories` の `GitHubApiError` は `try/catch` せずにそのまま投げ、Next.js 標準のエラー画面にする（仕様 6.1。専用表示は 0010）。0件は「総ヒット件数: 0 件」と空の `ul` を描くだけにする。
- UI は素の HTML 要素と Tailwind で作る。shadcn/ui の部品は追加しない（依存追加になるため）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| 取得の場所 | `app/page.tsx`（`export default async function Home({ searchParams }: PageProps<"/">)`）の中。`q === null` のときは呼ばない |
| 呼び出し | `searchRepositories({ q, page, perPage: SEARCH_PER_PAGE })`（`perPage` を明示する理由は 1.2 (a)・Q5） |
| 一覧コンポーネント | `SearchResults`（名前付き export）。`features/search/components/search-results.tsx`。Server Component（`"use client"` なし） |
| props | `{ totalCount: number; items: readonly RepoSummary[] }`。`RepoSummary` は `import type { RepoSummary } from "@/lib/github"`（型のみの import はコンパイル時に消えるため、`server-only` は実行時に読み込まれない） |
| 総ヒット件数 | `<p>総ヒット件数: {formatNumber(totalCount)} 件</p>`（1つの要素の中に収め、`getByText("総ヒット件数: 12,345 件")` で取れる形にする） |
| 一覧 | `<ul>` / `<li key={fullName}>`。`items` の順に `map` するだけで並べ替えない（AC-5） |
| 各行 | `<li>` の中に `<Image>`（アイコン）と `<Link href={詳細パス}>{fullName}</Link>`。**アイコンはリンクの外**に置く（1.2 (d)・Q3） |
| アイコン | `<Image src={ownerAvatarUrl} alt={ownerLogin} width={40} height={40} className="size-10 rounded-full" />`。`sizes` は付けない（固定サイズのため。1.2 (c)）。`preload` / `unoptimized` は付けない |
| 詳細パス | `repoPathFromFullName(fullName)`（新規。`features/search/lib/repo-path.ts`）。`fullName` を最初の `/` で owner と repo に分け、0004 の `buildRepoPath(owner, repo)` に渡す（1.2 (e)・Q1） |
| `remotePatterns` | `[{ protocol: "https", hostname: "avatars.githubusercontent.com", port: "", pathname: "/u/**", search: "?v=4" }]`（1.2 (c)・Q2） |
| ページの配置 | `<SearchForm>` の下に `{result !== null && <SearchResults totalCount={result.totalCount} items={result.items} />}` |

### 1.2 設計判断と根拠

**(a) `searchRepositories` を呼ぶ場所の比較**

| 観点 | 案A（推奨）: `app/page.tsx` で await し、同期の `SearchResults` に渡す | 案B: 非同期の Server Component `SearchResults({ q, page })` に切り出し、中で await する |
| --- | --- | --- |
| クライアントの JS | 増えない（どちらも Server Component。`"use client"` を足さない） | 同じ |
| テスト（一覧単体） | `render(<SearchResults totalCount={…} items={…} />)` で同期に描画できる。モック不要 | `render(await SearchResults({ q, page }))` で可能。ただし `searchRepositories` のモックが一覧のテストにも必要 |
| テスト（ページ） | `render(await Page({ params, searchParams }))` が 0005 と同じ方法でそのまま動く（ページの子はすべて同期のコンポーネント） | **ページのテストが動かない**。ページが返す JSX の中に async のコンポーネントが残り、Testing Library（React DOM のクライアント描画）では async のコンポーネントを描画できない。Next.js の Vitest ガイドも「async な Server Component は Vitest が未対応」としている（`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` 9行）。AC-4a・AC-4b をページ単位で確かめられない |
| 例外の伝わり方（仕様 6.1） | `Page(...)` の Promise が `GitHubApiError` で reject される。`await expect(Page(...)).rejects.toBe(error)` で検証できる | 子の描画時に投げられる。ページ関数の戻り値からは検証できない |
| 後続 0010（読み込み中 AC-16a） | `loading.tsx` を置くとページ全体（フォームを含む）が読み込み中表示に置き換わる。フォームを残して一覧だけを読み込み中にしたい場合は、0010 で案B（`<Suspense>` で包む）へ移す必要がある | `<Suspense>` で一覧だけを包める（`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` 174〜224行「With `<Suspense>`」） |
| 後続 0007（AC-9b `page>34` で API を呼ばない） | ページ関数に条件を1つ足すだけ | 子の中に条件を足す |

- 推奨は案A。仕様 0006 の AC（4a・4b）とエラーの決定（6.1）をページ単位で自動テストでき、0005 で実績のあるテスト方法をそのまま使えることが決め手。案Bの利点（一覧だけのストリーミング）は 0010 の範囲で、0006 の要件ではない。0010 の計画で `<Suspense>` に移すかを判断する（申し送り。5節）。
- ページは「`searchParams` の解釈 → 取得 → 表示部品へ渡す」だけで、`.claude/rules/10-nextjs.md` の「`page.tsx` はデータ取得と表示の組み立てのみ」に沿う。
- `perPage: SEARCH_PER_PAGE` を明示する理由: 0003 の既定値 30 と 0004 の `SEARCH_PER_PAGE`（30）は別々に定義されている（0004 計画の提案 P1）。0007 は最大ページ数を `SEARCH_PER_PAGE` で計算するため、取得側も同じ定数を渡しておくと値の食い違いが起きない。仕様に明記は無いので Q5 で確認する。
- `searchParams` は Promise で、await するとページは動的レンダリングになる（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` 67〜121行、型は 123〜140行の `PageProps`）。0005 の時点ですでに動的なので、0006 で変わる点は無い。

**(b) `searchRepositories` のモック方針と `server-only`**

- 仕様 5節の指示どおり `searchRepositories` をモックする。GitHub API（ネットワーク）の手前にある公開関数で、テストのプロセスから見た外部境界の入口にあたる。
- `app/page.test.tsx` で `vi.mock("@/lib/github", () => ({ searchRepositories }))` と**ファクトリで丸ごと差し替え**、`importOriginal` は使わない。こうすると本物の `lib/github/index.ts` → `client.ts` が読み込まれないので、`import "server-only"` も評価されず、**`vi.mock("server-only", …)` は不要**になる。
  - 0003 の前例（`client.test.ts` `http.test.ts` `token-leak.test.ts` の `vi.mock("server-only", () => ({}))`）は、本物の `lib/github` を読み込んで `fetch` だけをモックするテストのためのもの。0003 計画 4節も「0006・0008 で Server Component のテストが `lib/github` を読み込む場合は `vi.mock("server-only")` を書くか、`getRepository` 自体をモックする」としており、本計画は後者にあたる。
  - `importOriginal` で本物を混ぜると `server-only` が評価されて例外になる（`lib/github/server-only.test.ts` が検査しているとおり）。混ぜない。
- モックの型: `const { searchRepositories } = vi.hoisted(() => ({ searchRepositories: vi.fn<(params: SearchRepositoriesParams) => Promise<SearchRepositoriesResult>>() }))`。型は `import type` で `@/lib/github` から取る（型だけなので実行時に読み込まれない）。`any` と `as` は使わない。
- `beforeEach` で `searchRepositories.mockReset()` の後、既定値として `mockResolvedValue({ totalCount: 0, items: [] })` を入れる。**既存の `app/page.test.tsx` の `AC-22c: URL が /?q=react&page=3 …` は `q` があるので、モックが無いと実 API（`fetch`）を呼びに行く**。既定値を入れることで既存テストの検証内容を変えずに通す。
- エラーのテストで使う `GitHubApiError` は `@/lib/github/errors` から import する（`errors.ts` は `server-only` を読み込まない。`docs/architecture.md` 5節）。`@/lib/github` からの import はモック後のモジュールになるため使わない。
- `SearchResults` のテスト（`search-results.test.tsx`）は props を渡すだけなのでモック不要。`lib/github` は型しか参照しない。
- 0005 と同じく `next/navigation` の `useRouter` のモックは `app/page.test.tsx` に残す（`SearchForm` が使う）。

**(c) `next/image` と `remotePatterns`**

- 根拠: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
  - 71行: 外部の絶対 URL を `src` にするには `remotePatterns` の設定が必要。
  - 100〜113行: `width` と `height` は固有サイズ（縦横比の算出用）で、表示サイズは CSS で決まる。静的 import か `fill` でない限り両方必須。
  - 199〜229行: `sizes` は `fill` または CSS で幅が変わる画像に使う。付けないと 1x/2x の限定的な `srcset` になり「固定サイズの画像に適する」。→ アイコンは 40px 固定なので `sizes` を付けない。
  - 90〜96行: `alt` は画像の代わりになる文字列。
  - 533〜589行: `remotePatterns` はオブジェクト形式で `protocol` `hostname` `port` `pathname` `search` を指定でき、**省略した項目は `**`（何でも可）とみなされ推奨されない**。`search: ''` はクエリ文字列なしだけを許可する。
  - 591〜609行: `search` に完全一致の値を指定できる。
- GitHub の `avatar_url` は `https://avatars.githubusercontent.com/u/<id>?v=4` の形（0003 の `mappers.test.ts` のフィクスチャも同じ形）。`search: ''` にすると `?v=4` が付いた URL が 400 になるので使えない。推奨は `pathname: "/u/**"`、`search: "?v=4"` の完全一致（Q2）。
- 型: `NextConfig["images"]["remotePatterns"]` は `Array<URL | RemotePattern>`、`RemotePattern` は `protocol?: 'http' | 'https'`、`hostname: string`、`port?` `pathname?` `search?: string`（`node_modules/next/dist/shared/lib/image-config.d.ts` 24〜50行・94行）。既存の `const nextConfig: NextConfig = { … }` の型注釈があるので、オブジェクトリテラルの `protocol: "https"` はリテラル型のまま通る（`as const` は不要）。
- テスト環境での `next/image`: 既定のローダー（`node_modules/next/dist/shared/lib/image-loader.js` 96〜107行）は `NODE_ENV === "test"` のとき `remotePatterns` との照合を飛ばし、`src` を `/_next/image?url=<符号化した元 URL>&w=…&q=75` に変換するだけ。Vitest は `next.config.ts` を読まない。したがって**コンポーネントのテストでは `remotePatterns` の設定は検証できない**。設定は T1 の専用テストと、T5 の `next build` → `next start` での実地確認で担保する。
- クライアントの JS について: `next/image`（`next/dist/client/image-component.js` 1行目が `'use client'`）と `next/link` はフレームワーク内蔵の Client Component で、利用者が使うと JS が配信される。`next/image` の採用は人間の決定（仕様 9節）で、`next/link` はルールの規約。一覧そのものに `"use client"` を足さないことで「クライアントの JS を増やさない」を満たすと解釈する。

**(d) アイコンの代替テキストとリンクのアクセシブルネーム**

- アイコンを**リンクの中**に入れると、リンクのアクセシブルネームは画像の `alt` と文字の連結（例: 「vercel vercel/next.js」）になり、読み上げが冗長になる。`alt=""` にすれば解消するが、仕様 AC-6a（代替テキストはオーナー名）に反する。
- 推奨は**アイコンをリンクの外**（同じ `li` の中で、リンクの前）に置く。リンク名は表示名 `vercel/next.js` と一致し（AC-10・仕様 6.1「各行は1つのリンク（`owner/repo` が表示名）」）、アイコンは独立した画像として `alt="vercel"` を持つ（AC-6a）。1行に1つのリンクという仕様も満たす。
- 代償としてクリックできる範囲が文字部分だけになる。行全体を押せるようにするのは見た目の調整で、0011（AC-26b・AC-27）の範囲とする（提案 P3）。
- テストではリンクを `getByRole("link", { name: "vercel/next.js" })` の**完全一致**で取る。アイコンを誤ってリンクの中に入れると名前が変わって失敗するので、退行を検出できる。

**(e) 詳細パスの組み立て（`fullName` からの owner / repo の取り出し）**

- `RepoSummary` は `fullName`（`owner/repo`）と `ownerLogin` を持つが、repo 部分だけの値は無い（0003 計画の提案 P1 が `name` の追加を挙げたが未採用）。
- 推奨: `features/search/lib/repo-path.ts` に純粋関数 `repoPathFromFullName(fullName: string): string` を置く。最初の `/` で分割し、`buildRepoPath(owner, repo)` を返す。GitHub の owner と repo の名前には `/` が入らないので、最初の `/` で分ければ一意に決まる。0009 で検索条件を持ち回るときも、この関数（の呼び出し側）を変えればよい。
- `/` を含まない、または前後が空の `fullName` は GitHub の仕様上あり得ないが、0003 の変換層は形式までは検証していない。その場合の扱いは仕様に無いので Q1 で確認する。推奨は `GitHubApiError("UPSTREAM")` を投げる（0003 の `mappers.ts` の「想定外の形は UPSTREAM」と同じ方針。仕様 6.1 により標準のエラー画面になる）。`GitHubApiError` は `@/lib/github/errors` から import する（`server-only` を含まない）。

**(f) 非同期の Server Component（ページ）のテスト**

- 0005 の `app/page.test.tsx` の `renderPage`（`render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve(…) }))`）をそのまま使う。案A ではページの子（`SearchForm` `SearchResults`）がすべて同期なので描画できる。
- `SearchResults` の中の `next/image` と `next/link` は jsdom で描画できる見込み。Vitest では `next/link` は `next/dist/client/link.js`（Pages Router 版）に解決され、ルーターが無くても `<a href>` を描画する（`RouterContext` が `null` のときはプリフェッチを行わない）。`next/image` は `<img alt src srcset>` を描画する。T3 の RED で実際に描画できることを最初に確かめ、できなければ止めて報告する。
- **リンクのクリックはテストしない**: 上記の Pages Router 版の `Link` はクリック時に `router.push` を呼ぶため、ルーターの無い jsdom では例外になる。本番では App Router 版のリンクに解決されるので、jsdom のクリックは本番の挙動を表さない。AC-10 は `href` の完全一致と「通常の `<a>`（`target` なし）であること」「`role="dialog"` が無いこと」で検証し、実際の遷移は T5 の手動確認（と任意の 0013 E2E）で補う。

**(g) `next.config.ts` の変更の影響**

- Vitest は `next.config.ts` を読まない（`vitest.config.mts` は独立）。既存のテストへの影響は無い。
- `tsc --noEmit` は `tsconfig.json` の `include: ["**/*.ts", …]` で `next.config.ts` も型検査する。型注釈 `NextConfig` のもとで書くので、誤ったキーや型は `pnpm typecheck` で検出される。
- `next build` は設定を検証する。T1 で `pnpm build` を実行して確認する。開発サーバーは設定の変更後に再起動が必要（T5 の手動確認の手順に書く）。
- 既存の `tests/foundation/*.test.ts` は `next.config.ts` を参照していない（Grep で確認済み）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 変更 | `next.config.ts` | `images.remotePatterns` に `avatars.githubusercontent.com` だけを許可 |
| 新規 | `tests/foundation/next-config.test.ts` | `remotePatterns` の設定の検査（T1） |
| 新規 | `features/search/lib/repo-path.ts` / `repo-path.test.ts` | `repoPathFromFullName`（T2） |
| 新規 | `features/search/components/search-results.tsx` / `search-results.test.tsx` | `SearchResults`（総ヒット件数・一覧・アイコン・リンク）（T3） |
| 変更 | `app/page.tsx` | `q` があるときに `searchRepositories` を呼び、`SearchResults` を描く（T4） |
| 変更 | `app/page.test.tsx` | `searchRepositories` のモック追加、AC-4a・AC-4b・仕様 6.1 のテスト追加（既存テストの検証内容は維持）（T4） |
| 変更 | `docs/architecture.md` | 3節・5節に一覧と取得の場所、`next/image` の許可ホストを追記（T5） |
| 変更なし | `lib/github/`、`lib/search/`、`features/search/components/search-form.tsx`、`app/layout.tsx`、`package.json`、ロックファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: `next/image` の外部ホストの許可**
  - 対応 AC: AC-6a（アイコンの表示の前提。仕様 9節の決定）
  - 先に書くテスト: `tests/foundation/next-config.test.ts`（`// @vitest-environment node`。`import nextConfig from "@/next.config"`）
    - `AC-6a（仕様9節）: images.remotePatterns は avatars.githubusercontent.com の https・/u/**・?v=4 だけを許可する`（`toEqual` で配列全体を完全一致。他のホストが混ざると失敗する）
    - Q2 で「照合の補強」を採る場合のみ: `AC-6a（仕様9節）: 実際の avatar_url の形は許可され、他のホスト・http・似せたホストは許可されない`（`next/dist/shared/lib/match-remote-pattern` の `hasRemoteMatch([], remotePatterns, new URL(…))` で表形式に検証。`https://avatars.githubusercontent.com/u/14985020?v=4` → true、`http://avatars.githubusercontent.com/u/1?v=4`・`https://avatars.githubusercontent.com.evil.example/u/1?v=4`・`https://evil.example/u/1?v=4`・`https://avatars.githubusercontent.com/u/1?v=5` → false）
  - RED: `next.config.ts` を変更する前に実行し、`images` が `undefined` で不一致になることを確認する。
  - 実装対象: `next.config.ts`、`tests/foundation/next-config.test.ts`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck` PASS、`pnpm build` が成功（設定の検証）、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: 詳細パスの組み立て関数**
  - 対応 AC: AC-10（リンク先の生成）
  - 先に書くテスト: `features/search/lib/repo-path.test.ts`（`// @vitest-environment node`）
    - `AC-10: "vercel/next.js" から /repos/vercel/next.js を作る`（期待値は文字列リテラル）
    - `AC-10: repo 名の "." "-" "_" はそのまま残る`（例: `"a-b/c.d_e"` → `/repos/a-b/c.d_e`。符号化そのものは 0004 で検証済みなので重ねない）
    - Q1 の回答に応じて: `AC-10: "/" を含まない、または owner・repo が空の fullName は GitHubApiError（UPSTREAM）を投げる`（`it.each`: `"vercel"`、`"/next.js"`、`"vercel/"`）
  - RED: 関数を `return ""` だけの仮実装にし、期待値の不一致で失敗することを確認する。
  - 実装対象: `features/search/lib/repo-path.ts`、`features/search/lib/repo-path.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T3: 検索結果一覧コンポーネント**
  - 対応 AC: AC-6a、AC-6b、AC-7、AC-5、AC-10（コンポーネント単位）、仕様 6.1（0件）
  - 先に書くテスト: `features/search/components/search-results.test.tsx`（jsdom。モックなし。フィクスチャは `Array.from({ length: n }, (_, i) => ({ fullName: \`owner${i}/repo${i}\`, ownerLogin: \`owner${i}\`, ownerAvatarUrl: \`https://avatars.githubusercontent.com/u/${i}?v=4\` }))` を作る関数をテストファイル内に置く）
    - `AC-6a: 30件のとき30行が表示され、各行にオーナー名の代替テキストのアイコンと owner/repo のリンクが1つずつある`（`within(getByRole("list")).getAllByRole("listitem")` が 30。各 `li` で `within(li).getByRole("img", { name: \`owner${i}\` })`、`within(li).getAllByRole("link")` が 1 件で名前が `owner${i}/repo${i}` と完全一致）
    - `AC-6a: アイコンの画像の元 URL は ownerAvatarUrl である`（補強。`img` の `src` を `new URL(src, "http://localhost").searchParams.get("url")` で取り出し、`https://avatars.githubusercontent.com/u/0?v=4` と一致。別の項目を `src` に渡す誤りを検出する）
    - `AC-6b: 12件のとき12行が表示される`
    - `AC-7: totalCount が 12345 のとき「総ヒット件数: 12,345 件」と表示される`（`getByText("総ヒット件数: 12,345 件")`）
    - `AC-5: API が返した順（zeta/zz, alpha/aa, mid/mm）のまま表示し、並べ替えない`（名前の並びが辞書順と異なるデータにして、`getAllByRole("link").map(名前)` が `["zeta/zz", "alpha/aa", "mid/mm"]` と一致）
    - `AC-10: vercel/next.js の行のリンク先は /repos/vercel/next.js で、別タブ指定のない通常のリンクである`（`toHaveAttribute("href", "/repos/vercel/next.js")`、`not.toHaveAttribute("target")`、`queryByRole("dialog")` が `null`）
    - `AC-7（仕様6.1）: 0件のとき「総ヒット件数: 0 件」と空の一覧を表示する`（`getByRole("list")` があり、`listitem` が 0 件）
  - RED: `SearchResults` を `<div />` だけを返す仮実装にし、要素が見つからないことで失敗することを確認する（import エラーでの失敗は RED と認めない）。あわせて `next/image` と `next/link` が jsdom で描画できることをこの時点で確かめ、描画できなければ止めて報告する（1.2 (f)）。
  - 実装対象: `features/search/components/search-results.tsx`、`features/search/components/search-results.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T4: トップページでの取得と一覧の組み込み**
  - 対応 AC: AC-4a、AC-4b、仕様 6.1（例外をそのまま投げる）、0005 AC-1・AC-22c と 0002 AC-21b（既存テストの検証内容を維持）
  - 先に書くテスト: `app/page.test.tsx` に追加（1.2 (b) のモックを追加。描画は既存の `renderPage`）
    - `AC-4a: URL が /?q=react&page=2 のとき q=react・page=2 で1回だけ検索する`（`toHaveBeenCalledTimes(1)`、`toHaveBeenCalledWith({ q: "react", page: 2, perPage: 30 })`。期待値は数値リテラル。Q5 で `perPage` を渡さないと決めた場合は `{ q: "react", page: 2 }`）
    - `AC-4a: 検索結果（総ヒット件数と行）がページに表示される`（モックが `{ totalCount: 12345, items: [vercel/next.js] }` を返す → `getByText("総ヒット件数: 12,345 件")` と `getByRole("link", { name: "vercel/next.js" })`）
    - `AC-4a: page が無いときは page=1 で検索する`（`{ q: "react" }` → `page: 1`。補正自体は 0004 で検証済みなので1件だけ）
    - `it.each` 表: `AC-4b: URL が $label のとき検索 API を呼ばず、検索フォームだけを表示する`（`{}`、`{ q: "" }`、`{ q: "   " }`、`{ page: "2" }`）
      - 検証: `searchRepositories` が呼ばれない。`getByRole("searchbox", { name: "キーワード" })` がある。`queryByRole("list")` が `null`。`queryByText(/総ヒット件数/)` が `null`
    - `AC-4a（仕様6.1）: 検索 API が GitHubApiError で失敗したとき、握りつぶさずにそのまま投げる`（`mockRejectedValue(error)` → `await expect(Page({ … })).rejects.toBe(error)`。同じインスタンスであることで、包み直していないことを確かめる）
    - 既存の 5 件（AC-21b、AC-1、AC-22c×3）は検証内容を変えない。`beforeEach` のモック既定値（`{ totalCount: 0, items: [] }`）により、`q=react` のテストも実 API を呼ばずに通る。
  - RED: `app/page.tsx` を変更する前に実行し、AC-4a が「モックが呼ばれない／要素が無い」、仕様 6.1 のテストが「reject されない」で失敗し、AC-4b と既存 5 件が通ることを確認する（AC-4b は変更前から満たされている振る舞いなので、変更後に退行しないことの固定として扱う。検出力は、一時的に `q` の有無を見ずに呼ぶ実装にして AC-4b が失敗することで確かめ、戻す）。
  - 実装対象: `app/page.tsx`、`app/page.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`pnpm typecheck` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T5: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節の `features/search/` に「検索結果一覧（`components/search-results.tsx`）。取得は `app/page.tsx` が `searchRepositories` で行い、結果を渡す」、5節に「一覧は Server Component（`"use client"` なし）」「`next/image` の外部ホストは `avatars.githubusercontent.com` の `/u/**?v=4` のみ（`next.config.ts`）」を追記）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - 手動確認（`pnpm build` → `pnpm start`。`.env.local` の `GITHUB_TOKEN` は人間が設定済みの前提。PR に結果を書く）:
      - `/?q=react&page=2` を直接開くと、総ヒット件数と 30 行、アイコンが表示される（画像が 400 にならない＝ `remotePatterns` が実際の `avatar_url` と一致する）。
      - `/_next/image?url=<許可外ホストの URL を符号化>&w=48&q=75` が 400 になる。
      - 行のリンクを押すと `/repos/<owner>/<repo>` へ遷移する（0008 が未実装なら 404 になるが、URL が正しいことを確認する）。モーダルは開かない。
      - `/` ではフォームだけが表示される。
      - 最終ページ（例: 総件数が少ないキーワードの最終ページ）で行数が残り件数になる。
      - `page=35` や 257 文字以上の `q` で Next.js 標準のエラー画面になる（仕様 6.1 のとおり。Q4）。
      - 幅 320px 程度で一覧が横にはみ出さない（`owner/repo` が長い場合に `break-all` 等で折り返す）。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: 一覧の前に見出し（例: `<h2>検索結果</h2>`）を置く。0011 の AC-26c（見出しの階層）の点検で役立つ。文言が仕様に無いので入れない。
- P2: 総ヒット件数を `role="status"` にし、検索のたびに支援技術へ伝える。0011 の AC-26d の範囲。
- P3: 行全体をクリックできるようにする（リンクの擬似要素で `li` 全体を覆う等）。見た目と操作性の調整で、0011 の AC-26b・AC-27 の範囲。
- P4: 0003 の `RepoSummary` に `name`（repo 部分）を足し、変換層で `full_name === owner.login + "/" + name` を検証する（0003 計画の提案 P1）。採ると T2 の分割関数が不要になるが、0003 の仕様（7節の型）の変更になる。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 設定 | `next.config.ts` の `images.remotePatterns` | `tests/foundation/next-config.test.ts` | node | なし |
| 単体 | `repoPathFromFullName` | `features/search/lib/repo-path.test.ts` | node | なし |
| コンポーネント | `SearchResults`（件数・行・アイコン・リンク・順序・0件） | `features/search/components/search-results.test.tsx` | jsdom | なし（props を渡すだけ） |
| 結合（ページ） | `app/page.tsx`（`searchParams` の解釈 → 取得 → 一覧、未入力時、例外） | `app/page.test.tsx` | jsdom | `@/lib/github` の `searchRepositories`（ファクトリで丸ごと差し替え）、`next/navigation` の `useRouter` |
| 手動 | 画像の最適化（`remotePatterns`）、リンクの遷移、狭い画面 | T5 | `next start` | なし（実 API） |
| E2E | なし（0013 で任意） | — | — | — |

- 要素の取得は role / label / text。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める（仕様 6.1 の決定に対応するテストは `AC-x（仕様6.1）` と書く）。`vitest` の API は明示 import する。
- 期待値は文字列・数値のリテラルで書く（`/repos/vercel/next.js`、`12,345`、`{ q: "react", page: 2, perPage: 30 }`）。`buildRepoPath` や `formatNumber` を期待値の計算に使わない。
- AC-4b の「API 未呼び出し」は、`searchRepositories` のモックが `not.toHaveBeenCalled()` であることで検証する。`lib/github` 以外から GitHub API を呼ぶ経路は無い（`docs/architecture.md` 3節「GitHub API は `lib/github/` だけが呼ぶ」）ので、この関数の未呼び出しで API 未呼び出しを表せる。
- AC-5 は辞書順と異なる並びのデータを使い、実装が誤って並べ替えた場合に必ず失敗するようにする。
- AC-6b は「API が 12 件を返した」状態を表すため、コンポーネントに 12 件を渡して検証する（最終ページかどうかは一覧の描画に影響しないため、ページ単位の重複テストは置かない）。
- AC-10 の「遷移」は `href` の完全一致で検証し、クリックは行わない（1.2 (f)）。実際の遷移は T5 の手動確認。
- 0004 の関数（`parseSearchParams` `buildRepoPath` `formatNumber`）と `repoPathFromFullName` はモックしない（自分たちのモジュール同士をモックしない）。
- テスト間で状態を共有しない。`searchRepositories` と `push` は `beforeEach` でリセットする。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-4a | `/?q=react&page=2` で `q=react`・`page=2` の検索と表示 | `app/page.test.tsx` | T4 |
| AC-4b | `q` なしでは API を呼ばずフォームのみ | `app/page.test.tsx` | T4 |
| AC-6a | 30件で30行、各行にアイコン（alt=オーナー名）と `owner/repo` | `search-results.test.tsx`、`next-config.test.ts`（表示の前提） | T1、T3 |
| AC-6b | 残り12件で12行 | `search-results.test.tsx` | T3 |
| AC-7 | `12,345` の表示 | `search-results.test.tsx`、`app/page.test.tsx` | T3、T4 |
| AC-10 | `/repos/vercel/next.js` へのリンク、モーダルなし | `repo-path.test.ts`、`search-results.test.tsx` | T2、T3 |
| AC-5 | API の順のまま表示 | `search-results.test.tsx` | T3 |
| （仕様 6.1） | 例外をそのまま投げる／0件は件数0と空の一覧 | `app/page.test.tsx`、`search-results.test.tsx` | T3、T4 |
| （0002 AC-21b、0005 AC-1・AC-22c） | 既存テストの検証内容を維持 | `app/page.test.tsx` | T4 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| `app/page.test.tsx` で `searchRepositories` をモックし忘れる | `q` ありの既存テストが実 API を呼ぶ（遅い・不安定・レート制限、トークンがあれば送信される） | ファクトリで丸ごと差し替え、`beforeEach` で既定値を入れる（1.2 (b)）。`importOriginal` を使わない |
| `importOriginal` 等で本物の `lib/github` を読み込む | `server-only` が評価され、テストが import 時に失敗する | ファクトリのみで差し替える。`GitHubApiError` は `@/lib/github/errors` から import する |
| `remotePatterns` が実際の `avatar_url` と一致しない（`search` の指定違いなど） | 本番で全アイコンが 400（代替テキストだけが出る）。テストでは検出できない（テスト時は照合が飛ばされる） | T1 で設定を完全一致で固定し、T5 で `next start` の実地確認を必須にする。GitHub が `?v=4` を変えた場合に壊れる点は Q2 で人間が判断する |
| `remotePatterns` が緩すぎる（`search`・`pathname` の省略、ワイルドカードのホスト） | 画像最適化 API を第三者に悪用される（`image.md` 589行の注意） | ホストは完全一致、`protocol`・`port`・`pathname`・`search` をすべて指定する。T1 のテストで他のホストの混入を検出する |
| アイコンをリンクの中に入れる | リンク名が「vercel vercel/next.js」になり読み上げが冗長。AC-10 のリンク名の検証が崩れる | アイコンをリンクの外に置く（1.2 (d)）。リンク名を完全一致でテストする |
| `next/image` / `next/link` が jsdom で描画できない | T3・T4 のテストが書けない | T3 の RED の最初に確認し、できなければ止めて報告する。リンクのクリックは jsdom で行わない（1.2 (f)） |
| 案A のため 0010 で `loading.tsx` を置くとフォームごと読み込み中表示になる | 0010 で手戻り（`<Suspense>` への切り出し） | 0010 の計画への申し送りとして進捗メモに残す。切り出す場合は一覧のテストは props のまま使え、ページのテストの方法を見直す必要がある |
| 一覧に `"use client"` を付ける、またはページを Client Component にする | クライアントの JS が増え、`lib/github`（`server-only`）を読み込めずビルド失敗 | `SearchResults` はフック・イベントを持たない Server Component にする。レビューで `"use client"` の追加が無いことを確認する |
| `page>34` や 257 文字以上の `q` で標準のエラー画面になる | 利用者には分かりにくい | 仕様 6.1 の決定どおり（範囲外ページは 0007、エラー表示は 0010）。257 文字以上の扱いは Q4 で確認 |
| `fullName` が `owner/repo` の形でない | 誤ったリンク先 | GitHub の仕様上は起きない。起きた場合の扱いを Q1 で決め、T2 でテストする |
| 長い `owner/repo` が狭い画面ではみ出す | 0011 の AC-27 で手戻り | リンクに `break-all`（または `min-w-0` と折り返し）を付け、T5 で 320px 程度を目視する |
| トークンや内部情報が画面に出る | 情報漏えい | 例外は Next.js 標準のエラー画面に任せ、本番ではメッセージが隠される。`GitHubApiError` のメッセージは固定文言でトークンを含まない（0003）。専用表示の点検は 0010 の AC-19c |

## 6. ADR が必要な論点

- なし。`next/image` の採用と許可ホストは仕様 9節で人間が決定済みで、設定の詳細（`pathname`・`search`）は本計画と `next.config.ts` に残せば足りる。
- 取得の場所（案A）はこの機能内の実装判断で、0010 で見直す可能性があるため計画に記録するにとどめる。0010 で `<Suspense>` による構成へ変える場合も、その計画で記録すれば足りる。

## 7. 要確認事項

- [x] Q1: `fullName` が `owner/repo` の形でない（`/` が無い、owner か repo が空）ときの扱い。推奨は `GitHubApiError("UPSTREAM")` を投げる（0003 の「想定外の形は UPSTREAM」と同じ。仕様 6.1 によりエラー画面）。別案は (b) 何もせず分割結果をそのまま `buildRepoPath` に渡す（アプリ内の誤ったパスになるだけで外部には出ない）、(c) 提案 P4 で 0003 の型に `name` を足す（0003 の仕様変更）。仕様に無い振る舞いのため、(a) を採る場合は仕様 0006 の 6.1 に一文追記してから T2 に入る。
- [x] Q2: `remotePatterns` の `pathname` と `search`。推奨は `pathname: "/u/**"`、`search: "?v=4"`（現在の API の `avatar_url` と完全一致。公式文書の推奨どおり省略しない）。GitHub が `v` の値や形を変えるとアイコンが表示されなくなる。別案は `search` を省略（任意のクエリを許可。文書は非推奨）。あわせて、T1 で Next.js 内部の `next/dist/shared/lib/match-remote-pattern` の `hasRemoteMatch` を使った照合の補強テストを置くか（公開 API ではないため版上げで壊れる可能性があるが、壊れればテストが失敗して気付ける）。推奨は置く。
- [x] Q3: アイコンをリンクの外に置いてよいか（1.2 (d)）。リンク名が `owner/repo` と一致し、アイコンの代替テキスト（オーナー名）と重複しない。代償として押せる範囲が文字部分だけになる（提案 P3 で 0011 に送る）。
- [x] Q4: 257 文字以上の `q`。`parseSearchParams` は長さを制限せず、`searchRepositories` が `VALIDATION` を投げるため、標準のエラー画面になる。推奨は仕様 6.1 の決定のまま扱い（0006 では何もしない）、0010 の計画で `VALIDATION` の表示として扱う。0005 の進捗メモの申し送り（「256 文字超の扱いを一貫させる」）への回答として記録する。
- [x] Q5: `searchRepositories` に `perPage: SEARCH_PER_PAGE` を明示的に渡してよいか。推奨は渡す（0007 の最大ページ数の計算と同じ定数を使い、0003 の既定値と食い違わないようにする。値は同じ 30 なので振る舞いは変わらない）。渡さない場合は AC-4a の期待値を `{ q: "react", page: 2 }` にする。
- [x] Q6: 提案 P1〜P4 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1〜Q3）を得てから T1 に入る。Q1 で (a) を採る場合は先に仕様 0006 の 6.1 に追記する。
- 申し送り（後続の計画で確認する）:
  - 0007: AC-9b（`page>34` で API を呼ばない）は `app/page.tsx` の取得条件に追加する。最大ページ数は `SEARCH_PER_PAGE` と `calculateMaxPage` で計算し、本計画で渡す `perPage` と一致させる。ページネーションは `SearchResults` の下に置く想定。
  - 0009: 行のリンク先は `repoPathFromFullName` で作っている。検索条件の持ち回りを足すときは、`SearchResults` に `q`・`page` を渡すか、リンク先の生成関数を拡張する（方法は 0009 の計画で決める）。
  - 0010: 0件の専用表示（AC-17）は検索キーワードを使うため、`SearchResults` に `q` を渡すか、ページ側で分岐する。読み込み中（AC-16a）で一覧だけをストリーミングする場合は、取得を非同期の Server Component に切り出して `<Suspense>` で包む（本計画 1.2 (a) の案B）。その場合ページのテスト方法を見直す。
  - 0011: キャッシュ（AC-29）は `lib/github/http.ts` の `fetch` の設定で扱う（本計画では触らない）。見出し・`role="status"`・行全体のクリック範囲は提案 P1〜P3。
- 2026-10-08: 人間が推奨どおりで承認（Status: in-progress）。決定事項: Q1 `fullName` に `/` が無ければ `GitHubApiError("UPSTREAM")`（仕様 6.1 に追記済み）／Q2 `remotePatterns` は `{ protocol: "https", hostname: "avatars.githubusercontent.com", port: "", pathname: "/u/**", search: "?v=4" }` とし、`hasRemoteMatch` による照合テストも足す／Q3 アイコンはリンクの外／Q4 257 文字以上の `q` は 0006 では扱わない（0010）／Q5 `perPage: SEARCH_PER_PAGE` を明示／Q6 提案 P1〜P4 は採らない。`/issue split` はせず 1 PR で進める。
- 2026-10-08: T4 の検出力確認。`app/page.tsx` の `q === null` の判定を常に偽にして `q` の有無を見ずに検索すると、AC-4b の 4 件がすべて失敗した（復元済み）。最初の変異は実装の形（`q === null ? null : await …`）と文字列が合わず当たっていなかったため、やり直した。
