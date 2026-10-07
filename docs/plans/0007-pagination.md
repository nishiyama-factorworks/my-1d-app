# 0007: ページネーション 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #7
- 対応する仕様: docs/specs/0007-pagination.md
- ブランチ: feat/7-pagination
- 作成日: 2026-10-08

## 1. 方針

- トップページ（`app/page.tsx`）は **Server Component のまま**にし、0006 の構成（ページ関数の中で `searchRepositories` を await し、同期の表示部品へ渡す。0006 計画 1.2 (a) の案A）を引き継ぐ。範囲外の判定（仕様 6.1）もページ関数の中で行う。
- 追加する部品はすべて `"use client"` を付けない Server Component（フック・状態・イベントを持たない）。クライアントの JS は `next/link` 以外に増やさない。
- 0004 の関数（`calculateMaxPage` `SEARCH_RESULT_LIMIT` `SEARCH_PER_PAGE` `buildSearchPath` `parseSearchParams`）をそのまま使い、最大ページ数の計算・URL の組み立てを新たに書かない。
- ページ番号の並び（番号と「…」）は**純粋関数**に切り出して表形式で単体テストし、コンポーネントはその結果を描くだけにする（`.claude/rules/20-typescript.md`「純粋関数はテストしやすい」）。
- UI は素の HTML 要素と Tailwind で作る。shadcn/ui の部品（Pagination 等）は追加しない（依存追加になるため）。
- 0006 で作った `SearchResults` の props は変えない。ページネーションは `SearchResults` の外（ページ側）で、一覧の下に置く。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| ページ番号の並び | `buildPageItems(currentPage: number, maxPage: number): PageItem[]`（名前付き export）。`features/search/lib/page-items.ts`。`type PageItem = number \| "ellipsis-start" \| "ellipsis-end"`（1.2 (a)(b)） |
| 前後に出す数 | 現在ページの前後 2 ページ（仕様 6.1 で固定）。モジュール内の非公開定数 `PAGE_WINDOW = 2`。引数にしない（未使用の将来用引数を作らない） |
| ページネーション | `Pagination({ q, currentPage, maxPage }: { q: string; currentPage: number; maxPage: number })`。`features/search/components/pagination.tsx`。Server Component。`maxPage <= 1` のとき `null` を返す（AC-8d） |
| 構造 | `<nav aria-label="ページネーション"><ul className="flex flex-wrap …"><li>前へ</li>{番号・…}<li>次へ</li></ul></nav>`（1.2 (c)） |
| 番号のリンク | `<Link href={buildSearchPath(q, n)} aria-current={n === currentPage ? "page" : undefined}>{n}</Link>`。現在ページもリンクにし、`aria-current="page"` と太字等で強調する（Q2） |
| 前へ・次へ | 押せるとき `<Link href={buildSearchPath(q, currentPage ∓ 1)}>前へ</Link>`。押せないとき（`currentPage === 1` の「前へ」、`currentPage === maxPage` の「次へ」）は **`href` を持たない** `<span role="link" aria-disabled="true">前へ</span>`（Q1。1.2 (d)） |
| 省略 | `<li><span>…</span></li>`（U+2026。リンクにしない）（Q8） |
| 範囲外の案内 | `OutOfRangeNotice({ q, target }: { q: string; target: { kind: "first" } \| { kind: "last"; page: number } })`。`features/search/components/out-of-range-notice.tsx`。`<p>指定されたページは存在しません</p>` と、`first` なら `<Link href={buildSearchPath(q, 1)}>先頭のページへ</Link>`、`last` なら `<Link href={buildSearchPath(q, page)}>{\`最終ページ（${page}ページ目）へ\`}</Link>` |
| 1,000件超の注記 | `SearchResults` の総ヒット件数の直後に `{totalCount > SEARCH_RESULT_LIMIT && <p>上位1,000件まで表示します</p>}`（Q4。1.2 (f)） |
| ページの判定 | 1.2 (e) の流れ。`calculateMaxPage(SEARCH_RESULT_LIMIT)`（=34）を超える `page` は API を呼ばない |
| ページの配置 | 通常時: `<SearchForm>` → `<SearchResults>`（件数・注記・一覧）→ `<Pagination>`。範囲外: `<SearchForm>` → `<OutOfRangeNotice>` のみ |

### 1.2 設計判断と根拠

**(a) ページ番号の並びを作る純粋関数のアルゴリズム**

1. 窓 = `[max(1, current - 2), min(maxPage, current + 2)]`。
2. 表示する番号 = `{1, maxPage} ∪ 窓`（昇順・重複なし）。
3. 隣り合う番号 `a < b` の間で、`b - a === 2`（省略される区間がちょうど 1 ページ）なら `a + 1` を番号として挟む（AC-8g）。`b - a > 2` なら「…」を挟む。前半の「…」は `"ellipsis-start"`、後半は `"ellipsis-end"`（React の `key` を一意にするため 2 種類に分ける）。
- 結果として要素数は最大 9（1・…・窓 5 つ・…・末尾）。
- 前提条件: `currentPage` と `maxPage` は整数で `1 <= currentPage <= maxPage`。呼び出し側（`Pagination` は `maxPage <= 1` で先に `null`、ページは範囲外を先に処理）が保証する。前提外の入力の結果は定めず、テストもしない（0004 Q4 の `calculateMaxPage` と同じ扱い。Q6）。
- 検算（T1 の表形式テストにそのまま使う）:

| current / max | 結果 | 根拠 |
| --- | --- | --- |
| 2 / 4 | `1 2 3 4` | AC-8a |
| 17 / 34 | `1 … 15 16 17 18 19 … 34` | AC-8e |
| 5 / 34 | `1 2 3 4 5 6 7 … 34` | AC-8g（1 と 3 の間が 2 だけ） |
| 30 / 34 | `1 … 28 29 30 31 32 33 34` | AC-8g の末尾側（32 と 34 の間が 33 だけ） |
| 6 / 34 | `1 … 4 5 6 7 8 … 34` | AC-8g の境界（1 と 4 の間は 2 ページなので省略） |
| 4 / 34 | `1 2 3 4 5 6 … 34` | 先頭付近（窓が 1 に接する） |
| 1 / 34 | `1 2 3 … 34` | 先頭 |
| 34 / 34 | `1 … 32 33 34` | 末尾 |
| 1 / 2 | `1 2` | 最小のページ数（2） |
| 4 / 7 | `1 2 3 4 5 6 7` | 窓が両端に接して省略なし |
| 1 / 7 | `1 2 3 … 7` | 省略が 3 ページ |

**(b) 純粋関数の配置: `lib/search/` か `features/search/lib/` か**

| 観点 | 案A（推奨）: `features/search/lib/page-items.ts` | 案B: `lib/search/page-items.ts`（0004 の関数群と並べる） |
| --- | --- | --- |
| 責務 | ページネーションの表示（どの番号を見せるか）という検索機能の UI 専用ロジック。利用者は `Pagination` だけ | 0004 は「画面と API クライアントから共通で使う関数群」（仕様 0004 1節）。表示の並びは画面横断でも API 側でもない |
| 前例 | 0006 の `repoPathFromFullName`（一覧専用のパス組み立て）を `features/search/lib/repo-path.ts` に置いた | 0004 の `calculateMaxPage`（`lib/search/pagination.ts`）と同じ場所で探しやすい |
| 仕様の範囲 | 0004 の仕様・AC-25 系を変えない | 0004 の公開 API（0004 計画 1.1 の表）を 0007 で広げることになる。`lib/search/pagination.ts` と名前が紛らわしい |
| ルール | `CLAUDE.md` 6節「`features/<名前>/` 機能単位のコード（components / actions / lib）」に一致 | `lib/` は「横断ユーティリティ」 |

- 推奨は案A。`calculateMaxPage` は 0004 のまま `lib/search/pagination.ts` から import し、`buildPageItems` は最大ページ数を引数で受け取るだけにして、0004 の定数に直接依存させない（テストで任意の `maxPage` を与えられる）。ファイル名は `lib/search/pagination.ts` との混同を避けて `page-items.ts` にする。

**(c) `Pagination` の構造と、リンクのアクセシブルネーム**

- `nav aria-label="ページネーション"` でナビゲーションのランドマークにする（仕様 6.1・8節）。中は `ul` / `li`（項目数が支援技術に伝わる）。
- リンク名は「前へ」「次へ」と番号（`"1"` 〜 `"34"`）。`nav` の中では名前がすべて一意になる（番号は 1 回ずつしか出ず、「…」はリンクにしない）。テストで `within(nav).getAllByRole("link").map(名前)` を**配列の完全一致**で検証するので、重複や欠落を検出できる。
- 同じ宛先に別の名前のリンクがある（例: `page=2` のとき「前へ」と「1」がどちらも `/?q=react&page=1`）のは問題にならない（名前が宛先の意味を表していれば足りる）。逆に「同じ名前で別の宛先」は起きない。
- 番号だけの名前（「5」）は、`nav` のラベル「ページネーション」の中にあるので文脈が伝わる。`aria-label="5ページ目"` のように名前を変える案もあるが、仕様の文言（「ページ番号 5 のリンク」）と表示が一致する番号のままを推奨する（Q3）。0011 の AC-26 の点検で変える場合も、見えている文字列を名前に含める（ラベルと名前の一致）ことに注意する。
- ページネーションは 1 か所（一覧の下）にだけ置く。上下 2 か所に置くと同じ名前・同じ宛先のリンクが 2 組でき、ランドマークのラベルも重複するため置かない。
- `ul` に `flex flex-wrap gap-2` を付け、項目数が最大 11（前へ・9・次へ）でも幅 320px で折り返す（0011 AC-27 の手戻りを減らす。目視は T6）。
- 現在ページの強調: `aria-current="page"` に加えて太字・枠線などの見た目を付ける（AC-8a「強調され」）。見た目はテストせず、`aria-current` で検証する。
- `next/link` は `className` や `aria-*` などの `<a>` の属性をそのまま下の `<a>` に渡す（`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` 84行「`<a>` tag attributes such as `className` or `target="_blank"` can be added to `<Link>` as props and will be passed to the underlying `<a>` element.」）。したがって `aria-current="page"` は `<Link>` に付ければよい。
- 公式の「Checking active links」（同 585〜613行）は `usePathname()` を使う Client Component の例だが、`pathname` にクエリは含まれず、本件ではページ番号がサーバーで分かっているため使わない（Client Component を増やさない）。

**(d) 「前へ」「次へ」の押せない状態（`aria-disabled`）**

- 仕様 6.1「リンクにせず `aria-disabled="true"` の要素で表す」。`<Link>` / `<a href>` は使わない（遷移先を持たせない）。`aria-disabled` は HTML の `disabled` と違い、ブラウザの振る舞いを変えない属性なので、**`href` を持たないこと**で押せないことを実現する。Next.js のドキュメントには `aria-disabled` の記述が無い（`node_modules/next/dist/docs` を Grep して該当なし）ため、Next.js 固有の扱いは無く、素の HTML/ARIA として扱う。
- 要素の候補（Q1）:
  - 案A（推奨）: `<span role="link" aria-disabled="true">前へ</span>`。WAI-ARIA 1.2 で `aria-disabled` を使えるロールに `link` が含まれ、支援技術は「前へ、リンク、利用不可」のように読む。`href` と `tabindex` が無いので、押せず、フォーカスも当たらない（キーボード操作で行き止まりにならない）。「リンクにせず」を「遷移するリンクにしない」と解釈する。
  - 案B: `<span aria-disabled="true">前へ</span>`（ロールなし）。仕様の文言に最も忠実。ただし WAI-ARIA 1.2 では `aria-disabled` を汎用（generic）ロールに付けるのは非推奨で、支援技術が「利用不可」を伝えない可能性が高い（見た目でしか押せないことが伝わらない）。
  - ※ WAI-ARIA の記述は外部仕様のため、承認時に人間が確認する。
- テスト（案A のとき）: `within(nav).getByRole("link", { name: "前へ" })` が `aria-disabled="true"` を持ち、`href` を持たない。押せる側（`page=2` の「前へ」）は `aria-disabled` を持たず `href="/?q=react&page=1"`。案B のときは `within(nav).getByText("前へ")` で取り、`queryByRole("link", { name: "前へ" })` が `null` であることも確かめる。
- ESLint（`eslint-config-next` の jsx-a11y の `role-supports-aria-props`）で `role="link"` と `aria-disabled` の組み合わせが通ることを T2 の Lint で確認する。

**(e) `app/page.tsx` での判定の流れ**

```
const { q, page } = parseSearchParams(await searchParams)
q === null                                   → フォームのみ（0006 AC-4b のまま）
page > calculateMaxPage(SEARCH_RESULT_LIMIT) → API を呼ばず <OutOfRangeNotice target={first}>（AC-9b）
result = await searchRepositories({ q, page, perPage: SEARCH_PER_PAGE })
maxPage = calculateMaxPage(result.totalCount)
result.totalCount >= 1 && page > maxPage     → <OutOfRangeNotice target={{ kind: "last", page: maxPage }}>（AC-9c）
それ以外（総件数 0 を含む）                    → <SearchResults> + <Pagination q currentPage={page} maxPage>（AC-9d は通常表示）
```

- 判定は仕様 6.1 の文をそのまま条件にする。`calculateMaxPage(SEARCH_RESULT_LIMIT)` はページ関数内（またはモジュール定数）で計算し、34 をリテラルで書かない（0004 の定数の変更に追従する）。
- 総件数が 1,000 を超える場合、`maxPage` は 34 で頭打ちになり（0004 の `calculateMaxPage`）、`page <= 34` は事前の判定で保証済みなので AC-9c の範囲外にはならない。
- 総件数 0 のとき `maxPage` は 0 になるが、`totalCount >= 1` の条件で範囲外にしない（AC-9d）。`Pagination` は `maxPage <= 1` で `null` を返すので表示されない。
- 範囲外のときは `SearchResults`（件数・注記・一覧）と `Pagination` を描かない（仕様 6.1）。`main` の `h1`（アプリ名）はページの枠として残す（Q7）。
- 例外（`GitHubApiError`）は 0006 どおり `try/catch` しない。AC-9b の分岐では API を呼ばないので、`page=35` で 422 → 500 になっていた 0006 の暫定挙動（0006 進捗メモの申し送り）が解消される。
- ページは「解釈 → 判定 → 取得 → 表示部品へ渡す」だけで、`.claude/rules/10-nextjs.md`「`page.tsx` はデータ取得と表示の組み立てのみ」に沿う。判定は 2 段（API の前と後）に分かれ、前段は「API を呼ばない」ことが要件そのもののため、純粋関数に切り出さずページ関数に書き、ページ単位のテスト（モックの呼び出し有無）で検証する。
- `PageProps<"/">` の型と `searchParams` が Promise であることは変えない（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` 117〜121行・125〜140行）。`searchParams` の利用でページは動的レンダリングのまま（同 119行）。

**(f) 1,000件超の注記の置き場所**

- 仕様 6.1 は「1,000件超のときは注記」とだけ定め、位置は定めていない。
- 推奨: `SearchResults` の総ヒット件数の直後に置く（「総ヒット件数: 50,000 件」→「上位1,000件まで表示します」の順で、件数と上限の関係が読み取りやすい）。`SearchResults` はすでに `totalCount` を受け取っているので props は変わらない。範囲外のときは `SearchResults` ごと描かないので、注記も自然に出ない。
- 別案: 独立した部品にして一覧とページネーションの間に置く（ファイルが 2 つ増える）。Q4。
- 条件は `totalCount > SEARCH_RESULT_LIMIT`（ちょうど 1,000 では出さない。仕様 6.1）。比較の値は 0004 の定数を使う。

**(g) Server Component のテスト方法**

- `Pagination` `OutOfRangeNotice` `SearchResults` は同期の Server Component なので、`render(<Pagination … />)` でそのまま描画できる。
- ページは async なので、0005・0006 と同じく `render(await Page({ params, searchParams }))` で描画する（`app/page.test.tsx` の `renderPage`）。Next.js の Vitest ガイドは「async な Server Component は Vitest が未対応。同期の Server/Client Component の単体テストは可能」としている（`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` 9行）。ページの子はすべて同期の部品にするので、この方法が引き続き使える。
- リンクのクリックはテストしない（0006 計画 1.2 (f)。Vitest では `next/link` が Pages Router 版に解決され、ルーターの無い jsdom でクリックすると例外になり、本番の挙動を表さない）。AC-8f の「遷移する」は `href` の完全一致で検証し、実際の遷移は T6 の手動確認で補う。

**(h) `next/link` のプリフェッチとスクロール（手動確認の観点）**

- プリフェッチ: 既定（`"auto"`）では、動的なルートは「最も近い `loading.js` の境界まで」を先読みする（`link.md` 298〜304行。本番のみ）。`/` は `searchParams` により動的で、現時点で `loading.tsx` は無いので、ページネーションのリンク（最大 11 個）が画面に入ってもページ関数（`searchRepositories`）は実行されない見込み。0006 の申し送り（認証なしの検索 API は 1 分 10 回）に関わるため、T6 で `next start` のサーバー側の呼び出しが増えないことを確認する。
- スクロール: 既定では「新しいページが画面内に見えていればスクロール位置を保つ」（`link.md` 232行）。一覧の下のページネーションから移動すると、移動後も下端付近に留まる可能性がある。仕様に定めが無いため本計画では変えず、T6 で挙動を記録して提案 P2 とする。

**(i) `app/page.test.tsx` の既存テストへの影響**

- 既存の 13 件（0002 AC-21b、0005 AC-1・AC-22c×3、0006 AC-4a×3・AC-4b×4・仕様 6.1）は**検証内容を変えない**。
  - `beforeEach` の既定値 `{ totalCount: 0, items: [] }` は AC-9d の分岐（通常表示・ページネーションなし）に入る。`AC-22c: /?q=react&page=3` も総件数 0 なので範囲外にならず、入力欄の初期値の検証はそのまま通る。
  - `AC-4a: 検索結果（総ヒット件数と行）` は総件数 12345・`page=1` なので、ページネーション（`1 2 3 … 34`）が加わる。検証は `getByText("総ヒット件数: 12,345 件")` と `getByRole("link", { name: "vercel/next.js" })` の完全一致なので影響しない（注記「上位1,000件まで表示します」も加わるが検証対象外）。
  - `AC-4b` は `q` が無いので変化なし（`queryByRole("list")` が `null` のまま）。
- 新しいテストでは、ページネーションの `ul` と一覧の `ul` が同時に出るため、`getByRole("list")` を画面全体に使わず、`within(getByRole("navigation", { name: "ページネーション" }))` で範囲を絞る。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `features/search/lib/page-items.ts` / `page-items.test.ts` | `buildPageItems`（T1） |
| 新規 | `features/search/components/pagination.tsx` / `pagination.test.tsx` | `Pagination`（T2） |
| 新規 | `features/search/components/out-of-range-notice.tsx` / `out-of-range-notice.test.tsx` | `OutOfRangeNotice`（T3） |
| 変更 | `features/search/components/search-results.tsx` / `search-results.test.tsx` | 1,000件超の注記を追加（既存テストの検証内容は維持）（T4） |
| 変更 | `app/page.tsx` / `app/page.test.tsx` | 範囲外の判定、`Pagination` / `OutOfRangeNotice` の組み込み、AC-8・AC-9 のページ単位のテスト追加（既存テストは維持）（T5） |
| 変更 | `docs/architecture.md` | 3節にページネーション・範囲外の案内と判定の場所を追記（T6） |
| 変更なし | `lib/search/`、`lib/github/`、`features/search/components/search-form.tsx`、`features/search/lib/repo-path.ts`、`next.config.ts`、`package.json`、ロックファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [ ] **T1: ページ番号の並びを作る純粋関数**
  - 対応 AC: AC-8a、AC-8e、AC-8g（並びの決定）
  - 先に書くテスト: `features/search/lib/page-items.test.ts`（`// @vitest-environment node`。`it.each` の表形式。期待値は配列リテラル）
    - `AC-8a: 現在 2・最大 4 のとき [1, 2, 3, 4] になる`
    - `AC-8e: 現在 17・最大 34 のとき 1、…、15〜19、…、34 になる`
    - `AC-8g: 現在 5・最大 34 のとき 1〜7、…、34 になり、1 と 3 の間の 2 は省略しない`
    - `AC-8g: 現在 30・最大 34 のとき 1、…、28〜34 になり、32 と 34 の間の 33 は省略しない`
    - `AC-8g: 現在 6・最大 34 のとき 1 と 4 の間（2 ページ）は「…」になる`（境界）
    - `AC-8e: 先頭・末尾付近（現在 1 / 4 / 34、最大 34）でも 1 と 34 を常に含み、窓は範囲内に収まる`
    - `AC-8e: 最大 2・7 のような少ないページ数でも番号が重複しない`（1/2、4/7、1/7）
  - RED: `return []` だけの仮実装を置き、期待値の不一致で全件失敗することを確認する（import エラーでの失敗は RED と認めない）。
  - 実装対象: `features/search/lib/page-items.ts`、`features/search/lib/page-items.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T2: ページネーションのコンポーネント**
  - 対応 AC: AC-8a、AC-8b、AC-8c、AC-8d、AC-8e、AC-8f、AC-8g（コンポーネント単位）
  - 先に書くテスト: `features/search/components/pagination.test.tsx`（jsdom。モックなし）
    - `AC-8a: 最大 4・現在 2 のとき、ラベル「ページネーション」の nav に「前へ」「1」「2」「3」「4」「次へ」のリンクがこの順に並ぶ`（`getByRole("navigation", { name: "ページネーション" })`、`within(nav).getAllByRole("link")` の名前の配列を完全一致）
    - `AC-8a: 現在ページの 2 だけに aria-current="page" が付く`（2 は `toHaveAttribute("aria-current", "page")`、1・3・4 は `not.toHaveAttribute("aria-current")`）
    - `AC-8b: 現在 1 のとき「前へ」は aria-disabled="true" で href を持たず、「次へ」は /?q=react&page=2 へのリンクである`
    - `AC-8c: 最大 4・現在 4 のとき「次へ」は aria-disabled="true" で href を持たず、「前へ」は /?q=react&page=3 へのリンクである`
    - `AC-8b/8c: 押せる「前へ」「次へ」には aria-disabled が付かない`（現在 2・最大 4。補強）
    - `it.each`: `AC-8d: 最大ページ数が $maxPage のときページネーションを表示しない`（`maxPage` 1 と 0。`queryByRole("navigation")` が `null`。0 は AC-9d で総件数 0 のときに渡る値）
    - `AC-8e: 最大 34・現在 17 のとき、項目は 前へ・1・…・15〜19・…・34・次へ の順になる`（`within(nav).getAllByRole("listitem").map(textContent)` を完全一致。「…」はリンクでないことも `getAllByRole("link")` の名前で確かめる）
    - `AC-8g: 最大 34・現在 5 のとき、項目は 前へ・1〜7・…・34・次へ の順になる`
    - `AC-8f: 検索 q=react で、ページ番号 5 のリンク先は /?q=react&page=5 である`（最大 34・現在 4。`toHaveAttribute("href", "/?q=react&page=5")`。期待値は文字列リテラル）
    - `AC-8f: q に空白を含むときもリンク先が二重に符号化されない`（`q="a b"` → 番号 2 の `href` が `/?q=a+b&page=2`。補強）
  - RED: `Pagination` を `<nav />` だけを返す仮実装にし、要素が見つからないことで失敗することを確認する（AC-8d の 2 件も、仮実装が `nav` を返すため `null` にならず失敗することを確認する）。
  - 実装対象: `features/search/components/pagination.tsx`、`features/search/components/pagination.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm lint` PASS（`role="link"` と `aria-disabled` の組み合わせが jsx-a11y で通ること）、`bash scripts/verify.sh --quick` PASS。

- [ ] **T3: 範囲外ページの案内コンポーネント**
  - 対応 AC: AC-9b、AC-9c（表示部分）
  - 先に書くテスト: `features/search/components/out-of-range-notice.test.tsx`（jsdom。モックなし）
    - `AC-9b: 先頭ページへの案内のとき「指定されたページは存在しません」と、/?q=react&page=1 への「先頭のページへ」リンクを表示する`
    - `AC-9c: 最終ページ 2 への案内のとき「指定されたページは存在しません」と、/?q=react&page=2 への「最終ページ（2ページ目）へ」リンクを表示する`（リンク名は完全一致）
    - `AC-9b/9c: 案内のリンクは 1 つだけである`（`getAllByRole("link")` が 1 件。補強）
  - RED: `<div />` だけを返す仮実装で、要素が見つからないことで失敗することを確認する。
  - 実装対象: `features/search/components/out-of-range-notice.tsx`、`features/search/components/out-of-range-notice.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T4: 1,000件超の注記**
  - 対応 AC: AC-9a（注記の部分）
  - 先に書くテスト: `features/search/components/search-results.test.tsx` に追加
    - `it.each`: `AC-9a: 総件数が $totalCount のとき「上位1,000件まで表示します」を表示する`（1001、50000）
    - `it.each`: `AC-9a: 総件数が $totalCount のとき注記を表示しない`（1000、0。`queryByText("上位1,000件まで表示します")` が `null`。ちょうど 1,000 では出さない＝仕様 6.1）
    - 既存の 7 件は検証内容を変えない（`AC-7` の 12345 では注記が加わるが、`getByText("総ヒット件数: 12,345 件")` の完全一致には影響しない）。
  - RED: 実装前に実行し、表示する側の 2 件が失敗し、表示しない側の 2 件と既存 7 件が通ることを確認する。表示しない側の検出力は、一時的に条件を `>=` にして 1000 の件が失敗することで確かめ、戻す。
  - 実装対象: `features/search/components/search-results.tsx`、`features/search/components/search-results.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T5: トップページでの範囲外の判定とページネーションの組み込み**
  - 対応 AC: AC-8a・AC-8d・AC-9a・AC-9b・AC-9c・AC-9d（ページ単位）、既存（0002 AC-21b、0005 AC-1・AC-22c、0006 AC-4a・AC-4b・仕様 6.1）の維持
  - 先に書くテスト: `app/page.test.tsx` に追加（モック・`renderPage` は既存のものを使う。ページネーションは `within(getByRole("navigation", { name: "ページネーション" }))` で絞る）
    - `AC-8a: 総件数 100・/?q=react&page=2 のとき、一覧の下にページネーションが表示され、2 に aria-current="page" が付く`
    - `it.each`: `AC-8d: 総件数 $totalCount のときページネーションを $label`（30 → 表示しない、31 → 表示する。境界）
    - `AC-9a: 総件数 50000 のとき、最後のページ番号は 34 で 35 は無く、「上位1,000件まで表示します」が表示される`（`within(nav).getByRole("link", { name: "34" })` があり、`queryByRole("link", { name: "35" })` が `null`）
    - `AC-9b: /?q=react&page=35 のとき検索 API を呼ばず、案内と /?q=react&page=1 への「先頭のページへ」リンクだけを表示する`（`searchRepositories` が `not.toHaveBeenCalled()`、`getByText("指定されたページは存在しません")`、検索フォームがある、`queryByText(/総ヒット件数/)`・`queryByRole("list")`・`queryByRole("navigation", { name: "ページネーション" })` が `null`）
    - `AC-9b: /?q=react&page=34 のときは検索 API を page=34 で呼び、範囲外にしない`（境界。モックは総件数 50000。案内が無く、一覧が出る）
    - `AC-9c: /?q=react&page=3・総件数 50・items が空のとき、案内と /?q=react&page=2 への「最終ページ（2ページ目）へ」リンクだけを表示する`（`searchRepositories` は 1 回・`page: 3` で呼ばれる。件数・一覧・ページネーションが無い）
    - `AC-9c: /?q=react&page=2・総件数 50 のときは範囲外にしない`（境界。案内が無い）
    - `AC-9d: /?q=react&page=2・総件数 0 のとき、範囲外の案内を出さず「総ヒット件数: 0 件」と空の一覧を表示する`（`queryByText("指定されたページは存在しません")` が `null`、`listitem` が 0 件、ページネーションが無い）
    - 既存の 13 件は検証内容を変えない（1.2 (i)）。
  - RED: `app/page.tsx` を変更する前に実行し、AC-8a・AC-8d（31 件）・AC-9a・AC-9b（page=35）・AC-9c（page=3）が失敗し、AC-8d（30 件）・AC-9b/9c の境界・AC-9d・既存 13 件が通ることを確認する。通る側の検出力は、変更後に一時的に次の変異を入れて対応するテストが失敗することで確かめ、戻す: (1) 前段の判定を `>=` にする → AC-9b の境界（page=34）が失敗、(2) `totalCount >= 1` の条件を外す → AC-9d が失敗（既存の AC-22c は入力欄の値しか見ないので通る。AC-9d のテストが必要な理由）、(3) 後段の判定を `>=` にする → AC-9c の境界（page=2）が失敗。
  - 実装対象: `app/page.tsx`、`app/page.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T6: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節の `features/search/` に「ページネーション（`components/pagination.tsx`、番号の並びは `lib/page-items.ts`）」「範囲外ページの案内（`components/out-of-range-notice.tsx`）。範囲外の判定は `app/page.tsx` が行い、`page` が `calculateMaxPage(SEARCH_RESULT_LIMIT)` を超えるときは API を呼ばない」を追記）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - 手動確認（`pnpm build` → `pnpm start`。PR に結果を書く）:
      - `/?q=react&page=17` で `1 … 15 16 17 18 19 … 34` と注記が表示される。番号・前へ・次へを押すと `/?q=react&page=<n>` へ遷移し、結果が変わる。
      - キーボード（Tab）で前へ・番号・次へに順にフォーカスでき、押せない「前へ」「次へ」にはフォーカスが止まらない。Enter で移動できる。
      - `/?q=react&page=35` で案内と「先頭のページへ」が出て、サーバーの GitHub への呼び出しが発生しない（422 → 500 にならない）。
      - 総件数が少ないキーワード（例: 最大 2 ページ）で `page=3` を開くと「最終ページ（2ページ目）へ」が出る。
      - ページネーションが画面に入っても、リンクの先読みで検索 API の呼び出しが増えない（1.2 (h)。開発者ツールのネットワークとサーバーの挙動で確認）。
      - 一覧の下で番号を押したときのスクロール位置（上端に戻るか、下端に留まるか）を記録する（1.2 (h)。提案 P2 の判断材料）。
      - 幅 320px 程度でページネーションが折り返し、横にはみ出さない。
      - 認証なしの検索 API の制限（1 分 10 回。0006 進捗メモ）に注意し、確認の回数を抑える。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: 範囲外の案内を `role="status"`（または `role="alert"`）にする。0011 の AC-26d（範囲外ページの状態メッセージが支援技術に伝わる）の範囲。0011 で付けるとき、T3・T5 のテストの取り方（`getByText`）はそのまま使える。
- P2: ページ移動後に一覧の先頭へスクロール（またはフォーカス）を移す。`next/link` の既定のスクロールの挙動（1.2 (h)）によっては下端に留まる。0011 の AC-26b（キーボード操作）と合わせて判断する。
- P3: 範囲外のページで HTTP ステータスを 404 にする、または `noindex` を付ける。仕様は案内の表示だけを定めている。
- P4: ページ番号のリンク名を「5ページ目」のように補う（`aria-label`）。Q3 の別案。0011 の AC-26 の点検で判断する。
- P5: `calculateMaxPage(SEARCH_RESULT_LIMIT)` を 0004 の `lib/search/constants.ts` に `SEARCH_MAX_PAGE` として定義する。0004 の公開 API の変更になるため採らない。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 単体 | `buildPageItems`（窓・先頭末尾・省略・1 ページだけの区間・端） | `features/search/lib/page-items.test.ts` | node | なし |
| コンポーネント | `Pagination`（nav・ラベル・順序・`aria-current`・押せない状態・非表示・リンク先） | `features/search/components/pagination.test.tsx` | jsdom | なし |
| コンポーネント | `OutOfRangeNotice`（文言・導線 2 種） | `features/search/components/out-of-range-notice.test.tsx` | jsdom | なし |
| コンポーネント | `SearchResults` の注記（境界 1000/1001） | `features/search/components/search-results.test.tsx` | jsdom | なし |
| 結合（ページ） | `app/page.tsx`（範囲外の 2 段の判定、API 未呼び出し、総件数 0、組み込み） | `app/page.test.tsx` | jsdom | `@/lib/github` の `searchRepositories`（既存のファクトリ差し替え）、`next/navigation` の `useRouter`（既存） |
| 手動 | 遷移、キーボード、先読み、スクロール、狭い画面 | T6 | `next start` | なし（実 API） |
| E2E | なし（0013 で任意） | — | — | — |

- 要素の取得は role / label / text。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 期待値は文字列・数値・配列のリテラルで書く（`/?q=react&page=5`、`[1, "ellipsis-start", 15, …]`、`"最終ページ（2ページ目）へ"`）。`buildSearchPath` や `calculateMaxPage` を期待値の計算に使わない。
- AC-9b の「API を呼ばない」は `searchRepositories` のモックが `not.toHaveBeenCalled()` であることで検証する（GitHub API は `lib/github/` だけが呼ぶ。`docs/architecture.md` 3節）。AC-9c は「`page: 3` で 1 回呼ばれ、その結果で範囲外と判定する」ことを、呼び出しの引数と表示の両方で検証する。
- 範囲外の判定は境界（34/35、総件数 50 で page 2/3、総件数 30/31 でのページネーションの有無、注記の 1000/1001）を必ず両側テストし、比較演算子の取り違えを検出する。
- 0004 の関数と `buildPageItems` はモックしない（自分たちのモジュール同士をモックしない）。`Pagination` のテストは `buildPageItems` を通した描画結果で検証する。
- テスト間で状態を共有しない。`searchRepositories` と `push` は既存の `beforeEach` でリセットする。
- リンクのクリックは行わない（1.2 (g)）。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-8a | 前へ・次へ・1〜4、2 に `aria-current="page"` | `page-items.test.ts`、`pagination.test.tsx`、`app/page.test.tsx` | T1、T2、T5 |
| AC-8b | `page=1` で「前へ」が押せない | `pagination.test.tsx` | T2 |
| AC-8c | 最終ページで「次へ」が押せない | `pagination.test.tsx` | T2 |
| AC-8d | 最大ページ数 1 以下で非表示 | `pagination.test.tsx`、`app/page.test.tsx` | T2、T5 |
| AC-8e | 1・…・15〜19・…・34 | `page-items.test.ts`、`pagination.test.tsx` | T1、T2 |
| AC-8f | 番号 5 → `/?q=react&page=5` | `pagination.test.tsx` | T2 |
| AC-8g | 省略が 1 ページだけなら番号（1〜7 … 34） | `page-items.test.ts`、`pagination.test.tsx` | T1、T2 |
| AC-9a | 総件数 50000 で最大 34、注記 | `search-results.test.tsx`、`app/page.test.tsx` | T4、T5 |
| AC-9b | `page=35` で API を呼ばず「先頭のページへ」 | `out-of-range-notice.test.tsx`、`app/page.test.tsx` | T3、T5 |
| AC-9c | 総件数 50・`page=3` で「最終ページ（2ページ目）へ」 | `out-of-range-notice.test.tsx`、`app/page.test.tsx` | T3、T5 |
| AC-9d | 総件数 0 は範囲外にしない | `app/page.test.tsx` | T5 |
| （既存: 0002 AC-21b、0005 AC-1・AC-22c、0006 AC-4a・AC-4b・仕様 6.1・AC-5〜AC-10） | 検証内容を維持 | `app/page.test.tsx`、`search-results.test.tsx` | T4、T5 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 範囲外の判定の比較演算子・条件の誤り（`>=`、`totalCount >= 1` の欠落） | 最終ページが案内になる／総件数 0 で案内が出る（AC-9d 違反）／`page=35` で API を呼ぶ | 境界の両側をページ単位でテストし、T5 で一時的な変異により検出力を確かめる |
| `page > 34` の判定より前に API を呼ぶ実装になる | 422 → 500、レート制限の消費（0006 の申し送り） | AC-9b を `not.toHaveBeenCalled()` で検証。判定を API 呼び出しより前に置く |
| 押せない「前へ」「次へ」を `<Link>` のまま残す、または `href` を付ける | 押せてしまう、`page=0`／`page=35` へのリンクができる | `href` が無いことと `aria-disabled="true"` をテストする（AC-8b・8c） |
| `aria-disabled` が支援技術に伝わらない要素になる | 押せないことが音声で伝わらない（0011 AC-26 で手戻り） | Q1 で要素を決める（推奨は `role="link"` を付ける） |
| ページ番号の並びの端の誤り（番号の重複、窓が 1 未満・最大超え、AC-8g の取り違え） | 番号が二重に出る、存在しないページへのリンク | T1 で端（1・4・6・30・34、最大 2・7）を表形式で網羅。T2 で描画結果も完全一致 |
| ページネーションの `ul` と一覧の `ul` が同時に出る | ページ単位のテストで `getByRole("list")` が複数一致して失敗 | `nav` の中に絞って取得する（1.2 (i)）。既存テストは `q` なし・総件数 0 のため影響しない |
| `next/link` の先読みで検索 API が呼ばれる | レート制限の消費（認証なしで 1 分 10 回） | 既定の `"auto"` では動的ルートは `loading.js` の境界までしか先読みしない（`link.md` 302行）。T6 で実地確認。0010 で `loading.tsx` を置いた後も同じ確認を申し送る |
| 移動後のスクロール位置が下端に留まる | 新しいページの一覧の先頭が見えない | 仕様外のため変えない。T6 で記録し、提案 P2 で判断 |
| 狭い画面でページネーションがはみ出す | 0011 AC-27 で手戻り | `flex-wrap` を付け、T6 で 320px を目視 |
| 0010 で取得を非同期の子コンポーネント（`<Suspense>`）に移す | 範囲外の判定も移り、ページ単位のテスト（`render(await Page())`）が使えなくなる | 進捗メモに申し送る。判定の条件は本計画のテストで固定されているので、移す際はそれを先に移植する |
| `q` の符号化の二重適用 | リンク先の検索語が壊れる | `buildSearchPath` に正規化済みの `q` をそのまま渡す。空白を含む `q` のテスト（T2）で検出 |

## 6. ADR が必要な論点

- なし。依存パッケージの追加は無く、ページネーションの部品・判定の場所はこの機能内の実装判断で、計画と `docs/architecture.md` に記録すれば足りる。取得の構成（0006 の案A）を 0010 で `<Suspense>` に変える場合も、その計画で記録する。

## 7. 要確認事項

- [x] Q1: 押せない「前へ」「次へ」の要素。推奨は案A `<span role="link" aria-disabled="true">`（`href`・`tabindex` なし。支援技術に「利用不可のリンク」と伝わる）。案B `<span aria-disabled="true">`（仕様の「リンクにせず」に最も忠実だが、汎用要素の `aria-disabled` は WAI-ARIA 1.2 で非推奨で、支援技術に伝わらない可能性が高い）。案A は「リンクにせず」を「遷移するリンクにしない」と解釈する。仕様 6.1 の文言を補う必要があれば、仕様を先に更新する（1.2 (d)）。
- [x] Q2: 現在ページの番号をリンクにするか。推奨はリンクにして `aria-current="page"` を付ける（番号がすべて同じ形になり、テストも `getByRole("link")` で揃う。同じページへの再読み込みになるだけで害は無い）。別案はリンクにせず `<span aria-current="page">2</span>`（AC-8a の「ページ番号 1〜4 がある」はテキストで確かめる）。
- [x] Q3: ページ番号のリンク名は番号だけ（「5」）でよいか。推奨は番号だけ（仕様の文言・表示と一致し、`nav` のラベルで文脈が伝わる）。別案は `aria-label="5ページ目"`（提案 P4。0011 で判断）。
- [x] Q4: 1,000件超の注記の位置。推奨は `SearchResults` の総ヒット件数の直後（props 変更なし）。別案は独立部品として一覧とページネーションの間（1.2 (f)）。
- [x] Q5: `buildPageItems` の配置。推奨は `features/search/lib/page-items.ts`（検索機能の UI 専用で、0004 の公開 API を広げない）。別案は `lib/search/`（1.2 (b)）。
- [x] Q6: `buildPageItems` の前提外の入力（`maxPage < 1`、`currentPage` が範囲外、非整数）の結果は定めず、テストもしない、でよいか（0004 Q4 と同じ扱い。呼び出し側が前提を保証する）。
- [x] Q7: 範囲外のとき「検索フォームと案内・導線だけ」（仕様 6.1）に、ページの見出し `h1`（アプリ名）は残してよいか。推奨は残す（ページの枠で、0011 AC-26c の見出しの階層にも必要）。
- [x] Q8: 省略記号は「…」（U+2026）をそのまま文字として表示し、`aria-hidden` は付けない、でよいか（番号の飛びが支援技術にも伝わる。テストは `textContent` で検証）。
- [x] Q9: 提案 P1〜P5 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1〜Q4）を得てから T1 に入る。Q1 で仕様の文言を補う場合は先に仕様 0007 の 6.1 を更新する。
- 申し送り（後続の計画で確認する）:
  - 0009: ページネーションのリンクは `buildSearchPath(q, n)` だけで作り、0009 の持ち回り情報は付けない（ページ間の移動はトップ内で完結するため）。詳細から戻った先が `page=35` 等でも、本計画の範囲外の案内が出る。
  - 0010: 取得を `<Suspense>` で包む構成に変える場合、範囲外の 2 段の判定（API の前と後）も一緒に移し、本計画の T5 のテストを移植してから変える。`loading.tsx` を置いた後も、ページネーションのリンクの先読みで検索 API が呼ばれないことを確認する。0件の専用表示（AC-17）は AC-9d の分岐（総件数 0 は範囲外にしない）の中に置く。
  - 0011: 範囲外の案内の `role="status"`（AC-26d・提案 P1）、ページ移動後のスクロール・フォーカス（AC-26b・提案 P2）、番号のリンク名（提案 P4）、フォーカスの見た目と 320px での押しやすさ（AC-27）。
- 2026-10-08: 人間が推奨どおりで承認（Status: in-progress）。決定事項: Q1 押せない「前へ」「次へ」は `<span role="link" aria-disabled="true">`（`href`・`tabindex` なし。MDN の `aria-disabled` の対応ロールに `link` が含まれることを確認。仕様 6.1 の文言を更新済み）／Q2 現在ページの番号もリンクにして `aria-current="page"`／Q3 番号リンクの名前は数字だけ／Q4 注記は `SearchResults` の総件数の直後／Q5 純粋関数は `features/search/lib/`／Q6 前提外の入力は決めない・テストしない／Q7 範囲外でも `h1` は残す／Q8 「…」は文字として表示（`aria-hidden` なし）／Q9 提案 P1〜P5 は採らない。`/issue split` はせず 1 PR で進める。
