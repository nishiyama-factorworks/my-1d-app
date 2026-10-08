# 0017: 雛形の未使用 SVG の整理 実装計画

Status: done                            <!-- draft | in-progress | done  ※ SessionStart hook が "Status: in-progress" の行を検出します。この行は変えないこと -->

- Issue: #17
- 対応する仕様: docs/specs/0017-scaffold-cleanup.md
- ブランチ: feat/17-scaffold-cleanup
- 作成日: 2026-10-09

## 1. 方針

- `public/` の雛形 SVG 5 つ（`next.svg` `vercel.svg` `file.svg` `globe.svg` `window.svg`）を削除する（仕様 4.1・AC-2）。事前調査で、5 つともコード・CSS・設定から参照されていないことを確認した（2 節の調査結果）。
- `public/` の各ファイルの名前が参照元（`app/` `features/` `lib/` `components/` の `.ts` `.tsx` `.mjs` `.js` `.css`、`next.config.ts`、`package.json`）に文字列として現れることを検査する構成検査テストを、`tests/foundation/` に新規で置く（AC-1）。AC-2 も同じファイルで検査する。
- 流儀は `tests/foundation/search-constants-single-source.test.ts` に合わせる: `// @vitest-environment node`、`vitest` の API を明示 import、ファイル集め（`collectFiles`）と `/` 区切りへの正規化（`toRelative`）をテストファイル内に置く（既存テストは変えない）、判定は純粋関数にして実ファイルへの適用と陽性・陰性テストの両方に同じ関数を使う、走査の空振りを前提テストで防ぐ。
- 参照の判定は仕様どおり**文字列検索**（AST は使わない。`.css` と `package.json` も対象のため）。コメント中の出現も参照として数える（仕様 8 節の限界と同じ扱い）。
- AC-3 は、既存のテスト（変更 0 件）と `pnpm build` が通ることで確かめる。本計画で変更する既存テストは無い。
- 依存パッケージは追加しない（`node:fs` `node:path` `node:os` と `vitest` だけを使う）。

### 1.1 確定する事項（計画の承認で確定）

| 事項 | 内容 |
| --- | --- |
| テストファイル | 新規 `tests/foundation/public-assets-referenced.test.ts`（名前は Q1） |
| `public/` の列挙 | `listPublicFiles(dir)`: `dir` 配下を再帰で集め、root 相対の `/` 区切りのパスで返す。**`dir` が存在しないときは空配列**（全削除後は Git が空ディレクトリを追跡しないため、クローン直後は `public/` が無い。注意点 b） |
| 参照元の列挙 | `listReferenceSources()`: `app/` `features/` `lib/` `components/` を再帰で集め、拡張子 `/\.(ts|tsx|mjs|js|css)$/` に一致し、ファイル名に `.test.` `.spec.` を含まないもの（Q3）＋ ルートの `next.config.ts` と `package.json`。**存在しないディレクトリは空として扱う**（`components/` は現在存在しない。`collectFiles` は存在しないディレクトリで `ENOENT` を投げるため、`existsSync` で先に判定する） |
| 参照の判定 | `findUnreferenced(publicFiles, sources, allowlist)`: 純粋関数。`publicFiles` は root 相対パス、`sources` は `{ path, text }[]`。各ファイルの**ベース名（拡張子つき）**が、どれかの `text` に境界つきで現れれば参照あり（Q2・Q4）。許可リストに載ったパスは除く。参照の無いパス（root 相対、`/` 区切り）の配列を返す |
| 境界つきの一致 | ベース名の直前の文字が `[A-Za-z0-9_.-]` でないこと（行頭は可）。`profile.svg` の中の `file.svg` を参照と誤認しない。ベース名は正規表現の特殊文字をエスケープしてから使う（`.` が任意の 1 文字にならないように） |
| 許可リスト | テストファイル内の `const ALLOWLIST: ReadonlyArray<{ path: string; reason: string }> = [];`（現在は空。`path` は `public/…` の root 相対、`reason` は必須の文字列）。前提テストで「各要素の `reason` が空でない」「`path` が `public/` で始まる」を検査する（Q5） |
| AC-1 の失敗メッセージ | `expect(findUnreferenced(...)).toEqual([])`。失敗時に `["public/next.svg", …]` が差分に出る |
| AC-2 | `["next.svg","vercel.svg","file.svg","globe.svg","window.svg"]` の各 `public/<名前>` について `existsSync` が `false`。`it.each` で 5 件（失敗時にどれが残っているか分かる） |

### 1.2 注意点と扱い

**(a) 参照元の範囲と除外**

- 対象: `app/` `features/` `lib/` `components/` の `.ts` `.tsx` `.mjs` `.js` `.css`、`next.config.ts`、`package.json`（仕様 AC-1 の列挙どおり）。現状の該当は `.ts` `.tsx` と `app/globals.css`（`.mjs` `.js` はこの 4 ディレクトリに無い）。
- 除外: このテストファイル自身（`tests/` は走査しないので自然に除外。5 つの名前と許可リストを含むため、走査すると AC-1 が自己参照で常に通る）、`public/` の中、`docs/`（仕様・計画が 5 つの名前を含む）、`node_modules/`、`.next/`（注意点 f）、ルートの他の設定ファイル（`eslint.config.mjs` `vitest.config.mts` 等。仕様の列挙外）。
- `app/` などの中の `*.test.*` `*.spec.*` を除くかは Q3（推奨: 除く。テストからしか参照されないファイルは、アプリが使っているとは言えないため）。

**(b) `public/` が空・無いとき（全削除後）**

- 削除後、`public/` は Git の追跡から消える（Git は空ディレクトリを追跡しない）。作業ツリーには空のディレクトリが残ることがあるが、クローン直後には存在しない。`listPublicFiles` はどちらでも空配列を返し、AC-1 は「参照の無いファイルが 0 個」で通る。これは仕様の意図どおり（検査対象のファイルが無いので違反も無い）。
- AC-1 が「0 個で通る」ため、`public/` の列挙が壊れて常に空になっても気づけない。そこで列挙関数そのものを、`os.tmpdir()` に `mkdtempSync` で作った一時ディレクトリ（入れ子のサブディレクトリを含む）で検査する前提テストを置く（2 節の T1 のテスト一覧）。存在しないディレクトリで空配列になることも同じく検査する。
- `public/` を `.gitkeep` で残すかは Q6（推奨: 残さない。`public/.gitkeep` は `/.gitkeep` として配信され、しかも AC-1 で「参照が無い」と失敗するため、許可リストに入れる必要が生じる）。
- `next build` は `public/` が無くても動く想定だが、推測で済ませず T1 で**`public/` ディレクトリを削除した状態**で `pnpm build` を実行して確かめる（作業ツリーに空ディレクトリが残っているとクローン直後の状態を再現できないため）。

**(c) 許可リストの形**

- 1.1 のとおり。現在は空。動的に組み立てるパスや外部サイトからの直接リンク用のファイルを置くときに、理由を添えて足す（仕様 8 節）。空のまま `reason` の検査が空振りしないよう、`reason` を検査する関数（`validateAllowlist(list)` が問題のある要素を返す）を純粋関数にして、陽性・陰性テストを置く。

**(d) Windows のパス区切り**

- `path.relative(root, file).split(path.sep).join("/")` で正規化してから比較・表示する（既存の `toRelative` と同じ）。ベース名は `path.posix.basename` を正規化済みのパスに使う。許可リストの `path` も `/` 区切りで書く。

**(e) `app/favicon.ico` は対象外**

- 列挙するのは `public/` 配下だけなので対象外になる（仕様 4.2）。`app/` の中の `.ico` は参照元の拡張子にも含まれないので読まない。前提テストで「`listPublicFiles` の結果に `app/` で始まるパスが無い」ことまでは書かない（列挙関数の一時ディレクトリでの検査で十分）。

**(f) `.next/` のキャッシュ**

- `.next/` は走査対象のディレクトリ（`app/` `features/` `lib/` `components/`）の外なので読まない。ビルド成果物に `next.svg` などの名前が残っていても、参照ありと誤認しない。前提テストで「参照元の一覧に `.next/` `node_modules/` `docs/` `tests/` `public/` で始まるパスが無い」ことを検査する。

## 2. 影響範囲

| 種別 | パス | 内容 |
| --- | --- | --- |
| 新規 | `tests/foundation/public-assets-referenced.test.ts` | 構成検査テスト（列挙・判定の陽性・陰性、走査の前提、AC-1、AC-2）（T1） |
| 削除 | `public/next.svg` `public/vercel.svg` `public/file.svg` `public/globe.svg` `public/window.svg` | 雛形 SVG（T1）。`public/` ディレクトリは Git の追跡から消える |
| 変更 | `docs/architecture.md` | 5 節に `public/` の検査の 1 行を追加（T2。要否は Q7） |
| 変更 | `docs/plans/0017-scaffold-cleanup.md` | 進捗メモ |
| 変更（GitHub） | Issue #17 の本文 | 仕様 4.1 のとおり範囲を SVG の整理だけに直す（T2。人間の承認を得てから） |
| 変更なし | 既存のテストすべて、`app/` `features/` `lib/` のコード、`app/favicon.ico`、`next.config.ts`、`package.json`、ロックファイル、`tests/foundation/project-structure.test.ts` `search-constants-single-source.test.ts` | 触らない（AC-3） |

事前調査の結果（2026-10-09）:

- `public/` の中身は 5 つの SVG だけ（サブディレクトリなし）。
- `next.svg` `vercel.svg` `file.svg` `globe.svg` `window.svg` の名前は、`app/` `features/` `lib/` のコード、`app/globals.css`、`next.config.ts`、`package.json`、`tests/`、`e2e` 関連、`.gitignore`、`eslint.config.mjs` のいずれにも現れない。現れるのは `docs/`（仕様 0017、計画 0002・0011）だけ。
- `components/` ディレクトリは存在しない。`app/` `features/` `lib/` に `.mjs` `.js` は無く、`.css` は `app/globals.css` だけ。
- `docs/architecture.md` に `public/` への言及は無い。
- `.claude/harness.env` の `SRC_REGEX` は `app|features|lib|components` の `.ts(x)` なので、SVG の削除は「テストが必要なソースの変更」に当たらない。新しいテストは `TEST_REGEX`（`^tests/`）に一致する。

## 3. タスク（1 タスク = 1 コミットの大きさ）

> 分け方の考え方: コミット前に `verify.sh --quick` の PASS が必要なため、RED のままのテストはコミットしない。AC-1・AC-2 は SVG を消すまで RED なので、テストと削除を同じコミット（T1）に入れる。T2 はコードを変えない文書・検証・レビュー。別案は Q8。

- [x] **T1: 構成検査テストの追加と雛形 SVG 5 つの削除（AC-1・AC-2 の RED → GREEN、AC-3）**
  - 進捗: RED 1（判定・列挙を「空配列を返す」仮実装）で 27 件中 17 件が失敗 → 本実装で RED 2（SVG が残った状態）6 件失敗: AC-1 が `public/file.svg`・`globe.svg`・`next.svg`・`vercel.svg`・`window.svg` の 5 つ、AC-2 の 5 件が「存在する」（`expected true to be false`）→ SVG 5 つを `git rm` して GREEN（27 件 PASS）。`public/` ディレクトリは Git の追跡から外れて無くなった（`.gitkeep` は置かない。Q6）。
  - AC-3 の確認: 変更は新規テスト 1 件と SVG 5 つの削除だけ（既存のテストファイルの変更は 0 件）。`public/` が無い状態で `bash scripts/verify.sh`（full）が PASS（`pnpm build` で `/` と `/repos/[owner]/[repo]` が動的 `ƒ` のまま）。
  - 変異確認（12 個、すべて検出または期待どおり）: `next.svg` を戻す／`public/unused.txt` を置く（失敗）→ 許可リストに足す（通る）→ `reason` を空にする（失敗）／`app/page.test.tsx` にだけ参照を書く（失敗のまま。テストファイルを参照元にしていない）→ `app/layout.tsx` に書く（通る）／参照元から `app/` を外す／拡張子から `css` を外す／境界の判定を外す／エスケープを外す／列挙の存在確認を外す（2 か所）。
  - 対応 AC: AC-1、AC-2、AC-3
  - 先に書くテスト: `tests/foundation/public-assets-referenced.test.ts`
    - `describe("走査の前提")`
      - `AC-1（前提）: 参照元の一覧に app/layout.tsx・app/page.tsx・app/globals.css・next.config.ts・package.json が含まれる`
      - `AC-1（前提）: 参照元の一覧に *.test.* *.spec.* と、.next/・node_modules/・docs/・tests/・public/ 配下のファイルが含まれない`
      - `AC-1（前提）: listPublicFiles は一時ディレクトリの入れ子のファイルを root 相対の / 区切りで列挙する`（`mkdtempSync` で `a.png` と `sub/b.svg` を作り、両方が返ること。`afterEach` で `rmSync(..., { recursive: true, force: true })`。root の代わりに一時ディレクトリを基準にできるよう、基準ディレクトリを引数で受ける）
      - `AC-1（前提）: listPublicFiles は存在しないディレクトリで空配列を返す`
      - `AC-1（前提）: public/ にファイルがある間は listPublicFiles(public) が空でない`（`existsSync(public)` かつ `readdirSync` が 1 件以上のときだけ `length > 0` を検査し、無いときは `public/` が無い・空であることを `expect` で明示する。`it.skip` や条件付きで何も検査しない形にはしない）
      - `AC-1（前提）: 許可リストの各要素は public/ で始まる path と空でない reason を持つ`
    - `describe("判定")`（入力はテスト内の配列と文字列の断片）
      - `it.each`（参照ありの陽性）: `AC-1（判定）: $label のとき参照ありと判定する`（`src="/logo.svg"`、`"logo.svg"`、CSS の `url(/logo.svg)`、`package.json` 風の `"icon": "public/logo.svg"`、行頭の `logo.svg`、コメント `// logo.svg`（仕様 8 節: 文字列検索なので数える）、入れ子 `public/img/logo.svg` のベース名 `logo.svg` が `"/img/logo.svg"` に現れる）
      - `it.each`（参照なしの陰性）: `AC-1（判定）: $label のとき参照なしと判定し、パスを返す`（参照元が空、拡張子違いの `logo.png`、拡張子なしの `logo`、`mylogo.svg`（境界）、`logo-dark.svg`、`.` を任意文字にしない確認として `logoXsvg`）
      - `AC-1（判定）: 許可リストに載ったパスは参照が無くても返さない（載っていない他のパスは返す）`
      - `AC-1（判定）: validateAllowlist は reason が空・空白だけの要素と、public/ で始まらない path の要素を返す`
    - `describe("AC-1: public/ の各ファイルはコードから参照されている")`
      - `AC-1: public/ 配下のファイルで、参照元に名前が現れないもの（許可リストを除く）が無い`（`toEqual([])`。失敗時に `public/next.svg` などのパスが出る）
    - `describe("AC-2: 雛形の SVG が無い")`
      - `it.each`: `AC-2: public/$name が存在しない`（5 件）
  - RED の方法:
    1. 判定・列挙の関数を「空配列を返す」仮実装で先に書いて実行し、前提テスト（列挙）と判定の陰性テスト（パスを返すはず）が期待値の不一致で失敗することを確認する（import エラー・構文エラーでの失敗は RED と認めない）。本実装に置き換えて前提・判定のテストを緑にする。
    2. SVG を消す前に全体を実行し、AC-1 が `["public/file.svg","public/globe.svg","public/next.svg","public/vercel.svg","public/window.svg"]`（順序は列挙順）で、AC-2 の 5 件が「存在する」で失敗することを確認する。失敗メッセージに 5 つのパスが出ることを進捗メモに記録する。
  - 実装: 5 つの SVG を削除する（`git rm`）。作業ツリーに空の `public/` が残る場合はそれも消す（Q6）。
  - AC-3 の確認: `pnpm test` を、既存のテストファイルを変更せずに通す（`git diff --stat` と `git status` で、変更が新規テストと 5 つの削除だけであることを確認し、進捗メモに記録する）。`public/` ディレクトリが無い状態で `pnpm build` を実行して通ることを確かめる（注意点 b）。
  - 実装対象: `tests/foundation/public-assets-referenced.test.ts`（新規）、`public/*.svg` 5 つ（削除）
  - 検出力の確認（GREEN 後に一時的に変異を入れて戻す。戻したことを `git status` で確認する）:
    1. `git restore`（または `git checkout -- public/next.svg`）で `next.svg` を戻す → AC-1 が `public/next.svg` で、AC-2 の `next.svg` が失敗。
    2. `public/unused.txt` を置く → AC-1 が `public/unused.txt` で失敗。続けて許可リストに `{ path: "public/unused.txt", reason: "…" }` を足す → 通る。`reason: ""` にする → 許可リストの前提テストが失敗。
    3. `public/unused.txt` を置いたまま、`app/page.test.tsx` に文字列 `unused.txt` を足す → AC-1 は失敗のまま（テストファイルを参照元にしていないことの確認。Q3 で「含める」になった場合はこの変異を外す）。代わりに `app/layout.tsx` のコメントに足す → 通る（参照元に含まれていることの確認）。
    4. 参照元の列挙から `app/` を外す → 前提テスト（`app/layout.tsx` が含まれる）が失敗。拡張子から `css` を外す → 前提テスト（`app/globals.css`）が失敗。
    5. 境界の判定を外して単純な `includes` にする → 陰性テスト `mylogo.svg` が失敗。エスケープを外す → 陰性テスト `logoXsvg` が失敗。
    6. `listPublicFiles` で存在確認を外す → 「存在しないディレクトリで空配列」の前提テストが `ENOENT` で失敗（`public/` が無い状態で AC-1 も同じく落ちる）。
  - 完了条件: 新しいテストがすべて通り、既存テストは変更なしで通る。`pnpm typecheck`・`pnpm lint`・`pnpm test` PASS、`bash scripts/verify.sh --quick` PASS、`public/` が無い状態で `pnpm build` PASS。コミットは `test:` と `chore:` を分けず 1 コミット（例: `chore(public): 雛形の未使用 SVG を削除し参照の検査を追加する` + `Refs #17`）。

- [x] **T2: 文書の更新・最終確認・Issue 本文の修正**
  - 対応 AC: なし（文書・検証。AC-1〜AC-3 の総合確認）
  - 先に書くテスト: なし（コードを変えない）
  - 実装対象: `docs/architecture.md` 5 節に 1 行（Q7。例:「静的ファイル（0017）: `public/` に置くファイルは、名前が `app/` `features/` `lib/` `components/` のコード・CSS、`next.config.ts`、`package.json` のどこかに現れること。現在 `public/` は空（Git 上は存在しない）。動的なパスや外部からの直接リンク用は理由つきで許可リストに載せる。`tests/foundation/public-assets-referenced.test.ts` が検査する」の趣旨）、本計画の進捗メモ
  - 確認:
    - `bash scripts/verify.sh`（full。build を含む）を実行し、PASS/FAIL を事実のまま進捗メモに記録する。
    - `reviewer` サブエージェントで差分を点検する（検査の検出力、走査範囲、空の `public/` の扱い、既存テスト無変更）。`security-reviewer` は省く想定（Q9）。
    - Issue #17 の本文を仕様 4.1 のとおり直す（`metadata` と `lang` は 0011 で実施済みと追記し、要望を SVG の整理だけにする）。`gh issue edit` は人間の承認を得てから行う。`gh` が使えないときは手順だけ報告する。
  - 完了条件: `verify.sh`（full）PASS、レビューの重大指摘の解消、Issue 本文の修正（または未実施の理由の報告）、計画の `Status` を更新。

### 提案（仕様外。人間の判断で採否を決める。本計画のタスクには含めない）

- P1: 逆向きの検査（コード中の `/xxx.svg` のような `public/` 宛ての参照が実在するファイルを指しているか）。存在しない画像へのリンクを防げるが、仕様の範囲外で、URL の判定に誤検知が出やすいため採らない想定。
- P2: `app/favicon.ico` 以外の `app/` 直下のメタデータ画像（`icon.png` 等）の整理。現在は `favicon.ico` だけで、仕様 4.2 で対象外のため採らない。

## 4. テスト方針

| 種類 | 対象 | ファイル | 環境 | モック |
| --- | --- | --- | --- | --- |
| 構成検査 | 列挙・判定の陽性・陰性、走査の前提、AC-1、AC-2 | `tests/foundation/public-assets-referenced.test.ts`（新規） | node | なし（実ファイルと一時ディレクトリを読む） |
| 既存（変更なし） | 全テスト（AC-3） | 既存すべて | 既存のまま | 既存のまま |
| ビルド | `pnpm build` が `public/` の無い状態で通る（AC-3） | — | — | — |
| E2E | なし（画面の見た目と挙動は変わらない） | — | — | — |

- テスト名は日本語で `AC-<番号>` を含める。`vitest` の API は明示 import する。
- 判定は実ファイルと同じ関数を断片に当てて陽性・陰性を固定し、実ファイルへの適用は違反の一覧が空であることを `toEqual([])` で検査する。
- 5 つのファイル名はテスト内にリテラルで持つ（`public/` から読み取った一覧を期待値に使わない）。
- 一時ディレクトリは各テストで作って後始末し、テスト間で共有しない。ネットワークは使わない。

### AC とタスクの対応表

| AC | 内容（要約） | テストファイル | タスク |
| --- | --- | --- | --- |
| AC-1 | `public/` の各ファイル名が参照元に現れる（許可リストを除く。現在は空） | `tests/foundation/public-assets-referenced.test.ts` | T1 |
| AC-2 | 5 つの SVG が存在しない | 同上 | T1 |
| AC-3 | 既存テストとビルドが期待値を変えずに通る | 既存すべて、`pnpm build` | T1、T2 |

## 5. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 全削除後に `public/` が空・無くなり、AC-1 が「0 個で通る」だけの検査になる | 列挙が壊れても気づけない | 列挙関数を一時ディレクトリで検査する前提テストと、判定の陽性・陰性テストを置く。T1 の変異 1・2・6 で検出することを確かめる |
| 参照元の走査が空振り・取りこぼし（`components/` が無い、拡張子の漏れ） | 参照があるのに失敗する、または検査が効かない | 存在しないディレクトリを空として扱う。前提テストで `app/layout.tsx` `app/globals.css` `next.config.ts` `package.json` を含むことを確かめる（変異 4） |
| テストファイル自身・`docs/`・`.next/` の文字列を参照と誤認する | 未使用ファイルを見逃す | 参照元を 4 ディレクトリと 2 ファイルに限定し、除外を前提テストで固定する（注意点 a・f） |
| 部分一致の誤判定（`profile.svg` が `file.svg` を満たす、`.` の任意文字化） | 未使用ファイルを見逃す | 直前の文字の境界判定と正規表現のエスケープ。陰性テストで固定（変異 5） |
| 文字列検索の限界（コメント中の出現も参照扱い、動的パス・外部リンクは検出不可） | 未使用ファイルを見逃す／正当なファイルが失敗する | 仕様 8 節で受け入れ済み。後者は許可リストで扱う。限界をテストファイルの冒頭コメントに書く |
| `public/` が無い状態で `next build` が失敗する | AC-3 を満たせない | T1 で `public/` を消した状態で実際にビルドして確かめる。失敗した場合は作業を止めて人間に相談する（`.gitkeep` で残す案は Q6 の別案） |
| Windows の `\` 区切りで比較が失敗する | 誤検知 | `toRelative` で `/` に正規化し、`path.posix.basename` を使う（注意点 d） |
| 別セッションの作業との衝突 | 意図しない変更の混入 | 変更は新規テスト 1 つと SVG 5 つの削除だけ。コミット前に `git status` で確認する |

## 6. ADR が必要な論点

- なし。依存パッケージの追加・技術選定は無い。不要ファイルの削除と、既存の構成検査テストと同じ方式（`tests/foundation/` の node 環境のテスト）の追加だけで、アーキテクチャ上の選択を伴わない。`public/` の運用ルールは `docs/architecture.md`（T2。Q7）とテストファイルに記録すれば足りる。

## 7. 要確認事項

- [x] Q1: テストファイル名。推奨: `tests/foundation/public-assets-referenced.test.ts`（何を検査するかが名前で分かる。AC-2 も同居）。別案: 仕様の slug に揃えて `tests/foundation/scaffold-cleanup.test.ts`（仕様との対応は分かるが、恒常的な検査の名前としては狭い）。
- [x] Q2: 照合に使う名前。推奨: 仕様 AC-1 の文言どおりベース名（拡張子つき）。入れ子（`public/img/logo.svg`）でも `logo.svg` で照合する。限界として、別のサブディレクトリの同名ファイルは片方の参照で両方が通る。別案: `public/` からの相対パス（`img/logo.svg`）で照合する（厳密だが仕様の文言より狭く、`/img/logo.svg` 以外の書き方を取りこぼすおそれ）。
- [x] Q3: 参照元から `app/` などの中のテストファイル（`*.test.*` `*.spec.*`）を除くか。推奨: 除く（テストからしか参照されないファイルはアプリが使っていない）。別案: 仕様の文言（拡張子だけを条件にしている）どおり含める。
- [x] Q4: 境界つきの一致。推奨: ベース名の直前の文字が `[A-Za-z0-9_.-]` でないことを条件にする（`profile.svg` で `file.svg` を満たさない）。直後の境界は見ない（`logo.svg?v=1` などを許すため）。別案: 単純な `includes`（仕様の「文字列として現れる」に最も忠実だが、部分一致で見逃す）。
- [x] Q5: 許可リストの置き場所と形。推奨: テストファイル内の `{ path, reason }[]` 定数（現在は空）。`reason` 必須を前提テストで検査する。別案: `tests/foundation/public-assets-allowlist.json` に分ける（テストを読まずに編集できるが、ファイルが増える）。
- [x] Q6: 全削除後の `public/` ディレクトリ。推奨: 残さない（`.gitkeep` を置かない。`/.gitkeep` が配信され、AC-1 の許可リストも必要になるため。`next build` が `public/` 無しで通ることは T1 で確かめる）。別案: `public/.gitkeep` を置き、理由つきで許可リストに載せる（雛形の構成を保てるが、仕様にない例外が最初から入る）。
- [x] Q7: `docs/architecture.md` の更新。推奨: 5 節に `public/` の運用ルールと検査テストの 1 行を足す（0018 と同じく、検査の存在を設計文書から辿れるようにする）。別案: 更新しない（現在 `public/` への言及が無く、食い違いは生じない）。
- [x] Q8: タスクの分け方（2 タスク）。推奨: T1（テスト＋削除を 1 コミット。RED は作業ツリー上で確認）→ T2（文書・full verify・レビュー・Issue 本文）。別案: T1 を「列挙・判定・前提のテスト（最初から緑）」、T2 を「AC-1・AC-2 のテスト＋削除＋文書」に分ける（0018 と同じ分け方。検出器の正しさと削除を別コミットにできるが、この大きさでは過剰）。
- [x] Q9: レビューの範囲。推奨: `reviewer` のみ（シークレット・認可・外部入力に関わる変更が無い）。別案: `security-reviewer` も通す。
- [x] Q10: 提案 P1・P2 は本計画では採らない、でよいか。

## 8. 進捗メモ

- 2026-10-09: 計画作成（draft）。未着手。人間の承認（特に Q2・Q3・Q6・Q8）を得てから T1 に入る。`/issue split` はせず 1 PR で進める想定（2 タスク）。

- 2026-10-09: 人間が計画を承認（Q1〜Q10 すべて推奨どおり）。Status: in-progress。T1 から着手。
- 2026-10-09: T1・T2 完了、レビュー済み。reviewer は Approve（Critical・Major なし）。`security-reviewer` は省いた（Q9。依存・入力・外部連携に触れない）。Issue #17 の本文は、仕様の承認時に人間の承認を得て `gh issue edit` で直した（範囲を SVG の整理だけにし、`metadata` と `lang` は 0011 で実施済みと追記）。reviewer の Minor・Nit に対応: ベース名照合の限界をテストの冒頭コメントと仕様 8 節に追記、前提テスト「public/ にファイルがある間は空でない」を空のサブディレクトリで誤って失敗しない形に直した（`collectFiles` で判定）、境界の文字クラス `[A-Za-z0-9_.-]` を固定する陰性ケース（`my-logo.svg`・`old.logo.svg`・`a_logo.svg`）を追加（`-`・`.`・`_` を外す 3 つの変異で検出）、不要な `sort` と `as Source[]` を除去。許可リストに古い項目が残っても検出できない点は、仕様外のため見送り（許可リストは現在空）。`bash scripts/verify.sh`（full）は PASS（`public/` が無い状態でビルドが通る）。