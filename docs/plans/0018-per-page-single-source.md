# 0018: `lib/github` の既定値 30 と上限 256 を `lib/search/constants.ts` に一本化する 実装計画

Status: in-progress              <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #20
- 対応する仕様: docs/specs/0018-per-page-single-source.md
- ブランチ: feat/20-per-page-single-source
- 作成日: 2026-10-08

## 1. 方針

- `lib/github/client.ts` の非公開定数 `DEFAULT_PER_PAGE`（30）と `MAX_Q_LENGTH`（256）を削除し、`lib/search/constants.ts` の `SEARCH_PER_PAGE` と `SEARCH_KEYWORD_MAX_LENGTH` を `@/lib/search/constants` から import して使う（仕様 4.1・AC-1）。値（30・256）と、`searchRepositories` の検証・呼び出しの振る舞いは変えない。
- `DEFAULT_PAGE`（1）、`MAX_PER_PAGE`（100）、`OWNER_PATTERN`、`REPO_PATTERN` は `client.ts` に残す（仕様 4.2）。
- 依存の向きは `lib/github/` → `lib/search/constants.ts` のみ。`lib/search/` の現状の import は `./constants` `./paths` `./query` だけで、`lib/github/` を読んでいない（`pagination.ts`・`back-path.ts` の import を確認済み。`format.ts` `paths.ts` `query.ts` `constants.ts` は import なし）。循環は生じない。
- AC-1・AC-2・AC-5 は挙動が変わらないため既存テストでは RED を作れない。そこで、ソースを `typescript` の AST で読む構成検査テストを `tests/foundation/` に新規で置く（`project-structure.test.ts` の流儀。`typescript` は既に devDependencies にあり、依存の追加は無い）。AST を使うのでコメントは自然に対象外になる。
- AC-3・AC-4 は既存テスト（`lib/github/client.test.ts`、`lib/github/server-only.test.ts`、`lib/search/pagination.test.ts` 等）を**期待値を変えずに**通すことで確かめる。本計画で変更する既存テストは無い。
- コメントと文書の「重複している」旨の記述を更新する（`lib/search/constants.ts`、`lib/github/types.ts`、`docs/architecture.md` 5 節）。過去の計画（0004・0009）の記述は当時の記録なので変えない。
- 依存パッケージは追加しない。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| `client.ts` の import | `import "server-only";` の行（1 行目）は動かさない。既存の import 群（`./errors` `./http` `./mappers` `./types`）と同じ塊に `import { SEARCH_KEYWORD_MAX_LENGTH, SEARCH_PER_PAGE } from "@/lib/search/constants";` を足す。名前の付け替え（`as`）はしない。`import type` にしない（値として使う） |
| `client.ts` の利用箇所 | `perPage = DEFAULT_PER_PAGE` → `perPage = SEARCH_PER_PAGE`、`q.length > MAX_Q_LENGTH` → `q.length > SEARCH_KEYWORD_MAX_LENGTH`。`MAX_Q_LENGTH` の上のコメント「GitHub のドキュメントが定める検索クエリの上限文字数に合わせる」は、理由として `lib/search/constants.ts` の `SEARCH_KEYWORD_MAX_LENGTH` の側へ移す |
| `lib/search/constants.ts` のコメント | 「`lib/github/client.ts` の `MAX_Q_LENGTH` と同じ値。一本化は Issue #20（0018）で扱う。」を削除し、「GitHub の検索クエリの上限文字数に合わせる。`lib/github/client.ts` もこの値で検証する」の趣旨に置き換える。`SEARCH_PER_PAGE` にも「`lib/github/client.ts` の `per_page` の既定値としても使う」旨を添える。あわせて「このファイルは `lib/github/`（server-only）を import しない（クライアントからも使うため）」と依存の向きの理由を 1 行書く（文言は実装時に調整してよい） |
| `lib/github/types.ts` のコメント | `perPage?: number; // 既定 30` → `// 既定は SEARCH_PER_PAGE（lib/search/constants.ts）`。型は変えない |
| 構成検査テストのファイル | 新規 `tests/foundation/search-constants-single-source.test.ts`（`// @vitest-environment node`。名前は Q1） |
| 走査対象 | `lib/github/` と `lib/search/` の配下を再帰で集め、拡張子 `.ts` `.tsx` のうち、ファイル名に `.test.` または `.spec.` を含むものを除く（Q3） |

### 1.2 設計判断と根拠

**(a) 構成検査テストの中身（検出器は純粋関数としてテストファイル内に置く）**

- テストファイルの中に、ソース文字列を受け取る検出関数を置く（`ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)` で解析）。実ファイルへの適用と、文字列の断片を使った検出器自身の陽性・陰性テストの両方に同じ関数を使う。
  - `findDeclaredNames(source, names)`: 指定した名前の識別子の**宣言**（変数・関数・クラス・import の束縛名・パラメータ）を返す。AC-1 の「`DEFAULT_PER_PAGE` と `MAX_Q_LENGTH` という名前の宣言が無い」用。`import { SEARCH_PER_PAGE as DEFAULT_PER_PAGE }` も束縛名の宣言として検出する。
  - `findNamedImports(source)`: `ImportDeclaration` ごとに、モジュール指定子・型だけの import か・各 specifier の元の名前（`propertyName`）と束縛名を返す。AC-1 の「`SEARCH_PER_PAGE` と `SEARCH_KEYWORD_MAX_LENGTH` を `@/lib/search/constants` から import している」用（指定子は完全一致、`as` なし、`import type` でない）。
  - `findNumericLiterals(source, values)`: `ts.isNumericLiteral` のノードで、`Number(node.text)` が指定値に一致するものを返す（AC-2。値で比べるので `30.0` `0x1E` `3e1` も検出する。Q4）。文字列・テンプレート文字列・正規表現（`REPO_PATTERN` の `{1,100}` など）・コメントの中の数字は数値リテラルではないので対象外になる。
  - `findModuleSpecifiers(source)`: `ImportDeclaration`・`ExportDeclaration`（`export … from`）の指定子、`import("…")`（動的 import）の文字列引数、`require("…")` の文字列引数を返す。AC-5 用。
  - `pointsToLibGithub(fromFile, specifier)`: `@/lib/github` または `@/lib/github/…` なら真。相対指定子（`.` で始まる）は `path.resolve(path.dirname(fromFile), specifier)` で解決し、`<root>/lib/github` 自身またはその配下なら真（`../github`、`../../lib/github`、`./../github/client` のいずれも検出する）。
- 走査の空振り対策（前提テスト）: 集めたファイル一覧が、`lib/github/client.ts` `lib/github/http.ts` `lib/github/types.ts` と `lib/search/constants.ts` `lib/search/back-path.ts` `lib/search/query.ts` を含み、`.test.` を含むファイルが 1 つも無いこと。AC-1 は `client.ts` が存在し、解析した文の数が 0 でないこと。
- ファイル集めは `project-structure.test.ts` の `collectFiles` と同じ 5 行の再帰をテストファイル内に置く（既存のテストファイルは変えない。Q2）。パスの比較は `path.relative(root, file)` を `/` 区切りに正規化して行う（Windows の `\` 対策）。

**(b) `import "server-only"` の検査との両立（注意点 a）**

- `server-only.test.ts` は `client.ts` の「先頭のコメントを除いた最初の文が `import "server-only";`」を文字列で検査している。新しい import は既存の import 群（3 行目以降）に足すだけなので、先頭は変わらない。
- `server-only.test.ts` の「`@/lib/github/client` を react-server 条件なしで import すると拒否される」は、`client.ts` の 1 行目で `server-only` が評価されて例外になることによる。`@/lib/search/constants` は純粋なモジュールで副作用が無く、評価の順序が変わっても拒否の結果は変わらない（AC-4）。
- 検出力の確認として、T2 の GREEN 後に一時的に新しい import を `import "server-only"` より前に置き、`server-only.test.ts` が失敗することを確かめる（既存の検査がまだ効いていることの確認）。

**(c) `@/lib/search/constants` と相対 import（注意点 b）**

- `lib/github/` の非テストファイルの import は、すべて同じディレクトリ内の相対指定（`./errors` 等）。一方、モジュールをまたぐ import は、`features/` `app/` ともに `@/lib/search/…` のエイリアスで書いている（`features/search/components/search-content.tsx` の `@/lib/search/constants` など）。
- 仕様 AC-1 が `@/lib/search/constants` からの import を求めており、プロジェクト内のモジュールをまたぐ流儀とも一致するので、エイリアスを使う（相対 `../search/constants` は AC-1 で失敗させる）。`vitest.config.mts` の `resolve.alias` で `@` はルートに解決されるので、`client.test.ts` が本物の `client.ts` を読む経路でも解決できる。

**(d) AC-2 の誤検知の回避（注意点 c）**

- 対象は値 30 と 256 の数値リテラルだけ。`100`（`MAX_PER_PAGE`、`REPO_PATTERN` の長さ）、`1`（`DEFAULT_PAGE`、`page < 1`）、`39`（`OWNER_PATTERN`）は対象外。
- `REPO_PATTERN` などの正規表現リテラル内の数字、文字列（`String(page)` の結果など）、コメント（`types.ts` の `// 既定 30` を含む）は AST 上で数値リテラルではないため検出しない。`types.ts` のコメントは仕様 4.1 により別途更新する。
- 陰性テストで、`const DEFAULT_PAGE = 1;`、`const MAX_PER_PAGE = 100;`、`/^[A-Za-z0-9._-]{1,100}$/`、`"30"`、`` `${30}` `` ではなく `` `30件` ``、`// 既定 30`、`/* 256 */`、`300`、`2560`、`1030` を検出しないことを固定する。陽性テストで、`const x = 30;`、`q.length > 256`、`perPage = 30`（既定値の位置）、`30.0`、`0x1E` を検出することを固定する。
- 限界: `15 * 2` のような計算式や、他の名前の定数経由は検出しない（仕様は数値リテラルを対象にしている。提案 P1）。

**(e) `vi.mock("@/lib/github", …)` している既存テストへの影響（注意点 d）**

- `app/page.test.tsx`、`app/repos/[owner]/[repo]/page.test.tsx`、`features/search/components/search-content.test.tsx`、`tests/a11y/page-structure.test.tsx` は、`@/lib/github` をファクトリで丸ごと差し替えている（`importOriginal` 不使用）。本物の `client.ts` は読み込まれないので、`client.ts` の import が増えても影響しない。
- 本物の `client.ts` を読むのは `lib/github/client.test.ts`・`token-leak.test.ts` 等（`vi.mock("server-only", () => ({}))`）。これらは新たに `lib/search/constants.ts` も読み込むが、純粋なモジュールなので影響しない。`@/lib/search/constants` をモックしているテストは無い（`vi.mock("@/lib/search` の検索で 0 件）。

**(f) 走査対象の拡張子と除外（注意点 e）**

- 仕様 AC-2 は「`.ts`」、AC-5 は「ソース」と書いている。現状 `lib/github/` `lib/search/` に `.tsx` は無いが、将来の追加で検査が空振りしないよう、両方とも `.ts` と `.tsx` を対象にする（`.tsx` を含めても仕様より狭くはならない。Q3）。
- 除外はファイル名に `.test.` または `.spec.` を含むもの（`client.test.ts` の `per_page=30`・`"a".repeat(256)`、`back-path.test.ts` の `257` などのテスト側のリテラルは対象外。仕様 AC-2・AC-5 の「テストを除く」）。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `tests/foundation/search-constants-single-source.test.ts` | 構成検査テスト（検出器の陽性・陰性、走査の前提、AC-5（T1）。AC-1・AC-2（T2）） |
| 変更 | `lib/github/client.ts` | `DEFAULT_PER_PAGE`・`MAX_Q_LENGTH` を削除し、`@/lib/search/constants` から import（T2） |
| 変更 | `lib/search/constants.ts` | コメントのみ（値・export は不変）（T2） |
| 変更 | `lib/github/types.ts` | コメントのみ（型は不変）（T2） |
| 変更 | `docs/architecture.md` | 5 節の「キーワードの上限 256 は … 重複している」を、一本化後の記述に置き換え（T3） |
| 変更 | `docs/plans/0018-per-page-single-source.md` | 進捗メモ（各タスク） |
| 変更なし | `lib/github/client.test.ts`、`server-only.test.ts`、`token-leak.test.ts`、`http.ts`、`mappers.ts`、`errors.ts`、`index.ts`、`lib/search/` のコード（`constants.ts` のコメント以外）とテスト、`tests/foundation/project-structure.test.ts`、`features/`、`app/`、`package.json`、ロックファイル | 触らない（AC-3・AC-4 は期待値を変えずに通す） |

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `verify.sh --quick` が PASS している必要があるため、RED のままのテストはコミットしない。最初から緑になる部分（検出器・前提・AC-5）を T1 で入れ、RED になる AC-1・AC-2 の実ファイルへの適用は T2 で実装と同じコミットに入れる。T1 → T2 → T3 の順。T2 は T1 の検出器に依存する。

- [x] **T1: 構成検査テストの土台（検出器・走査の前提）と依存の向き（AC-5）**
  - 進捗: 検出器と走査を「空配列／false を返す」仮実装にして 31 件中 20 件が失敗することを確認（RED の代わり。陰性 10 件と AC-5 本体は自明に通る）→ 本実装で 31 件すべて PASS。変異確認: `lib/search/format.ts` に `@/lib/github/types` の import を足す／相対の `../github/errors` を足す（どちらも AC-5 が失敗し、メッセージに `lib/search/format.ts: …` が出る）、走査の拡張子を `.jsx?` にする（前提 2 件が失敗）、相対指定子の解決を外す（相対の陽性 4 件が失敗）、前方一致にする（`@/lib/github-extra` の陰性が失敗）の 5 つすべてで検出。本番コードの差分が残っていないことを確認。
  - 対応 AC: AC-5（あわせて AC-1・AC-2 の検出器の正しさ）
  - 先に書くテスト: `tests/foundation/search-constants-single-source.test.ts`
    - `describe("走査の前提")`
      - `AC-2・AC-5（前提）: lib/github と lib/search の走査対象に client.ts・http.ts・types.ts・constants.ts・back-path.ts・query.ts が含まれる`
      - `AC-2・AC-5（前提）: 走査対象に *.test.* と *.spec.* のファイルが含まれない`
    - `describe("検出器")`（入力はテスト内の文字列の断片。1.2 (a)・(d)）
      - `AC-1（検出器）: const DEFAULT_PER_PAGE = 30 と、import { X as MAX_Q_LENGTH } の束縛名を宣言として検出し、コメント・文字列中の同名は検出しない`
      - `AC-1（検出器）: 名前付き import の指定子・元の名前・別名・型だけかを読み取れる（import type と as を区別する）`
      - `it.each`（陽性）: `AC-2（検出器）: $label の数値リテラルを検出する`（`const x = 30;`、`q.length > 256`、`perPage = 30`、`30.0`、`0x1E`）
      - `it.each`（陰性）: `AC-2（検出器）: $label は検出しない`（`DEFAULT_PAGE = 1`、`MAX_PER_PAGE = 100`、`/^[A-Za-z0-9._-]{1,100}$/`、`"30"`、`` `30件` ``、`// 既定 30`、`/* 256 */`、`300`、`2560`、`1030`）
      - `it.each`（陽性）: `AC-5（検出器）: lib/search/x.ts の $specifier は lib/github を指すと判定する`（`@/lib/github`、`@/lib/github/types`、`../github`、`../github/errors`、`../../lib/github`、`./../github/client`。`import`・`import type`・`export … from`・`import("…")`・`require("…")` の各構文）
      - `it.each`（陰性）: `AC-5（検出器）: lib/search/x.ts の $specifier は lib/github を指さないと判定する`（`./constants`、`@/lib/search/query`、`@/lib/github-extra`（前方一致の誤判定の防止）、`../githubx`、`react`）
    - `describe("AC-5: lib/search は lib/github に依存しない")`
      - `AC-5: lib/search/ のテストを除くソースは、@/lib/github・../github・../../github のいずれも import していない`（違反があれば `ファイル: 指定子` の一覧をメッセージに出す）
  - RED の方法: このタスクのテストは現状のコードで**通るのが正しい**（AC-5 は既に満たされ、検出器はテストと同時に書く）。代わりに、検出器を空の配列を返す仮実装で先に書いて実行し、陽性テストと前提テストが期待値の不一致で失敗することを確認してから本実装に置き換える（import エラー・構文エラーでの失敗は RED と認めない）。
  - 実装対象: `tests/foundation/search-constants-single-source.test.ts`（1 ファイル）
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す）:
    1. `lib/search/format.ts` に `import type { RepoSummary } from "@/lib/github/types";` を足す → AC-5 が失敗（メッセージに `lib/search/format.ts` が出る）。
    2. 同じく `import { GitHubApiError } from "../github/errors";`（相対）を足す → AC-5 が失敗。
    3. 走査のフィルタを誤らせる（拡張子を `.js` にする）→ 前提テストが失敗し、AC-5 が空振りで通らないことを確かめる。
    4. `pointsToLibGithub` の相対指定子の解決を外す → 相対の陽性テストが失敗。前方一致（`startsWith("@/lib/github")`）にする → `@/lib/github-extra` の陰性テストが失敗。
  - 完了条件: 新しいテストがすべて通り、既存テストは変更なしで通る。`pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [x] **T2: `client.ts` の定数を `lib/search/constants.ts` に一本化（AC-1・AC-2 の RED → GREEN）**
  - 進捗: RED（34 件中 3 件失敗。AC-1 の 2 件が `client.ts: DEFAULT_PER_PAGE`・`MAX_Q_LENGTH` の宣言と import の不足、AC-2 が `client.ts:13: 30`・`client.ts:19: 256`）→ GREEN（verify --quick PASS、805 件）。既存のテストファイルの変更は 0 件（`git diff --stat` で確認。`client.test.ts`・`server-only.test.ts`・`pagination.test.ts`・`back-path.test.ts` は変更なしで通る）。変異確認: `DEFAULT_PER_PAGE` を戻す／`perPage = 30` に戻す／相対 import／別名 import／`http.ts` に `256` を足す／`SEARCH_PER_PAGE` を 31 にする／上限を 255 にする／import を `server-only` より前に移す、の 8 つすべてで検出。
  - 対応 AC: AC-1、AC-2、AC-3、AC-4
  - 先に書くテスト: T1 のファイルに追加
    - `describe("AC-1: client.ts は一本化した定数を使う")`
      - `AC-1: lib/github/client.ts に DEFAULT_PER_PAGE と MAX_Q_LENGTH という名前の宣言が無い`
      - `AC-1: lib/github/client.ts は SEARCH_PER_PAGE と SEARCH_KEYWORD_MAX_LENGTH を @/lib/search/constants から（別名・型だけの import でなく）import している`
    - `describe("AC-2: lib/github に 30 と 256 の数値リテラルが無い")`
      - `AC-2: lib/github/ のテストを除くソースに数値リテラル 30 と 256 が無い`（違反があれば `ファイル:行: リテラル` の一覧をメッセージに出す）
  - RED の方法: 実装前に実行し、AC-1 の 2 件が「`DEFAULT_PER_PAGE`・`MAX_Q_LENGTH` の宣言がある」「`@/lib/search/constants` の import が無い」で、AC-2 が「`client.ts` の 13 行目 `30`・19 行目 `256`」で失敗することを確認する（失敗メッセージに該当箇所が出ること）。
  - 実装: 1.1 のとおり。`client.ts` の定数削除と import、`lib/search/constants.ts` と `lib/github/types.ts` のコメント更新。
  - AC-3・AC-4 の確認: 既存の `lib/github/client.test.ts`（AC-5a の `per_page=30`、AC-5c〜5e の `q` 256 文字成功・257 文字で `VALIDATION`、AC-5d の `perPage` 1〜100 の境界）、`lib/github/server-only.test.ts`、`lib/search/pagination.test.ts`（`SEARCH_PER_PAGE` が 30）、`lib/search/back-path.test.ts` を**変更せずに**通す。`git diff --stat` で既存のテストファイルに変更が無いことを確かめ、進捗メモに記録する。
  - 実装対象: `lib/github/client.ts`、`lib/search/constants.ts`、`lib/github/types.ts`、`tests/foundation/search-constants-single-source.test.ts`（4 ファイル）
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す）:
    1. `client.ts` に `const DEFAULT_PER_PAGE = 30;` を戻す → AC-1・AC-2 が失敗。
    2. `perPage = SEARCH_PER_PAGE` を `perPage = 30` に戻す（import はそのまま）→ AC-2 が失敗。
    3. import を `../search/constants`（相対）にする → AC-1 が失敗。`import { SEARCH_PER_PAGE as DEFAULT_PER_PAGE }` にする → AC-1 が失敗。
    4. `lib/github/http.ts` に `const X = 256;` を足す → AC-2 が失敗（`client.ts` 以外も走査していることの確認）。
    5. `lib/search/constants.ts` の `SEARCH_PER_PAGE` を 31 にする → `client.test.ts` の `per_page=30` が失敗（一本化した定数が実際に API 呼び出しを決めていることの確認）。`SEARCH_KEYWORD_MAX_LENGTH` を 255 にする → `client.test.ts` の 256 文字成功のテストが失敗。
    6. `@/lib/search/constants` の import を `import "server-only";` より前に移す → `server-only.test.ts` の先頭の文の検査が失敗（AC-4 の検査が効いていることの確認）。
  - 完了条件: 構成検査テストを含む全テストが通り、既存テストの期待値の変更が 0 件。`pnpm test`・`pnpm typecheck`・`pnpm lint` PASS、`bash scripts/verify.sh --quick` PASS。

- [ ] **T3: 文書の更新と最終確認**
  - 対応 AC: なし（文書・検証。AC-1〜AC-5 の総合確認）
  - 先に書くテスト: なし
  - 実装対象: `docs/architecture.md` 5 節の 55 行目（「キーワードの上限 256 は `lib/search/constants.ts`（`SEARCH_KEYWORD_MAX_LENGTH`）と `lib/github/client.ts`（内部の `MAX_Q_LENGTH`）に重複している。一本化は Issue #20（0018）」）を、「1 ページの件数 30（`SEARCH_PER_PAGE`）とキーワードの上限 256（`SEARCH_KEYWORD_MAX_LENGTH`）は `lib/search/constants.ts` だけで定義し、`lib/github/client.ts` が import する（0018）。依存の向きは `lib/github/` → `lib/search/` のみで、`lib/search/` は `lib/github/` を import しない（クライアントで使うため）。`tests/foundation/search-constants-single-source.test.ts` で検査する。`MAX_PER_PAGE`（100）などの GitHub API 固有の制約は `lib/github/` に置く」の趣旨に置き換える。本計画の進捗メモ（2 ファイル）
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。`pnpm build` が通ること（`lib/github/` から `@/lib/search/constants` の解決、server-only の境界）を確かめる。
    - `reviewer` サブエージェントで差分を点検する（依存の向き、検査の検出力、既存テスト無変更）。セキュリティ上の論点は server-only の境界の維持のみのため、`security-reviewer` は境界の観点で軽く通す（Q5）。
  - 完了条件: `verify.sh` PASS、レビューの重大指摘の解消、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: AC-2 の検査を、数値リテラルだけでなく `15 * 2` のような計算式や、`lib/github/` 内の別名の定数での 30・256 にも広げる。仕様は数値リテラルを対象にしており、過剰な検査は誤検知の元になるため採らない想定。
- P2: ESLint の `no-restricted-imports`（`lib/search/**` で `@/lib/github*` を禁止）でも依存の向きを強制する。編集直後に検出できる利点があるが、`eslint.config.mjs` の変更（ハーネス近傍の設定）になるため本計画では採らない。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 構成検査 | 検出器の陽性・陰性、走査の前提、AC-1・AC-2・AC-5 | `tests/foundation/search-constants-single-source.test.ts`（新規） | node | なし（実ファイルを読む） |
| 単体（既存・変更なし） | `searchRepositories` の `per_page` 既定 30、`q` 256/257、`perPage` 1〜100（AC-3） | `lib/github/client.test.ts` | node | `fetch`、`server-only`（既存のまま） |
| 単体（既存・変更なし） | server-only の拒否と先頭の文（AC-4） | `lib/github/server-only.test.ts` | node | なし |
| 単体（既存・変更なし） | `SEARCH_PER_PAGE` が 30、`buildBackPath` の 256/257 | `lib/search/pagination.test.ts`、`lib/search/back-path.test.ts` | node | なし |
| 結合・E2E | なし（挙動は変わらない。既存の結合テストは無変更で通す） | — | — | — |

- テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 検出器は実ファイルと同じ関数を文字列の断片に当てて陽性・陰性を固定し、実ファイルへの適用は「違反の一覧が空」であることを `toEqual([])` で検査する（失敗時に違反箇所が分かるようにする）。
- 期待値の計算に `SEARCH_PER_PAGE` 等の定数を使わない（検査対象の値 30・256 はテスト内でリテラルで持つ）。
- 自分たちのモジュールはモックしない。構成検査はファイルシステムを読むだけで、ネットワークは使わない。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-1 | `client.ts` に `DEFAULT_PER_PAGE`・`MAX_Q_LENGTH` の宣言が無く、`@/lib/search/constants` から 2 定数を import | `tests/foundation/search-constants-single-source.test.ts` | T1（検出器）、T2 |
| AC-2 | `lib/github/` のテスト以外に数値リテラル 30・256 が無い | 同上 | T1（検出器）、T2 |
| AC-3 | 既存テストが期待値を変えずに全件通る | `lib/github/client.test.ts` ほか既存すべて | T2、T3 |
| AC-4 | `lib/github` の server-only の拒否の検査が通る | `lib/github/server-only.test.ts` | T2 |
| AC-5 | `lib/search/` のテスト以外が `lib/github/` を import しない | `tests/foundation/search-constants-single-source.test.ts` | T1 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 構成検査の走査が空振りして常に通る | AC-1・AC-2・AC-5 の退行を見逃す | 前提テスト（既知のファイルが含まれる・テストが含まれない）と検出器の陽性テストを置き、T1・T2 で変異（フィルタの誤り、定数の復活）により失敗することを確かめる |
| AC-2 の誤検知（`100`、`1`、正規表現・文字列・コメント中の数字） | 正当なコードで検査が落ちる | AST の `NumericLiteral` だけを値で比べる。陰性テストで固定（1.2 (d)） |
| 相対 import の判定の漏れ・誤判定（`../github` の前方一致、Windows の区切り文字） | AC-5 の見逃し／誤検知 | `path.resolve` で解決し、`path.relative` を `/` 区切りにして比較。`@/lib/github-extra`・`../githubx` の陰性テストを置く |
| `import "server-only"` の位置が崩れる | Client からの誤用をビルドで止められなくなる | 1 行目は動かさない。`server-only.test.ts` を無変更で通し、T2 の変異 6 で検査が効いていることを確かめる |
| `lib/search/` が将来 `lib/github/` を import する | `lib/search/` をクライアントで使えなくなる（ビルド失敗） | AC-5 の構成検査で恒常的に検出する。`constants.ts` に理由のコメントを書く |
| `lib/search/constants.ts` の値を変えると API 呼び出しの既定値も変わる（一本化の帰結） | 画面側の都合で値を変えた際に API 側も変わる | これは仕様の意図（ずれを防ぐ）。`client.test.ts` の `per_page=30` と `pagination.test.ts` が値を固定しており、変更時はテストが落ちて気づける（T2 の変異 5） |
| `vi.mock("@/lib/github", …)` している結合テストへの影響 | テストの破損 | ファクトリで丸ごと差し替えており本物の `client.ts` を読まないため影響なし（1.2 (e)）。T2 で全テストを無変更で通して確かめる |

## 6. ADR が必要な論点

- なし。依存パッケージの追加は無く、技術選定も無い。定数の置き場所と依存の向き（`lib/github/` → `lib/search/`）は仕様 0018 の 4.1 で人間が決定済みで、`docs/architecture.md` 5 節（T3）と構成検査テストに記録すれば足りる。構成検査に使う `typescript` は既存の devDependencies で、`tests/foundation/project-structure.test.ts` に前例がある。

## 7. 要確認事項

- [x] Q1: 構成検査テストのファイル名。推奨: `tests/foundation/search-constants-single-source.test.ts`（何を検査するかが名前で分かる）。別案: 仕様の slug に揃えて `tests/foundation/per-page-single-source.test.ts`（仕様との対応は分かりやすいが、上限 256 と依存の向きも検査するので名前が狭い）。
- [x] Q2: ファイル集めの再帰（`collectFiles`）の扱い。推奨: 新しいテストファイル内に同じ 5 行を置く（既存の `project-structure.test.ts` を変えず、本計画の差分を閉じる）。別案: `tests/helpers/collect-files.ts` に切り出して両方から使う（重複は消えるが、無関係な既存テストの変更が入る）。
- [x] Q3: 走査対象の拡張子と除外。推奨: AC-2・AC-5 とも `.ts` と `.tsx` を対象にし、ファイル名に `.test.` または `.spec.` を含むものを除く。仕様 AC-2 は「`.ts`」と書いているが、現状 `.tsx` は無く、含めても仕様より狭くならない。別案: 仕様の文言どおり AC-2 は `.ts` だけ（将来 `lib/github/` に `.tsx` が増えると検査外になる）。
- [x] Q4: AC-2 の数値リテラルの比べ方。推奨: `Number(node.text)` の値で比べ、`30.0`・`0x1E`・`3e1` も検出する（表記を変えただけの重複を防ぐ）。別案: ソース上の表記 `30`・`256` だけを検出する（仕様の文言に最も忠実だが、表記の違いで素通りする）。
- [x] Q5: レビューの範囲。推奨: `reviewer` は必須、`security-reviewer` は server-only の境界（`lib/github/` が `lib/search/` を読む向きで、逆向きが無いこと）に絞って通す。別案: 変更が定数の移動だけなので `security-reviewer` は省く。
- [x] Q6: タスクの分け方（3 タスク）。推奨: T1（検出器・前提・AC-5。最初から緑）→ T2（AC-1・AC-2 の RED と実装を 1 コミット）→ T3（文書・full verify・レビュー）。RED のままのテストはコミットしない（コミット前に `verify.sh --quick` の PASS が必要なため）。別案: T1 と T2 を 1 コミットにまとめた 2 タスク構成（差分は小さいが、検出器の正しさと実装の変更が 1 コミットに混ざる）。
- [x] Q7: 提案 P1・P2 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-08: 計画作成（draft）。未着手。人間の承認（特に Q3・Q4・Q6）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（3 タスク）。
- 事前調査の結果:
  - `lib/search/` の非テストファイルの import は `./constants` `./paths` `./query` のみで、`lib/github/` を読んでいない（AC-5 は現状で満たされる見込み）。
  - `lib/github/` の非テストファイルで数値リテラル 30・256 を持つのは `client.ts` の 13 行目（`DEFAULT_PER_PAGE = 30`）と 19 行目（`MAX_Q_LENGTH = 256`）だけ。`types.ts` の `// 既定 30` はコメント。
  - `DEFAULT_PER_PAGE`・`MAX_Q_LENGTH` の名前は、コード上は `client.ts` だけに現れる（文書では `docs/architecture.md`、`docs/plans/0004`・`0009`、仕様 0018。過去の計画は変えない）。
  - `@/lib/search/constants` をモックしているテストは無い。`@/lib/github` をファクトリで差し替えているテストは 4 つ（1.2 (e)）。

- 2026-10-08: 人間が計画を承認（Q1〜Q7 すべて推奨どおり）。Status: in-progress。T1 から着手。