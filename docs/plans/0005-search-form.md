# 0005: 検索フォーム 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #5
- 対応する仕様: docs/specs/0005-search-form.md
- ブランチ: feat/5-search-form
- 作成日: 2026-10-07

## 1. 方針

- トップページ（`app/page.tsx`）は **Server Component のまま**薄く保つ。`searchParams` を await して 0004 の `parseSearchParams` で解釈し、タイトル（`h1`）と検索フォームを並べるだけにする。
- 検索フォームは `features/search/components/search-form.tsx` の **Client Component**（`"use client"` はこのファイルだけ）。送信時に 0004 の `normalizeKeyword` で空判定し、空なら案内を出して遷移しない。空でなければ `useRouter().push(buildSearchPath(keyword, 1))` で遷移する。
- 0004 の関数（`normalizeKeyword` `parseSearchParams` `buildSearchPath` `SearchParamsInput`）をそのまま再利用し、正規化・符号化のロジックを新たに書かない。
- UI は素の HTML 要素と Tailwind で作る。shadcn/ui の部品は追加しない（依存追加は人間の承認が必要。ADR 0003 の「部品は必要になったタスクで追加」に対し、本タスクでは追加しない判断）。
- `lib/github/`（`server-only`）はフォームから読み込まない。検索 API の呼び出しは 0006 の範囲。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| コンポーネント | `SearchForm`（名前付き export）。`features/search/components/search-form.tsx` |
| props | `{ initialQuery: string }`。URL の `q` を `parseSearchParams` で正規化した値。`q` が無い（`null`）ときは `""` を渡す |
| 入力欄 | `<input type="search">`（ロールは `searchbox`）。`<label htmlFor>` で「キーワード」と関連付け（id は `useId`）。`maxLength` は付けない（仕様 6.1） |
| ボタン | `<button type="submit">検索</button>` |
| 送信方式 | `<form onSubmit>` で `preventDefault` し、`router.push(buildSearchPath(keyword, 1))`（1.2 (a)） |
| 空入力の案内 | 常に描画する `role="alert"` の要素に、空入力のときだけ「キーワードを入力してください」を入れる。入力欄には案内表示中だけ `aria-invalid="true"` と `aria-describedby=<案内の id>` を付ける（1.2 (c)） |
| 案内を消す時機 | 空でない値で送信したとき（遷移の直前）に消す。入力中には消さない（1.2 (c)、Q3） |
| ページ | `export default async function Home({ searchParams }: PageProps<"/">)`。`<SearchForm key={initialQuery} initialQuery={initialQuery} />`（1.2 (b)） |
| タイトル | 仮の定数 `APP_NAME = "GitHub リポジトリ検索"` を `lib/app-config.ts` に置く（仕様 6.1「仮の定数」。0011 の AC-28 でも使う。配置は Q4） |

### 1.2 設計判断と根拠

**(a) 送信方式の比較**

| 観点 | 案A（推奨）: Client Component + `useRouter().push(buildSearchPath(q, 1))` | 案B: `next/form`（`action` 文字列） | 案C: 素の GET `<form>` |
| --- | --- | --- | --- |
| AC-3（空なら遷移しない） | `onSubmit` で判定して `push` しないだけ | `onSubmit` で `preventDefault` すれば遷移しない（`next/dist/client/app-dir/form.js` の `onFormSubmit` は利用者の `onSubmit` 後に `event.defaultPrevented` を見て中断する） | `onSubmit` が必要＝結局 Client Component になる |
| AC-22a（前後の空白を除いて遷移） | `normalizeKeyword` の結果を渡すだけ | **満たしにくい**。`form-shared.js` の `createFormSubmitDestinationUrl` は `onSubmit` の後に `new FormData(formElement)` で DOM の値をそのまま読む。trim するには `onSubmit` 中に DOM の値を書き換える必要があり、制御コンポーネントの state と食い違う | 同左（ブラウザが DOM の値をそのまま送る） |
| AC-2a（`page=1` を付ける） | `buildSearchPath` が必ず付ける | `<input type="hidden" name="page" value="1">` が必要。キー順は DOM 順に依存 | 同左 |
| URL 表記の一致 | `buildSearchPath` は `URLSearchParams` を使うため、フォームの GET 送信（`application/x-www-form-urlencoded`）と同じ表記（空白は `+`、`&` は `%26`）。0007・0009 も同じ関数を使うので**URL の生成元が1つ**になる | `next/form` も `targetUrl.searchParams.append` で組み立てるので表記は一致するが、生成元が2つになる | 同左 |
| テストのしやすさ | `next/navigation` の `useRouter` だけを差し替えればよい | `next/form` は内部で `AppRouterContext` を直接読む（`app-dir/form.js` 21行目）。jsdom ではルーターが無く、ネイティブ送信にフォールバックして遷移を観測できない。検証には内部モジュール（`next/dist/shared/lib/app-router-context.shared-runtime`）の Provider が必要 | ネイティブ送信は jsdom で未実装 |
| JS 無効時 | 動かない（`name="q"` を付ければ素の GET 送信として最低限動く。Q2） | 素の GET フォームとして動く（progressive enhancement） | 動く |
| セキュリティ | `useRouter` の文書は「信頼できない URL を `push` に渡すな（`javascript:` が実行される）」と注意している。`buildSearchPath` は先頭が固定の `"/?"` で値は必ず符号化されるため、`javascript:` や `//evil` にならない（0004 のテストで固定済み） | 同等 | 同等 |

- 推奨は案A。AC-22a を自然に満たせること、URL の生成元を `buildSearchPath` の1つに保てること、テストで遷移先 URL を完全一致で検証できることが決め手。案B の利点（プリフェッチ、JS 無効時の動作）は仕様の要件に無い。
- 根拠: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md`（`action` が文字列のとき GET としてフォームデータを URL に符号化する。`onSubmit` で `preventDefault` すると遷移しない）、`.../04-functions/use-router.md`（`router.push(href)` は履歴に追加するクライアント遷移。信頼できない URL を渡さない注意）、実装 `next/dist/client/app-dir/form.js` 92〜145行、`next/dist/client/form-shared.js` 70〜96行。
- Enter キーでの送信（AC-2b）は、入力欄と `type="submit"` のボタンが同じ `<form>` にあることによるブラウザ標準の暗黙の送信に任せる。`onKeyDown` で Enter を拾う実装はしない（日本語 IME の変換確定の Enter で誤送信しないため。標準の暗黙の送信は変換確定では起きない）。

**(b) `app/page.tsx` の `searchParams` と入力欄の初期値**

- Next.js 16.3.8 の `page.tsx` は `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` を受け取り、`async/await` か `use` で読む（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` 67〜121行）。`searchParams` を使うとページは動的レンダリングになる（同 119行）。0006 で検索結果を描くので問題ない。
- 型は `PageProps<"/">`（同 123〜139行。グローバルの補助型。`next typegen` が `.next/types/routes.d.ts` に生成し、`params` と `searchParams` の両方を持つ）。`app/layout.tsx` の `LayoutProps<"/">` とそろえる。`Record<string, string | string[] | undefined>` は `SearchParamsInput`（`Readonly<...>`）にそのまま渡せる。
- `const { q } = parseSearchParams(await searchParams)` とし、`initialQuery = q ?? ""` を渡す。`page` はこのタスクでは使わない（0006 で使う）。
- **`key={initialQuery}` を付ける理由**: 同じページ内の `router.push` やブラウザの戻る・進むでは、Server Component が再描画されても Client Component の state は保持される。`useState(initialQuery)` の初期値は最初の描画でしか使われないため、`key` が無いと URL の `q` が変わっても入力欄が古い値のまま残り、AC-22c（URL の `q` が初期値になる）と後続の 0009 AC-15d（戻った先の入力欄が復元される）を満たせない。`use-router.md` の `bfcacheId` の節も「データから key を導く」方法を推奨している（180行）。なお `next.config.ts` で `cacheComponents` は有効にしていない。
- 同じ `q` で再送信したとき（例: `/?q=react&page=3` で `react` を検索）は `key` が変わらず再マウントされない。そのため案内の消去はイベントハンドラで明示的に行う（1.2 (c)）。

**(c) 空入力の案内とアクセシビリティ**

- 案内の要素（`<p id=... role="alert">`）は**常に描画し、中身だけを切り替える**。最初から存在する live region の中身の変化は支援技術に安定して読み上げられる。要素ごと差し込む方式より環境差が小さい。0011 の AC-26d（`role="status"` / `role="alert"`）とも一致する。
- 入力欄は案内表示中だけ `aria-invalid="true"` と `aria-describedby` を付ける。表示していないときに `aria-describedby` で空の要素を指さない。
- 案内は「空でない値で送信したとき」に消す（遷移の直前に state を戻す）。入力を始めた時点では消さない（仕様に定めが無く、最小の実装にする。Q3）。
- フォーカスは移動しない（仕様に無い）。

**(d) `next/navigation` のモック方針**

- `useRouter` は Next.js の App Router のコンテキスト（`AppRouterContext`）が無いと例外を投げる（`next/dist/client/components/navigation.js` 145〜153行: `invariant expected app router to be mounted`）。jsdom には App Router が無い。
- `router.push` の先は「ブラウザの履歴の更新」と「サーバーへの RSC 取得」で、テストのプロセスから見た**外部境界**にあたる。`.claude/rules/30-testing.md` の「モックするのはプロセス境界の外だけ」に沿い、`vi.mock("next/navigation", ...)` で **`useRouter` だけ**を差し替え、`push` の呼び出し引数（遷移先 URL）を検証する。0004 の関数など自分たちのモジュールはモックしない。
- 内部モジュール（`next/dist/shared/lib/app-router-context.shared-runtime`）の Provider で包む方法は、公開 API でなく版上げで壊れやすいので採らない。
- 書き方: `const { push } = vi.hoisted(() => ({ push: vi.fn() }))` と `vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))`。`beforeEach` で `push.mockReset()`。`as` や `any` を使わない。

**(e) 非同期のサーバーコンポーネントのテスト**

- Next.js の Vitest ガイドは「async な Server Component は Vitest が未対応なので E2E を推奨」としている（`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` 9行）。これは `render(<Page />)` のように JSX として描画する場合の話である。
- 本計画では、ページ関数を**直接呼んで await し、返った JSX を `render` する**: `render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve({ q: "react", page: "3" }) }))`。ページの子（`SearchForm`）は同期のコンポーネントなので、この方法で描画できる。T4 の RED で実際に動くことを確認する（動かない場合は T4 を止めて報告する）。
- `PageProps<"/">` は `params` も必須なので、テストでは `params: Promise.resolve({})` も渡す（型を `as` で崩さない）。
- テスト内の `SearchForm` も `useRouter` を呼ぶので、`app/page.test.tsx` にも (d) と同じモックを置く。

**(f) テストでの操作（Enter キー）**

- 現在の依存に `@testing-library/user-event` は無い（`package.json` と `node_modules/.pnpm` で確認。`@testing-library/react` `dom` `jest-dom` のみ）。
- `fireEvent.click(送信ボタン)` は jsdom で送信が起きるので AC-2a は検証できる。しかし `fireEvent.keyDown(入力欄, { key: "Enter" })` は合成イベントのため**暗黙の送信が起きない**。AC-2b を「Enter キーを押す」という操作どおりに検証するには `user-event`（`user.type(入力欄, "react{Enter}")`）が必要。
- 推奨: `@testing-library/user-event` を devDependency に追加する（Testing Library 公式・MIT・Testing Library のドキュメントが推奨する操作 API）。**依存追加のため人間の承認が必要（Q1）**。承認されない場合の代替は 4 節に記載。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `features/search/components/search-form.tsx` | `SearchForm`（Client Component） |
| 新規 | `features/search/components/search-form.test.tsx` | AC-1, 2a, 2b, 3a, 3b, 22a, 22b, 22c のコンポーネントテスト |
| 新規 | `lib/app-config.ts` | `APP_NAME`（仮の定数） |
| 変更 | `app/page.tsx` | async 化、`searchParams` の解釈、`h1` と `SearchForm` の配置 |
| 変更 | `app/page.test.tsx` | 呼び出し方の更新（AC-21b の検証内容は維持）、AC-1・AC-22c のページ単位の確認 |
| 変更 | `docs/architecture.md` | 3節に `features/search/`、5節に Client 境界（`SearchForm` のみ client）を追記 |
| 変更（Q1 承認時のみ） | `package.json`、`pnpm-lock.yaml` | `@testing-library/user-event` を devDependency に追加（`pnpm add -D` で行い、ロックファイルを手で編集しない） |
| 変更なし | `app/layout.tsx`（`metadata.title` は 0011 の AC-28）、`lib/search/`、`lib/github/`、`components/ui/`、設定ファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T0: テスト用依存の追加（Q1 が承認された場合のみ）**
  - 対応 AC: AC-2b（の検証手段）
  - 先に書くテスト: なし（依存の追加のみ）
  - 実装対象: `package.json`、`pnpm-lock.yaml`（`pnpm add -D @testing-library/user-event` で更新。承認画面で人間が許可する）
  - 完了条件: `pnpm test` と `bash scripts/verify.sh --quick` が PASS。コミットは `chore(deps): ...`。

- [x] **T1: 検索フォームの表示と初期値**
  - 対応 AC: AC-1、AC-22c（コンポーネント単位）
  - 先に書くテスト: `features/search/components/search-form.test.tsx`
    - `AC-1: ラベル「キーワード」の入力欄と「検索」ボタンが表示される`（`getByRole("searchbox", { name: "キーワード" })`、`getByRole("button", { name: "検索" })`。ラベルとの関連付けを name で確かめる。0011 AC-26a の前提にもなる）
    - `AC-1: 入力欄に文字数の上限が付いていない`（`maxLength` 属性が無い。仕様 6.1）
    - `AC-22c: initialQuery が "react" のとき入力欄の初期値が "react" になる`
    - `AC-22c: initialQuery が "" のとき入力欄は空になる`
    - `AC-1: 通常時は案内が空で、入力欄は invalid でない`（`getByRole("alert")` が空、入力欄が `toBeValid()`）
  - RED: `SearchForm` を `<form />` だけを返す仮実装にして実行し、要素が見つからない・値の不一致で失敗することを確認する（import エラーでの失敗は RED と認めない）。
  - 実装対象: `features/search/components/search-form.tsx`、`features/search/components/search-form.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T2: 送信と遷移（ボタン・Enter・正規化・符号化）**
  - 対応 AC: AC-2a、AC-2b、AC-22a、AC-22b
  - 先に書くテスト: `features/search/components/search-form.test.tsx` に追加（`push` の引数を完全一致で検証。各テストで `push` が1回だけ呼ばれることも確かめる）
    - `AC-2a: "react" を入力して「検索」ボタンを押すと /?q=react&page=1 へ遷移する`
    - `AC-2b: "react" を入力して入力欄で Enter キーを押すと /?q=react&page=1 へ遷移する`（Q1 承認時は `user.type(入力欄, "react{Enter}")`。不承認時は 4 節の代替）
    - `AC-22a: "  next.js  " で検索すると q=next.js で遷移する`（`/?q=next.js&page=1`）
    - `AC-22b: "日本語 & react" で検索すると & が %26 に符号化された URL へ遷移する`（`/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=1` と完全一致し、`new URLSearchParams(<"?" 以降>).get("q")` が `"日本語 & react"` に戻る）
    - 補強（AC-22c との結合）: `initialQuery="react"` のまま「検索」を押すと `/?q=react&page=1` へ遷移する（`/?q=react&page=3` で再検索すると1ページ目に戻る）
  - RED: 送信ハンドラを `preventDefault` だけして何もしない仮実装にし、`push` が呼ばれないことで失敗することを確認する。
  - 実装対象: `features/search/components/search-form.tsx`、`features/search/components/search-form.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T3: 空入力の案内**
  - 対応 AC: AC-3a、AC-3b
  - 先に書くテスト: `features/search/components/search-form.test.tsx` に追加
    - `it.each` 表: `AC-3a/AC-3b: 入力欄が $label のとき「検索」を押すと遷移せず案内が表示される`（`""`、`"   "`）
      - 検証: `push` が呼ばれない。`getByRole("alert")` が「キーワードを入力してください」を含む。入力欄が `toBeInvalid()`（`aria-invalid="true"`）で、`toHaveAccessibleDescription("キーワードを入力してください")`
      - 「API は呼ばれない」: `vi.stubGlobal("fetch", fetchMock)` で `fetch` を差し替え、呼ばれないことを確かめる（`afterEach` で `vi.unstubAllGlobals()`）。加えて、遷移しない（`push` 未呼び出し）ので 0006 のサーバー側の検索も走らない
    - `AC-3a: 案内の表示後にキーワードを入れて検索すると、案内が消えて遷移する`（同じ `q` で `key` が変わらない場合に案内が残らないことの確認。1.2 (b)(c)）
  - RED: 空判定をせずに `buildSearchPath(入力値そのまま, 1)` で `push` する仮実装（T2 の実装から `normalizeKeyword` の判定を外した状態）にし、`push` が呼ばれる・案内が無いことで失敗することを確認する。T2 の AC-22a が落ちない形にするため、仮実装は「trim はするが空でも push する」とする。
  - 実装対象: `features/search/components/search-form.tsx`、`features/search/components/search-form.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T4: トップページへの組み込みとスモークテストの更新**
  - 対応 AC: AC-1、AC-22c（ページ単位）、0002 の AC-21b（検証内容を維持）
  - 先に書くテスト: `app/page.test.tsx` を更新（`next/navigation` のモックを追加。描画は `render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve(...) }))`）
    - `AC-21b: トップページを描画するとプレースホルダーの見出しが表示される`（検証内容は変えない: `h1` が「GitHub リポジトリ検索」。呼び出し方だけ更新。仕様 6.1 の指示による）
    - `AC-1: トップページにラベル「キーワード」の入力欄と「検索」ボタンがある`
    - `AC-22c: URL が /?q=react&page=3 のとき入力欄の初期値が "react" になる`（`searchParams: { q: "react", page: "3" }`）
    - `AC-22c: URL に q が無いとき入力欄は空になる`（`searchParams: {}`）
  - RED: `app/page.tsx` を変更する前に新しいテストを実行し、AC-1・AC-22c が要素なしで失敗し、AC-21b が新しい呼び出し方でも通る（＝描画方法が機能している）ことを確認する。1.2 (e) の描画方法がこの時点で動かなければ止めて報告する。
  - 実装対象: `app/page.tsx`、`app/page.test.tsx`、`lib/app-config.ts`（3 ファイル）
  - 完了条件: `pnpm test` PASS、`pnpm typecheck`（`next typegen` を含む）PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T5: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節に `features/search/`: 検索フォーム、5節に「Client Component は `features/search/components/search-form.tsx` のみ。`lib/github/` を読み込まない」）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - `pnpm dev` で手動確認（PR に結果を書く）: ボタン・Enter での遷移、日本語 IME の変換確定の Enter で送信されないこと、ブラウザの戻る・進むで入力欄が URL の `q` に追従すること、空入力の案内、幅 320px 程度で崩れないこと。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: フォームを `<form role="search">`（検索ランドマーク）にする。見た目と振る舞いは変わらず、0011 の AC-26c（ランドマーク）の点検で役立つ。採るなら T1 に含める（Q5）。
- P2: 送信後に入力欄の表示を正規化後の値（`"  next.js  "` → `"next.js"`）にそろえる。現状は `q` が変わる遷移では `key` の再マウントでそろうが、同じ `q` への再送信では入力した文字列のまま残る。仕様に定めが無いので入れない。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| コンポーネント | `SearchForm`（表示・送信・空入力・初期値） | `features/search/components/search-form.test.tsx` | jsdom | `next/navigation` の `useRouter` のみ。AC-3 で `fetch` を `vi.stubGlobal` |
| 結合（ページ） | `app/page.tsx`（`searchParams` の解釈、`h1`、フォームの配置） | `app/page.test.tsx` | jsdom | `next/navigation` の `useRouter` のみ |
| 単体 | 0004 の関数 | 既存 `lib/search/*.test.ts` | node | なし（変更しない） |
| E2E | なし（0013 で任意） | — | — | — |

- 要素の取得は role / label / text（`getByRole("searchbox", { name: "キーワード" })` など）。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する（既存テストと同じ）。
- 遷移の検証は `push` の引数の**完全一致**で行い、期待値は文字列リテラルで書く（`buildSearchPath` を期待値の計算に使わない。実装と同じ関数で期待値を作ると誤りを見逃すため）。
- 0004 の関数はモックしない（自分たちのモジュール同士をモックしない）。
- **Q1 不承認時の AC-2b の代替**: (1) 入力欄と送信ボタンが同じフォームに属し（`input.form === button.form`）、ボタンが `type="submit"` であることを検証する（HTML 標準の暗黙の送信の前提条件）、(2) `fireEvent.submit(input.form)` で送信して `/?q=react&page=1` へ遷移することを検証する、(3) Enter での実際の送信は T5 の手動確認で補う。この場合、AC-2b の自動テストは「Enter キーを押す」操作そのものを再現していない点を PR に明記する。
- `vitest.setup.ts` の `cleanup` は既存のまま。`push` は `beforeEach` でリセットし、テスト間で状態を共有しない。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-1 | ラベル付き入力欄と「検索」ボタン | `search-form.test.tsx`、`app/page.test.tsx` | T1、T4 |
| AC-2a | ボタンで `/?q=react&page=1` | `search-form.test.tsx` | T2 |
| AC-2b | Enter で `/?q=react&page=1` | `search-form.test.tsx` | T2（T0 が前提。不承認時は代替） |
| AC-3a | 空なら遷移せず案内、API を呼ばない | `search-form.test.tsx` | T3 |
| AC-3b | 空白のみも AC-3a と同じ | `search-form.test.tsx` | T3 |
| AC-22a | 前後の空白を除いて遷移 | `search-form.test.tsx` | T2 |
| AC-22b | `&` を `%26` に符号化 | `search-form.test.tsx` | T2 |
| AC-22c | URL の `q` が初期値 | `search-form.test.tsx`、`app/page.test.tsx` | T1、T4 |
| （0002 AC-21b） | `h1` のタイトル（検証内容を維持） | `app/page.test.tsx` | T4 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| `key` を付けず、URL の `q` が変わっても入力欄が古い値のまま残る | AC-22c（遷移後・戻る操作後）と 0009 AC-15d が満たせない | `key={initialQuery}` を付ける（1.2 (b)）。T5 の手動確認で戻る・進むを確かめる |
| 同じ `q` への再送信で `key` が変わらず、案内が残る | 遷移後も誤った案内が表示される | 送信成功時に案内を明示的に消す。T3 にテストを置く |
| async な Server Component の描画が Vitest で動かない | 既存スモークテスト（AC-21b）が更新できない | ページ関数を await して得た JSX を `render` する（1.2 (e)）。T4 の RED で動作を確認し、動かなければ止めて報告する |
| `useRouter` を実物のまま使い、テストで例外になる | テストが実行できない | `next/navigation` の `useRouter` だけをモックする（1.2 (d)） |
| `router.push` に利用者由来の文字列を渡す | XSS・オープンリダイレクト（`use-router.md` の注意） | 遷移先は必ず `buildSearchPath` で作る（先頭固定の `"/?"`、値は符号化）。生の入力値を `push` に渡さない。security-reviewer で確認 |
| Enter を `onKeyDown` で拾う実装にする | 日本語 IME の変換確定で誤送信 | 標準の暗黙の送信に任せ、キーイベントを扱わない。T5 で IME を手動確認 |
| AC-2b を合成イベントで検証したつもりになる | Enter で送信できない不具合を見逃す | `user-event` を使う（Q1）。不承認時は代替と手動確認を PR に明記 |
| `searchParams` の利用でトップページが動的レンダリングになる | 静的配信できない | 0006 で検索結果を描くため元々動的が必要。`page.md` 119行で確認済み。仕様上の問題なし |
| フォームから `lib/github/`（`server-only`）を読み込む | ビルド失敗、トークン漏えいの経路 | フォームは `lib/search/` だけを読み込む。`architecture.md` に境界を追記（T5） |
| 狭い画面で入力欄とボタンが横にはみ出す | 0011 の AC-27 で手戻り | Tailwind で `flex-col sm:flex-row`、入力欄に `min-w-0` と `w-full` を付ける。T5 で 320px 程度を目視 |

## 6. ADR が必要な論点

- なし。送信方式（`useRouter().push` + `buildSearchPath`）はこの機能内の実装判断で、本計画 1.2 (a) とコードのコメント（「なぜ」）に残せば足りる。
- `@testing-library/user-event` の追加（Q1）はテスト専用の devDependency で、アーキテクチャ上の選択ではないため ADR は不要と考える。ただし依存追加なので人間の承認が必要。
- shadcn/ui の部品を本タスクで追加しない判断は、ADR 0003 の「部品は必要になったタスクで追加し、その都度承認を取る」の範囲内（追加しないだけ）なので、新しい ADR は不要。

## 7. 要確認事項

- [x] Q1: `@testing-library/user-event` を devDependency に追加してよいか（T0）。推奨は追加（AC-2b の「Enter キーを押す」を操作どおりに自動テストできる。Testing Library 公式・MIT）。不承認なら 4 節の代替（同一フォーム所属の検証 + `fireEvent.submit` + 手動確認）で進める。
- [x] Q2: 入力欄に `name="q"` を付けるか。推奨は付ける（JS の読み込み前・無効時に、ブラウザ標準の GET 送信で `/?q=...` へ移動でき、`parseSearchParams` が `page=1` に補い前後の空白も除くので破綻しない。追加の分岐やテストは不要）。ただし JS 無効時の動作は仕様に無いので、付けない選択もある。
- [x] Q3: 空入力の案内を「入力を始めたら消す」か。推奨は消さない（仕様に定めが無く、最小の実装にする。空でない値で送信したときには消す）。消す場合は T3 にテストを1つ足す（仕様に無い振る舞いのため、仕様への追記も必要）。
- [x] Q4: 仮のタイトル定数の置き場所。推奨は `lib/app-config.ts` の `APP_NAME`（0011 の AC-28 で `metadata` からも使う横断的な値のため `lib/`。検索機能に閉じないので `features/search/` には置かない）。別案は `app/page.tsx` 内の定数（0011 で移動が必要）。
- [x] Q5: 提案 P1（`<form role="search">`）を T1 に含めるか。推奨は含める（振る舞いは変わらず、追加の依存もない）。含める場合はテストで `getByRole("search")` を確かめる。
- [x] Q6: 提案 P2（送信後に入力欄を正規化後の値へそろえる）は採らない、でよいか。

## 8. 進捗メモ

- 2026-10-07: 計画作成（draft）。未着手。次は人間の承認（特に Q1 の依存追加）を得てから、T0（承認時のみ）→ T1 の順に始める。
- 2026-10-07: 人間が推奨どおりで承認（Status: in-progress）。決定事項: Q1 `@testing-library/user-event` を devDependency に追加（承認済み。14.6.7、MIT、最終公開 2026-09-02、ピア依存は `@testing-library/dom` のみ）／Q2 `name="q"` を付ける／Q3 入力を始めても案内は消さない（空でない値で送信したときに消す）／Q4 `lib/app-config.ts` の `APP_NAME`／Q5 `<form role="search">` を含める／Q6 送信後の入力欄の正規化は採らない。送信方式は `useRouter().push(buildSearchPath(keyword, 1))`。`/issue split` はせず 1 PR で進める。
- 2026-10-08: T0 人間承認のうえ追加: @testing-library/user-event 14.6.7（`pnpm add -D` 経由）。
