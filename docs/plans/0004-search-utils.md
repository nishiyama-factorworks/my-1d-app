# 0004: 検索ユーティリティ（純粋関数群） 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #4
- 対応する仕様: docs/specs/0004-search-utils.md
- ブランチ: feat/4-search-utils
- 作成日: 2026-10-07

## 1. 方針

- 仕様 5節の AC-25a〜AC-25k を、**副作用のない純粋関数**として `lib/search/` に実装する。依存パッケージは追加しない（zod も使わない。入力は「文字列か、文字列の配列か、未指定」の3通りしかなく、正規表現と標準 API で判定できるため）。
- サーバー（Server Component）からもクライアント（0005 のフォーム）からも読み込めるように、`server-only`・`"use client"`・Node 専用 API・DOM API・`Intl`／`toLocaleString` を使わない。
- 0003 の `lib/github/`（PR #18、未マージ・別ブランチ）には**依存しない**。0003 は `server-only`（0003 AC-23c）なので、もし 0004 が `lib/github/` から定数を読み込むと、0004 の関数をクライアントで使えなくなる。向きは「`lib/github/` → `lib/search/constants.ts`」が正しい（後述の提案 P1）。
  - なお、この計画を作った環境では `feat/3-github-api-client` ブランチの中身を読めなかった（Bash を使えないため git オブジェクトを展開できなかった）。0003 の命名・スタイル（`camelCase` の関数名、`UPPER_SNAKE_CASE` の定数、名前付き export）は、仕様 0003 と `.claude/rules/20-typescript.md` を基に揃えている。実装に入る前に、`git show feat/3-github-api-client:lib/github/<ファイル>` で 0003 の命名を確認し、ずれがあれば合わせる（T1 の作業前確認）。
- テストは関数ごとに `*.test.ts` を同じディレクトリに置き、`it.each` の表形式で書く。ファイル先頭に `// @vitest-environment node` を付ける（既定の jsdom を使わず、DOM に頼っていないこと＝サーバーでも動くことを確かめる。0002 の構成検査テストと同じやり方）。
- RED は「失敗する仮の実装（固定値を返す）」を先に置いてから確かめる。ファイルが無いことによる import エラーでの失敗は RED と認めない（`.claude/rules/00-workflow.md`）。
- 依存順: 定数 → 最大ページ数 → キーワード正規化 → URL クエリ解釈 → 表示用整形 → パス生成 → 仕様の未決事項の更新と最終確認。

### 1.1 確定する公開 API（計画の承認で確定）

すべて名前付き export。ファイルは `lib/search/` 配下（配置の別案は「7. 要確認事項」Q1）。

| ファイル | export | シグネチャ | 対応 AC | 主な利用先 |
| --- | --- | --- | --- | --- |
| `constants.ts` | `SEARCH_PER_PAGE` | `30`（`const`） | AC-25f の前提 | 0006（0003 への引数）、0007 |
| `constants.ts` | `SEARCH_RESULT_LIMIT` | `1000`（`const`） | AC-25f | 0007（AC-9a、9b） |
| `pagination.ts` | `calculateMaxPage` | `(totalCount: number) => number` | AC-25f | 0007 |
| `query.ts` | `normalizeKeyword` | `(input: string) => string \| null` | AC-25a, 25b | 0005（送信時） |
| `query.ts` | `SearchParamsInput`（型） | `Readonly<Record<string, string \| string[] \| undefined>>` | AC-25c〜e, 25k | 0005, 0006, 0009 |
| `query.ts` | `SearchQuery`（型） | `{ q: string \| null; page: number }` | 同上 | 同上 |
| `query.ts` | `parseSearchParams` | `(params: SearchParamsInput) => SearchQuery` | AC-25c, 25d, 25e, 25k（AC-25a/b を内部で利用） | 0005（AC-22c の初期値）、0006（AC-4）、0009（AC-15c） |
| `format.ts` | `formatNumber` | `(value: number) => string` | AC-25g | 0006（AC-7）、0008（AC-14a） |
| `format.ts` | `formatLanguage` | `(language: string \| null) => string` | AC-25h | 0008（AC-14b） |
| `paths.ts` | `buildSearchPath` | `(q: string, page: number) => string` | AC-25i | 0005（AC-2, 22b）、0007（AC-8f, 9b, 9c）、0009（AC-15a, 15c） |
| `paths.ts` | `buildRepoPath` | `(owner: string, repo: string) => string` | AC-25j | 0006（AC-10）、0009 |

- ページ番号の解釈（`^[1-9][0-9]*$` と安全な整数の判定）は `query.ts` 内の非公開関数にし、`parseSearchParams` を通してテストする（外から観測できる振る舞いだけを検証する。`.claude/rules/30-testing.md`）。
- バレルファイル（`lib/search/index.ts`）は作らない。利用側はファイル単位で import する（どの関数がどこにあるかを明示し、未使用 export の検出を効かせるため）。

### 1.2 設計判断と根拠

**(a) URL クエリの入力型**
- Next.js 16.3.8 の `page.tsx` は `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` を受け取る（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` で確認）。`parseSearchParams` は **await 済みのオブジェクト**を受け取る（Promise を受けると同期の純粋関数でなくなるため）。
- 同じキーが複数あるとき（`?q=a&q=b`）は配列で来る。AC-25e に従い最初の要素を使う。空配列（Next.js からは来ないが型上はあり得る）は「未指定」と同じに扱う。
- `tsconfig.json` は `noUncheckedIndexedAccess` を有効にしていないため、`value[0]` の型は `string` になってしまう。実装では最初の要素を取り出す変数の型を `string | undefined` と明示し、空配列を型のうえでも扱う。

**(b) `page` の解釈（AC-25c, 25k）**
- 採用条件: 文字列が `^[1-9][0-9]*$` に一致し、かつ `Number.isSafeInteger(Number(s))` が真。どちらかを満たさなければ `1`。
- `Number()` や `parseInt()` だけに頼らない理由: `Number(" 3")` は 3、`Number("1e3")` は 1000、`parseInt("3abc")` は 3 になり、AC-25k の「1にする」に反する。正規表現で先に形を絞ることで、先頭ゼロ・符号・指数表記・空白・小数をまとめて弾く。
- 上限で切り詰めない（仕様 9節: `page=35` はそのまま 35。範囲外の扱いは 0007）。

**(c) キーワードの正規化（AC-25a, 25b）**
- `String.prototype.trim()` を使う。ECMAScript の `trim` は Unicode の空白（U+3000 の全角空白を含む）と改行・タブを前後から取り除くので、AC-25b の全角空白にも追加の処理なしで対応できる。
- 結果が空文字なら `null` を返す（「空」を型で区別でき、0005 の空入力判定と 0006 の AC-4b「`q` なしなら API を呼ばない」を `=== null` の1通りで書ける）。
- 長さの上限は扱わない（仕様 9節で決定済み）。

**(d) 最大ページ数（AC-25f）**
- 式: `Math.ceil(Math.min(totalCount, SEARCH_RESULT_LIMIT) / SEARCH_PER_PAGE)`。
- 検算: 0→0、1→1、30→1、31→2、1000→34（1000/30=33.3… の切り上げ。34ページ目は 991〜1000件目で、GitHub API が返せる範囲）、1001→34、100000→34。
- 1ページの件数を引数にしない。仕様では 30 件固定で、引数にすると「将来用の未使用引数」になる（`.claude/rules/00-workflow.md`）。0007 が「API を呼ぶ前に範囲外か判定する」（0007 AC-9b）ときは `calculateMaxPage(SEARCH_RESULT_LIMIT)`（=34）で上限が得られる。
- 負数・`NaN` などの不正な総件数の扱いは仕様に無い（総件数は 0003 が検証した API の値）。挙動を足すかは Q4。

**(e) 数値の整形（AC-25g）— ロケール依存を避ける**

| 案 | 内容 | 評価 |
| --- | --- | --- |
| A（推奨） | 整数を10進文字列にし、正規表現で末尾から3桁ごとに `,` を入れる（`Intl` を使わない） | 実行環境の ICU データや既定ロケールに一切依存しない。サーバー（Node）とブラウザで必ず同じ文字列になり、ハイドレーションのずれが起きない。仕様の対象（0以上の整数）では十分 |
| B | `new Intl.NumberFormat("en-US")` のようにロケールを固定する | 主要ブラウザと full-icu の Node では同じ結果になるが、結果が実行環境の ICU 実装に依存する（Node の small-icu ビルドなど）。将来の ICU 更新で記号が変わる可能性もゼロではない |
| C | `toLocaleString()`（ロケール未指定） | サーバーとブラウザの既定ロケールが違うと結果が変わる（例: `de-DE` では `1.234`）。ハイドレーションのずれの典型的な原因。**採用しない** |

- 案 A では、仕様が定めない入力（小数・負数・非有限値。仕様 9節の前提）の結果は定めない。テストもしない（仕様に無い振る舞いを固定しない）。ただし実装は `String(value)` を基にし、例外を投げない形にする。
- 安全な整数の範囲（`Number.MAX_SAFE_INTEGER` 以下）では指数表記にならないので、正規表現による区切りが正しく働く。

**(f) 言語の整形（AC-25h）**
- `null` と `""` は ASCII のハイフン `"-"` を返す（仕様の表記どおり。全角ダッシュや `—` にしない）。それ以外はそのまま返す。空白だけの文字列（`" "`）の扱いは仕様に無い（Q5）。

**(g) 検索パスの生成（AC-25i）— `URLSearchParams` を使う**

| 観点 | `URLSearchParams`（推奨） | `encodeURIComponent` |
| --- | --- | --- |
| 半角空白 | `+` | `%20` |
| `&` `=` `+` `#` `%` | `%26` `%3D` `%2B` `%23` `%25`（すべて符号化） | 同じく符号化 |
| 符号化しない記号 | `*` `-` `.` `_` のみ | `!` `'` `(` `)` `*` `-` `.` `_` `~` |
| 読み取り側との整合 | Next.js の `searchParams` とブラウザの `URLSearchParams` は `application/x-www-form-urlencoded` として解釈し、`+` を空白に戻す。どちらの方式で作っても**同じ値に戻る** | 同左 |
| フォーム送信との一致 | GET の `<form>`（0005 で `next/form` などを使う場合）をブラウザが送信すると、空白は `+` になる。`URLSearchParams` なら**フォーム送信とリンクで同じ URL 文字列**になる | 空白の表記がフォーム送信と食い違い、同じ検索に2種類の URL ができる |

- 理由のまとめ: (1) フォーム送信の URL と表記が一致し、0005 AC-2/22b・0007 AC-8f のテストで期待値を1通りに書ける、(2) クエリ文字列の組み立て専用の標準 API で、キーと値の符号化漏れが起きない、(3) キーの順序は追加順が保証されるので、常に `q` → `page` の順になる。
- 生成する形: `"/?" + new URLSearchParams([["q", q], ["page", String(page)]]).toString()`。`page` は 1 でも省略しない（AC-25i）。
- AC-25i の期待値: `buildSearchPath("日本語 & react", 2)` → `/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2`。テストでは完全一致に加え、`new URLSearchParams(<"?" 以降>).get("q")` で元のキーワードに戻ることも確かめる。

**(h) 詳細パスの生成（AC-25j）— `encodeURIComponent` を使う**
- パスの区切り（セグメント）に値を入れるので、クエリ用の `URLSearchParams` は使わない。パス中の `+` は空白ではなく文字どおりの `+` として扱われるため、空白を `+` にする方式だと意味が変わる。`encodeURIComponent` は空白を `%20`、`/` `?` `#` `%` を符号化するので、値がセグメントの外へはみ出さない。
- 生成する形: `` `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` ``。`.`（`next.js` の点）は符号化されず、`/repos/vercel/next.js` になる。

**(i) オープンリダイレクトを防ぐ性質（0009 AC-15c で使われる）**
- `buildSearchPath` と `buildRepoPath` は、先頭が固定の文字列リテラル（`/?` と `/repos/`）で、利用者由来の値は必ず符号化した後に連結する。このため、`q` に `https://evil.example` や `//evil.example`、`\evil.example` が入っても、戻り値は常に `/` 1文字で始まり、2文字目は `?` または `r` になる（`//` で始まるプロトコル相対 URL にならない）。この性質をテストで固定する（T6 の表に外部 URL 形式の入力を含める）。
- 0009 の「`q` が空なら `/`」は 0004 の範囲外。0009 で `parseSearchParams` の結果が `q === null` なら `/`、そうでなければ `buildSearchPath(q, page)` を使う形で組み立てられる（Q6）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `lib/search/constants.ts` | `SEARCH_PER_PAGE`、`SEARCH_RESULT_LIMIT` |
| 新規 | `lib/search/pagination.ts` / `pagination.test.ts` | `calculateMaxPage`（AC-25f） |
| 新規 | `lib/search/query.ts` / `query.test.ts` | `normalizeKeyword`、`parseSearchParams`、型 `SearchParamsInput` `SearchQuery`（AC-25a〜e, 25k） |
| 新規 | `lib/search/format.ts` / `format.test.ts` | `formatNumber`、`formatLanguage`（AC-25g, 25h） |
| 新規 | `lib/search/paths.ts` / `paths.test.ts` | `buildSearchPath`、`buildRepoPath`（AC-25i, 25j） |
| 変更 | `docs/specs/0004-search-utils.md` | 9節「関数名・ファイル配置」の未決事項を、承認された計画の内容で解決済みにする。変更履歴に追記 |
| 変更なし | `app/`、`lib/utils.ts`、`lib/github/`（0003）、設定ファイル | 触らない。依存パッケージの追加なし |

## 3. タスク（1 タスク = 1 コミットの大きさ）

- [x] **T1: 定数と最大ページ数の計算**
  - 対応 AC: AC-25f
  - 作業前確認: `git show feat/3-github-api-client:lib/github/...` で 0003 の命名（関数名・定数名・ファイル名の付け方）を確認し、本計画の名前と大きくずれる場合は実装前に報告する（コードは参照のみ。import しない）。
  - 先に書くテスト: `lib/search/pagination.test.ts`（`// @vitest-environment node`）
    - `it.each` 表: `AC-25f: 総件数が $totalCount のとき最大ページ数は $expected になる`（0→0、1→1、30→1、31→2、1000→34、1001→34、100000→34）
    - `AC-25f: 1ページの件数は30件、検索結果の上限は1000件である`（`SEARCH_PER_PAGE === 30`、`SEARCH_RESULT_LIMIT === 1000`。AC-25f の前提「1ページ30件」を固定する）
  - RED: `calculateMaxPage` を常に `0` を返す仮実装にして実行し、0 以外の行が期待値の不一致で失敗することを確認する。
  - 実装対象: `lib/search/constants.ts`、`lib/search/pagination.ts`、`lib/search/pagination.test.ts`（3 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: キーワードの正規化**
  - 対応 AC: AC-25a、AC-25b
  - 先に書くテスト: `lib/search/query.test.ts`（`// @vitest-environment node`、`describe("normalizeKeyword")`）
    - `AC-25a: "  react  " を正規化すると "react" になる`
    - `it.each` 表: `AC-25b: $label を正規化すると null になる`（`""`、`"   "`（半角空白）、`"　"`（全角空白 U+3000））
    - 仕様の範囲内の補強: 内側の空白は残る（`" next js "` → `"next js"`。AC-25a の「前後の空白の除去のみ」の確認）
  - RED: `normalizeKeyword` を入力をそのまま返す仮実装にし、AC-25a と AC-25b が不一致で失敗することを確認する。
  - 実装対象: `lib/search/query.ts`、`lib/search/query.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T3: URL クエリの解釈（`parseSearchParams`）**
  - 対応 AC: AC-25c、AC-25k、AC-25d、AC-25e、AC-25l
  - 先に書くテスト: `lib/search/query.test.ts` に `describe("parseSearchParams")` を追加
    - `it.each` 表: `AC-25c: page が $label のとき page=1 になる`（未指定＝キー無し、`"abc"`、`"0"`、`"-3"`、`"2.5"`）
    - `it.each` 表: `AC-25k: page が $label のとき page=1 になる`（`"03"`、`"1e3"`、`" 3"`、`"3abc"`、`"+3"`、`""`、`"9999999999999999999999"`）
    - `it.each` 表（AC-25k の境界）: `"9007199254740991"`（`Number.MAX_SAFE_INTEGER`）→ そのまま採用、`"9007199254740992"` → `1`
    - `AC-25d: page="3"、q="react" のとき page=3、q="react" になる`
    - 仕様 9節の確認: `page="35"` → `35`（上限で切り詰めない）
    - `AC-25e: q が ["a", "b"] のとき最初の "a" を使う`
    - 補強（AC-25a/b との結合）: `q="  react  "` → `"react"`、`q="　"` → `null`、`q` 未指定 → `null`、`q=[]` → `null`
    - AC-25l（Q2 の決定）: `page=["2", "5"]` → `2`（最初の要素を同じ規則で解釈）
  - RED: `parseSearchParams` を `{ q: null, page: 0 }` を返す仮実装にし、全行が不一致で失敗することを確認する。
  - 実装対象: `lib/search/query.ts`、`lib/search/query.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T4: 数値・言語の表示用整形**
  - 対応 AC: AC-25g、AC-25h
  - 先に書くテスト: `lib/search/format.test.ts`（`// @vitest-environment node`）
    - `it.each` 表: `AC-25g: $value を整形すると "$expected" になる`（0→`"0"`、999→`"999"`、1234→`"1,234"`、1234567→`"1,234,567"`）
    - 補強（0以上の整数の範囲内）: 1000→`"1,000"`、`Number.MAX_SAFE_INTEGER`→`"9,007,199,254,740,991"`（指数表記にならないことの確認）
    - `it.each` 表: `AC-25h: 言語が $label のとき "$expected" を返す`（`null`→`"-"`、`""`→`"-"`、`"TypeScript"`→`"TypeScript"`）
  - RED: `formatNumber` は `String(value)` をそのまま返す、`formatLanguage` は入力を `?? ""` で返す仮実装にし、`1,234` 等と `"-"` の行が失敗することを確認する。
  - 実装対象: `lib/search/format.ts`、`lib/search/format.test.ts`（2 ファイル）
  - 実装上の注意: `Intl` と `toLocaleString` を使わない（1.2 (e) 案 A）。
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T5: 検索パスの生成**
  - 対応 AC: AC-25i
  - 先に書くテスト: `lib/search/paths.test.ts`（`// @vitest-environment node`、`describe("buildSearchPath")`）
    - `AC-25i: キーワード "日本語 & react"、ページ2のとき /?q=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+react&page=2 を返す`
    - `AC-25i: 生成したパスのクエリを読み取ると q が "日本語 & react"、page が "2" に戻る`（`URLSearchParams` で往復）
    - `AC-25i: ページが1でも page=1 を省略しない`（`buildSearchPath("react", 1)` → `/?q=react&page=1`。0005 AC-2a の遷移先と一致）
    - `it.each` 表（AC-25i の「エンコード」と非機能 8節）: `$label を含むキーワードでも、パスは "/?" で始まり、q を読み取ると元の値に戻る`（`"c++"`、`"a=b"`、`"#tag"`、`"100%"`、`"https://evil.example"`、`"//evil.example"`、`"\\evil.example"`）
  - RED: `buildSearchPath` を `"/"` を返す仮実装にし、全行が不一致で失敗することを確認する。
  - 実装対象: `lib/search/paths.ts`、`lib/search/paths.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T6: 詳細パスの生成**
  - 対応 AC: AC-25j
  - 先に書くテスト: `lib/search/paths.test.ts` に `describe("buildRepoPath")` を追加
    - `AC-25j: owner "vercel"、repo "next.js" のとき /repos/vercel/next.js を返す`
    - `it.each` 表: `AC-25j: owner $owner、repo $repo のとき $expected を返す`（`"a b"`/`"c"` → `/repos/a%20b/c`、`"x/y"`/`"z"` → `/repos/x%2Fy/z`、`"o"`/`"r?x#y"` → `/repos/o/r%3Fx%23y`、`"o"`/`"100%"` → `/repos/o/100%25`、`"o"`/`"c++"` → `/repos/o/c%2B%2B`、`"日本"`/`"r"` → `/repos/%E6%97%A5%E6%9C%AC/r`）
    - 非機能 8節: `owner に "https://evil.example" を渡しても、パスは "/repos/" で始まりセグメントは2つのままである`
  - RED: `buildRepoPath` を符号化せずに連結する仮実装にし、特殊文字の行が不一致で失敗する（AC-25j の基本行は通る）ことを確認する。
  - 実装対象: `lib/search/paths.ts`、`lib/search/paths.test.ts`（2 ファイル）
  - 完了条件: `pnpm test` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T7: 仕様の未決事項の解決と最終確認**
  - 対応 AC: なし（仕様 9節「関数名・ファイル配置 / 期限: 計画承認時」）
  - 先に書くテスト: なし（文書のみ）
  - 実装対象: `docs/specs/0004-search-utils.md`（9節の該当行を `[x]` にし、確定した配置と関数名を1行で書く。10節の変更履歴に追記）、本計画の進捗メモ（2 ファイル）
  - 確認: `bash scripts/verify.sh`（full）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。`reviewer` / `security-reviewer` サブエージェントのレビューを受ける。
  - 完了条件: `verify.sh` PASS、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: 0003 と 0004 が両方マージされた後、`lib/github/` の `perPage` 既定値 30 を `SEARCH_PER_PAGE` の import に置き換える（`lib/search/constants.ts` は純粋なモジュールなので、`server-only` の `lib/github/` から読み込んでも問題ない。逆向きは不可）。0006 の計画に含めるか、小さな `chore` の Issue にする。
- P2: 0008 の計画への申し送り: 動的ルート `/repos/[owner]/[repo]` の `params` がデコード済みで渡るかを Next.js 16.3.8 の文書で確認し、`getRepository` 側（0003）の符号化と二重にならないようにする。0004 の `buildRepoPath` が作る URL との往復を 0008 のテストで確かめる。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 |
| --- | --- | --- | --- |
| 単体（表形式） | `calculateMaxPage` と定数 | `lib/search/pagination.test.ts` | node |
| 単体（表形式） | `normalizeKeyword`、`parseSearchParams` | `lib/search/query.test.ts` | node |
| 単体（表形式） | `formatNumber`、`formatLanguage` | `lib/search/format.test.ts` | node |
| 単体（表形式） | `buildSearchPath`、`buildRepoPath` | `lib/search/paths.test.ts` | node |
| コンポーネント・結合・E2E | なし（画面は 0005 以降） | — | — |

- すべて純粋関数のため、モックは使わない（時刻・乱数・ネットワークに依存しない）。
- `it.each` はオブジェクト配列＋`$name` 形式でテスト名に入力値を出す（`undefined` や空文字、全角空白が名前で判別できるよう `label` 列を持たせる）。テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する（0002 と同じ）。
- `// @vitest-environment node` をファイル先頭に付ける。既定の jsdom では `window` などが存在するため、誤って DOM に頼る実装をしても気付けない。node 環境で通ることで、サーバー側でも動くことを確かめる。
- 仕様に無い入力（負の総件数、小数の整形など）の振る舞いはテストで固定しない。仕様に書かれた入力と、その範囲内の境界値（`MAX_SAFE_INTEGER` など）だけを足す。

### AC とタスクの対応表

| AC | 内容（要約） | 関数 | テストファイル | タスク |
| --- | --- | --- | --- | --- |
| AC-25a | 前後の空白を除く | `normalizeKeyword` | `query.test.ts` | T2 |
| AC-25b | 空・半角空白・全角空白は `null` | `normalizeKeyword` | `query.test.ts` | T2 |
| AC-25c | 不正な `page` は 1 | `parseSearchParams` | `query.test.ts` | T3 |
| AC-25k | 厳密な `page` 解釈（`^[1-9][0-9]*$`、安全な整数） | `parseSearchParams` | `query.test.ts` | T3 |
| AC-25d | `page="3"`、`q="react"` の解釈 | `parseSearchParams` | `query.test.ts` | T3 |
| AC-25e | `q` が複数なら最初 | `parseSearchParams` | `query.test.ts` | T3 |
| AC-25l | `page` が複数なら最初（その規則で解釈） | `parseSearchParams` | `query.test.ts` | T3 |
| AC-25f | 最大ページ数（1,000件上限、30件/ページ） | `calculateMaxPage`、定数 | `pagination.test.ts` | T1 |
| AC-25g | 桁区切り | `formatNumber` | `format.test.ts` | T4 |
| AC-25h | 言語 `null`・空は `-` | `formatLanguage` | `format.test.ts` | T4 |
| AC-25i | 検索パス（`&`→`%26`、`page` を省略しない） | `buildSearchPath` | `paths.test.ts` | T5 |
| AC-25j | 詳細パス（特殊文字の符号化） | `buildRepoPath` | `paths.test.ts` | T6 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| `Number()`／`parseInt()` の緩い変換で `" 3"`、`"1e3"`、`"3abc"` が数値として通る | AC-25k 不達。想定外のページで API を呼ぶ | 正規表現で形を絞ってから変換し、`Number.isSafeInteger` で範囲を確かめる。AC-25k の全行と `MAX_SAFE_INTEGER` 前後の境界をテストする |
| `toLocaleString()` 等のロケール依存でサーバーとブラウザの表示が食い違う | ハイドレーションのずれ（警告・表示のちらつき） | `Intl` を使わない実装（案 A）。node 環境のテストで期待文字列を完全一致で検証する |
| 検索パスの空白表記（`+` と `%20`）がフォーム送信と食い違う | 同じ検索に2種類の URL ができ、0005・0007 のテストの期待値がぶれる | `URLSearchParams` に統一し、AC-25i で完全一致と往復の両方を検証する |
| パス生成で利用者由来の値がそのまま連結される | オープンリダイレクト（0009 AC-15c）、パスの改ざん | 先頭を固定リテラルにし、値は必ず符号化する。外部 URL 形式の入力でも `/?`・`/repos/` で始まることをテストで固定する |
| `buildRepoPath` に `.` や `..` だけのセグメントが渡ると、ブラウザの URL 正規化で別のパスに解決される（`%2E%2E` も同様に扱われるため、符号化では防げない） | アプリ内の別ページへ遷移する（外部には出ない） | GitHub の命名規則では owner・repo が `.`／`..` だけになることはなく、値は API 由来。0004 では扱わず、Q3 で人間に確認する |
| 0003（未マージ）と定数が重複する | 1ページの件数を変えるときに片方だけ直る | 0004 側を正とし、両方マージ後に P1 で一本化する。0003 には依存しない |
| 0003 のブランチを計画時に読めず、命名がずれる | 利用側で関数名の不統一 | T1 の作業前確認で 0003 の命名を読み、ずれがあれば実装前に報告する |
| テストが既定の jsdom で動き、DOM 依存の実装に気付けない | サーバーで実行時エラー | テストファイルに `// @vitest-environment node` を付ける |

## 6. ADR が必要な論点

- なし。依存パッケージの追加や、アーキテクチャ上の重要な選択（認証・状態管理・DB・主要ライブラリ）を含まない。数値整形の方式（`Intl` を使わない）とパス生成の方式（`URLSearchParams`／`encodeURIComponent`）は、本計画の 1.2 節と実装のコメント（「なぜ」）に残せば足りると考える。

## 7. 要確認事項

- [x] Q1: ファイル配置。推奨は A「すべて `lib/search/` に置く」（仕様 0004 の1モジュール＝1ディレクトリで、レビューと参照が追いやすい）。別案 B「`lib/search/`（定数・クエリ・ページ数）＋ `lib/format.ts`（整形）＋ `lib/paths.ts`（パス）」は、0008 の詳細ページが「検索」以外の名前から整形関数を読める利点があるが、ファイルが散る。どちらにするか。
- [x] Q2: `page` が複数指定（`?page=2&page=5`）のときの扱い。仕様は `q` についてだけ「最初の1つ」と定めている。推奨は `q` と同じく最初の要素を AC-25c/25k の規則で解釈する（例では `2`）。別案は「複数なら不正として 1」。
- [x] Q3: `buildRepoPath` に空文字・`.`・`..` だけの owner／repo が渡されたときの扱い。推奨は「0004 では扱わない（GitHub の命名規則上あり得ず、値は API 由来）」。扱う場合は戻り値の型（例外を投げる／`null` を返す）を決める必要があり、仕様の変更になる。
- [x] Q4: `calculateMaxPage` に負数・`NaN`・小数の総件数が渡されたときの扱い。推奨は「仕様に無いので定めない・テストしない」（総件数は 0003 が検証した API の値）。不正値で `0` を返すようにする場合は仕様への追記が必要。
- [x] Q5: `formatLanguage` に空白だけの文字列（`" "`）が渡されたとき。推奨は「仕様どおりそのまま返す」（GitHub API の `language` は言語名か `null`）。`"-"` にする場合は仕様への追記が必要。
- [x] Q6: `buildSearchPath` の `page` に 1 未満や整数でない値が渡されたときに 1 へ補正するか。推奨は「補正しない」（呼び出し側は `parseSearchParams` の結果を渡し、型は `number`。0007 のページ番号リンクも正の整数だけを渡す）。0009 の「`q` が空なら `/`」も 0009 の側で組み立てる。補正や `q === null` の受け付けを 0004 に入れる場合は、仕様に AC を追加する。
- [x] Q7: 1.2 (e) の数値整形は案 A（`Intl` を使わない）でよいか。案 B（`Intl.NumberFormat("en-US")` に固定）にするか。
- [x] Q8: 提案 P1（0003 との定数の一本化）・P2（0008 への申し送り）の採否と、扱う場所（0006 の計画／別 Issue）。

## 8. 進捗メモ

- 2026-10-07: 計画作成（draft）。未着手。次は人間の承認後に T1 から開始する。T1 の前に `feat/3-github-api-client` の `lib/github/` の命名を確認する。
- 2026-10-07: 人間が推奨どおりで承認（Status: in-progress）。決定事項: Q1 すべて `lib/search/`／Q2 `page` が複数なら最初の要素を使う → 仕様に AC-25l を追加／Q3 `buildRepoPath` の `.`・`..` は扱わない／Q4 `calculateMaxPage` の不正な総件数は定めない・テストしない（人間が理由を確認のうえ現状どおりと決定。0003 の `num` は非負の整数までは検証していない点を承知）／Q5 `formatLanguage` の空白だけの文字列はそのまま返す／Q6 `buildSearchPath` は不正な `page` を補正しない／Q7 数値整形は `Intl` を使わない案 A／Q8 P1（0003 の定数との一本化）は別 Issue、P2（0008 への申し送り）は採用して 0008 の計画時に確認。`/issue split` はせず 1 PR で進める。
