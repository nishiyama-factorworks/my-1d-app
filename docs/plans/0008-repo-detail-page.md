# 0008: 詳細ページ 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #8
- 対応する仕様: docs/specs/0008-repo-detail-page.md
- ブランチ: feat/8-repo-detail-page
- 作成日: 2026-10-08

## 1. 方針

- ルート `app/repos/[owner]/[repo]/page.tsx` を新規作成する。ページは **Server Component**（`"use client"` なし）で、`params` を await し、0003 の `getRepository(owner, repo)` を**ページ関数の中で** await して、同期の表示部品 `RepoDetailView` に渡す（0006 計画 1.2 (a) の案A と同じ構成。ページ単位のテストを `render(await Page(…))` で書ける）。
- URL の `owner` `repo` は**加工せず**に `getRepository` へ渡す。形式の検証と符号化は 0003（`lib/github/client.ts` の `OWNER_PATTERN` `REPO_PATTERN` と `encodeURIComponent`）に任せ、ページ側で検証・パス組み立てをしない（仕様 6.2・8節）。
- 例外は `GitHubApiError` の `kind === "NOT_FOUND"` のときだけ `notFound()`（`next/navigation`）を呼び、それ以外（`RATE_LIMIT` `VALIDATION` `UPSTREAM` `NETWORK`、`GitHubApiError` 以外の例外を含む）は**同じインスタンスのまま再 throw** する（仕様 4.2・AC-20a/20b。0006 と同じく専用表示は 0010）。
- 0004 の `formatNumber` `formatLanguage`（`lib/search/format.ts`）をそのまま使い、桁区切り・言語の `-` 表示を新たに書かない。
- 表示部品は `features/repo-detail/components/repo-detail-view.tsx` に置く。フック・状態・イベントを持たない、props を描くだけの Server Component にする。
- オーナーアイコンは `next/image`（`next.config.ts` の `remotePatterns` は 0006 で設定済み。変更しない）、「トップへ戻る」は `next/link`、「GitHub で開く」は外部 URL のため素の `<a>`（1.2 (c)）。
- UI は素の HTML 要素と Tailwind で作る。shadcn/ui の部品は追加しない（依存追加になるため）。
- `metadata`（0011）、`loading.tsx` / `not-found.tsx` / `error.tsx`（0010）、検索条件の持ち回り（0009）は作らない。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| ルート | `app/repos/[owner]/[repo]/page.tsx`（`export default async function RepoDetailPage({ params }: PageProps<"/repos/[owner]/[repo]">)`）。`PageProps` はグローバルの型ヘルパ（`pnpm typecheck` が `next typegen` で生成。`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` 123〜140行） |
| 取得 | `const { owner, repo } = await params;` → `getRepository(owner, repo)`（`import { getRepository } from "@/lib/github"`）。1 リクエストにつき 1 回 |
| NOT_FOUND の判定 | `isGitHubApiError(e) && e.kind === "NOT_FOUND"` のとき `notFound()`。`isGitHubApiError` は `@/lib/github/errors` から import する（`server-only` を含まない。0006 の `features/search/lib/repo-path.ts` の前例と同じ。1.2 (b)・Q5） |
| 判定の書き方 | 取得部分だけを `try/catch` で囲み、`catch` 内で NOT_FOUND なら `notFound()`、それ以外は `throw e`。`notFound()` 自体は `try` の外（`catch` 節の中）で呼ぶので、自分の `try/catch` に飲み込まれない（`not-found.md` 79行） |
| 表示部品 | `RepoDetailView({ repo }: { repo: RepoDetail })`（名前付き export）。`features/repo-detail/components/repo-detail-view.tsx`。`RepoDetail` は `import type { RepoDetail } from "@/lib/github/types"`（`@/lib/github` の index は `server-only` を含む client を再 export するため、型も `types.ts` から取る。0006 の `SearchResults` と同じ） |
| 構造 | `<article>` の中に、`<h1>{repo.fullName}</h1>`、`<Image>`（アイコン）、`<dl>`（項目）、リンク 2 つ。**アイコンは `h1` の外**に置く（見出しの名前を `fullName` と完全一致させるため。0006 計画 1.2 (d) と同じ考え方） |
| アイコン | `<Image src={repo.ownerAvatarUrl} alt={repo.ownerLogin} width={80} height={80} className="rounded-full" />`。固定サイズなので `sizes` は付けない。`preload` / `unoptimized` は付けない |
| 項目 | `<dl>` の中に `<div><dt>ラベル</dt><dd>値</dd></div>` を 6 組、この順: `オーナー`=`ownerLogin`、`言語`=`formatLanguage(language)`、`Star数`=`formatNumber(stargazersCount)`、`Watcher数`=`formatNumber(watchersCount)`、`Fork数`=`formatNumber(forksCount)`、`Issue数`=`formatNumber(openIssuesCount)`（1.2 (d)・Q2） |
| GitHub へのリンク | `<a href={repo.htmlUrl} rel="noopener noreferrer">GitHub で開く</a>`。`target` は付けない（同じタブ。仕様 9節の決定） |
| 戻るリンク | `<Link href="/">トップへ戻る</Link>`。宛先は固定の `/`（0009 で持ち回りを足すときに変える。Q6） |

### 1.2 設計判断と根拠

**(a) 取得の場所とテスト方法（0006 の案A を踏襲）**

- ページ関数で await し、同期の `RepoDetailView` に渡す。ページの子がすべて同期のコンポーネントになるので、0005〜0007 と同じく `render(await Page({ params: Promise.resolve({ owner, repo }), searchParams: Promise.resolve({}) }))` で描画できる（Next.js の Vitest ガイド: 「async な Server Component は Vitest が未対応」`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` 9行。ページ関数を直接呼んで await する方式で回避する）。
- 例外は `Page(...)` の Promise の reject として検証できる（`await expect(Page(...)).rejects…`）。
- 非同期の子コンポーネント + `<Suspense>` にすると、ページ単位のテストが書けず、`notFound()` もストリーミング開始後になり HTTP ステータスが 200 のままになる（`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md` 193行）。0008 の範囲では採らない。読み込み中の表示（0010）でこの構成を見直すかは 0010 の計画で判断する（申し送り）。
- ページは「`params` の取り出し → 取得 → 404 の振り分け → 表示部品へ渡す」だけで、`.claude/rules/10-nextjs.md`「`page.tsx` はデータ取得と表示の組み立てのみ」「`not-found` は `notFound()` で扱う」に沿う。

**(b) `getRepository` のモックと `server-only`、エラー判定の import 先**

- 仕様 5節の指示どおり `getRepository` をモックする。`app/repos/[owner]/[repo]/page.test.tsx` で `vi.mock("@/lib/github", () => ({ getRepository }))` と**ファクトリで丸ごと差し替え**、`importOriginal` は使わない。本物の `lib/github/index.ts` → `client.ts`（`import "server-only"`）が読み込まれないので、`vi.mock("server-only")` は不要（0006 計画 1.2 (b) と同じ）。
- モックの型: `const { getRepository } = vi.hoisted(() => ({ getRepository: vi.fn<(owner: string, repo: string) => Promise<RepoDetail>>() }))`。`RepoDetail` は `import type` で `@/lib/github/types` から取る。`any` と `as` は使わない。`beforeEach` で `mockReset()` し、既定値として正常系のフィクスチャを `mockResolvedValue` する。
- **`isGitHubApiError` を `@/lib/github` から import すると、上のファクトリに含まれないため `undefined` になり、ページが壊れる。** そこでページは `isGitHubApiError` を `@/lib/github/errors` から import する（推奨。`features/search/lib/repo-path.ts` が `GitHubApiError` を `@/lib/github/errors` から import している前例と同じ。`docs/architecture.md` 5節「型とエラー定義（`types.ts` `errors.ts`）は Client からも import できる」）。テスト側の `GitHubApiError` も `@/lib/github/errors` から import するので、ページとテストで同じクラスになり `instanceof` が成り立つ。
  - 別案: ページは `@/lib/github` からまとめて import し、テストのファクトリに `isGitHubApiError` を本物の `errors.ts` から足す。公開面（`index.ts`）に揃う利点はあるが、モックに本物を混ぜることになる（Q5）。

**(c) リンクの実装（`next/link` と素の `<a>`）**

- 「トップへ戻る」はアプリ内の遷移なので `next/link`（`.claude/rules/10-nextjs.md` の UI 規約）。
- 「GitHub で開く」は外部 URL。`next/link` は「ルート間のクライアント側の遷移とプリフェッチ」のための部品（`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` 8行）で、外部 URL には効果が無いため、素の `<a>` を使う（推奨。Q3）。`rel="noopener noreferrer"` を付け、`target` は付けない（仕様 9節: 同じタブ）。
- `href` には `repo.htmlUrl` をそのまま入れる。0003 の `mapRepositoryResponse` が `safeUrl(…, "github.com")`（https・ホスト完全一致・認証情報とポートなし。`lib/github/mappers.ts` 46〜54行・99行）で検証済みなので、ページ側で再検証・組み立てはしない（仕様 8節）。
- リンクのクリックはテストしない（0006 計画 1.2 (f)。Vitest では `next/link` が Pages Router 版に解決され、ルーターの無い jsdom でクリックすると例外になる）。`href` と属性の完全一致で検証し、実際の遷移は T3 の手動確認で補う。

**(d) ラベルと値の対の表し方とテスト**

- 仕様 6.1「項目（ラベルと値の対）」をそのまま意味づけできる `<dl>` / `<dt>` / `<dd>` を使う（推奨。Q2）。各対を `<div>` で包む（HTML で `dl` の子に `div` は許可されている。レイアウト用）。
- Testing Library では `dt` が `term`、`dd` が `definition` のロールを持つ（`aria-query` 5.3 の `termRole.js` / `definitionRole.js` で確認済み）。テストでは `getAllByRole("term")` と `getAllByRole("definition")` を順に組にした配列を作り、**配列リテラルと完全一致**で比べる。ラベルと値の取り違え（Star数と Watcher数の入れ替え等）、欠落、順序の誤りを 1 つの検証で検出できる。`data-testid` は使わない。
- 別案: `<table>` や、ラベルと値を `<p>` で並べる案。`table` は 1 件分の属性表示には過剰で、`<p>` ではラベルと値の対応が支援技術に伝わらない。

**(e) `notFound()` の検証方法**

- `notFound()` は `digest` が `NEXT_HTTP_ERROR_FALLBACK;404` のエラーを throw する（`not-found.md` 13行。実装は `next/dist/client/components/not-found.js` 25〜33行）。
- 推奨: `next/navigation` は**モックせず**本物の `notFound` を使い、`await expect(Page(...)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })` で検証する。自分たちのモジュール以外（フレームワーク）の振る舞いをそのまま通すので、「`notFound()` を呼んだ」ことと「Next.js が 404 として扱う例外である」ことを同時に確かめられる。`digest` の文字列は公式ドキュメントに明記されている値。
- AC-20b は `rejects.toBe(error)`（同じインスタンス）で検証する。`notFound()` に変換された場合は別のエラーになるので失敗する。
- 本物の `next/navigation` を jsdom で読み込めることは T2 の RED の最初に確かめる。読み込めない場合は、`vi.mock("next/navigation", () => ({ notFound }))` で `notFound` を「`digest` 付きのエラーを投げる `vi.fn`」に差し替え、`toHaveBeenCalledTimes(1)` も検証する案に切り替える（その場合は止めて報告する。Q4）。
- 「詳細の内容は表示されない」（AC-20a）は、ページ関数が reject されて描画すべき要素を返さないことで満たされる。加えて `getRepository` が 1 回だけ呼ばれたことを確かめる。

**(f) `params` の値と「加工しない」**

- `params` は Promise で、`/repos/vercel/next.js` では `{ owner: "vercel", repo: "next.js" }` に解決される（`page.md` 38〜62行）。ページは受け取った文字列をそのまま `getRepository` に渡す（`trim`・小文字化・デコード・再エンコードをしない）。
- AC-12 の「URLではなくAPIの応答（`fullName`）から取る」を検出できるよう、URL とAPIの応答で大文字小文字が異なるケース（URL `VERCEL` / `NEXT.JS`、応答 `vercel/next.js`）を補強テストに加える。URL から見出しを作る誤りと、`owner` `repo` を小文字化する誤りの両方で失敗する。
- 不正な形式（空白、`..` 等）は `getRepository` が `fetch` を呼ばずに `NOT_FOUND` を投げる（0003 AC-13c）ので、ページ側の検証は不要。ページのテストではモックするため、この経路はモックに `NOT_FOUND` を返させる AC-20a のテストでカバーされる（実際の入力検証は 0003 のテストで検証済み）。手動確認で実地に確かめる（T3）。

**(g) `features/` の配置**

- 詳細ページは検索（`features/search/`）とは別の画面で、検索状態に依存しない（仕様 7節）。`CLAUDE.md` 6節「`features/<名前>/` 機能単位」に従い、`features/repo-detail/` を新設する（推奨。Q1）。仕様・計画・ブランチの slug（`repo-detail-page`）と揃う。
- 別案: `features/search/components/repo-detail-view.tsx`（既存ディレクトリに追加）。ファイルは増えないが、検索機能と詳細表示の責務が混ざる。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `features/repo-detail/components/repo-detail-view.tsx` / `repo-detail-view.test.tsx` | `RepoDetailView`（見出し・アイコン・項目・リンク）（T1） |
| 新規 | `app/repos/[owner]/[repo]/page.tsx` / `page.test.tsx` | 詳細ページのルート。`getRepository` の呼び出し、`notFound()`、例外の再 throw（T2） |
| 変更 | `docs/architecture.md` | 3節に `features/repo-detail/` と詳細ページのルート、5節に「詳細ページの `NOT_FOUND` は `notFound()`、それ以外はそのまま投げる」を追記（T3） |
| 変更なし | `lib/github/`、`lib/search/`、`features/search/`、`app/page.tsx`、`app/layout.tsx`、`next.config.ts`、`package.json`、ロックファイル | 触らない |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: 詳細表示コンポーネント**
  - 進捗: RED（`<div />` の仮実装で 9 件すべて失敗。要素が見つからない）→ GREEN（verify --quick PASS）。変異確認: Watcher数にStar数を表示／桁区切りなし／言語の `-` なし／`rel` を外す／`target="_blank"` を付ける／戻る先の変更／alt の変更／アイコンを h1 の中に入れる／Issue数の取り違え、の 9 つすべてで検出。RED のテストは別セッション（my-app-ed）が書き、GREEN 以降をこのセッションが引き継いだ。
  - 対応 AC: AC-11a、AC-11b、AC-11c（リンクとモーダルなしの部分）、AC-13、AC-14a、AC-14b（コンポーネント単位）
  - 先に書くテスト: `features/repo-detail/components/repo-detail-view.test.tsx`（jsdom。モックなし。テストファイル内に `makeRepo(overrides: Partial<RepoDetail> = {}): RepoDetail` を置き、既定値は `fullName: "vercel/next.js"`、`ownerLogin: "vercel"`、`ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4"`、`language: "TypeScript"`、`stargazersCount: 1234567`、`watchersCount: 7`、`forksCount: 0`、`openIssuesCount: 5`、`htmlUrl: "https://github.com/vercel/next.js"`。各数値を互いに異なる値にして取り違えを検出する。対の取り出しは `getAllByRole("term")` と `getAllByRole("definition")` を順に組にするヘルパ）
    - `AC-11a: レベル1の見出しに vercel/next.js が表示される`（`getByRole("heading", { level: 1, name: "vercel/next.js" })`。名前の完全一致で、アイコンが見出しに混ざると失敗する）
    - `AC-11a: オーナーアイコンが代替テキスト vercel で表示される`（`getByRole("img", { name: "vercel" })`）
    - `AC-11a: アイコンの画像の元 URL は ownerAvatarUrl である`（補強。0006 の `search-results.test.tsx` と同じく `src` の `url` パラメータを取り出して比較）
    - `AC-11a: ラベル オーナー・言語・Star数・Watcher数・Fork数・Issue数 に、vercel・TypeScript・各数値が対で表示される`（対の配列を `[["オーナー","vercel"],["言語","TypeScript"],["Star数","1,234,567"],["Watcher数","7"],["Fork数","0"],["Issue数","5"]]` と完全一致）
    - `AC-13: Star数100・Watcher数7・Issue数5 のとき、それぞれの値が表示され、Watcher数にStar数を表示しない`（`stargazersCount: 100, watchersCount: 7, openIssuesCount: 5` を渡し、該当 3 対を完全一致。`Watcher数` の値が `"100"` でないことも明示的に確かめる）
    - `AC-14a: Star数1234567は 1,234,567、Fork数0は 0 と表示される`
    - `AC-14b: language が null のとき言語欄に - が表示される`
    - `AC-11b: 名前が「GitHub で開く」のリンクの href が htmlUrl と等しく、target を持たず、rel が noopener noreferrer である`（`toHaveAttribute("href", "https://github.com/vercel/next.js")`、`not.toHaveAttribute("target")`、`toHaveAttribute("rel", "noopener noreferrer")`）
    - `AC-11c: 名前が「トップへ戻る」のリンクの href が / で、モーダル（role="dialog"）は無い`（`toHaveAttribute("href", "/")`、`queryByRole("dialog")` が `null`）
  - RED: `RepoDetailView` を `<div />` だけを返す仮実装にし、要素が見つからないことで全件失敗することを確認する（import エラーでの失敗は RED と認めない）。
  - 実装対象: `features/repo-detail/components/repo-detail-view.tsx`、`features/repo-detail/components/repo-detail-view.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T2: 詳細ページのルート（取得・404・例外）**
  - 対応 AC: AC-12、AC-20a、AC-20b、AC-11a・AC-11c（ページ単位: 独立したページとして表示される）
  - 先に書くテスト: `app/repos/[owner]/[repo]/page.test.tsx`（jsdom。1.2 (b) のモック。`renderPage(params: { owner: string; repo: string })` で `render(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) }))`。`GitHubApiError` は `@/lib/github/errors` から import）
    - `AC-12: /repos/vercel/next.js を直接開くと getRepository("vercel", "next.js") を1回呼ぶ`（`toHaveBeenCalledTimes(1)`、`toHaveBeenCalledWith("vercel", "next.js")`）
    - `AC-12: 取得した内容（見出し・項目）がページに表示される`（見出し `vercel/next.js`、`Star数` 等の対が表示される。表示の詳細は T1 で検証済みなので代表値のみ）
    - `AC-12: 見出しはURLではなくAPIの応答（fullName）から取り、URLの owner・repo は加工せずに渡す`（補強。URL `{ owner: "VERCEL", repo: "NEXT.JS" }`、応答 `fullName: "vercel/next.js"` → `toHaveBeenCalledWith("VERCEL", "NEXT.JS")`、見出しが `vercel/next.js`。1.2 (f)）
    - `AC-11c: 詳細はモーダルではなく独立したページとして表示され、トップへ戻るリンクがある`（ページ単位で `queryByRole("dialog")` が `null`、`getByRole("link", { name: "トップへ戻る" })` の `href` が `/`）
    - `AC-20a: getRepository が NOT_FOUND で失敗したとき notFound() が呼ばれ、詳細は表示されない`（`mockRejectedValue(new GitHubApiError("NOT_FOUND", { status: 404 }))` → `await expect(Page(...)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })`。1.2 (e)）
    - `it.each`: `AC-20b: getRepository が $kind で失敗したとき notFound() を呼ばず、同じエラーをそのまま投げる`（`RATE_LIMIT`、`VALIDATION`、`UPSTREAM`、`NETWORK`。`rejects.toBe(error)`）
    - `AC-20b: GitHubApiError 以外の例外もそのまま投げる`（補強。`new Error("unexpected")` → `rejects.toBe(error)`。`kind` を見ずに `notFound()` にする誤りや、`isGitHubApiError` を経ずに `e.kind` を読む誤りを検出する）
  - RED: `page.tsx` を「`getRepository` を呼ばずに `<div />` を返す」仮実装にして実行し、AC-12・AC-11c は要素やモック呼び出しが無いことで、AC-20a・AC-20b は reject されないことで失敗することを確認する。あわせて、本物の `next/navigation` と `next/link` `next/image` がこのテストで読み込み・描画できることを確かめ、できなければ止めて報告する（1.2 (e)）。角括弧を含むパス（`[owner]/[repo]`）のテストファイルが Vitest に拾われることもこの時点で確かめる。
  - 検出力の確認（GREEN 後に一時的に変異を入れ、対応するテストが失敗することを確かめて戻す）: (1) `kind` を見ずに全例外で `notFound()` → AC-20b が失敗、(2) `catch` で握りつぶして `null` を返す → AC-20a・AC-20b が失敗、(3) 見出しを `${owner}/${repo}` から作る → AC-12 の補強が失敗。
  - 実装対象: `app/repos/[owner]/[repo]/page.tsx`、`app/repos/[owner]/[repo]/page.test.tsx`（2 ファイル）
  - 完了条件: `pnpm test`・`pnpm typecheck`（`PageProps<"/repos/[owner]/[repo]">` の型生成を含む）PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T3: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md`（3節に「`features/repo-detail/`: 詳細表示（`components/repo-detail-view.tsx`）。取得は `app/repos/[owner]/[repo]/page.tsx` が `getRepository` で行い、結果を渡す（Server Component）」、5節に「詳細ページは `GitHubApiError` の `NOT_FOUND` のときだけ `notFound()`。それ以外の例外はそのまま投げる（専用表示は 0010）」を追記）、本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - 手動確認（`pnpm build` → `pnpm start`。認証なしの場合は API の制限（コア API は 1 時間 60 回）に注意して回数を抑える。PR に結果を書く）:
      - `/repos/vercel/next.js` を直接開くと 200 で、見出し・アイコン・6 項目（桁区切り）・2 つのリンクが表示される。アイコンの画像が 400 にならない（`remotePatterns` と一致）。
      - リロードしても同じ内容が表示される（AC-12）。
      - 「GitHub で開く」を押すと同じタブで `https://github.com/vercel/next.js` が開く。「トップへ戻る」で `/` へ遷移する。
      - 言語が無いリポジトリ（実在する例を 1 件選ぶ）で `-` が表示される（AC-14b）。
      - 存在しない `/repos/vercel/this-repo-does-not-exist-0008` で Next.js 標準の 404 になる（AC-20a）。形式が不正な `/repos/a%20b/c` も 404 になる（`getRepository` が `fetch` 前に `NOT_FOUND`。0003 AC-13c）。
      - 検索結果一覧（`/?q=react`）が表示されたとき、行のリンクのプリフェッチで `getRepository` が呼ばれない（0006 の申し送り。サーバーの呼び出し回数で確認）。一覧の行から詳細へ遷移できる。
      - 幅 320px 程度で長い `owner/repo` の見出しがはみ出さない（`break-all` 等）。
    - `reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: 詳細ページに `loading.tsx` を置き、取得中の表示を出す。0010（AC-16 系）の範囲。
- P2: `getRepository` の結果をキャッシュ（`fetch` の `next.revalidate` 等）し、同じリポジトリの連続表示で API を消費しないようにする。0011（キャッシュ）の範囲。
- P3: リポジトリの説明文（`description`）やトピックの表示。仕様 0001・0008 の表示項目に無く、0003 の `RepoDetail` の型変更も必要になる。
- P4: 外部リンクであることを示すアイコンや「（GitHub、外部サイト）」の補足。0011 のアクセシビリティ点検で判断する。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| コンポーネント | `RepoDetailView`（見出し・アイコン・6 項目の対・整形・2 つのリンク・モーダルなし） | `features/repo-detail/components/repo-detail-view.test.tsx` | jsdom | なし（props を渡すだけ） |
| 結合（ページ） | `app/repos/[owner]/[repo]/page.tsx`（`params` → 取得 → 表示、`NOT_FOUND` → `notFound()`、その他の例外の再 throw） | `app/repos/[owner]/[repo]/page.test.tsx` | jsdom | `@/lib/github` の `getRepository`（ファクトリで丸ごと差し替え）。`next/navigation` はモックしない（1.2 (e)） |
| 手動 | 実 API での表示、画像、遷移、404、プリフェッチ、狭い画面 | T3 | `next start` | なし（実 API） |
| E2E | なし（0013 で任意） | — | — | — |

- 要素の取得は role / label / text。`data-testid` は使わない。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 期待値は文字列・数値のリテラルで書く（`"1,234,567"`、`"-"`、`"https://github.com/vercel/next.js"`、`"NEXT_HTTP_ERROR_FALLBACK;404"`）。`formatNumber` `formatLanguage` を期待値の計算に使わない。
- 0004 の `formatNumber` `formatLanguage` はモックしない（自分たちのモジュール同士をモックしない）。
- フィクスチャの数値は項目ごとに異なる値にし、ラベルと値の取り違えを必ず検出できるようにする（AC-13 の趣旨）。
- AC-20a/20b は Promise の reject で検証する。AC-20b は同じインスタンス（`toBe`）で、包み直し・変換が無いことを確かめる。
- テスト間で状態を共有しない。`getRepository` は `beforeEach` でリセットし、正常系の既定値を入れる。
- リンクのクリックは行わない（1.2 (c)）。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-11a | 見出し `vercel/next.js`、アイコン alt `vercel`、6 項目の対 | `repo-detail-view.test.tsx`、`page.test.tsx` | T1、T2 |
| AC-11b | 「GitHub で開く」の `href`=`htmlUrl`、`target` なし、`rel="noopener noreferrer"` | `repo-detail-view.test.tsx` | T1 |
| AC-11c | モーダルなし、「トップへ戻る」→ `/` | `repo-detail-view.test.tsx`、`page.test.tsx` | T1、T2 |
| AC-12 | URL の `owner` `repo` を加工せず 1 回取得、名前は `fullName` から | `page.test.tsx` | T2 |
| AC-13 | Star 100・Watcher 7・Issue 5 を取り違えない | `repo-detail-view.test.tsx` | T1 |
| AC-14a | `1,234,567`、`0` | `repo-detail-view.test.tsx` | T1 |
| AC-14b | 言語 `null` → `-` | `repo-detail-view.test.tsx` | T1 |
| AC-20a | `NOT_FOUND` → `notFound()` | `page.test.tsx` | T2 |
| AC-20b | `NOT_FOUND` 以外はそのまま投げる | `page.test.tsx` | T2 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| `page.test.tsx` で `getRepository` をモックし忘れる、または `importOriginal` で本物を混ぜる | 実 API を呼ぶ（遅い・不安定・レート制限）／`server-only` が評価されて import 時に失敗 | ファクトリで丸ごと差し替え、`beforeEach` で既定値を入れる（1.2 (b)） |
| ページが `isGitHubApiError` を `@/lib/github` から import する | テストのファクトリに含まれず `undefined` になり、全例外テストが想定外の理由で失敗 | `@/lib/github/errors` から import する（1.2 (b)・Q5） |
| `NOT_FOUND` 以外も `notFound()` にする／`catch` で握りつぶす | レート制限や障害が「存在しない」と誤表示される（仕様 4.2 違反）。0010 のエラー表示が働かない | AC-20b を全種別 + 非 `GitHubApiError` で検証し、T2 で変異による検出力を確かめる |
| `notFound()` を自分の `try` の中で呼ぶ | 自分の `catch` が 404 の例外を捕まえ、`notFound` が効かない（`not-found.md` 79行） | `notFound()` は `catch` 節の中で呼ぶ（1.1）。AC-20a の `digest` 検証で検出 |
| 本物の `next/navigation` が jsdom で読み込めない | AC-20a のテスト方法が使えない | T2 の RED の最初に確認し、できなければ止めて報告する（1.2 (e) の代替案） |
| `notFound()` の `digest` の文字列が Next.js の版上げで変わる | AC-20a のテストが失敗する | 公式ドキュメント（`not-found.md` 13行）に明記された値を使う。変わった場合はテスト失敗で気付ける |
| ラベルと値の取り違え（特に Watcher 数に `stargazersCount`） | AC-13 違反 | 0003 は `subscribers_count` → `watchersCount` を変換済み。表示側の取り違えは、全項目を異なる値にしたフィクスチャと対の完全一致で検出（T1） |
| 見出しを URL から作る、`owner` `repo` を加工する | 大文字小文字やエンコードの違いで誤表示、AC-12 違反 | URL と応答の大文字小文字が異なる補強テスト（T2） |
| `htmlUrl` に `target="_blank"` や `rel` 漏れ | 仕様 9節の決定違反、タブナビング | 属性の完全一致テスト（T1） |
| アイコンの URL が `remotePatterns`（`/u/**`・`?v=4`）に合わない | 画像が 400（開発モードではページが落ちる。`docs/architecture.md` 5節） | 0006 と同じ既知の制約。T3 で実地確認。0003/0011 で検証を揃えるかは 0006 の申し送りのまま |
| 一覧の行リンクのプリフェッチで `getRepository` が大量に呼ばれる | レート制限の消費（0006 の申し送り） | `loading.tsx` が無い動的ルートは既定の `"auto"` でページ関数まで先読みしない見込み（0007 計画 1.2 (h)）。T3 で実地確認し、0010 で `loading.tsx` を置く際に再確認を申し送る |
| 長い `owner/repo` の見出しが狭い画面ではみ出す | 0011 AC-27 で手戻り | 見出しに `break-all` を付け、T3 で 320px を目視 |
| 例外メッセージに内部情報が出る | 情報漏えい | `GitHubApiError` のメッセージは固定文言（0003）。本番では Next.js 標準のエラー画面がメッセージを隠す。専用表示の点検は 0010 |

## 6. ADR が必要な論点

- なし。依存パッケージの追加は無く、ルートの配置・`notFound()` による 404 の扱い・表示部品の構成はこの機能内の実装判断で、計画と `docs/architecture.md` に記録すれば足りる。`next/image` と許可ホストは 0006 で決定済み。

## 7. 要確認事項

- [x] Q1: 表示部品の配置と名前。推奨は `features/repo-detail/components/repo-detail-view.tsx` の `RepoDetailView`（検索機能と分ける。型 `RepoDetail` との名前の衝突を避けて `View` を付ける）。別案は `features/search/components/` に置く（1.2 (g)）。
- [x] Q2: ラベルと値の対を `<dl>` / `<dt>` / `<dd>`（各対を `<div>` で包む）で表し、テストを `term` / `definition` ロールの対の完全一致で書いてよいか（1.2 (d)）。
- [x] Q3: 「GitHub で開く」を `next/link` ではなく素の `<a>` にしてよいか。`.claude/rules/10-nextjs.md` は「リンクは `next/link`」とするが、`next/link` はルート間の遷移用で外部 URL には効果が無いため、外部リンクは例外と解釈する（1.2 (c)）。
- [x] Q4: `notFound()` の検証で `next/navigation` をモックせず、本物が投げるエラーの `digest`（`NEXT_HTTP_ERROR_FALLBACK;404`。公式ドキュメント記載）で確かめてよいか。読み込めない場合は `notFound` をスパイに差し替える案に切り替える（1.2 (e)）。
- [x] Q5: ページで `isGitHubApiError` を `@/lib/github/errors` から import してよいか（推奨。`repo-path.ts` の前例と同じで、テストのモックに本物を混ぜずに済む）。別案は `@/lib/github` から import し、テストのファクトリに本物の `isGitHubApiError` を足す（1.2 (b)）。
- [x] Q6: 「トップへ戻る」は表示部品の中に固定の `href="/"` で置き、0009 で宛先を変えるときに props を足す、でよいか（先回りの引数を作らない）。
- [x] Q7: アイコンの表示サイズを 80px 固定（`width={80} height={80}`、`sizes` なし）にしてよいか。仕様にサイズの定めは無い。
- [x] Q8: 提案 P1〜P4 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q1〜Q5）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定。
- 2026-10-08: 人間が計画を承認（Q1〜Q8 はすべて推奨案で確定）。Status を in-progress にし、T1 の RED から着手。
- 申し送り（後続の計画で確認する）:
  - 0009: 「トップへ戻る」の宛先は `RepoDetailView` 内の固定の `/`。検索条件の持ち回りを足すときは、宛先を props で受け取る形に変える（AC-12 の URL 単独での表示を保つ）。
  - 0010: 詳細ページの読み込み中（`loading.tsx`）・404（`not-found.tsx`）・エラー（`error.tsx`）の表示。`loading.tsx` を置くと一覧の行リンクのプリフェッチ範囲が変わるので、`getRepository` の呼び出しが増えないかを再確認する。取得を `<Suspense>` に移す場合は、`notFound()` がストリーミング開始後になり HTTP ステータスが 200 になる点に注意（`not-found.md` 193行）。
  - 0011: 詳細ページの `metadata`（タイトル）、`getRepository` のキャッシュ、外部リンクの補足（提案 P4）、320px での表示。
