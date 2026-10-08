# 0009: トップへの戻り導線 実装計画

Status: in-progress                    <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #9
- 対応する仕様: docs/specs/0009-back-navigation.md
- ブランチ: feat/9-back-navigation
- 作成日: 2026-10-08

## 1. 方針

- 検索条件（`q` `page`）は**詳細ページの URL のクエリ**で持ち回る（仕様 9節で決定済み）。保存（Cookie・ストレージ・Referer）はしない。
- URL の組み立てと戻り先の決定は、`lib/search/` の**純粋関数**に寄せる。0004 の `parseSearchParams`（検証・正規化・`page` の補正・配列の先頭値）、`buildSearchPath`（`/?` 固定の接頭辞 + `URLSearchParams`）、`buildRepoPath`（セグメントごとの `encodeURIComponent`）を再利用し、検証・符号化を新たに書かない。
- 新しい純粋関数は 2 つ（名前と置き場所は Q3）。
  - `buildRepoPathWithSearch(owner, repo, { q, page })`（`lib/search/paths.ts`）: `/repos/<owner>/<repo>?q=<q>&page=<page>`。パス部は `buildRepoPath`、クエリ部は `buildSearchPath` と共通の内部ヘルパ（`URLSearchParams`、キー順 `q` → `page`）で作る。
  - `buildBackPath(params: SearchParamsInput)`（`lib/search/back-path.ts`）: `parseSearchParams(params)` の結果で、`q === null` または `q.length > SEARCH_KEYWORD_MAX_LENGTH` なら `"/"`、それ以外は `buildSearchPath(q, page)`。受け取った文字列をそのまま `href` に使う経路を作らない（仕様 8節）。
- キーワードの上限 256 は `lib/search/constants.ts` に `SEARCH_KEYWORD_MAX_LENGTH` として置く。`lib/github/client.ts` の内部定数 `MAX_Q_LENGTH` は**触らない**（一本化は Issue #20 / 0018 の範囲。Q8）。
- 一覧側: `renderSearchContent`（`features/search/components/search-content.tsx`）はすでに検証・正規化済みの `q` `page` を受け取っているので、そのまま `SearchResults` に `q` `page` を渡す。`app/page.tsx` は**変更しない**（Q1）。`SearchResults` は行ごとに `repoPathFromFullName(item.fullName, { q, page })` で `href` を作る。
- 詳細側: `app/repos/[owner]/[repo]/page.tsx` で `searchParams` を await し、`buildBackPath` で戻り先を計算して `RepoDetailView` の `backHref` に渡す（0008 計画の申し送り）。`getRepository(owner, repo)` の呼び出しは変えない（AC-15f）。
- 範囲外として**変更しないもの**: `app/repos/[owner]/[repo]/not-found.tsx` の `トップへ戻る`（`/` 固定。404 は `searchParams` を受け取れない）、API エラー表示（`ApiErrorView`。現状 `トップへ戻る` は持たない。Q7）、`getRepository`、ページネーションのリンク（0007 計画の申し送りどおり持ち回り情報を付けない）、`app/page.tsx` の `<Suspense key>`、ブラウザの戻るボタン。
- 依存パッケージは追加しない。UI の見た目は変えない（リンクの `href` だけが変わる）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| 定数 | `lib/search/constants.ts` に `export const SEARCH_KEYWORD_MAX_LENGTH = 256;`。コメントで「`lib/github/client.ts` の `MAX_Q_LENGTH` と同じ値。一本化は Issue #20（0018）」と理由を書く |
| 詳細 URL の生成 | `lib/search/paths.ts` に `export function buildRepoPathWithSearch(owner: string, repo: string, search: { q: string; page: number }): string`。`` `${buildRepoPath(owner, repo)}?${searchQueryString(search.q, search.page)}` ``。`searchQueryString` は非公開の内部ヘルパ（`new URLSearchParams([["q", q], ["page", String(page)]]).toString()`）で、`buildSearchPath` も `"/?" + searchQueryString(q, page)` に置き換える（振る舞いは不変。既存の AC-25i のテストで守る） |
| 戻り先の決定 | `lib/search/back-path.ts` に `export function buildBackPath(params: SearchParamsInput): string`。`const { q, page } = parseSearchParams(params); if (q === null \|\| q.length > SEARCH_KEYWORD_MAX_LENGTH) return "/"; return buildSearchPath(q, page);`。長さは**正規化後**の `q` の `.length`（UTF-16 のコード単位。`client.ts` と同じ数え方。Q6） |
| 行リンク | `features/search/lib/repo-path.ts` の `repoPathFromFullName(fullName: string, search: { q: string; page: number }): string`（第 2 引数は必須）。分割と `UPSTREAM` の判定は今のまま、最後を `buildRepoPathWithSearch(owner, repo, search)` に変える |
| `SearchResults` の props | `{ totalCount: number; items: readonly RepoSummary[]; q: string; page: number }`（`q` `page` は必須。省略時の分岐を作らない） |
| 一覧への受け渡し | `search-content.tsx` の `<SearchResults totalCount={…} items={…} q={q} page={page} />`。`q` `page` は `app/page.tsx` で `parseSearchParams` 済みの値 |
| `RepoDetailView` の props | `{ repo: RepoDetail; backHref: string }`。`<Link href={backHref}>トップへ戻る</Link>`。部品の中で検証・組み立てはしない（呼び出し側は `buildBackPath` の戻り値だけを渡す） |
| 詳細ページ | `export default async function RepoDetailPage({ params, searchParams }: PageProps<"/repos/[owner]/[repo]">)`。`const { owner, repo } = await params;` の後、取得成功時に `const backHref = buildBackPath(await searchParams);` を計算して `<RepoDetailView repo={detail} backHref={backHref} />`。`getRepository(owner, repo)`・`try/catch`・`notFound()`・`ApiErrorView` は今のまま |

### 1.2 設計判断と根拠

**(a) Next.js の `searchParams`（`node_modules/next/dist/docs/01-app` で確認済み。Next.js 16.3.8）**

- ページの `searchParams` は Promise で、`async/await` か `use` で読む（`03-api-reference/03-file-conventions/page.md` 67〜79行・117行）。値は `URLSearchParams` ではなく素のオブジェクトで、同じキーが複数あると配列になる（同 111〜115行・121行。`/shop?a=1&a=2` → `{ a: ['1', '2'] }`）。→ 0004 の `SearchParamsInput`（`string | string[] | undefined`）と `parseSearchParams` の「配列は先頭の値」がそのまま使える（AC-15c の `q=react&q=vue`）。
- `PageProps<'/blog/[slug]'>` で `params` と `searchParams` の両方が型付けされる（同 123〜140行）。このプロジェクトの生成済みの型でも `searchParams: Promise<Record<string, string | string[] | undefined>>`（`.next/types/routes.d.ts` 40行）で、`SearchParamsInput`（`Readonly<Record<…>>`）に代入できる。
- `searchParams` を使うとページは動的レンダリングになる（同 119行）。詳細ページは `generateStaticParams` の無い動的ルートで、`getRepository` もリクエスト時に呼んでいるため、描画方式は変わらない見込み（T5 の `pnpm build` の出力で確かめる）。
- 既存のページのテストはすでに `searchParams: Promise.resolve({})` を渡している（`app/repos/[owner]/[repo]/page.test.tsx` 54〜57行）。テストの `callPage` に第 2 引数 `searchParams` を足すだけで済む。

**(b) 戻り先を「パースして作り直す」（オープンリダイレクト対策）**

- 戻り先は常に `"/"` か `buildSearchPath(q, page)` のどちらか。後者は固定の `"/?"` に `URLSearchParams` で符号化した値を付けるので、`q` が `https://evil.example/` や `//evil.example` でも値の中に収まり、`//` で始まる URL やスキーム付きの URL にならない（0004 計画 1.2 (i)、AC-25i のテストで固定済み）。
- 受け取った `q` `page` の文字列を `href` に連結する経路を作らない。`RepoDetailView` は渡された `backHref` を描くだけで、組み立ては `buildBackPath` だけが行う。
- `page` を 1〜34 に切り詰める処理は仕様に無いので入れない（`page=99` は `/?q=react&page=99` になり、トップで 0007 の範囲外の案内が出る。リスク表）。

**(c) 行リンクのクエリの作り方（符号化を二重に書かない）**

- パスに値を入れる `buildRepoPath`（`encodeURIComponent`）と、クエリに値を入れる `URLSearchParams` は、符号化の規則が違う（`paths.ts` 冒頭のコメント）。`buildRepoPathWithSearch` は両者を組み合わせるだけにし、`URLSearchParams` の組み立ては `buildSearchPath` と共通の内部ヘルパ 1 か所に置く。
- これで、行リンク（`/repos/vercel/next.js?q=…&page=…`）と戻り先（`/?q=…&page=…`）のクエリ部分は**同じ関数で作られ、同じ表記**になる（空白は `+`、`&` は `%26`）。詳細ページは Next.js が `URLSearchParams` の規則で復号した値（`+` → 空白）を受け取り、`buildSearchPath` で同じ表記に戻す。往復で `日本語 & react` が保たれることを T1・T2・T3・T4 で検証する（AC-15d）。

**(d) 一覧へ `q` `page` を渡す経路（Q1）**

- `app/page.tsx` は `parseSearchParams` の結果を `renderSearchContent({ q, page })` に渡しており（`app/page.tsx` 13・25行）、`renderSearchContent` が `SearchResults` を描いている（`search-content.tsx` 55行）。したがって `SearchResults` に `q` `page` を足し、`renderSearchContent` で渡すだけでよい。`app/page.tsx` は変えない。
- 値は検証・正規化済み（前後の空白除去、`page` の補正）。257 文字以上の `q` は検索 API が `VALIDATION` を投げてエラー表示になり一覧が出ないので、行リンクに長すぎる `q` が付くことはない。
- `SearchResults` の `q` `page` を省略可能にすると、付け忘れが型で検出できず、「付かない場合」の分岐（仕様に無い）が生まれる。必須にする。

**(e) 既存テストの期待値の変更（仕様 0009 による。弱めない。Q2）**

| ファイル / テスト | 変更 | 理由 |
| --- | --- | --- |
| `features/search/components/search-results.test.tsx` の全 `render` | `q` `page` を渡す（テスト内のヘルパ `renderResults({ totalCount, items, q = "react", page = 1 })` に置き換え）。期待値は変えない | `SearchResults` の props に `q` `page` が必須になるため。表示の検証内容は同じ |
| 同 `AC-10: vercel/next.js の行のリンク先は /repos/vercel/next.js で、別タブ指定のない通常のリンクである` | 名前を `AC-10・AC-15e: …のリンク先のパスは /repos/vercel/next.js で、検索条件のクエリが付き、別タブ指定のない通常のリンクである` に変え、`href` の期待値を `/repos/vercel/next.js?q=react&page=1` にする。加えて `new URL(href, "http://localhost").pathname` が `/repos/vercel/next.js` であることを確かめる（0006 AC-10 の「`/repos/vercel/next.js` のページへ遷移する」を保つ）。`target` なし・`dialog` なしは残す | 0009 AC-15e で行リンクにクエリが付く。0006 AC-10 の Then（遷移先のページ）は変わらないので、仕様 0006 の文言の変更は不要と判断（Q2） |
| `features/search/lib/repo-path.test.ts` の 4 件（AC-10） | 呼び出しに第 2 引数 `{ q: "react", page: 1 }` を足し、期待値の末尾に `?q=react&page=1` を足す（パス部分の期待値 `/repos/vercel/next.js`・`/repos/a-b/c.d_e`・`/repos/a/b%2Fc` は変えない）。`UPSTREAM` を投げる 3 件は第 2 引数を足すだけ | `repoPathFromFullName` の第 2 引数が必須になるため（Q3） |
| `features/repo-detail/components/repo-detail-view.test.tsx` の全 `render` | `backHref` を渡す（ヘルパ `renderView(repo = makeRepo(), backHref = "/")`）。AC-11a〜14b の期待値は変えない | `RepoDetailView` の props に `backHref` が必須になるため |
| 同 `AC-11c: 名前が「トップへ戻る」のリンクの href が / で、モーダル（role=dialog）は無い` | `backHref="/"` を明示して渡し、期待値 `/` は変えない（0008 AC-11c の Given はクエリなしの URL なので、`/` のまま正しい）。部品が `backHref` をそのまま使うことは、新しい AC-15a の部品テスト（`/?q=react&page=3`）で確かめる | 部品は宛先を自分で決めなくなる。ページ単位の AC-11c（`page.test.tsx`、クエリなしで `/`）はそのまま残り、AC-15b と同じ条件になる |
| `app/repos/[owner]/[repo]/page.test.tsx` の `callPage` / `renderPage` | 第 2 引数 `searchParams: Record<string, string \| string[] \| undefined> = {}` を足す。既存のテストは引数を変えずに通す | AC-15a〜15d・15f のため |
| `app/page.test.tsx` | 追加のみ（既存の期待値は変えない） | 行リンクの `href` を検証している既存テストは無い |
| `features/search/lib/paths.test.ts`（`buildSearchPath`） | 変えない | 内部ヘルパへの切り出しの退行検知に使う |
| `app/repos/[owner]/[repo]/not-found.test.tsx` | 変えない（`/` のまま） | 仕様 4.2・6.1 |

**(f) 部品とページの役割分担**

- `RepoDetailView` は `backHref` を描くだけ（0008 計画の申し送り「宛先を props で受け取る」）。テストは「渡した値がそのまま `href` になる」ことだけを確かめる。
- 不正値の網羅（仕様 5節の表）は `buildBackPath` の単体テストで `it.each` に直訳する（T2）。ページ単位では「ページが `searchParams` を `buildBackPath` に通している」ことが分かる代表例（正常・不正な `page`・外部 URL 形式の `q`・257 文字・同じキーの複数・クエリなし）に絞る（T4）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 変更 | `lib/search/paths.ts` / `paths.test.ts` | `buildRepoPathWithSearch` を追加。クエリ部の内部ヘルパを `buildSearchPath` と共有（T1） |
| 変更 | `lib/search/constants.ts` | `SEARCH_KEYWORD_MAX_LENGTH = 256` を追加（T2） |
| 新規 | `lib/search/back-path.ts` / `back-path.test.ts` | `buildBackPath`（T2） |
| 変更 | `features/search/lib/repo-path.ts` / `repo-path.test.ts` | 第 2 引数 `{ q, page }` を追加（T3） |
| 変更 | `features/search/components/search-results.tsx` / `search-results.test.tsx` | props に `q` `page`、行リンクにクエリ（T3） |
| 変更 | `features/search/components/search-content.tsx` | `SearchResults` に `q` `page` を渡す（T3） |
| 変更 | `app/page.test.tsx` | 行リンクの `href`（ページ単位）と `日本語 & react` の入力欄の初期値のテストを追加（T3） |
| 変更 | `features/repo-detail/components/repo-detail-view.tsx` / `repo-detail-view.test.tsx` | props に `backHref`（T4） |
| 変更 | `app/repos/[owner]/[repo]/page.tsx` / `page.test.tsx` | `searchParams` を await し、`buildBackPath` の結果を渡す（T4） |
| 変更 | `docs/architecture.md` | 3節・5節に戻り導線の記述（T5） |
| 変更なし | `app/page.tsx`、`app/repos/[owner]/[repo]/not-found.tsx` `loading.tsx`、`app/error.tsx`、`features/state-views/`、`features/search/components/pagination.tsx` `out-of-range-notice.tsx` `search-form.tsx` `empty-results.tsx`、`lib/search/query.ts`、`lib/github/`（`client.ts` の `MAX_Q_LENGTH` を含む）、`next.config.ts`、`package.json`、ロックファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: 検索条件付きの詳細 URL を作る純粋関数**
  - 進捗: RED（27 件中 9 件失敗。仮実装 `""`）→ GREEN（verify --quick PASS、645 件）。変異確認: クエリを素の連結にする／`q` と `page` の順序を入れ替える、の 2 つで検出。
  - 補足: test-writer への依頼文の署名が計画 1.1 と違い（`q, page` を別引数）、RED のテストと仮実装を計画どおり `{ q, page }` のオブジェクトに直してから GREEN に進んだ（期待値は変えていない。呼び出しの形だけ）。
  - 対応 AC: AC-15e（URL の形）、AC-15d（行リンク側の符号化と読み戻し）
  - 先に書くテスト: `lib/search/paths.test.ts`（`// @vitest-environment node` のまま。`describe("buildRepoPathWithSearch")` を追加）
    - `AC-15e: owner vercel・repo next.js・q react・page 3 のとき /repos/vercel/next.js?q=react&page=3 を返す`
    - `AC-15d: q が "日本語 & react"・page 2 のとき /repos/vercel/next.js?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 を返す`（期待値はリテラル）
    - `AC-15d: 生成した URL のクエリを読み戻すと q が "日本語 & react"、page が "2" に戻る`（`new URL(path, "http://localhost").searchParams`）
    - `it.each`（`#tag`、`a?b`、`a/b`、`https://evil.example`、`//evil.example`）: `AC-15e（補強）: q に $label を含んでも、パスは /repos/vercel/next.js のままで、q を読み戻すと元の値に戻る`（`pathname` が `/repos/vercel/next.js`、`origin` が `http://localhost`）
    - `AC-15e（補強）: owner・repo の符号化は buildRepoPath と同じ（owner "a b"・repo "c" → /repos/a%20b/c?q=react&page=1）`
    - 既存の `buildSearchPath`・`buildRepoPath` のテストは変えない（内部ヘルパへの切り出しの退行検知）
  - RED: `buildRepoPathWithSearch` を `""` を返す仮実装で export して実行し、追加分がすべて期待値の不一致で失敗し、既存のテストは通ることを確認する（import エラーでの失敗は RED と認めない）。
  - 実装: 1.1 のとおり。`buildSearchPath` は内部ヘルパを使う形に置き換える（出力は不変）。
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す）: (1) クエリを `` `q=${q}&page=${page}` `` と素の連結にする → `日本語 & react` と `#tag` のケースが失敗、(2) `q` と `page` の順序を入れ替える → AC-15e が失敗。
  - 実装対象: `lib/search/paths.ts`、`lib/search/paths.test.ts`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: 戻り先を決める純粋関数とキーワード上限の定数**
  - 進捗: RED（38 件すべて失敗。仮実装 `""`）→ GREEN（verify --quick PASS、683 件）。変異確認: 長さの判定を外す／`>` を `>=` にする／`q === null` の判定を外す／素の連結にする／`page` を補正しない、の 5 つすべてで検出。定数 `SEARCH_KEYWORD_MAX_LENGTH`（256）は `lib/search/constants.ts` に追加（`lib/github/client.ts` の内部定数との一本化は Issue #20）。
  - 対応 AC: AC-15a、AC-15b、AC-15c（全例）、AC-15d（戻り先側）
  - 先に書くテスト: `lib/search/back-path.test.ts`（`// @vitest-environment node`。入力は Next.js が復号した後の `searchParams` の形（素のオブジェクト）で書く。`%20` 等の URL 上の表記は、復号後の値（`" 3"`、`"　"`）に直して並べる）
    - `AC-15a: { q: "react", page: "3" } のとき /?q=react&page=3 を返す`
    - `AC-15b: クエリなし（{}）のとき / を返す`
    - `it.each`（仕様 5節の表の直訳。期待値はリテラル）: `AC-15c: $label のとき $expected を返す`
      | label | 入力 | 期待値 |
      | --- | --- | --- |
      | `page=abc` | `{ q: "react", page: "abc" }` | `/?q=react&page=1` |
      | `page=0` | `{ q: "react", page: "0" }` | `/?q=react&page=1` |
      | `page=-1` | `{ q: "react", page: "-1" }` | `/?q=react&page=1` |
      | `page=1e3` | `{ q: "react", page: "1e3" }` | `/?q=react&page=1` |
      | `page=%203`（先頭に空白） | `{ q: "react", page: " 3" }` | `/?q=react&page=1` |
      | `page=3abc` | `{ q: "react", page: "3abc" }` | `/?q=react&page=1` |
      | `page=99999999999999999999`（安全な整数でない） | `{ q: "react", page: "99999999999999999999" }` | `/?q=react&page=1` |
      | `q=`（空） | `{ q: "", page: "3" }` | `/` |
      | `q=%20%20`（空白のみ） | `{ q: "  ", page: "3" }` | `/` |
      | `q=%E3%80%80`（全角空白のみ） | `{ q: "　", page: "3" }` | `/` |
      | `page=3` のみ（`q` なし） | `{ page: "3" }` | `/` |
      | `q` が 257 文字 | `{ q: "a".repeat(257), page: "3" }` | `/` |
      | `q=https://evil.example/` | `{ q: "https://evil.example/" }` | `/?q=https%3A%2F%2Fevil.example%2F&page=1` |
      | `q=//evil.example` | `{ q: "//evil.example" }` | `/?q=%2F%2Fevil.example&page=1` |
      | `q=react&q=vue`（同じキーが複数） | `{ q: ["react", "vue"] }` | `/?q=react&page=1` |
    - `it.each`（上の全入力 + AC-15a・15b の入力）: `AC-15c: $label のとき、宛先は "/" で始まり "//" で始まらず、スキーム・ホストを持たない`（`startsWith("/")`、`!startsWith("//")`、`new URL(result, "http://localhost").origin === "http://localhost"`、`!/^[a-z][a-z0-9+.-]*:/i.test(result)`）
    - `AC-15c: q がちょうど 256 文字のときは有効で、/?q=<256文字>&page=1 を返す`（仕様 6.1「256 文字以下」。期待値は `"/?q=" + "a".repeat(256) + "&page=1"`）
    - `AC-15c: 前後の空白を除くと 256 文字になる q（"  " + "a".repeat(256) + "  "）は有効`（正規化後の長さで判定する。Q6 の推奨案で確定した場合のみ。別案で確定したら期待値を `/` にする）
    - `AC-15c（補強）: q の前後の空白は除かれる（{ q: "  react  ", page: "3" } → /?q=react&page=3）`
    - `AC-15d: { q: "日本語 & react", page: "2" } のとき /?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 を返し、読み戻すと q が "日本語 & react" になる`
  - RED: `buildBackPath` を `""` を返す仮実装で export して実行し、全件が期待値の不一致（`"/"` 始まりの検査を含む）で失敗することを確認する。定数は同じコミットで追加する（テストは定数を期待値の計算に使わず、`256`・`257` をリテラルで書く）。
  - 検出力の確認: (1) 長さの判定を外す → 257 文字が失敗、(2) `>` を `>=` にする → 256 文字が失敗、(3) `parseSearchParams` を使わず `params.q` を `String()` で連結（`` `/?q=${q}&page=${page}` ``）→ 外部 URL 形式・配列・`日本語 & react`・`page` 補正が失敗、(4) 正規化前の長さで判定 → 前後空白のケースが失敗。
  - 実装対象: `lib/search/constants.ts`、`lib/search/back-path.ts`、`lib/search/back-path.test.ts`（3 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T3: 一覧の行リンクに検索条件を付ける**
  - 対応 AC: AC-15e（部品・ページ単位）、AC-15d（一覧側・トップの入力欄）
  - 先に書くテスト:
    - `features/search/lib/repo-path.test.ts`: 1.2 (e) の既存 4 件の変更に加え、`AC-15e: 検索条件 { q: "react", page: 3 } を付けると /repos/vercel/next.js?q=react&page=3 になる`
    - `features/search/components/search-results.test.tsx`（1.2 (e) のヘルパに置き換え）:
      - `AC-15e: q=react・page=3 のとき、行（vercel/next.js）のリンクの href が /repos/vercel/next.js?q=react&page=3 である`
      - `AC-15d: q が "日本語 & react"・page 2 のとき、行リンクの href が /repos/vercel/next.js?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 で、クエリを読み戻すと q が "日本語 & react" になる`
      - `AC-15e: 30 行すべてのリンクに同じ q・page が付く`（`makeItems(30)` の各行の `href` の `searchParams` が `q=react`・`page=3`）
      - 1.2 (e) の `AC-10・AC-15e` への名前と期待値の変更
    - `app/page.test.tsx`（`describe("トップページ: 詳細への行リンク（0009）")` を追加）:
      - `AC-15e: /?q=react&page=3（総件数100）のとき、行 vercel/next.js のリンクの href が /repos/vercel/next.js?q=react&page=3 である`
      - `AC-15e（補強）: /?q=%20react%20&page=3 のとき、行リンクには正規化済みの q=react が付く`（`searchParams: { q: " react ", page: "3" }`）
      - `AC-15e（補強）: /?q=react&page=abc のとき、行リンクには補正後の page=1 が付く`
      - `AC-15d: /?q=日本語 & react（page 2、総件数100）のとき、入力欄の初期値が "日本語 & react" で、行リンクの q を読み戻すと "日本語 & react" になる`
  - RED: 実装前に実行し、`href` にクエリが付かない（`/repos/vercel/next.js` のまま）ことによる期待値の不一致で失敗することを確認する。`AC-15d` の「入力欄の初期値」の部分は既存の振る舞い（0005 AC-22c）で最初から満たされるため、同じテストの行リンクの部分で失敗することを確かめる。テストが渡す `q` `page` の props は、この時点では型エラーになる（Vitest は型を見ないので実行はでき、`pnpm typecheck` は GREEN で解消する）。
  - 実装: 1.1 のとおり。`repoPathFromFullName` に第 2 引数、`SearchResults` に `q` `page`、`renderSearchContent` で渡す。
  - 検出力の確認: (1) `renderSearchContent` で `page` の代わりに `1` を渡す → ページ単位の AC-15e が失敗、(2) `SearchResults` で `q` を `encodeURIComponent` せずに連結 → AC-15d が失敗、(3) `renderSearchContent` に生の `searchParams` 由来の値を渡す想定の変異（`q` に前後空白を付ける）→ 正規化の補強テストが失敗。
  - 実装対象: `features/search/lib/repo-path.ts`、`repo-path.test.ts`、`features/search/components/search-results.tsx`、`search-results.test.tsx`、`search-content.tsx`、`app/page.test.tsx`（6 ファイル。目安の 5 を 1 つ超えるが、3 つはテストで、`search-content.tsx` は 1 行の変更。分けると `repoPathFromFullName` の引数の変更でコミット単位の型チェックが通らなくなるため、1 コミットにする）
  - 完了条件: 既存テストは 1.2 (e) の変更以外の期待値を変えずに通る。`pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T4: 詳細ページの「トップへ戻る」に戻り先を渡す**
  - 対応 AC: AC-15a、AC-15b、AC-15c（ページ単位の代表例）、AC-15d（詳細側）、AC-15f
  - 先に書くテスト:
    - `features/repo-detail/components/repo-detail-view.test.tsx`（1.2 (e) のヘルパに置き換え）:
      - `AC-15a（部品）: backHref が /?q=react&page=3 のとき、「トップへ戻る」の href が /?q=react&page=3 である`
      - 1.2 (e) の AC-11c（`backHref="/"` で `/`）
    - `app/repos/[owner]/[repo]/page.test.tsx`（`callPage(params, searchParams = {})`）:
      - `AC-15a: /repos/vercel/next.js?q=react&page=3 のとき「トップへ戻る」の href が /?q=react&page=3 である`
      - `AC-15b: クエリなしで直接開いたとき「トップへ戻る」の href が / である`（既存の AC-11c と同じ条件だが、AC-15b として明示する）
      - `it.each`: `AC-15c: クエリが $label のとき「トップへ戻る」の href が $expected で、"/" で始まり "//" で始まらない`（`{ q: "react", page: "abc" }` → `/?q=react&page=1`、`{ q: "//evil.example" }` → `/?q=%2F%2Fevil.example&page=1`、`{ q: "https://evil.example/" }` → `/?q=https%3A%2F%2Fevil.example%2F&page=1`、`{ q: "a".repeat(257) }` → `/`、`{ q: "　", page: "3" }` → `/`、`{ q: ["react", "vue"] }` → `/?q=react&page=1`）
      - `AC-15d: q が "日本語 & react"・page "2" のとき href が /?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 で、読み戻すと q が "日本語 & react" になる`
      - `AC-15f: 検索条件 q=react&page=3 が付いていても、getRepository は ("vercel", "next.js") だけで1回呼ばれ、見出しと6項目はクエリなしと同じ`（`toHaveBeenCalledTimes(1)`、`toHaveBeenCalledWith("vercel", "next.js")`（引数の数も一致）、見出し `vercel/next.js`、6 項目の対を配列リテラルと完全一致）
      - `AC-15f（補強）: 検索条件が付いていても NOT_FOUND のときは notFound() になる`（`{ q: "react", page: "3" }` + `NOT_FOUND` → `rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })`。404 の表示は `not-found.tsx` のまま）
      - `仕様 6.1（補強）: 検索条件が付いていても API エラーの表示は変わらず、「トップへ戻る」リンクは出ない`（`{ q: "react", page: "3" }` + `UPSTREAM` → `role="alert"` の文言、`queryByRole("link", { name: "トップへ戻る" })` が `null`。Q7 の推奨案で確定した場合）
  - RED: 実装前に実行し、AC-15a・15c（`/` 以外を期待するもの）・15d・部品の AC-15a が `href="/"` のままであることで失敗することを確認する。AC-15b・AC-15f・補強の 2 件は既存の振る舞いで最初から通る（想定どおり。検出力は下の変異で確かめる）。
  - 実装: 1.1 のとおり。`RepoDetailView` に `backHref`、ページで `buildBackPath(await searchParams)`。
  - 検出力の確認: (1) `RepoDetailView` で `backHref` を使わず `/` に戻す → AC-15a（部品・ページ）が失敗、(2) ページで `buildBackPath` を通さず `` `/?q=${sp.q}&page=${sp.page}` `` を渡す → AC-15c・15d が失敗、(3) `getRepository(owner, repo, q)` のように検索条件を渡す → AC-15f が失敗、(4) 取得の前に `searchParams` で分岐して `getRepository` を呼ばない経路を作る → AC-15f が失敗。
  - 実装対象: `features/repo-detail/components/repo-detail-view.tsx`、`repo-detail-view.test.tsx`、`app/repos/[owner]/[repo]/page.tsx`、`page.test.tsx`（4 ファイル）
  - 完了条件: 既存の AC-11a〜14b・AC-12・AC-18a〜20b のテストが期待値を変えずに通る。`pnpm test`・`pnpm typecheck`（`PageProps` の `searchParams` を含む）・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T5: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証。AC-15a〜15e の実地確認）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節: `features/search/` の一覧の行リンクに `q` `page` を付けること（`repoPathFromFullName` → `buildRepoPathWithSearch`）、`features/repo-detail/` の「トップへ戻る」は `backHref` を props で受け取り、`app/repos/[owner]/[repo]/page.tsx` が `searchParams` から `buildBackPath` で計算すること。5節: 「検索条件は詳細ページの URL のクエリで持ち回り、戻り先は `buildBackPath` で作り直す（受け取った文字列をそのまま `href` にしない）。404 の `トップへ戻る` は `/` 固定」「キーワードの上限 256 は `lib/search/constants.ts` と `lib/github/client.ts` に重複。一本化は Issue #20」）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。`pnpm build` の出力で詳細ページが動的（`ƒ`）のままであることを確かめる（1.2 (a)）。
    - 手動確認（Q4 の手順。`pnpm build` → `pnpm start`。認証なしでは検索 API が 1 分 10 回なので回数を抑える。ブラウザが使えない場合は curl で確かめられる範囲を記録し、残りを PR で人間に依頼する）。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける（特にオープンリダイレクトの観点）。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: API エラー表示（`ApiErrorView`）にも、検索条件付きの「トップへ戻る」を置く。現状はリンク自体が無い（Q7）。
- P2: 詳細から戻ったとき、一覧で直前に見ていた行へスクロールを戻す（スクロール位置の復元）。仕様はキーワードとページの復元まで。
- P3: 一覧から詳細へ遷移したときだけ「検索結果に戻る」などの文言に変える。仕様のリンク名は `トップへ戻る` 固定。
- P4（本機能と無関係の気付き）: `app/page.test.tsx` 554行と `app/repos/[owner]/[repo]/page.test.tsx` 205行の `expect(text).not.toMatch(/at .+:d+:d+/)` は、`\d` ではなく文字 `d` に一致する正規表現になっており、stack のフレーム（`at … :12:34`）を検出できない。別 Issue（`fix`）での修正を提案する。本計画では触らない。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体 | `buildRepoPathWithSearch`（形・符号化・読み戻し・パスの固定） | `lib/search/paths.test.ts` | node | なし |
| 単体 | `buildBackPath`（仕様 5節の表の直訳、256/257 の境界、アプリ内パスの性質、往復） | `lib/search/back-path.test.ts` | node | なし |
| 単体 | `repoPathFromFullName`（第 2 引数の付与） | `features/search/lib/repo-path.test.ts` | node | なし |
| コンポーネント | `SearchResults`（行リンクのクエリ） | `features/search/components/search-results.test.tsx` | jsdom | なし |
| コンポーネント | `RepoDetailView`（`backHref` をそのまま描く） | `features/repo-detail/components/repo-detail-view.test.tsx` | jsdom | なし |
| 結合（ページ） | トップ: 行リンクの `href`（正規化・補正済みの値）、`日本語 & react` の入力欄 | `app/page.test.tsx` | jsdom | `@/lib/github` の `searchRepositories`、`useRouter`（既存のまま） |
| 結合（ページ） | 詳細: `searchParams` → 戻り先、`getRepository` の呼び出しが不変、404・エラー表示が不変 | `app/repos/[owner]/[repo]/page.test.tsx` | jsdom | `@/lib/github` の `getRepository`、`next/navigation` は `useRouter` だけ部分的に差し替え（既存のまま。`notFound` は本物） |
| 手動 | 一覧 → 詳細 → 戻るの往復、URL 上の表記（`+`・`%20`・`%E3%80%80`）の復号、外部 URL 形式の `q`、先読み | T5 | `next start` | なし（実 API） |
| E2E | なし（0013 で任意。往復のシナリオは 0013 の候補） | — | — | — |

- 要素の取得は role / label / text。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 期待値は文字列リテラルで書く（`/?q=react&page=3`、`/?q=%2F%2Fevil.example&page=1`、`/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2` など）。`buildSearchPath`・`buildBackPath`・`SEARCH_KEYWORD_MAX_LENGTH` を期待値の計算に使わない（`256`・`257` はリテラル）。
- 往復（AC-15d）は「`href` の文字列の完全一致」と「`URL` / `URLSearchParams` で読み戻した値の一致」の両方で確かめる。前者で表記の誤り、後者で符号化の取り違えを検出する。
- 単体テストの入力は、Next.js が URL を復号した後の `searchParams` の形（素のオブジェクト、重複キーは配列）で書く。URL 上の表記からの復号は Next.js の責務なので、T5 の手動確認で実地に確かめる。
- 自分たちのモジュール同士（`parseSearchParams`、`buildSearchPath`、`buildRepoPath`、`buildBackPath`、`repoPathFromFullName`）はモックしない。モックは既存どおり GitHub API とルーターだけ。
- リンクのクリックはしない（0008 計画 1.2 (c)。`href` の値で検証し、遷移は手動確認で補う）。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-15a | `?q=react&page=3` の詳細で `トップへ戻る` → `/?q=react&page=3` | `back-path.test.ts`、`repo-detail-view.test.tsx`、`app/repos/[owner]/[repo]/page.test.tsx` | T2、T4 |
| AC-15b | クエリなしの詳細で `トップへ戻る` → `/` | `back-path.test.ts`、`app/repos/[owner]/[repo]/page.test.tsx` | T2、T4 |
| AC-15c | 不正値: `page` は 1、`q` が空・空白のみ・257 文字以上は `/`、外部 URL 形式は値として符号化、重複キーは先頭、常にアプリ内パス | `back-path.test.ts`（仕様 5節の表を `it.each` に直訳）、`app/repos/[owner]/[repo]/page.test.tsx`（代表例） | T2、T4 |
| AC-15d | `日本語 & react` の往復（行リンクの符号化 → 詳細で読み戻し → 戻り先 → トップの入力欄） | `paths.test.ts`、`back-path.test.ts`、`search-results.test.tsx`、`app/page.test.tsx`、`app/repos/[owner]/[repo]/page.test.tsx`、手動 | T1、T2、T3、T4、T5 |
| AC-15e | `q=react`・`page=3` の一覧で行リンク → `/repos/vercel/next.js?q=react&page=3` | `paths.test.ts`、`repo-path.test.ts`、`search-results.test.tsx`、`app/page.test.tsx` | T1、T3 |
| AC-15f | 検索条件付きでも `getRepository(owner, repo)` を 1 回、表示は不変 | `app/repos/[owner]/[repo]/page.test.tsx` | T4 |
| 0006 AC-10（期待値の変更） | 行リンクのパスは `/repos/vercel/next.js` のまま、クエリが付く | `search-results.test.tsx`、`repo-path.test.ts` | T3 |
| 0008 AC-11c（不変） | クエリなしの詳細で `トップへ戻る` → `/` | `repo-detail-view.test.tsx`、`app/repos/[owner]/[repo]/page.test.tsx` | T4 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 受け取った `q` `page` を `href` に連結してしまう | オープンリダイレクト（`//evil.example` 等）、`href` の改ざん | 戻り先は `buildBackPath` だけが作り、`"/"` か `buildSearchPath`（固定の `"/?"` + `URLSearchParams`）の 2 通りに限る（1.2 (b)）。T2 で全入力に「`/` で始まり `//` で始まらない・オリジンが変わらない」を検査し、素の連結の変異で失敗することを確かめる。T5 で security-reviewer の点検 |
| クエリの表記（空白の `+`、`&` の `%26`）が行リンクと戻り先で食い違う | `日本語 & react` が往復で壊れる（AC-15d） | クエリ部を `buildSearchPath` と共通の内部ヘルパ 1 か所で作る（1.2 (c)）。文字列の完全一致と読み戻しの両方で検証（T1〜T4）。Next.js の `+` の復号は T5 で実地確認 |
| 上限 256 が `lib/search/constants.ts` と `lib/github/client.ts` に重複し、片方だけ変わる | 検索 API が拒否する `q` を戻り先に持ち回る、または逆に有効な `q` を落とす | 定数のコメントで相互参照し、境界（256 有効・257 で `/`）を T2 でリテラルで固定する。一本化は Issue #20（0018）へ申し送る（Q8）。`client.ts` は触らない |
| 長さの数え方（正規化の前後、UTF-16 のコード単位と文字数）の解釈の違い | 絵文字等を含む `q` や前後空白付きの `q` で、戻り先が `/` になるかどうかが変わる | 正規化後の `.length`（`client.ts` と同じ）を推奨し、境界をテストで固定する（Q6） |
| `SearchResults` / `RepoDetailView` / `repoPathFromFullName` の props・引数を必須にしたことで既存テストを書き換える際に期待値を弱める | 退行を見逃す | 1.2 (e) の表のとおり変更箇所を限定する。既存の期待値は、呼び出しの引数を足すこと以外は変えない（AC-10 は `pathname` の検査を足して強める） |
| RED の段階でテストが新しい props を渡すため `pnpm typecheck` が失敗する | RED のコミットを作れない | RED はコミットしない（`test:` と `feat:` を分けず、T3・T4 は GREEN 後に 1 コミット）。Vitest は型を見ないので、RED の実行と失敗理由の確認はできる |
| 一覧の行リンクがクエリ付きになり、先読み（prefetch）の URL が変わる | 同じリポジトリでも検索条件ごとに別の先読みになり、先読みの回数が増える／先読みで `getRepository` が呼ばれるとレート制限を消費する | 既定の `"auto"` の先読みは、動的ルートでは最も近い `loading.js` までで（`link.md` 302行）、詳細には `loading.tsx` があるのでページ関数（`getRepository`・`searchParams` の読み取り）は先読みで実行されない見込み。`partialPrefetching` は無効（`next.config.ts`）。T5 でサーバーのログ・`getRepository` の呼び出し回数を実測し、増える場合は止めて報告する（Q5） |
| 詳細ページの URL に任意の大きな `page` が付く（`page=99`） | 戻ると範囲外 | 仕様は `parsePage` の規則のみを定める（切り詰めない）。戻った先では 0007 の範囲外の案内（最終ページへのリンク）が出る。T5 で確認 |
| `searchParams` を読むことで詳細ページのレンダリング方式が変わる | キャッシュ・性能の変化 | 動的ルートで、すでにリクエスト時に取得している。T5 の `pnpm build` の出力で確かめる（1.2 (a)） |
| 検索条件が取得に混ざる | 同じ詳細 URL で表示が変わる、共有 URL の意味が変わる（AC-15f 違反） | ページは `getRepository(owner, repo)` を変えない。AC-15f で引数の完全一致と表示の一致を検証し、変異で確かめる（T4） |
| 404・API エラーの表示を誤って変える | 範囲外の変更、0010 の退行 | `not-found.tsx`・`ApiErrorView` は変更対象に入れない。既存の `not-found.test.tsx`・AC-18a〜20b のテストを期待値を変えずに通し、検索条件付きの 404・エラーの補強テストを足す（T4） |

## 6. ADR が必要な論点

- なし。依存パッケージの追加は無い。持ち回りの方法（詳細 URL のクエリ）は仕様 0009 の 9節で人間が決定済みで、純粋関数の置き場所・props の形はこの機能内の実装判断。計画と `docs/architecture.md`（T5）に記録すれば足りる。上限の定数の重複は一時的なもので、一本化の判断は Issue #20（0018）で行う。

## 7. 要確認事項

- [ ] Q1: `page` を一覧へ渡す経路。推奨は「`app/page.tsx` は変えず、`renderSearchContent`（すでに検証済みの `q` `page` を受け取っている）から `SearchResults` に `q` `page`（**必須**の props）を渡す」。影響する既存テストは `search-results.test.tsx` の全 `render`（props を足すヘルパに置き換え。期待値は AC-10 以外不変）と `repo-path.test.ts` の 4 件で、`app/page.test.tsx` と `search-content.test.tsx` の既存の期待値は変わらない（1.2 (d)・(e)）。別案: props を省略可能にする（既存テストは無修正で済むが、付け忘れを型で検出できず、仕様に無い「クエリなし」の分岐が残る）。
- [ ] Q2: 既存テストの期待値の変更範囲（1.2 (e) の表）でよいか。要点: (a) `search-results.test.tsx` の AC-10 は `href` の期待値を `/repos/vercel/next.js?q=react&page=1` に変え、`pathname` が `/repos/vercel/next.js` であることの検査を足す。0006 AC-10 の Then（`/repos/vercel/next.js` のページへ遷移する）はパスとして満たされるので、**仕様 0006 の変更は不要**と判断した。(b) `repo-detail-view.test.tsx` の AC-11c は `backHref="/"` を渡して期待値 `/` のまま残す（0008 AC-11c の Given はクエリなしの URL で、AC-15b と矛盾しない）。部品が `backHref` を使うことは新しい AC-15a の部品テストで確かめる。別案: 0006 の 10節に「0009 で行リンクにクエリが付く」旨の 1 行を追記する（0010 で 0008 の変更履歴に追記した前例に合わせる場合）。
- [ ] Q3: 純粋関数の置き場所と名前。推奨: `lib/search/paths.ts` に `buildRepoPathWithSearch(owner, repo, { q, page })`（クエリ部は `buildSearchPath` と共通の非公開ヘルパ）、新規 `lib/search/back-path.ts` に `buildBackPath(params: SearchParamsInput)`、定数は `SEARCH_KEYWORD_MAX_LENGTH`（既存の `SEARCH_PER_PAGE` `SEARCH_RESULT_LIMIT` に揃える）、`repoPathFromFullName(fullName, { q, page })` は第 2 引数を必須にする。別案: (a) `buildBackPath` も `paths.ts` に置く（ファイルは増えないが、`paths.ts` が `query.ts` と `constants.ts` に依存し、「組み立てだけ」の責務が崩れる）、(b) `repoPathFromFullName` は変えず、`repo-path.ts` に別の関数（例: `repoHrefFromFullName`）を足す（既存テストの期待値は不変になるが、同じ分割処理を通る関数が 2 つになる）。
- [ ] Q4: 手動確認（T5）の手順。推奨: `pnpm build` → `pnpm start` で、(1) トップで `日本語 & react` を検索 → 2 ページ目へ → 行を押す → 詳細の URL が `/repos/<owner>/<repo>?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2` → `トップへ戻る` → `/?q=…&page=2` で 2 ページ目が表示され、入力欄が `日本語 & react`（AC-15d・15e・15a）。(2) `/repos/vercel/next.js` を直接開く → `トップへ戻る` が `/`（AC-15b）。(3) `/repos/vercel/next.js?q=//evil.example`、`?q=https://evil.example/`、`?q=react&page=%203`、`?q=%E3%80%80&page=3`、`?q=react&q=vue`、257 文字の `q` を開き、HTML（curl でも可）の `トップへ戻る` の `href` が仕様 5節の表のとおり（AC-15c。URL 上の表記から Next.js が復号した値で判定されること）。(4) 検索条件付きの詳細 URL をリロードしても同じ内容（AC-15f）。(5) 一覧の表示時に先読みで `getRepository` が呼ばれないか（Q5）。(6) ブラウザの戻るボタンで一覧に戻れる（標準の挙動）。ブラウザが使えない場合は (2)(3)(4) を curl で行い、(1)(5)(6) は PR で人間に依頼する。
- [ ] Q5: 先読みへの影響。行リンクがクエリ付きになると、先読みの URL は検索条件ごとに別になる。推奨: 詳細の `loading.tsx` があるため既定の `"auto"` はページ関数を実行しない見込みとして、`prefetch` の指定は**変えない**。T5 で実測し、`getRepository` の呼び出しが増える場合は止めて報告する（`prefetch={false}` 等の対策は仕様外なので、その時点で判断を仰ぐ）。0008・0010 から持ち越している「先読みで API の呼び出しが増えないか」の実測も兼ねる。
- [ ] Q6: キーワードの長さの数え方。仕様 6.1 は「0004 の正規化を通り、かつ 256 文字以下」。推奨: **正規化後**の `q` の `.length`（UTF-16 のコード単位）で判定する。`client.ts` の `MAX_Q_LENGTH` の判定（`q.length > 256`。受け取るのは正規化済みの `q`）と同じ数え方になり、「戻り先に付く `q` は検索 API が受け付ける `q`」が保たれる。帰結: 前後に空白があっても中身が 256 文字以下なら有効、絵文字（2 コード単位）は 2 文字と数える。別案: コードポイント数（`[...q].length`）で数える（`client.ts` と食い違う）。
- [ ] Q7: 仕様 6.1 の「APIエラーの表示（0010）の `トップへ戻る` は変更しない（`/`）」について、現状の `ApiErrorView`（トップ・詳細とも）には `トップへ戻る` リンクが**存在しない**（0010 の仕様どおり `再試行` のみ）。推奨: 「変更しない＝何も足さない」と解釈し、検索条件付きの詳細で API エラーのときもリンクが出ないことを補強テストで固定する（T4）。仕様の文言の修正が必要かを判断してほしい（リンクを足す場合は提案 P1）。
- [ ] Q8: 上限 256 の一本化の行き先。仕様 0009 の 8節は「一本化は Issue #20（0018）で扱う」とするが、0018 の下書き（`docs/specs/0018-per-page-single-source.md` 4.2）は「`MAX_PER_PAGE` や `MAX_Q_LENGTH` の移動」を**やらないこと**に挙げており、食い違っている。推奨: この計画では `client.ts` を触らず、進捗メモの申し送りに残す。Issue #20 の仕様確定時（`/feature 20`）に範囲へ加えるか、別 Issue にするかを人間が決める（必要なら Issue #20 へのコメントを別途承認のうえ行う）。
- [ ] Q9: 提案 P1〜P4 は本計画では採らない、でよいか（P4 のテストの正規表現の誤りは、別の `fix` Issue を作るかの判断を含む）。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1〜Q3・Q6）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（5 タスク）。T1 と T2 は互いに独立、T3 は T1、T4 は T2 に依存する。
- 前提として読んだ申し送り: 0004 計画（`parseSearchParams`・`buildSearchPath` を 0009 で使う、「`q` が空なら `/`」は 0009 の側で組み立てる）、0005 計画（`SearchForm` の `key={initialQuery}` により戻った先の入力欄が復元される）、0006 計画（行リンクは `repoPathFromFullName`。`SearchResults` に `q`・`page` を渡すか生成関数を拡張する）、0007 計画（ページネーションには持ち回り情報を付けない、戻った先が範囲外なら案内が出る）、0008 計画（`RepoDetailView` の宛先を props で受け取る形にする、先読みの確認）、0010 計画（404 の `トップへ戻る` は `/` 固定、詳細に `loading.tsx` を置いたことによる先読みの範囲）。いずれも本計画の 1 節・T3〜T5 に反映した。
- 申し送り（後続で確認する）:
  - Issue #20（0018）: `lib/search/constants.ts` の `SEARCH_KEYWORD_MAX_LENGTH` と `lib/github/client.ts` の `MAX_Q_LENGTH` の一本化（Q8）。
  - 0013（E2E）: 一覧 → 詳細 → 戻るの往復（`日本語 & react`）は E2E の候補。

- 2026-10-08: 人間が計画を承認（Q1〜Q9 すべて推奨どおり。Q7 は ApiErrorView に何も足さない、Q8 は client.ts に触れない）。Status: in-progress。T1 から着手。