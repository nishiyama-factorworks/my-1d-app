# 0010: 状態表示（読み込み中・0件・エラー・404） 実装計画

Status: done                    <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #10
- 対応する仕様: docs/specs/0010-state-views.md
- ブランチ: feat/10-state-views
- 作成日: 2026-10-08

## 1. 方針

- **トップ（`/`）**: 検索結果の取得を `<Suspense>` の中に移す。ページ関数は `searchParams` の解釈とフォームの描画だけを待ち、取得結果の描画は **await しない Promise** として `<Suspense>` の子に渡す。読み込み中は `fallback` の `LoadingStatus`（`role="status"` の `読み込み中…`）を一覧の位置に出し、フォームは残す（AC-16a）。`q` または `page` が変わる遷移でも fallback が出るよう、`<Suspense>` に `key`（`buildSearchPath(q, page)`）を付ける（1.2 (b)）。
- 取得と振り分け（現在の `app/page.tsx` の `renderSearchContent`）は、**範囲外の 2 段の判定と一緒に** `features/search/components/search-content.tsx` へ移す（`app/page.tsx` 31行のコメント「0010 で取得を <Suspense> に移すときは、この判定も一緒に移すこと」、0007 計画の申し送り）。`page.tsx` は Next.js の規約上、`default` と規定の名前以外を export できないため、テストから呼べる別モジュールに置く（1.2 (a)）。
- **エラー**: 本番では Server Component の例外メッセージが `error.tsx` に届かない（`error.md` 106〜111行）ため、`GitHubApiError` はページ（トップは `renderSearchContent`、詳細は `RepoDetailPage`）の中で受け止め、種別ごとの固定文言を出す `ApiErrorView` を描画する（仕様 2節）。`ApiErrorView` は Server Component にし、`再試行` ボタンだけを Client Component（`RetryButton`。`useRouter().refresh()`）に切り出す。`resetAt`（`Date`）や例外オブジェクトはクライアントへ渡さない（1.2 (d)）。
- `GitHubApiError` 以外の例外は握りつぶさずに投げ、`app/error.tsx`（トップ・詳細の共通の受け皿）で `予期しないエラーが発生しました` と `再試行`（`retry`）を出す。`error.message` は表示しない（AC-19e）。
- **0件**: `totalCount === 0` のときは、範囲外の判定より前（0007 の AC-9d の分岐の位置）で `EmptyResults`（2 つの案内文）を返し、`SearchResults`・`Pagination` は描かない（AC-17）。
- **詳細（`/repos/[owner]/[repo]`）**: `loading.tsx` を置き（AC-16b）、取得はこれまでどおりページ関数で await する。`NOT_FOUND` は `notFound()`（0008 のまま）→ 同じセグメントの `not-found.tsx` が 404 の表示を出す（AC-20c）。それ以外の `GitHubApiError` は `ApiErrorView` を描画する（0008 AC-20b の変更）。`loading.tsx` によりストリーミングになるので、404・エラーとも HTTP 200 になる（仕様 6.1 の決定。`loading.md` 101〜111行）。
- リセット時刻の整形（Asia/Tokyo、24 時間表記、`HH:mm`）は純粋関数 `formatTimeInTokyo` に切り出し、実行環境のタイムゾーンに依存しないテストにする（1.2 (e)）。
- UI は素の HTML 要素と Tailwind。依存パッケージは追加しない。`metadata`・スケルトン等の見た目の作り込み・支援技術での詳細確認（0011）、検索条件を引き継ぐ戻り導線（0009。404 の `トップへ戻る` は `/` 固定）、ログ出力は作らない（仕様 4.2）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| トップの構成 | `Home` は `parseSearchParams(await searchParams)` → `q !== null` のとき `<Suspense key={buildSearchPath(q, page)} fallback={<LoadingStatus />}><SearchContent content={renderSearchContent({ q, page })} /></Suspense>` を、フォームの後ろ（今の `{content}` の位置）に置く。`renderSearchContent(...)` は **await しない**（Promise のまま渡す）。`q === null` のときは何も置かない（AC-4b のまま） |
| 取得と振り分け | `features/search/components/search-content.tsx` に `export async function renderSearchContent({ q, page }): Promise<ReactNode>` と `export function SearchContent({ content }: { content: Promise<ReactNode> })`（`return use(content)`。`"use client"` なしの Server Component）を置く。`renderSearchContent` の順序: ① `page > calculateMaxPage(SEARCH_RESULT_LIMIT)` なら API を呼ばずに `OutOfRangeNotice`（first）② `searchRepositories` を `try/catch`。`isGitHubApiError(e)` なら `<ApiErrorView kind={e.kind} resetAt={e.resetAt} />` を返し、それ以外は `throw e` ③ `totalCount === 0` なら `<EmptyResults q={q} />` ④ `page > maxPage` なら `OutOfRangeNotice`（last）⑤ `SearchResults` + `Pagination`。①④ の条件式は今のまま動かさない |
| `isGitHubApiError` の import 先 | `@/lib/github/errors`（0008 計画 Q5 と同じ。テストの `@/lib/github` のファクトリに含めずに済む） |
| 読み込み中 | `features/state-views/components/loading-status.tsx` の `LoadingStatus`: `<p role="status">読み込み中…</p>`（`…` は U+2026）。トップの fallback と詳細の `loading.tsx` で共用 |
| 0件 | `features/search/components/empty-results.tsx` の `EmptyResults({ q }: { q: string })`: `<p>「{q}」に一致するリポジトリは見つかりませんでした。</p>` と `<p>別のキーワードで検索してください。</p>`。`q` は `parseSearchParams` 済み（前後空白除去済み）の値。React のエスケープに任せる |
| API エラー表示 | `features/state-views/components/api-error-view.tsx` の `ApiErrorView({ kind, resetAt }: { kind: GitHubErrorKind; resetAt?: Date })`。`<div role="alert">` の中に 1 行目（見出し文）、2 行目（補足。あれば）、`<RetryButton />`。文言は下表。例外オブジェクト・`message`・`status` は props に取らない |
| 文言（6.1） | `RATE_LIMIT`: `GitHub API の利用制限に達しました` + （`resetAt` あり）`` `${formatTimeInTokyo(resetAt)}（日本時間）に解除されます。` ``／（なし）`しばらく時間をおいてから再試行してください。`。`UPSTREAM` `VALIDATION`: `データの取得中にエラーが発生しました`（補足なし）。`NETWORK`: `GitHub に接続できませんでした` + `通信環境を確認してから再試行してください。`。`NOT_FOUND`: 画面には届かない（詳細は `notFound()`、検索 API は返さない）が、型の網羅のため `UPSTREAM` と同じ文言にする（Q4） |
| 再試行（GitHubApiError） | `features/state-views/components/retry-button.tsx`（`"use client"`）の `RetryButton`: `<button type="button" onClick={() => router.refresh()}>再試行</button>`。`push` / `replace` は呼ばない（同じ URL のまま。AC-19d） |
| 時刻整形 | `features/state-views/lib/format-time-in-tokyo.ts` の `formatTimeInTokyo(date: Date): string`。`Intl.DateTimeFormat`（`timeZone: "Asia/Tokyo"`、`hour: "2-digit"`、`minute: "2-digit"`、`hourCycle: "h23"`）の `formatToParts` から `hour` と `minute` を取り出して `HH:mm` に組む（深夜 0 時が `24:00` になる環境差と、ロケールの区切り文字の差を避ける）。`getHours()` 等の実行環境のタイムゾーンに依存する API は使わない |
| 想定外の例外 | `app/error.tsx`（`"use client"`）。`export default function RouteError({ retry }: { error: Error & { digest?: string }; retry: () => void })`。`<main>` の中に `<div role="alert"><p>予期しないエラーが発生しました</p><button type="button" onClick={() => retry()}>再試行</button></div>`。`error` は受け取るが表示もログもしない（`retry` は Next.js 16.3 で安定版。`error.md` 117〜121行・327〜331行） |
| 詳細の読み込み中 | `app/repos/[owner]/[repo]/loading.tsx`: `<main …><LoadingStatus /></main>` |
| 詳細のエラー | `RepoDetailPage` の `catch` を「`isGitHubApiError(e)` なら、`NOT_FOUND` は `notFound()`、それ以外は `<main …><ApiErrorView kind={e.kind} resetAt={e.resetAt} /></main>` を返す。`GitHubApiError` 以外は `throw e`」に変える。`notFound()` は今と同じく `try` の外（`catch` 節の中）で呼ぶ |
| 404 | `app/repos/[owner]/[repo]/not-found.tsx`: `<main>` の中に `<h1>リポジトリが見つかりませんでした</h1>`、`<p>URL を確認するか、トップから検索し直してください。</p>`、`<Link href="/">トップへ戻る</Link>`。`app/not-found.tsx`（どのルートにも一致しない URL の 404 も兼ねる。`not-found.md` 133行）には置かない（Q6） |
| 配置 | トップと詳細で共用する状態表示は `features/state-views/`（仕様の slug と揃える。Q3）。検索固有の `EmptyResults` と `renderSearchContent` は `features/search/` |

### 1.2 設計判断と根拠

**(a) トップの読み込み中をどう出すか（`loading.tsx` ではなく `<Suspense>`）**

- `app/loading.tsx` は同じセグメントの `page.js` 全体を `<Suspense>` で包む（`loading.md` 76・86行）。トップに置くとフォームごと読み込み中表示に置き換わり、「検索フォームは表示されたまま」（AC-16a）を満たせない（0006 計画 1.2 (a) 45行の申し送りどおり）。よって、一覧の位置だけを `<Suspense>` で包む（`06-fetching-data.md` 174〜224行「With `<Suspense>`」）。
- 子の作り方は 3 案ある。

| 案 | 内容 | ページ単位のテスト |
| --- | --- | --- |
| A（推奨） | ページで `renderSearchContent(...)` を **await せず** Promise のまま `SearchContent` に渡し、`SearchContent` が `use(content)` で解決する | 可能。Promise はページ関数の呼び出しで 1 回だけ作られ、jsdom でも `<Suspense>` + `use` が普通に動く。未解決なら fallback、解決後は結果が出る |
| B | `async function SearchContent({ q, page })`（非同期の Server Component）を `<Suspense>` で包む（`loading.md` 141〜163行の例の形） | 不可。jsdom（React クライアント）は非同期コンポーネントを描画できない（`react-dom-client.development.js` 7636〜7650行で「async Client Component」と `console.error` し、描画のたびに新しい Promise になる）。ページのテストは「フォームだけ」に縮み、取得結果の表示はコンポーネント単位でしか確かめられない |
| C | `app/loading.tsx` | フォームが消えるので仕様違反 |

- 案A は Next.js の「Server Component で await せずに Promise を作り、`<Suspense>` の中で `use` で読む」パターン（`06-fetching-data.md` 239〜317行）と同じ形。違いは Promise の中身がデータではなく描画結果（`ReactNode`）である点と、`SearchContent` が Client Component ではなく Server Component である点（`use` は Server Component でも使える。サーバーでは Flight が Promise を `$@` 参照として直列化し、解決後にストリームで送る。`next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.development.js` 2845〜2856行）。本番での動きは T9 の手動確認で確かめる。
- 例外の扱い: `renderSearchContent` の Promise が `GitHubApiError` 以外で reject されると、`use` がその例外を投げ、最も近い error boundary（`app/error.tsx`）が受ける。`renderSearchContent` を別モジュールから export するのは、「`GitHubApiError` 以外はそのまま投げる」を `await expect(renderSearchContent(...)).rejects.toBe(error)` で直接検証するため（`page.tsx` からは規約外の名前を export できない）。

**(b) `q` / `page` だけが変わる遷移で fallback を出す（`key`）**

- App Router の遷移はトランジションとして扱われ、「遷移が終わるまでページは古い URL の状態を描き続ける」（`node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md` 182行）。React はトランジション中、**すでに表示済みの** `<Suspense>` を fallback に戻さない。新しく mount された `<Suspense>` は fallback を出す（React の Suspense の仕様。「遷移時に Suspense をリセットするには `key` を変える」）。
- 同じページ内で `searchParams` だけが変わる遷移では、ページのセグメントは作り直されない（`use-router.md` 50・162行: `bfcacheId` は「search-param だけの遷移」で変わらない＝セグメントは同じ。既存の `SearchForm` に `key={initialQuery}` が必要だったのも同じ理由。`app/page.tsx` 20行）。したがって `key` が無いと、再検索・ページ移動の間は古い一覧が出たままになり、AC-16a の後半を満たさない。
- `key` には `buildSearchPath(q, page)`（`lib/search/paths.ts`。`q` と `page` の組で一意な文字列）を使う。Next.js の文書に「searchParams だけの遷移で fallback が出るか」の明記は無いため、T4 で **トランジション内の再描画テスト**（`startTransition` の中で `rerender`）を書いて `key` の有無で結果が変わることを確かめ、T9 で実ブラウザでも確かめる。
- 再試行（`router.refresh()`）は同じ URL なので `key` は変わらず、fallback は出ない（前の表示のまま再取得し、結果で置き換わる）。仕様は再試行中の表示を定めていないので、これで足りる（Q8）。

**(c) `error.tsx` / `not-found.tsx` / `loading.tsx` の配置**

- `error.tsx` は同じセグメントの `page.js` と、その下の入れ子（`loading.js`・`not-found.js`・下位のレイアウトとページ）を包む。ルートレイアウトは包まない（`error.md` 96行）。`app/error.tsx` 1 つでトップと詳細の両方を受けられるので、ルートに 1 つだけ置く（推奨。Q6）。ルートレイアウト自体の例外（`global-error.tsx`）は仕様外。
- `not-found.tsx` は `notFound()` を投げたセグメントの `loading.js` の `<Suspense>` と `error.js` の境界の内側で描かれる（`not-found.md` 43行）。ルートの `app/not-found.tsx` は**一致するルートが無い URL の 404 も兼ねる**（同 133行）ため、ここに「リポジトリが見つかりませんでした」を置くと `/foo` のような URL でも出てしまう。詳細のセグメント（`app/repos/[owner]/[repo]/not-found.tsx`）に置く（推奨。Q6）。
- `loading.tsx` は詳細のセグメントだけに置く。動的ルートの `next/link` の既定の先読み（`"auto"`）は「最も近い `loading.js` の境界まで」なので（`link.md` 302行）、一覧の行リンクの先読みで `getRepository` は呼ばれない見込み（0008 の申し送り。T9 で実測）。トップには置かない（(a)）。

**(d) `ApiErrorView` を Server Component にし、`再試行` だけを Client Component にする**

- `再試行` は `router.refresh()`（現在のルートをサーバーで再取得・再描画。`use-router.md` 46行）を呼ぶため Client Component が必要だが、文言の選択や時刻の整形はサーバーで済む。`ApiErrorView` 全体を Client にすると `resetAt`（`Date`）や `kind` がクライアントへ直列化される。末端だけを Client にする（`.claude/rules/10-nextjs.md`「`"use client"` は末端だけ」）。
- `ApiErrorView` の props は `kind` と `resetAt` だけ（例外オブジェクトを渡さない）。`message`（英語の固定文言）・`stack`・`status` が誤って描画される経路を型の段階で作らない（AC-19c、仕様 8節）。
- `app/error.tsx` は Next.js の規約で Client Component（`error.md` 21行）。`retry` は props で受け取る別の操作なので、`RetryButton` は使わずにボタンを直接置く（重複は 1 行の `<button>` だけ）。
- `role="alert"` の中に `再試行` ボタンも入れる（AC-19e の Then が「`role="alert"` の中に … と `再試行` ボタン」なので、全種別で揃える。Q7）。

**(e) 時刻整形を純粋関数にし、実行環境のタイムゾーンに依存しないテストにする**

- `formatTimeInTokyo(date)` は `Intl.DateTimeFormat` に `timeZone: "Asia/Tokyo"` を明示する。開発者の端末は日本時間、CI は UTC のことが多く、`getHours()` で書くと端末では通り CI で落ちる（またはその逆）ため、テストでは `vi.stubEnv("TZ", …)` で実行環境のタイムゾーンを `UTC` と `America/Los_Angeles` に切り替えても結果が変わらないことを確かめる（Node は `process.env.TZ` の代入でタイムゾーンを切り替える）。これで `getHours()` 等を使った誤りを、日本時間の端末でも検出できる。
- 境界値: `2026-10-08T06:42:00Z` → `15:42`（AC-18a）、`2026-10-08T15:00:00Z` → `00:00`（日本時間の深夜 0 時。`24:00` にならない）、`2026-10-08T00:05:00Z` → `09:05`（時・分の 0 埋め）、`2026-10-07T23:59:00Z` → `08:59`、`2026-10-08T14:59:00Z` → `23:59`。期待値は文字列リテラルで書く。
- `resetAt` は 0003 の `parseResetAt` が有効な `Date` だけを返す（`lib/github/errors.ts` 32〜39行）ので、不正な `Date` の扱いは定めない（テストもしない）。

**(f) テストでの `next/navigation` の扱い**

- `RetryButton` は `useRouter` を呼ぶ。jsdom には App Router のコンテキストが無いので、`SearchForm` のテストと同じく `useRouter` を差し替える（`features/search/components/search-form.test.tsx` 6〜12行の方針）。
- `app/page.test.tsx`: 既存のモック `useRouter: () => ({ push })` に `refresh` を足す（`{ push, refresh }`）。
- `app/repos/[owner]/[repo]/page.test.tsx`: これまで `next/navigation` をモックせず本物の `notFound` を使っていた（0008 計画 1.2 (e)）。エラー表示で `RetryButton` が描画されるため、`vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }))` と**部分的に**差し替え、`notFound` は本物のまま（AC-20a の `digest` 検証を変えない）にする（推奨。Q5）。
- `RetryButton` のテストの `useRouter` は `{ push, replace, refresh }` を返し、押したときに `refresh` が 1 回、`push`・`replace` が 0 回であること（＝同じ URL のまま）を確かめる。

**(g) 既存テストの期待値の変更（仕様変更 0010 による。弱めない）**

| ファイル / テスト | 変更 | 理由 |
| --- | --- | --- |
| `app/page.test.tsx` の `renderPage` | `render(await Page(...))` を `await act(async () => { render(await Page(...)) })` に変え、`<Suspense>` の解決を待ってから検証する。各テストの期待値は変えない | 取得が `<Suspense>` の中に移るため（AC-16a）。待ち方の変更で、検証内容は同じ |
| `app/page.test.tsx` の `AC-4a（仕様6.1）: 検索 API が GitHubApiError で失敗したとき、握りつぶさずにそのまま投げる` | T4 で `features/search/components/search-content.test.tsx` に移す（`renderSearchContent` が同じインスタンスで reject される。ページ関数は Promise を await しなくなり reject しないため）。T5 で 0010 の表示（AC-18a〜19b）に置き換え、「`GitHubApiError` 以外の例外はそのまま投げる」（`new Error("unexpected")` → `rejects.toBe(error)`）を残す | 0006 仕様 6.1 の暫定挙動（例外はそのまま投げる）を、0010 の AC-18a〜19d が置き換える（仕様 0010 の 10節） |
| `app/page.test.tsx` の `AC-9d: /?q=react&page=2・総件数0のとき、範囲外の案内を出さず0件と空の一覧を表示する` | 名前を `AC-9d・AC-17: /?q=react&page=2・総件数0のとき、範囲外の案内を出さず0件の案内を表示する` に変える。「範囲外の案内なし」「行（`listitem`）0 件」「ページネーションなし」は**そのまま残し**、`総ヒット件数: 0 件` が表示される → **表示されない**（`queryByText(/総ヒット件数/)` が `null`）に変え、AC-17 の 2 文が表示されることを追加する | 0007 AC-9d の「総ヒット件数0と空の一覧」を 0010 AC-17 の案内文に置き換え（仕様 0007 の 10節 2026-10-08、0010 の 10節）。範囲外にしない点は変えない |
| `app/repos/[owner]/[repo]/page.test.tsx` の `it.each`: `AC-20b: getRepository が $kind で失敗したとき notFound() を呼ばず、同じエラーをそのまま投げる`（4 種別） | 種別ごとの表示のテスト（AC-18a・18b・19a・19b。ページ関数が reject されず、`role="alert"` の中に固定文言と `再試行` が出る＝`notFound()` も呼ばれていない）に置き換える | 0008 AC-20b を 0010 の種別ごとの表示に置き換え（仕様 0008 の 10節 2026-10-08） |
| `app/repos/[owner]/[repo]/page.test.tsx` の `AC-20b: GitHubApiError 以外の例外もそのまま投げる` | 変えない | 仕様 0008 AC-20b の注記どおり、`GitHubApiError` 以外は引き続きそのまま投げる |
| `app/repos/[owner]/[repo]/page.test.tsx` の `next/navigation` | (f) の部分モックを足す。AC-20a のテストは変えない | `RetryButton` の `useRouter` のため |
| `app/page.test.tsx` のエラー表示（AC-18a〜19c） | エラー表示の alert を `getErrorAlert()`（`<form>` の外にある `role="alert"` がちょうど 1 つであることを確かめて返す）で取り出す。期待値は不変 | 検索フォームに常設の空 `role="alert"`（`search-form.tsx`）があり `getByRole("alert")` が複数一致するため。`search-form.tsx` は変えない |

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `features/state-views/lib/format-time-in-tokyo.ts` / `.test.ts` | `formatTimeInTokyo`（T1） |
| 新規 | `features/state-views/components/loading-status.tsx` / `.test.tsx` | `LoadingStatus`（T2） |
| 新規 | `features/search/components/empty-results.tsx` / `.test.tsx` | `EmptyResults`（T2） |
| 新規 | `features/state-views/components/api-error-view.tsx` / `.test.tsx`、`retry-button.tsx` | `ApiErrorView`・`RetryButton`（T3） |
| 新規 | `features/search/components/search-content.tsx` / `.test.tsx` | `renderSearchContent`（`app/page.tsx` から移動）・`SearchContent`（T4・T5） |
| 変更 | `app/page.tsx` / `app/page.test.tsx` | `<Suspense key>` + `LoadingStatus`、取得の移動（T4）。0件・エラーのテスト（T5） |
| 変更 | `app/repos/[owner]/[repo]/page.tsx` / `page.test.tsx` | `GitHubApiError` の種別ごとの表示（T6） |
| 新規 | `app/repos/[owner]/[repo]/loading.tsx` / `loading.test.tsx`、`not-found.tsx` / `not-found.test.tsx` | 詳細の読み込み中・404（T7） |
| 新規 | `app/error.tsx` / `app/error.test.tsx` | 想定外の例外の受け皿（T8） |
| 変更 | `docs/architecture.md` | 3節・5節（T9） |
| 変更なし | `lib/github/`、`lib/search/`、`features/search/components/search-results.tsx` `pagination.tsx` `out-of-range-notice.tsx` `search-form.tsx`、`features/repo-detail/`、`app/layout.tsx`、`next.config.ts`、`package.json`、ロックファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: リセット時刻の整形（純粋関数）**
  - 対応 AC: AC-18a（時刻の部分）
  - 先に書くテスト: `features/state-views/lib/format-time-in-tokyo.test.ts`（環境は `// @vitest-environment node` でよい。`afterEach(() => vi.unstubAllEnvs())`）
    - `AC-18a: 2026-10-08T06:42:00Z は 15:42 になる`
    - `it.each`: `日本時間の深夜0時（2026-10-08T15:00:00Z）は 00:00 になり 24:00 にならない`、`時・分を2桁に0埋めする（2026-10-08T00:05:00Z → 09:05）`、`日付をまたぐ（2026-10-07T23:59:00Z → 08:59、2026-10-08T14:59:00Z → 23:59）`
    - `it.each`: `実行環境のタイムゾーンが $tz でも 2026-10-08T06:42:00Z は 15:42 になる`（`tz` = `UTC`、`America/Los_Angeles`、`Asia/Tokyo`。`vi.stubEnv("TZ", tz)` してから呼ぶ）
  - RED: `formatTimeInTokyo` を `""` を返す仮実装にして全件が期待値の不一致で失敗することを確認する。
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す）: (1) `getHours()`/`getMinutes()` で組む → `TZ=UTC` 等のケースが失敗、(2) `hourCycle` を外して `hour12: false` にする → 環境によっては `24:00` の境界が失敗（失敗しない場合はその事実を進捗メモに記録する）、(3) 0 埋めをしない → `09:05` が失敗。
  - 実装対象: `features/state-views/lib/format-time-in-tokyo.ts`、同 `.test.ts`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm lint`・`pnpm typecheck` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: 読み込み中と0件の表示部品**
  - 対応 AC: AC-16a・AC-16b（部品単位）、AC-17（部品単位）
  - 先に書くテスト:
    - `features/state-views/components/loading-status.test.tsx`: `AC-16a・AC-16b: role="status" の中に「読み込み中…」が表示される`（`getByRole("status")` が `toHaveTextContent("読み込み中…")`。文字列は U+2026 の完全一致で、`...`（3 つのピリオド）では失敗する）
    - `features/search/components/empty-results.test.tsx`:
      - `AC-17: q が zzzxqy のとき「「zzzxqy」に一致するリポジトリは見つかりませんでした。」と「別のキーワードで検索してください。」が表示される`（`getByText` の完全一致）
      - `AC-17: 総ヒット件数・一覧の行・ページネーションは含まない`（`queryByText(/総ヒット件数/)`、`queryAllByRole("listitem")`、`queryByRole("navigation")`）
      - `AC-17（補強）: q に < や & を含んでも文字として表示される`（`q="<b>a&b</b>"` → 文字列のまま表示され、`b` 要素が作られない。React のエスケープに任せていることの確認）
  - RED: 両部品を `<div />` を返す仮実装にし、要素が見つからないことで失敗することを確認する（AC-17 の「含まない」テストは仮実装でも通る。これは想定どおりで、T5 のページ単位のテストで意味を持つ）。
  - 実装対象: `features/state-views/components/loading-status.tsx`・`.test.tsx`、`features/search/components/empty-results.tsx`・`.test.tsx`（4 ファイル）
  - 完了条件: `pnpm test`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T3: APIエラーの表示部品と再試行ボタン**
  - 対応 AC: AC-18a、AC-18b、AC-19a、AC-19b、AC-19c、AC-19d（部品単位）
  - 先に書くテスト: `features/state-views/components/api-error-view.test.tsx`（jsdom。`vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }))`、各 `vi.fn` は `beforeEach` でリセット。クリックは `@testing-library/user-event`）
    - `AC-18a: RATE_LIMIT・resetAt=2026-10-08T06:42:00Z のとき、role="alert" の中に「GitHub API の利用制限に達しました」と「15:42（日本時間）に解除されます。」と「再試行」ボタンがある`（`within(getByRole("alert"))` で 3 つを取得。`resetAt` は `new Date("2026-10-08T06:42:00Z")`）
    - `AC-18b: RATE_LIMIT・resetAt なしのとき、「しばらく時間をおいてから再試行してください。」が表示され、「（日本時間）」は表示されない`
    - `it.each`（`UPSTREAM`・`VALIDATION`）: `AC-19a: $kind のとき role="alert" の中に「データの取得中にエラーが発生しました」と「再試行」ボタンがある`（あわせて `利用制限` `接続できません` の文言が出ないこと）
    - `AC-19b: NETWORK のとき「GitHub に接続できませんでした」と「通信環境を確認してから再試行してください。」と「再試行」ボタンがある`
    - `it.each`（`RATE_LIMIT`・`VALIDATION`・`UPSTREAM`・`NETWORK`）: `AC-19c: $kind のとき画面のテキストに英語の固定メッセージ・HTTP ステータス番号が含まれない`（`new GitHubApiError(kind, { status })` の `message` と `String(status)`（403・422・502）が `document.body.textContent` に含まれない。部品は `kind` と `resetAt` しか受け取らないので、これは props の設計の確認。ページ単位の確認は T5・T6）
    - `AC-19d: 「再試行」を押すと router.refresh() が1回呼ばれ、push・replace は呼ばれない`
    - `AC-19d: 再試行ボタンは type="button" である`（補強。フォームの中に置かれても送信しない）
  - RED: `ApiErrorView` を `<div />`、`RetryButton` を `<button type="button">再試行</button>`（`onClick` なし）の仮実装にし、文言のテストは要素が見つからないことで、AC-19d は `refresh` が呼ばれないことで失敗することを確認する（AC-19c は仮実装でも通る。想定どおり）。
  - 検出力の確認: (1) `RATE_LIMIT` で `resetAt` の有無を見ずに常に「しばらく…」 → AC-18a が失敗、(2) `refresh` の代わりに `router.push(location.href)` → AC-19d が失敗、(3) `UPSTREAM` と `NETWORK` の文言の取り違え → AC-19a・19b が失敗。
  - 実装対象: `features/state-views/components/api-error-view.tsx`、`retry-button.tsx`、`api-error-view.test.tsx`（3 ファイル）
  - 完了条件: `pnpm test`・`pnpm lint`・`pnpm typecheck` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T4: トップの取得を `<Suspense>` に移し、読み込み中を出す**
  - 対応 AC: AC-16a（トップ、ページ単位）。既存の AC-4a・4b・8a・8d・9a〜9d・22c・1・21b は振る舞いを変えない
  - 先に書くテスト:
    - `app/page.test.tsx`（1.2 (g) の `renderPage` の変更。`useRouter` のモックに `refresh` を足す）
      - `AC-16a: /?q=react で取得中のとき、検索フォームは表示されたまま、role="status" の「読み込み中…」が表示される`（`searchRepositories.mockReturnValue(new Promise(() => {}))`。`render(await Page(...))` の直後に `getByRole("searchbox", { name: "キーワード" })` と `getByRole("status")` が `読み込み中…`。`総ヒット件数`・`listitem` が無い）
      - `AC-16a: 読み込み中の表示は検索フォームより後ろ（一覧の位置）にある`（`compareDocumentPosition`。AC-8a と同じ書き方）
      - `AC-16a: 取得が終わると読み込み中の表示が消え、結果に置き換わる`（解決する Promise で、`await screen.findByText("総ヒット件数: 12,345 件")` の後に `queryByRole("status")` が `null`）
      - `it.each`: `AC-16a: 表示済みの状態から $label が変わる遷移（トランジション）でも読み込み中が表示される`（`label` = `q（react → vue）`、`page（1 → 2）`。1 回目は解決させて結果を表示 → 2 回目は未解決の Promise にして、`const next = await Page(...)` を作り、`act(() => { startTransition(() => { rerender(next); }); })` → `getByRole("status")` が出る。1.2 (b) の `key` の確認）
      - `AC-16a（補強）: q が無いときは読み込み中を表示しない`（`/` で `queryByRole("status")` が `null`。AC-4b の既存テストと同じ条件）
    - `features/search/components/search-content.test.tsx`（`@/lib/github` の `searchRepositories` をファクトリで差し替え。`useRouter` もモック）
      - `AC-4a（仕様 0006 6.1、T5 で置き換え）: 検索 API が GitHubApiError で失敗したとき、renderSearchContent は同じエラーで reject される`（既存の page.test から移す。1.2 (g)）
      - `AC-9b: page が 35 のとき検索 API を呼ばずに範囲外の案内を返す`（移動した前段の判定が `renderSearchContent` の中にあることの確認。ページ単位の AC-9b の既存テストも残る）
  - RED: テストを書いた時点（`app/page.tsx` 変更前）で実行し、(1) AC-16a の「取得中」のテストは `await Page(...)` が未解決の取得を待ち続けてタイムアウトで失敗する（＝読み込み中を出さずに取得を待っている、が失敗理由）、(2) `search-content.test.tsx` は `renderSearchContent` が未作成のため、先に `export async function renderSearchContent() { return null; }` の仮実装を置き、reject されないこと・案内が無いことで失敗することを確認する。タイムアウトまで待つのが長い場合は、そのテストだけ `{ timeout: 1000 }` を付けてよい（期待値は変えない）。
  - 実装: `renderSearchContent` を `features/search/components/search-content.tsx` へ**そのまま**移し（条件式・コメントを含む。31行のコメントは移し終えたので削る）、`SearchContent`（`use`）を足す。`app/page.tsx` は 1.1 の構成にする。この時点では `GitHubApiError` の表示（T5）・0件の表示（T5）は入れない。
  - 検出力の確認: (1) `<Suspense>` の `key` を外す → トランジションのテスト 2 件が失敗（**これが失敗しない場合は 1.2 (b) の前提が崩れているので止めて報告する**）、(2) `key` を `q` だけにする → `page` のケースだけが失敗、(3) ページで `await renderSearchContent(...)` に戻す → 「取得中」のテストが失敗。
  - 実装対象: `app/page.tsx`、`app/page.test.tsx`、`features/search/components/search-content.tsx`、`search-content.test.tsx`（4 ファイル）
  - 完了条件: 既存の `app/page.test.tsx` のテストが期待値を変えずにすべて通る（変えたのは `renderPage` の待ち方と、移したテスト 1 件だけ）。`pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T5: トップの0件・エラー表示**
  - 対応 AC: AC-17、AC-18a・18b・19a・19b・19c（トップ）、AC-19d（トップ、ページ単位）。0007 AC-9d の期待値の変更
  - 先に書くテスト:
    - `app/page.test.tsx`
      - `AC-17: キーワード zzzxqy の検索で総件数0のとき、2つの案内文が表示され、総ヒット件数・一覧の行・ページネーションは表示されない`（`/?q=zzzxqy`。検索フォームも残る）
      - 1.2 (g) の AC-9d の変更（`AC-9d・AC-17: …`）
      - `it.each`（`/?q=react` で `searchRepositories` が reject）: `AC-18a: RATE_LIMIT・resetAt あり`、`AC-18b: RATE_LIMIT・resetAt なし`、`AC-19a: UPSTREAM`、`AC-19a: VALIDATION`、`AC-19b: NETWORK` のとき、`role="alert"` の中に仕様 6.1 の文言と `再試行` ボタンがあり、検索フォームが残る（`within(alert)` で文言を完全一致で確認。期待値はテーブルにリテラルで並べる）
      - `it.each`: `AC-19c: GITHUB_TOKEN にダミーの値があり $kind で失敗したとき、画面のテキストにトークン・エラーの message・stack・HTTP ステータス番号が含まれない`（`vi.stubEnv("GITHUB_TOKEN", "ghp_dummy0010TokenValue")`、`afterEach` で `vi.unstubAllEnvs()`。`new GitHubApiError(kind, { status })` の `message`・`stack`・`String(status)`、トークンが `document.body.textContent` に無い）
      - `AC-19d: エラー表示の「再試行」を押すと router.refresh() が1回呼ばれ、push は呼ばれない`
    - `features/search/components/search-content.test.tsx`
      - T4 で移したテストを `AC-18a〜19b（仕様 0010 で 0006 6.1 を置き換え）: GitHubApiError では reject せず、エラー表示を返す` に置き換え、`AC-19e の前提: GitHubApiError 以外の例外は同じインスタンスのまま reject される`（`new Error("unexpected")` → `rejects.toBe(error)`）を足す
  - RED: 実装前に実行し、0件・エラーのテストが「要素が見つからない」「reject されない／される」の期待値の不一致で失敗することを確認する（AC-19c はエラー時に何も描画されずに通る可能性がある。その場合は記録する）。
  - 実装: `renderSearchContent` の `searchRepositories` 呼び出しを `try/catch` で囲み、`GitHubApiError` → `ApiErrorView`、それ以外 → `throw e`。取得後、範囲外の判定より前に `totalCount === 0` → `EmptyResults`。
  - 検出力の確認: (1) `catch` で種別を見ずにすべて `ApiErrorView`（`UPSTREAM` 扱い） → `GitHubApiError` 以外の reject のテストが失敗、(2) 0件の分岐を範囲外の判定の後ろへ移す → 変化なし（`totalCount >= 1` の条件で 0 は範囲外にならない）ことを確かめ、AC-9d の条件 `totalCount >= 1` を外すと失敗することを確かめる、(3) `EmptyResults` に `q` ではなく生の `searchParams.q`（空白付き）を渡す → AC-17 の完全一致で失敗する（`?q=%20zzzxqy` の補強ケースを足す場合）。
  - 実装対象: `features/search/components/search-content.tsx`、`search-content.test.tsx`、`app/page.test.tsx`（3 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T6: 詳細ページのエラー表示**
  - 対応 AC: AC-18a・18b・19a・19b・19c（詳細）。0008 AC-20b の期待値の変更。AC-20a は変えない
  - 先に書くテスト: `app/repos/[owner]/[repo]/page.test.tsx`（1.2 (f) の部分モックを足す）
    - 1.2 (g) の `it.each` の置き換え: `AC-18a: RATE_LIMIT・resetAt あり`、`AC-18b: RATE_LIMIT・resetAt なし`、`AC-19a: UPSTREAM`、`AC-19a: VALIDATION`、`AC-19b: NETWORK` のとき、ページ関数は reject せず（`notFound()` を呼ばない）、`role="alert"` の中に仕様 6.1 の文言と `再試行` ボタンがあり、詳細の見出し（`heading` level 1）は無い
    - `it.each`: `AC-19c: GITHUB_TOKEN にダミーの値があり $kind で失敗したとき、画面のテキストにトークン・message・stack・HTTP ステータス番号が含まれない`（T5 と同じ確認方法）
    - 既存の `AC-20a`（`digest` が `NEXT_HTTP_ERROR_FALLBACK;404`）と `AC-20b: GitHubApiError 以外の例外もそのまま投げる` は変えずに通ることを確認する
  - RED: 実装前に実行し、置き換えたテストが「reject される（同じエラーがそのまま投げられる）」ことで失敗することを確認する。部分モックで `notFound` が本物のまま動くこと（AC-20a が通ること）もこの時点で確かめ、動かなければ止めて報告する（Q5）。
  - 検出力の確認: (1) `isGitHubApiError` を見ずに全例外を `ApiErrorView` にする → `GitHubApiError 以外` のテストが失敗、(2) `NOT_FOUND` の判定を `ApiErrorView` の後ろに置く → AC-20a が失敗。
  - 実装対象: `app/repos/[owner]/[repo]/page.tsx`、`page.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T7: 詳細の読み込み中と404の表示**
  - 対応 AC: AC-16b、AC-20c
  - 先に書くテスト:
    - `app/repos/[owner]/[repo]/loading.test.tsx`: `AC-16b: 詳細の読み込み中は role="status" の「読み込み中…」が表示される`（`render(<Loading />)`）
    - `app/repos/[owner]/[repo]/not-found.test.tsx`:
      - `AC-20c: レベル1の見出し「リポジトリが見つかりませんでした」と「URL を確認するか、トップから検索し直してください。」が表示される`
      - `AC-20c: 名前が「トップへ戻る」のリンクの href が / である`（クリックはしない。0008 計画 1.2 (c)）
  - RED: 両ファイルを `<div />` を返す仮実装にし、要素が見つからないことで失敗することを確認する。角括弧を含むパスの新しいテストファイルが Vitest に拾われることも確かめる。
  - 実装対象: `app/repos/[owner]/[repo]/loading.tsx`、`loading.test.tsx`、`not-found.tsx`、`not-found.test.tsx`（4 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T8: 想定外の例外の受け皿（`app/error.tsx`）**
  - 対応 AC: AC-19e
  - 先に書くテスト: `app/error.test.tsx`（`render(<RouteError error={Object.assign(new Error("internal detail 0010"), { digest: "123456" })} retry={retry} />)`）
    - `AC-19e: role="alert" の中に「予期しないエラーが発生しました」と「再試行」ボタンが表示される`
    - `AC-19e: エラーの message と digest は表示されない`（`document.body.textContent` に `internal detail 0010`・`123456` が無い）
    - `AC-19e: 「再試行」を押すと retry が1回呼ばれる`
  - RED: `<div />` を返す仮実装で失敗することを確認する。
  - 検出力の確認: `error.message` を表示する変異で「message は表示されない」が失敗する。
  - 実装対象: `app/error.tsx`、`app/error.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`・`pnpm lint`・`pnpm build`（`error.tsx` が Client Component として受け付けられること）PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T9: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節: `features/state-views/`（`LoadingStatus`・`ApiErrorView`・`RetryButton`・`formatTimeInTokyo`）、トップの取得は `features/search/components/search-content.tsx` の `renderSearchContent` に移り `<Suspense key>` で包む、`EmptyResults`。5節: 詳細ページのエラーの記述（「それ以外はそのまま投げる。専用の表示は 0010」）を「`GitHubApiError` は種別ごとの表示、それ以外は `app/error.tsx`」に更新、Client Component の一覧に `retry-button.tsx` と `app/error.tsx` を追加、ストリーミングのため 404・エラーが HTTP 200 になること）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - 手動確認（`pnpm build` → `pnpm start`。認証なしでは検索 API が 1 分 10 回なので回数を抑える。ブラウザが使えない場合は curl で確かめられる範囲を記録し、残りを PR で人間に依頼する）:
      - `/?q=react` を直接開くと、最初の HTML にフォームと `読み込み中…` があり、続けて結果がストリームで差し替わる（AC-16a。案A の本番での動き）。
      - ブラウザでキーワードを変えて検索、ページ番号を押す → それぞれ一覧の位置に `読み込み中…` が出る（AC-16a 後半。1.2 (b)）。
      - `/?q=zzzxqy0010` のような 0 件の検索で案内文が出る（AC-17）。
      - レート制限に達した状態（認証なしで連続検索）で、`利用制限` の文言と日本時間の解除時刻、`再試行` が出る。押すと同じ URL のまま再取得される（AC-18a・19d）。
      - 257 文字の `q` で `データの取得中にエラーが発生しました` が出る（500 にならない。0007 の申し送り (a) の解消）。
      - `/repos/vercel/next.js` で `読み込み中…` の後に詳細、`/repos/vercel/this-repo-does-not-exist-0010` と `/repos/a%20b/c` で 404 の表示（`トップへ戻る` → `/`）。HTTP は 200 で `<meta name="robots" content="noindex">` が付く（仕様 6.1）。
      - 一致するルートが無い `/no-such-path` は Next.js 標準の 404 のまま（`リポジトリが見つかりませんでした` が出ない。Q6）。
      - 一覧の行リンク・ページ番号リンクの先読みで `getRepository`・`searchRepositories` の呼び出しが増えない（0007・0008 の申し送り。`loading.tsx` を置いた後の再確認）。
      - 本番ビルドの画面に、英語のエラーメッセージ・ステータス番号が出ない（AC-19c）。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: `再試行` を押してから結果が出るまでの間、ボタンを押せなくする・「再試行中…」を出す（`useTransition` の `isPending`）。仕様に再試行中の表示は無い（Q8）。0011 で判断。
- P2: どのルートにも一致しない URL 用の `app/not-found.tsx`（日本語の汎用 404）。仕様 0010 の 404 は存在しないリポジトリだけを対象にしている。
- P3: ルートレイアウトの例外用の `app/global-error.tsx`。
- P4: エラー時に `console.error`（`error.tsx` の `useEffect`）やサーバーログを出す。仕様 4.2 で「エラーのサーバーログ出力」は対象外。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体 | `formatTimeInTokyo`（Asia/Tokyo、`HH:mm`、実行環境の TZ 非依存） | `features/state-views/lib/format-time-in-tokyo.test.ts` | node | なし（`vi.stubEnv("TZ")` で実行環境のタイムゾーンを切り替えるだけ） |
| コンポーネント | `LoadingStatus`、`EmptyResults`、`ApiErrorView` + `RetryButton` | 各 `*.test.tsx` | jsdom | `next/navigation` の `useRouter` のみ |
| コンポーネント | `loading.tsx`、`not-found.tsx`、`error.tsx` | `app/**/*.test.tsx` | jsdom | なし（`error.tsx` は `retry` に `vi.fn`） |
| 結合（関数） | `renderSearchContent`（範囲外の前段、`GitHubApiError` 以外の reject） | `features/search/components/search-content.test.tsx` | jsdom | `@/lib/github`（ファクトリで丸ごと）、`useRouter` |
| 結合（ページ） | トップ: 読み込み中・`key` によるトランジション時の fallback・0件・種別ごとのエラー・AC-19c・再試行。既存の AC はそのまま | `app/page.test.tsx` | jsdom | `@/lib/github` の `searchRepositories`、`useRouter`（`push`・`refresh`） |
| 結合（ページ） | 詳細: 種別ごとのエラー・AC-19c・`NOT_FOUND`（既存）・非 `GitHubApiError`（既存） | `app/repos/[owner]/[repo]/page.test.tsx` | jsdom | `@/lib/github` の `getRepository`、`next/navigation` は `useRouter` だけを部分的に差し替え（`notFound` は本物） |
| 手動 | 本番ビルドでのストリーミング、遷移時の fallback、HTTP ステータスと `noindex`、先読み、レート制限の実画面 | T9 | `next start` | なし（実 API） |
| E2E | なし（0013 で任意） | — | — | — |

- 要素の取得は role / label / text。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 文言の期待値は仕様 6.1 の文字列をリテラルで書く（`読み込み中…` の `…` は U+2026、全角括弧 `（日本時間）`、句点の有無まで完全一致）。`formatTimeInTokyo` を期待値の計算に使わない（`15:42` とリテラルで書く）。
- 時刻・タイムゾーンに依存するテストは、入力を固定の UTC 文字列で作り、実行環境の TZ を切り替えても同じ結果になることを確かめる。`Date.now()` は使わない。
- 自分たちのモジュール同士（`ApiErrorView`、`formatTimeInTokyo`、`EmptyResults`、`LoadingStatus`、`renderSearchContent`）はモックしない。モックは GitHub API の呼び出し（`@/lib/github`）とルーター（`useRouter`）だけ。
- `vi.stubEnv` を使うテストは `afterEach(() => vi.unstubAllEnvs())` で戻し、テスト間で状態を共有しない。
- 読み込み中のテストは解決しない Promise（`new Promise(() => {})`）で作り、タイマーには頼らない。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-16a | トップの読み込み中（フォームは残す、`q`・`page` が変わっても出る） | `loading-status.test.tsx`、`app/page.test.tsx` | T2、T4 |
| AC-16b | 詳細の読み込み中 | `loading-status.test.tsx`、`app/repos/[owner]/[repo]/loading.test.tsx` | T2、T7 |
| AC-17 | 0件の案内文、件数・行・ページ送りなし | `empty-results.test.tsx`、`app/page.test.tsx` | T2、T5 |
| AC-18a | レート制限・解除時刻（日本時間） | `format-time-in-tokyo.test.ts`、`api-error-view.test.tsx`、両ページの `page.test.tsx` | T1、T3、T5、T6 |
| AC-18b | レート制限・解除時刻なし | `api-error-view.test.tsx`、両ページの `page.test.tsx` | T3、T5、T6 |
| AC-19a | `UPSTREAM`・`VALIDATION` | `api-error-view.test.tsx`、両ページの `page.test.tsx` | T3、T5、T6 |
| AC-19b | `NETWORK` | `api-error-view.test.tsx`、両ページの `page.test.tsx` | T3、T5、T6 |
| AC-19c | トークン・message・stack・ステータス番号を出さない | `api-error-view.test.tsx`、両ページの `page.test.tsx` | T3、T5、T6 |
| AC-19d | 再試行で `router.refresh()` を 1 回（同じ URL） | `api-error-view.test.tsx`、`app/page.test.tsx` | T3、T5 |
| AC-19e | 想定外の例外: 固定文言・message を出さない・`retry` を 1 回 | `app/error.test.tsx`（前提の「そのまま投げる」は `search-content.test.tsx`・詳細の `page.test.tsx`） | T8（T5、T6） |
| AC-20c | 404 の見出し・案内・`トップへ戻る`（`/`） | `app/repos/[owner]/[repo]/not-found.test.tsx`（`notFound()` の呼び出しは既存の AC-20a） | T7 |
| 0007 AC-9d（変更） | 総件数0は範囲外にせず、AC-17 の案内を出す | `app/page.test.tsx` | T5 |
| 0008 AC-20b（変更） | `GitHubApiError` は種別ごとの表示、それ以外はそのまま投げる | `app/repos/[owner]/[repo]/page.test.tsx` | T6 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 案A（Promise を `use` で読む Server Component）が本番の Next.js で想定どおりストリームされない | 読み込み中が出ない、または一覧が出ない | Flight が Promise を直列化することはソースで確認済み（1.2 (a)）。T9 で本番ビルドの HTML とブラウザで確認し、だめなら案B（非同期の Server Component）に切り替える（ページ単位のテストは縮むので、その場合は止めて報告する） |
| `<Suspense>` の `key` が無い・不足する | 再検索・ページ移動の間、古い一覧が出たまま（AC-16a 後半の違反） | T4 のトランジションのテストと変異確認（`key` を外す・`q` だけにする）、T9 の実ブラウザ確認 |
| トランジションのテスト（`startTransition` + `rerender`）が jsdom で想定どおり動かない | `key` の自動検証ができない | T4 の変異確認で「`key` を外すと失敗する」ことを必ず確かめる。確かめられなければ止めて報告し、手動確認に寄せる |
| 範囲外の判定を移すときに条件を変えてしまう | 0007 の AC-9b〜9d の退行、422 とレート制限の消費 | 条件式はそのまま移し、既存のページ単位のテスト（AC-9a〜9d、変異確認済み）を期待値を変えずに通す（T4） |
| 既存テストを「待ち方の変更」のついでに弱める | 退行を見逃す | 1.2 (g) の表のとおり変更箇所を限定し、それ以外の期待値は変えない。AC-9d は条件を足す方向にだけ変える |
| `formatTimeInTokyo` が実行環境のタイムゾーンに依存する | 日本の端末では通り CI で落ちる（逆も） | `timeZone` を明示し、`vi.stubEnv("TZ")` で UTC・ロサンゼルスに切り替えたテスト（T1）。`getHours()` の変異で検出を確認 |
| 深夜 0 時が `24:00` になる | 表示の誤り | `hourCycle: "h23"` と境界値テスト（`2026-10-08T15:00:00Z` → `00:00`） |
| エラー表示にトークン・内部情報が出る | 情報漏えい | `ApiErrorView` は `kind`・`resetAt` しか受け取らない（1.2 (d)）。AC-19c を部品とページの両方で検証。`error.tsx` は `error` を描画しない（AC-19e） |
| `NOT_FOUND` 以外のエラーで詳細ページが `notFound()` を呼ぶ／`NOT_FOUND` がエラー表示になる | 404 とエラーの取り違え | 既存の AC-20a を変えずに通し、T6 で判定順の変異を確かめる |
| 部分モックで本物の `next/navigation` が読み込めない | AC-20a の検証方法が使えない | T6 の RED で最初に確認し、だめなら止めて報告する（Q5） |
| `loading.tsx` で 404・エラーが HTTP 200 になる | 検索エンジン・監視が 404 を数えない | 仕様 6.1 で人間が決定済み。Next.js が `noindex` を付けることを T9 で確認 |
| `loading.tsx` を置いたことで行リンクの先読みが変わる | `getRepository` の消費が増える | 先読みは `loading.js` の境界までの見込み（`link.md` 302行）。T9 で実測 |
| 一覧の描画中に `repoPathFromFullName` が `GitHubApiError("UPSTREAM")` を投げる（`fullName` に `/` が無い異常な応答） | `renderSearchContent` の `try/catch` の外（描画時）なので `app/error.tsx` の「予期しないエラー」になる | 0006 の異常系で、仕様 0010 の AC の対象外。挙動として記録する（Q9） |
| 再試行中に何も変化しない | 押したか分かりにくい | 仕様の範囲外。提案 P1 として 0011 へ（Q8） |

## 6. ADR が必要な論点

- なし。依存パッケージの追加は無い。トップの取得を `<Suspense>` + `use` に移す構成、状態表示の配置（`features/state-views/`）、`error.tsx`・`not-found.tsx`・`loading.tsx` の配置はこの機能内の実装判断で、計画と `docs/architecture.md` に記録すれば足りる（0006・0007 計画で「`<Suspense>` に変える場合もその計画で記録する」としている）。

## 7. 要確認事項

- [x] Q1: トップの読み込み中の作り方。推奨は案A（ページで `renderSearchContent` を await せず、Promise を `SearchContent` の `use` で読む。ページ単位で読み込み中・遷移時の fallback までテストできる）。別案は案B（非同期の Server Component。Next.js の例と同じ形だが、jsdom で描画できずページ単位のテストが縮む）。`app/loading.tsx` はフォームが消えるので採らない（1.2 (a)）。
- [x] Q2: `q`・`page` が変わる遷移で fallback を出すため、`<Suspense>` に `key={buildSearchPath(q, page)}` を付けてよいか（1.2 (b)）。
- [x] Q3: トップと詳細で共用する状態表示（`LoadingStatus`・`ApiErrorView`・`RetryButton`・`formatTimeInTokyo`）の置き場所。推奨は `features/state-views/`（仕様の slug と揃える）。別案は `components/`（`components/ui/` は shadcn/ui の部品の置き場なので、その横に `components/status/` 等を作る）。`EmptyResults` は検索固有なので `features/search/` に置く。
- [x] Q4: `ApiErrorView` の props を `{ kind, resetAt }` に絞ってよいか。`kind` が `NOT_FOUND` のとき（どの画面からも届かない。詳細は `notFound()`、検索 API は `NOT_FOUND` を返さない）は `データの取得中にエラーが発生しました` にしてよいか（型の網羅のため。別案は props の型から `NOT_FOUND` を除き、呼び出し側で絞り込む）。
- [x] Q5: 詳細ページのテストで `next/navigation` を部分的に差し替え（`importOriginal` で本物を読み、`useRouter` だけ差し替える）、`notFound` は本物のまま `digest` で検証し続けてよいか（1.2 (f)）。
- [x] Q6: `error.tsx` は `app/error.tsx` 1 つ（トップ・詳細の両方を受ける）、`not-found.tsx` は詳細のセグメント（`app/repos/[owner]/[repo]/not-found.tsx`）だけに置き、`app/not-found.tsx` は作らない（一致しない URL は Next.js 標準の 404 のまま）、でよいか（1.2 (c)）。
- [x] Q7: `再試行` ボタンを `role="alert"` の内側に置いてよいか（AC-19e の文言に合わせ、全種別で統一）。
- [x] Q8: 再試行（`router.refresh()`）中は読み込み中の表示を出さず、前のエラー表示のまま結果で置き換わる、でよいか（仕様に再試行中の表示は無い。出す場合は提案 P1）。
- [x] Q9: 一覧の描画中に `repoPathFromFullName` が投げる `GitHubApiError("UPSTREAM")`（GitHub の異常な応答）は `app/error.tsx` の「予期しないエラー」になる。仕様の AC の対象外として、このままでよいか。
- [x] Q10: 提案 P1〜P4 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1〜Q6）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（9 タスク）。
- 2026-10-08: 人間が計画を承認（Q1〜Q10 はすべて推奨案で確定）。子 Issue には分割せず 1 PR で進める。Status を in-progress にし、T1 の RED から着手。
- 2026-10-08: T1 完了。RED は仮実装（`""`）で 8/8 件が期待値の不一致（`expected '' to be …`）で失敗、GREEN は `Intl.DateTimeFormat`（`timeZone: "Asia/Tokyo"`, `hourCycle: "h23"`）で 8/8 通過、`verify.sh --quick` PASS。検出力の変異確認 (1)〜(3) は未実施。
- 2026-10-08: T2 完了。RED は仮実装（`<div />`）で 4 件中 3 件が失敗（`role="status"` が見つからない／文言の要素が見つからない）、残り 1 件（AC-17「含まない」）は計画どおり仮実装でも通過。GREEN は 4/4 通過、`verify.sh --quick` PASS。T2 に変異確認の指定は無いため未実施。
- 2026-10-08: T3 完了。RED は仮実装（`ApiErrorView` = `<div />`）で 11 件中 7 件が失敗（`role="alert"` が見つからない 5 件、`再試行` ボタンが見つからない 2 件）、AC-19c の 4 件は計画どおり仮実装でも通過。GREEN は 11/11 通過、`verify.sh --quick` PASS。変異確認: (1) `resetAt` を無視 → AC-18a が失敗、(2) `refresh` を `push(location.href)` に → AC-19d が失敗、(3) UPSTREAM と NETWORK の文言取り違え → AC-19a×2・19b が失敗。いずれも元に戻し済み。
- 2026-10-08: T4 完了。RED は search-content が仮実装（null）で 2/2 件失敗（reject されない／案内なし）、page は取得を待ち続けて AC-16a の「取得中」2 件がタイムアウト（残り 3 件は連鎖失敗）。GREEN 直後、遷移テスト 2 件が同期 `act` ではフォールバックを観測できず失敗したため（`key` ありでも再現。`await act(async …)` なら出る）、`app/page.test.tsx` の該当 `act` を async に変更（期待値は不変）。GREEN は 27/27 通過、`verify.sh --quick` PASS。変異確認: (1) `key` を外す → 遷移 2 件が失敗、(2) `key` を `q` のみ → `page` の 1 件だけ失敗、(3) ページで `await renderSearchContent` に戻す → 取得中系と遷移を含む 13 件が失敗。いずれも元に戻し済み。
- 2026-10-08: T5 完了。RED は 13 件失敗（0 件で総ヒット件数が残る／`GitHubApiError` が reject される）。GREEN 後、トップのエラー表示 9 件が `getByRole("alert")` の複数一致（検索フォームの常設の空 alert と `ApiErrorView`）で失敗したため、人間の承認のうえ `app/page.test.tsx` に `getErrorAlert()` を追加（期待値は不変、`search-form.tsx` は不変）。GREEN は 102/102 通過、`verify.sh --quick` PASS。変異確認: (1) 全例外を `ApiErrorView` → `GitHubApiError` 以外の reject の 1 件が失敗、(2) 0 件の分岐を外す → AC-9d・AC-17 の 2 件が失敗、(3) 0 件の分岐を `page === 1` に限定 → AC-9d の 1 件が失敗、(4) `message` を表示 → AC-19c の 4 件が失敗。いずれも元に戻し済み。
- 前提として読んだ申し送り: 0006 計画（0件・読み込み中・`<Suspense>` への移行）、0007 計画（範囲外の 2 段の判定を一緒に移す、0件は AC-9d の分岐の中、257 文字の `q` の 500、先読みの再確認）、0008 計画（`loading.tsx` と先読み、ストリーミング時の 404 が 200 になる点）。いずれも本計画の 1 節・T4〜T7・T9 に反映した。
- 2026-10-08: T6 完了。RED は 10 件失敗（`GitHubApiError` がそのまま reject される。部分モックでも AC-20a は通過）。GREEN は 16/16 通過。変異確認: (1) `GitHubApiError` 以外も `ApiErrorView` → AC-20b が失敗、(2) `NOT_FOUND` 判定を除去 → AC-20a が失敗、(3) 全種別で `notFound()` → 表示系 10 件が失敗、(4) `message` を表示 → AC-19c の 4 件が失敗。いずれも元に戻し済み。
- 2026-10-08: T7 完了。RED は 3 件失敗（`<div />` の仮実装で role=status・見出し・リンクが見つからない。角括弧のパスのテストは Vitest に拾われた）。GREEN は 3/3 通過。変異確認: リンクの href を `/x` に変更 → AC-20c のリンクのテストが失敗（元に戻し済み）。
- 2026-10-08: T8 完了。RED は 2 件失敗（`<div />` の仮実装で role=alert と「再試行」ボタンが見つからない。message 非表示のテストは仮実装でも通る）。GREEN は 3/3 通過。変異確認: message を表示 → 「alert の中の表示」「message は表示されない」の 2 件が失敗、retry を呼ばない → 「retry が1回呼ばれる」が失敗（いずれも元に戻し済み）。`pnpm build` は T9 の最終確認で実施。
- 2026-10-08: T9 完了。`docs/architecture.md` を更新（3節: `features/state-views/`、`search-content.tsx` と `<Suspense key>`、`empty-results.tsx`。5節: Client Component の一覧、状態表示の方針、HTTP 200 と `noindex`、詳細ページのエラー）。
  - 手動確認（`next build` → `next start -p 3110`、実 API、curl。ブラウザは使えず）: `/?q=react` → 200、最初の HTML に `読み込み中…` があり、続けて結果（総ヒット件数）がストリームで届く（案A が本番でストリーミングされる）。`/?q=zzzxqy0010qqq` → 200、AC-17 の 2 文があり `総ヒット件数` は無い。257 文字の `q` → 200、`データの取得中にエラーが発生しました` と `再試行` があり、英語の message は無い（0007 の申し送り (a) の解消）。`/repos/vercel/next.js` → 200、`読み込み中…` の後に詳細。`/repos/vercel/this-repo-does-not-exist-0010`・`/repos/a%20b/c` → 200、`noindex` 付き。404 の表示（見出し・案内文・`トップへ戻る`（`/`））は RSC のペイロードで届き、ブラウザで描画される（HTML の本文は `読み込み中…` のまま）。`/no-such-path` → 404 で、`リポジトリが見つかりませんでした` は出ない（Q6）。
  - 未確認（PR で人間に依頼）: ブラウザでの再検索・ページ移動時の `読み込み中…`（AC-16a 後半）、404 表示の描画、レート制限の実画面と `再試行` の動作（AC-18a・19d）、行リンク・ページ番号リンクの先読みで API の呼び出しが増えないか、`error.tsx` の実画面。
  - レビュー: reviewer は Approve（Critical・Major なし）。security-reviewer は Critical・High・Medium なし（Low 3 件: 再試行・検索による API 利用回数の消費（既存の性質。0011 のキャッシュで扱う）、エラー表示も HTTP 200（CDN 導入時に `Cache-Control` を確認）、`ghp_` 形式のダミートークン）。
  - レビューの Minor への対応: AC-19c のテストに、トークンの検査はページ描画の範囲に限られる旨のコメントを追加し、stack のフレーム形式（`at …:行:列`）が出ないことの検査を追加。ダミートークンを `test-token-not-a-secret-0010` に変更。`app/error.test.tsx` で `digest` も表示しないことを確かめ、`<main>` の中にあることの補強テストを追加（RED を確認後、`app/error.tsx` を `<main>` で包んで GREEN）。`api-error-view.tsx` の内部関数を `describeError` に改名。
  - T1 の補足: 計画 1.1 は `formatToParts` で組み立てる方針だったが、`ja-JP` に `hourCycle: "h23"` と `2-digit` を指定した `.format()` は区切りが `:` に固定されるため、そのまま採用した。T1 の変異確認（`getHours()` に置き換え）を実施し、TZ=UTC・America/Los_Angeles の 2 件が失敗することを確認して元に戻した。
  - T5 の補足: 0 件の判定を範囲外の判定より前に置いたため、範囲外の条件から `totalCount >= 1` を外した（振る舞いは同じ）。T5 の変異確認 (2) はこの形では対象が無い。
